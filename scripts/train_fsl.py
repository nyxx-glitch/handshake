import os
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models

def train_model(data_dir='data', model_name='fsl_model'):
    X = []
    y = []
    labels = []

    print(f"Searching for data in {data_dir}...")
    
    # Get all JSON files and sort them to keep labels consistent
    json_files = sorted([f for f in os.listdir(data_dir) if f.endswith('.json')])
    
    if not json_files:
        print("No JSON files found in data directory!")
        return

    for file in json_files:
        try:
            with open(os.path.join(data_dir, file), 'r', encoding='utf-8') as f:
                session_data = json.load(f)
                
                file_label = session_data[0]['label'] if isinstance(session_data, list) and len(session_data) > 0 else None
                
                if not file_label:
                    continue

                if file_label not in labels:
                    labels.append(file_label)
                
                label_idx = labels.index(file_label)
                
                for frame in session_data:
                    if 'landmarks' in frame and frame['landmarks']:
                        X.append(frame['landmarks'])
                        y.append(label_idx)
        except Exception as e:
            print(f"Error loading {file}: {e}")

    X = np.array(X)
    y = np.array(y)
    
    print(f"Loaded {len(X)} frames across {len(labels)} labels: {labels}")

    # Shuffle the data before training to ensure the validation split sees all labels
    indices = np.arange(len(X))
    np.random.shuffle(indices)
    X = X[indices]
    y = y[indices]

    # 3. Build Model (Multi-Layer Perceptron)
    model = models.Sequential([
        layers.Input(shape=(63,)),
        layers.Dense(256, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(64, activation='relu'),
        layers.Dense(len(labels), activation='softmax')
    ])

    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )

    # 4. Train
    print(f"Training on {len(X)} samples for {len(labels)} classes...")
    # Increased epochs for better convergence on many classes
    model.fit(X, y, epochs=100, batch_size=32, validation_split=0.2, shuffle=True)

    # 5. Save as TFLite (for mobile)
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()

    # Ensure assets/model directory exists
    model_dir = os.path.join('assets', 'model')
    if not os.path.exists(model_dir):
        os.makedirs(model_dir)

    model_path = os.path.join(model_dir, f"{model_name}.tflite")
    labels_path = os.path.join(model_dir, f"{model_name}_labels.json")
    weights_path = os.path.join(model_dir, f"{model_name}_weights.json")

    with open(model_path, 'wb') as f:
        f.write(tflite_model)
    
    # Save labels mapping
    with open(labels_path, 'w') as f:
        json.dump(labels, f)

    # Save weights as JSON for easy JS inference without heavy dependencies
    weights_data = {}
    for layer in model.layers:
        if hasattr(layer, 'get_weights') and len(layer.get_weights()) > 0:
            w, b = layer.get_weights()
            weights_data[layer.name] = {
                'weights': w.tolist(),
                'biases': b.tolist()
            }
    
    with open(weights_path, 'w') as f:
        json.dump(weights_data, f)

    print(f"Successfully exported {model_path} and {weights_path}")

if __name__ == "__main__":
    # Ensure data directory exists
    if not os.path.exists('data'):
        os.makedirs('data')
        print("Created 'data' directory. Please put your JSON files there.")
    else:
        train_model()

