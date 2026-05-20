import { normalizeLandmarks } from './normalization';
import labelsMapping from '../../assets/model/fsl_model_labels.json';
import modelWeights from '../../assets/model/fsl_model_weights.json';

let initialized = false;

// Simple Matrix Multiplication and Activation for Inference
function relu(x) {
  return x.map(v => Math.max(0, v));
}

function softmax(x) {
  const maxVal = Math.max(...x);
  const exps = x.map(v => Math.exp(v - maxVal));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sumExps);
}

/**
 * Dense Layer Implementation: Performs Wx + b
 * @param {Array} input - Input vector
 * @param {Array} weights - 2D Weight matrix [input_size][output_size]
 * @param {Array} biases - Bias vector
 * @param {string} activation - 'relu' or 'softmax'
 */
function dense(input, weights, biases, activation = 'relu') {
  const output = new Array(biases.length).fill(0);
  for (let j = 0; j < biases.length; j++) {
    let sum = biases[j];
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * weights[i][j];
    }
    output[j] = sum;
  }
  return activation === 'relu' ? relu(output) : softmax(output);
}

/**
 * initInference: Prepares the inference engine by fixing label encodings.
 */
export async function initInference() {
  if (initialized) return;
  try {
    console.log('Inference engine initializing...');
    initialized = true;
  } catch (error) {
    console.error('Failed to initialize inference:', error);
  }
}

/**
 * predictSign: Main inference entry point.
 * Performs a forward pass through the 4-layer neural network using weights from JSON.
 * @param {Array} landmarks - Raw MediaPipe landmarks (21 points with x,y,z)
 */
export async function predictSign(landmarks) {
  if (!initialized || !landmarks || !modelWeights) return null;

  try {
    // 1. Normalize landmarks (centered at wrist, scaled by palm size)
    const normalized = normalizeLandmarks(landmarks);
    if (!normalized) return null;

    // --- FORWARD PASS ---
    // Layer 1: Input (63) -> Dense (256) -> ReLU
    const layer1 = dense(normalized, modelWeights.dense.weights, modelWeights.dense.biases, 'relu');
    
    // Layer 2: Dense (256) -> Dense (128) -> ReLU
    const layer2 = dense(layer1, modelWeights.dense_1.weights, modelWeights.dense_1.biases, 'relu');
    
    // Layer 3: Dense (128) -> Dense (64) -> ReLU
    const layer3 = dense(layer2, modelWeights.dense_2.weights, modelWeights.dense_2.biases, 'relu');

    // Layer 4: Dense (64) -> Output (classes) -> Softmax
    const probabilities = dense(layer3, modelWeights.dense_3.weights, modelWeights.dense_3.biases, 'softmax');

    // 2. Identify class with highest probability
    const maxProb = Math.max(...probabilities);
    const classIdx = probabilities.indexOf(maxProb);

    let finalLabel = labelsMapping[classIdx] || 'Unknown';
    // Fix character encoding for 'Ñ'
    if (finalLabel === 'Ã‘' || finalLabel.includes('Ã')) {
      finalLabel = 'Ñ';
    }

    return {
      label: finalLabel,
      confidence: maxProb
    };
  } catch (error) {
    console.error('Prediction error:', error);
    return null;
  }
}
