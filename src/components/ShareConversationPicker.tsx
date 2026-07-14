import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeProvider';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUserConversations } from '../services/chatService';
import { Conversation } from '../types';
import { useTranslation } from 'react-i18next';

interface ShareConversationPickerProps {
  visible: boolean;
  onSelect: (conversation: Conversation) => void;
  onClose: () => void;
  /** Optional preview of the shared content */
  previewUri?: string | null;
  previewText?: string | null;
  contentType?: string | null;
}

const ShareConversationPicker: React.FC<ShareConversationPickerProps> = ({
  visible,
  onSelect,
  onClose,
  previewUri,
  previewText,
  contentType,
}) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !user?.uid) return;

    setLoading(true);
    const unsubscribe = subscribeToUserConversations(
      user.uid,
      (convos) => {
        setConversations(convos);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [visible, user?.uid]);

  const getConversationTitle = (convo: Conversation) => {
    return convo.storeSnapshot?.storeName || convo.adminSnapshot?.name || t('chat.store', { defaultValue: 'Store' });
  };

  const getConversationAvatar = (convo: Conversation) => {
    return convo.storeSnapshot?.logoUrl || convo.productSnapshot?.imageUrl || null;
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const title = getConversationTitle(item);
    const avatar = getConversationAvatar(item);
    const lastMsg = item.lastMessage?.text || '';

    return (
      <TouchableOpacity
        style={[styles.conversationItem, { borderBottomColor: theme.colors.border + '30' }]}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: theme.colors.primary + '20' }]}>  
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="storefront-outline" size={24} color={theme.colors.primary} />
          )}
        </View>

        {/* Info */}
        <View style={styles.conversationInfo}>
          <Text allowFontScaling={false}
            style={[styles.conversationTitle, { color: theme.colors.text }]}
            numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}
          >
            {title}
          </Text>
          {lastMsg ? (
            <Text allowFontScaling={false}
              style={[styles.lastMessage, { color: theme.colors.textSecondary }]}
              numberOfLines={1}
            >
              {lastMsg}
            </Text>
          ) : null}
        </View>

        {/* Send icon */}
        <Ionicons name="send" size={20} color={theme.colors.primary} />
      </TouchableOpacity>
    );
  };

  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'media': return t('share.image', { defaultValue: 'Image' });
      case 'file': return t('share.file', { defaultValue: 'File' });
      case 'weburl': return t('share.link', { defaultValue: 'Link' });
      case 'text': return t('share.text', { defaultValue: 'Text' });
      default: return t('share.content', { defaultValue: 'Content' });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border + '30' }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text allowFontScaling={false} style={[styles.headerTitle, { color: theme.colors.text }]}>
            {t('share.sendTo', { defaultValue: 'Send to...' })}
          </Text>
          <View style={styles.closeButton} />
        </View>

        {/* Preview of shared content */}
        <View style={[styles.previewSection, { backgroundColor: theme.colors.surface }]}>
          {previewUri && (contentType === 'media') ? (
            <Image source={{ uri: previewUri }} style={styles.previewImage} />
          ) : null}
          <View style={styles.previewInfo}>
            <Ionicons
              name={
                contentType === 'media' ? 'image-outline' :
                contentType === 'file' ? 'document-outline' :
                contentType === 'weburl' ? 'link-outline' :
                'text-outline'
              }
              size={18}
              color={theme.colors.primary}
            />
            <Text allowFontScaling={false} style={[styles.previewLabel, { color: theme.colors.textSecondary }]}>
              {t('share.sharing', { defaultValue: 'Sharing' })} {getContentTypeLabel()}
            </Text>
          </View>
          {previewText ? (
            <Text allowFontScaling={false} style={[styles.previewText, { color: theme.colors.text }]} numberOfLines={2}>
              {previewText}
            </Text>
          ) : null}
        </View>

        {/* Conversations List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textSecondary} />
            <Text allowFontScaling={false} style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {t('share.noConversations', { defaultValue: 'No conversations yet. Start chatting with a store first!' })}
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderConversation}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  closeButton: {
    alignItems: 'center',
    width: 40,
  },
  container: {
    flex: 1,
  },
  conversationInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  conversationItem: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  lastMessage: {
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  previewImage: {
    borderRadius: 8,
    height: 120,
    marginBottom: 8,
    resizeMode: 'cover',
    width: '100%',
  },
  previewInfo: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  previewSection: {
    borderRadius: 12,
    margin: 16,
    padding: 12,
  },
  previewText: {
    fontSize: 13,
    marginTop: 4,
  },
});

export default ShareConversationPicker;
