import * as tf from '@tensorflow/tfjs';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

let detector = null;
let ready = false;

export async function initMediaPipeProvider() {
  if (ready) return;

  try {
    await tf.ready();
    console.log('TFJS Ready');

    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    const detectorConfig = {
      runtime: 'tfjs',
      modelType: 'lite',
      maxHands: 1,
    };

    detector = await handPoseDetection.createDetector(model, detectorConfig);
    ready = true;
    console.log('MediaPipe Hand Detector Ready');
  } catch (error) {
    console.error('Failed to initialize MediaPipe:', error);
    throw error;
  }
}

export async function predictWithMediaPipe(imageElement) {
  if (!ready || !detector) {
    return { label: 'Idle', confidence: 0, landmarks: null };
  }

  try {
    if (!imageElement) {
      return { label: 'Idle', confidence: 0, landmarks: null };
    }

    const hands = await detector.estimateHands(imageElement, { flipHorizontal: false });

    if (hands && hands.length > 0) {
      const hand = hands[0];
      const landmarks = hand.keypoints3D.map(kp => ({
        x: kp.x,
        y: kp.y,
        z: kp.z || 0
      }));

      return {
        label: 'Detected',
        confidence: hand.score || 0.9,
        landmarks: landmarks
      };
    }

    return { label: 'Idle', confidence: 0, landmarks: null };
  } catch (error) {
    console.error('Prediction error:', error);
    return { label: 'Idle', confidence: 0, landmarks: null };
  }
}

export async function disposeMediaPipeProvider() {
  if (detector) {
    detector.dispose();
    detector = null;
  }
  ready = false;
}
