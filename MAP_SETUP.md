# Map Integration Setup Guide

## Overview
The Lumo app now includes an integrated map showing:
- **Geofence Area**: A polygon boundary defining the service area where bikes can be used
- **Drop-off Zones**: Designated locations where bikes can be returned, with real-time availability
- **User Location**: Your current position on the map
- **Service Status**: Visual indicator showing if you're inside or outside the service area

## Google Maps API Setup

### For Android:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Maps SDK for Android**
4. Go to **APIs & Services > Credentials**
5. Create an API key
6. Restrict the key to Android apps and add your package name: `com.anonymous.lumoapp`
7. Copy the API key and replace `YOUR_ANDROID_GOOGLE_MAPS_API_KEY` in `app.json`

### For iOS:
1. In the same Google Cloud Console project
2. Enable the **Maps SDK for iOS**
3. Create a separate API key for iOS
4. Restrict the key to iOS apps and add your bundle identifier: `com.anonymous.lumoapp`
5. Copy the API key and replace `YOUR_IOS_GOOGLE_MAPS_API_KEY` in `app.json`

## Features

### Geofence
- The blue polygon on the map shows the service area boundary
- Bikes can only be activated and used within this area
- The app shows a status indicator if you're inside or outside the geofence

### Drop-off Zones
- Circular zones marked on the map with colored markers
- **Green**: Plenty of spots available (>50% capacity)
- **Yellow**: Getting full (20-50% capacity)
- **Red**: Almost full (<20% capacity)
- Numbers on markers show available spots

### Map Controls
- **Show Area**: Centers the map on the geofence area
- **My Location**: Centers the map on your current position

## Customization

### Update Geofence Coordinates
Edit `components/geofence-map.tsx` and modify the `geofencePolygon` array:
```typescript
const geofencePolygon = [
  { latitude: YOUR_LAT_1, longitude: YOUR_LNG_1 },
  { latitude: YOUR_LAT_2, longitude: YOUR_LNG_2 },
  // Add more coordinates to define your service area
];
```

### Update Drop-off Zones
Edit the `dropOffZones` array in `components/geofence-map.tsx`:
```typescript
const dropOffZones: DropOffZone[] = [
  {
    id: '1',
    name: 'Your Zone Name',
    coordinate: { latitude: YOUR_LAT, longitude: YOUR_LNG },
    capacity: 10,
    available: 7,
  },
  // Add more zones
];
```

## Testing

### Using iOS Simulator:
1. Run `npm run ios` or `expo run:ios`
2. In the simulator, go to Features > Location
3. Choose a custom location or use "City Run" to simulate movement

### Using Android Emulator:
1. Run `npm run android` or `expo run:android`
2. Click the "..." button in the emulator toolbar
3. Go to Location tab and set a custom location

### On Physical Device:
1. Build the app using EAS Build or local builds
2. Install on your device
3. Grant location permissions when prompted
4. The map will show your actual location

## Location Permissions

The app requests the following permissions:
- **iOS**: "When In Use" location access for map display
- **Android**: Fine and Coarse location access

Users must grant these permissions to see their location on the map and use geofence features.

## Integration with Bike Controls

The map is displayed in the "Explore" tab. You can:
1. Connect to your bike in the "Home" tab
2. View the service area and drop-off zones in the "Explore" tab
3. The app will enforce geofence rules during bike activation and rides

## Future Enhancements

Consider adding:
- Real-time updates of drop-off zone availability from a backend
- Route planning to nearest drop-off zone
- Push notifications when approaching geofence boundaries
- Historical ride tracking on the map
- Integration with bike status (lock when outside geofence)
