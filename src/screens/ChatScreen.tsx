import { supabase } from '../services/supabase';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
  Keyboard,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAudioRecorder, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { markConversationAsRead, sendMessage, softDeleteConversation, toggleBlockUser, deleteMessage, subscribeToConversation, subscribeToMessages } from '../services/chatService';
import { chatbotService } from '../services/chatbotService';
import { SHADOW_STYLES } from '../constants/theme';
import ImageViewerModal from '../components/ImageViewerModal';
import AttachmentMenu from '../components/chat/AttachmentMenu';
import { VoiceBubble } from '../components/VoiceBubble';
import { VoiceMessagePlaybackProvider } from '../components/voice/VoiceMessagePlaybackProvider';

// ---------- Types ----------
type ChatRoute = RouteProp<
  {
    ChatScreen: {
      conversationId: string;
      adminId: string;
      productId: string;
      productName?: string;
      productImage?: string | null;
      tenantId?: string;
      attachProduct?: boolean;
    };
  },
  'ChatScreen'
>;

type StoreProfile = {
  storeName?: string;
  storeNameAr?: string;
  storeNameKu?: string;
  logoUrl?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;

  addressText?: string;
  addressTextAr?: string;
  addressTextKu?: string;
  city?: string;

  location?: { latitude: number; longitude: number };
  isActive?: boolean;
  updatedAt?: any;
};

type ProductPayload = {
  id: string;
  name: string;
  image?: string;
  price?: string;
  partNumber?: string;
  stockQty?: number;
};

type FileMetadata = {
  name: string;
  size: number;
  mimeType: string;
};

type Message = {
  id: string;
  senderId: string;
  senderType: 'user' | 'admin';
  type: 'text' | 'image' | 'product' | 'file' | 'order' | 'voice';
  text: string;
  attachmentUrl?: string | null;
  fileMetadata?: FileMetadata | null;
  createdAt?: any;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  localUri?: string;
};

// ---------- Helpers ----------
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

const formatTime = (ts: any): string => {
  const ms = toMillis(ts);
  if (!ms) return '';
  const d = new Date(ms);
  const hh = d.getHours();
  const mm = d.getMinutes();
  const h12 = hh % 12 || 12;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const m2 = mm < 10 ? `0${mm}` : `${mm}`;
  return `${h12}:${m2} ${ampm}`;
};

// Calendar-day key for grouping messages under date dividers.
const dayKey = (ts: any): string => {
  const ms = toMillis(ts);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

// "Today / Yesterday / Jun 3" pill shown above each day's first message.
const DateDivider = React.memo(({ label, theme }: { label: string; theme: any }) => (
  <View style={{ alignItems: 'center', marginVertical: 10 }}>
    <View style={{
      backgroundColor: (theme?.colors?.surface) || 'rgba(0,0,0,0.06)',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    }}>
      <Text allowFontScaling={false} style={{ fontSize: 12, fontWeight: '700', color: theme?.colors?.textSecondary }}>{label}</Text>
    </View>
  </View>
));
DateDivider.displayName = 'DateDivider';

// Animated "typing…" bubble shown at the bottom of the thread.
const TypingIndicator = React.memo(({ theme }: { theme: any }) => {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;
  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 350, delay: i * 150, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 350, useNativeDriver: true }),
      ]))
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);
  return (
    <View style={{
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme?.colors?.surface || 'rgba(0,0,0,0.06)',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      marginHorizontal: 12,
      marginTop: 4,
    }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, marginHorizontal: 2, backgroundColor: theme?.colors?.textSecondary, opacity: v }} />
      ))}
    </View>
  );
});
TypingIndicator.displayName = 'TypingIndicator';

const getLocalizedStoreName = (profile: StoreProfile | null, lang: string) => {
  if (!profile) return 'Store';
  if (lang === 'ar') return profile.storeNameAr || profile.storeName || 'Store';
  if (lang === 'ku') return profile.storeNameKu || profile.storeName || 'Store';
  return profile.storeName || 'Store';
};

// ... (existing helper functions)

async function resolveTenantIdFromProduct(productId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('parts').select('tenant_id').eq('id', productId).maybeSingle();
    if (error || !data) return null;
    return data.tenant_id || null;
  } catch {
    return null;
  }
}

async function loadPublicStoreProfile(tenantId: string): Promise<StoreProfile | null> {
  try {
    const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (error || !data) return null;
    return {
      storeName: data.store_name,
      storeNameAr: data.store_name_ar,
      storeNameKu: data.store_name_ku,
      logoUrl: data.logo_url,
      phone: data.phone,
      whatsapp: data.whatsapp,
      email: data.email,
      addressText: data.address_text,
      addressTextAr: data.address_text_ar,
      addressTextKu: data.address_text_ku,
      city: data.city,
      location: data.location,
      isActive: data.is_active,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

function normalizePhoneForWhatsApp(p?: string) {
  if (!p) return '';
  return p.replace(/[^\d+]/g, '');
}

// ---------- UI ----------
// ... imports
import { ImageService } from '../services/imageService';
import { addressService } from '../services/addressService';
import { storeProfileService } from '../services/storeProfileService';


// Stable separator component (defined outside render to avoid re-render churn)
const ChatItemSeparator = () => <View style={{ height: 8 }} />;

// Product Bubble Component
const ProductBubble: React.FC<{
  mine: boolean;
  data: any;
  time: string;
  theme: any;
  isAdmin?: boolean;
}> = ({ mine, data, time, theme, isAdmin }) => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  if (!data) return null;
  
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
      {/* 
        ALIBABA STYLE CARD:
        - Width: ~260-280px
        - Image: Full width, Aspect Ratio ~4:3 or 1:1, Rounded Top corners
        - Content: White background, Padding, Price prominent, Button at bottom
      */}
      <View
        style={[
          styles.bubble,
          { 
            backgroundColor: theme.colors.surface, // Always surface color (white/dark) regardless of 'mine'
            borderColor: theme.colors.border + '40', 
            borderWidth: 1,
            padding: 0, // Reset padding for card layout
            width: 260,
            overflow: 'hidden', // Clip image
            borderRadius: 12
          }
        ]}
      >
        {/* Header / Title Bar (Optional, maybe just 'Product') */}
        <View style={{ 
            backgroundColor: theme.colors.background,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border + '20',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <Text allowFontScaling={false} style={{ 
                fontSize: 10, 
                color: theme.colors.textSecondary,
                fontWeight: 'bold',
                textTransform: 'uppercase'
            }}>
                {mine ? t('chat.youSentProduct', { defaultValue: 'You sent a product' }) : t('chat.productInquiry', { defaultValue: 'Product Inquiry' })}
            </Text>
            <Text allowFontScaling={false} style={{ fontSize: 10, color: theme.colors.textSecondary }}>{time}</Text>
        </View>

        {/* Product Image - Large Hero Style */}
        <View style={{ 
            width: '100%', 
            height: 180, // Generous height like Alibaba
            backgroundColor: theme.dark ? theme.colors.surface : '#f5f5f5',
            position: 'relative'
        }}>
            {data.image ? (
                <Image 
                    source={{ uri: data.image }} 
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={data.image}
                />
            ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={48} color="#ccc" />
                </View>
            )}
            
            {/* Stock Overlay */}
            {data.stockQty !== undefined && (
                <View style={{ 
                    position: 'absolute', 
                    top: 8, 
                    right: 8,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4
                }}>
                     <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                         {data.stockQty > 0 ? t('chat.inStock', { defaultValue: 'In Stock' }) : t('chat.outOfStock', { defaultValue: 'Out of Stock' })}
                     </Text>
                </View>
            )}
        </View>

        {/* Content Section */}
        <View style={{ padding: 12 }}>
            {/* Title */}
            <Text allowFontScaling={false} 
                style={{ 
                    color: theme.colors.text, 
                    fontSize: 14, 
                    fontWeight: '600', 
                    lineHeight: 20,
                    marginBottom: 6
                }} 
                numberOfLines={2}
            >
                {data.name}
            </Text>

            {/* Price section */}
            <View style={{ marginBottom: 4 }}>
                {data.price ? (
                    <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 18, fontWeight: 'bold' }}>
                        {data.price}
                    </Text>
                ) : null}
                
                {/* Min Order / Part Number */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                     <Text allowFontScaling={false} 
                        style={{ color: theme.colors.textSecondary, fontSize: 11 }}
                        adjustsFontSizeToFit
                        numberOfLines={1}
                     >
                        {t('chat.minOrderPiece', { defaultValue: 'Min. Order: 1 Piece' })}{data.partNumber ? ` · ${t('chat.pn', { defaultValue: 'P/N' })}: ${data.partNumber.replace(/-/g, '')}` : ''}
                     </Text>
                </View>
            </View>

            {/* Action Button - Orange Style (hidden for admin) */}
            {!isAdmin && (
            <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => {
                    if (data.id) {
                        navigation.navigate('ProductDetails', { productId: data.id });
                    }
                }}
                style={{ 
                    backgroundColor: theme.colors.primary,
                    borderRadius: 22,
                    paddingVertical: 10,
                    alignItems: 'center',
                    marginTop: 10
                }}
            >
                <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>
                    {t('product.startOrder', { defaultValue: 'Start Order' })}
                </Text>
            </TouchableOpacity>
            )}
        </View>
      </View>
    </View>
  );
};

// ---------- Order Bubble ----------
const OrderBubble: React.FC<{
  mine: boolean;
  data: any;
  time: string;
  theme: any;
  isAdmin?: boolean;
}> = ({ mine, data, time, theme, isAdmin }) => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  if (!data) return null;

  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
      <View
        style={[
          styles.bubble,
          { 
            backgroundColor: theme.colors.surface, 
            borderColor: theme.colors.border + '40', 
            borderWidth: 1,
            padding: 0, 
            width: 260,
            overflow: 'hidden', 
            borderRadius: 12
          }
        ]}
      >
        <View style={{ 
            backgroundColor: '#3B82F615',
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border + '20',
            flexDirection: 'row',
            alignItems: 'center'
        }}>
             <Ionicons name="receipt-outline" size={16} color="#3B82F6" style={{ marginRight: 6 }} />
             <Text allowFontScaling={false} style={{ fontSize: 13, color: '#3B82F6', fontWeight: 'bold' }}>
                {t('chat.order', { defaultValue: 'Order' })} #{data.orderNumber}
             </Text>
        </View>

        <View style={{ padding: 12 }}>
            <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                ${data.totalUSD}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 12 }}>{t('orders.status.label', { defaultValue: 'Status' })}</Text>
                <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>
                    {data.status || t('orders.pending', { defaultValue: 'Pending' })}
                </Text>
            </View>
            <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 12, marginBottom: 12 }} numberOfLines={1}>
                {data.itemsCount || data.items?.length || 0} {t('orders.itemsLabel', { defaultValue: 'Items' })}
            </Text>

            <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => {
                    navigation.navigate(isAdmin ? 'AdminOrderDetails' : 'OrderDetails', { orderId: data.id });
                }}
                style={{ 
                    backgroundColor: theme.colors.background,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center'
                }}
            >
                <Text allowFontScaling={false} style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>
                    {t('orders.viewOrder', { defaultValue: 'View Order' })}
                </Text>
            </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ---------- File Bubble ----------
