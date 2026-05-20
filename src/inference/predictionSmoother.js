export function createPredictionSmoother(options = {}) {
    const windowSize = options.windowSize ?? 7;
    const minConfidence = options.minConfidence ?? 0.55;
    const idleLabel = options.idleLabel ?? 'Idle';
  
    const history = [];
  
    function reset() {
      history.length = 0;
    }
  
    function pushPrediction(prediction) {
      // prediction shape:
      // { label: string, confidence: number }
      if (!prediction || typeof prediction.label !== 'string') {
        return { label: idleLabel, confidence: 0, stable: false };
      }
  
      const safeConfidence =
        typeof prediction.confidence === 'number' ? prediction.confidence : 0;
  
      history.push({
        label: prediction.label,
        confidence: Math.max(0, Math.min(1, safeConfidence)),
      });
  
      if (history.length > windowSize) {
        history.shift();
      }
  
      // If latest frame is low confidence, prefer Idle immediately.
      const latest = history[history.length - 1];
      if (latest.confidence < minConfidence) {
        return { label: idleLabel, confidence: latest.confidence, stable: false };
      }
  
      // Majority vote across window.
      const counts = new Map();
      const confidenceSums = new Map();
  
      for (const item of history) {
        counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
        confidenceSums.set(
          item.label,
          (confidenceSums.get(item.label) ?? 0) + item.confidence
        );
      }
  
      let bestLabel = idleLabel;
      let bestCount = 0;
      let bestAvgConfidence = 0;
  
      for (const [label, count] of counts.entries()) {
        const avg = (confidenceSums.get(label) ?? 0) / count;
  
        // Primary sort: frequency
        // Secondary sort: average confidence
        if (count > bestCount || (count === bestCount && avg > bestAvgConfidence)) {
          bestLabel = label;
          bestCount = count;
          bestAvgConfidence = avg;
        }
      }
  
      const stable = bestCount >= Math.ceil(history.length / 2);
  
      return {
        label: stable ? bestLabel : idleLabel,
        confidence: stable ? bestAvgConfidence : latest.confidence,
        stable,
      };
    }
  
    return {
      pushPrediction,
      reset,
      getHistory: () => [...history],
    };
  }