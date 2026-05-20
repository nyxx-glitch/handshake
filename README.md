# HandShake Filipino Sign Language  App


## Key Features

- **Real-time FSL Detection**: High-performance hand tracking using MediaPipe.
- **Custom Inference Engine**: Lightweight 4-layer neural network implemented manually in JavaScript for maximum stability and speed.
- **Word Builder**: Automatically constructs sentences from detected signs with smart cooldowns and a 24-character limit.
- **Training Mode**: Hidden developer tools for collecting landmark data and exporting it for model training.
- **Interactive References**: A searchable guide for FSL letters, numbers, and common phrases.
- **Dynamic Mirroring**: Intelligent camera views (mirrored for front camera, natural for back camera).

---

## Tech Stack

- **Framework**: Expo (SDK 54), React Native, Expo Router.
- **AI/ML**: MediaPipe (Hand Landmarker), custom weight-based inference.
- **UI/UX**: Custom themed components with a professional "Dark Brown" aesthetic.
- **Backend**: Node.js data server (for training data collection).

---

##  Project Structure

- `app/`: Expo Router file-based navigation (Main screens: `index.js`, `camera.js`, `reference.js`).
- `src/inference/`: The core AI engine.
  - `HandTrackerWebView.js`: Bridge between MediaPipe (web) and React Native.
  - `inferenceAdapter.js`: Manual neural network implementation and weight loader.
- `assets/model/`: Trained model weights (`fsl_model_weights.json`) and labels.
- `scripts/`: Development scripts for data collection (`data_server.js`) and training (`train_fsl.py`).
- `constants/`: Global configurations (`labels.js`, `theme.js`).

---

##  How it Works

### 1. Hand Tracking
The app uses a hidden `WebView` to run the MediaPipe Hands library. This ensures high-speed landmark extraction (21 points per hand) without the overhead of heavy native libraries.

### 2. Inference
Instead of using TensorFlow Lite directly on the device, we use a **manual inference adapter**. It performs matrix multiplications directly in JS using pre-trained weights. This makes the app lightweight and extremely reliable across different devices.

### 3. Word Building
As you sign, the app tracks the stability of the detection. If a sign is held for ~0.8s, it's added to the "Word Builder" overlay. The overlay automatically clears after 5 seconds of inactivity.

---

## Development & Training

### Collecting Data
1. Long-press the **HandShake Logo** on the camera screen to enable Training Mode.
2. Select a label and press **Start Training Collection**.
3. Run the data server: `npm run data-server`.
4. Export the data to save it to your local machine.

### Training the Model
Use the provided Python script to train new model weights:
```bash
py -3.11 scripts/train_fsl.py
```

---

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the app**
   ```bash
   npx expo start
   ```

3. **Build for Android (apk)**
   ```bash
   npx eas build --platform android --profile preview
   ```

---

