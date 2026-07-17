import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../../components/ThemeProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { getDirection } from '../../locales';
import { SPACING } from '../../constants/theme';
import {
  subscribeToConversation,
  subscribeToMessages,
  sendMessage,
  markConversationAsRead,
} from '../../services/chatService';
import { Conversation, Message } from '../../types';

function hasArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function safeTime(ts: any) {
  try {
    const d = ts?.toDate?.() ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatThreadScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isRTL = getDirection(i18n.language) === 'rtl';

  const conversationId: string = route.params?.conversationId;

  const listRef = useRef<FlatList>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Synchronous re-entrancy guard: `sending` state only flips on the next render,
  // so two taps in the same frame would both pass a state-based check and double-send.
  const sendingRef = useRef(false);

  // keep list padding correct (never cut by composer)
  const [composerH, setComposerH] = useState(64);

  // ✅ Samsung-safe keyboard handling
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Android is configured with windowSoftInputMode="adjustResize" (AndroidManifest)
    // + softwareKeyboardLayoutMode="resize" (app.json), so the OS already shrinks the
    // window and lifts the absolute bottom:0 composer to sit on top of the keyboard.
    // Applying an extra translateY here would double-shift it a full keyboard-height
    // above the keyboard. Only iOS (which does not auto-resize) needs the manual avoid.
    if (Platform.OS !== 'ios') return;

    const onShow = (e: any) => {
      const h = e?.endCoordinates?.height ?? 0;
      Animated.timing(translateY, {
        toValue: -h,
        duration: 240,
        useNativeDriver: true,
      }).start();

      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    };

    const onHide = () => {
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    };

    const s = Keyboard.addListener('keyboardWillShow', onShow);
    const h = Keyboard.addListener('keyboardWillHide', onHide);
    return () => {
      s.remove();
      h.remove();
    };
  }, [translateY]);

  useEffect(() => {
    setLoading(true);

    const unsubConv = subscribeToConversation(conversationId, (c) => {
      setConv(c);
      setLoading(false);
    });

    const unsubMsgs = subscribeToMessages(conversationId, (msgs) => {
      setMessages(msgs || []);
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
    }, 60);

    // mark read (user — the messenger is always the customer side)
    void markConversationAsRead(conversationId, 'user');

    return () => {
      unsubConv?.();
      unsubMsgs?.();
    };
  }, [conversationId]);

  const title =
    (conv as any)?.adminSnapshot?.name ||
    route.params?.title ||
    t('chat.chat', { defaultValue: 'Chat' });

  const onSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current || !user?.uid) return;

    sendingRef.current = true;
    setSending(true);
    setText('');

    try {
      // ✅ strict whitelist safe (your service already enforces it)
      await sendMessage(conversationId, trimmed, user.uid, 'user');
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
    } catch (e) {
      // sendMessage re-throws on failure (network / blocked / not-found). Restore the
      // optimistically-cleared text (unless the user already started a new message) and
      // surface the error so the message isn't silently lost.
      setText((prev) => prev || trimmed);
      Alert.alert(
        t('chat.sendFailed', { defaultValue: 'Message failed to send. Tap send to retry.' })
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // useCallback so typing in the composer doesn't re-render every message cell.
  const renderItem = useCallback(({ item }: { item: Message }) => {
    const isMe = item.senderType === 'user';
    const needsPad = Platform.OS === 'android' && hasArabic(item.text || '');

    return (
      <View style={{ paddingHorizontal: SPACING.md, marginVertical: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: isMe ? theme.colors.primary : theme.colors.surface,
                borderColor: isMe ? 'transparent' : theme.colors.border,
              },
            ]}
          >
            <Text allowFontScaling={false}
              adjustsFontSizeToFit
              style={{
                color: isMe ? '#fff' : theme.colors.text,
                fontSize: 15,
                lineHeight: 22,
                textAlign: isRTL ? 'right' : 'left',
                includeFontPadding: needsPad,
                paddingTop: needsPad ? 2 : 0,
                paddingBottom: needsPad ? 2 : 0,
              }}
            >
              {item.text}
            </Text>

            <Text allowFontScaling={false}
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: '700',
                color: isMe ? 'rgba(255,255,255,0.85)' : theme.colors.textSecondary,
                alignSelf: 'flex-end',
              }}
            >
              {safeTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  }, [theme, isRTL]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {/* Header (Alibaba style) */}
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900', textAlign: isRTL ? 'right' : 'left' }}
          >
            {title}
          </Text>
          <Text allowFontScaling={false}
            style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2, textAlign: isRTL ? 'right' : 'left' }}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {t('chat.sellerSupport', { defaultValue: 'Seller Support • Fast reply' })}
          </Text>
        </View>

        <TouchableOpacity style={styles.headerBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Messages (inverted like Alibaba) */}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            inverted
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === 'android'}
            windowSize={11}
            maxToRenderPerBatch={10}
            initialNumToRender={14}
            updateCellsBatchingPeriod={40}
            contentContainerStyle={{
              paddingTop: composerH + insets.bottom + 14,
              paddingBottom: 10,
            }}
          />

          {/* Composer */}
          <Animated.View
            style={[
              styles.composerWrap,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                paddingBottom: insets.bottom + 8,
                transform: [{ translateY }],
              },
            ]}
            onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
          >
            <View style={[styles.composerRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity style={styles.iconBtn} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>

              <View
                style={[
                  styles.inputBox,
                  { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
                ]}
              >
                <TextInput allowFontScaling={false}
                  value={text}
                  onChangeText={setText}
                  placeholder={t('chat.typeMessage', { defaultValue: 'Type a message…' })}
                  placeholderTextColor={theme.colors.textSecondary}
                  style={{
                    flex: 1,
                    color: theme.colors.text,
                    fontSize: 15,
                    paddingVertical: 10,
                    textAlign: isRTL ? 'right' : 'left',
                    includeFontPadding: Platform.OS === 'android',
                  }}
                  multiline
                  blurOnSubmit={false}
                  returnKeyType="send"
                  onSubmitEditing={Platform.OS === 'ios' ? onSend : undefined}
                />

                <TouchableOpacity style={styles.iconBtn} activeOpacity={0.8}>
                  <Ionicons name="image-outline" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={onSend}
                disabled={!text.trim() || sending}
                style={[
                  styles.sendBtn,
                  { backgroundColor: text.trim() ? theme.colors.primary : theme.colors.border },
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="send"
                    size={18}
                    color={text.trim() ? '#fff' : theme.colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  composerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },

  composerWrap: {
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: SPACING.md,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
  },

  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  headerBtn: {
    alignItems: 'center',
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  iconBtn: {
    alignItems: 'center',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  inputBox: {
    alignItems: 'flex-end',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  sendBtn: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
});
