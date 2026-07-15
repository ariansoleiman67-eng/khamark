import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  I18nManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../components/ThemeProvider';
import { chatLastMessagePreview } from '../../utils/chatPreview';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToAdminConversations, softDeleteConversation } from '../../services/chatService';
import { supabase } from '../../services/supabase';

// Conversations don't carry a userSnapshot, so the admin inbox showed every chat
// as a generic "Customer" with no name/phone/avatar. Batch-fetch the customers and
// attach a userSnapshot so the card and the opened chat can identify/contact them.
const enrichConversationsWithUsers = async (list: any[]): Promise<any[]> => {
  const missingIds = Array.from(new Set(
    list.filter(c => !c.userSnapshot?.name && c.userId).map(c => c.userId)
  ));
  if (missingIds.length === 0) return list;
  try {
    const { data } = await supabase
      .from('users')
      .select('id, name, full_name, email, phone, profile_image_url')
      .in('id', missingIds);
    const byId: Record<string, any> = {};
    (data || []).forEach((u: any) => {
      byId[u.id] = {
        name: u.name || u.full_name || u.email || '',
        phone: u.phone || '',
        avatarUrl: u.profile_image_url || null,
      };
    });
    return list.map(c => (byId[c.userId] ? { ...c, userSnapshot: { ...(c.userSnapshot || {}), ...byId[c.userId] } } : c));
  } catch {
    return list;
  }
};
import { SPACING, SHADOW_STYLES } from '../../constants/theme';

type Conversation = {
  id: string;
  adminId: string;
  userId: string;
  productId?: string;
  updatedAt?: any;
  unread?: { admin?: number; user?: number };
  lastMessage?: { text?: string; type?: string; senderType?: 'user' | 'admin'; createdAt?: any };
  productSnapshot?: { title?: string; titleAr?: string; titleKu?: string; imageUrl?: string | null };
  userSnapshot?: { name?: string; phone?: string; avatarUrl?: string | null };
};

