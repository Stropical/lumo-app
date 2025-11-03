# Native Module Rebuild Instructions

The app now includes expo-image-picker which requires native modules. Follow these steps to rebuild:

## For iOS:

1. **Prebuild the native iOS project:**
   ```bash
   npx expo prebuild --clean
   ```

2. **Install iOS dependencies:**
   ```bash
   cd ios
   pod install
   cd ..
   ```

3. **Run on device:**
   ```bash
   npx expo run:ios --device
   ```

## For Android:

1. **Prebuild the native Android project:**
   ```bash
   npx expo prebuild --clean
   ```

2. **Run on device:**
   ```bash
   npx expo run:android --device
   ```

## For Expo Go (Development):

Note: expo-image-picker should work in Expo Go, but if you continue to see errors:

1. **Clear cache and restart:**
   ```bash
   npx expo start --clear
   ```

2. **If still issues, use development build:**
   ```bash
   npx expo install expo-dev-client
   npx expo prebuild
   npx expo run:ios --device
   ```

## What Was Added:

- **expo-image-picker**: Camera functionality for taking bike photos at end of ride
- **Permissions**: Camera and photo library access configured in app.json
- **Camera Modal**: End ride flow now requires (or allows skipping) a bike photo

## Features:

1. When you end a ride, a modal appears asking you to take a photo of the bike
2. Tap "Take Picture" to launch the camera
3. Take a photo showing the bike parked safely
4. Photo is captured and the ride completes
5. Option to "Skip for Now" if needed (for testing)
