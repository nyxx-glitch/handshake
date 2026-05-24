import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, ScrollView, Alert, TextInput } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import HandTracker from '../src/inference/HandTrackerWebView';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { SIGN_LABELS, WORD_LABELS, CONTEXT_RULES } from '../constants/labels';
import { createPredictionSmoother } from '../src/inference/predictionSmoother';
import { normalizeLandmarks } from '../src/inference/normalization';
import { initInference, predictSign } from '../src/inference/inferenceAdapter';

const SEQUENCE_LENGTH = 10; // Reduced from 20 to 10 for much faster real-time feel (0.3s lag)

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  
  // --- CORE DETECTION STATE ---
  // detected: Holds the current smoothed prediction (label, confidence, stability)
  const [detected, setDetected] = useState({ label: 'Idle', confidence: 0, stable: false });
  
  // landmarkBuffer: Stores the last SEQUENCE_LENGTH frames of normalized landmarks
  const landmarkBuffer = useRef([]);
  const isInferring = useRef(false); // Lock to prevent inference from blocking recording

  // --- DATA COLLECTION (TRAINING MODE) ---
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false); // Atomic check for the message handler
  const [selectedLabel, setSelectedLabel] = useState('A');
  const selectedLabelRef = useRef('A'); // Atomic check for the message handler
  const recordingDataRef = useRef([]); // High-performance storage for landmark frames
  const [recordingCount, setRecordingCount] = useState(0); // For UI counter display
  const [showTrainingControls, setShowTrainingControls] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user'); // 'user' (front) or 'environment' (back)

  // Sync refs with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    selectedLabelRef.current = selectedLabel;
  }, [selectedLabel]);

  // Decouple UI Counter from high-frequency recording loop
  // This ensures the UI increments smoothly without blocking the bridge
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingCount(recordingDataRef.current.length);
      }, 50); // Update UI every 50ms (20fps UI)
    } else {
      setRecordingCount(recordingDataRef.current.length);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // --- WORD BUILDER LOGIC ---
  // signTranslation: The word/sentence automatically built via handsigns (overlay)
  const [signTranslation, setSignTranslation] = useState(''); 
  // constructedWord: The text typed manually or selected from phrases (input box)
  const [constructedWord, setConstructedWord] = useState(''); 
  
  // --- ATOMIC LOGIC REFS (Prevents race conditions & batching) ---
  const lastAcceptedGesture = useRef('Idle');
  const lastAcceptedTime = useRef(0);
  const consecutiveFrames = useRef(0);
  const currentTrackingLabel = useRef('Idle');
  
  // Tracks the last time any valid sign was detected for the 5s auto-clear feature
  const [lastDetectionTime, setLastDetectionTime] = useState(Date.now());
  const [showPhrases, setShowPhrases] = useState(false);
  const autoClearTimerRef = useRef(null);

  // Suggested phrases for the manual input box
  const SUGGESTED_PHRASES = [
    "Ano ang pangalan mo?",
    "Ilang taon ka na?",
    "Kailan ang birthday mo?",
    "Anong buwan ka ipinanganak?",
    "Anong araw ang birthday mo?",
    "Sino ang kaibigan mo?",
    "Ilang miyembro ang pamilya mo?",
    "Ilang kaibigan ang meron ka?"
  ];

  // smoother: Reduces flicker in predictions by looking at a window of recent frames
  const smoother = useMemo(() => createPredictionSmoother({
    windowSize: 7,
    minConfidence: 0.55,
    idleLabel: 'Idle',
  }), []);

  const exportData = async () => {
    const dataToExport = recordingDataRef.current;
    console.log('Exporting data...', dataToExport.length, 'frames');
    
    if (dataToExport.length === 0) {
      Alert.alert('No Data', 'No data recorded yet!');
      return;
    }

    const jsonString = JSON.stringify(dataToExport);

    // Try to send to local server first
    try {
      const debuggerHost = Constants.expoConfig?.debuggerHost || Constants.manifest2?.extra?.expoGo?.debuggerHost || Constants.manifest?.debuggerHost;
      const host = debuggerHost ? debuggerHost.split(':')[0] : null;
      
      if (host) {
        const serverUrl = `http://${host}:3000/save-data`;
        console.log('Attempting to save to server:', serverUrl);

        const response = await fetch(serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: selectedLabel,
            data: dataToExport,
          }),
        }).catch(err => {
          console.log('Fetch error (server likely offline):', err.message);
          return null;
        });

        if (response && response.ok) {
          const result = await response.json();
          Alert.alert(
            'Saved Automatically!',
            `Data saved to data/${result.filename} on your computer.`,
            [{ text: 'Great!' }]
          );
          return;
        }
      } else {
        console.log('Could not determine host IP for auto-save');
      }
    } catch (error) {
      console.log('Local server auto-save failed:', error.message);
    }

    
    try {
      console.log('Falling back to clipboard export...');
      await Clipboard.setStringAsync(jsonString);
      Alert.alert(
        'Copied to Clipboard',
        `${dataToExport.length} frames copied.\n\nServer was unreachable, so please paste this into a .json file in your data/ folder manually.`,
        [{ text: 'Got it!' }]
      );
    } catch (error) {
      console.error('Clipboard error:', error);
      Alert.alert('Error', 'Failed to export data to server or clipboard.');
    }
  };

  const clearSession = () => {
    recordingDataRef.current = [];
    setRecordingCount(0);
    Alert.alert('Cleared', 'Session data cleared.');
  };

  /**
   * handleHandDetected: Primary bridge between the MediaPipe WebView and the App.
   * Processes raw landmarks, performs inference, and manages the Word Builder.
   */
  const handleHandDetected = useCallback(async (landmarks) => {
    if (landmarks && landmarks.length === 21) {
      const normalized = normalizeLandmarks(landmarks);
      const now = Date.now();

      // --- 1. RESET IDLE TIMER IMMEDIATELY ---
      // This prevents the word from clearing while the system is "thinking"
      setLastDetectionTime(now);

      // --- 2. PRIORITY: RECORDING (Synchronous Atomic Storage) ---
      // This MUST be the first operation to ensure research-level precision
      if (isRecordingRef.current) {
        recordingDataRef.current.push({
          label: selectedLabelRef.current,
          landmarks: normalized,
          timestamp: now
        });
        return; // EXIT EARLY: Disable AI brain while recording for 100% precision
      }

      // --- 2. SECONDARY: INFERENCE (Only runs when NOT recording) ---
      // Maintain the sliding window buffer for GRU
      landmarkBuffer.current.push(normalized);
      if (landmarkBuffer.current.length > SEQUENCE_LENGTH) {
        landmarkBuffer.current.shift();
      }

      // Only run if we aren't already calculating and have a full buffer
      if (!isInferring.current && landmarkBuffer.current.length === SEQUENCE_LENGTH) {
        isInferring.current = true;
        
        try {
          const prediction = await predictSign(landmarkBuffer.current);
          
          const raw = {
            label: prediction ? prediction.label : 'Idle',
            confidence: prediction ? prediction.confidence : 0,
            landmarks: normalized
          };
          
          // Smooth the prediction to prevent rapid label jumping
          const smoothed = smoother.pushPrediction(raw);
          setDetected(smoothed);

          // --- WORD BUILDER MECHANIC (Instant Real-Time Logic) ---
          const currentLabel = smoothed.label;
          if (currentLabel !== 'Idle' && smoothed.stable) {
            const isSameAsLast = currentLabel === lastAcceptedGesture.current;
            const nowTime = Date.now();
            const cooldownActive = isSameAsLast && (nowTime - lastAcceptedTime.current < 2000);

            if (!cooldownActive) {
              if (currentLabel === currentTrackingLabel.current) {
                consecutiveFrames.current += 1;
                
                const threshold = isSameAsLast ? 3 : 1; 
                
                if (consecutiveFrames.current >= threshold) {
                  setSignTranslation(prev => {
                    let finalLabel = currentLabel;
                    const isWord = WORD_LABELS.includes(currentLabel);
                    let newText = prev;
                    
                    if (!isWord && CONTEXT_RULES.AMBIGUOUS_MAP[currentLabel]) {
                      const trimmedPrev = newText.trim();
                      const words = trimmedPrev.split(' ');
                      const lastWord = words[words.length - 1];
                      
                      const isNumberContext = CONTEXT_RULES.NUMBER_TRIGGERS.includes(lastWord) || 
                                             /^\d+$/.test(lastWord);

                      if (isNumberContext) {
                        finalLabel = CONTEXT_RULES.AMBIGUOUS_MAP[currentLabel];
                      }
                    }

                    if (isWord) {
                      if (newText.length > 0 && !newText.endsWith(' ')) {
                        newText += ' ';
                      }
                      newText += finalLabel + ' ';
                    } else {
                      newText += finalLabel;
                    }
                    
                    newText = newText.replace(/\s+/g, ' ');
                    
                    return newText.length > 24 ? prev : newText;
                  });
                  
                  lastAcceptedGesture.current = currentLabel;
                  lastAcceptedTime.current = nowTime;
                  consecutiveFrames.current = 0;
                  currentTrackingLabel.current = 'Idle';
                  
                  setLastDetectionTime(nowTime);
                }
              } else {
                currentTrackingLabel.current = currentLabel;
                consecutiveFrames.current = 1; 
              }
            }
          } else {
            consecutiveFrames.current = 0;
            currentTrackingLabel.current = 'Idle';
          }
        } catch (err) {
          console.error('Inference error:', err);
        } finally {
          isInferring.current = false;
        }
      }
    }
  }, [isRecording, selectedLabel, smoother]);

  const handleHandLost = useCallback(() => {
    const raw = { label: 'Idle', confidence: 0, landmarks: null };
    const smoothed = smoother.pushPrediction(raw);
    setDetected(smoothed);
    
    // Atomic reset on hand loss
    consecutiveFrames.current = 0;
    currentTrackingLabel.current = 'Idle';
    
    landmarkBuffer.current = []; // Clear buffer when hand is lost
  }, [smoother]);

  const handleTrackerReady = useCallback(() => {
    console.log('Hand Tracker Ready');
  }, []);

  const handleTrackerError = useCallback((error) => {
    console.error('Hand Tracker Error:', error);
  }, []);

  useEffect(() => {
    initInference();
  }, []);

  // Auto-clear logic: atfer 5 seconds of no signs
  useEffect(() => {
    if (signTranslation === '') return;

    const checkAutoClear = setInterval(() => {
      const idleTime = Date.now() - lastDetectionTime;
      if (idleTime > 5000) {
        setSignTranslation('');
      }
    }, 1000);

    return () => clearInterval(checkAutoClear);
  }, [lastDetectionTime, signTranslation]);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!Constants.expoConfig || !permission?.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          {!permission?.granted ? 'Camera permission required...' : 'Loading...'}
        </Text>
        {!permission?.granted && (
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HandTracker
        facing={cameraFacing}
        onHandDetected={handleHandDetected}
        onHandLost={handleHandLost}
        onReady={handleTrackerReady}
        onError={handleTrackerError}
      />

      <View style={styles.headerBar}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            onLongPress={() => {
              setShowTrainingControls(!showTrainingControls);
              Alert.alert(
                !showTrainingControls ? 'Training Mode Enabled' : 'Training Mode Disabled',
                !showTrainingControls ? 'You can now collect data for new signs.' : 'Training controls are now hidden.'
              );
            }}
          >
            <Image source={require('../assets/images/handshake1.png')} style={styles.headerLogo} resizeMode="contain" />
          </TouchableOpacity>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>HandShake</Text>
            <Text style={styles.headerSubtitle}>Filipino Sign Language Detector</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={styles.referenceButton} 
            onPress={() => setCameraFacing(prev => prev === 'user' ? 'environment' : 'user')}
            activeOpacity={0.7}
          >
            <Image source={require('../assets/images/swap.png')} style={styles.referenceIcon} resizeMode="contain" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.referenceButton} 
            onPress={() => router.push('/reference')}
            activeOpacity={0.7}
          >
            <Image source={require('../assets/images/reference.png')} style={styles.referenceIcon} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.handGuide}>
        <View style={styles.handGuideInner}>
          <Text style={styles.handGuideText}>Position your hand within the frame</Text>
        </View>
      </View>

      {/* Word Builder */}
      {signTranslation.length > 0 && (
        <View style={styles.subtitleContainer}>
          <View style={styles.subtitleBg}>
            <Text style={styles.subtitleText}>{signTranslation}</Text>
          </View>
        </View>
      )}

      <View style={styles.resultPanel}>
        {/* Input Box Section */}
        <View style={styles.inputContainer}>
          <View style={styles.wordHeader}>
            <Text style={styles.wordTitle}>Text Input</Text>
            <View style={styles.wordActionRow}>
              <TouchableOpacity 
                style={styles.wordBtn} 
                onPress={() => setShowPhrases(!showPhrases)}
              >
                <Text style={styles.wordBtnText}>{showPhrases ? 'Close' : 'Phrases'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.wordBtn, styles.clearBtn]} 
                onPress={() => setConstructedWord('')}
              >
                <Text style={styles.wordBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showPhrases && (
            <View style={styles.dropdownContainer}>
              <ScrollView 
                style={styles.dropdownList}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {SUGGESTED_PHRASES.map((phrase, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={styles.dropdownItem}
                    onPress={() => {
                      setConstructedWord(phrase);
                      setShowPhrases(false);
                    }}
                  >
                    <Text style={styles.dropdownItemText}>{phrase}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <TextInput
            style={[
              styles.textInput,
              { fontSize: constructedWord.length > 25 ? 16 : constructedWord.length > 15 ? 20 : 24 }
            ]}
            value={constructedWord}
            onChangeText={(text) => {
              setConstructedWord(text);
            }}
            placeholder="Type here.."
            placeholderTextColor="rgba(255,255,255,0.3)"
            multiline={false}
          />
        </View>

        <Text style={[styles.resultText, detected.stable && styles.resultTextStable]}>
          {detected.label}
        </Text>

        {/* Training Mode Overlay (Hidden by default) */}
        {showTrainingControls && (
          <View style={styles.trainingControls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.labelSelector}>
              {SIGN_LABELS.map(label => (
                <TouchableOpacity 
                  key={label} 
                  style={[styles.labelChip, selectedLabel === label && styles.labelChipSelected]}
                  onPress={() => setSelectedLabel(label)}
                >
                  <Text style={styles.labelChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <TouchableOpacity 
              style={[styles.recordButton, isRecording && styles.recordButtonActive]}
              onPress={() => {
                if (!isRecording) {
                }
                setIsRecording(prev => !prev);
              }}
            >
              <Text style={styles.recordButtonText}>
                {isRecording ? `Recording ${selectedLabel}... (${recordingCount})` : 'Start Training Collection'}
              </Text>
            </TouchableOpacity>

            {recordingCount > 0 && !isRecording && (
              <View style={styles.sessionActions}>
                <TouchableOpacity style={styles.exportButton} onPress={exportData}>
                  <Text style={styles.exportButtonText}>Export JSON ({recordingCount} frames)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.clearButton} onPress={clearSession}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: detected.label !== 'Idle' ? '#4ade80' : '#ef4444' }]} />
          <Text style={styles.statusText}>
            {detected.label !== 'Idle' ? 'Tracking' : 'Waiting for hand...'}
          </Text>
        </View>

        <View style={styles.confidenceContainer}>
          <View style={styles.confidenceBarBg}>
            <View style={[styles.confidenceBarFill, { width: `${detected.confidence * 100}%` }]} />
          </View>
          <Text style={styles.confidenceText}>{Math.round(detected.confidence * 100)}%</Text>
        </View> 

        <Text style={styles.providerText}>
          Powered by HandShake
        </Text> 
      </View>
    </View>
  );
};

export default CameraScreen

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(75, 42, 31, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
    marginRight: 12,
    transform: [{ rotate: '90deg' }],
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#f2e8e2',
    fontSize: 11,
    marginTop: 2,
  },
  referenceButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(106, 65, 49, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  referenceIcon: {
    width: 26,
    height: 26,
  },
  handGuide: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 20,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  handGuideInner: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  handGuideText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  message: {
    textAlign: 'center',
    color: '#222',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#491f07',
    borderRadius: 25,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 240,
    backgroundColor: 'rgba(75, 42, 31, 0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 36,
    alignItems: 'center',
  },
  trainingControls: {
    width: '100%',
    marginBottom: 16,
    alignItems: 'center',
  },
  labelSelector: {
    width: '100%',
    marginBottom: 12,
  },
  labelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  labelChipSelected: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  labelChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  recordButton: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  recordButtonActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  sessionActions: {
    flexDirection: 'row',
    marginTop: 10,
    width: '100%',
    gap: 8,
  },
  exportButton: {
    flex: 3,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#4ade80',
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#f2e8e2',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resultTextStable: {
    color: '#4ade80',
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
    maxWidth: 280,
  },
  confidenceBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    backgroundColor: '#4ade80',
    borderRadius: 3,
  },
  confidenceText: {
    color: '#f2e8e2',
    fontSize: 12,
    marginLeft: 12,
    minWidth: 40,
    textAlign: 'right',
  },
  providerText: {
    marginTop: 12,
    color: 'rgba(242, 232, 226, 0.6)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  inputContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  textInput: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    minHeight: 40,
    paddingVertical: 4,
  },
  subtitleContainer: {
    position: 'absolute',
    top: '57%', 
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  subtitleBg: {
    backgroundColor: 'rgba(54, 52, 52, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    maxWidth: '65%',
  },
  subtitleText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  resultText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
    marginBottom: 8,
  },
  resultTextStable: {
    color: '#4ade80',
  },
  dropdownContainer: {
    width: '100%',
    maxHeight: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  dropdownList: {
    width: '100%',
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wordTitle: {
    color: '#D2B48C',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  wordActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  wordBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  clearBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  wordBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});