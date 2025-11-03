import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import MapView, { Marker, Polygon, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

interface Bike {
  id: string;
  name: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  batteryLevel: number;
  isAvailable: boolean;
}

interface GeofenceMapProps {
  onLocationUpdate?: (location: Location.LocationObject) => void;
  showUserLocation?: boolean;
}

export default function GeofenceMap({ onLocationUpdate, showUserLocation = true }: GeofenceMapProps) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const mapRef = useRef<MapView>(null);

  // Define geofence area (OSU Campus in Corvallis, OR) - This is also the drop-off zone
  const geofencePolygon = [
    { latitude: 44.5700, longitude: -123.2820 }, // Northwest corner
    { latitude: 44.5700, longitude: -123.2680 }, // Northeast corner
    { latitude: 44.5600, longitude: -123.2680 }, // Southeast corner (near Reser Stadium)
    { latitude: 44.5580, longitude: -123.2750 }, // South central
    { latitude: 44.5600, longitude: -123.2820 }, // Southwest corner
  ];

  // Available bikes scattered around OSU Campus
  const bikes: Bike[] = [
    {
      id: 'bike-1',
      name: 'Lumo #101',
      coordinate: { latitude: 44.5656, longitude: -123.2789 },
      batteryLevel: 85,
      isAvailable: true,
    },
    {
      id: 'bike-2',
      name: 'Lumo #102',
      coordinate: { latitude: 44.5647, longitude: -123.2759 },
      batteryLevel: 92,
      isAvailable: true,
    },
    {
      id: 'bike-3',
      name: 'Lumo #103',
      coordinate: { latitude: 44.5635, longitude: -123.2695 },
      batteryLevel: 45,
      isAvailable: true,
    },
    {
      id: 'bike-4',
      name: 'Lumo #104',
      coordinate: { latitude: 44.5625, longitude: -123.2795 },
      batteryLevel: 78,
      isAvailable: false, // In use
    },
    {
      id: 'bike-5',
      name: 'Lumo #105',
      coordinate: { latitude: 44.5675, longitude: -123.2785 },
      batteryLevel: 95,
      isAvailable: true,
    },
    {
      id: 'bike-6',
      name: 'Lumo #106',
      coordinate: { latitude: 44.5640, longitude: -123.2770 },
      batteryLevel: 68,
      isAvailable: true,
    },
    {
      id: 'bike-7',
      name: 'Lumo #107',
      coordinate: { latitude: 44.5665, longitude: -123.2740 },
      batteryLevel: 55,
      isAvailable: true,
    },
    {
      id: 'bike-8',
      name: 'Lumo #108',
      coordinate: { latitude: 44.5620, longitude: -123.2730 },
      batteryLevel: 88,
      isAvailable: true,
    },
  ];

  useEffect(() => {
    (async () => {
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to show your position on the map.');
        return;
      }
      setLocationPermission(true);

      // Get current location
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      if (onLocationUpdate) {
        onLocationUpdate(currentLocation);
      }

      // Watch location updates
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (newLocation) => {
          setLocation(newLocation);
          if (onLocationUpdate) {
            onLocationUpdate(newLocation);
          }
        }
      );
    })();
  }, []);

  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  const centerOnGeofence = () => {
    if (mapRef.current) {
      const latitudes = geofencePolygon.map(coord => coord.latitude);
      const longitudes = geofencePolygon.map(coord => coord.longitude);
      
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLng = Math.min(...longitudes);
      const maxLng = Math.max(...longitudes);
      
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const latDelta = (maxLat - minLat) * 1.5;
      const lngDelta = (maxLng - minLng) * 1.5;

      mapRef.current.animateToRegion({
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      }, 1000);
    }
  };

  const isInsideGeofence = (lat: number, lng: number): boolean => {
    // Simple point-in-polygon algorithm
    let inside = false;
    for (let i = 0, j = geofencePolygon.length - 1; i < geofencePolygon.length; j = i++) {
      const xi = geofencePolygon[i].latitude;
      const yi = geofencePolygon[i].longitude;
      const xj = geofencePolygon[j].latitude;
      const yj = geofencePolygon[j].longitude;

      const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const getBatteryColor = (level: number): string => {
    if (level > 60) return '#22c55e'; // Green - good battery
    if (level > 30) return '#facc15'; // Yellow - medium battery
    return '#ef4444'; // Red - low battery
  };

  const initialRegion = {
    latitude: 44.5650,
    longitude: -123.2755,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={showUserLocation && locationPermission}
        showsMyLocationButton={false}
        showsCompass={true}
        rotateEnabled={true}
        pitchEnabled={false}
      >
        {/* Geofence Polygon - Also serves as drop-off zone */}
        <Polygon
          coordinates={geofencePolygon}
          fillColor="rgba(34, 197, 94, 0.10)"
          strokeColor="rgba(34, 197, 94, 0.8)"
          strokeWidth={3}
        />

        {/* Individual Bikes */}
        {bikes.map((bike) => (
          <Marker
            key={bike.id}
            coordinate={bike.coordinate}
            title={bike.name}
            description={`Battery: ${bike.batteryLevel}% • ${bike.isAvailable ? 'Available' : 'In Use'}`}
            opacity={bike.isAvailable ? 1.0 : 0.5}
          >
            <View style={[
              styles.bikeMarker, 
              { 
                backgroundColor: bike.isAvailable ? getBatteryColor(bike.batteryLevel) : '#94a3b8',
                opacity: bike.isAvailable ? 1.0 : 0.6,
              }
            ]}>
              <Text style={styles.bikeIcon}>🚲</Text>
              <View style={styles.batteryIndicator}>
                <Text style={styles.batteryText}>{bike.batteryLevel}%</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Map Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={centerOnGeofence}>
          <Text style={styles.controlButtonText}>📍 Show Area</Text>
        </TouchableOpacity>
        {locationPermission && (
          <TouchableOpacity style={styles.controlButton} onPress={centerOnUser}>
            <Text style={styles.controlButtonText}>📍 My Location</Text>
          </TouchableOpacity>
        )}
      </View>



      {/* Location Status */}
      {location && (
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>
            {isInsideGeofence(location.coords.latitude, location.coords.longitude)
              ? '✅ Inside service area'
              : '⚠️ Outside service area'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  controls: {
    position: 'absolute',
    top: 16,
    right: 16,
    gap: 8,
        marginTop: 40,
  },
  controlButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    
  },
  legend: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    minWidth: 180,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#475569',
    flex: 1,
  },
  legendInfoRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  legendInfoText: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
  },
  statusBar: {
    position: 'absolute',
    marginTop: 40,
    top: 16,
    left: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  bikeMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  bikeIcon: {
    fontSize: 24,
  },
  batteryIndicator: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  batteryText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0f172a',
  },
});