const getFileIcon = (mimeType?: string): string => {
  if (!mimeType) return 'document-outline';
  if (mimeType.includes('pdf')) return 'document-text-outline';
  if (mimeType.includes('image')) return 'image-outline';
  if (mimeType.includes('video')) return 'videocam-outline';
  if (mimeType.includes('audio')) return 'musical-notes-outline';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'grid-outline';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'easel-outline';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document-text-outline';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('compressed')) return 'file-tray-stacked-outline';
  return 'document-outline';
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// VoiceBubble is now imported from ../components/VoiceBubble

const FileBubble: React.FC<{
  mine: boolean;
  attachmentUrl?: string | null;
  fileMetadata?: FileMetadata | null;
  time: string;
  theme: any;
}> = ({ mine, attachmentUrl, fileMetadata, time, theme }) => {
  const [downloading, setDownloading] = React.useState(false);

  const handleFileOpen = async () => {
    if (!attachmentUrl) return;
    try {
      setDownloading(true);
      const filename = fileMetadata?.name || `file_${Date.now()}`;
      const localUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.downloadAsync(attachmentUrl, localUri);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(localUri, {
          mimeType: fileMetadata?.mimeType || 'application/octet-stream',
          dialogTitle: 'Open File',
        });
      }
    } catch {
      // Silent fail
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleFileOpen}
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: theme.dark ? theme.colors.primary : '#20A090' }
            : { backgroundColor: theme.dark ? theme.colors.surface : '#F2F7FB' },
          { paddingHorizontal: 12, paddingVertical: 10, minWidth: 200 },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* File Icon */}
          <View style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: mine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}>
            {downloading ? (
              <ActivityIndicator size="small" color={mine ? '#fff' : theme.colors.primary} />
            ) : (
              <Ionicons
                name={getFileIcon(fileMetadata?.mimeType) as any}
                size={22}
                color={mine ? '#fff' : theme.colors.primary}
              />
            )}
          </View>

          {/* File Info */}
          <View style={{ flex: 1 }}>
            <Text allowFontScaling={false}
              style={{
                color: mine ? '#fff' : theme.colors.text,
                fontSize: 13,
                fontWeight: '600',
              }}
              numberOfLines={2}
            >
              {fileMetadata?.name || 'File'}
            </Text>
            <Text allowFontScaling={false} style={{
              color: mine ? 'rgba(255,255,255,0.7)' : theme.colors.textSecondary,
              fontSize: 11,
              marginTop: 2,
            }}>
              {formatFileSize(fileMetadata?.size)}
              {fileMetadata?.mimeType ? ` • ${fileMetadata.mimeType.split('/').pop()?.toUpperCase()}` : ''}
            </Text>
          </View>

          {/* Download Icon */}
          <Ionicons
            name="download-outline"
            size={18}
            color={mine ? 'rgba(255,255,255,0.8)' : theme.colors.textSecondary}
            style={{ marginLeft: 6 }}
          />
        </View>

        {!!time && (
          <Text allowFontScaling={false} style={[styles.bubbleTime, {
            color: mine ? 'rgba(255,255,255,0.85)' : theme.colors.textSecondary,
          }]}>
            {time}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ---------- Chat Bubble ----------
// Memoized so a single new message / a keystroke in the composer doesn't
// re-render every bubble in the list (the main source of chat lag).
const Bubble = React.memo<{
  mine: boolean;
  text: string;
  attachmentUrl?: string | null;
  type?: 'text' | 'image' | 'product' | 'file' | 'order' | 'voice';
  fileMetadata?: FileMetadata | null;
  time: string;
  theme: any;
  onImagePress?: (url: string) => void;
  isAdmin?: boolean;
  localUri?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}>(({ mine, text, attachmentUrl, type, fileMetadata, time, theme, onImagePress, isAdmin, localUri, status }) => {
  const { t } = useTranslation();
  // A product payload can arrive as an explicit 'product' type OR as JSON embedded
  // in a 'text' message. Detect robustly by parsing any JSON-looking text — do NOT
  // rely on an exact "{\"id\":" prefix (key order / a missing id broke that and
  // leaked the raw JSON as plain text).
  if (text && text.trimStart().startsWith('{')) {
    try {
      const productData = JSON.parse(text);
      if (productData && productData.id && productData.name) {
        return <ProductBubble mine={mine} data={productData} time={time} theme={theme} isAdmin={isAdmin} />;
      }
    } catch (e) {
      // Not JSON — fall through to normal rendering
    }
  }

  // Fallback for explicit product type (if rules changed later)
  if (type === 'product') {
    let productData = null;
    try {
      productData = JSON.parse(text);
    } catch (e) {
      // Bare/non-JSON product text (e.g. an id from an external client) — never
      // show the raw id as the title.
      productData = { name: 'Product' };
    }
    return <ProductBubble mine={mine} data={productData} time={time} theme={theme} isAdmin={isAdmin} />;
  }

  // Order type
  if (type === 'order') {
    let orderData = null;
    try {
      orderData = JSON.parse(text);
    } catch (e) {
      orderData = { orderNumber: text };
    }
    return <OrderBubble mine={mine} data={orderData} time={time} theme={theme} isAdmin={isAdmin} />;
  }

  // File type
  if (type === 'file') {
    return <FileBubble mine={mine} attachmentUrl={attachmentUrl} fileMetadata={fileMetadata} time={time} theme={theme} />;
  }

  // Voice type
  if (type === 'voice') {
    return <VoiceBubble mine={mine} attachmentUrl={attachmentUrl} fileMetadata={fileMetadata} time={time} theme={theme} />;
  }

  // Extract tracking URL if present — match URLs that look like tracking/map/location links
  const urlMatches = text?.match(/((https?:\/\/)(www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?)/g);
  let trackingUrlLink = urlMatches ? urlMatches.find(url => {
    const lower = url.toLowerCase();
    return lower.includes('gpsops') || lower.includes('track') || lower.includes('maps') || lower.includes('location') || lower.includes('shipping') || lower.includes('delivery');
  }) : null;

  // FALLBACK: If no keyword match in URL itself, check if the MESSAGE TEXT has shipping context
  // This ensures any URL in a shipped/tracking message renders as a "Track Order" button
  if (!trackingUrlLink && urlMatches && urlMatches.length > 0) {
    const textLower = (text || '').toLowerCase();
    if (textLower.includes('shipped') || textLower.includes('track your order') || text?.includes('📦') || textLower.includes('delivery location') || text?.includes('📍')) {
      trackingUrlLink = urlMatches[0];
    }
  }


  if (trackingUrlLink && !trackingUrlLink.startsWith('http')) {
      trackingUrlLink = 'https://' + trackingUrlLink;
  }

  // Strip the tracking URL and its label from displayed text
  let displayText = text;
  if (trackingUrlLink) {
    const escapedUrl = trackingUrlLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    displayText = displayText
      .replace(new RegExp(`📍\\s*Track your order:\\s*${escapedUrl}`, 'g'), '')
      .replace(new RegExp(`📍\\s*Delivery Location:\\s*${escapedUrl}`, 'g'), '')
      .replace(new RegExp(escapedUrl, 'g'), '')
      .replace(/\n{3,}/g, '\n\n') // collapse extra blank lines
      .trim();
  }

  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: theme.dark ? theme.colors.primary : '#20A090' }
            : { backgroundColor: theme.dark ? theme.colors.surface : '#F2F7FB' },
          !!attachmentUrl && { paddingHorizontal: 4, paddingVertical: 4 },
        ]}
      >
        {/* Render Image Attachment — Tap to open full screen */}
        {(attachmentUrl || localUri) ? (
          <TouchableOpacity 
            activeOpacity={0.9} 
            onPress={() => {
              const u = attachmentUrl || localUri;
              if (u) onImagePress?.(u);
            }}
            style={text ? styles.imageWithText : styles.imageWithoutText}
          >
            <Image 
              source={{ uri: attachmentUrl || localUri }}
              cachePolicy="memory-disk"
              recyclingKey={attachmentUrl || localUri}
              style={[
                {
                  width: 200,
                  height: 200,
                  borderRadius: 12,
                  backgroundColor: 'rgba(0,0,0,0.05)'
                },
                status === 'sending' && { opacity: 0.6 } // Dim while sending
              ]}
              contentFit="cover"
              transition={200}
            />
            {status === 'sending' && (
              <View style={styles.sendingOverlay}>
                <ActivityIndicator color={theme.colors.primary} size="small" />
              </View>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Render Text (if exists) */}
        {!!displayText && (
          <View>
            <Text allowFontScaling={false} style={[styles.bubbleText, { color: mine ? '#FFF' : theme.colors.text, marginHorizontal: attachmentUrl ? 8 : 0, textAlign: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(displayText) ? 'right' : 'left' }]}>
              {displayText}
            </Text>
            {trackingUrlLink && !mine && (
              <TouchableOpacity
                style={{
                  marginTop: 10,
                  backgroundColor: '#FF7816',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignSelf: 'flex-start'
                }}
                onPress={() => Linking.openURL(trackingUrlLink!)}
              >
                <Ionicons name="map-outline" size={16} color="#FFF" style={{ marginRight: 6 }} />
                <Text allowFontScaling={false} style={{ color: '#FFF', fontWeight: '600', fontSize: 13 }}>
                  {t('chat.trackOrder', { defaultValue: 'Track Order' })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.bubbleFooterRow}>
          {!!time && (
            <Text allowFontScaling={false} style={[styles.bubbleTime, mine ? styles.bubbleTimeMine : { color: theme.colors.textSecondary }]}>
              {time}
            </Text>
          )}
          {mine && status && (
             <Ionicons 
               name={
                 status === 'sending' ? 'time-outline' :
                 status === 'sent' ? 'checkmark' :
                 status === 'delivered' ? 'checkmark-done' :
                 status === 'read' ? 'checkmark-done' :
                 'close-circle-outline'
               }
               size={14}
               color={
                 status === 'failed' ? '#F44336' :
                 status === 'read' ? (mine ? 'rgba(255,255,255,0.95)' : '#4CAF50') :
                 mine ? 'rgba(255,255,255,0.85)' : theme.colors.textSecondary
               }
             />
          )}
        </View>
      </View>
    </View>
  );
});
Bubble.displayName = 'Bubble';

const ChatScreen = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<ChatRoute>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const isRTLLang = i18n.language === 'ar' || i18n.language === 'ku';
  const { user } = useAuth();
  
  const userDeletedTimeRef = useRef<number>(0);

  // Merge params from route and props (for AdminChatScreen wrapper)
  const routeParams = route.params as any || {};
  const { conversationId, adminId, productId, productName, productImage, tenantId: routeTenantId, targetName, targetPhone } = routeParams;
  
  // Determine if Admin View (Prop takes precedence)
  const isAdminView = props.isAdminView || routeParams.isAdminView;

  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(routeTenantId || null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const listRef = useRef<FlatList>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingChannelRef = useRef<any>(null);
  const typingClearRef = useRef<any>(null);
  const lastTypingSentRef = useRef(0);
  const myUid = user?.uid || '';

  // AI Chatbot Auto-Response
  const aiTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userMessageCountRef = useRef<number>(0);
  const lastUserMsgRef = useRef<string>('');

  const [headerHeight, setHeaderHeight] = useState(0);
  const [adminTime, setAdminTime] = useState('');
  
  // Admin-only: Full product details for quick reference
  const [productDetails, setProductDetails] = useState<{
    price?: number;
    priceIQD?: number;
    stockQty?: number;
    partNumber?: string;
    category?: string;
    image?: string;
  } | null>(null);
  
  // Keyboard visibility
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  
  // Track if product info has been sent (to hide the product card after sending)
  // Initially true if attachProduct is false, otherwise false so it can be shown/auto-sent
  const [productInfoSent, setProductInfoSent] = useState(routeParams.attachProduct === false);
  
  // Track opposite user's unread count for message status (sent vs read)
  const [otherUserUnreadCount, setOtherUserUnreadCount] = useState<number>(0);

  // Sync productInfoSent with routeParams if they change (e.g. navigation update)
  useEffect(() => {
    if (routeParams.attachProduct === false) {
      setProductInfoSent(true);
    }
  }, [routeParams.attachProduct]);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  // Cleanup AI timer on unmount
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, []);

  // Update Admin Time (Live Clock) - Only for User View
  useEffect(() => {
    if (isAdminView) return; // Admin doesn't need to see their own time
    const updateTime = () => {
      try {
        // Format manually — Hermes' Intl.DateTimeFormat with hour12 truncates the
        // AM/PM to "A"/"P" ("1:34 A"). Baghdad is UTC+3 (no DST).
        const now = new Date();
        const bag = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3 * 3600000);
        const hh = bag.getHours();
        const mm = bag.getMinutes();
        const h12 = hh % 12 || 12;
        const ampm = hh >= 12 ? 'PM' : 'AM';
        setAdminTime(`${h12}:${mm < 10 ? `0${mm}` : mm} ${ampm}`);
      } catch (e) {
        setAdminTime('');
      }
    };

    updateTime(); 
    const interval = setInterval(updateTime, 60000); 

    return () => clearInterval(interval);
  }, [isAdminView]);

  // Load store profile - Keep loading for User View, or for context
  useEffect(() => {
    if (isAdminView) {
        setStoreLoading(false);
        return; 
    }
    let alive = true;
    // Don't keep the header on "Loading…" forever if the store fetch stalls.
    const storeFallback = setTimeout(() => { if (alive) setStoreLoading(false); }, 6000);
    (async () => {
      try {
        setStoreLoading(true);
        let tid: string | null = routeTenantId || null;
        if (!tid && productId) tid = await resolveTenantIdFromProduct(productId);
        if (!tid && adminId) {
          try {
            tid = await storeProfileService.getMyTenantId(adminId);
          } catch {}
        }

        // Persist resolved tenantId for store navigation
        if (tid && alive) setResolvedTenantId(tid);

        if (!tid) {
          if (alive) setStoreProfile(null);
          return;
        }

        const profile = await loadPublicStoreProfile(tid);
        if (alive) setStoreProfile(profile);
      } finally {
        if (alive) setStoreLoading(false);
      }
    })();
    return () => { alive = false; clearTimeout(storeFallback); };
  }, [productId, routeTenantId, adminId, isAdminView]);

  // Load full product details for quick reference (Admin & User)
  useEffect(() => {
    if (!productId) return;
    
    let alive = true;
    (async () => {
      try {
        // Products live in a single Supabase `parts` table (no subcollections).
        const { data, error } = await supabase.from('parts').select('*').eq('id', productId).maybeSingle();
        if (!error && data && alive) {
          // Calculate TOTAL stock (main + size variations + color variations)
          const mainStock = data.stock_qty ?? 0;
          const sizeVariationStock = (data.variations || []).reduce((sum: number, v: any) => sum + (v.stockQuantity || 0), 0);
          const colorVariationStock = (data.color_variations || []).reduce((sum: number, v: any) => sum + (v.stockQuantity || 0), 0);
          const totalStock = mainStock + sizeVariationStock + colorVariationStock;

          setProductDetails({
            price: data.price_usd,
            priceIQD: undefined,
            stockQty: totalStock,
            partNumber: data.part_number,
            category: data.category,
            image: data.image_urls?.[0],
          });
          return;
        }

        // Fallback: load from the conversation's product_snapshot
        if (conversationId && alive) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('product_snapshot')
            .eq('id', conversationId)
            .maybeSingle();
          const snap = conv?.product_snapshot;
          if (snap && alive) {
            setProductDetails({
              price: snap.priceUSD || snap.price,
              priceIQD: snap.priceIQD,
              stockQty: snap.stockQty ?? 0,
              partNumber: snap.partNumber,
              category: snap.category,
              image: snap.imageUrl,
            });
          }
        }
      } catch (e) {
        // Silent fail - product details are supplementary
      }
    })();
    return () => { alive = false; };
  }, [productId, routeTenantId, adminId, conversationId]);

  // ALIBABA OPTIMIZATION: Auto-send the product card if explicitly requested (e.g. from Product page)
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (isAdminView || !routeParams.attachProduct || autoSentRef.current || !productDetails || storeLoading) return;
    
    autoSentRef.current = true;
    (async () => {
       try {
         const payload = {
            id: productId,
            name: productName || 'Product',
            image: productImage || undefined,
            price: productDetails?.priceIQD ? `${productDetails.priceIQD.toLocaleString()} IQD` : (productDetails?.price ? `$${productDetails.price}` : undefined),
            partNumber: productDetails?.partNumber ? productDetails.partNumber.replace(/-/g, '') : undefined,
            stockQty: productDetails?.stockQty
         };
         await sendMessage(
           conversationId,
           JSON.stringify(payload),
           myUid,
           'user',
           (user as any)?.displayName || (user as any)?.name || 'User',
           null,
           'product'
         );
         setProductInfoSent(true);
       } catch(e) {
         console.warn("Auto-send product card failed", e);
       }
    })();
  }, [isAdminView, routeParams.attachProduct, productDetails, storeLoading, conversationId, myUid, productId, productName, productImage]);

  // Hide the product card automatically once the conversation has messages 
  // (Meaning the user has engaged, no need to keep showing the static banner)
  useEffect(() => {
    if (messages.length > 0 && !productInfoSent) {
      setProductInfoSent(true);
    }
  }, [messages.length]);

  // Reset productInfoSent if navigating to a DIFFERENT product
  useEffect(() => {
     if (routeParams.attachProduct) {
        setProductInfoSent(false);
        autoSentRef.current = false;
     }
  }, [productId, conversationId]);

  const displayTitle = isAdminView ? targetName : getLocalizedStoreName(storeProfile, i18n.language);
  // FIX: For admin view, use user's profile image from storeProfile (populated by useFocusEffect)
  const displayImage = storeProfile?.logoUrl || null; 
  
  // Subscribe messages
  const [realAdminId, setRealAdminId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoadingMessages(true);

      // Safety net: never leave the user stuck on "Loading messages…" if the
      // network is slow/unreachable — show the (possibly empty) thread after 6s.
      const loadingFallback = setTimeout(() => setLoadingMessages(false), 6000);

      // Listen to conversation to get REAL adminId AND userId (for Admin View)
      const unsubConv = subscribeToConversation(conversationId, async (conv) => {
         if (!conv) return;
         if (conv.adminId) {
             setRealAdminId(conv.adminId);
         }
         // Track blocked status (real-time)
         setIsBlocked(!!conv.isBlocked);

         // Track user soft-delete timestamp to hide old messages for the user
         const userDeletedAt = (conv.deletedBy as any)?.userDeletedAt;
         userDeletedTimeRef.current = userDeletedAt
            ? (typeof userDeletedAt === 'number' ? userDeletedAt : Date.parse(userDeletedAt) || 0)
            : 0;

         // Track opposite user's unread count for read receipts
         if (isAdminView) {
            setOtherUserUnreadCount((conv.unread as any)?.user || 0);
         } else {
            setOtherUserUnreadCount((conv.unread as any)?.admin || 0);
         }

         // ADMIN VIEW: Fetch User Profile (Image + Location)
         if (isAdminView && conv.userId) {
            try {
               const { data: userData } = await supabase
                 .from('users')
                 .select('name, full_name, profile_image_url, phone, city, email, cover_url')
                 .eq('id', conv.userId)
                 .maybeSingle();

               // Fetch user's default address from addresses table
               const defaultAddress = await addressService.getDefaultAddress(conv.userId);

               // Set minimal profile for UI
                setStoreProfile({
                    storeName: userData?.name || userData?.full_name || 'User',
                    logoUrl: userData?.profile_image_url,
                    phone: userData?.phone,
                    whatsapp: userData?.phone,
                    location: defaultAddress?.coordinates || null,
                    city: defaultAddress?.city || userData?.city,
                    email: userData?.email || null,
                    coverUrl: userData?.cover_url || null,
                } as any);
            } catch (e) {
                console.error("Error fetching user profile for admin chat", e);
            }
         }
      });

      const hasMarkedReadRef = { current: false };
      const unsubMessages = subscribeToMessages(conversationId, (incoming) => {
          let list: Message[] = incoming;

          // Filter out messages prior to user's deletion timestamp (ONLY FOR USER VIEW)
          if (!isAdminView && userDeletedTimeRef.current > 0) {
            list = list.filter((msg) => {
              if (!msg.createdAt) return true; // keep pending messages
              const msgTime = new Date(msg.createdAt as any).getTime() || 0;
              return msgTime >= userDeletedTimeRef.current;
            });
          }

          // Cancel AI timer if admin responded (message from senderType 'admin')
          if (!isAdminView && list.length > 0) {
            const latestMsg = list[0]; // Most recent
            if (latestMsg.senderType === 'admin' && aiTimerRef.current) {
              clearTimeout(aiTimerRef.current);
              aiTimerRef.current = null;
            }
          }

          setMessages(list);
          setLoadingMessages(false);

          // Only mark as read once when the screen first opens, not on every snapshot
          if (!hasMarkedReadRef.current) {
            hasMarkedReadRef.current = true;
            void markConversationAsRead(conversationId, isAdminView ? 'admin' : 'user');
          }
        }, 60);

      // Lightweight "typing…" presence via a shared broadcast channel.
      const myRole = isAdminView ? 'admin' : 'user';
      const typingChannel = supabase.channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } });
      typingChannel
        .on('broadcast', { event: 'typing' }, (msg: any) => {
          if (msg?.payload?.role && msg.payload.role !== myRole) {
            setPeerTyping(true);
            if (typingClearRef.current) clearTimeout(typingClearRef.current);
            typingClearRef.current = setTimeout(() => setPeerTyping(false), 3500);
          }
        })
        .subscribe();
      typingChannelRef.current = typingChannel;

      return () => {
        clearTimeout(loadingFallback);
        unsubConv();
        unsubMessages();
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        setPeerTyping(false);
        try { supabase.removeChannel(typingChannel); } catch {}
        typingChannelRef.current = null;
      };
      }, [conversationId, isAdminView])
  );

  // Throttled typing broadcast (called as the user types).
  const broadcastTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { role: isAdminView ? 'admin' : 'user' },
    });
  }, [isAdminView]);
  // Actions
  const onCall = () => {
    const phone = isAdminView ? targetPhone : storeProfile?.phone;
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const onWhatsApp = () => {
    const wa = isAdminView ? targetPhone : (storeProfile?.whatsapp || storeProfile?.phone);
    const phone = normalizePhoneForWhatsApp(wa);
    if (!phone) return;
    const msg = encodeURIComponent(isAdminView ? '' : 'Hello 👋');
    const native = `whatsapp://send?phone=${phone}&text=${msg}`;
    const web = `https://wa.me/${phone.replace('+', '')}?text=${msg}`;
    Linking.openURL(native).catch(() => Linking.openURL(web).catch(() => {}));
  };

  const onMap = () => {
    // FIX: Allow admin to see user's location (storeProfile.location holds user's coordinates)
    const loc = storeProfile?.location;
    if (!loc?.latitude || !loc?.longitude) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
    Linking.openURL(url).catch(() => {});
  };

  // Clear/Delete chat confirmation
  const onClearChat = () => {
    Alert.alert(
      t('chat.clearChat', 'Clear Chat'),
      t('chat.clearChatConfirm', 'Are you sure you want to delete this conversation? This action cannot be undone.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const role = isAdminView ? 'admin' : 'user';
              await softDeleteConversation(conversationId, role);
              navigation.goBack();
            } catch (error) {
              Alert.alert(t('common.error', 'Error'), t('chat.clearChatError', 'Failed to delete conversation'));
            }
          },
        },
      ]
    );
  };

  // Block/Unblock user (Admin only)
  const onBlockUser = () => {
    const actionText = isBlocked
      ? t('chat.unblockUser', 'Unblock User')
      : t('chat.blockUser', 'Block User');
    const confirmText = isBlocked
      ? t('chat.unblockConfirm', 'This user will be able to send you messages again.')
      : t('chat.blockConfirm', 'This user will not be able to send you any messages.');

    Alert.alert(
      actionText,
      confirmText,
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: actionText,
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await toggleBlockUser(conversationId, !isBlocked);
            } catch (error) {
              Alert.alert(t('common.error', 'Error'), t('chat.blockError', 'Failed to update block status'));
            }
          },
        },
      ]
    );
  };

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);

  // Attachment menu state
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);

  // Full-screen image viewer state
  const [viewerImageUrl, setViewerImageUrl] = useState<string>('');
  const [viewerVisible, setViewerVisible] = useState(false);

  // WhatsApp-style image preview before sending
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewCaption, setPreviewCaption] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  // Synchronous in-flight guard so a double-tap can't upload/send the same image twice.
  const sendingPreviewRef = useRef(false);

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
      // Pulsing red dot
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.2, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      pulse.start();

      // Staggered entrance: overlay fades in, trash slides from left, send slides from right, center fades in
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

  // Unmount cleanup: if the user navigates away mid-recording, stop the timer
  // and release the recorder. Without this the setInterval keeps firing
  // setRecordingDuration on an unmounted component and the mic/temp file leaks.
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (isRecordingIntentRef.current) {
        isRecordingIntentRef.current = false;
        try { audioRecorder.stop().catch(() => {}); } catch {}
      }
    };
  }, []);

  // User detail modal (Admin only)
  const [userDetailVisible, setUserDetailVisible] = useState(false);

  // ... existing Refs & Helpers

  // ... existing onSend

  // AI Auto-Response: First message = 3 seconds, subsequent = 8 minutes
  const AI_FIRST_MSG_DELAY = 3000; // 3 seconds
  // Using 8 minutes as requested (480000ms)
  const AI_SUBSEQUENT_MSG_DELAY = 8 * 60 * 1000; 
  const AI_RATE_LIMIT = 30000; // Minimum 30 seconds between AI responses
  const lastAIResponseTimeRef = useRef<number>(0);

  const triggerAIResponse = async (userMessage: string) => {
    try {
      // Rate limiting
      const now = Date.now();
      if (now - lastAIResponseTimeRef.current < AI_RATE_LIMIT) {
        return; 
      }

      const aiResponse = await chatbotService.sendMessage(userMessage, i18n.language);
      lastAIResponseTimeRef.current = Date.now();
      
      // Sending as 'user' type but with AI name to avoid Permission Errors
      // (Since users can only create 'user' messages in Firestore rules)
      await sendMessage(
        conversationId,
        `🤖 ${aiResponse}`,
        myUid, // Send as myself (user)
        'user', // senderType must be user to pass rules
        'AI Assistant (Auto)',
        null
      );
    } catch (e: any) {
      // Fallback message
      try {
        await sendMessage(
          conversationId,
          `🤖 ${t('chat.aiAutoReply', { defaultValue: 'Thanks for your message! Our team will get back to you soon.' })}`,
          myUid,
          'user',
          'AI Assistant (Auto)',
          null
        );
        lastAIResponseTimeRef.current = Date.now();
      } catch {
        // Silent fail
      }
    }
  };

  const onSend = async () => {
      if (!myUid) return;
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      // Optimistic: show the message instantly so the user sees it send (with a
      // sending/✓/failed indicator) instead of nothing until a manual refresh.
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const optimisticMessage = {
        id: tempId,
        senderId: myUid,
        senderType: isAdminView ? 'admin' : 'user',
        type: 'text',
        text: trimmed,
        status: 'sending',
        localCreatedAt: new Date(),
      } as any;

      try {
        setSending(true);
        setText('');
        setMessages((prev) => [optimisticMessage, ...prev]);
        requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
        
        await sendMessage(
          conversationId, 
          trimmed, 
          myUid, 
          isAdminView ? 'admin' : 'user', 
          undefined, 
          null
        );
  
        // Product visibility in chat list is now handled purely by lastMessage.type
        // (set by onMessageCreate cloud function) — no Firestore clearing needed

        // AI Auto-Response Logic - DISABLED
        // Server-side Cloud Functions already handle AI auto-replies via onMessageCreate trigger
        // Client-side AI was causing "OpenAI API Quota Exceeded" errors with exposed key
        /*
        if (!isAdminView) {
          if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

          lastUserMsgRef.current = trimmed;
          userMessageCountRef.current += 1;

          const delay = userMessageCountRef.current === 1 
            ? AI_FIRST_MSG_DELAY 
            : AI_SUBSEQUENT_MSG_DELAY;

          aiTimerRef.current = setTimeout(() => {
             triggerAIResponse(lastUserMsgRef.current);
          }, delay);
        }
        */

        // Sent OK → mark the optimistic bubble; the realtime re-fetch then
        // reconciles it with the real server row.
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m)));
      } catch {
        setText(trimmed);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      } finally {
        setSending(false);
      }
    };

  // Open attachment menu instead of direct picker
  const handleAttachment = () => {
    if (attaching || sending) return;
    if (keyboardOpen) {
      Keyboard.dismiss();
      // Wait for keyboard to fully close before showing the bottom sheet
      let shown = false;
      const show = () => {
        if (shown) return;
        shown = true;
        sub.remove();
        // Small extra delay to let the layout settle
        setTimeout(() => setAttachMenuVisible(true), 100);
      };
      const sub = Keyboard.addListener('keyboardDidHide', show);
      // Fallback timeout in case the event doesn't fire
      setTimeout(show, 600);
    } else {
      setAttachMenuVisible(true);
    }
  };

  // Photo Library picker → WhatsApp-style preview
  const handlePhotoLibrary = async () => {
    try {
      const uri = await ImageService.pickImageForChat();
      if (!uri) return;
      setPreviewUri(uri);
      setPreviewCaption('');
      setPreviewVisible(true);
    } catch {
      Alert.alert(t('common.error'), 'Failed to pick image');
    }
  };

  // Camera capture → WhatsApp-style preview
  const handleCamera = async () => {
    try {
      const uri = await ImageService.takePhotoForChat();
      if (!uri) return;
      setPreviewUri(uri);
      setPreviewCaption('');
      setPreviewVisible(true);
    } catch {
      Alert.alert(t('common.error'), 'Failed to capture photo');
    }
  };


  // Send the previewed image
  const handleSendPreviewImage = async () => {
    if (!previewUri || sendingPreviewRef.current) return;
    sendingPreviewRef.current = true;
    try {
      setPreviewVisible(false);
      const uri = previewUri;
      const caption = previewCaption.trim();
      setPreviewUri(null);
      setPreviewCaption('');

      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const optimisticMessage = {
        id: tempId,
        senderId: myUid,
        senderType: isAdminView ? 'admin' : 'user',
        type: 'image',
        text: caption || '📷 Image',
        localUri: uri,
        status: 'sending',
        localCreatedAt: new Date(),
      } as any;

      setMessages((prev) => [optimisticMessage, ...prev]);
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));

      const result = await ImageService.uploadImage(uri);
      
      if (result.success && result.url) {
        await sendMessage(
          conversationId, 
          caption || '📷 Image', 
          myUid, 
          isAdminView ? 'admin' : 'user', 
          undefined, 
          result.url,
          'image'
        );
        setMessages((prev) => prev.filter(m => m.id !== tempId));
      } else {
        setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
        Alert.alert(t('common.error'), result.error || 'Failed to upload image');
      }
    } catch {
      Alert.alert(t('common.error'), 'Failed to send image');
    } finally {
      sendingPreviewRef.current = false;
    }
  };

  // Document picker
  const handleDocumentPick = async () => {
    if (attaching) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (!file.uri) return;

      setAttaching(true);

      // Read the file as base64 first (handles content:// URIs on Android)
      let fileUri = file.uri;
      
      // If the URI is a content:// URI, we need to ensure it's cached properly
      if (fileUri.startsWith('content://')) {
        try {
          // Copy to a local cache path that ImageService can handle
          const cacheDir = FileSystem.cacheDirectory;
          const fileName = file.name || `document_${Date.now()}`;
          const localPath = `${cacheDir}${fileName}`;
          await FileSystem.copyAsync({ from: fileUri, to: localPath });
          fileUri = localPath;
        } catch (copyErr) {
          // If copy fails, try with original URI
          if (__DEV__) console.warn('Failed to copy document to cache:', copyErr);
        }
      }

      // Determine if this is an image or a general file
      const isImage = file.mimeType?.startsWith('image/');
      
      let uploadResult;
      if (isImage) {
        // For images, use the existing ImgBB upload with compression
        uploadResult = await ImageService.uploadImage(fileUri);
      } else {
        // For all other files (PDF, DOCX, Excel, etc.), use Firebase Storage
        uploadResult = await ImageService.uploadFile(
          fileUri,
          file.name || `file_${Date.now()}`,
          file.mimeType || 'application/octet-stream'
        );
      }
      
      if (uploadResult.success && uploadResult.url) {
        const metadata: { name: string; size: number; mimeType: string } = {
          name: file.name || 'Unknown File',
          size: file.size || 0,
          mimeType: file.mimeType || 'application/octet-stream',
        };

        await sendMessage(
          conversationId,
          `📎 ${metadata.name}`,
          myUid,
          isAdminView ? 'admin' : 'user',
          undefined,
          uploadResult.url,
          'file',
          metadata
        );
        requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      } else {
        Alert.alert(t('common.error'), uploadResult.error || 'Failed to upload file');
      }
    } catch (err: any) {
      if (__DEV__) console.warn('Document pick error:', err);
      Alert.alert(
        t('common.error'),
        err?.message || 'Failed to pick document'
      );
    } finally {
      setAttaching(false);
    }
  };

  // --- Voice Recording functions ---
  const startRecording = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
    // Mic button bounce
    Animated.sequence([
      Animated.timing(micScale, { toValue: 1.4, duration: 120, useNativeDriver: true }),
      Animated.spring(micScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start();

    // Smooth layout transition
    LayoutAnimation.configureNext(LayoutAnimation.create(280, 'easeInEaseOut', 'opacity'));

    isRecordingIntentRef.current = true;
    setIsRecording(true);
    setRecordingDuration(0);

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setIsRecording(false);
        Alert.alert(t('common.error'), 'Microphone permission is required to send voice messages');
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
          console.warn('Audio mode config error:', e);
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
      
      // Haptic confirmation that it successfully started
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording', err);
      setIsRecording(false);
      Alert.alert(t('common.error'), 'Failed to start recording');
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
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    
    try {
      try { await audioRecorder.stop(); } catch (e) {}
      const uri = audioRecorder.uri;
      
      // Store the final duration before resetting state
      const audioDuration = recordingDuration * 1000; // in milliseconds
      
      setRecordingDuration(0);

      if (!uri) return;

      setIsUploadingVoice(true);

      const fileName = `voice_${Date.now()}.m4a`;
      const mimeType = 'audio/m4a';

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
           
           // map decibel range to height between 4 and 24 (assuming speech is near -60 to 0)
           const normalized = Math.max(4, Math.min(24, 24 + (maxInChunk * 20 / 60))); 
           bins.push(normalized);
         }
         return bins;
      };

      const finalWaveform = compressWaveform(waveformRef.current, 32);

      // Reusing the identical ImageService.uploadFile for Cloud Storage
      const uploadResult = await ImageService.uploadFile(uri, fileName, mimeType);

      if (uploadResult.success && uploadResult.url) {
        await sendMessage(
          conversationId,
          `🎤 Voice Message`,
          myUid,
          isAdminView ? 'admin' : 'user',
          undefined,
          uploadResult.url,
          'voice',
          { name: fileName, size: 0, mimeType, duration: audioDuration, waveform: finalWaveform }
        );
        requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      } else {
        Alert.alert(t('common.error'), uploadResult.error || 'Failed to send voice message');
      }

    } catch (err) {
      console.error('Failed to send recording', err);
      Alert.alert(t('common.error'), 'Failed to send voice message');
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const dayLabel = useCallback((ts: any): string => {
    const ms = toMillis(ts);
    if (!ms) return '';
    const d = new Date(ms);
    const now = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
    if (diff === 0) return t('chat.today', { defaultValue: 'Today' });
    if (diff === 1) return t('chat.yesterday', { defaultValue: 'Yesterday' });
    return d.toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });
  }, [t, i18n.language]);

  const processedMessages = useMemo(() => {
    let unreadLeft = otherUserUnreadCount;
    return messages.map((msg, i) => {
      let status = msg.status;
      const mine = msg.senderId === myUid;
      if (!status && mine) {
         if (unreadLeft > 0) {
            status = 'sent';
            unreadLeft--;
         } else {
            status = 'read';
         }
      }
      // Inverted list: a message is the first of its day when the next-OLDER
      // message (i+1) is on a different calendar day (or there is none). The
      // divider renders ABOVE that message, so it sits atop the day's group.
      const ts = msg.createdAt || (msg as any).localCreatedAt;
      const older = messages[i + 1];
      const showDivider = !older || dayKey(ts) !== dayKey(older.createdAt || (older as any).localCreatedAt);
      return { ...msg, status, showDivider, dividerLabel: showDivider ? dayLabel(ts) : '' };
    });
  }, [messages, otherUserUnreadCount, myUid, dayLabel]);

  const handleLongPressMessage = useCallback((item: Message) => {
    const mine = item.senderId === myUid;
    if (mine || isAdminView) {
      Alert.alert(
        t('chat.deleteMessageTitle', 'Delete Message'),
        t('chat.deleteMessageDesc', 'Are you sure you want to completely delete this message?'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('common.delete', 'Delete'),
            style: 'destructive',
            onPress: async () => {
               try {
                 await deleteMessage(conversationId, item.id);
               } catch (e) {
                 Alert.alert(t('common.error', 'Error'), t('chat.deleteMessageError', 'Failed to delete message'));
               }
            }
          }
        ]
      );
    }
  }, [myUid, isAdminView, conversationId, t]);

  const handleImagePress = useCallback((url: string) => {
    setViewerImageUrl(url);
    setViewerVisible(true);
  }, []);

  // Stable renderItem so the list doesn't re-render every bubble while you type.
  const renderItem = useCallback(({ item }: { item: Message & { showDivider?: boolean; dividerLabel?: string } }) => {
    const mine = item.senderId === myUid;
    return (
      <View>
        {/* Inverted list → divider rendered above the day's first message sits atop the group */}
        {item.showDivider && item.dividerLabel ? <DateDivider label={item.dividerLabel} theme={theme} /> : null}
        <Pressable onLongPress={() => handleLongPressMessage(item)} delayLongPress={300}>
          <Bubble
            mine={mine}
            text={item.text || ''}
            attachmentUrl={item.attachmentUrl}
            type={item.type || 'text'}
            fileMetadata={item.fileMetadata}
            time={formatTime(item.createdAt || (item as any).localCreatedAt)}
            theme={theme}
            isAdmin={isAdminView}
            onImagePress={handleImagePress}
            localUri={item.localUri}
            status={item.status || 'sent'}
          />
        </Pressable>
      </View>
    );
  }, [myUid, isAdminView, theme, handleLongPressMessage, handleImagePress]);
  
  // Composer sizing for list padding - FIXED to prevent layout jumps
  const composerHeight = 80; // Fixed height to prevent layout jumping

  // When keyboard is open on iOS, DO NOT add safe-area bottom (it creates the “gap”)
  const composerBottomPadding = keyboardOpen ? 8 : insets.bottom + 8;

  const TopHeader = (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 6,
          borderBottomColor: theme.colors.border + '35',
        },
      ]}
    >
      <View style={[styles.headerRow, { flexDirection: isRTLLang ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn} activeOpacity={0.85}>
          <Ionicons name={isRTLLang ? 'arrow-forward' : 'arrow-back'} size={22} color={theme.colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.6}
          onPress={() => {
            if (isAdminView) {
              setUserDetailVisible(true);
            } else if (resolvedTenantId) {
              navigation.navigate('StoreProducts', { tenantId: resolvedTenantId });
            }
          }}
          disabled={!isAdminView && !resolvedTenantId}
        >
          <View style={[styles.storeLine, { flexDirection: isRTLLang ? 'row-reverse' : 'row' }]}>
            {displayImage ? (
              <Image source={{ uri: displayImage }} style={styles.storeAvatar} contentFit="cover" transition={0} cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.storeAvatarFallback, { backgroundColor: theme.colors.primary + '22' }]}>
                <Text allowFontScaling={false} style={[styles.storeAvatarLetter, { color: theme.colors.primary }]}>
                  {(displayTitle || (isAdminView ? 'C' : 'S')).trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} 
                style={[styles.storeTitle, { color: theme.colors.text, textAlign: isRTLLang ? 'right' : 'left' }]} 
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {storeLoading && !isAdminView ? t('common.loading', 'Loading...') : displayTitle}
              </Text>

              {/* Time Row - Hide if Admin View */}
              {!isAdminView && adminTime && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexShrink: 1 }}>
                <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} style={{ marginRight: 3 }} />
                <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 11, color: theme.colors.textSecondary, flexShrink: 1 }}>
                  {adminTime}
                </Text>
              </View>
              )}
              {/* If Admin View, show phone number as subtitle if available */}
              {isAdminView && targetPhone ? (
                  <Text allowFontScaling={false} style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>
                      {targetPhone}
                  </Text>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={onCall}
            disabled={!isAdminView && !storeProfile?.phone}
            style={[styles.headerIconBtn, { opacity: (isAdminView ? targetPhone : storeProfile?.phone) ? 1 : 0.35 }]}
            activeOpacity={0.85}
          >
            <Ionicons name="call-outline" size={20} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onWhatsApp}
            disabled={!isAdminView && !(storeProfile?.whatsapp || storeProfile?.phone)}
            style={[styles.headerIconBtn, { opacity: (isAdminView ? targetPhone : storeProfile?.whatsapp || storeProfile?.phone) ? 1 : 0.35 }]}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={20} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onMap}
            disabled={!storeProfile?.location?.latitude}
            style={[styles.headerIconBtn, { opacity: storeProfile?.location?.latitude ? 1 : 0.35 }]}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-outline" size={20} color={theme.colors.text} />
          </TouchableOpacity>

          {/* Block User Button - Admin view only */}
          {isAdminView && (
          <TouchableOpacity
            onPress={onBlockUser}
            style={styles.headerIconBtn}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isBlocked ? 'lock-open-outline' : 'ban-outline'}
              size={20}
              color={isBlocked ? '#4CAF50' : '#F44336'}
            />
          </TouchableOpacity>
          )}

          {/* Clear Chat Button - User view only */}
          {!isAdminView && (
          <TouchableOpacity
            onPress={onClearChat}
            style={styles.headerIconBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
          </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Product Card - Hidden after user sends it OR if explicitly disabled */}
      {(!productInfoSent && routeParams.attachProduct !== false) && (
        <View style={[styles.productCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border + '35' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {(productDetails?.image || productImage) ? (
            <Image
              source={{ uri: productDetails?.image || productImage }}
              style={styles.productThumb}
               contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.productThumbFallback, { backgroundColor: isDark ? '#222' : '#EEE' }]}>
              <Ionicons name="cube-outline" size={18} color={theme.colors.textSecondary} />
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text allowFontScaling={false} style={[styles.productTitle, { color: theme.colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {productName || 'Product'}
            </Text>
            <Text allowFontScaling={false} style={[styles.productHint, { color: theme.colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {isAdminView 
                    ? t('chat.customerInquiry', 'Customer inquiry about this product')
                    : t('chat.chatWithSeller', 'Chat with seller about this product')
                }
            </Text>
          </View>

          {/* View button - only show for user view (admin can't navigate to ProductDetails) */}
          {/* View/Send buttons - only show for user view */}
          {!isAdminView && (
            <View style={{ flexDirection: 'row' }}>
                 <TouchableOpacity
                    onPress={async () => {
                        try {
                            const payload: ProductPayload = {
                                id: productId,
                                name: productName || 'Product',
                                image: productImage || undefined,
                                price: productDetails?.priceIQD ? `${productDetails.priceIQD.toLocaleString()} IQD` : (productDetails?.price ? `$${productDetails.price}` : undefined),
                                partNumber: productDetails?.partNumber ? productDetails.partNumber.replace(/-/g, '') : undefined,
                                stockQty: productDetails?.stockQty
                            };
                            
                            // Send product message
                            await sendMessage(
                                conversationId,
                                JSON.stringify(payload),
                                myUid,
                                'user',
                                (user as any)?.displayName || (user as any)?.name || 'User',
                                null,
                                'product'
                            );

                            // Update conversation's product_snapshot so the chat list shows the latest product image
                            try {
                                await supabase
                                  .from('conversations')
                                  .update({
                                    product_snapshot: {
                                      title: productName || 'Product',
                                      imageUrl: productDetails?.image || productImage || null,
                                    },
                                    product_id: productId,
                                  })
                                  .eq('id', conversationId);
                            } catch (updateErr) {
                                // Silent fail — snapshot update is supplementary
                            }

                            setProductInfoSent(true); // Hide product card after sending
                        } catch (e) {
                            Alert.alert(t('common.error'), 'Failed to send product');
                        }
                    }}
                    style={{ 
                        backgroundColor: theme.colors.primary, 
                        paddingHorizontal: 12, 
                        paddingVertical: 6, 
                        borderRadius: 6,
                        marginRight: 8
                    }}
                  >
                    <Text allowFontScaling={false} style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                        {t('chat.sendProduct', 'Send')}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* View Details Button - Make it secondary */}
                  <TouchableOpacity
                    onPress={() => navigation.navigate('ProductDetails', { productId })}
                    activeOpacity={0.85}
                    style={{ 
                        backgroundColor: theme.colors.surface,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        paddingHorizontal: 8, // Reduced from 12
                        paddingVertical: 6, 
                        borderRadius: 6,
                        flexShrink: 1, // Allow shrinking if needed
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                  >
                    <Text allowFontScaling={false} 
                        style={{ color: theme.colors.text, fontSize: 12 }} 
                        numberOfLines={1} 
                        adjustsFontSizeToFit
                    >
                        {t('common.view', 'View')}
                    </Text>
                  </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Admin-only: Show stock, price, and details */}
        {isAdminView && productDetails && (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border + '30' }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {/* Stock Badge */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: (productDetails.stockQty || 0) > 0 ? theme.colors.success + '18' : theme.colors.error + '18',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
              }}>
                <Ionicons 
                  name={(productDetails.stockQty || 0) > 0 ? "checkmark-circle" : "close-circle"} 
                  size={14} 
                  color={(productDetails.stockQty || 0) > 0 ? theme.colors.success : theme.colors.error} 
                />
                <Text allowFontScaling={false} style={{ 
                  marginLeft: 4, 
                  fontSize: 12, 
                  fontWeight: '600',
                  color: (productDetails.stockQty || 0) > 0 ? theme.colors.success : theme.colors.error
                }}>
                  {t('products.stock', 'Stock')}: {productDetails.stockQty || 0}
                </Text>
              </View>

              {/* Price Badge */}
              {(productDetails.price || productDetails.priceIQD) && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.primary + '18',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}>
                  <Ionicons name="pricetag" size={14} color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={{ marginLeft: 4, fontSize: 12, fontWeight: '600', color: theme.colors.primary }}>
                    {productDetails.priceIQD 
                      ? `${productDetails.priceIQD.toLocaleString()} IQD`
                      : `$${productDetails.price}`
                    }
                  </Text>
                </View>
              )}

              {/* Part Number */}
              {productDetails.partNumber && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.textSecondary + '18',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}>
                  <Ionicons name="barcode" size={14} color={theme.colors.textSecondary} />
                  <Text allowFontScaling={false} style={{ marginLeft: 4, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary }}>
                    {productDetails.partNumber}
                  </Text>
                </View>
              )}

              {/* Category */}
              {productDetails.category && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.textSecondary + '18',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                }}>
                  <Ionicons name="folder" size={14} color={theme.colors.textSecondary} />
                  <Text allowFontScaling={false} style={{ marginLeft: 4, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary }}>
                    {productDetails.category}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
      )}
    </View>
  );

  return (
    <VoiceMessagePlaybackProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['left', 'right']}>
        {TopHeader}

      {/* Removed KeyboardAvoidingView - it conflicts with inverted FlatList */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
            {/* ... List ... */}
            {loadingMessages ? (
                // ... loading ...
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={{ marginTop: 10, color: theme.colors.textSecondary }}>
                    {t('chat.loadingMessages', 'Loading messages...')}
                  </Text>
                </View>
            ) : (
                <FlatList
                    ref={listRef}
                    data={processedMessages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    inverted
                    ListHeaderComponent={peerTyping ? <TypingIndicator theme={theme} /> : null}
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{
                        paddingHorizontal: 12,
                        paddingTop: 12,
                        paddingBottom: 12, 
                    }}
                    removeClippedSubviews={Platform.OS === 'android'}
                    windowSize={11}
                    maxToRenderPerBatch={10}
                    initialNumToRender={14}
                    updateCellsBatchingPeriod={40}
                    ItemSeparatorComponent={ChatItemSeparator}
                    ListEmptyComponent={
                        // ... empty ...
                        <View style={[styles.center, { paddingTop: 60 }]}>
                            <Ionicons name="chatbubble-ellipses-outline" size={100} color={theme.colors.textSecondary} />
                            <Text allowFontScaling={false} style={[styles.emptyTitle, { color: theme.colors.text }]}>
                            {t('chat.sayHello', 'Say hello 👋')}
                            </Text>
                            <Text allowFontScaling={false} style={[styles.emptySub, { color: theme.colors.textSecondary }]}>
                            {t('chat.startConversation', 'Start the conversation with the seller.')}
                            </Text>
                        </View>
                    }
                />
            )}
        </View>

        {/* Blocked Banner - shown to blocked users instead of composer */}
        {isBlocked && !isAdminView ? (
          <View
            style={[
              styles.composerWrap,
              {
                paddingBottom: keyboardOpen ? 8 : insets.bottom + 8,
                borderTopColor: theme.colors.border + '35',
                backgroundColor: isDark ? theme.colors.background : '#FFF',
              },
            ]}
          >
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FEE2E2',
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 16,
              marginHorizontal: 8,
            }}>
              <Ionicons name="ban-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
              <Text allowFontScaling={false} style={{ color: '#DC2626', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'center' }}>
                {t('chat.blocked', 'You can no longer send messages to this seller.')}
              </Text>
            </View>
          </View>
        ) : (
        <View
          style={[
            styles.composerWrap,
            {
               paddingBottom: keyboardOpen ? 8 : insets.bottom + 8,
               borderTopColor: theme.colors.border + '35',
               backgroundColor: isDark ? theme.colors.background : '#FFF',
            },
          ]}
        >
          {/* Blocked indicator for Admin */}
          {isBlocked && isAdminView && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FEF3C7',
              borderRadius: 8,
              paddingVertical: 6,
              paddingHorizontal: 12,
              marginHorizontal: 8,
              marginBottom: 6,
            }}>
              <Ionicons name="ban-outline" size={14} color="#D97706" style={{ marginRight: 6 }} />
              <Text allowFontScaling={false} style={{ color: '#D97706', fontSize: 12, fontWeight: '600' }}>
                {t('chat.userBlocked', 'This user is blocked from messaging you')}
              </Text>
            </View>
          )}

          {/* Admin Quick Replies */}
          {isAdminView && !isBlocked && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={{ marginLeft: 8, marginBottom: 8, minHeight: 36, maxHeight: 36 }}
                contentContainerStyle={{ gap: 8, paddingRight: 16 }}
                keyboardShouldPersistTaps="always"
              >
                 {["Hello! 👋", "Yes, it is available ✨", "Please place your order 🛒", "We can offer a discount 🎉", "Let me check the stock 📦"].map((reply, idx) => (
                     <TouchableOpacity
                        key={idx}
                        onPress={() => setText(reply)}
                        style={{
                            backgroundColor: isDark ? theme.colors.surface : '#F3F6F6',
                            paddingHorizontal: 12,
                            paddingTop: 8,
                            paddingBottom: 8,
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: theme.colors.border + '50',
                            height: 36,
                            justifyContent: 'center'
                        }}
                     >
                         <Text allowFontScaling={false} style={{ fontSize: 13, color: theme.colors.text, fontWeight: '500' }}>
                             {reply}
                         </Text>
                     </TouchableOpacity>
                 ))}
              </ScrollView>
          )}

          {/* ─── WhatsApp-style Recording Overlay ─── */}
          {isRecording || isUploadingVoice ? (
            <Animated.View style={[styles.composer, {
              backgroundColor: isDark ? theme.colors.surface : '#F3F6F6',
              justifyContent: 'center',
              opacity: recOverlayOpacity,
            }]}>
              {isUploadingVoice ? (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text allowFontScaling={false} style={{ color: theme.colors.textSecondary, fontSize: 14, fontWeight: '500' }}>
                    {t('chat.sendingVoice', 'Sending voice message...')}
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
                        width: 40, height: 40, borderRadius: 20,
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
                      {t('chat.recording', 'Recording...')}
                    </Text>
                  </Animated.View>

                  {/* Send button — slides in from right */}
                  <Animated.View style={{ transform: [{ translateX: sendSlide }] }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={stopAndSendRecording}
                      style={[
                        styles.sendBtn,
                        { backgroundColor: isDark ? theme.colors.primary : '#20A090' },
                      ]}
                    >
                      <Ionicons name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </Animated.View>
                </>
              )}
            </Animated.View>
          ) : (
          /* ─── Normal Composer ─── */
          <View style={[styles.composer, { backgroundColor: isDark ? theme.colors.surface : '#F3F6F6', flexDirection: isRTLLang ? 'row-reverse' : 'row' }]}>
            
            {/* Attachment Button */}
            <TouchableOpacity 
                activeOpacity={0.8} 
                onPress={handleAttachment}
                disabled={attaching}
                style={styles.leftIcon}
            >
              {attaching ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                  <Ionicons name="add-circle-outline" size={26} color={theme.colors.primary} />
              )}
            </TouchableOpacity>

            <TextInput allowFontScaling={false}
              value={text}
              onChangeText={(v) => { setText(v); broadcastTyping(); }}
              placeholder={t('chat.typeMessage', 'Type a message')}
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.input, { color: theme.colors.text, textAlign: isRTLLang ? 'right' : 'left' }]}
              multiline
              maxLength={1000}
              underlineColorAndroid="transparent"
            />

            {text.trim() ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={onSend}
                disabled={!text.trim() || sending}
                style={[
                  styles.sendBtn,
                  { backgroundColor: !text.trim() || sending ? (isDark ? theme.colors.surface : '#C4C4C4') : (isDark ? theme.colors.primary : '#20A090') },
                ]}
              >
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <Animated.View style={{ transform: [{ scale: micScale }] }}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={startRecording}
                  disabled={isUploadingVoice || sending}
                  style={[
                    styles.sendBtn,
                    { backgroundColor: isDark ? theme.colors.surface : '#EFEFEF' },
                  ]}
                >
                  <Ionicons name="mic" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
          )}
        </View>
        )}
      </KeyboardAvoidingView>

      {/* Full-Screen Image Viewer Modal */}
      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={viewerImageUrl}
        onClose={() => {
          setViewerVisible(false);
          setViewerImageUrl('');
        }}
      />

      {/* Attachment Menu Bottom Sheet */}
      <AttachmentMenu
        visible={attachMenuVisible}
        onClose={() => setAttachMenuVisible(false)}
        onPhotoLibrary={handlePhotoLibrary}
        onCamera={handleCamera}
        onDocument={handleDocumentPick}
        theme={theme}
      />

       {/* WhatsApp-style Image Preview Modal */}
      <Modal
        visible={previewVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setPreviewVisible(false);
          setPreviewUri(null);
          setPreviewCaption('');
        }}
      >
        <View style={{
          flex: 1,
          backgroundColor: '#000',
        }}>
          {/* Header */}
          <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}>
              {/* Close button — left side */}
              <TouchableOpacity
                onPress={() => {
                  setPreviewVisible(false);
                  setPreviewUri(null);
                  setPreviewCaption('');
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>

              {/* Edit button — right side */}
              {/* iOS FIX: Must dismiss this fullScreen modal BEFORE opening the
                  ImageEditorModal (which lives at App.tsx level). iOS cannot
                  present a modal over a fullScreen modal from a parent component. */}
              <TouchableOpacity
                onPress={() => {
                  if (!previewUri) return;
                  const uriToEdit = previewUri;
                  const captionToKeep = previewCaption;
                  // 1. Dismiss the preview modal first
                  setPreviewVisible(false);
                  // 2. Wait for the dismiss animation, then open editor
                  setTimeout(async () => {
                    try {
                      const { imageEditorBus } = require('../features/image-editor');
                      const editedUri = await imageEditorBus.openImageEditor(uriToEdit);
                      // 3. Re-open preview with edited or original image
                      setPreviewUri(editedUri && editedUri !== uriToEdit ? editedUri : uriToEdit);
                      setPreviewCaption(captionToKeep);
                      setPreviewVisible(true);
                    } catch (err) {
                      console.error('Image editor error:', err);
                      // Re-open preview with original image on error
                      setPreviewUri(uriToEdit);
                      setPreviewCaption(captionToKeep);
                      setPreviewVisible(true);
                    }
                  }, Platform.OS === 'ios' ? 400 : 150);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ padding: 10, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="pencil" size={24} color="#fff" />
              </TouchableOpacity>

            </View>
          </SafeAreaView>

          {/* Image Preview */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 }}>
            {previewUri && (
              <Image
                source={{ uri: previewUri }}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 12,
                }}
                contentFit="contain"
                transition={200}
              />
            )}
          </View>

          {/* Bottom Bar — Caption + Send */}
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'transparent' }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 10,
            }}>
              <View style={{
                flex: 1,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: Platform.OS === 'ios' ? 10 : 6,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <TextInput allowFontScaling={false}
                  value={previewCaption}
                  onChangeText={setPreviewCaption}
                  placeholder={t('chat.addCaption', { defaultValue: 'Add a caption...' })}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={{
                    flex: 1,
                    color: '#fff',
                    fontSize: 15,
                    maxHeight: 80,
                  }}
                  multiline
                />
              </View>
              <TouchableOpacity
                onPress={handleSendPreviewImage}
                activeOpacity={0.8}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: '#25D366',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...SHADOW_STYLES.medium,
                }}
              >
                <Ionicons name="send" size={22} color="#fff" style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* User Detail Modal (Admin Only) */}
      {isAdminView && (
        <Modal
          visible={userDetailVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setUserDetailVisible(false)}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}>
            <View style={{
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              paddingBottom: insets.bottom + 20,
              maxHeight: '70%',
            }}>
              {/* Handle bar */}
              <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 16 }} />

              {/* Close button */}
              <TouchableOpacity
                onPress={() => setUserDetailVisible(false)}
                style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
              >
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>

              {/* User Profile - Profile Settings Style */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                {/* Banner + Profile Picture Hero */}
                <View style={{ width: '100%', alignItems: 'center', marginBottom: 8 }}>
                  {/* Banner Background */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!(storeProfile as any)?.coverUrl}
                    onPress={() => {
                      if ((storeProfile as any)?.coverUrl) {
                        setUserDetailVisible(false);
                        setTimeout(() => {
                          setViewerImageUrl((storeProfile as any).coverUrl);
                          setViewerVisible(true);
                        }, 300);
                      }
                    }}
                    style={{ width: '100%', height: 130, borderRadius: 16, overflow: 'hidden', position: 'relative' }}
                  >
                    {(storeProfile as any)?.coverUrl ? (
                      <>
                        <Image
                          source={{ uri: (storeProfile as any).coverUrl }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                        {/* Dark overlay for readability */}
                        <View style={{
                          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.15)',
                        }} />
                      </>
                    ) : (
                      <View style={{
                        width: '100%', height: '100%',
                        backgroundColor: theme.colors.primary + '22',
                      }} />
                    )}
                  </TouchableOpacity>

                  {/* Profile Picture - overlapping the banner */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!displayImage}
                    onPress={() => {
                      if (displayImage) {
                        setUserDetailVisible(false);
                        setTimeout(() => {
                          setViewerImageUrl(displayImage);
                          setViewerVisible(true);
                        }, 300);
                      }
                    }}
                    style={{
                      marginTop: -45,
                      borderWidth: 3, borderColor: theme.colors.background,
                      borderRadius: 45, overflow: 'hidden',
                    }}
                  >
                    {displayImage ? (
                      <Image
                        source={{ uri: displayImage }}
                        style={{ width: 84, height: 84, borderRadius: 42 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{
                        width: 84, height: 84, borderRadius: 42,
                        backgroundColor: theme.colors.primary + '22',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text allowFontScaling={false} style={{ fontSize: 32, fontWeight: 'bold', color: theme.colors.primary }}>
                          {(displayTitle || 'C').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <Text allowFontScaling={false} style={{ fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginTop: 4 }}>
                  {displayTitle || t('chat.customer', 'Customer')}
                </Text>
              </View>

              {/* Info rows */}
              {storeProfile?.phone && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${storeProfile.phone}`)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: theme.colors.surface,
                    padding: 14, borderRadius: 12, marginBottom: 10,
                  }}
                >
                  <Ionicons name="call-outline" size={20} color="#3B82F6" />
                  <Text allowFontScaling={false} style={{ marginLeft: 12, fontSize: 15, color: theme.colors.text, flex: 1 }}>
                    {storeProfile.phone}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}

              {(storeProfile as any)?.email && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: theme.colors.surface,
                  padding: 14, borderRadius: 12, marginBottom: 10,
                }}>
                  <Ionicons name="mail-outline" size={20} color="#8B5CF6" />
                  <Text allowFontScaling={false} style={{ marginLeft: 12, fontSize: 15, color: theme.colors.text, flex: 1 }}>
                    {(storeProfile as any).email}
                  </Text>
                </View>
              )}

              {storeProfile?.whatsapp && storeProfile.whatsapp !== storeProfile.phone && (
                <TouchableOpacity
                  onPress={() => {
                    const phone = normalizePhoneForWhatsApp(storeProfile?.whatsapp);
                    if (phone) Linking.openURL(`https://wa.me/${phone.replace('+', '')}`);
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: theme.colors.surface,
                    padding: 14, borderRadius: 12, marginBottom: 10,
                  }}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  <Text allowFontScaling={false} style={{ marginLeft: 12, fontSize: 15, color: theme.colors.text, flex: 1 }}>
                    WhatsApp: {storeProfile.whatsapp}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}

              {storeProfile?.city && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: theme.colors.surface,
                  padding: 14, borderRadius: 12, marginBottom: 10,
                }}>
                  <Ionicons name="location-outline" size={20} color="#F59E0B" />
                  <Text allowFontScaling={false} style={{ marginLeft: 12, fontSize: 15, color: theme.colors.text }}>
                    {storeProfile.city}
                  </Text>
                </View>
              )}

              {storeProfile?.location?.latitude && (
                <TouchableOpacity
                  onPress={() => {
                    const loc = storeProfile?.location;
                    if (loc?.latitude && loc?.longitude) {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
                      Linking.openURL(url).catch(() => {});
                    }
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#3B82F6',
                    padding: 14, borderRadius: 12, marginBottom: 10,
                  }}
                >
                  <Ionicons name="navigate" size={18} color="#FFF" />
                  <Text allowFontScaling={false} style={{ marginLeft: 8, fontSize: 15, fontWeight: '600', color: '#FFF' }}>
                    {t('admin.orders.viewMap', 'Open in Maps')}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Message button (already in chat, just close modal) */}
              <TouchableOpacity
                onPress={() => setUserDetailVisible(false)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: theme.colors.surface,
                  padding: 14, borderRadius: 12, marginTop: 4,
                  borderWidth: 1, borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="chatbubble-outline" size={18} color={theme.colors.primary} />
                <Text allowFontScaling={false} style={{ marginLeft: 8, fontSize: 15, fontWeight: '600', color: theme.colors.primary }}>
                  {t('chat.backToChat', 'Back to Chat')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
      </SafeAreaView>
    </VoiceMessagePlaybackProvider>
  );
};

const styles = StyleSheet.create({
  // header
  header: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  headerIconBtn: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 4,
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2 as any,
  },
  storeLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8 as any,
  },
  storeAvatar: {
    borderRadius: 20,
    height: 40,
    width: 40,
  },
  storeAvatarFallback: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  storeAvatarLetter: {
    fontSize: 14,
    fontWeight: '900',
    includeFontPadding: false,
  },
  storeTitle: {
    fontSize: 15,
    fontWeight: '900',
    includeFontPadding: false,
  },
  productSub: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    marginTop: 2,
  },

  // product card
  productCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
    ...SHADOW_STYLES.small,
  },
  productThumb: {
    borderRadius: 12,
    height: 46,
    width: 46,
  },
  productThumbFallback: {
    alignItems: 'center',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '800',
    includeFontPadding: false,
  },
  productHint: {
    fontSize: 12,
    fontWeight: '600',
    includeFontPadding: false,
    marginTop: 2,
  },


  // list
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    includeFontPadding: false,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '600',
    includeFontPadding: false,
    marginTop: 6,
    textAlign: 'center',
  },

  // bubbles
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    borderRadius: 20,
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bubbleText: {
    fontSize: 15,
    fontWeight: '500',
    includeFontPadding: false,
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  bubbleTime: {
    marginTop: 2,
    fontSize: 10, // Figma: smaller timestamp
    fontWeight: '500',
    includeFontPadding: false,
    alignSelf: 'flex-end',
  },

  // composer
  composerWrap: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20, // Figma: more rounded composer
    borderWidth: 0, // Figma: no border, uses bg color
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  leftIcon: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 8,
    width: 40,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 38,
    includeFontPadding: false,
    maxHeight: 120,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'center'
  },
  sendBtn: {
    alignItems: 'center',
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    marginLeft: 8,
    width: 46,
  },
  sendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    justifyContent: 'center',
  },
  bubbleFooterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  bubbleTimeMine: {
    color: 'rgba(255,255,255,0.85)',
    marginRight: 4,
  },
  imageWithText: {
    marginBottom: 6,
    position: 'relative',
  },
  imageWithoutText: {
    marginBottom: 0,
    position: 'relative',
  },
});

export default ChatScreen;
