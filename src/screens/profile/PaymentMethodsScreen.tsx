import { supabase } from '../../services/supabase';
import { openWhatsApp } from '../../utils/whatsapp';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
interface SavedMoneyExchangerInfo {
  officeName: string;
  officePhone: string;
  receiverName: string;
  receiverPhone: string;
  totalAmount: string;
}

const PaymentMethodsScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t } = useTranslation();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = React.useRef(true);

  // Money Exchanger saved info
  const [savedExchangerInfo, setSavedExchangerInfo] = useState<SavedMoneyExchangerInfo | null>(null);
  const [exchangerLoading, setExchangerLoading] = useState(true);
  const [editingExchanger, setEditingExchanger] = useState(false);
  const [exchangerForm, setExchangerForm] = useState<SavedMoneyExchangerInfo>({
    officeName: '',
    officePhone: '',
    receiverName: '',
    receiverPhone: '',
    totalAmount: '',
  });
  const [savingExchanger, setSavingExchanger] = useState(false);

  // Available payment methods in Iraq
  const availablePaymentMethods = [
    {
      id: 'cash_on_delivery',
      name: t('payment.methods.cod', { defaultValue: 'Cash on Delivery' }),
      description: t('payment.codDesc', { defaultValue: 'Pay when your order arrives at your door - Available now' }),
      icon: 'cash',
      iconFamily: 'material-community',
      color: '#2ECC71',
      isElectronic: false,
      isAvailable: true,
    },
    {
      id: 'money_exchanger',
      name: t('payment.methods.moneyExchanger', { defaultValue: 'Money Exchanger' }),
      description: t('payment.moneyExchangerDesc', { defaultValue: 'Pay through money exchanger service' }),
      icon: 'swap-horizontal',
      iconFamily: 'material-community',
      color: '#FF9800',
      isElectronic: false,
      isAvailable: true,
    },

  ];

  // Load saved money exchanger info from Firestore
  const loadExchangerInfo = useCallback(async () => {
    if (!user?.uid) {
      setExchangerLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('users')
        .select('money_exchanger_info')
        .eq('id', user.uid)
        .single();
        
      if (data?.money_exchanger_info) {
        setSavedExchangerInfo(data.money_exchanger_info as SavedMoneyExchangerInfo);
      }
    } catch (error) {
      // silently fail
    } finally {
      setExchangerLoading(false);
    }
  }, [user?.uid]);

  // Save money exchanger info to Firestore
  const saveExchangerInfo = async () => {
    if (!user?.uid) return;

    // Validate
    if (!exchangerForm.officeName.trim()) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('payment.exchangerOfficeNameRequired', { defaultValue: 'Please enter the exchange office name.' }));
      return;
    }
    if (!exchangerForm.officePhone.trim()) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('payment.exchangerOfficePhoneRequired', { defaultValue: 'Please enter the office phone number.' }));
      return;
    }
    if (!exchangerForm.receiverName.trim()) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('payment.exchangerReceiverNameRequired', { defaultValue: 'Please enter the receiver name.' }));
      return;
    }
    if (!exchangerForm.receiverPhone.trim()) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('payment.exchangerReceiverPhoneRequired', { defaultValue: 'Please enter the receiver phone number.' }));
      return;
    }

    setSavingExchanger(true);
    try {
      const money_exchanger_info = {
        officeName: exchangerForm.officeName.trim(),
        officePhone: exchangerForm.officePhone.trim(),
        receiverName: exchangerForm.receiverName.trim(),
        receiverPhone: exchangerForm.receiverPhone.trim(),
        totalAmount: exchangerForm.totalAmount.trim(),
      };
      
      const { error } = await supabase
        .from('users')
        .update({ money_exchanger_info })
        .eq('id', user.uid);
        
      if (error) throw error;
      setSavedExchangerInfo({ ...exchangerForm });
      setEditingExchanger(false);
      Alert.alert('✅', t('payment.exchangerSaved', { defaultValue: 'Money exchanger info saved successfully!' }));
    } catch (error) {
      Alert.alert(t('common.error', { defaultValue: 'Error' }), t('payment.exchangerSaveFailed', { defaultValue: 'Failed to save money exchanger info.' }));
    } finally {
      setSavingExchanger(false);
    }
  };

  // Load payment methods
  const loadPaymentMethods = async (showLoading = true) => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    try {
      if (showLoading) {
        setLoading(true);
      }
      // Payment methods are defined statically in availablePaymentMethods
    } catch (error) {
      Alert.alert('Error', 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  // Load on mount
  useEffect(() => {
    isMountedRef.current = true;
    loadPaymentMethods(true);
    loadExchangerInfo();
    return () => {
      isMountedRef.current = false;
    };
  }, [user?.uid]);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPaymentMethods(false), loadExchangerInfo()]);
    setRefreshing(false);
  };

  // Handle adding payment method
  const handleAddPaymentMethod = (methodType: string) => {
    const method = availablePaymentMethods.find(m => m.id === methodType);
    if (!method) return;

    if (methodType === 'cash_on_delivery') {
      Alert.alert(
        '✅ ' + t('payment.codAvailable', { defaultValue: 'Cash on Delivery Available' }),
        t('payment.codAvailableDesc', { defaultValue: 'Cash on Delivery is ready to use! You can select this secure payment option during checkout for any order.' }),
        [{ text: t('common.ok', { defaultValue: 'Got it!' }) }]
      );
      return;
    }

    if (methodType === 'money_exchanger') {
      // Open the edit form
      if (savedExchangerInfo) {
        setExchangerForm({ ...savedExchangerInfo });
      } else {
        setExchangerForm({
          officeName: '',
          officePhone: '',
          receiverName: '',
          receiverPhone: '',
          totalAmount: '',
        });
      }
      setEditingExchanger(true);
      return;
    }


  };

  // Delete exchanger info
  const handleDeleteExchangerInfo = () => {
    Alert.alert(
      t('payment.deleteExchangerTitle', { defaultValue: 'Delete Saved Info' }),
      t('payment.deleteExchangerDesc', { defaultValue: 'Are you sure you want to delete your saved money exchanger info?' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            if (!user?.uid) return;
            try {
              const { error } = await supabase
                .from('users')
                .update({ money_exchanger_info: null })
                .eq('id', user.uid);
                
              if (error) throw error;
              setSavedExchangerInfo(null);
              setEditingExchanger(false);
            } catch {
              Alert.alert(t('common.error', { defaultValue: 'Error' }), t('payment.deleteFailed', { defaultValue: 'Failed to delete.' }));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background
      }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text allowFontScaling={false} style={{ marginTop: SPACING.md, color: theme.colors.text }}>
          {t('payment.loading', { defaultValue: 'Loading payment methods...' })}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <TouchableOpacity onPress={() => {
            try {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Profile' as never);
              }
            } catch (error) {
              // Navigation error
            }
          }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={{
            fontSize: 18,
            fontWeight: '600',
            color: theme.colors.text,
            marginLeft: SPACING.md,
          }}>
            {t('payment.title', { defaultValue: 'Payment Methods' })}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
            <View style={{ padding: SPACING.md }}>
              {/* Available Payment Methods */}
              <Text allowFontScaling={false} style={{
                fontSize: 20,
                fontWeight: '600',
                color: theme.colors.text,
                marginBottom: SPACING.md,
              }}>
                {t('payment.available', { defaultValue: 'Available Payment Methods' })}
              </Text>

              <Text allowFontScaling={false} style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                marginBottom: SPACING.lg,
                lineHeight: 20,
              }}>
                {t('payment.availableDesc', { defaultValue: 'Choose from these trusted payment options available in Iraq' })}
              </Text>

              {/* Payment Methods List */}
              {availablePaymentMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  onPress={() => handleAddPaymentMethod(method.id)}
                  style={{
                    backgroundColor: method.isAvailable ? theme.colors.surface : theme.colors.disabled + '30',
                    borderRadius: 12,
                    padding: SPACING.md,
                    marginBottom: SPACING.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: method.isAvailable ? theme.colors.border : theme.colors.disabled,
                    opacity: method.isAvailable ? 1 : 0.7,
                    ...SHADOW_STYLES.small,
                  }}
                >
                  {/* Icon */}
                  <View style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: method.color + '20',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: SPACING.md,
                  }}>
                    {method.iconFamily === 'material-community' ? (
                      <MaterialCommunityIcons
                        name={method.icon as any}
                        size={24}
                        color={method.color}
                      />
                    ) : (
                      <Ionicons
                        name={method.icon as any}
                        size={24}
                        color={method.color}
                      />
                    )}
                  </View>

                  {/* Content */}
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.colors.text,
                      marginBottom: 4,
                    }}>
                      {method.name}
                    </Text>
                    <Text allowFontScaling={false} style={{
                      fontSize: 14,
                      color: theme.colors.textSecondary,
                      lineHeight: 18,
                    }}>
                      {method.description}
                    </Text>

                    {/* Status Badge */}
                    {method.isAvailable ? (
                      method.id === 'money_exchanger' && savedExchangerInfo ? (
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginTop: 6,
                        }}>
                          <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
                          <Text allowFontScaling={false} style={{
                            fontSize: 12,
                            color: theme.colors.success,
                            marginLeft: 4,
                            fontWeight: '500',
                          }}>
                            {t('payment.infoSaved', { defaultValue: 'Info Saved' })}
                          </Text>
                        </View>
                      ) : (
                        method.isElectronic && (
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 6,
                          }}>
                            <Ionicons name="shield-checkmark" size={14} color={theme.colors.success} />
                            <Text allowFontScaling={false} style={{
                              fontSize: 12,
                              color: theme.colors.success,
                              marginLeft: 4,
                              fontWeight: '500',
                            }}>
                              {t('payment.securePayment', { defaultValue: 'Secure Payment' })}
                            </Text>
                          </View>
                        )
                      )
                    ) : (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 6,
                      }}>
                        <Ionicons name="time-outline" size={14} color={theme.colors.warning} />
                        <Text allowFontScaling={false} style={{
                          fontSize: 12,
                          color: theme.colors.warning,
                          marginLeft: 4,
                          fontWeight: '600',
                        }}>
                          {t('common.comingSoon', { defaultValue: 'Coming Soon' })}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Arrow */}
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              ))}

              {/* ============ Saved Money Exchanger Card ============ */}
              {!exchangerLoading && savedExchangerInfo && !editingExchanger && (
                <View style={{
                  backgroundColor: '#FF9800' + '0D',
                  borderRadius: 16,
                  padding: SPACING.md,
                  marginTop: SPACING.sm,
                  marginBottom: SPACING.md,
                  borderWidth: 1,
                  borderColor: '#FF9800' + '30',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#FF9800' + '20',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 10,
                    }}>
                      <MaterialCommunityIcons name="swap-horizontal" size={20} color="#FF9800" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>
                        {t('payment.savedExchangerInfo', { defaultValue: 'Saved Money Exchanger' })}
                      </Text>
                      <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                        {t('payment.savedExchangerDesc', { defaultValue: 'Auto-fills at checkout' })}
                      </Text>
                    </View>
                  </View>

                  {/* Saved fields */}
                  <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    {[
                      { label: t('checkout.exchangeOfficeName', { defaultValue: 'Office Name' }), value: savedExchangerInfo.officeName },
                      { label: t('checkout.exchangeOfficePhone', { defaultValue: 'Office Phone' }), value: savedExchangerInfo.officePhone },
                      { label: t('checkout.receiverName', { defaultValue: 'Receiver Name' }), value: savedExchangerInfo.receiverName },
                      { label: t('checkout.receiverPhone', { defaultValue: 'Receiver Phone' }), value: savedExchangerInfo.receiverPhone },
                      { label: t('checkout.totalAmount', { defaultValue: 'Default Amount (USD)' }), value: savedExchangerInfo.totalAmount || '—' },
                    ].map((item, index) => (
                      <View key={index} style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 6,
                        borderBottomWidth: index < 4 ? 1 : 0,
                        borderBottomColor: theme.colors.border + '30',
                      }}>
                        <Text allowFontScaling={false} style={{ fontSize: 13, color: theme.colors.textSecondary, flex: 1 }}>
                          {item.label}
                        </Text>
                        <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text, flex: 1.2, textAlign: 'right' }}>
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setExchangerForm({ ...savedExchangerInfo });
                        setEditingExchanger(true);
                      }}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FF9800',
                        paddingVertical: 10,
                        borderRadius: 10,
                        gap: 6,
                      }}
                    >
                      <Ionicons name="create-outline" size={16} color="#fff" />
                      <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                        {t('common.edit', { defaultValue: 'Edit' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleDeleteExchangerInfo}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.colors.error + '15',
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        gap: 4,
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* ============ Edit/Add Money Exchanger Form ============ */}
              {editingExchanger && (
                <View style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  padding: SPACING.md,
                  marginTop: SPACING.sm,
                  marginBottom: SPACING.md,
                  borderWidth: 1.5,
                  borderColor: '#FF9800' + '50',
                  ...SHADOW_STYLES.medium,
                }}>
                  {/* Form Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <View style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#FF9800' + '20',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 10,
                    }}>
                      <MaterialCommunityIcons name="swap-horizontal" size={20} color="#FF9800" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>
                        {savedExchangerInfo
                          ? t('payment.editExchangerInfo', { defaultValue: 'Edit Money Exchanger' })
                          : t('payment.addExchangerInfo', { defaultValue: 'Add Money Exchanger' })
                        }
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setEditingExchanger(false)}>
                      <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Form Fields */}
                  {[
                    {
                      label: t('checkout.exchangeOfficeName', { defaultValue: 'Exchange Office Name' }),
                      placeholder: t('checkout.exchangeOfficeNamePlaceholder', { defaultValue: 'Enter office name' }),
                      key: 'officeName' as const,
                      keyboard: 'default' as const,
                      required: true,
                    },
                    {
                      label: t('checkout.exchangeOfficePhone', { defaultValue: 'Office Phone Number' }),
                      placeholder: t('checkout.exchangeOfficePhonePlaceholder', { defaultValue: 'Enter office phone' }),
                      key: 'officePhone' as const,
                      keyboard: 'phone-pad' as const,
                      required: true,
                    },
                    {
                      label: t('checkout.receiverName', { defaultValue: 'Receiver Name' }),
                      placeholder: t('checkout.receiverNamePlaceholder', { defaultValue: 'Enter receiver name' }),
                      key: 'receiverName' as const,
                      keyboard: 'default' as const,
                      required: true,
                    },
                    {
                      label: t('checkout.receiverPhone', { defaultValue: 'Receiver Phone Number' }),
                      placeholder: t('checkout.receiverPhonePlaceholder', { defaultValue: 'Enter receiver phone number' }),
                      key: 'receiverPhone' as const,
                      keyboard: 'phone-pad' as const,
                      required: true,
                    },
                    {
                      label: t('checkout.totalAmount', { defaultValue: 'Default Amount (USD)' }),
                      placeholder: t('checkout.totalAmountPlaceholder', { defaultValue: 'Enter default amount' }),
                      key: 'totalAmount' as const,
                      keyboard: 'numeric' as const,
                      required: false,
                    },
                  ].map((field) => (
                    <View key={field.key} style={{ marginBottom: 14 }}>
                      <Text allowFontScaling={false} style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: theme.colors.textSecondary,
                        marginBottom: 6,
                      }}>
                        {field.label} {field.required ? '*' : ''}
                      </Text>
                      <TextInput allowFontScaling={false}
                        style={{
                          backgroundColor: isDark ? theme.colors.background : '#F5F5F5',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 14,
                          paddingVertical: Platform.OS === 'ios' ? 12 : 0,
                          fontSize: 15,
                          color: theme.colors.text,
                          includeFontPadding: false,
                          textAlignVertical: 'center',
                          height: Platform.OS === 'ios' ? undefined : 48,
                        }}
                        value={exchangerForm[field.key]}
                        onChangeText={(text) => setExchangerForm(prev => ({ ...prev, [field.key]: text }))}
                        placeholder={field.placeholder}
                        placeholderTextColor={theme.colors.textSecondary}
                        keyboardType={field.keyboard}
                        scrollEnabled={false}
                      />
                    </View>
                  ))}

                  {/* Info note */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    backgroundColor: '#FF9800' + '10',
                    padding: 10,
                    borderRadius: 10,
                    marginBottom: 14,
                    gap: 8,
                  }}>
                    <Ionicons name="information-circle-outline" size={18} color="#FF9800" />
                    <Text allowFontScaling={false} style={{ flex: 1, fontSize: 12, color: '#FF9800', lineHeight: 18 }}>
                      {t('payment.exchangerNote', { defaultValue: 'This info will be auto-filled when you select Money Exchanger at checkout. You can always edit it there.' })}
                    </Text>
                  </View>

                  {/* Save / Cancel buttons */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setEditingExchanger(false)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text allowFontScaling={false} style={{ fontWeight: '600', color: theme.colors.textSecondary }}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveExchangerInfo}
                      disabled={savingExchanger}
                      style={{
                        flex: 2,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 12,
                        borderRadius: 12,
                        backgroundColor: '#FF9800',
                        gap: 6,
                        opacity: savingExchanger ? 0.7 : 1,
                      }}
                    >
                      {savingExchanger ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={18} color="#fff" />
                          <Text allowFontScaling={false} style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                            {t('common.save', { defaultValue: 'Save' })}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Prompt to add exchanger info if none exists */}
              {!exchangerLoading && !savedExchangerInfo && !editingExchanger && (
                <TouchableOpacity
                  onPress={() => {
                    setExchangerForm({
                      officeName: '',
                      officePhone: '',
                      receiverName: '',
                      receiverPhone: '',
                      totalAmount: '',
                    });
                    setEditingExchanger(true);
                  }}
                  style={{
                    backgroundColor: '#FF9800' + '08',
                    borderRadius: 12,
                    padding: SPACING.md,
                    marginBottom: SPACING.md,
                    borderWidth: 1,
                    borderColor: '#FF9800' + '25',
                    borderStyle: 'dashed',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="add-circle-outline" size={24} color="#FF9800" />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text allowFontScaling={false} style={{ fontSize: 14, fontWeight: '600', color: '#FF9800' }}>
                      {t('payment.saveExchangerInfo', { defaultValue: 'Save Money Exchanger Info' })}
                    </Text>
                    <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }}>
                      {t('payment.saveExchangerInfoDesc', { defaultValue: 'Save once, auto-fill every checkout' })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#FF9800" />
                </TouchableOpacity>
              )}

              {/* Info Section */}
              <View style={{
                backgroundColor: theme.colors.primary + '10',
                padding: SPACING.md,
                borderRadius: 12,
                marginTop: SPACING.lg,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle" size={20} color={theme.colors.primary} />
                  <View style={{ marginLeft: SPACING.sm, flex: 1 }}>
                    <Text allowFontScaling={false} style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: theme.colors.primary,
                      marginBottom: 8,
                    }}>
                      {t('payment.infoTitle', { defaultValue: 'Payment Information' })}
                    </Text>

                    <Text allowFontScaling={false} style={{
                      fontSize: 14,
                      color: theme.colors.primary,
                      lineHeight: 20,
                      marginBottom: 12,
                    }}>
                      • {t('payment.infoCod', { defaultValue: 'Cash on Delivery: Available for all orders ✅' })}{'\n'}
                      • {t('payment.infoExchanger', { defaultValue: 'Money Exchanger: Available for all orders ✅' })}{'\n'}

                      • {t('payment.infoSecure', { defaultValue: 'All payments are secure and protected 🔒' })}{'\n'}
                      • {t('payment.infoHelp', { defaultValue: 'Need help? Contact us via WhatsApp 📱' })}
                    </Text>

                    <TouchableOpacity
                      onPress={() => {
                        openWhatsApp('9647701279797', 'Hi, I have a question about payment methods');
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.colors.primary + '20',
                        paddingHorizontal: SPACING.sm,
                        paddingVertical: SPACING.xs,
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={16} color={theme.colors.primary} />
                      <Text allowFontScaling={false} style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: theme.colors.primary,
                        marginLeft: 4,
                      }}>
                        {t('payment.whatsAppHelp', { defaultValue: 'Need Help? WhatsApp Us' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Security Notice */}
              <View style={{
                backgroundColor: theme.colors.success + '10',
                padding: SPACING.md,
                borderRadius: 12,
                marginTop: SPACING.md,
                marginBottom: SPACING.xl,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="shield-checkmark" size={20} color={theme.colors.success} />
                  <Text allowFontScaling={false} style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: theme.colors.success,
                    marginLeft: SPACING.sm,
                  }}>
                    {t('payment.safeTitle', { defaultValue: 'Your Payments Are Safe' })}
                  </Text>
                </View>

                <Text allowFontScaling={false} style={{
                  fontSize: 14,
                  color: theme.colors.success,
                  lineHeight: 20,
                }}>
                  {t('payment.safeDesc', { defaultValue: 'We use industry-standard encryption to protect your payment information. Your financial details are never stored on our servers and are processed securely by certified payment providers.' })}
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

export default PaymentMethodsScreen;
