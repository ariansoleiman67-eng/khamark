/**
 * QiCardPaymentScreen
 * 
 * Full-screen WebView that loads the QiCard payment form (formUrl).
 * The user enters their card details and completes 3DS authentication
 * directly in QiCard's hosted payment page.
 * 
 * After payment completion, QiCard redirects to our finishPaymentUrl
 * (khamark://payment-complete), which the WebView intercepts. We then
 * poll for the payment status and navigate accordingly.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../components/ThemeProvider';
import { RootStackParamList } from '../types';
import { QiCardPaymentService } from '../services/qiCardPaymentService';
import { OrderService } from '../services/OrderService';
import { useCart } from '../contexts/CartContext';

// Best-effort: hide the language switcher on QiCard's hosted page. Language is
// already forced from the app locale, so the switcher is redundant. Cosmetic
// only (display:none) — it cannot affect the payment flow.
const HIDE_LANG_SWITCHER_JS = `
(function(){
  function hideLang(){
    try{
      var names=['english','arabic','العربية','kurdish','کوردی','عربي'];
      document.querySelectorAll('select').forEach(function(el){ el.style.display='none'; });
      document.querySelectorAll('[class*="lang" i],[class*="locale" i],[id*="lang" i],[aria-label*="language" i]').forEach(function(el){ el.style.display='none'; });
      document.querySelectorAll('button,a,div,span').forEach(function(el){
        var t=(el.textContent||'').trim().toLowerCase();
        if(t.length<=10 && names.indexOf(t)>-1 && el.children.length<=2){
          var box=el.closest('[class*="select" i],[class*="dropdown" i],[class*="switch" i]')||el;
          if(box&&box.style) box.style.display='none';
        }
      });
    }catch(e){}
  }
  hideLang();
  try{ new MutationObserver(hideLang).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  var n=0, iv=setInterval(function(){ hideLang(); if(++n>25) clearInterval(iv); }, 600);
})(); true;
`;

type QiCardPaymentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'QiCardPayment'>;
type QiCardPaymentScreenRouteProp = RouteProp<RootStackParamList, 'QiCardPayment'>;

const QiCardPaymentScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<QiCardPaymentScreenNavigationProp>();
  const route = useRoute<QiCardPaymentScreenRouteProp>();
  const { theme, isDark } = useTheme();
  const { clearCart } = useCart();

  const { formUrl, paymentId, orderId, orderNumber } = route.params;

  // ── State ──
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingResult, setIsProcessingResult] = useState(false);
  const [resultStatus, setResultStatus] = useState<'success' | 'failed' | 'timeout' | 'canceled' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Holds the post-success redirect timer so it can be cleared on unmount.
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Animations ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  const webViewRef = useRef<WebView>(null);

  // Synchronous re-entry / completion guard for the payment flow. Unlike React
  // state, a ref updates immediately, so two WebView callbacks firing in the
  // same tick (onNavigationStateChange + onShouldStartLoadWithRequest) cannot
  // both pass the guard. It also lets late WebView errors be ignored once the
  // payment outcome is being verified or has already settled.
  const paymentCompletedRef = useRef(false);

  // ── Android back button handler ──
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isProcessingResult) return true;             // block while verifying
      if (resultStatus === 'success') return true;     // already paid, redirect underway — don't offer cancel
      if (resultStatus) { handleResultDismiss(); return true; } // failed/timeout/canceled → dismiss result
      handleCancel();
      return true;
    });
    return () => backHandler.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessingResult, resultStatus]);

  // Clear the post-success redirect timer if the screen unmounts first.
  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
  }, []);

  // ── Spin animation for processing ──
  useEffect(() => {
    if (isProcessingResult) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [isProcessingResult]);

  // ── Result animation ──
  useEffect(() => {
    if (resultStatus) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [resultStatus]);

  // ── Handle payment completion (WebView redirect intercepted) ──
  const handlePaymentComplete = useCallback(async () => {
    if (paymentCompletedRef.current) return;
    paymentCompletedRef.current = true;
    setIsProcessingResult(true);

    try {
      // Poll QiCard for the final status
      const result = await QiCardPaymentService.pollForCompletion(paymentId, 12, 2000);

      if (result.status === 'SUCCESS') {
        setResultStatus('success');
        // Payment is confirmed and the card is charged. Clearing the cart is
        // best-effort — it must NOT be able to flip this settled success into a
        // failure/timeout, so isolate its rejection instead of letting it bubble
        // into the outer catch.
        try {
          await clearCart();
        } catch {
          /* ignore — payment already succeeded; cart clear is best-effort */
        }
        // Wait for animation, then navigate
        successTimerRef.current = setTimeout(() => {
          navigation.replace('OrderConfirmation', { orderId, orderNumber });
        }, 2000);
      } else if (result.canceled) {
        // User canceled inside the QiCard hosted page. Cart is preserved and the
        // now-orphaned awaiting_payment order is cancelled (best-effort).
        setResultStatus('canceled');
        setError(t('qiCard.canceledMessage', { defaultValue: 'You canceled the payment. Your cart is saved — you can try again or choose another method.' }));
        OrderService.cancelOrder(orderId).catch(() => {});
      } else {
        setResultStatus('failed');
        setError(
          result.status === 'AUTHENTICATION_FAILED'
            ? t('qiCard.authFailed', { defaultValue: 'Card authentication failed. Please try again.' })
            : t('qiCard.failed', { defaultValue: 'Payment failed. Please try again.' })
        );
      }
    } catch (err: any) {
      setResultStatus('timeout');
      setError(
        t('qiCard.timeout', {
          defaultValue: 'Could not confirm payment status. Please check your order for the latest status.',
        })
      );
    } finally {
      setIsProcessingResult(false);
    }
  }, [paymentId, orderId, orderNumber, navigation, t]);

  // ── Intercept WebView navigation ──
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState;

      // Match the redirect target exactly. The previous unanchored
      // `url.includes('payment-complete')` would also fire on any intermediate 3DS
      // hop that merely CONTAINS that string — e.g. carrying it as a return_url query
      // parameter — which unmounts the WebView mid-authentication (isProcessingResult
      // short-circuits the render), so the payment can never complete and the poll
      // spins to a "couldn't confirm" timeout.
      if (url && url.startsWith('khamark://payment-complete')) {
        handlePaymentComplete();
      }
    },
    [handlePaymentComplete]
  );

  // Also intercept via onShouldStartLoadWithRequest for immediate interception
  const handleShouldStartLoad = useCallback(
    (request: { url: string }) => {
      // Exact redirect target only — see the note in handleNavigationStateChange.
      if (request.url.startsWith('khamark://payment-complete')) {
        handlePaymentComplete();
        return false; // Prevent WebView from loading this URL
      }
      return true;
    },
    [handlePaymentComplete]
  );

  // ── Cancel payment ──
  const handleCancel = useCallback(() => {
    Alert.alert(
      t('qiCard.cancelTitle', { defaultValue: 'Cancel Payment' }),
      t('qiCard.cancelMessage', { defaultValue: 'Are you sure you want to cancel this payment? Your order will remain pending.' }),
      [
        { text: t('common.no', { defaultValue: 'No' }), style: 'cancel' },
        {
          text: t('common.yes', { defaultValue: 'Yes' }),
          style: 'destructive',
          onPress: async () => {
            // Alert is a native dialog: it is not part of the React tree and is NOT
            // dismissed when the payment settles behind it. The WebView keeps running
            // underneath, so QiCard can redirect to khamark://payment-complete, the
            // status poll can return SUCCESS, and the cart can be cleared — all while
            // this confirmation is still on screen. Tapping "Yes" then cancelled an
            // order that had already been charged: the customer's card is debited,
            // payment_status is 'paid', the order flips to cancelled_by_user, the cart
            // is gone, and they never reach OrderConfirmation. cancel_my_order permits
            // 'confirmed', so nothing downstream stops it.
            //
            // Claim the ref as well as checking it, so a redirect arriving during this
            // handler cannot race the cancellation from the other side.
            if (paymentCompletedRef.current) return;
            paymentCompletedRef.current = true;

            // Cancel the orphaned awaiting_payment order (best-effort; a real
            // late payment is still reconciled by the re-verifying webhook).
            try { await OrderService.cancelOrder(orderId); } catch { /* ignore */ }
            navigation.goBack();
          },
        },
      ]
    );
  }, [navigation, t, orderId]);

  // ── Go back from result screen ──
  const handleResultDismiss = useCallback(() => {
    if (resultStatus === 'success') {
      navigation.replace('OrderConfirmation', { orderId, orderNumber });
    } else {
      navigation.goBack();
    }
  }, [resultStatus, orderId, orderNumber, navigation]);

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // ── Result overlay ──
  if (resultStatus) {
    const isSuccess = resultStatus === 'success';
    let iconName: React.ComponentProps<typeof Ionicons>['name'];
    let iconColor: string;
    let title: string;
    if (isSuccess) {
      iconName = 'checkmark-circle';
      iconColor = '#4CAF50';
      title = t('qiCard.successTitle', { defaultValue: 'Payment Successful!' });
    } else if (resultStatus === 'timeout') {
      // Payment outcome is genuinely unknown — do NOT claim it failed.
      iconName = 'time-outline';
      iconColor = '#FF9800';
      title = t('qiCard.timeoutTitle', { defaultValue: "Couldn't Confirm Payment" });
    } else if (resultStatus === 'canceled') {
      iconName = 'close-circle-outline';
      iconColor = '#9E9E9E';
      title = t('qiCard.canceledTitle', { defaultValue: 'Payment Canceled' });
    } else {
      iconName = 'close-circle';
      iconColor = '#F44336';
      title = t('qiCard.failedTitle', { defaultValue: 'Payment Failed' });
    }

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.resultContainer}>
          <Animated.View
            style={[
              styles.resultIconContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={[styles.resultIconCircle, { backgroundColor: iconColor + '15' }]}>
              <Ionicons name={iconName} size={80} color={iconColor} />
            </View>
          </Animated.View>

          <Animated.Text allowFontScaling={false}
            style={[
              styles.resultTitle,
              { color: theme.colors.text, opacity: fadeAnim },
            ]}
          >
            {title}
          </Animated.Text>

          {error && (
            <Animated.Text allowFontScaling={false}
              style={[
                styles.resultMessage,
                { color: theme.colors.textSecondary, opacity: fadeAnim },
              ]}
            >
              {error}
            </Animated.Text>
          )}

          {isSuccess && (
            <Animated.Text allowFontScaling={false}
              style={[
                styles.resultSubtext,
                { color: theme.colors.textSecondary, opacity: fadeAnim },
              ]}
            >
              {t('qiCard.redirecting', { defaultValue: 'Redirecting to your order...' })}
            </Animated.Text>
          )}

          {!isSuccess && (
            <Animated.View style={{ opacity: fadeAnim, marginTop: 24 }}>
              <TouchableOpacity
                style={[styles.resultButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleResultDismiss}
              >
                <Text allowFontScaling={false} style={styles.resultButtonText}>
                  {t('common.goBack', { defaultValue: 'Go Back' })}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Processing overlay ──
  if (isProcessingResult) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.processingContainer}>
          <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
            <MaterialCommunityIcons name="credit-card-check-outline" size={48} color={theme.colors.primary} />
          </Animated.View>
          <Text allowFontScaling={false} style={[styles.processingTitle, { color: theme.colors.text }]}>
            {t('qiCard.verifying', { defaultValue: 'Verifying Payment...' })}
          </Text>
          <Text allowFontScaling={false} style={[styles.processingSubtext, { color: theme.colors.textSecondary }]}>
            {t('qiCard.pleaseWait', { defaultValue: 'Please wait while we confirm your payment.' })}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main WebView ──
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={handleCancel}>
          <Feather name="x" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <MaterialCommunityIcons name="credit-card-outline" size={20} color={theme.colors.primary} />
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('qiCard.title', { defaultValue: 'QI Card Payment' })}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {/* Secure badge */}
          <View style={[styles.secureBadge, { backgroundColor: '#4CAF50' + '20' }]}>
            <Feather name="lock" size={12} color="#4CAF50" />
            <Text allowFontScaling={false} numberOfLines={1} style={[styles.secureBadgeText, { color: '#4CAF50' }]}>
              {t('qiCard.secure', { defaultValue: 'Secure' })}
            </Text>
          </View>
        </View>
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        {isLoading && (
          <View style={[styles.loadingOverlay, { backgroundColor: theme.colors.background }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
              {t('qiCard.loadingForm', { defaultValue: 'Loading payment form...' })}
            </Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: formUrl }}
          style={styles.webView}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          javaScriptEnabled={true}
          injectedJavaScript={HIDE_LANG_SWITCHER_JS}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={true}
          mixedContentMode="compatibility"
          // Allow QiCard to handle redirects
          originWhitelist={['https://*', 'khamark://*', 'http://*']}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
            // Once payment interception/verification has begun (or the outcome
            // has settled), a WebView error is no longer authoritative — never
            // let it override an in-flight or already-decided payment outcome.
            if (paymentCompletedRef.current) return;
            // Only show error if it's not a custom scheme redirect
            if (!nativeEvent.url?.startsWith('khamark://')) {
              setError(t('qiCard.webviewError', { defaultValue: 'Failed to load payment form. Please try again.' }));
              setResultStatus('failed');
            }
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView HTTP error:', nativeEvent.statusCode);
            // Ignore HTTP errors (e.g. a transient 4xx on an intermediate 3DS
            // redirect hop, or a late event) once the payment is being verified
            // or has already settled.
            if (paymentCompletedRef.current) return;
            if (nativeEvent.statusCode >= 400) {
              setError(t('qiCard.webviewError', { defaultValue: 'Failed to load payment form. Please try again.' }));
              setResultStatus('failed');
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    minWidth: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    flexShrink: 0,
  },
  secureBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // ── WebView ──
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // ── Processing ──
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  processingTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  processingSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  // ── Result ──
  resultContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  resultIconContainer: {
    marginBottom: 24,
  },
  resultIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  resultMessage: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  resultSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  resultButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  resultButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default QiCardPaymentScreen;
