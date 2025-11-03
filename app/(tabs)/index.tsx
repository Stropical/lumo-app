import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, Text, View, TouchableOpacity, FlatList, Platform, PermissionsAndroid, StyleSheet, Alert, Modal, Animated, Easing, LayoutAnimation, UIManager, StatusBar, ActivityIndicator} from 'react-native';
import {BleManager, Device, State} from 'react-native-ble-plx';
import {Buffer} from 'buffer';
import GeofenceMap from '@/components/geofence-map';
import { useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Match these to the firmware UUIDs
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab'.toLowerCase();
const CHAR_UUID = 'abcdefab-1234-1234-1234-abcdefabcdef'.toLowerCase();

const PRIMARY_FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'Roboto',
  default: 'System',
});

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
  const [, setBikePhoto] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Loading indicator between screens
  const [showRideSummary, setShowRideSummary] = useState(false);
  const [rideSummaryData, setRideSummaryData] = useState<{duration: number; distance: number; cost: number} | null>(null);
  const [turboActive, setTurboActive] = useState(false);
  const [turboPurchased, setTurboPurchased] = useState(false);
  const [showTurboNotification, setShowTurboNotification] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const turboStatusAnim = useRef(new Animated.Value(0)).current;
  const turboNotificationAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    Animated.timing(turboStatusAnim, {
      toValue: turboActive ? 1 : 0,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [turboActive, turboStatusAnim]);

  useEffect(() => {
    if (!turboActive) {
      turboNotificationAnim.stopAnimation();
      turboNotificationAnim.setValue(0);
      setShowTurboNotification(false);
    }
  }, [turboActive, turboNotificationAnim]);

  // Ride timer and stats simulator
  useEffect(() => {
    let interval: any;
    if (bikeState === 'RIDING') {
      interval = setInterval(() => {
        setRideTime(prev => {
          const newTime = prev + 1;
          const unlockCost = 1.0;
          const perMinuteRate = 0.15;
          const turboCost = turboPurchased ? 1.0 : 0;

          setRideCost(unlockCost + (newTime / 60) * perMinuteRate + turboCost);
          
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
      setTurboActive(false);
      setTurboPurchased(false);
    }
    return () => clearInterval(interval);
  }, [bikeState, turboPurchased]);

  // Reset summary data and Turbo state whenever a fresh ride kicks off.
  // This runs only when the bike state itself changes into RIDING so
  // manually activating Turbo mid-ride is unaffected.
  useEffect(() => {
    if (bikeState === 'RIDING') {
      setRideSummaryData(null);
      setTurboActive(false);
      setTurboPurchased(false);
    }
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
    setIsLoading(true);
    
    // Check if this is the dev bike
    if (device.id === DEV_BIKE_DEVICE.id) {
      try {
        setConnectionState('connecting');
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        setConnectedDevice(device);
        setConnectionState('connected');
        setIsDevMode(true);
        console.log('Connected to Dev Bike (simulator mode)');
        
        // Auto-start ride after connection
        setTimeout(async () => {
          try {
            await sendCommand('A'); // Activate
            await new Promise(resolve => setTimeout(resolve, 500));
            await sendCommand('S'); // Start riding
          } catch (e) {
            console.warn('Dev bike auto-start error', e);
            Alert.alert(
              'Error',
              'Failed to start ride. Please try again.',
              [{ text: 'OK' }]
            );
          } finally {
            setIsLoading(false);
          }
        }, 500);
        
        return;
      } catch (e) {
        console.warn('Dev bike connection error', e);
        setConnectionState('disconnected');
        setConnectedDevice(null);
        setIsLoading(false);
        Alert.alert(
          'Connection Failed',
          'Failed to connect to Dev Bike. Please try again.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    // Regular BLE connection for real devices
    const manager = managerRef.current;
    if (!manager) {
      setIsLoading(false);
      Alert.alert(
        'Bluetooth Error',
        'Bluetooth manager is not initialized. Please restart the app.',
        [{ text: 'OK' }]
      );
      return;
    }

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
        } finally {
          setIsLoading(false);
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
      setIsLoading(false);
      
      // Show error alert to user
      Alert.alert(
        'Connection Failed',
        'Unable to connect to the bike. Please make sure the bike is powered on and try again.',
        [{ text: 'OK' }]
      );
    }
  }

  async function sendCommand(command: string) {
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

    // Real BLE - require connection
    if (!connectedDevice || connectionState !== 'connected') {
      throw new Error('Not connected');
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
        // Photo captured successfully - complete the ride
        await completeRideEnd();
      } else {
        // User canceled - ask if they still want to end ride
        Alert.alert(
          'Photo Required',
          'A photo of the bike is required to end your ride. Please take a photo or continue riding.',
          [
            { text: 'Take Photo', onPress: () => takeBikePhoto() },
            { text: 'Continue Riding', style: 'cancel' }
          ]
        );
      }
    } catch (e: any) {
      console.error('Camera error:', e);
      console.error('Error details:', e.message, e.stack);
      Alert.alert(
        'Camera Error',
        `Failed to open camera: ${e.message || 'Unknown error'}. Make sure you've run "npx expo prebuild" and are testing on a device (not Expo Go).`,
        [{ text: 'OK' }]
      );
    }
  };

  const completeRideEnd = async () => {
    setIsProcessing(true);
    setIsLoading(true);
    
    try {
      // Send stop commands (works for both dev and real bikes)
      await sendCommand('T');
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendCommand('D');
      
      // Small delay for smooth transition
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setShowRideDetails(false);
      setRideSummaryData({
        duration: rideTime,
        distance,
        cost: rideCost,
      });
      turboNotificationAnim.stopAnimation();
      turboNotificationAnim.setValue(0);
      setShowTurboNotification(false);
      
      // Disconnect and reset
      setConnectedDevice(null);
      setConnectionState('disconnected');
      setIsDevMode(false);
      setBikeState('INACTIVE');
      setBatteryLevel(85); // Reset battery for next ride
      setBikePhoto(null); // Clear photo for next ride
      setTurboActive(false); // Deactivate turbo for next session
      setTurboPurchased(false);

      // Show ride summary modal
      setShowRideSummary(true);
    } catch (e) {
      console.warn('End ride error', e);
      Alert.alert('Error', 'Failed to end ride. Please try again.');
    } finally {
      setIsProcessing(false);
      setIsLoading(false);
    }
  };

  const handleEndRide = async () => {
    if (isProcessing) return;
    
    // In dev mode, offer option to skip camera for testing
    if (isDevMode) {
      Alert.alert(
        'End Ride',
        'Take a photo of the bike to complete your ride',
        [
          { text: 'Take Photo', onPress: () => takeBikePhoto() },
          { text: 'Skip (Dev Mode)', onPress: () => completeRideEnd(), style: 'cancel' }
        ]
      );
    } else {
      await takeBikePhoto();
    }
  };

  const batteryColor = batteryLevel > 50 ? '#22c55e' : batteryLevel > 20 ? '#f97316' : '#ef4444';
  const batteryStatusText = batteryLevel > 50 ? 'Range looks good' : batteryLevel > 20 ? 'Plan to dock soon' : 'Charge immediately';
  const turboGlowOpacity = turboStatusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });
  const summaryDuration = rideSummaryData?.duration ?? rideTime;
  const summaryDistance = rideSummaryData?.distance ?? distance;
  const summaryCost = rideSummaryData?.cost ?? rideCost;

  const submitProblemReport = (reason: string) => {
    console.log('Problem reported:', reason);
    Alert.alert('Thanks for the feedback', 'Our team has been notified and will look into this.', [{text: 'Close'}]);
  };

  const triggerTurboNotification = () => {
    turboNotificationAnim.stopAnimation();
    setShowTurboNotification(true);
    turboNotificationAnim.setValue(0);
    Animated.sequence([
      Animated.spring(turboNotificationAnim, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.delay(1600),
      Animated.timing(turboNotificationAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setShowTurboNotification(false));
  };

  const handleReportProblem = () => {
    Alert.alert(
      'Report a problem',
      'Select the issue you encountered',
      [
        { text: 'Bike malfunction', onPress: () => submitProblemReport('Bike malfunction') },
        { text: 'Parking issue', onPress: () => submitProblemReport('Parking issue') },
        { text: 'Other', onPress: () => submitProblemReport('Other') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleBuyTurbo = () => {
    // Prevent re-activating if already active
    if (turboActive) return;

    // Add $1 turbo fee to the ride cost
    setRideCost(prev => prev + 1.00);
    setTurboPurchased(true);

    // Activate turbo in-place without leaving the ride
    setTurboActive(true);
    // Don't change the bike state if the user is currently riding.
    // Previously this forced the bike state to 'ACTIVATED' which caused the
    // component to re-render the non-riding UI and send users back to home.
    if (bikeState !== 'RIDING') {
      setBikeState('ACTIVATED');
    }
    triggerTurboNotification();
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
            {/* Gradient overlay - 100% opacity; blue or orange based on turbo */}
            <LinearGradient
              colors={turboActive ? ['#ea580c', '#f97316', '#fb923c'] : ['#1e40af', '#2563eb', '#3b82f6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mapOverlay}
            />
          </View>

          {/* Ride info overlay */}
          <View style={styles.fullScreenOverlay}>
            <View style={styles.rideHeader}>
              <View>
                <Text style={styles.rideStatusLabel}>ACTIVE RIDE</Text>
                <Text style={styles.rideDeviceName}>
                  {getDeviceLabel(connectedDevice!)}
                  {isDevMode && ' · DEV MODE'}
                </Text>
              </View>
              <View style={styles.rideIndicator}>
                <View style={styles.rideIndicatorDot} />
                <Text style={styles.rideIndicatorText}>
                  {connectionState === 'connected' ? 'Connected' : 'Connecting'}
                </Text>
              </View>
            </View>

            <View style={styles.fullScreenStats}>
              <View style={styles.metricHighlight}>
                <Text style={styles.metricHighlightLabel}>Duration</Text>
                <Text style={styles.metricHighlightValue}>{formatTime(rideTime)}</Text>
                <Text style={styles.metricHighlightMeta}>Timer runs while the bike is moving</Text>
              </View>

              <View style={styles.metricRow}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Cost</Text>
                  <Text style={styles.metricValue}>${rideCost.toFixed(2)}</Text>
                  <Text style={styles.metricMeta}>Charged after ride</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Distance</Text>
                  <Text style={styles.metricValue}>{distance.toFixed(2)}</Text>
                  <Text style={styles.metricMeta}>miles travelled</Text>
                </View>
              </View>

              <View style={styles.metricCardWide}>
                <View style={styles.metricCardHeader}>
                  <Text style={styles.metricLabel}>Battery</Text>
                  <Text style={[styles.metricValue, styles.metricValueCompact, { color: batteryColor }]}>
                    {Math.round(batteryLevel)}%
                  </Text>
                </View>
                <View style={styles.batteryTrack}>
                  <View style={[styles.batteryTrackFill, { width: `${batteryLevel}%`, backgroundColor: batteryColor }]} />
                </View>
                <Text style={styles.metricMeta}>{batteryStatusText}</Text>
              </View>
            </View>

          {showTurboNotification && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.turboNotification,
                {
                  opacity: turboNotificationAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 1],
                  }),
                  transform: [
                    {
                      translateY: turboNotificationAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                    },
                    {
                      scale: turboNotificationAnim.interpolate({
                        inputRange: [0, 0.75, 1],
                        outputRange: [0.6, 1.05, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.turboNotificationGlow} />
              <View style={styles.turboNotificationBadge}>
                <Text style={styles.turboNotificationBadgeText}>⚡️</Text>
              </View>
              <View>
                <Text style={styles.turboNotificationTitle}>Turbo engaged</Text>
                <Text style={styles.turboNotificationSubtitle}>Hold tight for extra power</Text>
              </View>
            </Animated.View>
          )}

          <TouchableOpacity
            style={[styles.turboButton, turboActive && styles.turboButtonActive]}
            onPress={handleBuyTurbo}
            activeOpacity={0.9}
            disabled={turboActive}
          >
            <LinearGradient
              colors={turboActive ? ['#ea580c', '#f97316', '#fb923c'] : ['#1e40af', '#2563eb', '#3b82f6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.turboButtonContent,
                {
                  shadowColor: turboActive ? '#fb923c' : '#2563eb',
                  borderColor: turboActive ? 'rgba(255,255,255,0.12)' : 'rgba(59, 130, 246, 0.25)',
                },
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.turboButtonGlow,
                  {
                    opacity: turboGlowOpacity,
                  },
                ]}
              />
              <View style={styles.turboIconWrapper}>
                <Text style={styles.turboIcon}>🔥</Text>
              </View>
              <View style={styles.turboTextBlock}>
                <Text style={styles.turboTitle}>{turboActive ? 'TURBO ACTIVATED' : 'Buy Turbo Mode'}</Text>
                <Text style={styles.turboSubtitle}>{turboActive ? 'Activated for this ride' : '$1 instant boost for this ride'}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.endRideButton, isProcessing && styles.buttonDisabled]}
              onPress={handleEndRide}
              activeOpacity={0.85}
              disabled={isProcessing}
            >
              <Text style={styles.endRideButtonText}>
                {isProcessing ? 'ENDING RIDE' : 'END RIDE'}
              </Text>
              <Text style={styles.endRideButtonSubtext}>
                {isProcessing ? 'Finishing up...' : 'Lock bike and finish session'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportButton}
              onPress={handleReportProblem}
              activeOpacity={0.85}
            >
              <Text style={styles.reportButtonText}>Report a problem</Text>
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

      {/* Floating START RIDE button */}
      <View style={styles.floatingButtonContainer}>
  <Animated.View style={{ transform: [{ scale: scaleAnim }], width: '100%' }}>
          <TouchableOpacity 
            onPress={handleStartRide}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#1e40af', '#2563eb', '#3b82f6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.startRideButtonFloating}
            >
              <Text style={styles.startRideButtonText}>
                START RIDE
              </Text>
              <Text style={styles.startRideButtonSubtext}>
                Select a bike to begin
              </Text>
            </LinearGradient>
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

            {isScanning && (
              <View style={styles.modalScanIndicator}>
                <Text style={styles.modalScanIndicatorText}>🔍 Scanning for bikes...</Text>
              </View>
            )}

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

      {/* Loading overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>
              {isProcessing ? 'Ending ride...' : 'Connecting...'}
            </Text>
          </View>
        </View>
      )}
    
      {/* Ride summary modal */}
      <Modal
        visible={showRideSummary}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRideSummary(false)}
      >
        <View style={styles.summaryOverlay}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Ride summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Duration</Text>
              <Text style={styles.summaryValue}>{formatTime(summaryDuration)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={styles.summaryValue}>{summaryDistance.toFixed(2)} mi</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cost</Text>
              <Text style={styles.summaryValue}>${summaryCost.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowRideSummary(false)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1e40af', '#2563eb', '#3b82f6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryClose}
              >
                <Text style={styles.summaryCloseText}>Done</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
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
    // No backgroundColor - using LinearGradient component at 100% opacity
  },
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.45)',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: Platform.OS === 'ios' ? 40 : 30,
    paddingHorizontal: 20,
  },
  fullScreenStats: {
    flex: 1,
    gap: 20,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  rideStatusLabel: {
    fontFamily: PRIMARY_FONT,
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(241, 245, 249, 0.85)',
    textTransform: 'uppercase',
  },
  rideDeviceName: {
    fontFamily: PRIMARY_FONT,
    fontSize: 28,
    fontWeight: '600',
    color: '#f8fafc',
    marginTop: 6,
  },
  rideIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  rideIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  rideIndicatorText: {
    fontFamily: PRIMARY_FONT,
    fontSize: 13,
    color: 'rgba(248, 250, 252, 0.92)',
    marginLeft: 8,
  },
  metricHighlight: {
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
  },
  metricHighlightLabel: {
    fontFamily: PRIMARY_FONT,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(226, 232, 240, 0.78)',
    marginBottom: 6,
  },
  metricHighlightValue: {
    fontFamily: PRIMARY_FONT,
    fontSize: 44,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  metricHighlightMeta: {
    fontFamily: PRIMARY_FONT,
    fontSize: 13,
    color: 'rgba(226, 232, 240, 0.8)',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(76, 106, 198, 0.28)',
  },
  metricLabel: {
    fontFamily: PRIMARY_FONT,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(224, 231, 255, 0.82)',
    marginBottom: 6,
  },
  metricValue: {
    fontFamily: PRIMARY_FONT,
    fontSize: 30,
    fontWeight: '700',
    color: '#f8fafc',
  },
  metricValueCompact: {
    fontSize: 26,
  },
  metricMeta: {
    fontFamily: PRIMARY_FONT,
    fontSize: 12,
    color: 'rgba(226, 232, 240, 0.75)',
    marginTop: 8,
  },
  metricCardWide: {
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(76, 106, 198, 0.28)',
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  batteryTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
  },
  batteryTrackFill: {
    height: '100%',
    borderRadius: 3,
  },
  turboButton: {
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  turboButtonActive: {
    // Slight visual tweak when active
    opacity: 0.95,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  turboButtonContent: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 18,
    shadowColor: '#2563eb',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  turboButtonGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  turboIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  turboIcon: {
    fontSize: 26,
  },
  turboTextBlock: {
    flex: 1,
  },
  turboTitle: {
    fontFamily: PRIMARY_FONT,
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  turboSubtitle: {
    fontFamily: PRIMARY_FONT,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  endRideButton: {
    marginTop: 24,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 28,
  },
  endRideButtonText: {
    fontFamily: PRIMARY_FONT,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  endRideButtonSubtext: {
    fontFamily: PRIMARY_FONT,
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 4,
  },
  reportButton: {
    marginTop: 16,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  reportButtonText: {
    fontFamily: PRIMARY_FONT,
    fontSize: 14,
    color: '#cbd5f5',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  modalScanIndicator: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  modalScanIndicatorText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
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
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    zIndex: 10,
  },
  startRideButtonFloating: {
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 8},
    elevation: 12,
    width: '100%',
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 10},
    elevation: 10,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  summaryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  summaryCard: {
    width: '86%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2ff',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  summaryClose: {
    marginTop: 18,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  summaryCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  turboNotification: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 92 : 70,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    shadowColor: '#0ea5e9',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    zIndex: 99999,
    overflow: 'hidden',
  },
  turboNotificationGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14, 165, 233, 0.16)',
    opacity: 0.7,
  },
  turboNotificationBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 64, 175, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.65)',
  },
  turboNotificationBadgeText: {
    fontSize: 24,
  },
  turboNotificationTitle: {
    fontFamily: PRIMARY_FONT,
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  turboNotificationSubtitle: {
    fontFamily: PRIMARY_FONT,
    color: 'rgba(226, 232, 240, 0.8)',
    fontSize: 13,
    marginTop: 2,
  },
});

export default HomeScreen;
