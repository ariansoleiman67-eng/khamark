import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Animated,
  Alert,
  Modal,
  Pressable
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../../components/ThemeProvider';
import { chatLastMessagePreview } from '../../utils/chatPreview';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { getDirection } from '../../locales';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { subscribeToUserConversations, softDeleteConversation, setConversationArchived, setConversationLabels } from '../../services/chatService';
import { CHAT_LABELS, getChatLabel } from '../../constants/chatLabels';
import { Conversation } from '../../types';
import { storeProfileService } from '../../services/storeProfileService';
import { useNotification } from '../../contexts/NotificationContext';


const ORANGE = '#FF6A00';
const WHITE = '#fff';
const DANGER = '#F44336';
const BADGE = '#FF3B30';
// const SUCCESS = '#22c55e'; // Unused
const SEARCH_BG = '#F5F5F5';

const COLORS = {
  border: '#f0f0f0',
  lightOrange: '#FF6A0015',
  checkbox: '#ccc',
};

function formatTimeAgo(ts: any, t: (key: string, fallback: string) => string) {
  try {
    // Supabase returns ISO strings; older data may be a Firestore Timestamp.
    const d = ts?.toDate?.() ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d || isNaN(d.getTime())) return '';

    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return t('chat.justNow', 'Just now');
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// Conversation Item Component
const ConversationItem = React.memo(({ item, index, isEditMode, isSelected, onToggleSelect, onOpenActions }: { item: Conversation; index: number; isEditMode?: boolean; isSelected?: boolean; onToggleSelect?: (id: string) => void; onOpenActions?: (item: Conversation) => void }) => {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { i18n, t } = useTranslation();
  const isRTL = getDirection(i18n.language) === 'rtl';

  const [resolvedStore, setResolvedStore] = useState<any>(item.storeSnapshot);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | undefined>(item.tenantId);

  // Fade-in animation
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index]);

  // Auto-resolve tenant info
  useEffect(() => {
    let active = true;

    const resolve = async () => {
      if (item.storeSnapshot?.storeName) return;

      if (item.tenantId) {
        try {
          const profile = await storeProfileService.getStoreProfile(item.tenantId);
          if (active && profile) {
            setResolvedStore(profile);
            return;
          }
        } catch {
          // ignore
        }
      }

      if (!item.tenantId && item.adminId) {
        try {
          const tId = await storeProfileService.getMyTenantId(item.adminId);
          if (tId) {
            if (active) setResolvedTenantId(tId);

            const profile = await storeProfileService.getStoreProfile(tId);
            if (active && profile) {
              setResolvedStore(profile);
            }
          }
        } catch {
          // ignore
        }
      }
    };

    resolve();
    return () => { active = false; };
  }, [item.id, item.storeSnapshot, item.tenantId, item.adminId]);

  // Determine Display Name
  const lang = i18n.language;
  let storeName = 'Store';
  
  if (resolvedStore) {
    if (lang === 'ar' && resolvedStore.storeNameAr) storeName = resolvedStore.storeNameAr;
    else if (lang === 'ku' && resolvedStore.storeNameKu) storeName = resolvedStore.storeNameKu;
    else storeName = resolvedStore.storeName || 'Store';
  } else if (item.adminSnapshot?.name) {
    storeName = item.adminSnapshot.name;
  } else if ((item as any).storeName) {
    storeName = (item as any).storeName;
  }

  const logoUrl = resolvedStore?.logoUrl || null;
  const lastMsgType = item.lastMessage?.type || 'text';
  // Only show product thumbnail when the last message is a product card
  const showProduct = lastMsgType === 'product';
  const productImg = showProduct ? (item.productSnapshot?.imageUrl || null) : null;
  
  const lastMessage = chatLastMessagePreview(
    item.lastMessage?.text || (item as any)?.lastMessageText,
    lastMsgType,
    t,
    item.productSnapshot?.title,
  );

  const unread = item.unread?.user || 0;

  // Detect if this conversation was opened from an Order
  const productTitle = item.productSnapshot?.title || '';
  const isOrderChat = showProduct && (productTitle.toLowerCase().startsWith('order') || productTitle.includes('#'));

  // User-assigned label ids (dots shown on the row)
  const labelIds = Array.isArray(item.labels?.user) ? item.labels!.user! : [];

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.conversationRow,
          {
            backgroundColor: isEditMode && isSelected
              ? COLORS.lightOrange
              : theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border + '20',
          }
        ]}
        onLongPress={() => {
          if (!isEditMode) onOpenActions?.(item);
        }}
        delayLongPress={250}
        onPress={() => {
          if (isEditMode && onToggleSelect) {
            onToggleSelect(item.id);
            return;
          }
          navigation.navigate('ChatScreen', {
            conversationId: item.id,
            adminId: item.adminId,
            productId: item.productId,
            productName: item.productSnapshot?.title,
            productImage: item.productSnapshot?.imageUrl,
            tenantId: resolvedTenantId || item.tenantId,
            attachProduct: false,
          });
        }}
      >
        {/* Selection Checkbox */}
        {isEditMode && (
          <TouchableOpacity
            onPress={() => onToggleSelect?.(item.id)}
            style={styles.checkboxContainer}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              isSelected && styles.checkboxSelected,
            ]}>
              {isSelected && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
        )}
        
        {/* Avatar with Online Status AND Unread Badge (Alibaba Style) */}
        <View style={styles.avatarContainer}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <LinearGradient
              colors={[ORANGE, '#FF8F00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text allowFontScaling={false} style={styles.avatarText}>
                {String(storeName).slice(0, 1).toUpperCase()}
              </Text>
            </LinearGradient>
          )}
          
          {/* Online Status Indicator (Bottom Right) */}
          {/* {isOnline && (
            <View style={[styles.onlineIndicator, { borderColor: theme.colors.surface }]} />
          )} */}

          {/* Unread Badge (Top Right of Avatar) */}
          {unread > 0 && (
            <View style={styles.avatarBadge}>
              <Text allowFontScaling={false} style={styles.avatarBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          )}
        </View>

        {/* Message Content */}
        <View style={[styles.contentContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={{ flex: 1 }}>
            {/* Top Row: Name + Time */}
            <View style={[styles.topRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text allowFontScaling={false}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                style={[
                  styles.storeName,
                  { 
                    color: theme.colors.text,
                    textAlign: isRTL ? 'right' : 'left',
                    fontWeight: unread > 0 ? '700' : '600',
                    fontSize: 16,
                  },
                ]}
              >
                {storeName}
              </Text>
              <Text allowFontScaling={false} 
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.timeText, { color: theme.colors.textSecondary, fontSize: 11, minWidth: 60, textAlign: 'right' }]}
              >
                {formatTimeAgo(item.updatedAt, t)}
              </Text>
            </View>

            {/* Bottom Row: Message Preview only */}
            <View style={[styles.messagePreviewContainer, { flexDirection: isRTL ? 'row-reverse' : 'row', marginTop: 2 }]}>
              {/* Assigned label dots */}
              {labelIds.length > 0 && (
                <View style={[styles.labelDotsRow, { flexDirection: isRTL ? 'row-reverse' : 'row', marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }]}>
                  {labelIds.map((lid) => {
                    const lbl = getChatLabel(lid);
                    if (!lbl) return null;
                    return <View key={lid} style={[styles.labelDot, { backgroundColor: lbl.color }]} />;
                  })}
                </View>
              )}
              {/* Message type indicator */}
              {item.lastMessage?.type === 'image' && (
                <Ionicons 
                  name="image" 
                  size={14} 
                  color={theme.colors.textSecondary} 
                  style={{ marginRight: isRTL ? 0 : 4, marginLeft: isRTL ? 4 : 0 }}
                />
              )}
              <Text allowFontScaling={false}
                numberOfLines={1}
                style={[
                  (styles as any).messagePreview,
                  {
                    color: theme.colors.textSecondary,
                    textAlign: isRTL ? 'right' : 'left',
                    fontWeight: '400',
                    fontSize: 13,
                  },
                ]}
              >
                {lastMessage}
              </Text>
            </View>
          </View>

          {/* Product Thumbnail or Order Badge */}
          {isOrderChat ? (
            <View style={styles.orderBadgeContainer}>
              <LinearGradient
                colors={['#FF6A00', '#FF9A44']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.orderBadge}
              >
                <Ionicons name="cube" size={16} color="#fff" />
                <Text allowFontScaling={false} style={styles.orderBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {t('common.order', 'Order')}
                </Text>
              </LinearGradient>
            </View>
          ) : productImg ? (
            <View style={styles.productThumbContainer}>
              <Image
                source={{ uri: productImg }}
                style={styles.productThumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});
ConversationItem.displayName = 'ConversationItem';

export default function ConversationsScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, isGuest } = useAuth();
  const { i18n, t } = useTranslation();
  const navigation = useNavigation<any>();
  const isRTL = getDirection(i18n.language) === 'rtl';
  const { ordersBadgeCount, badgeCount } = useNotification();

  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // const [isSearchFocused, setIsSearchFocused] = useState(false); // Unused
  const [filter, setFilter] = useState<'all' | 'unread' | 'ordered' | 'mylabel' | 'archived'>('all');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [actionConv, setActionConv] = useState<Conversation | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Header animation
  const scrollY = React.useRef(new Animated.Value(0)).current;

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const unsub = subscribeToUserConversations(user.uid, (data) => {
      setItems(data || []);
      setLoading(false);
      setRefreshing(false);
    });

    return () => unsub?.();
  }, [user?.uid, refreshKey]);

  const filtered = useMemo(() => {
    let result = items;

    // Archive gate: only the "archived" tab shows archived chats; everything
    // else hides them.
    if (filter === 'archived') {
      result = result.filter(c => c.archivedBy?.user === true);
    } else {
      result = result.filter(c => c.archivedBy?.user !== true);
    }

    // Apply sub-filters
    if (filter === 'unread') {
      result = result.filter(c => (c.unread?.user || 0) > 0);
    } else if (filter === 'ordered') {
      // Conversations that carry an order/product context
      result = result.filter(c =>
        c.lastMessage?.type === 'product' ||
        !!c.productSnapshot?.title ||
        !!c.productId
      );
    } else if (filter === 'mylabel') {
      // When no specific label picked, show every labelled chat; else that label.
      result = selectedLabel
        ? result.filter(c => Array.isArray(c.labels?.user) && c.labels!.user!.includes(selectedLabel))
        : result.filter(c => Array.isArray(c.labels?.user) && c.labels!.user!.length > 0);
    }

    // Apply search filter (name OR last message text)
    const s = searchQuery.trim().toLowerCase();
    if (s) {
      result = result.filter((c) => {
        const name =
          c.storeSnapshot?.storeName ||
          c.adminSnapshot?.name ||
          (c as any)?.storeName ||
          'Store';
        const msg = c.lastMessage?.text || (c as any)?.lastMessageText || '';
        return (
          String(name).toLowerCase().includes(s) ||
          String(msg).toLowerCase().includes(s)
        );
      });
    }

    return result;
  }, [items, searchQuery, filter, selectedLabel]);

  // Unread badge on the pill must match what the Unread tab can actually show:
  // archived chats are hidden there, so don't count their unread.
  const unreadTotal = useMemo(
    () => items.filter(c => c.archivedBy?.user !== true).reduce((acc, c) => acc + (c.unread?.user || 0), 0),
    [items]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  }, [filtered, selectedIds.size]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('chat.deleteTitle', 'Delete Conversations'),
      t('chat.deleteConfirm', 'Are you sure you want to delete {{count}} conversation(s)? This cannot be undone.', { count: selectedIds.size }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const promises = Array.from(selectedIds).map(id => softDeleteConversation(id, 'user'));
              await Promise.all(promises);
              setSelectedIds(new Set());
              setIsEditMode(false);
            } catch (error) {
              Alert.alert(t('common.error', 'Error'), t('chat.deleteError', 'Failed to delete some conversations'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }, [selectedIds, t]);

  const openActions = useCallback((conv: Conversation) => {
    setActionConv(conv);
  }, []);

  const handleArchiveToggle = useCallback(async (conv: Conversation) => {
    const prevArchived = conv.archivedBy?.user === true;
    const next = !prevArchived;
    setActionConv(null);
    // Optimistic: reflect immediately; realtime refetch will confirm.
    setItems(prev => prev.map(c => c.id === conv.id
      ? { ...c, archivedBy: { ...(c.archivedBy || {}), user: next } }
      : c));
    try {
      await setConversationArchived(conv.id, 'user', next);
    } catch {
      // DB never changed → no realtime event to correct us. Roll back manually.
      setItems(prev => prev.map(c => c.id === conv.id
        ? { ...c, archivedBy: { ...(c.archivedBy || {}), user: prevArchived } }
        : c));
      Alert.alert(t('common.error', 'Error'), t('chat.actionFailed', 'Action failed. Please try again.'));
    }
  }, [t]);

  const handleToggleLabel = useCallback(async (conv: Conversation, labelId: string) => {
    const current = Array.isArray(conv.labels?.user) ? conv.labels!.user! : [];
    const has = current.includes(labelId);
    const nextLabels = has ? current.filter(l => l !== labelId) : [...current, labelId];
    // Keep the sheet open (multi-select) but update its snapshot + the list optimistically.
    setActionConv(prev => (prev && prev.id === conv.id)
      ? { ...prev, labels: { ...(prev.labels || {}), user: nextLabels } }
      : prev);
    setItems(prev => prev.map(c => c.id === conv.id
      ? { ...c, labels: { ...(c.labels || {}), user: nextLabels } }
      : c));
    try {
      // Write the full computed array (client is source of truth); serialized in
      // the service so rapid toggles compose instead of clobbering.
      await setConversationLabels(conv.id, 'user', nextLabels);
    } catch {
      // Roll back to the pre-toggle set (no realtime event fires on failure).
      setActionConv(prev => (prev && prev.id === conv.id)
        ? { ...prev, labels: { ...(prev.labels || {}), user: current } }
        : prev);
      setItems(prev => prev.map(c => c.id === conv.id
        ? { ...c, labels: { ...(c.labels || {}), user: current } }
        : c));
      Alert.alert(t('common.error', 'Error'), t('chat.actionFailed', 'Action failed. Please try again.'));
    }
  }, [t]);

  const handleDeleteFromSheet = useCallback((conv: Conversation) => {
    setActionConv(null);
    Alert.alert(
      t('chat.deleteTitle', 'Delete Conversations'),
      t('chat.deleteOneConfirm', 'Delete this conversation? This cannot be undone.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteConversation(conv.id, 'user');
            } catch {
              Alert.alert(t('common.error', 'Error'), t('chat.deleteError', 'Failed to delete some conversations'));
            }
          },
        },
      ]
    );
  }, [t]);

  const renderItem = useCallback(({ item, index }: { item: Conversation; index: number }) => {
    return (
      <ConversationItem
        item={item}
        index={index}
        isEditMode={isEditMode}
        isSelected={selectedIds.has(item.id)}
        onToggleSelect={toggleSelect}
        onOpenActions={openActions}
      />
    );
  }, [isEditMode, selectedIds, toggleSelect, openActions]);

  const renderHeader = () => (
    <View style={[styles.headerContainer, { backgroundColor: isDark ? theme.colors.surface : WHITE, borderBottomColor: isDark ? theme.colors.border : COLORS.border }]}>
      
      {/* 1. Top Bar: Title + Actions */}
      <View style={styles.topBar}>
        <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
          {t('chat.messenger', 'Messenger')}
        </Text>
        <TouchableOpacity onPress={() => setIsEditMode(!isEditMode)}>
          <Ionicons name="trash-outline" size={24} color={theme.colors.text} style={{ marginLeft: 20 }} />
        </TouchableOpacity>
      </View>

      {/* 2. Shortcuts Row */}
      <View style={styles.shortcutsRow}>
        {/* Orders Tab with Badge */}
        <TouchableOpacity 
          style={styles.shortcutItem}
          onPress={() => {
            if (isGuest) {
              navigation.navigate('LoginGate', { reason: 'orders' });
              return;
            }
            navigation.navigate('Orders');
          }}
        >
          <View style={[styles.shortcutIconContainer, { backgroundColor: isDark ? theme.colors.primary + '15' : COLORS.lightOrange }]}>
            <Ionicons name="receipt-outline" size={24} color={isDark ? theme.colors.primary : ORANGE} />
            {ordersBadgeCount > 0 && (
              <View style={styles.badgeContainer}>
                <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {ordersBadgeCount > 99 ? '99+' : ordersBadgeCount}
                </Text>
              </View>
            )}
          </View>
          <Text allowFontScaling={false} style={[styles.shortcutLabel, { color: theme.colors.text }]}>{t('common.orders')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.shortcutItem}
          onPress={() => navigation.navigate('Notifications')}
        >
          <View style={[styles.shortcutIconContainer, { backgroundColor: isDark ? theme.colors.primary + '15' : COLORS.lightOrange }]}>
             <Ionicons name="notifications-outline" size={24} color={isDark ? theme.colors.primary : ORANGE} />
            {badgeCount > 0 && (
              <View style={styles.badgeContainer}>
                <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Text>
              </View>
            )}
          </View>
          <Text allowFontScaling={false} style={[styles.shortcutLabel, { color: theme.colors.text }]}>
            {t('common.notifications', 'Notifications')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Search Bar */}
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: isDark ? theme.colors.background : SEARCH_BG,
            flexDirection: isRTL ? 'row-reverse' : 'row'
          },
        ]}
      >
        <Ionicons 
          name="search-outline" 
          size={20} 
          color={theme.colors.textSecondary} 
          style={{ marginHorizontal: 8 }}
        />
        <TextInput allowFontScaling={false}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('chat.searchMessagesOrSuppliers', 'Search messages or suppliers')}
          placeholderTextColor={theme.colors.textSecondary}
          style={[
            styles.searchInput,
            {
              color: theme.colors.text,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        />
      </View>

      {/* 4. Filter Pills Row */}
      <View style={[styles.filterRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity 
          style={[
            styles.filterPill,
            filter === 'unread' ? [styles.filterPillActive, isDark && { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary }] : { borderColor: theme.colors.border }
          ]}
          onPress={() => setFilter(filter === 'unread' ? 'all' : 'unread')}
        >
          <Text allowFontScaling={false} style={[
            styles.filterPillText, 
            filter === 'unread' ? { color: isDark ? theme.colors.primary : ORANGE } : { color: theme.colors.textSecondary }
          ]}>
             {t('chat.unread', 'Unread')}
             {unreadTotal > 0 && (
               <Text allowFontScaling={false} style={{fontSize: 10, lineHeight: 10, fontWeight: '700', color: filter === 'unread' ? (isDark ? theme.colors.primary : ORANGE) : theme.colors.textSecondary }}>
                 {' '}{unreadTotal > 99 ? '99+' : unreadTotal}
               </Text>
             )}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.filterPill,
            filter === 'ordered' ? [styles.filterPillActive, isDark && { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary }] : { borderColor: theme.colors.border }
          ]}
          onPress={() => setFilter(filter === 'ordered' ? 'all' : 'ordered')}
        >
          <Text allowFontScaling={false} style={[
            styles.filterPillText, 
            filter === 'ordered' ? { color: isDark ? theme.colors.primary : ORANGE } : { color: theme.colors.textSecondary }
          ]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
             {t('chat.ordered', 'Ordered')}
          </Text>
        </TouchableOpacity>

        {/* My label pill → opens label picker */}
        <TouchableOpacity
          style={[
            styles.filterPill,
            filter === 'mylabel' ? [styles.filterPillActive, isDark && { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary }] : { borderColor: theme.colors.border }
          ]}
          onPress={() => setLabelMenuOpen(true)}
        >
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 3 }}>
            {filter === 'mylabel' && selectedLabel && (
              <View style={[styles.labelDot, { backgroundColor: getChatLabel(selectedLabel)?.color || ORANGE }]} />
            )}
            <Text allowFontScaling={false} style={[
              styles.filterPillText,
              filter === 'mylabel' ? { color: isDark ? theme.colors.primary : ORANGE } : { color: theme.colors.textSecondary }
            ]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {filter === 'mylabel' && selectedLabel
                ? t(getChatLabel(selectedLabel)?.nameKey || 'chat.mylabel', 'My label')
                : t('chat.mylabel', 'My label')}
            </Text>
            <Ionicons name="chevron-down" size={12} color={filter === 'mylabel' ? (isDark ? theme.colors.primary : ORANGE) : theme.colors.textSecondary} />
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Archived */}
        <TouchableOpacity
          style={[
            styles.archiveButton,
            filter === 'archived'
              ? { backgroundColor: isDark ? theme.colors.primary + '15' : COLORS.lightOrange, borderColor: isDark ? theme.colors.primary : ORANGE }
              : { borderColor: theme.colors.border }
          ]}
          onPress={() => { setSelectedLabel(null); setFilter(filter === 'archived' ? 'all' : 'archived'); }}
        >
          <Ionicons name="archive-outline" size={18} color={filter === 'archived' ? (isDark ? theme.colors.primary : ORANGE) : theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Select All Bar (Only in Edit Mode) */}
      {isEditMode && items.length > 0 && (
        <View style={styles.selectAllRow}>
          <TouchableOpacity
            onPress={selectAll}
            style={styles.selectAllButton}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              selectedIds.size === filtered.length && filtered.length > 0 && styles.checkboxSelected,
            ]}>
              {selectedIds.size === filtered.length && filtered.length > 0 && (
                <Ionicons name="checkmark" size={14} color={WHITE} />
              )}
            </View>
            <Text allowFontScaling={false} style={[styles.selectAllText, { color: theme.colors.text }]}>
              {selectedIds.size === filtered.length && filtered.length > 0
                ? t('chat.deselectAll', 'Deselect All')
                : t('chat.selectAll', 'Select All')}
            </Text>
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.selectedCount, { color: theme.colors.textSecondary }]}>
            {t('chat.selectedCount', '{{count}} selected', { count: selectedIds.size })}
          </Text>
        </View>
      )}

    </View>
  );

  const renderEmptyState = () => {
    let icon: any = 'chatbubbles';
    let title = t('chat.noConversationsTitle', 'No messages yet');
    let subtitle = t('chat.noConversationsSubtitle', 'Start a conversation with a store about their products');
    if (filter === 'archived') {
      icon = 'archive-outline';
      title = t('chat.noArchivedTitle', 'No archived chats');
      subtitle = t('chat.noArchivedSubtitle', 'Long-press a chat and choose Archive to tuck it away here.');
    } else if (filter === 'mylabel') {
      icon = 'pricetag-outline';
      title = t('chat.noLabeledTitle', 'No labeled chats');
      subtitle = t('chat.noLabeledSubtitle', 'Long-press a chat and pick a label to organize it.');
    } else if (filter === 'unread') {
      icon = 'checkmark-done-outline';
      title = t('chat.noUnreadTitle', 'You\'re all caught up');
      subtitle = t('chat.noUnreadSubtitle', 'No unread conversations right now.');
    }
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? theme.colors.primary + '15' : COLORS.lightOrange }]}>
          <Ionicons name={icon} size={48} color={isDark ? theme.colors.primary : ORANGE} />
        </View>
        <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
    );
  };

  // ---- Label filter dropdown ----
  const renderLabelMenu = () => (
    <Modal visible={labelMenuOpen} transparent animationType="fade" onRequestClose={() => setLabelMenuOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setLabelMenuOpen(false)}>
        <Pressable style={[styles.labelMenuCard, { backgroundColor: theme.colors.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text allowFontScaling={false} style={[styles.sheetTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('chat.filterByLabel', 'Filter by label')}
          </Text>
          <TouchableOpacity
            style={[styles.labelMenuRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => { setSelectedLabel(null); setFilter('mylabel'); setLabelMenuOpen(false); }}
          >
            <Ionicons name="pricetags-outline" size={18} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.labelMenuText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('chat.allLabels', 'All labeled')}
            </Text>
            {filter === 'mylabel' && !selectedLabel && <Ionicons name="checkmark" size={18} color={ORANGE} />}
          </TouchableOpacity>
          {CHAT_LABELS.map((lbl) => (
            <TouchableOpacity
              key={lbl.id}
              style={[styles.labelMenuRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={() => { setSelectedLabel(lbl.id); setFilter('mylabel'); setLabelMenuOpen(false); }}
            >
              <View style={[styles.labelDotLg, { backgroundColor: lbl.color }]} />
              <Text allowFontScaling={false} style={[styles.labelMenuText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {t(lbl.nameKey, lbl.id)}
              </Text>
              {filter === 'mylabel' && selectedLabel === lbl.id && <Ionicons name="checkmark" size={18} color={ORANGE} />}
            </TouchableOpacity>
          ))}
          {filter === 'mylabel' && (
            <TouchableOpacity
              style={styles.labelClearBtn}
              onPress={() => { setSelectedLabel(null); setFilter('all'); setLabelMenuOpen(false); }}
            >
              <Text allowFontScaling={false} style={[styles.labelClearText, { color: theme.colors.textSecondary }]}>
                {t('chat.clearFilter', 'Clear filter')}
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ---- Per-conversation action sheet (long-press) ----
  const renderActionSheet = () => {
    const conv = actionConv;
    if (!conv) return null;
    const isArchived = conv.archivedBy?.user === true;
    const convLabels = Array.isArray(conv.labels?.user) ? conv.labels!.user! : [];
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setActionConv(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setActionConv(null)}>
          <Pressable style={[styles.sheetCard, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 12 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />

            {/* Labels */}
            <Text allowFontScaling={false} style={[styles.sheetSectionTitle, { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('chat.labelsTitle', 'Labels')}
            </Text>
            <View style={[styles.labelChipsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {CHAT_LABELS.map((lbl) => {
                const on = convLabels.includes(lbl.id);
                return (
                  <TouchableOpacity
                    key={lbl.id}
                    style={[
                      styles.labelChip,
                      { borderColor: lbl.color, backgroundColor: on ? lbl.color : 'transparent' },
                    ]}
                    onPress={() => handleToggleLabel(conv, lbl.id)}
                    activeOpacity={0.8}
                  >
                    {!on && <View style={[styles.labelDot, { backgroundColor: lbl.color }]} />}
                    {on && <Ionicons name="checkmark" size={13} color="#fff" />}
                    <Text allowFontScaling={false} style={[styles.labelChipText, { color: on ? '#fff' : theme.colors.text }]}>
                      {t(lbl.nameKey, lbl.id)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.sheetDivider, { backgroundColor: theme.colors.border + '40' }]} />

            {/* Archive */}
            <TouchableOpacity style={[styles.sheetAction, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => handleArchiveToggle(conv)} activeOpacity={0.7}>
              <Ionicons name={isArchived ? 'arrow-undo-outline' : 'archive-outline'} size={22} color={theme.colors.text} />
              <Text allowFontScaling={false} style={[styles.sheetActionText, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
                {isArchived ? t('chat.unarchive', 'Unarchive') : t('chat.archive', 'Archive')}
              </Text>
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity style={[styles.sheetAction, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => handleDeleteFromSheet(conv)} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={22} color={DANGER} />
              <Text allowFontScaling={false} style={[styles.sheetActionText, { color: DANGER, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('common.delete', 'Delete')}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      {renderHeader()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
            {t('chat.loadingConversations', 'Loading conversations...')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(x) => x.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 24 },
            filtered.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setRefreshKey((prev) => prev + 1);
                
                // Safety timeout: 5s max
                setTimeout(() => {
                    setRefreshing(false);
                }, 5000);
              }}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
        />
      )}

      {/* Bulk Delete Bar */}
      {isEditMode && selectedIds.size > 0 && (
        <View style={styles.bulkDeleteBar}>
          <TouchableOpacity
            style={[styles.bulkDeleteButton, isDeleting && { opacity: 0.5 }]}
            onPress={handleBulkDelete}
            disabled={isDeleting}
            activeOpacity={0.8}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={WHITE} />
            ) : (
              <>
                <Ionicons name="trash" size={20} color={WHITE} style={{ marginRight: 8 }} />
                <Text allowFontScaling={false} style={styles.bulkDeleteText}>
                  {t('chat.deleteSelected', 'Delete ({{count}})', { count: selectedIds.size })}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {renderLabelMenu()}
      {renderActionSheet()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: WHITE,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  shortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.sm,
  },
  shortcutItem: {
    alignItems: 'center',
    gap: 6,
  },

  shortcutIconContainer: {
    alignItems: 'center',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  shortcutLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  searchContainer: {
    alignItems: 'center',
    borderRadius: 26,
    flexDirection: 'row',
    height: 48,
    marginBottom: SPACING.md,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 38,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center' as const,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  filterPill: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filterPillActive: {
    backgroundColor: COLORS.lightOrange,
    borderColor: ORANGE,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  archiveButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  // Label dots on rows / pills
  labelDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  labelDotLg: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  labelDotsRow: {
    alignItems: 'center',
    gap: 3,
  },
  // Modals (label menu + action sheet)
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  labelMenuCard: {
    borderRadius: 16,
    marginBottom: 'auto',
    marginTop: 'auto',
    marginHorizontal: SPACING.lg,
    padding: SPACING.md,
    ...SHADOW_STYLES.medium,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  labelMenuRow: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  labelMenuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  labelClearBtn: {
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 10,
  },
  labelClearText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: 10,
    ...SHADOW_STYLES.medium,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#ccc',
    borderRadius: 3,
    height: 5,
    marginBottom: SPACING.md,
    width: 40,
  },
  sheetSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  labelChipsRow: {
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  labelChip: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  labelChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetDivider: {
    height: 1,
    marginVertical: SPACING.sm,
  },
  sheetAction: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  sheetActionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  // List Styles
  listContent: {
    paddingTop: 0,
  },
  conversationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 14,
  },
  avatarContainer: {
    marginRight: 12,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  avatarText: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '700',
  },
  // New Avatar Badge Style
  avatarBadge: {
    alignItems: 'center',
    backgroundColor: BADGE,
    borderColor: WHITE,
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  avatarBadgeText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  storeName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 11,
  },
  messagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  // ALIBABA: Badge Styles
  badgeContainer: {
    alignItems: 'center',
    backgroundColor: BADGE,
    borderColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -8,
    top: -5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  productThumbContainer: {
    marginLeft: 10,
  },
  productThumb: {
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  orderBadgeContainer: {
    marginLeft: 10,
  },
  orderBadge: {
    alignItems: 'center',
    borderRadius: 10,
    gap: 2,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  orderBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    includeFontPadding: false,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  
  // Selection
  checkboxContainer: {
    marginRight: 10,
    padding: 2,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: COLORS.checkbox,
    borderRadius: 6,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxSelected: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  selectAllRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  selectAllButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  bulkDeleteBar: {
    borderTopColor: 'rgba(0,0,0,0.1)',
    borderTopWidth: 1,
    bottom: 105,
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
    zIndex: 50,
    ...SHADOW_STYLES.medium,
  },
  bulkDeleteButton: {
    alignItems: 'center',
    backgroundColor: DANGER,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  bulkDeleteText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '700',
  },

  // Loading / Empty
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyIconContainer: {
    alignItems: 'center',
    borderRadius: 50,
    height: 100,
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    width: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
