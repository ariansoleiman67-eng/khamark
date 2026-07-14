import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../components/ThemeProvider';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/AppText';
import Button from '../../components/Button';

/**
 * LoginGateScreen - Intent-Based Authentication Gate
 * 
 * This screen explains WHY login is needed before proceeding.
 * Uses GOLDEN TEMPLATE structure for layout safety.
 * 
 * Shown when user attempts to:
 * - Checkout
 * - View Orders
 * - Message Seller
 * - Save Address/Payment
 */

type LoginGateReason = 'checkout' | 'orders' | 'message' | 'address' | 'payment' | 'profile';

interface LoginGateParams {
  reason?: LoginGateReason;
}

const getReasonContent = (reason?: LoginGateReason) => {
  switch (reason) {
    case 'checkout':
      return {
        icon: 'cart-outline' as const,
        title: 'Sign in to Checkout',
        description: 'Create an account or sign in to complete your purchase and track your order.',
      };
    case 'orders':
      return {
        icon: 'receipt-outline' as const,
        title: 'Sign in to View Orders',
        description: 'Sign in to see your order history and track current deliveries.',
      };
    case 'message':
      return {
        icon: 'chatbubble-outline' as const,
        title: 'Sign in to Message',
        description: 'Sign in to contact sellers and get answers to your questions.',
      };
    case 'address':
      return {
        icon: 'location-outline' as const,
        title: 'Sign in to Save Address',
        description: 'Sign in to save your delivery addresses for faster checkout.',
      };
    case 'payment':
      return {
        icon: 'card-outline' as const,
        title: 'Sign in to Save Payment',
        description: 'Sign in to securely save your payment methods.',
      };
    case 'profile':
      return {
        icon: 'person-outline' as const,
        title: 'Sign in to Access Profile',
        description: 'Sign in to manage your account settings and preferences.',
      };
    default:
      return {
        icon: 'lock-closed-outline' as const,
        title: 'Sign in Required',
        description: 'Please sign in to continue with this action.',
      };
  }
};

const LoginGateScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: LoginGateParams }, 'params'>>();
  const insets = useSafeAreaInsets();

  const reason = route.params?.reason;
  const content = getReasonContent(reason);

  const handleSignIn = () => {
    // Navigate to Login with requireAuth flag
    // This prevents "Continue as Guest" from showing
    navigation.navigate('SignIn', { requireAuth: true, returnReason: reason });
  };

  const handleCreateAccount = () => {
    navigation.navigate('Register', { requireAuth: true, returnReason: reason });
  };

  const handleBackToBrowsing = () => {
    navigation.goBack();
  };

  return (
    // GOLDEN TEMPLATE: edges excludes 'bottom' - handled by ScrollView paddingBottom
    <SafeAreaView 
      style={[styles.container, { backgroundColor: theme.colors.background }]} 
      edges={['top', 'left', 'right']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primaryDark]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <ScrollView 
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 40 + insets.bottom }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            scrollEnabled={true}
            bounces={Platform.OS === 'ios'}
          >
            {/* Back Button */}
            <TouchableOpacity 
              style={styles.backButton}
              onPress={handleBackToBrowsing}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Ionicons 
                  name={content.icon} 
                  size={64} 
                  color={theme.colors.primary} 
                />
              </View>
            </View>

            {/* Title */}
            <AppText style={styles.title}>
              {content.title}
            </AppText>

            {/* Description */}
            <AppText style={styles.description}>
              {content.description}
            </AppText>

            {/* Action Container */}
            <View style={[styles.actionContainer, { backgroundColor: theme.colors.surface }]}>
              {/* Primary: Sign In */}
              <Button
                title="Sign In"
                onPress={handleSignIn}
                fullWidth
                style={styles.primaryButton}
              />

              {/* Secondary: Create Account */}
              <Button
                title="Create Account"
                onPress={handleCreateAccount}
                fullWidth
                style={styles.secondaryButton}
              />

              {/* Tertiary: Back to Browsing */}
              <TouchableOpacity 
                onPress={handleBackToBrowsing}
                style={styles.tertiaryButton}
                activeOpacity={0.7}
              >
                <AppText 
                  style={[styles.tertiaryText, { color: theme.colors.textSecondary }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  Back to Browsing
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Benefits */}
            <View style={styles.benefitsContainer}>
              <AppText style={styles.benefitsTitle}>
                Why create an account?
              </AppText>
              <View style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <AppText style={styles.benefitText}>
                  Track your orders in real-time
                </AppText>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <AppText style={styles.benefitText}>
                  Save addresses for faster checkout
                </AppText>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <AppText style={styles.benefitText}>
                  Access exclusive deals and offers
                </AppText>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  /**
   * SAMSUNG TEXT CLIPPING FIX (LOCKED):
   * - flexGrow: 1 allows vertical expansion
   * - NO minHeight (causes clipping on small screens)
   * - Natural top-down flow
   */
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginBottom: 40,
    width: 44,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 60,
    elevation: 8,
    height: 120,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    width: 120,
  },
  /**
   * SAMSUNG TEXT CLIPPING FIX (LOCKED):
   * - lineHeight prevents top/bottom clipping
   */
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 36, // 🔑 CRITICAL: prevents clipping
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 40,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  actionContainer: {
    borderRadius: 20,
    marginBottom: 32,
    padding: 24,
  },
  primaryButton: {
    marginBottom: 12,
  },
  secondaryButton: {
    marginBottom: 16,
  },
  tertiaryButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  tertiaryText: {
    fontSize: 15,
    lineHeight: 22, // 🔑 prevents clipping
  },
  benefitsContainer: {
    paddingHorizontal: 8,
  },
  /**
   * SAMSUNG TEXT CLIPPING FIX (LOCKED):
   * - lineHeight on text prevents clipping
   */
  benefitsTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24, // 🔑 prevents clipping
    marginBottom: 16,
    textAlign: 'center',
  },
  /**
   * SAMSUNG TEXT CLIPPING FIX (LOCKED):
   * - alignItems: 'flex-start' allows multiline text expansion
   * - NOT 'center' (causes clipping on large fonts)
   */
  benefitRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  benefitText: {
    color: 'rgba(255, 255, 255, 0.85)',
    flex: 1,
    fontSize: 14,
    lineHeight: 20, // 🔑 prevents clipping
  },
});

export default LoginGateScreen;
