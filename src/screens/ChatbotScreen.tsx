import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { openWhatsApp } from '../utils/whatsapp';
import { chatListBottomPadding } from '../utils/chatLayout';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  Animated,
  Pressable,
  Easing,
  LayoutAnimation,
  UIManager,
  Linking,
  Alert,
  Keyboard,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
// NOT useBottomTabBarHeight(): that hook THROWS ("Couldn't find the bottom tab
// bar height") when the screen is not inside a bottom-tab navigator, and this
// screen is registered on the ROOT stack. Reading the context directly returns
// undefined there instead, which the fallback below already handles.
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useTheme } from '../components/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { getDirection } from '../locales';
import { SPACING } from '../constants/theme';
import { chatbotService, ChatMessage } from '../services/chatbotService';
import AssistantMessage from '../components/chat/AssistantMessage';
import UserBubble from '../components/chat/UserBubble';
import QuickChips from '../components/chat/QuickChips';
// Aliased: this screen already imports RN's own `Animated` for the voice-recording
// overlay, and the two libraries must not share a name in one file.
import ReAnimated, { FadeInDown } from 'react-native-reanimated';
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { VoiceBubble } from '../components/VoiceBubble';
import { VoiceMessagePlaybackProvider } from '../components/voice/VoiceMessagePlaybackProvider';
import { brandWhatsAppDigits } from '../constants/brand';

const ChatbotScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const flatListRef = useRef<FlatList>(null);
  // Aborts the in-flight answer when the screen goes away, so a half-finished
  // stream cannot call setState on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const rawTabBarHeight = React.useContext(BottomTabBarHeightContext);
  // The +75 is the app's FLOATING tab bar, which the native tab bar reports as 0
  // height. It only applies when this screen is actually rendered inside the tab
  // navigator. Opened from the section headers it is pushed on the root stack
  // with no tab bar at all, and the 75 became a dead grey band under the input.
  const insideTabs = rawTabBarHeight !== undefined;
  const tabBarHeight = rawTabBarHeight && rawTabBarHeight > 0
    ? rawTabBarHeight
    : insets.bottom + (insideTabs ? 75 : 0);

  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;

  // Starts EMPTY. The old seed put a fabricated assistant turn in the transcript
  // before anyone had asked anything — the assistant had not said it, and it read
  // as a message rather than as a greeting. The same words now live in the list's
  // empty state, where they are framed as guidance instead of speech.
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [inputText, setInputText] = useState('');
  // The last question asked, kept so a failed answer can be retried without the
  // customer retyping it. Cleared on success.
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Audio recorder state
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingIntentRef = useRef<boolean>(false);
  const waveformRef = useRef<number[]>([]);

  // ── Smooth recording animations ──
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recOverlayOpacity = useRef(new Animated.Value(0)).current;
  const trashSlide = useRef(new Animated.Value(-40)).current;
  const sendSlide = useRef(new Animated.Value(40)).current;
  const centerFade = useRef(new Animated.Value(0)).current;
  const micScale = useRef(new Animated.Value(1)).current;

  // LayoutAnimation is enabled by default on the New Architecture — no setup needed.

  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      pulse.start();

      recOverlayOpacity.setValue(0);
      trashSlide.setValue(-40);
      sendSlide.setValue(40);
      centerFade.setValue(0);

      Animated.parallel([
        Animated.timing(recOverlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(trashSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.spring(sendSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.timing(centerFade, { toValue: 1, duration: 350, delay: 80, useNativeDriver: true }),
      ]).start();

      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Cleanup on unmount: clear the recording timer and stop any live recorder
  // so we don't setState on an unmounted component or leave the mic/audio session open.
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      isRecordingIntentRef.current = false;
      try {
        audioRecorder.stop().catch(() => {});
      } catch (e) {
        // recorder may not be active on unmount — safe to ignore
      }
    };
  }, [audioRecorder]);

  // ✅ We’ll position the bottom bar using keyboard TOP Y (screenY) – no gaps
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);

  // ✅ We measure the real bar height (secondary actions + input)
  const [barHeight, setBarHeight] = useState<number>(150);

  const screenH = Dimensions.get('screen').height;

  // Compute where the bar should sit
  const barTop = useMemo(() => {
    // keyboard hidden: keep composer ABOVE bottom tab bar.
    //
    // Only the TAB BAR is subtracted here. tabBarHeight folds in insets.bottom for
    // the tabs case, but the bar already renders its own insets.bottom spacer under
    // the input when the keyboard is closed. Subtracting a bottom inset in both
    // places lifted the bar by that much (34pt on a Dynamic Island phone) and left a
    // strip of the message list showing underneath it, below the text field.
    if (keyboardTopY === null) {
      return screenH - barHeight - (insideTabs ? tabBarHeight : 0);
    }
    // keyboard shown: bar sits exactly on keyboard
    const openTop = keyboardTopY - barHeight;
    return Math.max(insets.top, openTop);
  }, [keyboardTopY, barHeight, screenH, tabBarHeight, insideTabs, insets.top]);

  // Where the message list actually ends, in the same parent the bar is
  // positioned in. Measured, not derived from the keyboard: Android resizes the
  // window for the keyboard (softwareKeyboardLayoutMode "resize") and iOS does
  // not, so only the real frame says how much of the list the bar covers.
  const [listFrame, setListFrame] = useState<{ y: number; height: number } | null>(null);

  // The list runs under the composer and, while the keyboard is open, under the
  // keyboard too. Its bottom padding used to clear only the composer, so with the
  // keyboard up (and it stays up after Send) the newest rows — the question just
  // sent and the answer streaming in — were scrolled to a position BEHIND the
  // keyboard. The chat looked like it vanished mid-answer and came back when the
  // keyboard closed. Clear whatever the bar really covers; never less than before.
  const listBottomPadding = useMemo(
    () =>
      chatListBottomPadding({
        barHeight,
        tabBarHeight,
        barTop,
        listBottom: listFrame ? listFrame.y + listFrame.height : null,
      }),
    [listFrame, barTop, barHeight, tabBarHeight],
  );

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', e => {
      const topY = e?.endCoordinates?.screenY;
      setKeyboardTopY(typeof topY === 'number' ? topY : null);
      setTimeout(() => scrollToBottom(true), 80);
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardTopY(null);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  // Detect the language of the user's message based on script characters
  const detectMessageLanguage = useCallback((text: string): string => {
    // Kurdish Sorani has unique characters not shared with Arabic
    if (/[ێەۆڵڕڤچژگپ]/.test(text)) return 'ku';
    // Check for Arabic-script characters (at least 2 to avoid false positives)
    const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
    if (arabicChars >= 2) return 'ar';
    // Fallback to the app's UI language
    return i18n.language;
  }, [i18n.language]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);
      // Cleared through the native field as well as state. Clearing state alone
      // left the sent text sitting in the box on iPhone: the same render also
      // locked the field (editable={!isLoading}), and iOS skipped the value
      // update on a field being made non-editable.
      setInputText('');
      inputRef.current?.clear();
      setIsLoading(true);

      setTimeout(() => scrollToBottom(true), 50);

      // The assistant row exists before a single byte arrives, so the waiting
      // state sits where the answer will be rather than in a separate widget.
      const aiId = `ai-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        { id: aiId, role: 'model', content: '', timestamp: new Date(), streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Detect the language from the message text, not the app UI language
        const messageLanguage = detectMessageLanguage(trimmed);
        await chatbotService.sendMessageStreaming(trimmed, {
          language: messageLanguage,
          signal: controller.signal,
          onDelta: chunk => {
            setMessages(prev =>
              prev.map(m => (m.id === aiId ? { ...m, content: m.content + chunk } : m)),
            );
          },
        });

        setMessages(prev => prev.map(m => (m.id === aiId ? { ...m, streaming: false } : m)));
        setFailedPrompt(null);
      } catch (error: any) {
        // Whatever arrived stays on screen. Only a completely empty answer is
        // replaced by the error text — partial output is real output.
        setFailedPrompt(trimmed);
        setMessages(prev =>
          prev.map(m =>
            m.id === aiId
              ? {
                  ...m,
                  streaming: false,
                  content: m.content || error?.message || t('chatbot.errorMessage'),
                }
              : m,
          ),
        );
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        setTimeout(() => scrollToBottom(true), 50);
      }
    },
    [isLoading, t, detectMessageLanguage]
  );

  const startRecording = async () => {
    // Guard against a second recording being launched while one is already
    // recording, uploading, or a text send is in flight (e.g. tapping the mic
    // that briefly flashes back during stopAndSendRecording).
    if (isRecording || isUploadingVoice || isLoading) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    Animated.sequence([
      Animated.timing(micScale, { toValue: 1.4, duration: 120, useNativeDriver: true }),
      Animated.spring(micScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();

    LayoutAnimation.configureNext(LayoutAnimation.create(280, 'easeInEaseOut', 'opacity'));

    isRecordingIntentRef.current = true;
    setIsRecording(true);
    setRecordingDuration(0);

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setIsRecording(false);
        Alert.alert(t('common.error') || 'Error', t('chatbot.micPermission', { defaultValue: 'Microphone permission is required to send voice messages' }));
        isRecordingIntentRef.current = false;
        return;
      }
      
      if (Platform.OS !== 'web') {
        try {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
        } catch (e) {
          console.warn('Audio config error:', e);
        }
      }

      waveformRef.current = [];
      await audioRecorder.prepareToRecordAsync();

      // Check if user cancelled before we finished init
      if (!isRecordingIntentRef.current) {
         setIsRecording(false);
         try { await audioRecorder.stop(); } catch (e) {}
         return;
      }

      audioRecorder.record();
      
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
      Alert.alert(t('common.error') || 'Error', t('chatbot.recordFailed', { defaultValue: 'Failed to start recording' }));
      isRecordingIntentRef.current = false;
    }
  };

  const cancelRecording = async () => {
    isRecordingIntentRef.current = false;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));
    try {
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      try { await audioRecorder.stop(); } catch (e) {}
      setRecordingDuration(0);
    } catch (err) {
      console.error('Failed to cancel recording', err);
    }
  };

  const stopAndSendRecording = async () => {
    isRecordingIntentRef.current = false;
    if (!isRecording) return;

    LayoutAnimation.configureNext(LayoutAnimation.create(250, 'easeInEaseOut', 'opacity'));
    setIsRecording(false);
    // Flip the in-flight flag synchronously (before the awaited stop below) so the
    // composer never re-renders with both flags false and flashes the mic back on.
    setIsUploadingVoice(true);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    try {
      try { await audioRecorder.stop(); } catch (e) {}
      const uri = audioRecorder.uri;
      const audioDuration = recordingDuration * 1000;
      
      const compressWaveform = (rawMetering: number[], targetBars: number): number[] => {
         if (rawMetering.length === 0) return Array(targetBars).fill(4);
         const bins: number[] = [];
         const chunkSize = Math.max(1, Math.floor(rawMetering.length / targetBars));
         
         for (let i = 0; i < targetBars; i++) {
           const chunk = rawMetering.slice(i * chunkSize, (i+1) * chunkSize);
           if (chunk.length === 0) {
             bins.push(bins[bins.length-1] || 4);
             continue;
           }
           const maxInChunk = Math.max(...chunk);
           
           const normalized = Math.max(4, Math.min(24, 24 + (maxInChunk * 20 / 60))); 
           bins.push(normalized);
         }
         return bins;
      };

      const finalWaveform = compressWaveform(waveformRef.current, 32);

      setRecordingDuration(0);

      if (!uri) return;

      const fileName = `voice_ai_${Date.now()}.m4a`;
      const mimeType = 'audio/m4a';

      // Send a dummy processing message
      const tempId = `user-voice-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: tempId,
        role: 'user',
        content: `🎤 ${t('chatbot.voiceMessage', { defaultValue: 'Voice Message' })} (${formatDuration(audioDuration)})`,
        timestamp: new Date(),
        type: 'voice',
        // Note: For full playback, you'd integrate the actual download URL here 
        attachmentUrl: uri, 
        fileMetadata: { duration: audioDuration, name: fileName, mimeType, waveform: finalWaveform }
      };

      setMessages(prev => [...prev, userMessage]);
      setTimeout(() => scrollToBottom(true), 50);
      setIsLoading(true);

      // In a real app, you'd upload this to Firebase here
      // and send the Google Storage URL to the AI model
      // const uploadResult = await ImageService.uploadFile(uri, fileName, mimeType);
      
      // We pass the fact that it's a voice message to the chatbotService
      // Currently the AI might not process audio, but we can send a text representation.
      const response = await chatbotService.sendMessage("I sent a voice message. Please respond that you cannot process audio yet if you don't feature speech-to-text.", detectMessageLanguage("I sent voice"));

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        content: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
    } catch (err: any) {
      console.error('Failed to send recording', err);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'model',
        content: err.message || t('chatbot.errorMessage'),
        timestamp: new Date(),
      }]);
    } finally {
      setIsUploadingVoice(false);
      setIsLoading(false);
      setTimeout(() => scrollToBottom(true), 50);
    }
  };

  const handleSendPress = () => {
    if (inputText.trim() && !isLoading) {
      sendMessage(inputText);
    }
  };

  const handleClearChat = () => {
    Alert.alert(
      t('chatbot.clearChat') || 'Clear Chat',
      t('chatbot.clearChatConfirm') || 'Are you sure you want to clear this conversation?',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('common.clear') || 'Clear',
          style: 'destructive',
          onPress: () => {
            chatbotService.clearHistory();
            // Back to empty, same as a first launch, so "clear" means cleared
            // rather than "replaced with one message the assistant never sent".
            setMessages([]);
          },
        },
      ]
    );
  };

  const quickActions = [
    { key: 'parts', label: t('chatbot.quickActions.findParts'), icon: 'construct-outline' as const },
    { key: 'order', label: t('chatbot.quickActions.trackOrder'), icon: 'cube-outline' as const },
    { key: 'recommend', label: t('chatbot.quickActions.recommend') || 'Best Sellers', icon: 'star-outline' as const },
    { key: 'delivery', label: t('chatbot.quickActions.deliveryInfo'), icon: 'car-outline' as const },
    { key: 'contact', label: t('chatbot.quickActions.contactStore'), icon: 'call-outline' as const },
    { key: 'categories', label: t('chatbot.quickActions.categories') || 'Categories', icon: 'grid-outline' as const },
  ];

  const secondaryActions = [
    { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' as const, color: '#25D366' },
    { key: 'cart', label: t('chatbot.quickActions.viewCart') || 'Cart', icon: 'cart-outline' as const },
    { key: 'orders', label: t('chatbot.quickActions.myOrders') || 'Orders', icon: 'receipt-outline' as const },
  ];

  const handleQuickAction = (key: string) => {
    const questionMap: Record<string, string> = {
      parts: t('chatbot.questions.findParts'),
      order: t('chatbot.questions.trackOrder'),
      delivery: t('chatbot.questions.deliveryInfo'),
      contact: t('chatbot.questions.contactStore'),
      recommend: t('chatbot.questions.recommend', { defaultValue: 'What are your best selling or most popular products?' }),
      categories: t('chatbot.questions.categories', { defaultValue: 'What product categories do you have available?' }),
    };
    if (questionMap[key]) sendMessage(questionMap[key]);
  };

  const handleSecondaryAction = (key: string) => {
    switch (key) {
      case 'whatsapp':
        openWhatsApp(brandWhatsAppDigits(), 'Hi, I need help');
        break;
      case 'cart':
        navigation.navigate('Cart');
        break;
      case 'orders':
        navigation.navigate('Main', { screen: 'Orders' });
        break;
    }
  };

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatDuration = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isUser = item.role === 'user';
    const showTimestamp =
      index === messages.length - 1 ||
      (messages[index + 1] &&
        new Date(messages[index + 1].timestamp).getTime() - new Date(item.timestamp).getTime() > 60000);
    const time = showTimestamp ? formatTime(new Date(item.timestamp)) : undefined;

    if (item.type === 'voice') {
      return (
        <View style={{ marginVertical: SPACING.xs, paddingHorizontal: SPACING.md }}>
          <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <VoiceBubble
              mine={isUser}
              attachmentUrl={item.attachmentUrl}
              fileMetadata={item.fileMetadata as any}
              theme={theme}
              time={formatTime(new Date(item.timestamp))}
            />
          </View>
        </View>
      );
    }

    return (
      <ReAnimated.View
        // Streaming rows are excluded. The row is already mounted and its text
        // grows on every delta; re-running an entrance animation through that
        // would make the answer jump several times a second.
        entering={item.streaming ? undefined : FadeInDown.duration(220).springify().damping(18)}
      >
        {isUser ? (
          <UserBubble text={item.content} isRTL={isRTL} theme={theme} time={time} />
        ) : (
          <AssistantMessage
            text={item.content}
            streaming={!!item.streaming}
            isRTL={isRTL}
            theme={theme}
            time={time}
            onOpenProduct={(id: string) => navigation.navigate('ProductDetails', { productId: id })}
          />
        )}
      </ReAnimated.View>
    );
  };

  const renderSecondaryActions = () => {
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: SPACING.sm,
          paddingHorizontal: SPACING.md,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        {secondaryActions.map(action => (
          <TouchableOpacity
            key={action.key}
            onPress={() => handleSecondaryAction(action.key)}
            style={{ alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: (action.color || theme.colors.primary) + '15',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <Ionicons name={action.icon} size={20} color={action.color || theme.colors.primary} />
            </View>
            <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary }}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderInputArea = () => {
    if (isRecording || isUploadingVoice) {
      return (
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: SPACING.md,
            paddingTop: SPACING.sm,
            paddingBottom: SPACING.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            opacity: recOverlayOpacity,
          }}
        >
          {isUploadingVoice ? (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 14, fontWeight: '500' }}>
                {t('chatbot.sendingVoice', { defaultValue: 'Sending voice message...' })}
              </Text>
            </View>
          ) : (
            <>
              {/* Cancel (trash) — slides in from left */}
              <Animated.View style={{ transform: [{ translateX: trashSlide }] }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={cancelRecording}
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: '#FF3B3015',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </Animated.View>

              {/* Pulsing red dot + Timer — fades in */}
              <Animated.View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: centerFade }}>
                <Animated.View style={{
                  width: 10, height: 10, borderRadius: 5,
                  backgroundColor: '#FF3B30',
                  opacity: pulseAnim,
                  transform: [{ scale: pulseAnim }],
                }} />
                <Text allowFontScaling={false} style={{
                  fontSize: 16, fontWeight: '600',
                  color: '#FF3B30',
                  fontVariant: ['tabular-nums'],
                }}>
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </Text>
                <Text allowFontScaling={false} style={{ fontSize: 13, color: theme.colors.textSecondary, marginLeft: 4 }}>
                  {t('chatbot.recording', { defaultValue: 'Recording...' })}
                </Text>
              </Animated.View>

              {/* Send button — slides in from right */}
              <Animated.View style={{ transform: [{ translateX: sendSlide }] }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={stopAndSendRecording}
                  style={{
                    width: 48, height: 48, borderRadius: 24,
                    backgroundColor: theme.colors.primary,
                    justifyContent: 'center', alignItems: 'center',
                    marginLeft: SPACING.sm,
                  }}
                >
                  <Ionicons name="send" size={20} color="white" />
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </Animated.View>
      );
    }

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.md,
          paddingTop: SPACING.sm,
          paddingBottom: SPACING.sm,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <TextInput allowFontScaling={false}
          ref={inputRef}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chatbot.inputPlaceholder')}
          placeholderTextColor={theme.colors.textSecondary}
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            borderRadius: 24,
            paddingHorizontal: SPACING.md,
            paddingVertical: 12,
            fontSize: 16,
            color: theme.colors.text,
            fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined,
            lineHeight: 24,
            maxHeight: 120,
            minHeight: 48,
            textAlign: isRTL ? 'right' : 'left',
            textAlignVertical: Platform.OS === 'android' ? 'center' : 'auto',
            includeFontPadding: false,
          }}
          multiline
          blurOnSubmit={false}
          returnKeyType="send"
          onSubmitEditing={Platform.OS === 'ios' ? handleSendPress : undefined}
          // Deliberately NOT locked while an answer loads. Locking it in the same
          // render that cleared it is what left sent text in the box, and the
          // shopper can type the next question while this answer arrives — Send
          // is already disabled until it finishes.
        />

        {inputText.trim() ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSendPress}
              disabled={!inputText.trim() || isLoading}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: inputText.trim() && !isLoading ? theme.colors.primary : theme.colors.border,
                justifyContent: 'center',
                alignItems: 'center',
                marginLeft: SPACING.sm,
              }}
            >
              <Ionicons
                name="send"
                size={20}
                color={inputText.trim() && !isLoading ? 'white' : theme.colors.textSecondary}
              />
            </TouchableOpacity>
        ) : (
            <Animated.View style={{ transform: [{ scale: micScale }] }}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={startRecording}
                disabled={isLoading}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: isDark ? theme.colors.surface : '#EFEFEF',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginLeft: SPACING.sm,
                }}
              >
                <Ionicons name="mic" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </Animated.View>
        )}
      </View>
    );
  };

  return (
    <VoiceMessagePlaybackProvider>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            padding: SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={isRTL ? { marginLeft: SPACING.md } : { marginRight: SPACING.md }}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
          </TouchableOpacity>

          {/* AI Logo */}
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            overflow: 'hidden',
            ...(isRTL ? { marginLeft: SPACING.sm } : { marginRight: SPACING.sm }),
          }}>
            <Image
              // Was assets/images/ai-logo.png — the HARYAD crown-and-wings logo from
              // the project this app was forked from. It shipped in the binary at 4.1MB
              // and every customer using the AI assistant saw another company's branding.
              source={require('../../assets/images/asankarylogo.png')}
              style={{ width: 44, height: 44 }}
              contentFit="cover"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false} style={{ fontSize: 17, fontWeight: '600', color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }}>{t('chatbot.title')}</Text>
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CD964', ...(isRTL ? { marginLeft: 6 } : { marginRight: 6 }) }} />
              <Text allowFontScaling={false} style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }}>{t('chatbot.subtitle')}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleClearChat}
            style={{ padding: SPACING.sm, backgroundColor: theme.colors.background, borderRadius: 20 }}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={{
            paddingVertical: SPACING.md,
            // Clears the composer AND the keyboard — see listBottomPadding.
            paddingBottom: listBottomPadding,
          }}
          onLayout={e => {
            const { y, height } = e.nativeEvent.layout;
            setListFrame(prev =>
              prev && Math.abs(prev.y - y) < 1 && Math.abs(prev.height - height) < 1 ? prev : { y, height },
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 72, paddingHorizontal: SPACING.xl }}>
              <Image
                source={require('../../assets/images/asankarylogo.png')}
                style={{ width: 56, height: 56, borderRadius: 28, marginBottom: SPACING.md }}
                contentFit="cover"
              />
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: theme.colors.text,
                  textAlign: 'center',
                }}
              >
                {t('chatbot.emptyTitle')}
              </Text>
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  marginTop: 6,
                  lineHeight: 20,
                }}
              >
                {t('chatbot.emptyBody')}
              </Text>
            </View>
          }
          onContentSizeChange={() => scrollToBottom(false)}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
          style={{ flex: 1 }}
        />

        {/* Bottom bar: positioned by TOP, so it sits EXACTLY on keyboard */}
        <View
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            if (h && Math.abs(h - barHeight) > 1) setBarHeight(h);
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: barTop,
            backgroundColor: theme.colors.surface,
          }}
        >
          {failedPrompt && !isLoading && (
            <Pressable
              onPress={() => {
                const again = failedPrompt;
                setFailedPrompt(null);
                // Drop the failed assistant row before resending, or the retry
                // appends a second answer under a visible failure.
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return last && last.role === 'model' && !last.content.trim()
                    ? prev.slice(0, -1)
                    : prev;
                });
                sendMessage(again);
              }}
              accessibilityRole="button"
              style={({ pressed }) => ({
                alignSelf: isRTL ? 'flex-end' : 'flex-start',
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: 6,
                marginHorizontal: SPACING.md,
                marginBottom: SPACING.sm,
                paddingHorizontal: SPACING.md,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.primary,
                backgroundColor: pressed ? theme.colors.primary + '14' : 'transparent',
              })}
            >
              <Ionicons name="refresh" size={15} color={theme.colors.primary} />
              <Text
                allowFontScaling={false}
                style={{ fontSize: 13, fontWeight: '600', color: theme.colors.primary }}
              >
                {t('chatbot.retry')}
              </Text>
            </Pressable>
          )}

          {messages.length < 8 && (
            <QuickChips
              items={quickActions.map(action => ({ key: action.key, label: action.label }))}
              isRTL={isRTL}
              theme={theme}
              onPress={handleQuickAction}
            />
          )}
          {renderSecondaryActions()}
          {renderInputArea()}
          {/* When keyboard is closed, we still need bottom safe area */}
          {keyboardTopY === null && <View style={{ height: insets.bottom }} />}
        </View>
      </SafeAreaView>
    </View>
    </VoiceMessagePlaybackProvider>
  );
};

export default ChatbotScreen;
