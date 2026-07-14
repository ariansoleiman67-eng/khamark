/**
 * Chat Service - Rewritten for Supabase Postgres
 */

import { supabase, uniqueChannel } from './supabase';
import { Conversation, Message } from '../types';

export type ChatSenderType = 'user' | 'admin';
export type ChatMessageType = 'text' | 'image' | 'product' | 'file' | 'voice';

export type FileMetadata = {
  name: string;
  size: number;
  mimeType: string;
  duration?: number;
  waveform?: number[];
};

const mapConversation = (data: any): Conversation => {
  return {
    id: data.id,
    tenantId: data.tenant_id,
    userId: data.user_id,
    adminId: data.admin_id,
    productId: data.product_id,
    productSnapshot: data.product_snapshot,
    lastMessage: data.last_message,
    unread: data.unread,
    startedBy: data.started_by,
    deletedBy: data.deleted_by,
    archivedBy: data.archived_by,
    labels: data.labels,
    isBlocked: data.is_blocked,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as any;
};

const mapMessage = (data: any): Message => {
  return {
    id: data.id,
    conversationId: data.conversation_id,
    senderId: data.sender_id,
    senderType: data.sender_type,
    senderName: data.sender_name,
    type: data.type,
    text: data.text,
    attachmentUrl: data.attachment_url,
    fileMetadata: data.file_metadata,
    createdAt: data.created_at,
  } as any;
};

const TENANT_CONVERSATION_PREFIX = 'tenant';
const encodeKeyPart = (value: string): string => encodeURIComponent(value.trim());

const buildTenantConversationId = (tenantId: string, userId: string): string =>
  `${TENANT_CONVERSATION_PREFIX}__${encodeKeyPart(tenantId)}__user__${encodeKeyPart(userId)}`;

const resolveMessageType = (
  messageType?: ChatMessageType,
  attachmentUrl?: string | null,
  fileMetadata?: FileMetadata | null,
): ChatMessageType => {
  if (messageType) return messageType;
  if (fileMetadata) return 'file';
  if (attachmentUrl) return 'image';
  return 'text';
};

const hasMessageContent = (
  resolvedType: ChatMessageType,
  text: string,
  attachmentUrl?: string | null,
  fileMetadata?: FileMetadata | null,
): boolean => {
  return (
    text.length > 0 ||
    Boolean(attachmentUrl) ||
    Boolean(fileMetadata) ||
    resolvedType === 'product' ||
    resolvedType === 'voice'
  );
};

const getAuthenticatedUid = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
};

const hydrateConversation = async (conversationId: string): Promise<Conversation> => {
  const { data, error } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
  if (error) throw new Error('Conversation not found');
  return mapConversation(data);
};

const restoreConversationVisibility = async (conversationId: string, conversation: any): Promise<void> => {
  const deletedBy = { ...conversation.deletedBy };
  let needsUpdate = false;
  
  if (deletedBy.user) { deletedBy.user = false; needsUpdate = true; }
  if (deletedBy.admin) { deletedBy.admin = false; needsUpdate = true; }

  if (needsUpdate) {
    await supabase.from('conversations').update({ deleted_by: deletedBy }).eq('id', conversationId);
  }
};

// ============ CALLS ============

