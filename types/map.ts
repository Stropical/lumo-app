import * as Location from 'expo-location';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface DropOffZone {
  id: string;
  name: string;
  coordinate: Coordinate;
  capacity: number;
  available: number;
  description?: string;
}

export interface GeofencePolygon {
  coordinates: Coordinate[];
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type ZoneAvailability = 'plenty' | 'limited' | 'full';

export interface LocationState {
  location: Location.LocationObject | null;
  isInsideGeofence: boolean;
  nearestZone: DropOffZone | null;
  distanceToNearestZone: number | null;
}

export interface MapTheme {
  geofence: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
  };
  dropOffZone: {
    radius: number;
    colors: {
      plenty: string;
      limited: string;
      full: string;
    };
  };
  marker: {
    size: number;
    textColor: string;
  };
}
