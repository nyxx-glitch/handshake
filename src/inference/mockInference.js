import { SIGN_LABELS } from '../../constants/labels';

export function predictMock() {
  const randomLabel = SIGN_LABELS[Math.floor(Math.random() * SIGN_LABELS.length)];
  const confidence = 0.5 + Math.random() * 0.5;

  // Generate 21 dummy landmarks {x, y, z}
  const landmarks = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + Math.sin(i) * 0.1,
    y: 0.5 + Math.cos(i) * 0.1,
    z: Math.sin(i * 2) * 0.05,
  }));

  return {
    label: randomLabel,
    confidence,
    landmarks,
  };
}