const toMillis = (ts: any): number => {
  try {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (ts?.toMillis) return ts.toMillis();
    if (ts?.seconds) return ts.seconds * 1000;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

const formatTimeAgo = (ts: any, t?: any): string => {
  const ms = toMillis(ts);
  if (!ms) return '';
  const now = Date.now();
  const diff = now - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t ? t('chat.justNow', 'Just now') : 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  // Show date
  const d = new Date(ms);
  const month = d.toLocaleString('default', { month: 'short' });
  return `${month} ${d.getDate()}`;
};

// Animated conversation card
const ConversationCard = React.memo(({
  item,
  index,
  theme,
  isDark,
  onPress,
  onDelete,
  t,
  i18n,
}: {
  item: Conversation;
  index: number;
  theme: any;
  isDark: boolean;
  onPress: () => void;
  onDelete: () => void;
  t: any;
  i18n: any;
}) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(20)).current;
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index]);

  const snapshot = item.productSnapshot || {};
  const rawTitle = snapshot.title?.trim() || '';
  const lastMsgType = item.lastMessage?.type || 'text';
  // Only show product info when the last message is a product card
  const showProduct = lastMsgType === 'product';
  const productTitle = showProduct ? (
    (i18n.language === 'ar' && snapshot.titleAr) ||
    (i18n.language === 'ku' && snapshot.titleKu) ||
    rawTitle ||
    t('chat.product', 'Product')
  ) : '';
  const thumb = showProduct ? (snapshot.imageUrl || null) : null;
  const isOrderChat = showProduct && (rawTitle.toLowerCase().startsWith('order') || rawTitle.includes('#'));
  
  const lastText = chatLastMessagePreview(item.lastMessage?.text, lastMsgType, t, productTitle);

  const timeText = formatTimeAgo(item.lastMessage?.createdAt || item.updatedAt, t);
  const unread = item.unread?.admin || 0;
  const customerName = item.userSnapshot?.name || t('chat.customer', 'Customer');
  const customerPhone = item.userSnapshot?.phone || '';
  const avatarUrl = item.userSnapshot?.avatarUrl || null;

  // First letter for avatar fallback
  const avatarLetter = customerName.trim().charAt(0).toUpperCase();

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[
          styles.rowCard,
          {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderColor: unread > 0
              ? (isDark ? '#FF6A0050' : '#FF6A0030')
              : (isDark ? theme.colors.border + '25' : '#F0F0F0'),
            ...(unread > 0 && !isDark ? { shadowColor: '#FF6A00', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8 } : {}),
          },
        ]}
      >
        {/* Unread left accent bar */}
        {unread > 0 && (
          <View style={styles.unreadAccent} />
        )}

        <View style={[styles.rowInner, isRTL && { flexDirection: 'row-reverse' }]}>
          {/* Avatar Section */}
          <View style={[styles.avatarWrapper, isRTL && { marginRight: 0, marginLeft: 12 }]}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <LinearGradient
                colors={['#FF6A00', '#FF9A44']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarFallback}
              >
                <Text allowFontScaling={false} style={styles.avatarLetter}>{avatarLetter}</Text>
              </LinearGradient>
            )}

            {/* Product mini-thumbnail or Order badge overlay */}
            {isOrderChat ? (
              <LinearGradient
                colors={['#FF6A00', '#FF9A44']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.orderMiniWrapper, isDark && { borderColor: theme.colors.surface }]}
              >
                <Ionicons name="cube" size={11} color="#fff" />
              </LinearGradient>
            ) : thumb ? (
              <View style={[styles.productMiniWrapper, isDark && { borderColor: theme.colors.surface, backgroundColor: theme.colors.surface }]}>
                <Image
                  source={{ uri: thumb }}
                  style={styles.productMini}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="none"
                />
              </View>
            ) : null}
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Top row: Name + Time */}
            <View style={[styles.topRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text allowFontScaling={false}
                style={[
                  styles.customerName,
                  {
                    color: theme.colors.text,
                    fontWeight: unread > 0 ? '900' : '700',
                    textAlign: isRTL ? 'right' : 'left',
                  },
                  isRTL && { marginRight: 0, marginLeft: 8 },
                ]}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
              >
                {customerName}
              </Text>
              {!!timeText && (
                <Text allowFontScaling={false}
                  style={[
                    styles.timeText,
                    { color: unread > 0 ? '#FF6A00' : theme.colors.textSecondary },
                  ]}
                >
                  {timeText}
                </Text>
              )}
            </View>

            {/* Phone */}
            {!!customerPhone && (
              <Text allowFontScaling={false}
                style={[styles.phoneText, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
              >
                {customerPhone}
              </Text>
            )}

            {/* Bottom row: Product + Last message */}
            <View style={styles.bottomRow}>
              <Text allowFontScaling={false}
                style={[
                  styles.messagePreview,
                  {
                    color: unread > 0 ? theme.colors.text : theme.colors.textSecondary,
                    fontWeight: unread > 0 ? '700' : '500',
                    textAlign: isRTL ? 'right' : 'left',
                  },
                ]}
                numberOfLines={1}
              >
                {lastMsgType === 'image' && (
                  <Ionicons name="image" size={12} color={theme.colors.textSecondary} style={{ marginRight: 4 }} />
                )}
                <Text allowFontScaling={false} style={styles.productLabel}>{showProduct ? productTitle + '  •  ' : ''}</Text>
                {lastText}
              </Text>
            </View>
          </View>

          {/* Right side: Badge + Delete */}
          <View style={[styles.rightSection, isRTL && { marginLeft: 0, marginRight: 10 }]}>
            {unread > 0 && (
              <LinearGradient
                colors={['#FF6A00', '#FF8C33']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.unreadBadge}
              >
                <Text allowFontScaling={false} style={styles.unreadText}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </LinearGradient>
            )}
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.6}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={16} color={isDark ? '#FF6B6B' : '#E53935'} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

ConversationCard.displayName = 'ConversationCard';

const AdminInboxScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isRTL = I18nManager.isRTL || i18n.language === 'ar' || i18n.language === 'ku';

  const adminUid = user?.uid || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!adminUid) {
        setConversations([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const unsub = subscribeToAdminConversations(adminUid, (list: any[]) => {
        // Show immediately, then fill in customer name/phone/avatar.
        setConversations(list as Conversation[]);
        setLoading(false);
        setRefreshing(false);
        enrichConversationsWithUsers(list).then((enriched) => {
          setConversations(enriched as Conversation[]);
        });
      });

      return () => unsub?.();
    }, [adminUid])
  );

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread?.admin || 0), 0),
    [conversations]
  );

  // Tapping the "Unread" pill filters the list to unread chats (toggle).
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const displayedConversations = useMemo(
    () => (showUnreadOnly ? conversations.filter((c) => (c.unread?.admin || 0) > 0) : conversations),
    [conversations, showUnreadOnly]
  );
  // Auto-clear the filter once everything's read (the pill disappears anyway).
  useEffect(() => {
    if (showUnreadOnly && totalUnread === 0) setShowUnreadOnly(false);
  }, [showUnreadOnly, totalUnread]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleDelete = useCallback((conversationId: string, customerName: string) => {
    Alert.alert(
      t('common.delete', 'Delete'),
      t('chat.deleteChatConfirm', { name: customerName, defaultValue: 'Delete chat with {{name}}? This cannot be undone.' }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            // Remove instantly; the realtime subscription will reconcile (or
            // re-add it if the server delete fails).
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            try {
              await softDeleteConversation(conversationId, 'admin');
            } catch (err: any) {
              Alert.alert(t('common.error', 'Error'), err.message);
            }
          },
        },
      ]
    );
  }, [t]);

  const handlePress = useCallback((item: Conversation) => {
    const snapshot = item.productSnapshot || {} as any;
    const rawTitle = snapshot.title?.trim() || '';
    const localizedTitle = (
      (i18n.language === 'ar' && snapshot.titleAr) ||
      (i18n.language === 'ku' && snapshot.titleKu) ||
      rawTitle ||
      t('chat.product', 'Product')
    );
    const thumb = snapshot.imageUrl || null;
    const customerName = item.userSnapshot?.name || t('chat.customer', 'Customer');
    const customerPhone = item.userSnapshot?.phone || '';

    navigation.navigate('ChatScreen', {
      conversationId: item.id,
      adminId: item.adminId,
      productId: item.productId,
      productName: localizedTitle,
      productImage: thumb,
      targetName: customerName,
      targetPhone: customerPhone,
      isAdminView: true,
      attachProduct: false,
    });
  }, [navigation, t, i18n]);

  const renderItem = useCallback(({ item, index }: { item: Conversation; index: number }) => {
    const customerName = item.userSnapshot?.name || t('chat.customer', 'Customer');
    return (
      <ConversationCard
        item={item}
        index={index}
        theme={theme}
        isDark={isDark}
        onPress={() => handlePress(item)}
        onDelete={() => handleDelete(item.id, customerName)}
        t={t}
        i18n={i18n}
      />
    );
  }, [theme, isDark, handlePress, handleDelete, t, i18n]);

  const keyExtractor = useCallback((item: Conversation) => item.id, []);
  const separatorComponent = useCallback(() => <View style={{ height: 8 }} />, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? theme.colors.background : '#F4F6FA' }]}
      edges={['left', 'right']}
    >
      {loading ? (
        <View style={[styles.center, { paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44) }]}>
          <ActivityIndicator size="large" color="#FF6A00" />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
            {t('chat.loadingConversations', 'Loading conversations...')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedConversations}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: SPACING.md,
            paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44),
            paddingBottom: 30,
          }}
          ItemSeparatorComponent={separatorComponent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF6A00"
              colors={['#FF6A00']}
            />
          }
          ListHeaderComponent={
            totalUnread > 0 ? (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setShowUnreadOnly((v) => !v)}>
                <LinearGradient
                  colors={['#FF6A0015', '#FF6A0008']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.headerPill, isRTL && { flexDirection: 'row-reverse', alignSelf: 'flex-end' }]}
                >
                  <Ionicons name={showUnreadOnly ? 'mail-open-outline' : 'mail-unread-outline'} size={14} color="#FF6A00" />
                  <Text allowFontScaling={false} style={styles.headerPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {showUnreadOnly
                      ? t('chat.showingUnreadTapAll', 'Showing unread — tap to show all')
                      : `${t('chat.unread', 'Unread')}: ${totalUnread}`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={[styles.center, { paddingTop: 60 }]}>
              <LinearGradient
                colors={['#FF6A0020', '#FF6A0008']}
                style={styles.emptyIconWrap}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={44} color="#FF6A00" />
              </LinearGradient>
              <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
                {t('chat.noMessages', 'No messages yet')}
              </Text>
              <Text allowFontScaling={false} style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
                {t('chat.waitForCustomers', 'Customers will appear here when they start a chat.')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },

  // ── Cards ──
  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...SHADOW_STYLES.small,
  },
  unreadAccent: {
    backgroundColor: '#FF6A00',
    borderRadius: 2,
    bottom: 8,
    left: 0,
    position: 'absolute',
    top: 8,
    width: 3,
  },
  rowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: 14,
    paddingLeft: 16,
  },

  // ── Avatar ──
  avatarWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    borderRadius: 25,
    height: 50,
    width: 50,
  },
  avatarFallback: {
    alignItems: 'center',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    includeFontPadding: false,
  },
  productMiniWrapper: {
    backgroundColor: '#F0F0F0',
    borderColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 2,
    bottom: -2,
    height: 22,
    overflow: 'hidden',
    position: 'absolute',
    right: -4,
    width: 22,
  },
  productMini: {
    borderRadius: 4,
    height: '100%',
    width: '100%',
  },
  orderMiniWrapper: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 2,
    bottom: -2,
    height: 22,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    right: -4,
    width: 22,
  },

  // ── Content ──
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  customerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    includeFontPadding: false,
    marginRight: 8,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  phoneText: {
    fontSize: 11,
    fontWeight: '600',
    includeFontPadding: false,
    marginTop: 1,
  },
  bottomRow: {
    marginTop: 4,
  },
  messagePreview: {
    fontSize: 13,
    fontWeight: '500',
    includeFontPadding: false,
  },
  productLabel: {
    fontWeight: '800',
  },

  // ── Right side ──
  rightSection: {
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginLeft: 10,
  },
  unreadBadge: {
    alignItems: 'center',
    borderRadius: 12,
    height: 22,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 7,
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    includeFontPadding: false,
  },
  deleteBtn: {
    borderRadius: 8,
    padding: 4,
  },

  // ── Header pill ──
  headerPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    marginBottom: SPACING.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerPillText: {
    color: '#FF6A00',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
  },

  // ── Empty state ──
  emptyIconWrap: {
    alignItems: 'center',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '900',
    includeFontPadding: false,
    marginTop: 16,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '600',
    includeFontPadding: false,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default AdminInboxScreen;
