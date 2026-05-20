import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { WebView } from 'react-native-webview';

const MEDIA_PIPE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      width: 100vw; 
      height: 100vh; 
      overflow: hidden;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    #videoContainer {
      position: relative;
      width: 100%;
      height: 100%;
    }
    #video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    #status {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 14px;
      font-family: sans-serif;
      z-index: 10;
    }
  </style>
</head>
<body>
  <div id="videoContainer">
    <video id="video" autoplay playsinline></video>
    <canvas id="canvas"></canvas>
    <div id="status">Initializing...</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675460240/drawing_utils.min.js" crossorigin="anonymous"></script>

  <script>
    const videoElement = document.getElementById('video');
    const videoContainer = document.getElementById('videoContainer');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const statusElement = document.getElementById('status');

    let hands = null;
    let camera = null;
    let lastLandmarks = null;
    let isReady = false;

    let cameraStream = null;
    let currentFacingMode = 'user';

    function sendMessage(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
      }
    }

    // Proxy console logs to React Native for debugging
    const oldLog = console.log;
    console.log = function(...args) {
      sendMessage('log', { message: args.join(' ') });
      oldLog.apply(console, args);
    };

    let isProcessing = false;
    let stopProcessingRequested = false;

    async function startProcessing() {
      if (isProcessing) return;
      isProcessing = true;
      stopProcessingRequested = false;
      
      const processFrame = async () => {
        if (stopProcessingRequested) {
          isProcessing = false;
          console.log('Processing loop stopped');
          return;
        }

        if (hands && videoElement.readyState >= 2) {
          try {
            await hands.send({ image: videoElement });
          } catch (e) {
            console.log('Frame processing error: ' + e.message);
            if (!stopProcessingRequested) {
              setTimeout(processFrame, 500);
            } else {
              isProcessing = false;
            }
            return;
          }
        }
        
        if (isReady) {
          requestAnimationFrame(processFrame);
        } else {
          setTimeout(processFrame, 100);
        }
      };
      processFrame();
    }

    async function startCamera(facingMode = 'user', retryCount = 0) {
      console.log('Attempting to start camera: ' + facingMode + ' (Attempt ' + (retryCount + 1) + ')');
      try {
        currentFacingMode = facingMode;
        
        // Apply mirroring only for the front camera (user)
        if (facingMode === 'user') {
          videoContainer.style.transform = 'scaleX(-1)';
        } else {
          videoContainer.style.transform = 'scaleX(1)';
        }

        // 1. Signal the processing loop to stop
        stopProcessingRequested = true;

        // 2. Stop all tracks in the current stream
        if (cameraStream) {
          console.log('Stopping tracks for sensor swap');
          cameraStream.getTracks().forEach(track => {
            track.stop();
          });
          cameraStream = null;
        }
        
        // 3. Clear the video source immediately
        videoElement.pause();
        videoElement.srcObject = null;

        // 4. Wait a minimal bit for hardware to breathe (300ms is usually enough if tracks are stopped)
        await new Promise(r => setTimeout(r, 300));

        const constraints = {
          video: { 
            facingMode: { ideal: facingMode },
            width: { ideal: 640 }, 
            height: { ideal: 480 } 
          }
        };

        console.log('Requesting stream: ' + facingMode);
        
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (firstErr) {
          // Fallback to simpler constraints
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode } 
          });
        }
        
        cameraStream = stream;
        videoElement.srcObject = stream;
        
        videoElement.onloadedmetadata = () => {
          videoElement.play();
          // Reset processing signal and start loop
          stopProcessingRequested = false;
          startProcessing();
        };
      } catch (err) {
        console.error('Camera Error: ' + err.message);
        
        // Only retry if it's a transient hardware error
        if (retryCount < 2 && (err.name === 'NotReadableError' || err.message.includes('source'))) {
          console.log('Transient error, retrying...');
          await new Promise(r => setTimeout(r, 1000));
          return startCamera(facingMode, retryCount + 1);
        }
        
        statusElement.textContent = 'Camera Error: ' + err.message;
        throw err;
      }
    }

    // Global function for React Native to call
    let isSwitching = false;
    window.switchCamera = async function(facing) {
      console.log('Global switchCamera called with: ' + facing);
      if (isSwitching) {
        console.log('Camera switch already in progress, ignoring request');
        return;
      }
      
      if (currentFacingMode === facing && cameraStream) {
        console.log('Camera already on ' + facing + ', skipping');
        return;
      }

      isSwitching = true;
      try {
        await startCamera(facing);
      } catch (err) {
        console.error('Failed to switch camera: ' + err.message);
      } finally {
        isSwitching = false;
      }
    };

    const handleMessage = async (event) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        console.log('Received message type: ' + (data.type || 'unknown'));
        if (data.type === 'switchCamera') {
          window.switchCamera(data.facing);
        }
      } catch (e) {
        console.log('Message parse error: ' + e.message);
      }
    };

    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage); // For Android robustness

    async function init() {
      try {
        console.log('Starting MediaPipe initialization...');
        
        // Try to get initial facing mode from a global variable if set
        const initialFacing = window.__INITIAL_FACING__ || 'user';
        console.log('Initial facing mode: ' + initialFacing);

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API missing. Secure context: ' + window.isSecureContext);
        }

        if (typeof Hands === 'undefined') {
          throw new Error('MediaPipe Hands library failed to load. Please check your internet connection.');
        }

        hands = new Hands({
          locateFile: (file) => {
            return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/' + file;
          }
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        hands.onResults((results) => {
          if (!isReady) {
            isReady = true;
            sendMessage('ready', {});
            console.log('MediaPipe first results received!');
          }

          canvasElement.width = videoElement.videoWidth;
          canvasElement.height = videoElement.videoHeight;
          canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0].map(pt => ({
              x: Number(pt.x.toFixed(4)),
              y: Number(pt.y.toFixed(4)),
              z: Number((pt.z || 0).toFixed(4))
            }));

            sendMessage('handDetected', { landmarks, timestamp: Date.now() });

            // Ensure all drawing utils are available before using
            if (typeof drawConnectors !== 'undefined' && 
                typeof drawLandmarks !== 'undefined' && 
                typeof HAND_CONNECTIONS !== 'undefined') {
              drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
              drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
            }
          } else {
            sendMessage('handLost', { timestamp: Date.now() });
          }
        });

        await hands.initialize();
        console.log('Hands initialized successfully');

        await startCamera(initialFacing);

        statusElement.textContent = 'Ready - Show your hand';
        statusElement.style.background = 'rgba(0,100,200,0.7)';
      } catch (error) {
        console.error('Init Error: ' + error.message);
        sendMessage('error', { message: error.message });
        statusElement.textContent = 'Error: ' + error.message;
        statusElement.style.background = 'rgba(200,0,0,0.7)';
      }
    }

    init();
  </script>