export const getOrCreateConversation = async (productId: string): Promise<Conversation> => {
  try {
    const userId = await getAuthenticatedUid();
    if (!userId) throw new Error('You must be signed in to start a chat');

    // Resolve the product's shop (tenant) and owning admin.
    const { data: part, error: partError } = await supabase
      .from('parts')
      .select('tenant_id, extra_data, name, name_ar, name_ku, part_number, price_usd, image_urls')
      .eq('id', productId)
      .single();
    if (partError || !part?.tenant_id) throw new Error('This product is not available for chat');

    const tenantId = part.tenant_id as string;
    // Single-shop model: tenant_id is the owner admin's user id. Only honour an
    // explicit ownerAdminId if it's a real Supabase UUID — migrated products still
    // carry the legacy Firestore admin id (e.g. "RJaeadQBn7...") which would break
    // the uuid admin_id column.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rawOwner = (part.extra_data as any)?.ownerAdminId;
    const adminId = typeof rawOwner === 'string' && UUID_RE.test(rawOwner) ? rawOwner : tenantId;

    // Reuse the customer's existing conversation with this shop if there is one.
    const existing = await findConversationByTenant(tenantId, userId);
    if (existing?.id) {
      await restoreConversationVisibility(existing.id, existing);
      return await hydrateConversation(existing.id);
    }

    // Otherwise create a fresh (customer-initiated) conversation.
    const conversationId = buildTenantConversationId(tenantId, userId);
    const now = new Date().toISOString();
    const productSnapshot = {
      id: productId,
      name: part.name,
      nameAr: part.name_ar,
      nameKu: part.name_ku,
      partNumber: part.part_number,
      priceUSD: part.price_usd,
      image: Array.isArray(part.image_urls) ? part.image_urls[0] || null : null,
    };

    const { data: existsRow } = await supabase.from('conversations').select('id').eq('id', conversationId).maybeSingle();
    if (!existsRow) {
      const { error: insertError } = await supabase.from('conversations').insert([{
        id: conversationId,
        tenant_id: tenantId,
        user_id: userId,
        admin_id: adminId,
        product_id: productId,
        product_snapshot: productSnapshot,
        created_at: now,
        updated_at: now,
        unread: { user: 0, admin: 0 },
        started_by: 'user',
        deleted_by: { user: false, admin: false },
      }]);
      if (insertError) throw insertError;
    }

    return await hydrateConversation(conversationId);
  } catch (error) {
    console.error('getOrCreateConversation error:', error);
    throw error;
  }
};

export const findConversationByTenant = async (tenantId: string, userId: string): Promise<Conversation | null> => {
  try {
    const canonicalId = buildTenantConversationId(tenantId, userId);
    const { data, error } = await supabase.from('conversations').select('*').eq('id', canonicalId).single();
    
    if (data && !error) {
      return mapConversation(data);
    }

    const { data: legacyData, error: legacyError } = await supabase
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (legacyData && legacyData.length > 0 && !legacyError) {
      return mapConversation(legacyData[0]);
    }
    return null;
  } catch (error) {
    console.warn('findConversationByTenant failed', error);
    return null;
  }
};

export const createAdminInitiatedConversation = async (
  tenantId: string,
  userId: string,
  adminId: string,
  productId?: string,
  productSnapshot?: unknown,
): Promise<Conversation> => {
  try {
    const existing = await findConversationByTenant(tenantId, userId);
    if (existing?.id) {
      await restoreConversationVisibility(existing.id, existing);
      return await hydrateConversation(existing.id);
    }

    const conversationId = buildTenantConversationId(tenantId, userId);
    const initialMessageText = 'Chat started by admin';

    const { data: existingSnap } = await supabase.from('conversations').select('id').eq('id', conversationId).single();
    
    if (!existingSnap) {
      const now = new Date().toISOString();
      await supabase.from('conversations').insert([{
        id: conversationId,
        tenant_id: tenantId,
        user_id: userId,
        admin_id: adminId,
        product_id: productId || null,
        product_snapshot: productSnapshot || null,
        created_at: now,
        updated_at: now,
        last_message: {
          text: initialMessageText,
          createdAt: now,
          senderId: adminId,
          senderType: 'admin',
        },
        unread: { user: 1, admin: 0 },
        started_by: 'admin',
        deleted_by: { user: false, admin: false },
      }]);
    }

    await supabase.from('messages').insert([{
      conversation_id: conversationId,
      sender_id: adminId,
      sender_type: 'admin',
      type: 'text',
      text: initialMessageText,
    }]);

    return await hydrateConversation(conversationId);
  } catch (error) {
    console.error('createAdminInitiatedConversation error:', error);
    throw error;
  }
};

