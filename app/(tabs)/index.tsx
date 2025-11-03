import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, Text, View, TouchableOpacity, FlatList, Platform, PermissionsAndroid, StyleSheet, Alert, Modal, Animated, LayoutAnimation, UIManager, StatusBar, Image} from 'react-native';
import {BleManager, Device, State} from 'react-native-ble-plx';
import {Buffer} from 'buffer';
import GeofenceMap from '@/components/geofence-map';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Match these to the firmware UUIDs
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab'.toLowerCase();
const CHAR_UUID = 'abcdefab-1234-1234-1234-abcdefabcdef'.toLowerCase();

type BikeState = 'INACTIVE' | 'ACTIVATED' | 'RIDING';

// Mock device for development
const DEV_BIKE_DEVICE: Device = {
  id: 'dev-bike-simulator',
  name: 'Dev Bike',
  localName: 'Dev Bike',
  rssi: -45,
  mtu: 185,
  manufacturerData: null,
  serviceData: null,
  serviceUUIDs: [SERVICE_UUID],
  txPowerLevel: null,
  solicitedServiceUUIDs: null,
  isConnectable: true,
  overflowServiceUUIDs: null,
} as Device;

function HomeScreen() {
  const navigation = useNavigation();
  const managerRef = useRef<BleManager | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [bikeState, setBikeState] = useState<BikeState>('INACTIVE');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showBikeSelector, setShowBikeSelector] = useState(false);
  const [showRideDetails, setShowRideDetails] = useState(false);
  const [rideTime, setRideTime] = useState(0);
  const [rideCost, setRideCost] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDevMode, setIsDevMode] = useState(false); // Track if connected to dev bike
  const [distance, setDistance] = useState(0); // Distance in miles
  const [batteryLevel, setBatteryLevel] = useState(85); // Battery percentage
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [bikePhoto, setBikePhoto] = useState<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    managerRef.current = new BleManager();
    
    // Auto-start scanning when component mounts
    const autoScanTimer = setTimeout(() => {
      startScan();
    }, 500); // Small delay to ensure BLE manager is ready

    return () => {
      clearTimeout(autoScanTimer);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const mgr = managerRef.current;
      if (mgr) {
        mgr.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  // Hide tab bar when riding
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: bikeState === 'RIDING' ? { display: 'none' } : undefined,
    });
  }, [bikeState, navigation]);

  // Animate button pulsing when ready to ride
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
    if (bikeState === 'ACTIVATED') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      scaleAnim.setValue(1);
    }
  }, [bikeState]);

  // Smooth fade in/out transitions
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [connectedDevice, bikeState]);

  // Ride timer and stats simulator
  useEffect(() => {
    let interval: any;
    if (bikeState === 'RIDING') {
      interval = setInterval(() => {
        setRideTime(prev => {
          const newTime = prev + 1;
          setRideCost(1.00 + (newTime / 60) * 0.15);
          
          // Simulate distance (roughly 10 mph average = 0.00278 miles per second)
          setDistance(prevDist => prevDist + 0.00278);
          
          // Simulate battery drain (0.05% per second = 3% per minute)
          setBatteryLevel(prevBattery => Math.max(0, prevBattery - 0.05));
          
          return newTime;
        });
      }, 1000);
    } else {
      setRideTime(0);
      setRideCost(0);
      setDistance(0);
    }
    return () => clearInterval(interval);
  }, [bikeState]);

  async function requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        const perms = [];
        // On Android 12+ need BLUETOOTH_SCAN / BLUETOOTH_CONNECT
        perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);

        const granted = await PermissionsAndroid.requestMultiple(perms as any);
        // You can check granted[...] if you want
      } catch (e) {
        console.warn('Permission error', e);
      }
    }
  }

  async function startScan() {
    await requestPermissions();
    const manager = managerRef.current;
    if (!manager) return;

    setDevices({});
    setIsScanning(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // Always add dev bike immediately
    setDevices({[DEV_BIKE_DEVICE.id]: DEV_BIKE_DEVICE});

    console.log('Starting BLE scan...');

    manager.startDeviceScan(null, {allowDuplicates: false}, (error, device) => {
      if (error) {
        console.warn('Scan error', error);
        setIsScanning(false);
        return;
      }
      if (!device || !device.id) return;
      
      const advertisedName = device.name || device.localName || '';
      const matchesLumo = advertisedName.toLowerCase().includes('lumo');
      if (matchesLumo) {
        console.log('Found Lumo device:', {
          name: device.name,
          localName: device.localName,
          id: device.id,
        });
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDevices(prev => ({...prev, [device.id]: device}));
      }
    });

    // stop after 8s
    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }, 8000);
  }

  async function connect(device: Device) {
    // Check if this is the dev bike
    if (device.id === DEV_BIKE_DEVICE.id) {
      setConnectionState('connecting');
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setConnectedDevice(device);
      setConnectionState('connected');
      setIsDevMode(true);
      console.log('Connected to Dev Bike (simulator mode)');
      
      // Auto-start ride after connection
      setTimeout(async () => {
        await sendCommand('A'); // Activate
        await new Promise(resolve => setTimeout(resolve, 500));
        await sendCommand('S'); // Start riding
      }, 500);
      
      return;
    }

    // Regular BLE connection for real devices
    const manager = managerRef.current;
    if (!manager) return;

    setConnectionState('connecting');
    setIsDevMode(false);
    try {
      // Connect with longer timeout and autoConnect
      const connectedDevice = await manager.connectToDevice(device.id, {
        requestMTU: 185,
        timeout: 10000,
      });
      await connectedDevice.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connectedDevice);
      setConnectionState('connected');
      
      // Auto-start ride after connection
      setTimeout(async () => {
        try {
          await sendCommand('A'); // Activate
          await new Promise(resolve => setTimeout(resolve, 500));
          await sendCommand('S'); // Start riding
        } catch (e) {
          console.warn('Auto-start error', e);
        }
      }, 500);

      // Monitor connection state
      const subscription = manager.onDeviceDisconnected(connectedDevice.id, (error, device) => {
        console.log('Device disconnected', device?.id);
        setConnectionState('disconnected');
        setConnectedDevice(null);
        setBikeState('INACTIVE');
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Don't auto-reconnect - let user manually reconnect
        Alert.alert(
          'Bike Disconnected',
          'The connection to your bike was lost. Please reconnect to continue.',
          [{ text: 'OK' }]
        );
      });

      console.log('Connected to', connectedDevice.id);

      // Debug: log discovered services and characteristics
      const services = await connectedDevice.services();
      console.log('Discovered services:', services.map(s => s.uuid));
      for (const service of services) {
        const characteristics = await service.characteristics();
        console.log(`Service ${service.uuid} characteristics:`, characteristics.map(c => ({uuid: c.uuid, writable: c.isWritableWithResponse})));
      }

      // Keep connection alive by reading periodically
      const keepAliveInterval = setInterval(async () => {
        try {
          const isConnected = await connectedDevice.isConnected();
          if (!isConnected) {
            clearInterval(keepAliveInterval);
          }
        } catch (e) {
          console.warn('Keep-alive check failed', e);
          clearInterval(keepAliveInterval);
        }
      }, 5000);

    } catch (e) {
      console.warn('Connect error', e);
      setConnectionState('disconnected');
      setConnectedDevice(null);
    }
  }

  async function sendCommand(command: string) {
    if (!connectedDevice || connectionState !== 'connected') {
      throw new Error('Not connected');
    }

    // Dev bike mode - just simulate the command
    if (isDevMode) {
      console.log('Dev Bike - Simulating command:', command);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update local state based on command
      switch (command) {
        case 'A': setBikeState('ACTIVATED'); break;
        case 'S': setBikeState('RIDING'); break;
        case 'T': setBikeState('ACTIVATED'); break;
        case 'D': setBikeState('INACTIVE'); break;
      }
      return;
    }

    // Real BLE command
    try {
      const base64 = Buffer.from(command).toString('base64');
      await managerRef.current!.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID,
        base64
      );
      console.log('Sent command:', command);

      // Update local state based on command
      switch (command) {
        case 'A': setBikeState('ACTIVATED'); break;
        case 'S': setBikeState('RIDING'); break;
        case 'T': setBikeState('ACTIVATED'); break;
        case 'D': setBikeState('INACTIVE'); break;
      }
    } catch (e) {
      console.warn('Command error', e);
      throw e;
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected': return '#28a745';
      case 'connecting': return '#ffc107';
      case 'disconnected': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getBikeStateColor = () => {
    switch (bikeState) {
      case 'RIDING': return '#28a745';
      case 'ACTIVATED': return '#ffc107';
      case 'INACTIVE': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const deviceArray = Object.values(devices);

  const getDeviceLabel = (device: Device) => {
    if (device.name && device.name.trim().length > 0) {
      return device.name.trim();
    }
    if (device.localName && device.localName.trim().length > 0) {
      return device.localName.trim();
    }
    return `Lumo Device ${device.id.slice(-4).toUpperCase()}`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRide = async () => {
    // Since rides auto-start on connection, just open bike selector
    setShowBikeSelector(true);
  };

  const takeBikePhoto = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to take a photo of the bike.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setBikePhoto(result.assets[0].uri);
        setShowCameraModal(false);
        // Now complete the ride
        await completeRideEnd();
      }
    } catch (e) {
      console.warn('Camera error', e);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const completeRideEnd = async () => {
    setIsProcessing(true);
    
    try {
      await sendCommand('T');
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendCommand('D');
      setShowRideDetails(false);
      
      // Disconnect and reset
      setConnectedDevice(null);
      setConnectionState('disconnected');
      setIsDevMode(false);
      setBatteryLevel(85); // Reset battery for next ride
      setBikePhoto(null); // Clear photo for next ride
    } catch (e) {
      console.warn('End ride error', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEndRide = async () => {
    if (isProcessing) return;
    // Show camera modal to take photo before ending
    setShowCameraModal(true);
  };

  // Full-screen riding mode
  if (bikeState === 'RIDING') {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
        <View style={styles.fullScreenRide}>
          {/* Full screen map */}
          <View style={styles.fullScreenMapContainer}>
            <GeofenceMap onLocationUpdate={() => {}} showUserLocation={true} />
            {/* Primary color overlay - solid background */}
            <View style={styles.mapOverlay} />
          </View>

          {/* Ride info overlay */}
          <View style={styles.fullScreenOverlay}>
          <View style={styles.fullScreenHeader}>
            <View style={styles.fullScreenBadge}>
              <View style={styles.fullScreenDot} />
              <Text style={styles.fullScreenBadgeText}>
                {getDeviceLabel(connectedDevice!)}
                {isDevMode && ' 🧪'}
              </Text>
            </View>
          </View>

          <View style={styles.fullScreenStats}>
            {/* Row 1: Time and Cost */}
            <View style={styles.statsRow}>
              <View style={[styles.fullScreenStatCard, styles.statCardSmall]}>
                <Text style={styles.fullScreenStatLabel}>Time</Text>
                <Text style={styles.fullScreenStatValue}>{formatTime(rideTime)}</Text>
              </View>
              <View style={[styles.fullScreenStatCard, styles.statCardSmall]}>
                <Text style={styles.fullScreenStatLabel}>Cost</Text>
                <Text style={styles.fullScreenStatValue}>${rideCost.toFixed(2)}</Text>
              </View>
            </View>

            {/* Row 2: Distance and Battery */}
            <View style={styles.statsRow}>
              <View style={[styles.fullScreenStatCard, styles.statCardSmall]}>
                <Text style={styles.fullScreenStatLabel}>Distance</Text>
                <Text style={styles.fullScreenStatValue}>{distance.toFixed(2)} mi</Text>
              </View>
              <View style={[styles.fullScreenStatCard, styles.statCardSmall]}>
                <Text style={styles.fullScreenStatLabel}>Battery</Text>
                <View style={styles.batteryContainer}>
                  <Text style={[styles.fullScreenStatValue, {color: batteryLevel > 20 ? '#22c55e' : '#ef4444'}]}>
                    {Math.round(batteryLevel)}%
                  </Text>
                  <View style={styles.batteryBar}>
                    <View style={[styles.batteryFill, {
                      width: `${batteryLevel}%`,
                      backgroundColor: batteryLevel > 20 ? '#22c55e' : '#ef4444'
                    }]} />
                  </View>
                </View>
              </View>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.fullScreenEndButton, isProcessing && styles.buttonDisabled]}
            onPress={handleEndRide}
            activeOpacity={0.9}
            disabled={isProcessing}
          >
            <Text style={styles.fullScreenEndButtonText}>
              {isProcessing ? 'ENDING...' : 'END RIDE'}
            </Text>
            <Text style={styles.fullScreenEndButtonSubtext}>Tap to finish and lock bike</Text>
          </TouchableOpacity>
        </View>
        </View>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      
      {/* Full screen map */}
      <View style={styles.fullScreenMapNonRiding}>
        <GeofenceMap onLocationUpdate={() => {}} showUserLocation={true} />
      </View>

      {/* Floating header overlay */}
      <View style={styles.floatingHeader}>
        <TouchableOpacity 
          style={styles.scanButtonFloating}
          onPress={startScan}
          disabled={isScanning}
        >
          <Text style={styles.scanButtonText}>
            {isScanning ? '🔍' : '📡'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Floating START RIDE button */}
      <View style={styles.floatingButtonContainer}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity 
            style={styles.startRideButtonFloating}
            onPress={handleStartRide}
            activeOpacity={0.9}
          >
            <Text style={styles.startRideButtonText}>
              START RIDE
            </Text>
            <Text style={styles.startRideButtonSubtext}>
              Select a bike to begin
            </Text>
          </TouchableOpacity>
        </Animated.View>
        
        {isScanning && (
          <Animated.View style={{ opacity: fadeAnim, marginTop: 12 }}>
            <View style={styles.scanningIndicatorFloating}>
              <Text style={styles.scanningTextFloating}>Scanning for bikes...</Text>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Bike Selector Modal */}
      <Modal
        visible={showBikeSelector}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBikeSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Your Bike</Text>
              <TouchableOpacity onPress={() => setShowBikeSelector(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.modalScanButton} 
              onPress={() => {
                startScan();
              }}
            >
              <Text style={styles.modalScanButtonText}>
                {isScanning ? '🔍 Scanning...' : '🔍 Scan for Bikes'}
              </Text>
            </TouchableOpacity>

            <FlatList
              data={deviceArray}
              keyExtractor={(item) => item.id}
              style={styles.deviceList}
              renderItem={({item}) => {
                const isConnected = item.id === connectedDevice?.id;
                const isDevBike = item.id === DEV_BIKE_DEVICE.id;
                return (
                  <TouchableOpacity
                    style={[styles.deviceCard, isConnected && styles.deviceCardActive]}
                    onPress={() => {
                      connect(item);
                      setShowBikeSelector(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.deviceIcon}>
                      <Text style={styles.deviceIconText}>{isDevBike ? '🧪' : '🚲'}</Text>
                    </View>
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>
                        {getDeviceLabel(item)}
                        {isDevBike && ' (Test)'}
                      </Text>
                      <Text style={styles.deviceId}>{item.id.slice(-8).toUpperCase()}</Text>
                    </View>
                    {isConnected && (
                      <View style={styles.deviceCheckmark}>
                        <Text style={styles.deviceCheckmarkText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateIcon}>🔍</Text>
                  <Text style={styles.emptyStateText}>No bikes found nearby</Text>
                  <Text style={styles.emptyStateSubtext}>Make sure Bluetooth is on and you're near a Lumo bike</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Camera Modal for End Ride */}
      <Modal
        visible={showCameraModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowCameraModal(false)}
      >
        <View style={styles.cameraModal}>
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraTitle}>Take a Photo of the Bike</Text>
            <Text style={styles.cameraSubtitle}>Show the bike parked safely in a designated area</Text>
          </View>

          <View style={styles.cameraActions}>
            <TouchableOpacity 
              style={styles.takePictureButton}
              onPress={takeBikePhoto}
              activeOpacity={0.8}
            >
              <Text style={styles.takePictureIcon}>📷</Text>
              <Text style={styles.takePictureText}>Take Picture</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.skipPhotoButton}
              onPress={() => {
                setShowCameraModal(false);
                completeRideEnd();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.skipPhotoText}>Skip for Now</Text>
            </TouchableOpacity>
          </View>

          {bikePhoto && (
            <View style={styles.photoPreview}>
              <Text style={styles.photoPreviewLabel}>Photo captured ✓</Text>
              <Image source={{ uri: bikePhoto }} style={styles.photoImage} />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#f8fafc'},
  container: {flex: 1},
  fullScreenRide: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingTop: 0, // Remove padding to extend to notch
  },
  fullScreenMapContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2563eb', // Solid primary color - 100% opacity
  },
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    paddingHorizontal: 20,
  },
  fullScreenHeader: {
    alignItems: 'center',
  },
  fullScreenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 6,
  },
  fullScreenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  fullScreenBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  fullScreenStats: {
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fullScreenStatCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
  },
  statCardSmall: {
    flex: 1,
    padding: 16,
  },
  fullScreenStatLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fullScreenStatValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2563eb',
  },
  batteryContainer: {
    width: '100%',
    alignItems: 'center',
  },
  batteryBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  batteryFill: {
    height: '100%',
    borderRadius: 4,
  },
  fullScreenEndButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: {width: 0, height: 8},
    elevation: 10,
  },
  fullScreenEndButtonText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ef4444',
    letterSpacing: 2,
    marginBottom: 6,
  },
  fullScreenEndButtonSubtext: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  scanButtonText: {
    fontSize: 22,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 6,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  disconnectButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectButtonText: {
    fontSize: 16,
    color: '#dc2626',
    fontWeight: '700',
  },
  mainContent: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
    borderRadius: 0,
    overflow: 'hidden',
  },
  rideInfoOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 20,
    zIndex: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 8,
  },
  readyBadgeOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  rideTimeLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
  },
  rideTime: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  rideCostLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
  },
  rideCost: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2563eb',
  },
  readyBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  readyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400e',
  },
  startRideButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    shadowColor: '#2563eb',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 10,
  },
  startRideButtonText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
    marginBottom: 4,
  },
  startRideButtonSubtext: {
    fontSize: 14,
    color: '#bfdbfe',
    fontWeight: '600',
  },
  endRideButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#ef4444',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 10,
  },
  endRideButtonText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
    marginBottom: 4,
  },
  endRideButtonSubtext: {
    fontSize: 14,
    color: '#fecaca',
    fontWeight: '600',
  },
  quickInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 2,
  },
  infoIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  bottomAction: {
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 10,
  },
  scanningIndicator: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  scanningText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalClose: {
    fontSize: 28,
    color: '#64748b',
    fontWeight: '300',
  },
  modalScanButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#2563eb',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  modalScanButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  deviceList: {
    maxHeight: 400,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  deviceCardActive: {
    borderColor: '#22c55e',
    backgroundColor: '#ecfdf5',
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceIconText: {
    fontSize: 24,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  deviceId: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  deviceCheckmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceCheckmarkText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  fullScreenMapNonRiding: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 20,
    zIndex: 10,
  },
  scanButtonFloating: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 8,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    zIndex: 10,
    alignItems: 'center',
  },
  startRideButtonFloating: {
    backgroundColor: '#2563eb',
    paddingVertical: 24,
    paddingHorizontal: 40,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 15,
    minWidth: 280,
  },
  scanningIndicatorFloating: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
  scanningTextFloating: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  cameraModal: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
  },
  cameraHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  cameraTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
  },
  cameraSubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
  },
  cameraActions: {
    gap: 16,
  },
  takePictureButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#2563eb',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
  },
  takePictureIcon: {
    fontSize: 32,
  },
  takePictureText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  skipPhotoButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  skipPhotoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  photoPreview: {
    marginTop: 30,
    alignItems: 'center',
  },
  photoPreviewLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 12,
  },
  photoImage: {
    width: 300,
    height: 225,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
  },
});

export default HomeScreen;