</body>
</html>
`;

export default function HandTracker({ facing, onHandDetected, onHandLost, onReady, onError }) {
  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [webViewReady, setWebViewReady] = useState(false);

  // Handle camera facing change
  useEffect(() => {
    if (webViewReady && webViewRef.current) {
      console.log('Sending switchCamera message:', facing);
      const message = JSON.stringify({
        type: 'switchCamera',
        facing: facing
      });
      webViewRef.current.postMessage(message);
    }
  }, [facing, webViewReady]);

  const handleMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      switch (message.type) {
        case 'log':
          console.log('[WebView Log]:', message.data.message);
          break;
        case 'ready':
          setIsLoading(false);
          setWebViewReady(true);
          onReady?.();
          break;
        case 'handDetected':
          onHandDetected?.(message.data.landmarks, message.data.timestamp);
          break;
        case 'handLost':
          onHandLost?.(message.data.timestamp);
          break;
        case 'error':
          onError?.(message.data.message);
          break;
      }
    } catch (e) {
      console.error('Failed to parse WebView message:', e);
    }
  };

  const injectedJS = `
    window.__INITIAL_FACING__ = '${facing}';
    true; // note: this is required for some versions of RN WebView
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={{ 
          html: MEDIA_PIPE_HTML, 
          baseUrl: 'http://localhost' 
        }}
        onMessage={handleMessage}
        injectedJavaScript={injectedJS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState={true}
        scalesPageToFit={true}
        mixedContentMode="always"
        originWhitelist={['*']}
        onPermissionRequest={(event) => {
          event.grant();
        }}
        onLoadEnd={() => {
          console.log('WebView Load End');
          setWebViewReady(true);
        }}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading Hand Tracker...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative'
  },
  webview: {
    flex: 1,
    backgroundColor: '#000'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600'
  }
});
