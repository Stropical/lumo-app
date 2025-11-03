import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

interface Transaction {
  id: string;
  type: 'ride' | 'topup' | 'refund';
  amount: number;
  date: Date;
  description: string;
}

export default function FundsScreen() {
  const [balance, setBalance] = useState(25.50);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  
  const [transactions] = useState<Transaction[]>([
    {
      id: '1',
      type: 'topup',
      amount: 20.00,
      date: new Date('2025-11-01T10:30:00'),
      description: 'Added funds',
    },
    {
      id: '2',
      type: 'ride',
      amount: -3.50,
      date: new Date('2025-11-01T14:15:00'),
      description: 'Ride to Valley Library (15 min)',
    },
    {
      id: '3',
      type: 'ride',
      amount: -2.00,
      date: new Date('2025-11-02T09:20:00'),
      description: 'Ride to Memorial Union (8 min)',
    },
    {
      id: '4',
      type: 'topup',
      amount: 15.00,
      date: new Date('2025-11-02T09:25:00'),
      description: 'Added funds',
    },
    {
      id: '5',
      type: 'ride',
      amount: -4.00,
      date: new Date('2025-11-02T16:45:00'),
      description: 'Ride to Reser Stadium (18 min)',
    },
  ]);

  const quickAddAmounts = [5, 10, 20, 50];

  const handleAddFunds = (amount: number) => {
    setBalance(prev => prev + amount);
    setShowAddFunds(false);
    setAddAmount('');
    Alert.alert('Success', `$${amount.toFixed(2)} added to your account!`);
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return 'Today at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (hours < 48) {
      return 'Yesterday at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + 
             ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'topup': return '💳';
      case 'ride': return '🚴';
      case 'refund': return '↩️';
      default: return '•';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account Balance</Text>
        </View>

        {/* Balance Card */}
        <LinearGradient
          colors={['#1e40af', '#2563eb', '#3b82f6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>${balance.toFixed(2)}</Text>
          <View style={styles.balanceInfo}>
            <View style={styles.balanceInfoItem}>
              <Text style={styles.balanceInfoLabel}>Unlock Fee</Text>
              <Text style={styles.balanceInfoValue}>$1.00</Text>
            </View>
            <View style={styles.balanceInfoDivider} />
            <View style={styles.balanceInfoItem}>
              <Text style={styles.balanceInfoLabel}>Per Minute</Text>
              <Text style={styles.balanceInfoValue}>$0.15</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.addFundsButton}
            onPress={() => setShowAddFunds(true)}
          >
            <Text style={styles.addFundsButtonText}>+ Add Funds</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* Estimated Ride Time */}
        <View style={styles.estimateCard}>
          <Text style={styles.estimateTitle}>💡 Estimated Ride Time</Text>
          <Text style={styles.estimateText}>
            With your current balance, you can ride for approximately{' '}
            <Text style={styles.estimateHighlight}>
              {Math.floor((balance - 1) / 0.15)} minutes
            </Text>
          </Text>
        </View>

        {/* Transaction History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {transactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionItem}>
              <View style={styles.transactionIcon}>
                <Text style={styles.transactionIconText}>
                  {getTransactionIcon(transaction.type)}
                </Text>
              </View>
              <View style={styles.transactionDetails}>
                <Text style={styles.transactionDescription}>
                  {transaction.description}
                </Text>
                <Text style={styles.transactionDate}>
                  {formatDate(transaction.date)}
                </Text>
              </View>
              <Text style={[
                styles.transactionAmount,
                transaction.amount > 0 ? styles.transactionAmountPositive : styles.transactionAmountNegative
              ]}>
                {transaction.amount > 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Low Balance Warning */}
        {balance < 5 && (
          <View style={styles.warningCard}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Low Balance</Text>
              <Text style={styles.warningText}>
                Your balance is running low. Add funds to continue riding.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add Funds Modal */}
      <Modal
        visible={showAddFunds}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddFunds(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Funds</Text>
              <TouchableOpacity onPress={() => setShowAddFunds(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Select an amount</Text>
            <View style={styles.quickAmounts}>
              {quickAddAmounts.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.quickAmountButton}
                  onPress={() => handleAddFunds(amount)}
                >
                  <Text style={styles.quickAmountText}>${amount}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalSubtitle}>Or enter custom amount</Text>
            <View style={styles.customAmountContainer}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.customAmountInput}
                value={addAmount}
                onChangeText={setAddAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <TouchableOpacity
              onPress={() => {
                const amount = parseFloat(addAmount);
                if (amount && amount > 0) {
                  handleAddFunds(amount);
                } else {
                  Alert.alert('Invalid Amount', 'Please enter a valid amount.');
                }
              }}
              disabled={!addAmount}
            >
              <LinearGradient
                colors={!addAmount ? ['#cbd5e1', '#cbd5e1'] : ['#1e40af', '#2563eb', '#3b82f6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.confirmButton}
              >
                <Text style={styles.confirmButtonText}>
                  Add {addAmount ? `$${parseFloat(addAmount).toFixed(2)}` : 'Funds'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.modalFooter}>
              Payment will be processed securely
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  balanceCard: {
    margin: 16,
    padding: 24,
    borderRadius: 20,
    shadowColor: '#2563eb',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  balanceLabel: {
    color: '#bfdbfe',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '700',
    marginBottom: 20,
  },
  balanceInfo: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  balanceInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceInfoDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  balanceInfoLabel: {
    color: '#bfdbfe',
    fontSize: 12,
    marginBottom: 4,
  },
  balanceInfoValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  addFundsButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  addFundsButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '700',
  },
  estimateCard: {
    backgroundColor: '#fef3c7',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  estimateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 6,
  },
  estimateText: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 20,
  },
  estimateHighlight: {
    fontWeight: '700',
    color: '#92400e',
  },
  section: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 20,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#64748b',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  transactionAmountPositive: {
    color: '#22c55e',
  },
  transactionAmountNegative: {
    color: '#64748b',
  },
  warningCard: {
    backgroundColor: '#fef2f2',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 16,
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
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalClose: {
    fontSize: 24,
    color: '#64748b',
    fontWeight: '400',
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  quickAmountButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  quickAmountText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
  },
  customAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  dollarSign: {
    fontSize: 24,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 8,
  },
  customAmountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    paddingVertical: 16,
  },
  confirmButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalFooter: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94a3b8',
  },
});
