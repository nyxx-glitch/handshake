import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, ScrollView, Alert, TextInput } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import HandTracker from '../src/inference/HandTrackerWebView';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { SIGN_LABELS } from '../constants/labels';
import { createPredictionSmoother } from '../src/inference/predictionSmoother';
import { normalizeLandmarks } from '../src/inference/normalization';
import { initInference, predictSign } from '../src/inference/inferenceAdapter';

const CameraScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  
  // --- CORE DETECTION STATE ---
  // detected: Holds the current smoothed prediction (label, confidence, stability)
  const [detected, setDetected] = useState({ label: 'Idle', confidence: 0, stable: false });
  
  // --- DATA COLLECTION (TRAINING MODE) ---
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('A');
  const [sessionData, setSessionData] = useState([]);
  const [showTrainingControls, setShowTrainingControls] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('user'); // 'user' (front) or 'environment' (back)

  // --- WORD BUILDER LOGIC ---
  // signTranslation: The word/sentence automatically built via handsigns (overlay)
  const [signTranslation, setSignTranslation] = useState(''); 
  // constructedWord: The text typed manually or selected from phrases (input box)
  const [constructedWord, setConstructedWord] = useState(''); 
  
  // Timers and tracking for gesture stability
  const [holdTimer, setHoldTimer] = useState(0);
  const [lastLabel, setLastLabel] = useState('Idle');
  const [lastAddedLabel, setLastAddedLabel] = useState(null);
  const [lastAddedTime, setLastAddedTime] = useState(0);
  
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

  /**
   * exportData: Sends recorded landmark data to the local server or clipboard
   * Used during the data collection phase for training the AI.
   */
  const exportData = async () => {
    // ... (rest of the function)
  };

  /**
   * handleHandDetected: Primary bridge between the MediaPipe WebView and the App.
   * Processes raw landmarks, performs inference, and manages the Word Builder.
   */
  const handleHandDetected = useCallback(async (landmarks) => {
    if (landmarks && landmarks.length === 21) {
      // Normalize landmarks to ensure scale/position invariance
      const normalized = normalizeLandmarks(landmarks);

      // Record data if in training mode
      if (isRecording) {
        setSessionData(prev => [...prev, {
          label: selectedLabel,
          landmarks: normalized,
          timestamp: Date.now()
        }]);
      }

      // 1. Run inference using the manual 4-layer NN in inferenceAdapter.js
      const prediction = await predictSign(landmarks);
      
      const raw = {
        label: prediction ? prediction.label : 'Idle',
        confidence: prediction ? prediction.confidence : 0,
        landmarks: normalized
      };
      
      // 2. Smooth the prediction to prevent rapid label jumping
      const smoothed = smoother.pushPrediction(raw);
      setDetected(smoothed);

      // Update detection time for the 5-second auto-clear logic
      if (smoothed.label !== 'Idle') {
        setLastDetectionTime(Date.now());
      }

      // --- WORD BUILDER MECHANIC ---
      const currentLabel = smoothed.label;
      if (currentLabel !== 'Idle' && smoothed.stable) {
        // COOLDOWN LOGIC: Prevent spamming dynamic signs (J, Z, Ñ)
        const isDynamicSign = ['J', 'Z', 'Ñ'].includes(currentLabel);
        if (isDynamicSign && currentLabel === lastAddedLabel) {
          const now = Date.now();
          const cooldownTime = ['Z', 'Ñ'].includes(currentLabel) ? 2000 : 1000;
          if (now - lastAddedTime < cooldownTime) {
            setHoldTimer(0);
            return;
          }
        }

        // STABILITY TIMER: Require holding a sign for ~0.8s before adding it
        if (currentLabel === lastLabel) {
          setHoldTimer(prev => {
            const nextValue = prev + 1;
            const threshold = isDynamicSign ? 2 : 12; // Dynamic signs are instant (2 frames)

            if (nextValue >= threshold) {
              console.log('Building word with:', currentLabel);
              setSignTranslation(prev => {
                const newText = prev + currentLabel;
                // Maximum 24 characters limit in Word Builder
                if (newText.length > 24) {
                  return prev; 
                }
                return newText;
              });
              
              setLastAddedLabel(currentLabel);
              setLastAddedTime(Date.now());
              setLastLabel('Idle'); // Prevent double addition
              return 0;
            }
            return nextValue;
          });
        } else {
          setLastLabel(currentLabel);
          setHoldTimer(0);
        }
      } else {
        setHoldTimer(0);
      }
    }
  }, [isRecording, selectedLabel, smoother, lastLabel, lastAddedLabel, lastAddedTime]);

  const handleHandLost = useCallback(() => {
    const raw = { label: 'Idle', confidence: 0, landmarks: null };
    const smoothed = smoother.pushPrediction(raw);
    setDetected(smoothed);
    setHoldTimer(0);
    setLastLabel('Idle');
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
            style={styles.textInput}
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
              onPress={() => setIsRecording(!isRecording)}
            >
              <Text style={styles.recordButtonText}>
                {isRecording ? `Recording ${selectedLabel}... (${sessionData.length})` : 'Start Training Collection'}
              </Text>
            </TouchableOpacity>

            {sessionData.length > 0 && !isRecording && (
              <View style={styles.sessionActions}>
                <TouchableOpacity style={styles.exportButton} onPress={exportData}>
                  <Text style={styles.exportButtonText}>Export JSON ({sessionData.length} frames)</Text>
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