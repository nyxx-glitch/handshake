/**
 * Normalizes 21 MediaPipe hand landmarks for consistent model training.
 * 
 * @param {Array} landmarks - Array of 21 points {x, y, z}
 * @returns {Array} - Flattened 63-value normalized array
 */
export function normalizeLandmarks(landmarks) {
  if (!landmarks || landmarks.length !== 21) return null;

  // 1. Translation: Use the wrist (index 0) as the origin
  const wrist = landmarks[0];
  const translated = landmarks.map(p => ({
    x: p.x - wrist.x,
    y: p.y - wrist.y,
    z: p.z - wrist.z
  }));

  // 2. Scaling: Calculate the distance from wrist (0) to middle finger base (9)
  const mcp = translated[9];
  const scale = Math.sqrt(mcp.x ** 2 + mcp.y ** 2 + mcp.z ** 2) || 1;

  // 3. Flatten and Scale
  const flattened = [];
  translated.forEach(p => {
    flattened.push(p.x / scale);
    flattened.push(p.y / scale);
    flattened.push(p.z / scale);
  });

  return flattened;
}
