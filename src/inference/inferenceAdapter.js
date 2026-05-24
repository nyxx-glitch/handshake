import { normalizeLandmarks } from './normalization';
import labelsMapping from '../../assets/model/fsl_model_labels.json';
import modelWeights from '../../assets/model/fsl_model_weights.json';

let initialized = false;

// --- ACTIVATION FUNCTIONS ---
function relu(x) {
  return x.map(v => Math.max(0, v));
}

function sigmoid(x) {
  return x.map(v => 1 / (1 + Math.exp(-v)));
}

function tanh(x) {
  return x.map(v => Math.tanh(v));
}

function softmax(x) {
  const maxVal = Math.max(...x);
  const exps = x.map(v => Math.exp(v - maxVal));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sumExps);
}

// --- LAYER IMPLEMENTATIONS ---

/**
 * performs Wx + b
 */
function dense(input, weights, biases, activation = 'relu') {
  const outputSize = biases.length;
  const output = new Array(outputSize).fill(0);
  for (let j = 0; j < outputSize; j++) {
    let sum = biases[j];
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * weights[i][j];
    }
    output[j] = sum;
  }
  if (activation === 'relu') return relu(output);
  if (activation === 'softmax') return softmax(output);
  return output;
}

/**
 * gruStep: Performs a single GRU time-step calculation
 * Formula follows Keras default (reset_after=True)
 */
function gruStep(x, h_prev, kernel, recurrent_kernel, bias) {
  const units = h_prev.length;
  
  // Keras GRU bias is split into [input_bias, recurrent_bias]
  const b_i = bias[0];
  const b_h = bias[1];

  // Gates are ordered [z, r, h] (Update, Reset, New)
  const z_idx = 0;
  const r_idx = units;
  const h_idx = 2 * units;

  // 1. Update and Reset Gates
  const z = new Array(units);
  const r = new Array(units);

  for (let j = 0; j < units; j++) {
    let sum_z = b_i[z_idx + j] + b_h[z_idx + j];
    let sum_r = b_i[r_idx + j] + b_h[r_idx + j];
    
    for (let i = 0; i < x.length; i++) {
      sum_z += x[i] * kernel[i][z_idx + j];
      sum_r += x[i] * kernel[i][r_idx + j];
    }
    for (let i = 0; i < units; i++) {
      sum_z += h_prev[i] * recurrent_kernel[i][z_idx + j];
      sum_r += h_prev[i] * recurrent_kernel[i][r_idx + j];
    }
    z[j] = 1 / (1 + Math.exp(-sum_z)); // sigmoid
    r[j] = 1 / (1 + Math.exp(-sum_r)); // sigmoid
  }

  // 2. Candidate Hidden State (New)
  const h_hat = new Array(units);
  for (let j = 0; j < units; j++) {
    let sum_x = b_i[h_idx + j];
    for (let i = 0; i < x.length; i++) {
      sum_x += x[i] * kernel[i][h_idx + j];
    }
    
    let sum_h = b_h[h_idx + j];
    for (let i = 0; i < units; i++) {
      sum_h += h_prev[i] * recurrent_kernel[i][h_idx + j];
    }
    
    h_hat[j] = Math.tanh(sum_x + r[j] * sum_h);
  }

  // 3. Final Hidden State for this step
  const h_next = new Array(units);
  for (let j = 0; j < units; j++) {
    h_next[j] = z[j] * h_prev[j] + (1 - z[j]) * h_hat[j];
  }

  return h_next;
}

export async function initInference() {
  if (initialized) return;
  try {
    console.log('GRU Inference Engine Initialized');
    initialized = true;
  } catch (error) {
    console.error('Failed to initialize inference:', error);
  }
}

/**
 * predictSign: Performs sequential inference using GRU
 * @param {Array} sequence - Buffer of normalized landmarks [[x1,y1...], [x2,y2...]]
 */
export async function predictSign(sequence) {
  if (!initialized || !sequence || sequence.length === 0 || !modelWeights) return null;

  try {
    // Find the GRU layer weights (usually named 'gru' or 'gru_1')
    const gruLayerName = Object.keys(modelWeights).find(name => name.includes('gru'));
    const gru = gruLayerName ? modelWeights[gruLayerName] : null;
    
    if (!gru) {
      console.warn('GRU weights not found. Please run the training script to generate new weights.');
      return null;
    }
    
    // Initial hidden state (zeros)
    let h = new Array(gru.recurrent_kernel.length).fill(0);

    // --- GRU FORWARD PASS (Process entire sequence) ---
    for (const x of sequence) {
      h = gruStep(x, h, gru.kernel, gru.recurrent_kernel, gru.bias);
    }

    // --- DENSE LAYERS (Post-GRU) ---
    // Layer 2: Dense (32) -> ReLU
    const dense1Name = Object.keys(modelWeights).find(name => name.includes('dense') && !name.includes('dense_1'));
    const layer2 = dense(h, modelWeights[dense1Name].weights, modelWeights[dense1Name].biases, 'relu');
    
    // Layer 3: Output -> Softmax
    const dense2Name = Object.keys(modelWeights).find(name => name.includes('dense_1'));
    const probabilities = dense(layer2, modelWeights[dense2Name].weights, modelWeights[dense2Name].biases, 'softmax');

    const maxProb = Math.max(...probabilities);
    const classIdx = probabilities.indexOf(maxProb);

    let finalLabel = labelsMapping[classIdx] || 'Unknown';
    if (finalLabel === 'Ã‘' || finalLabel.includes('Ã')) finalLabel = 'Ñ';

    return {
      label: finalLabel,
      confidence: maxProb
    };
  } catch (error) {
    console.error('GRU Prediction error:', error);
    return null;
  }
}
