/**
 * AdminConversationsListScreen - Admin inbox for product chats
 * 
 * Modern WhatsApp-inspired design with gradient avatars, animations, and filters.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Platform,
  Animated,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../components/ThemeProvider';
import { chatLastMessagePreview } from '../../utils/chatPreview';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { getDirection } from '../../locales';
import { SPACING, SHADOW_STYLES } from '../../constants/theme';
import { Conversation } from '../../types';
import {
  subscribeToAdminConversations,
  getAdminUnreadCount
} from '../../services/chatService';
import { supabase } from '../../services/supabase';

function formatTimeAgo(timestamp: any, t: (key: string, fallback: string) => string): string {
  if (!timestamp) return '';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return t('chat.justNow', 'Just now');
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

// Conversation Item Component
const ConversationItem = React.memo(({ 
  item, 
  index, 
  adminId, 
  userDataMap,
  t,
}: { 
  item: Conversation; 
  index: number;
  adminId: string;
  userDataMap: Record<string, { name: string; phone: string }>;
  t: (key: string, fallback: string) => string;
}) => {
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { i18n } = useTranslation();
  const isRTL = getDirection(i18n.language) === 'rtl';

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

  const unreadCount = item.unread?.admin || 0;
  const hasUnread = unreadCount > 0;
  const lastMessage = item.lastMessage;
  
  // Get user info
  const userName = item.userSnapshot?.name || userDataMap[item.userId]?.name || t('chat.customer', 'Customer');
  const userPhone = item.userSnapshot?.phone || userDataMap[item.userId]?.phone || '';

  // Generate a gradient color based on user name
  const getAvatarGradient = (name: string): [string, string] => {
    const colors: [string, string][] = [
      ['#667eea', '#764ba2'],
      ['#f093fb', '#f5576c'],
      ['#4facfe', '#00f2fe'],
      ['#43e97b', '#38f9d7'],
      ['#fa709a', '#fee140'],
      ['#a8edea', '#fed6e3'],
      ['#ff9a9e', '#fecfef'],
      ['#6a11cb', '#2575fc'],
    ];
    const idx = name.charCodeAt(0) % colors.length;
    return colors[idx];
  };

  const handlePress = () => {
    navigation.navigate('ChatScreen', {
      conversationId: item.id,
      adminId: adminId,
      productId: item.productId,
      productName: item.productSnapshot?.title,
      productImage: item.productSnapshot?.imageUrl,
      isAdminView: true,
      targetName: userName,
      targetPhone: userPhone,
      attachProduct: false,
    });
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY }] }}>
      <TouchableOpacity
        activeOpacity={0.7}
        style={[
          styles.conversationRow,
          {
            backgroundColor: hasUnread 
              ? (isDark ? theme.colors.primary + '15' : theme.colors.primary + '08')
              : theme.colors.surface,
          },
        ]}
        onPress={handlePress}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={getAvatarGradient(userName)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatar}
          >
            <Text allowFontScaling={false} style={styles.avatarText}>
              {String(userName).slice(0, 1).toUpperCase()}
            </Text>
          </LinearGradient>
        </View>

        {/* Content */}
        <View style={[styles.contentContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={{ flex: 1 }}>
            {/* Top Row: Name + Time */}
            <View style={[styles.topRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={{ flex: 1 }}>
                <Text allowFontScaling={false}
                  numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                  style={[
                    styles.userName,
                    { 
                      color: theme.colors.text,
                      textAlign: isRTL ? 'right' : 'left',
                      fontWeight: hasUnread ? '700' : '600',
                    },
                  ]}
                >
                  {userName}
                </Text>
                {userPhone ? (
                  <Text allowFontScaling={false}
                    numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
                    style={[
                      styles.userPhone,
                      { color: theme.colors.textSecondary, textAlign: isRTL ? 'right' : 'left' },
                    ]}
                  >
                    {userPhone}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.timeContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text allowFontScaling={false}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[styles.timeText, { color: hasUnread ? theme.colors.primary : theme.colors.textSecondary, minWidth: 60, textAlign: 'right' }]}
                >
                  {formatTimeAgo(lastMessage?.createdAt, t)}
                </Text>
              </View>
            </View>

            {/* Bottom Row: Message Preview + Badge */}
            <View style={[styles.bottomRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text allowFontScaling={false}
                numberOfLines={1}
                style={[
                  styles.messagePreview,
                  {
                    color: hasUnread ? theme.colors.text : theme.colors.textSecondary,
                    textAlign: isRTL ? 'right' : 'left',
                    fontWeight: hasUnread ? '500' : '400',
                  },
                ]}
              >
                {lastMessage ? (
                  lastMessage.senderType === 'admin'
                    ? `${t('chat.you', 'You')}: ${chatLastMessagePreview(lastMessage.text, (lastMessage as any).type, t)}`
                    : chatLastMessagePreview(lastMessage.text, (lastMessage as any).type, t)
                ) : t('chat.noMessages', 'No messages yet')}
              </Text>

              {/* Unread Badge */}
              {hasUnread && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <Text allowFontScaling={false} style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Product Thumbnail */}
          {item.productSnapshot?.imageUrl && (
            <View style={styles.productThumbContainer}>
              <Image
                source={{ uri: item.productSnapshot.imageUrl }}
                style={styles.productThumb}
                contentFit="cover"
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});
ConversationItem.displayName = 'ConversationItem';

const AdminConversationsListScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const isRTL = i18n?.language ? getDirection(i18n.language) === 'rtl' : false;
  const adminId = user?.uid || '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userDataMap, setUserDataMap] = useState<Record<string, { name: string; phone: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');

  // Fetch user data for conversations without userSnapshot
  const fetchMissingUserData = async (convos: Conversation[]) => {
    const missingUserIds = convos
      .filter(c => !c.userSnapshot?.name && c.userId)
      .map(c => c.userId)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    if (missingUserIds.length === 0) return;

    const newUserData: Record<string, { name: string; phone: string }> = {};

    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, full_name, email, phone')
        .in('id', missingUserIds);
      (usersData || []).forEach((u) => {
        newUserData[u.id] = {
          name: u.name || u.full_name || u.email || t('chat.customer', 'Customer'),
          phone: u.phone || '',
        };
      });
    } catch {
      // Silently fail
    }

    if (Object.keys(newUserData).length > 0) {
      setUserDataMap(prev => ({ ...prev, ...newUserData }));
    }
  };

  useEffect(() => {
    if (!adminId) return;

    const unsubscribe = subscribeToAdminConversations(adminId, (convos) => {
      setConversations(convos);
      setIsLoading(false);
      setRefreshing(false);
      fetchMissingUserData(convos);
    });

    return () => unsubscribe();
  }, [adminId]);

  // Filter conversations
  const filtered = useMemo(() => {
    let result = conversations;
    
    // Apply search filter
    const s = searchQuery.trim().toLowerCase();
    if (s) {
      result = result.filter((c) => {
        const name = c.userSnapshot?.name || userDataMap[c.userId]?.name || '';
        const phone = c.userSnapshot?.phone || userDataMap[c.userId]?.phone || '';
        return name.toLowerCase().includes(s) || phone.includes(s);
      });
    }
    
    // Apply unread filter
    if (activeFilter === 'unread') {
      result = result.filter(c => (c.unread?.admin || 0) > 0);
    }
    
    return result;
  }, [conversations, searchQuery, userDataMap, activeFilter]);

  const totalUnread = getAdminUnreadCount(conversations);

  const renderItem = useCallback(({ item, index }: { item: Conversation; index: number }) => {
    return (
      <ConversationItem 
        item={item} 
        index={index} 
        adminId={adminId}
        userDataMap={userDataMap}
        t={t}
      />
    );
  }, [adminId, userDataMap, t]);

  const renderHeader = () => (
    <View style={[styles.headerContainer, { backgroundColor: theme.colors.surface, paddingTop: insets.top + (Platform.OS === 'android' ? 94 : 44) }]}>
      {/* Title Row */}
      <View style={[styles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
        >
          <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={theme.colors.text} />
        </TouchableOpacity>
        
        <View style={{ flex: 1, marginLeft: isRTL ? 0 : SPACING.sm, marginRight: isRTL ? SPACING.sm : 0 }}>
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('chat.customerMessages', 'Customer Messages')}
          </Text>
          {totalUnread > 0 && (
            <Text allowFontScaling={false} style={[styles.unreadSubtitle, { color: theme.colors.primary, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('chat.unreadCount', '{{count}} unread', { count: totalUnread })}
            </Text>
          )}
        </View>
      </View>

      {/* Search Bar */}
      <View
        style={[
          styles.searchContainer,
          {
            backgroundColor: isDark ? theme.colors.background : '#f0f2f5',
            borderColor: isSearchFocused ? theme.colors.primary : 'transparent',
            borderWidth: isSearchFocused ? 1.5 : 0,
          },
        ]}
      >
        <Ionicons 
          name="search" 
          size={20} 
          color={isSearchFocused ? theme.colors.primary : theme.colors.textSecondary} 
        />
        <TextInput allowFontScaling={false}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('chat.searchCustomers', 'Search customers...')}
          placeholderTextColor={theme.colors.placeholder}
          style={[
            styles.searchInput,
            {
              color: theme.colors.text,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Pills */}
      <View style={[styles.filterRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity 
          style={[
            styles.filterPill, 
            activeFilter === 'all' && { backgroundColor: theme.colors.primary },
            activeFilter !== 'all' && { backgroundColor: isDark ? theme.colors.background : '#f0f2f5' },
          ]}
          onPress={() => setActiveFilter('all')}
        >
          <Text allowFontScaling={false} style={[
            styles.filterPillText, 
            { color: activeFilter === 'all' ? '#fff' : theme.colors.textSecondary }
          ]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {t('chat.all', 'All')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[
            styles.filterPill, 
            activeFilter === 'unread' && { backgroundColor: theme.colors.primary },
            activeFilter !== 'unread' && { backgroundColor: isDark ? theme.colors.background : '#f0f2f5' },
          ]}
          onPress={() => setActiveFilter('unread')}
        >
          <Text allowFontScaling={false} style={[
            styles.filterPillText, 
            { color: activeFilter === 'unread' ? '#fff' : theme.colors.textSecondary }
          ]}>
            {t('chat.unread', 'Unread')} {totalUnread > 0 && `(${totalUnread})`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.primary + '15' }]}>
        <Ionicons name="chatbubbles" size={48} color={theme.colors.primary} />
      </View>
      <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
        {t('chat.noConversations', 'No conversations yet')}
      </Text>
      <Text allowFontScaling={false} style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
        {t('chat.noConversationsDesc', 'Customer messages about your products will appear here')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? theme.colors.background : '#E3F2FD' }} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

        {renderHeader()}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text allowFontScaling={false} style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
              {t('chat.loadingConversations', 'Loading conversations...')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 24 },
              filtered.length === 0 && { flex: 1 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => setRefreshing(true)}
                colors={[theme.colors.primary]}
                tintColor={theme.colors.primary}
              />
            }
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
          />
        )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 27,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  backButton: {
    padding: 4,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    marginLeft: 8,
    minWidth: 22,
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  contentContainer: {
    alignItems: 'center',
    flex: 1,
  },
  conversationRow: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 14,
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
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  filterPill: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterRow: {
    gap: 8,
    marginTop: SPACING.md,
  },
  headerContainer: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    ...SHADOW_STYLES.small,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  listContent: {
    padding: SPACING.md,
  },
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
  messagePreview: {
    flex: 1,
    fontSize: 14,
  },
  productThumb: {
    borderRadius: 10,
    height: 44,
    width: 44,
  },
  productThumbContainer: {
    marginLeft: 10,
  },
  searchContainer: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    height: 44,
    marginTop: SPACING.md,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    height: 38,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlignVertical: 'center' as const,
  },
  timeContainer: {
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  titleRow: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  topRow: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  unreadSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  userName: {
    fontSize: 16,
  },
  userPhone: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default AdminConversationsListScreen;
