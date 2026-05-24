import os
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models

def train_model(data_dir='data', model_name='fsl_model', sequence_length=20):
    """
    Trains a GRU model on FSL landmarks grouped into sequences.
    sequence_length: Number of frames the model looks at to make a prediction.
    """
    sequences = []
    labels_list = []
    labels_mapping = []

    print(f"Searching for data in {data_dir}...")
    
    json_files = sorted([f for f in os.listdir(data_dir) if f.endswith('.json')])
    
    if not json_files:
        print("No JSON files found in data directory!")
        return

    for file in json_files:
        try:
            with open(os.path.join(data_dir, file), 'r', encoding='utf-8') as f:
                session_data = json.load(f)
                
                file_label = session_data[0]['label'] if isinstance(session_data, list) and len(session_data) > 0 else None
                if not file_label: continue

                if file_label not in labels_mapping:
                    labels_mapping.append(file_label)
                
                label_idx = labels_mapping.index(file_label)
                
                # Extract all valid landmarks from this session
                landmarks_session = [frame['landmarks'] for frame in session_data if 'landmarks' in frame and frame['landmarks']]
                
                # SLIDING WINDOW: Group landmarks into sequences of sequence_length
                # This is what allows the GRU to learn motion
                if len(landmarks_session) >= sequence_length:
                    for i in range(0, len(landmarks_session) - sequence_length + 1, 5): # Step of 5 for overlap/diversity
                        window = landmarks_session[i : i + sequence_length]
                        sequences.append(window)
                        labels_list.append(label_idx)
                        
        except Exception as e:
            print(f"Error loading {file}: {e}")

    X = np.array(sequences)
    y = np.array(labels_list)
    
    print(f"Loaded {len(X)} sequences across {len(labels_mapping)} labels.")

    # Shuffle data
    indices = np.arange(len(X))
    np.random.shuffle(indices)
    X, y = X[indices], y[indices]

    # --- 1. BUILD GRU MODEL ---
    # Input shape: (Time_Steps, Features) -> (20, 63)
    model = models.Sequential([
        layers.Input(shape=(sequence_length, 63)),
        layers.GRU(64, return_sequences=False), # Return only the last hidden state
        layers.Dropout(0.2),
        layers.Dense(32, activation='relu'),
        layers.Dense(len(labels_mapping), activation='softmax')
    ])

    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )

    # --- 2. TRAIN ---
    print(f"Training GRU model on {len(X)} sequences...")
    history = model.fit(X, y, epochs=80, batch_size=32, validation_split=0.2, shuffle=True)

    # --- 4. EXPORT WEIGHTS & LABELS ---
    model_dir = os.path.join('assets', 'model')
    if not os.path.exists(model_dir): os.makedirs(model_dir)

    # Save weights in a format our JS Inference Engine can understand
    weights_data = {}
    for layer in model.layers:
        weights = layer.get_weights()
        if not weights: continue
        
        if 'gru' in layer.name:
            # Keras GRU stores weights as: [Kernel, Recurrent_Kernel, Bias]
            # Kernel (Wx): [input_dim, 3 * hidden_units]
            # Recurrent_Kernel (Wh): [hidden_units, 3 * hidden_units]
            # Bias (b): [2, 3 * hidden_units] (input_bias and recurrent_bias)
            weights_data[layer.name] = {
                'kernel': weights[0].tolist(),
                'recurrent_kernel': weights[1].tolist(),
                'bias': weights[2].tolist()
            }
        else:
            weights_data[layer.name] = {
                'weights': weights[0].tolist(),
                'biases': weights[1].tolist()
            }

    with open(os.path.join(model_dir, f"{model_name}_weights.json"), 'w') as f:
        json.dump(weights_data, f)
    
    with open(os.path.join(model_dir, f"{model_name}_labels.json"), 'w') as f:
        json.dump(labels_mapping, f)

    # Save standard TFLite as backup
    try:
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        # Fix for GRU conversion error: "tf.TensorListReserve op requires element_shape to be static"
        converter.target_spec.supported_ops = [
            tf.lite.OpsSet.TFLITE_BUILTINS, 
            tf.lite.OpsSet.SELECT_TF_OPS
        ]
        converter._experimental_lower_tensor_list_ops = False
        
        tflite_model = converter.convert()
        with open(os.path.join(model_dir, f"{model_name}.tflite"), 'wb') as f:
            f.write(tflite_model)
        print("TFLite backup model generated successfully.")
    except Exception as e:
        print(f"Note: TFLite backup generation skipped (standard for GRU models): {e}")
        print("This does NOT affect the app, as it uses the JSON weights above.")

    print(f"Implementation complete. Weights exported to assets/model/")

if __name__ == "__main__":
    train_model()
