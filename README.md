# HandShake 
### AI-Powered Filipino Sign Language (FSL) Detection

HandShake is a sophisticated mobile application built with **Expo** and **MediaPipe** that translates Filipino Sign Language (FSL) in real-time. By utilizing a **Spatio-Temporal AI architecture**, the app recognizes both static hand poses and complex moving gestures with high precision.

---

##  Key Features

- **Sequential Motion Recognition**: Powered by a **Gated Recurrent Unit (GRU)** neural network that understands the "flow" of signs over time.
- **Real-time FSL Detection**: High-performance hand tracking (21 landmarks) using Google MediaPipe via a custom hybrid bridge.
- **Intelligent Word Builder**: A real-time typing system that "snaps" signs into sentences with atomic state management and a 2-second anti-spam cooldown.
- **Research-Grade Data Collection**: Built-in training mode with high-precision frame counters (0% frame loss during recording).
- **Dynamic Mirroring**: Context-aware camera views (Mirrored for front-facing, Natural for back-facing).
- **Offline Inference**: Entirely local AI processing—no data leaves the device, ensuring 100% privacy and zero latency.

---

##  Technical Architecture

### 1. The Vision Bridge (The Eyes)
The app utilizes a hidden `WebView` to execute the **MediaPipe Hands** library. This architectural choice bypasses the overhead of native mobile AI wrappers, allowing for consistent **30 FPS landmark extraction** across different hardware.

### 2. Spatio-Temporal Inference (The Brain)
Unlike traditional "pose detectors" that look at one frame at a time, HandShake uses a **GRU (Gated Recurrent Unit)** architecture:
- **Temporal Memory**: The app maintains a **sliding window buffer** of the last 10-20 frames.
- **Manual Math Engine**: To keep the app lightweight, the GRU mathematical gates (Update, Reset, and Candidate Hidden State) are implemented manually in pure JavaScript
 ([inferenceAdapter.js](file:Handshake/handshake/src/inference/inferenceAdapter.js)).
- **Sequential Processing**: This allows the app to distinguish between identical poses that have different motions (e.g., the static "I" vs. the moving "J").

### 3. Word Builder Logic (The Interface)
The translation-to-text pipeline uses **Atomic State Management** via React Refs to ensure zero lag:
- **Instant Append**: New gestures are registered in a single frame for a snappy, "typing" feel.
- **Strict Cooldown**: A 2-second lockout prevents duplicated characters while holding a sign.
- **Auto-Clear**: A smart 5-second idle timer resets the display only when the user is truly inactive.

---

##  Tech Stack

- **Mobile Framework**: Expo (SDK 54), React Native, Expo Router.
- **AI Core**: Google MediaPipe (Hand Landmarker).
- **Neural Network**: Custom GRU (Trained via TensorFlow/Keras).
- **Inference**: Manual JS Matrix Multiplication (Zero-dependency inference).
- **Backend**: Node.js Data Server (for training data synchronization).
- **Languages**: JavaScript (App & Inference), Python 3.11 (Training Pipeline), HTML/CSS (Vision Bridge).

---

##  Project Structure

- `app/`: Expo Router navigation (Main screens: `index.js`, `camera.js`, `reference.js`).
- `src/inference/`: The core AI engine.
  - `HandTrackerWebView.js`: Bridge between MediaPipe and React Native.
  - `inferenceAdapter.js`: Manual GRU implementation and sequence processor.
- `assets/model/`: Neural network weights (`fsl_model_weights.json`) and labels.
- `scripts/`: Development ecosystem (`data_server.js` & `train_fsl.py`).

---

##  Development & Training

### 1. Data Collection
Long-press the **HandShake Logo** on the camera screen to enter Training Mode. Perform signs for 3-30 seconds to capture sufficient temporal data. The system uses a decoupled UI counter to ensure every landmark frame is recorded with 100% precision.

### 2. Model Training
The Python pipeline groups raw landmark data into sequences and trains a 4-layer GRU model:
```bash
py -3.11 scripts/train_fsl.py
```
This script automatically exports optimized JSON weights for the mobile inference engine.

---

##  Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Start the development server**
   ```bash
   npx expo start
   ```
3. **Build for Android (APK)**
   ```bash
   npx eas build --platform android --profile preview
   ```
