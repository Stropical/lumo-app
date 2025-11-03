import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, Text, View, TouchableOpacity, FlatList, Platform, PermissionsAndroid, StyleSheet} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import {Buffer} from 'buffer';

// Match these to the firmware UUIDs
const SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab'.toLowerCase();
const CHAR_UUID = 'abcdefab-1234-1234-1234-abcdefabcdef'.toLowerCase();

export default function App() {
  const managerRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState({});
  const [connected, setConnected] = useState(null);

  useEffect(() => {
    managerRef.current = new BleManager();
    return () => {
      const mgr = managerRef.current;
      if (mgr) {
        mgr.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  async function requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        const perms = [];
        // On Android 12+ need BLUETOOTH_SCAN / BLUETOOTH_CONNECT
        perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN) perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);

        const granted = await PermissionsAndroid.requestMultiple(perms);
        // You can check granted[...] if you want
      } catch (e) {
        console.warn('Permission error', e);
      }
    }
  }

  function startScan() {
    requestPermissions();
    const manager = managerRef.current;
    if (!manager) return;

    setDevices({});
    setIsScanning(true);

    manager.startDeviceScan([SERVICE_UUID], {allowDuplicates: false}, (error, device) => {
      if (error) {
        console.warn('Scan error', error);
        setIsScanning(false);
        return;
      }
      if (!device || !device.id) return;
      setDevices(prev => ({...prev, [device.id]: device}));
    });

    // stop after 8s
    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 8000);
  }

  async function connect(device) {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      const connectedDevice = await manager.connectToDevice(device.id);
      await connectedDevice.discoverAllServicesAndCharacteristics();
      setConnected(connectedDevice);
      console.log('Connected to', connectedDevice.id);
    } catch (e) {
      console.warn('Connect error', e);
    }
  }

  async function writeToggle(value) {
    if (!connected) {
      console.warn('No device connected');
      return;
    }
    try {
      const base64 = Buffer.from(value).toString('base64');
      await managerRef.current.writeCharacteristicWithResponseForDevice(
        connected.id,
        SERVICE_UUID,
        CHAR_UUID,
        base64
      );
      console.log('Wrote', value);
    } catch (e) {
      console.warn('Write error', e);
    }
  }

  const deviceArray = Object.values(devices);
  console.log(deviceArray)

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.scanButton} onPress={startScan}>
        <Text style={styles.scanText}>{isScanning ? 'Scanning...' : 'Scan for LumoDevice'}</Text>
      </TouchableOpacity>

      <FlatList
        data={deviceArray}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => (
          <TouchableOpacity style={styles.deviceItem} onPress={() => connect(item)}>
            <Text style={styles.deviceName}>{item.name ?? 'Unknown'}</Text>
            <Text style={styles.deviceId}>{item.id}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{padding: 16}}>No devices found</Text>}
      />

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.controlBtn, {backgroundColor: connected ? '#28a745' : '#aaa'}]} onPress={() => writeToggle('1')}>
          <Text style={styles.controlText}>Turn ON</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlBtn, {backgroundColor: connected ? '#dc3545' : '#aaa'}]} onPress={() => writeToggle('0')}>
          <Text style={styles.controlText}>Turn OFF</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16},
  scanButton: {padding: 12, backgroundColor: '#007AFF', borderRadius: 8, marginBottom: 12},
  scanText: {color: 'white', textAlign: 'center', fontWeight: '600'},
  deviceItem: {padding: 12, borderBottomWidth: 1, borderColor: '#eee'},
  deviceName: {fontWeight: '600'},
  deviceId: {color: '#666', fontSize: 12},
  controls: {flexDirection: 'row', justifyContent: 'space-around', marginTop: 16},
  controlBtn: {paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8},
  controlText: {color: 'white', fontWeight: '600'},
});