export const markConversationAsRead = async (conversationId: string, viewerRole?: ChatSenderType): Promise<void> => {
  try {
    const { data } = await supabase.from('conversations').select('unread, admin_id, user_id').eq('id', conversationId).single();
    if (!data) return;

    const unread = { ...(data.unread || { user: 0, admin: 0 }) };
    let role = viewerRole;
    if (!role) {
      // No explicit role: infer from who is viewing. Defaulting to 'user' (the old
      // behavior) zeroed the customer's badge when an ADMIN opened the chat and
      // never cleared the admin's, so admin badges stayed stuck forever.
      const uid = await getAuthenticatedUid();
      role = uid && uid === data.admin_id ? 'admin' : 'user';
    }
    unread[role] = 0;

    await supabase.from('conversations').update({ unread }).eq('id', conversationId);
  } catch (error) {
    console.error('markConversationAsRead error:', error);
  }
};

// ============ LISTENERS ============

export const subscribeToConversation = (
  conversationId: string,
  callback: (conversation: Conversation | null) => void,
): (() => void) => {
  const channel = uniqueChannel(`conversation_${conversationId}`);
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` }, async () => {
    try {
      const { data } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
      callback(data ? mapConversation(data) : null);
    } catch {}
  }).subscribe();

  // Initial fetch
  supabase.from('conversations').select('*').eq('id', conversationId).single().then(({ data }) => {
    callback(data ? mapConversation(data) : null);
  });

  return () => supabase.removeChannel(channel);
};

export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: Message[]) => void,
  messageLimit: number = 30,
): (() => void) => {
  const channel = uniqueChannel(`messages_${conversationId}`);
  
  const fetchMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(messageLimit);
    callback((data || []).map(mapMessage));
  };

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => {
    fetchMessages();
  }).subscribe();

  fetchMessages();
  return () => supabase.removeChannel(channel);
};

export const loadMoreMessages = async (
  conversationId: string,
  lastDoc: any | null, // Ignored in Supabase for offset based, but keeping sig
  messageLimit: number = 20,
): Promise<{ messages: Message[]; lastDoc: any | null }> => {
  // Simplified for migration, real implementation should use .range()
  return { messages: [], lastDoc: null };
};

export const sendMessage = async (
  conversationId: string,
  text: string,
  senderId: string,
  senderType: ChatSenderType,
  senderName?: string,
  attachmentUrl?: string | null,
  messageType?: ChatMessageType,
  fileMetadata?: FileMetadata | null,
): Promise<void> => {
  try {
    const currentUid = await getAuthenticatedUid();
    if (currentUid !== senderId) throw new Error('Authenticated user does not match senderId');

    const trimmedText = text.trim();
    const resolvedType = resolveMessageType(messageType, attachmentUrl, fileMetadata);

    if (!hasMessageContent(resolvedType, trimmedText, attachmentUrl, fileMetadata)) {
      throw new Error('Cannot send an empty message');
    }

    const { data: conversation } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
    if (!conversation) throw new Error('Conversation not found');

    if (conversation.is_blocked && senderType === 'user') {
      throw new Error('This conversation is blocked');
    }

    const messageData: any = {
      conversation_id: conversationId,
      sender_id: senderId,
      sender_type: senderType,
      sender_name: senderName?.trim() || null,
      type: resolvedType,
      text: trimmedText,
      attachment_url: attachmentUrl || null,
      file_metadata: fileMetadata || null,
    };

    await supabase.from('messages').insert([messageData]);
    await restoreConversationVisibility(conversationId, { deletedBy: conversation.deleted_by });

    // Update last message
    const unread = { ...(conversation.unread || { user: 0, admin: 0 }) };
    const oppositeRole = senderType === 'admin' ? 'user' : 'admin';
    unread[oppositeRole] += 1;

    await supabase.from('conversations').update({
      last_message: {
        text: trimmedText || (attachmentUrl ? 'Image attached' : 'File attached'),
        createdAt: new Date().toISOString(),
        senderId,
        senderType,
      },
      unread,
      updated_at: new Date().toISOString()
    }).eq('id', conversationId);

  } catch (error) {
    console.error('sendMessage error:', error);
    throw error;
  }
};

export const deleteMessage = async (conversationId: string, messageId: string): Promise<void> => {
  await supabase.from('messages').delete().eq('id', messageId);
};

export const subscribeToAdminConversations = (
  adminId: string,
  callback: (conversations: Conversation[]) => void,
  onError?: (error: unknown) => void,
): (() => void) => {
  const channel = uniqueChannel(`admin_convs_${adminId}`);
  
  const fetchConvs = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('admin_id', adminId)
      .order('updated_at', { ascending: false })
      .limit(50);
      
    callback((data || []).map(mapConversation).filter(c => !c.deletedBy?.admin));
  };

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `admin_id=eq.${adminId}` }, () => {
    fetchConvs();
  }).subscribe();

  fetchConvs();
  return () => supabase.removeChannel(channel);
};

export const subscribeToUserConversations = (
  userId: string,
  callback: (conversations: Conversation[]) => void,
): (() => void) => {
  const channel = uniqueChannel(`user_convs_${userId}`);
  
  const fetchConvs = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);
      
    callback((data || []).map(mapConversation).filter(c => !c.deletedBy?.user));
  };

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${userId}` }, () => {
    fetchConvs();
  }).subscribe();

  fetchConvs();
  return () => supabase.removeChannel(channel);
};

export const getAdminUnreadCount = (conversations: Conversation[]): number => {
  return conversations.reduce((total, c) => total + (c.unread?.admin || 0), 0);
};

export const getUserUnreadCount = (conversations: Conversation[]): number => {
  return conversations.reduce((total, c) => total + (c.unread?.user || 0), 0);
};

export const softDeleteConversation = async (conversationId: string, role: ChatSenderType): Promise<void> => {
  const { data } = await supabase.from('conversations').select('deleted_by').eq('id', conversationId).single();
  const deletedBy = { ...(data?.deleted_by || { user: false, admin: false }) };
  deletedBy[role] = true;
  // Record WHEN this role cleared the chat. ChatScreen reads deletedBy.userDeletedAt
  // to hide messages older than the delete; without it a revived chat (the other
  // party sends again) re-shows the entire old history instead of starting fresh.
  deletedBy[`${role}DeletedAt`] = new Date().toISOString();
  await supabase.from('conversations').update({ deleted_by: deletedBy }).eq('id', conversationId);
};

export const hardDeleteConversationDocumentOnly = async (conversationId: string): Promise<void> => {
  await supabase.from('conversations').delete().eq('id', conversationId);
};

/**
 * Archive (or unarchive) a conversation for one side. Archived conversations stay
 * in the DB and keep receiving messages; they're just hidden from that side's main
 * list and surfaced under the "Archived" filter. Mirrors softDeleteConversation.
 */
export const setConversationArchived = async (
  conversationId: string,
  role: ChatSenderType,
  archived: boolean,
): Promise<void> => {
  const { data } = await supabase.from('conversations').select('archived_by').eq('id', conversationId).single();
  const archivedBy = { ...(data?.archived_by || { user: false, admin: false }) };
  archivedBy[role] = archived;
  await supabase.from('conversations').update({ archived_by: archivedBy }).eq('id', conversationId);
};

// Serialize label writes per conversation so rapid multi-select toggles apply in
// order instead of racing on the read-modify-write. Each call passes the full
// desired array (the client is the source of truth for its own side), so once
// serialized the last write holds the complete set.
const labelWriteChains: Record<string, Promise<void>> = {};

/**
 * Write the full set of label ids for one side of a conversation. The caller
 * passes the already-computed array; we only re-read to preserve the OTHER
 * side's labels. Labels are stored per side under labels.{role} (preset ids,
 * see constants/chatLabels).
 */
export const setConversationLabels = async (
  conversationId: string,
  role: ChatSenderType,
  labels: string[],
): Promise<void> => {
  const prev = labelWriteChains[conversationId] || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const { data } = await supabase.from('conversations').select('labels').eq('id', conversationId).single();
    const all: Record<string, string[]> = { ...(data?.labels || {}) };
    all[role] = labels;
    await supabase.from('conversations').update({ labels: all }).eq('id', conversationId);
  });
  labelWriteChains[conversationId] = next;
  return next;
};

export const toggleBlockUser = async (conversationId: string, block: boolean): Promise<void> => {
  await supabase.from('conversations').update({ is_blocked: block }).eq('id', conversationId);
};
