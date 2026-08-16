import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';
import FormData from 'form-data';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { parsePhoneNumber } from 'libphonenumber-js';
import { generateAIResponse, analyzeVisualSearch } from './aiService';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CONFIG = {
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  imgbbApiKey: process.env.IMGBB_API_KEY || '',
  bunnyStoragePassword: process.env.BUNNY_STORAGE_PASSWORD || '',
  bunnyStorageZone: process.env.BUNNY_STORAGE_ZONE || 'ASANKARY_BUNNY_STORAGE_ZONE_TBD',
  bunnyCdnHostname: process.env.BUNNY_CDN_HOSTNAME || 'ASANKARY_BUNNY_CDN_TBD.b-cdn.net',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  phoneHashSecret: process.env.PHONE_HASH_SECRET || '',
  paymentSandboxMode: String(process.env.PAYMENT_SANDBOX_MODE || '').toLowerCase() === 'true',
  aiDebounceMs: clampNumber(process.env.AI_DEBOUNCE_MS, 2000, 15000, 2500),
  aiAdminPauseMs: clampNumber(process.env.AI_ADMIN_PAUSE_MS, 60_000, 30 * 60_000, 5 * 60_000),
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: clampNumber(process.env.SMTP_PORT, 1, 65535, 465),
};

const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

type ConversationParty = 'user' | 'admin';
type MessageSenderType = 'user' | 'admin';
type MessageType = 'text' | 'image' | 'product' | 'file' | 'order';
type PaymentMethodCode = 'cod' | 'qi' | 'fib';

type HistoryRole = 'user' | 'model' | 'assistant' | 'system' | 'developer';

interface HistoryMessage {
  role: HistoryRole;
  content: string;
}

interface NotificationPayload {
  title: string;
  titleAr: string;
  titleKu: string;
  body: string;
  bodyAr: string;
  bodyKu: string;
  type: string;
  data?: Record<string, unknown>;
}

interface ProductSnapshot {
  title: string;
  titleAr: string | null;
  titleKu: string | null;
  imageUrl: string | null;
}

interface UserSnapshot {
  name: string;
  phone: string;
  avatarUrl: string | null;
}

interface AdminSnapshot {
  id: string;
  name: string;
  tenantId: string | null;
}

interface StoreSnapshot {
  storeName: string;
  storeNameAr: string;
  storeNameKu: string;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  addressText: string | null;
  location: unknown | null;
}

interface ConversationDoc {
  userId: string;
  adminId: string;
  tenantId: string | null;
  productId?: string | null;
  adminSnapshot?: AdminSnapshot;
  storeSnapshot?: StoreSnapshot | null;
  userSnapshot?: UserSnapshot;
  productSnapshot?: ProductSnapshot;
  aiPaused?: boolean;
  adminLastActive?: admin.firestore.Timestamp;
  unread?: { user?: number; admin?: number };
  deletedBy?: { user?: boolean; admin?: boolean };
}

interface CartItemInput {
  productId: string;
  quantity: number;
}

interface ValidatedOrderItem {
  productId: string;
  tenantId: string | null;
  productName: string;
  partNumber: string | null;
  priceUSD: number;
  quantity: number;
  totalUSD: number;
  shippingCost: number;
  imageUrl: string | null;
}

interface GatewayPaymentResult {
  success: boolean;
  transactionId?: string;
  method: PaymentMethodCode;
  error?: string;
  raw?: Record<string, unknown>;
}

interface PushTarget {
  userId: string;
  token: string;
  source: 'devices' | 'pushTokens' | 'users';
  refPath: string;
}

interface SendResult {
  sent: number;
  failed: number;
  invalidTargets: PushTarget[];
}

interface EmailOtpRecord {
  codeHash: string;
  email: string;
  createdAt: admin.firestore.Timestamp | admin.firestore.FieldValue;
  expiresAt: admin.firestore.Timestamp | Date;
  attempts: number;
}

const ORDER_STATUS_MESSAGES: Record<string, NotificationPayload> = {
  confirmed: {
    title: 'Order Confirmed',
    titleAr: 'تم تأكيد الطلب',
    titleKu: 'داواکاری پشتڕاستکرا',
    body: 'Your order has been confirmed and is being prepared.',
    bodyAr: 'تم تأكيد طلبك وهو قيد التحضير.',
    bodyKu: 'داواکاریەکەت پشتڕاستکرا و ئامادە دەکرێت.',
    type: 'order',
    data: { type: 'order_status_update', status: 'confirmed' },
  },
  processing: {
    title: 'Order Processing',
    titleAr: 'الطلب قيد المعالجة',
    titleKu: 'داواکاری لە پرۆسێسدایە',
    body: 'Your order is being processed and will be shipped soon.',
    bodyAr: 'طلبك قيد المعالجة وسيتم شحنه قريباً.',
    bodyKu: 'داواکاریەکەت پرۆسێس دەکرێت و بەزووی دەنێردرێت.',
    type: 'order',
    data: { type: 'order_status_update', status: 'processing' },
  },
  shipped: {
    title: 'Order Shipped',
    titleAr: 'تم شحن الطلب',
    titleKu: 'داواکاری نێردراوە',
    body: 'Your order has been shipped and is on the way.',
    bodyAr: 'تم شحن طلبك وهو في الطريق.',
    bodyKu: 'داواکاریەکەت نێردراوە و لە ڕێگادایە.',
    type: 'order',
    data: { type: 'order_status_update', status: 'shipped' },
  },
  delivered: {
    title: 'Order Delivered',
    titleAr: 'تم توصيل الطلب',
    titleKu: 'داواکاری گەیشت',
    body: 'Your order has been delivered successfully.',
    bodyAr: 'تم توصيل طلبك بنجاح.',
    bodyKu: 'داواکاریەکەت بە سەرکەوتوویی گەیشت.',
    type: 'order',
    data: { type: 'order_status_update', status: 'delivered' },
  },
  cancelled: {
    title: 'Order Cancelled',
    titleAr: 'تم إلغاء الطلب',
    titleKu: 'داواکاری هەڵوەشایەوە',
    body: 'Your order has been cancelled.',
    bodyAr: 'تم إلغاء طلبك.',
    bodyKu: 'داواکاریەکەت هەڵوەشایەوە.',
    type: 'order',
    data: { type: 'order_status_update', status: 'cancelled' },
  },
  default: {
    title: 'Order Update',
    titleAr: 'تحديث الطلب',
    titleKu: 'نوێکردنەوەی داواکاری',
    body: 'Your order status was updated.',
    bodyAr: 'تم تحديث حالة طلبك.',
    bodyKu: 'بارودۆخی داواکاریەکەت نوێکرایەوە.',
    type: 'order',
    data: { type: 'order_status_update' },
  },
};

const PRODUCT_SEARCH_COLLECTIONS = ['parts', 'products', 'global_products'];
const MAX_NOTIFICATION_BATCH = 450;

let smtpTransporter: nodemailer.Transporter | null = null;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getNowIso(): string {
  return new Date().toISOString();
}

function requireAuth(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  return uid;
}

async function requireAdminUid(context: functions.https.CallableContext): Promise<string> {
  const uid = requireAuth(context);
  const isLegacyAdmin = context.auth?.token?.admin === true || context.auth?.token?.role === 'admin';
  if (isLegacyAdmin) return uid;

  const adminDoc = await db.collection('admins').doc(uid).get();
  if (!adminDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
  return uid;
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function nonEmptyString(value: unknown, fieldName: string): string {
  const text = safeString(value);
  if (!text) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required`);
  }
  return text;
}

function normalizeLanguage(input: unknown): 'en' | 'ar' | 'ku' {
  const language = safeString(input).toLowerCase();
  if (language.startsWith('ar')) return 'ar';
  if (language.startsWith('ku') || language.includes('sorani')) return 'ku';
  return 'en';
}

function sanitizePlainText(text: unknown): string {
  return safeString(text)
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/www\.[^\s]+/gi, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^-{3,}$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`{1,3}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function buildMessagePreview(message: admin.firestore.DocumentData): string {
  const text = sanitizePlainText(message.text || '');
  const type = safeString(message.type || 'text') as MessageType;
  if (type === 'image') return text || 'Sent an image';
  if (type === 'file') return text || 'Sent a file';
  if (type === 'product') {
    try {
      const parsed = JSON.parse(safeString(message.text || '{}'));
      return parsed.name ? `Shared a product: ${parsed.name}` : (text || 'Shared a product');
    } catch {
      return text || 'Shared a product';
    }
  }
  if (type === 'order') return text || 'Sent an order update';
  return text.slice(0, 140);
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deterministicId(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function parsePaymentMethod(value: unknown): PaymentMethodCode {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'cod' || normalized === 'cash_on_delivery') return 'cod';
  if (normalized === 'qi' || normalized === 'qi_card') return 'qi';
  if (normalized === 'fib' || normalized === 'fib_card') return 'fib';
  throw new functions.https.HttpsError('invalid-argument', 'Invalid payment method');
}

function getEmailTransporter(): nodemailer.Transporter {
  if (smtpTransporter) return smtpTransporter;
  if (!CONFIG.smtpUser || !CONFIG.smtpPass) {
    throw new functions.https.HttpsError('failed-precondition', 'SMTP credentials are not configured');
  }

  smtpTransporter = nodemailer.createTransport({
    host: CONFIG.smtpHost,
    port: CONFIG.smtpPort,
    secure: CONFIG.smtpPort === 465,
    auth: {
      user: CONFIG.smtpUser,
      pass: CONFIG.smtpPass,
    },
  });

  return smtpTransporter;
}

function normalizePhone(input: string): string {
  const raw = safeString(input);
  if (!raw) {
    throw new functions.https.HttpsError('invalid-argument', 'Phone number is required');
  }

  const parsed = parsePhoneNumber(raw, 'IQ');
  if (!parsed || !parsed.isValid()) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number');
  }

  return parsed.number;
}

function phoneDocId(phoneE164: string): string {
  if (!CONFIG.phoneHashSecret) {
    throw new functions.https.HttpsError('failed-precondition', 'phone_hash_secret is not configured');
  }
  return crypto.createHmac('sha256', CONFIG.phoneHashSecret).update(phoneE164).digest('hex').slice(0, 32);
}

function hashOtp(email: string, code: string): string {
  const secret = CONFIG.phoneHashSecret || 'otp-fallback-secret';
  return crypto.createHmac('sha256', secret).update(`${email}|${code}`).digest('hex');
}

function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function coerceTimestamp(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

async function buildUserSnapshot(uid: string): Promise<UserSnapshot> {
  try {
    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.exists ? userSnap.data() || {} : {};
    return {
      name: safeString(user.name || user.fullName || user.displayName || user.email || 'Customer'),
      phone: safeString(user.phone || user.phoneNumber),
      avatarUrl: safeString(user.avatarUrl || user.photoURL || user.profileImageUrl) || null,
    };
  } catch {
    return { name: 'Customer', phone: '', avatarUrl: null };
  }
}

function buildProductSnapshot(product: admin.firestore.DocumentData): ProductSnapshot {
  return {
    title: safeString(product.title || product.name || product.productName || 'Product'),
    titleAr: safeString(product.titleAr || product.nameAr) || null,
    titleKu: safeString(product.titleKu || product.nameKu) || null,
    imageUrl: (Array.isArray(product.imageUrls) ? safeString(product.imageUrls[0]) : safeString(product.imageUrl)) || null,
  };
}

async function loadProductAny(productId: string): Promise<{ data: admin.firestore.DocumentData; tenantId: string | null; refPath: string } | null> {
  for (const collectionName of PRODUCT_SEARCH_COLLECTIONS) {
    const snap = await db.collection(collectionName).doc(productId).get();
    if (snap.exists) {
      return { data: snap.data() || {}, tenantId: safeString(snap.data()?.tenantId) || null, refPath: snap.ref.path };
    }
  }

  const tenantsSnapshot = await db.collection('tenants').limit(100).get();
  for (const tenantDoc of tenantsSnapshot.docs) {
    const nestedSnap = await db.doc(`tenants/${tenantDoc.id}/products/${productId}`).get();
    if (nestedSnap.exists) {
      const data = nestedSnap.data() || {};
      return {
        data: { ...data, tenantId: safeString(data.tenantId) || tenantDoc.id },
        tenantId: safeString(data.tenantId) || tenantDoc.id,
        refPath: nestedSnap.ref.path,
      };
    }
  }

  return null;
}

async function resolveConversationAdmin(product: admin.firestore.DocumentData): Promise<{ adminId: string; tenantId: string | null; adminSnapshot: AdminSnapshot; storeSnapshot: StoreSnapshot }> {
  let adminId = safeString(product.ownerAdminId || product.adminId || product.ownerId);
  let tenantId = safeString(product.tenantId) || null;
  let adminName = '';

  if (!adminId && tenantId) {
    adminId = tenantId;
  }

  if (!adminId) {
    const firstAdmin = await db.collection('admins').limit(1).get();
    if (firstAdmin.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'Could not resolve product owner');
    }
    adminId = firstAdmin.docs[0].id;
  }

  const adminUserSnap = await db.doc(`users/${adminId}`).get();
  if (adminUserSnap.exists) {
    const adminUser = adminUserSnap.data() || {};
    tenantId = tenantId || safeString(adminUser.tenantId) || null;
    adminName = safeString(adminUser.businessName || adminUser.storeName || adminUser.name || adminUser.displayName);
  }

  if (tenantId && !adminName) {
    const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
    if (tenantSnap.exists) {
      adminName = safeString(tenantSnap.data()?.name);
    }
  }

  if (!adminName) {
    adminName = 'Seller';
  }

  let storeSnapshot: StoreSnapshot = {
    storeName: adminName,
    storeNameAr: '',
    storeNameKu: '',
    logoUrl: null,
    phone: null,
    whatsapp: null,
    city: null,
    addressText: null,
    location: null,
  };

  if (tenantId) {
    const storeSnap = await db.doc(`tenants/${tenantId}/public/storeProfile`).get();
    if (storeSnap.exists) {
      const store = storeSnap.data() || {};
      storeSnapshot = {
        storeName: safeString(store.storeName || adminName || 'Store'),
        storeNameAr: safeString(store.storeNameAr),
        storeNameKu: safeString(store.storeNameKu),
        logoUrl: safeString(store.logoUrl) || null,
        phone: safeString(store.phone) || null,
        whatsapp: safeString(store.whatsapp) || null,
        city: safeString(store.city) || null,
        addressText: safeString(store.addressText) || null,
        location: store.location || null,
      };
    }
  }

  return {
    adminId,
    tenantId,
    adminSnapshot: { id: adminId, name: adminName, tenantId },
    storeSnapshot,
  };
}

async function collectTokensForUserIds(userIds: string[]): Promise<{ expoTargets: PushTarget[]; fcmTargets: PushTarget[] }> {
  const expoTargets: PushTarget[] = [];
  const fcmTargets: PushTarget[] = [];
  const seen = new Set<string>();
  const userIdSet = new Set(userIds);

  const addTarget = (target: PushTarget) => {
    if (!target.token || seen.has(target.token)) return;
    seen.add(target.token);
    if (target.token.startsWith('ExponentPushToken')) expoTargets.push(target);
    else fcmTargets.push(target);
  };

  const useBulkQueries = userIds.length > 25;

  if (useBulkQueries) {
    const [deviceSnap, pushTokenSnap, usersSnap] = await Promise.all([
      db.collection('devices').where('isActive', '==', true).get().catch(() => null),
      db.collection('pushTokens').where('active', '==', true).get().catch(() => null),
      db.collection('users').get().catch(() => null),
    ]);

    if (deviceSnap) {
      for (const doc of deviceSnap.docs) {
        const data = doc.data();
        const uid = safeString(data.uid);
        if (!uid || !userIdSet.has(uid) || data.notificationsEnabled === false) continue;
        addTarget({
          userId: uid,
          token: safeString(data.fcmToken || data.token),
          source: 'devices',
          refPath: doc.ref.path,
        });
      }
    }

    if (pushTokenSnap) {
      for (const doc of pushTokenSnap.docs) {
        const data = doc.data();
        const uid = safeString(data.userId);
        if (!uid || !userIdSet.has(uid)) continue;
        addTarget({
          userId: uid,
          token: safeString(data.token),
          source: 'pushTokens',
          refPath: doc.ref.path,
        });
      }
    }

    if (usersSnap) {
      for (const doc of usersSnap.docs) {
        if (!userIdSet.has(doc.id)) continue;
        const data = doc.data() || {};
        for (const token of [safeString(data.pushToken), safeString(data.fcmToken)]) {
          addTarget({ userId: doc.id, token, source: 'users', refPath: doc.ref.path });
        }
      }
    }

    return { expoTargets, fcmTargets };
  }

  for (const uid of userIds) {
    const [deviceSnap, pushTokenSnap, userSnap] = await Promise.all([
      db.collection('devices').where('uid', '==', uid).where('isActive', '==', true).get().catch(() => null),
      db.collection('pushTokens').where('userId', '==', uid).where('active', '==', true).get().catch(() => null),
      db.collection('users').doc(uid).get().catch(() => null),
    ]);

    if (deviceSnap) {
      for (const doc of deviceSnap.docs) {
        const data = doc.data();
        if (data.notificationsEnabled === false) continue;
        addTarget({ userId: uid, token: safeString(data.fcmToken || data.token), source: 'devices', refPath: doc.ref.path });
      }
    }

    if (pushTokenSnap) {
      for (const doc of pushTokenSnap.docs) {
        const data = doc.data();
        addTarget({ userId: uid, token: safeString(data.token), source: 'pushTokens', refPath: doc.ref.path });
      }
    }

    if (userSnap?.exists) {
      const data = userSnap.data() || {};
      for (const token of [safeString(data.pushToken), safeString(data.fcmToken)]) {
        addTarget({ userId: uid, token, source: 'users', refPath: userSnap.ref.path });
      }
    }
  }

  return { expoTargets, fcmTargets };
}

async function cleanupInvalidTargets(invalidTargets: PushTarget[]): Promise<number> {
  if (invalidTargets.length === 0) return 0;

  let cleaned = 0;
  for (const group of chunk(invalidTargets, 300)) {
    const batch = db.batch();
    for (const target of group) {
      const ref = db.doc(target.refPath);
      if (target.source === 'devices') {
        batch.set(ref, {
          isActive: false,
          disabledAt: FieldValue.serverTimestamp(),
          invalidReason: 'push_delivery_failed',
        }, { merge: true });
      } else if (target.source === 'pushTokens') {
        batch.set(ref, {
          active: false,
          disabledAt: FieldValue.serverTimestamp(),
          invalidReason: 'push_delivery_failed',
        }, { merge: true });
      } else {
        batch.set(ref, {
          fcmToken: FieldValue.delete(),
          pushToken: FieldValue.delete(),
          fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      cleaned += 1;
    }
    await batch.commit();
  }

  return cleaned;
}

async function sendExpoNotifications(targets: PushTarget[], title: string, body: string, data?: Record<string, unknown>): Promise<SendResult> {
  if (targets.length === 0) {
    return { sent: 0, failed: 0, invalidTargets: [] };
  }

  let sent = 0;
  let failed = 0;
  const invalidTargets: PushTarget[] = [];

  for (const batch of chunk(targets, 100)) {
    const payload = batch.map((target) => ({
      to: target.token,
      sound: 'default' as const,
      title,
      body,
      data: data || {},
      channelId: data?.type === 'chat_message' ? 'chat_messages' : data?.type === 'order_status_update' ? 'orders' : 'default',
    }));

    try {
      const response = await axios.post('https://exp.host/--/api/v2/push/send', payload, {
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      });

      const results = Array.isArray(response.data?.data) ? response.data.data : [];
      results.forEach((result: any, index: number) => {
        if (result?.status === 'ok') {
          sent += 1;
        } else {
          failed += 1;
          const details = safeString(result?.details?.error);
          if (details.includes('DeviceNotRegistered')) {
            invalidTargets.push(batch[index]);
          }
        }
      });
    } catch (error) {
      console.error('Expo push batch failed', error);
      failed += batch.length;
    }
  }

  return { sent, failed, invalidTargets };
}

async function sendFCMNotifications(targets: PushTarget[], title: string, body: string, data?: Record<string, unknown>): Promise<SendResult> {
  if (targets.length === 0) {
    return { sent: 0, failed: 0, invalidTargets: [] };
  }

  let sent = 0;
  let failed = 0;
  const invalidTargets: PushTarget[] = [];
  const stringData = Object.fromEntries(Object.entries(data || {}).map(([key, value]) => [key, String(value)]));

  for (const batch of chunk(targets, MAX_NOTIFICATION_BATCH)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch.map((item) => item.token),
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: data?.type === 'chat_message' ? 'chat_messages' : data?.type === 'order_status_update' ? 'orders' : 'default',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    });

    response.responses.forEach((result, index) => {
      if (result.success) {
        sent += 1;
        return;
      }

      failed += 1;
      const code = result.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument' ||
        code === 'messaging/mismatched-credential'
      ) {
        invalidTargets.push(batch[index]);
      }
    });
  }

  return { sent, failed, invalidTargets };
}

async function sendPushToUsers(userIds: string[], title: string, body: string, data?: Record<string, unknown>): Promise<{ sent: number; failed: number; cleaned: number }> {
  const targets = await collectTokensForUserIds(userIds);
  const [expoResult, fcmResult] = await Promise.all([
    sendExpoNotifications(targets.expoTargets, title, body, data),
    sendFCMNotifications(targets.fcmTargets, title, body, data),
  ]);

  const cleaned = await cleanupInvalidTargets([...expoResult.invalidTargets, ...fcmResult.invalidTargets]);
  return {
    sent: expoResult.sent + fcmResult.sent,
    failed: expoResult.failed + fcmResult.failed,
    cleaned,
  };
}

async function createUserNotification(userId: string, payload: NotificationPayload): Promise<void> {
  const notificationRef = db.collection('notifications').doc();
  await notificationRef.set({
    userId,
    title: payload.title,
    titleAr: payload.titleAr,
    titleKu: payload.titleKu,
    body: payload.body,
    bodyAr: payload.bodyAr,
    bodyKu: payload.bodyKu,
    type: payload.type,
    data: payload.data || {},
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.doc(`users/${userId}/meta/notifications`).set(
    { unreadNotificationCount: FieldValue.increment(1) },
    { merge: true },
  );
}

async function sendOrderStatusNotification(userId: string, orderId: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const template = ORDER_STATUS_MESSAGES[status] || ORDER_STATUS_MESSAGES.default;
  const payload: NotificationPayload = {
    ...template,
    data: { ...(template.data || {}), orderId, status, ...extra },
  };

  await createUserNotification(userId, payload);
  await sendPushToUsers([userId], payload.title, payload.body, payload.data as Record<string, unknown>);
}

function calculateShipping(subtotalUSD: number, items: ValidatedOrderItem[], shippingAddress: admin.firestore.DocumentData, settings: admin.firestore.DocumentData | null): number {
  const activeSettings = {
    freeShippingThreshold: 500,
    freeShippingEnabled: true,
    regionRates: {},
    defaultRate: 30,
    perProductShippingEnabled: true,
    ...(settings || {}),
  };

  if (activeSettings.freeShippingEnabled && subtotalUSD >= Number(activeSettings.freeShippingThreshold || 0)) {
    return 0;
  }

  const perProductShipping = items.reduce((sum, item) => sum + (item.shippingCost || 0) * item.quantity, 0);
  if (activeSettings.perProductShippingEnabled && perProductShipping > 0) {
    return perProductShipping;
  }

  const rawRegionRates: Record<string, unknown> = activeSettings.regionRates || {};
  const regionRates: Record<string, number> = {};
  Object.keys(rawRegionRates).forEach((key) => {
    regionRates[key.trim().toLowerCase()] = Number(rawRegionRates[key]) || 0;
  });

  const city = safeString(shippingAddress.city).toLowerCase();
  const region = safeString(shippingAddress.region).toLowerCase();

  if (city && regionRates[city] !== undefined) return regionRates[city];
  if (region && regionRates[region] !== undefined) return regionRates[region];

  const matchedKey = Object.keys(regionRates).find((key) => city.includes(key) || region.includes(key));
  if (matchedKey) return regionRates[matchedKey];
  if (regionRates.other !== undefined) return regionRates.other;

  return Number(activeSettings.defaultRate) || 0;
}

function generateOrderNumber(): string {
  const epoch = Date.now().toString().slice(-8);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `HA${epoch}${suffix}`;
}

async function processGatewayPayment(method: PaymentMethodCode, order: admin.firestore.DocumentData, paymentData: admin.firestore.DocumentData): Promise<GatewayPaymentResult> {
  if (method === 'cod') {
    return {
      success: true,
      transactionId: `cod_${order.id || order.orderNumber}_${Date.now()}`,
      method,
    };
  }

  if (!CONFIG.paymentSandboxMode) {
    return {
      success: false,
      method,
      error: `${method.toUpperCase()} gateway integration is not configured on the server`,
    };
  }

  const shouldFail = paymentData?.forceFail === true;
  if (shouldFail) {
    return {
      success: false,
      method,
      error: `${method.toUpperCase()} sandbox payment was forced to fail`,
    };
  }

  return {
    success: true,
    transactionId: `${method}_${order.id || order.orderNumber}_${Date.now()}`,
    method,
    raw: { sandbox: true },
  };
}

function buildConversationAiExtraContext(conversation: ConversationDoc): string {
  const parts: string[] = [];
  if (conversation.storeSnapshot?.storeName) {
    parts.push(`Current store: ${conversation.storeSnapshot.storeName}`);
  }
  if (conversation.productSnapshot?.title) {
    parts.push(`Active product context: ${conversation.productSnapshot.title}`);
  }
  if (conversation.userSnapshot?.name) {
    parts.push(`Customer name: ${conversation.userSnapshot.name}`);
  }
  return parts.join('\n');
}

function mapChatHistory(messages: admin.firestore.QueryDocumentSnapshot[]): HistoryMessage[] {
  return messages
    .sort((a, b) => {
      const aTime = coerceTimestamp(a.data().createdAt)?.getTime() || 0;
      const bTime = coerceTimestamp(b.data().createdAt)?.getTime() || 0;
      return aTime - bTime;
    })
    .map((doc) => {
      const data = doc.data();
      const role: HistoryRole = data.senderType === 'user' ? 'user' : 'model';
      const type = safeString(data.type || 'text');
      let content = sanitizePlainText(data.text || '');
      if (!content) {
        if (type === 'image') content = 'User sent an image.';
        else if (type === 'file') content = 'User sent a file.';
        else if (type === 'product') content = 'User sent a product card.';
        else if (type === 'order') content = 'User sent an order summary.';
      }
      return { role, content };
    })
    .filter((entry) => entry.content);
}

function isAdminPauseActive(conversation: ConversationDoc): boolean {
  if (!conversation.aiPaused) return false;
  const lastActive = coerceTimestamp(conversation.adminLastActive);
  if (!lastActive) return true;
  return Date.now() - lastActive.getTime() < CONFIG.aiAdminPauseMs;
}

async function maybeGenerateAiReply(conversationId: string, messageId: string, messageData: admin.firestore.DocumentData, conversationData: ConversationDoc): Promise<void> {
  const text = sanitizePlainText(messageData.text || '');
  if (!text) return;
  if (isAdminPauseActive(conversationData)) return;

  await sleep(CONFIG.aiDebounceMs);

  const conversationRef = db.collection('conversations').doc(conversationId);
  const latestConversationSnap = await conversationRef.get();
  if (!latestConversationSnap.exists) return;

  const latestConversation = latestConversationSnap.data() as ConversationDoc;
  if (latestConversation.aiPaused && !isAdminPauseActive(latestConversation)) {
    await conversationRef.set({ aiPaused: false }, { merge: true });
  }
  if (isAdminPauseActive(latestConversation)) return;

  const latestMessageSnap = await conversationRef.collection('messages').orderBy('createdAt', 'desc').limit(1).get();
  if (latestMessageSnap.empty) return;

  const latestMessage = latestMessageSnap.docs[0];
  if (latestMessage.id !== messageId) {
    return;
  }

  const historySnap = await conversationRef.collection('messages').orderBy('createdAt', 'desc').limit(10).get();
  const history = mapChatHistory(historySnap.docs);
  const aiResult = await generateAIResponse(
    text,
    history,
    buildConversationAiExtraContext(latestConversation),
    CONFIG.openAiApiKey,
    {
      userId: latestConversation.userId,
      aiModel: process.env.ANTHROPIC_MODEL,
    },
  );

  if (!aiResult.success || !sanitizePlainText(aiResult.response)) {
    return;
  }

  await conversationRef.collection('messages').add({
    text: sanitizePlainText(aiResult.response),
    senderType: 'admin',
    senderId: latestConversation.adminId || 'ai-bot',
    senderName: latestConversation.adminSnapshot?.name || 'Asankary Assistant',
    createdAt: FieldValue.serverTimestamp(),
    type: 'text',
    isAi: true,
  });
}

async function deleteCollectionInBatches(collectionRef: admin.firestore.CollectionReference, pageSize = 200): Promise<number> {
  let deleted = 0;
  while (true) {
    const snapshot = await collectionRef.limit(pageSize).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < pageSize) break;
  }
  return deleted;
}

async function deleteConversationTree(conversationRef: admin.firestore.DocumentReference): Promise<void> {
  await deleteCollectionInBatches(conversationRef.collection('messages'));
  await conversationRef.delete();
}

async function syncProductVideoUrl(productId: string, videoUrl: string | null): Promise<void> {
  const rootRef = db.collection('parts').doc(productId);
  const rootSnap = await rootRef.get();
  const updatePayload = {
    videoUrl: videoUrl || FieldValue.delete(),
    videoUpdatedAt: FieldValue.serverTimestamp(),
  };

  if (rootSnap.exists) {
    await rootRef.set(updatePayload, { merge: true });
    const tenantId = safeString(rootSnap.data()?.tenantId);
    if (tenantId) {
      const nestedRef = db.doc(`tenants/${tenantId}/products/${productId}`);
      const nestedSnap = await nestedRef.get();
      if (nestedSnap.exists) {
        await nestedRef.set(updatePayload, { merge: true });
      }
    }
  }
}

function parseImagePayload(image: unknown): { mimeType: string; base64Data: string; sizeBytes: number } {
  const raw = safeString(image);
  if (!raw) {
    throw new functions.https.HttpsError('invalid-argument', 'Image data is required');
  }

  const dataUrlMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  const mimeType = dataUrlMatch?.[1] || 'image/jpeg';
  const base64Data = dataUrlMatch?.[2] || raw;
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mimeType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported image type');
  }

  const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
  if (sizeBytes > 8 * 1024 * 1024) {
    throw new functions.https.HttpsError('invalid-argument', 'Image exceeds maximum size of 8MB');
  }

  return { mimeType, base64Data, sizeBytes };
}

async function buildrequestuestFromPayload(data: any, context: functions.https.CallableContext): Promise<{ message: string; history: HistoryMessage[]; language: 'en' | 'ar' | 'ku'; extraContext: string }> {
  const language = normalizeLanguage(data?.language || data?.preferredLanguage);
  const history: HistoryMessage[] = [];
  let message = '';

  if (Array.isArray(data?.messages)) {
    const safeMessages = data.messages
      .filter((item: any) => item && typeof item.content === 'string' && typeof item.role === 'string')
      .map((item: any) => ({ role: item.role as HistoryRole, content: sanitizePlainText(item.content) }))
      .filter((item: HistoryMessage) => item.content);

    const lastUser = [...safeMessages].reverse().find((item: HistoryMessage) => item.role === 'user');
    message = lastUser?.content || '';
    safeMessages.slice(0, -1).forEach((item: HistoryMessage) => {
      if (item.role === 'user' || item.role === 'model' || item.role === 'assistant') {
        history.push(item);
      }
    });
  }

  if (!message) {
    message = sanitizePlainText(data?.message || '');
  }

  if (Array.isArray(data?.conversationHistory)) {
    for (const item of data.conversationHistory) {
      if (item && typeof item.content === 'string') {
        history.push({
          role: item.role === 'user' ? 'user' : 'model',
          content: sanitizePlainText(item.content),
        });
      }
    }
  }

  const extraContextParts: string[] = [];
  if (context.auth?.uid) {
    const userSnap = await db.collection('users').doc(context.auth.uid).get().catch(() => null);
    if (userSnap?.exists) {
      const user = userSnap.data() || {};
      extraContextParts.push(`Signed-in user name: ${safeString(user.displayName || user.fullName || user.name || 'Customer')}`);
      if (safeString(user.city || user.region)) {
        extraContextParts.push(`Signed-in user location: ${safeString(user.city || '')} ${safeString(user.region || '')}`.trim());
      }
    }
  }

  return {
    message,
    history: history.slice(-12),
    language,
    extraContext: extraContextParts.join('\n'),
  };
}

export const askChatbot = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);

  if (!CONFIG.openAiApiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'AI service is not configured');
  }

  const request = await buildrequestuestFromPayload(data, context);
  if (!request.message) {
    throw new functions.https.HttpsError('invalid-argument', 'A message is required');
  }

  const aiResult = await generateAIResponse(
    request.message,
    request.history,
    request.extraContext,
    CONFIG.openAiApiKey,
    {
      userId: uid,
      preferredLanguage: request.language,
      aiModel: process.env.ANTHROPIC_MODEL,
    },
  );

  if (!aiResult.success) {
    throw new functions.https.HttpsError('internal', aiResult.response || 'Failed to generate AI response');
  }

  return {
    success: true,
    text: sanitizePlainText(aiResult.response),
    source: aiResult.source,
    strategy: aiResult.strategy,
    language: aiResult.language,
    debug: aiResult.debug,
  };
});

export const uploadImage = functions.https.onCall(async (data, context) => {
  requireAuth(context);

  if (!CONFIG.imgbbApiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'Image upload service is not configured');
  }

  const fileName = safeString(data?.fileName) || `image_${Date.now()}`;
  const { base64Data } = parseImagePayload(data?.image);

  const formData = new FormData();
  formData.append('image', base64Data);
  formData.append('name', fileName);

  const response = await axios.post(`https://api.imgbb.com/1/upload?key=${CONFIG.imgbbApiKey}`, formData, {
    headers: formData.getHeaders(),
    timeout: 30_000,
  });

  if (!response.data?.success) {
    throw new functions.https.HttpsError('internal', safeString(response.data?.error?.message) || 'Image upload failed');
  }

  return {
    success: true,
    url: response.data.data.url,
    displayUrl: response.data.data.display_url,
    thumbUrl: response.data.data.thumb?.url || null,
    deleteUrl: response.data.data.delete_url || null,
  };
});

export const processPayment = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const orderId = nonEmptyString(data?.orderId, 'orderId');
  const paymentMethod = parsePaymentMethod(data?.paymentMethod);
  const paymentData = typeof data?.paymentData === 'object' && data?.paymentData ? data.paymentData : {};

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Order not found');
  }

  const order: any = { id: orderSnap.id, ...(orderSnap.data() || {}) };
  if (order.userId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized access to order');
  }

  const gatewayResult = await processGatewayPayment(paymentMethod, order, paymentData);
  if (!gatewayResult.success) {
    await orderRef.set({
      paymentStatus: 'failed',
      paymentFailureReason: gatewayResult.error || 'Payment failed',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    throw new functions.https.HttpsError('failed-precondition', gatewayResult.error || 'Payment processing failed');
  }

  const confirmedStatus: OrderStatus = 'confirmed';
  await orderRef.set({
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
    paymentGateway: paymentMethod,
    gatewayRef: gatewayResult.transactionId || null,
    gatewayRaw: gatewayResult.raw || null,
    status: confirmedStatus,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    success: true,
    transactionId: gatewayResult.transactionId || null,
    orderId,
    status: confirmedStatus,
  };
});

export const updateOrderStatus = functions.https.onCall(async (data, context) => {
  await requireAdminUid(context);

  const orderId = nonEmptyString(data?.orderId, 'orderId');
  const status = nonEmptyString(data?.status, 'status') as OrderStatus;
  const trackingNumber = safeString(data?.trackingNumber);

  if (!ORDER_STATUSES.includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid order status');
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Order not found');
  }

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (trackingNumber) {
    updateData.trackingNumber = trackingNumber;
  }

  await orderRef.set(updateData, { merge: true });

  return {
    success: true,
    orderId,
    status,
  };
});

export const sendPromotionalNotification = functions.https.onCall(async (data, context) => {
  await requireAdminUid(context);

  const title = nonEmptyString(data?.title, 'title');
  const body = nonEmptyString(data?.body, 'body');
  const titleAr = safeString(data?.titleAr) || title;
  const titleKu = safeString(data?.titleKu) || title;
  const bodyAr = safeString(data?.bodyAr) || body;
  const bodyKu = safeString(data?.bodyKu) || body;
  const targetUsers = Array.isArray(data?.targetUsers) ? data.targetUsers.map((value: unknown) => safeString(value)).filter(Boolean) : [];

  let userIds: string[] = [];
  if (targetUsers.length > 0) {
    userIds = [...new Set(targetUsers)] as string[];
  } else {
    const snapshot = await db.collection('users').select().get();
    userIds = snapshot.docs.map((doc) => doc.id);
  }

  for (const batchIds of chunk(userIds, 300)) {
    const batch = db.batch();
    batchIds.forEach((userId) => {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        userId,
        title,
        titleAr,
        titleKu,
        body,
        bodyAr,
        bodyKu,
        type: 'promotion',
        data: { type: 'promotional' },
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.doc(`users/${userId}/meta/notifications`), { unreadNotificationCount: FieldValue.increment(1) }, { merge: true });
    });
    await batch.commit();
  }

  const pushResult = await sendPushToUsers(userIds, title, body, { type: 'promotional' });

  return {
    success: true,
    sentCount: userIds.length,
    pushSent: pushResult.sent,
    pushFailed: pushResult.failed,
    cleanedTokens: pushResult.cleaned,
  };
});

export const createOrder = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const cartItems = Array.isArray(data?.cartItems) ? data.cartItems : [];
  const shippingAddress = typeof data?.shippingAddress === 'object' && data.shippingAddress ? data.shippingAddress : null;
  const notes = safeString(data?.notes) || null;
  const paymentMethod = parsePaymentMethod(data?.paymentMethod);

  if (cartItems.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Cart items are required');
  }
  if (!shippingAddress) {
    throw new functions.https.HttpsError('invalid-argument', 'Shipping address is required');
  }

  const normalizedItems: CartItemInput[] = cartItems.map((item: any) => ({
    productId: nonEmptyString(item?.productId, 'productId'),
    quantity: clampNumber(item?.quantity, 1, 1000, 1),
  }));

  const orderRef = db.collection('orders').doc();
  const orderNumber = generateOrderNumber();

  const result = await db.runTransaction(async (transaction) => {
    const productRefs = normalizedItems.map((item) => db.collection('parts').doc(item.productId));
    const productDocs = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
    const shippingSettingsDoc = await transaction.get(db.collection('settings').doc('shipping'));

    let subtotalUSD = 0;
    const validatedItems: ValidatedOrderItem[] = [];

    normalizedItems.forEach((item, index) => {
      const productDoc = productDocs[index];
      if (!productDoc.exists) {
        throw new functions.https.HttpsError('invalid-argument', `Product ${item.productId} not found`);
      }

      const product = productDoc.data() || {};
      const currentStock = Number(product.stockQty || 0);
      if (currentStock < item.quantity) {
        throw new functions.https.HttpsError('failed-precondition', `Insufficient stock for ${safeString(product.name || item.productId)}`);
      }

      const priceUSD = Number(product.priceUSD || 0);
      const totalUSD = priceUSD * item.quantity;
      subtotalUSD += totalUSD;

      validatedItems.push({
        productId: item.productId,
        tenantId: safeString(product.tenantId) || null,
        productName: safeString(product.name || 'Product'),
        partNumber: safeString(product.partNumber) || null,
        priceUSD,
        quantity: item.quantity,
        totalUSD,
        shippingCost: Number(product.shippingCost || 0),
        imageUrl: Array.isArray(product.imageUrls) ? safeString(product.imageUrls[0]) || null : safeString(product.imageUrl) || null,
      });

      transaction.set(productDoc.ref, {
        stockQty: FieldValue.increment(-item.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    const shippingUSD = calculateShipping(subtotalUSD, validatedItems, shippingAddress, shippingSettingsDoc.exists ? shippingSettingsDoc.data() || null : null);
    const taxUSD = 0;
    const totalUSD = subtotalUSD + shippingUSD + taxUSD;

    const orderPayload = {
      userId: uid,
      orderNumber,
      items: validatedItems,
      subtotalUSD,
      shippingUSD,
      taxUSD,
      totalUSD,
      paymentMethod: {
        type: paymentMethod,
        status: 'pending',
        transactionId: null,
      },
      paymentStatus: 'pending',
      status: 'pending',
      shippingAddress,
      notes,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(orderRef, orderPayload);

    const tenantItemsMap = new Map<string, ValidatedOrderItem[]>();
    validatedItems.forEach((item) => {
      if (!item.tenantId) return;
      const existing = tenantItemsMap.get(item.tenantId) || [];
      existing.push(item);
      tenantItemsMap.set(item.tenantId, existing);
    });

    for (const [tenantId, tenantItems] of tenantItemsMap.entries()) {
      const tenantSubtotalUSD = tenantItems.reduce((sum, item) => sum + item.totalUSD, 0);
      transaction.set(db.doc(`tenants/${tenantId}/orders/${orderRef.id}`), {
        ...orderPayload,
        items: tenantItems,
        tenantId,
        globalOrderId: orderRef.id,
        tenantSubtotalUSD,
      });
    }

    transaction.set(db.collection('carts').doc(uid), {
      userId: uid,
      items: [],
      subtotalUSD: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      totalUSD,
      routedTenants: Array.from(tenantItemsMap.keys()),
    };
  });

  // Admin notification is now handled by onOrderCreate trigger

  return {
    success: true,
    orderId: orderRef.id,
    orderNumber,
    totalUSD: result.totalUSD,
    debug: {
      routedTenants: result.routedTenants,
      productsFoundWithTenantId: result.routedTenants.length,
    },
  };
});

export const cancelOrder = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const orderId = nonEmptyString(data?.orderId, 'orderId');
  const reason = safeString(data?.reason) || 'Order cancelled';
  const isAdmin = context.auth?.token?.admin === true || context.auth?.token?.role === 'admin' || (await db.collection('admins').doc(uid).get()).exists;

  await db.runTransaction(async (transaction) => {
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Order not found');
    }

    const order = orderSnap.data() || {};
    if (order.userId !== uid && !isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Unauthorized access to order');
    }

    if (!['pending', 'confirmed'].includes(safeString(order.status))) {
      throw new functions.https.HttpsError('failed-precondition', 'Order cannot be cancelled at this stage');
    }

    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const productId = safeString(item.productId);
      if (!productId) continue;
      transaction.set(db.collection('parts').doc(productId), {
        stockQty: FieldValue.increment(clampNumber(item.quantity, 1, 1000, 1)),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(orderRef, {
      status: 'cancelled',
      paymentStatus: safeString(order.paymentStatus) === 'paid' ? 'refund_pending' : order.paymentStatus || 'pending',
      cancellationReason: reason,
      cancelledBy: isAdmin && order.userId !== uid ? 'admin' : 'user',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return {
    success: true,
    orderId,
    message: 'Order cancelled successfully',
  };
});

export const healthCheck = functions.https.onRequest((req, res) => {
  res.json({
    status: 'healthy',
    timestamp: getNowIso(),
    version: '2.0.0',
    features: {
      pushNotifications: true,
      orderManagement: true,
      imageUpload: Boolean(CONFIG.imgbbApiKey),
      paymentProcessing: true,
      ai: Boolean(CONFIG.openAiApiKey),
    },
  });
});

export const onOrderCreate = functions.firestore.document('orders/{orderId}').onCreate(async (snapshot, context) => {
  const orderData = snapshot.data() || {};
  const orderNumber = safeString(orderData.orderNumber) || context.params.orderId;
  
  try {
    const items = Array.isArray(orderData.items) ? orderData.items : [];
    const tenantItemsMap = new Map<string, any[]>();
    
    // Map items to their respective store owners (tenants)
    for (const item of items) {
      const tenantId = safeString(item.tenantId);
      if (tenantId) {
        const existing = tenantItemsMap.get(tenantId) || [];
        existing.push(item);
        tenantItemsMap.set(tenantId, existing);
      }
    }
    
    let adminIds = Array.from(tenantItemsMap.keys());
    
    // Fallback: if no tenantIds found (legacy products), notify all admins
    if (adminIds.length === 0) {
      const adminsSnapshot = await db.collection('admins').get();
      adminIds = adminsSnapshot.docs.map((doc: any) => doc.id);
    }

    if (adminIds.length > 0) {
      for (const adminId of adminIds) {
        // Calculate the subtotal specifically for this store owner
        const storeItems = tenantItemsMap.has(adminId) ? tenantItemsMap.get(adminId)! : items;
        const storeTotal = storeItems.reduce((acc, item) => {
          const itemTotal = Number(item.totalUSD) || (Number(item.priceUSD) * Number(item.quantity)) || 0;
          return acc + itemTotal;
        }, 0);
        
        const displayOrderNumber = orderNumber.replace(/[-#()]/g, '');
        const isIQD = orderData.currency === 'IQD';
        const exchangeRate = Number(orderData.exchangeRate) || 1500;
        const formattedTotal = isIQD 
          ? `${Math.round(storeTotal * exchangeRate).toLocaleString('en-US')} IQD` 
          : `$${storeTotal.toFixed(2)}`;
        
        const payload: NotificationPayload = {
          title: `New Order ${displayOrderNumber}`,
          titleAr: `طلب جديد ${displayOrderNumber}`,
          titleKu: `داواکاری نوێ ${displayOrderNumber}`,
          body: `A new order has been placed for ${formattedTotal}`,
          bodyAr: `تم تقديم طلب جديد بقيمة ${formattedTotal}`,
          bodyKu: `داواکاریەکی نوێ کرا بە بڕی ${formattedTotal}`,
          type: 'new_order',
          data: {
            type: 'order_status_update', // Route to Android 'orders' channel
            originalType: 'new_order',
            orderId: context.params.orderId,
            orderNumber,
          }
        };

        await createUserNotification(adminId, payload).catch((err) => {
          console.error(`Failed to create in-app notification for admin ${adminId}`, err);
        });

        await sendPushToUsers(
          [adminId],
          payload.title,
          payload.body,
          payload.data
        );
      }
    }
  } catch (error) {
    console.error('Failed to send order push creation to admins', error);
  }
  return null;
});

export const onOrderStatusUpdate = functions.firestore.document('orders/{orderId}').onUpdate(async (change, context) => {
  const before = change.before.data() || {};
  const after = change.after.data() || {};
  if (before.status === after.status) return null;

  const orderId = context.params.orderId;
  const userId = safeString(after.userId);
  if (!userId) return null;

  const extra: Record<string, unknown> = {};
  if (safeString(after.trackingNumber)) extra.trackingNumber = after.trackingNumber;
  if (safeString(after.cancelledBy)) extra.cancelledBy = after.cancelledBy;

  await sendOrderStatusNotification(userId, orderId, safeString(after.status), extra).catch((error) => {
    console.error('Failed to send order status notification', error);
  });

  return null;
});

export const chatWithAI = functions.https.onCall(async (data, context) => {
  if (!CONFIG.openAiApiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'AI service is not configured');
  }

  const request = await buildrequestuestFromPayload(data, context);
  if (!request.message) {
    throw new functions.https.HttpsError('invalid-argument', 'Message is required');
  }

  const aiResult = await generateAIResponse(
    request.message,
    request.history,
    request.extraContext,
    CONFIG.openAiApiKey,
    {
      userId: context.auth?.uid,
      preferredLanguage: request.language,
      aiModel: process.env.ANTHROPIC_MODEL,
    },
  );

  if (!aiResult.success) {
    throw new functions.https.HttpsError('internal', aiResult.response || 'Failed to process your message');
  }

  return {
    success: true,
    response: sanitizePlainText(aiResult.response),
    source: aiResult.source,
    strategy: aiResult.strategy,
    language: aiResult.language,
    debug: aiResult.debug,
  };
});

export const getOrCreateConversation = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const productId = nonEmptyString(data?.productId, 'productId');

  const productRecord = await loadProductAny(productId);
  if (!productRecord) {
    throw new functions.https.HttpsError('not-found', 'Product not found');
  }

  const productSnapshot = buildProductSnapshot(productRecord.data);
  const userSnapshot = await buildUserSnapshot(uid);
  const adminInfo = await resolveConversationAdmin(productRecord.data);

  const existingQuery = await db.collection('conversations').where('userId', '==', uid).where('productId', '==', productId).limit(5).get();
  if (!existingQuery.empty) {
    const docs = existingQuery.docs.sort((left, right) => {
      const leftTime = coerceTimestamp(left.data().updatedAt)?.getTime() || 0;
      const rightTime = coerceTimestamp(right.data().updatedAt)?.getTime() || 0;
      return rightTime - leftTime;
    });
    const primary = docs[0];
    await primary.ref.set({
      adminId: adminInfo.adminId,
      tenantId: adminInfo.tenantId,
      adminSnapshot: adminInfo.adminSnapshot,
      storeSnapshot: adminInfo.storeSnapshot,
      userSnapshot,
      productSnapshot,
      productTitle: productSnapshot.title,
      productImage: productSnapshot.imageUrl,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const fresh = await primary.ref.get();
    return {
      success: true,
      conversation: { id: fresh.id, ...(fresh.data() || {}) },
    };
  }

  const conversationId = deterministicId(['product-conversation', uid, productId]);
  const conversationRef = db.collection('conversations').doc(conversationId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(conversationRef);
    if (existing.exists) return;

    transaction.set(conversationRef, {
      userId: uid,
      adminId: adminInfo.adminId,
      tenantId: adminInfo.tenantId,
      adminSnapshot: adminInfo.adminSnapshot,
      storeSnapshot: adminInfo.storeSnapshot,
      userSnapshot,
      productId,
      productSnapshot,
      productTitle: productSnapshot.title,
      productImage: productSnapshot.imageUrl,
      unread: { user: 0, admin: 0 },
      deletedBy: { user: false, admin: false },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const created = await conversationRef.get();
  return {
    success: true,
    conversation: { id: created.id, ...(created.data() || {}) },
  };
});

export const markConversationRead = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const conversationId = nonEmptyString(data?.conversationId, 'conversationId');
  const conversationRef = db.collection('conversations').doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef);
    if (!conversationSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Conversation not found');
    }

    const conversation = conversationSnap.data() as ConversationDoc;
    const side: ConversationParty | null = conversation.userId === uid ? 'user' : conversation.adminId === uid ? 'admin' : null;
    if (!side) {
      throw new functions.https.HttpsError('permission-denied', 'Not a participant of this conversation');
    }

    transaction.set(conversationRef, {
      unread: {
        ...(conversation.unread || {}),
        [side]: 0,
      },
      lastReadAt: {
        [side]: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { success: true };
});

export const onMessageCreate = functions.firestore.document('conversations/{conversationId}/messages/{messageId}').onCreate(async (snapshot, context) => {
  const conversationId = context.params.conversationId;
  const messageId = context.params.messageId;
  const messageData = snapshot.data() || {};
  const senderType = safeString(messageData.senderType) as MessageSenderType;
  const senderName = sanitizePlainText(messageData.senderName || '');

  if (!senderType) return null;

  const conversationRef = db.collection('conversations').doc(conversationId);
  const conversationSnap = await conversationRef.get();
  if (!conversationSnap.exists) return null;

  const conversation = conversationSnap.data() as ConversationDoc;
  const oppositeSide: ConversationParty = senderType === 'user' ? 'admin' : 'user';
  const recipientId = senderType === 'user' ? conversation.adminId : conversation.userId;

  const patch: Record<string, unknown> = {
    lastMessage: {
      text: buildMessagePreview(messageData),
      type: safeString(messageData.type || 'text') || 'text',
      senderType,
      senderId: safeString(messageData.senderId),
      senderName,
      createdAt: messageData.createdAt || FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
    unread: {
      [oppositeSide]: FieldValue.increment(1),
    },
  };

  if (senderType === 'admin') {
    patch['deletedBy.user'] = false;
    if (!messageData.isAi) {
      patch.aiPaused = true;
      patch.adminLastActive = FieldValue.serverTimestamp();
    }
  }

  if (senderType === 'user') {
    patch['deletedBy.admin'] = false;
  }

  if (!conversation.userSnapshot?.name) {
    patch.userSnapshot = await buildUserSnapshot(conversation.userId);
  }

  await conversationRef.set(patch, { merge: true });

  const notificationBody = buildMessagePreview(messageData) || (senderType === 'user' ? 'New customer message' : 'New seller message');
  const notificationTitle = senderType === 'user'
    ? `${conversation.userSnapshot?.name || senderName || 'Customer'} sent a message`
    : `${conversation.storeSnapshot?.storeName || conversation.adminSnapshot?.name || senderName || 'Store'} sent a message`;

  await sendPushToUsers([recipientId], notificationTitle, notificationBody, {
    type: 'chat_message',
    conversationId,
    senderType,
    productId: safeString(conversation.productId),
  }).catch((error) => {
    console.error('Chat push notification failed', error);
  });

  if (senderType === 'user') {
    await maybeGenerateAiReply(conversationId, messageId, messageData, conversation).catch((error) => {
      console.error('Auto AI reply failed', error);
    });
  }

  return null;
});

const BUNNY_UPLOAD_RUNTIME = functions.runWith({ timeoutSeconds: 300, memory: '512MB' });

export const uploadProductVideo = BUNNY_UPLOAD_RUNTIME.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!CONFIG.bunnyStoragePassword) {
    res.status(500).json({ error: 'Video upload service is not configured' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthenticated', message: 'Missing Authorization header' });
    return;
  }

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(authHeader.slice('Bearer '.length));
  } catch (error) {
    res.status(401).json({ error: 'unauthenticated', message: 'Invalid Firebase token' });
    return;
  }

  const uid = decodedToken.uid;
  const isLegacyAdmin = decodedToken.admin === true || decodedToken.role === 'admin';
  const adminDoc = await db.collection('admins').doc(uid).get();
  if (!adminDoc.exists && !isLegacyAdmin) {
    res.status(403).json({ error: 'permission-denied', message: 'Only admins can upload videos' });
    return;
  }

  const productId = safeString(req.query.productId);
  if (!productId) {
    res.status(400).json({ error: 'invalid-argument', message: 'productId is required' });
    return;
  }

  const contentType = safeString(req.headers['content-type']);
  if (!contentType.startsWith('video/')) {
    res.status(400).json({ error: 'invalid-argument', message: 'Content-Type must be video/*' });
    return;
  }

  const productSnap = await db.collection('parts').doc(productId).get();
  if (!productSnap.exists) {
    res.status(404).json({ error: 'not-found', message: 'Product not found' });
    return;
  }

  const product = productSnap.data() || {};
  const ownerAdminId = safeString(product.ownerAdminId || product.adminId || product.tenantId);
  if (ownerAdminId && ownerAdminId !== uid && !isLegacyAdmin) {
    res.status(403).json({ error: 'permission-denied', message: 'You do not own this product' });
    return;
  }

  const videoBuffer = req.rawBody;
  if (!videoBuffer || videoBuffer.length === 0) {
    res.status(400).json({ error: 'invalid-argument', message: 'Video data is required' });
    return;
  }

  if (videoBuffer.length > 50 * 1024 * 1024) {
    res.status(400).json({ error: 'invalid-argument', message: 'Video exceeds maximum size of 50MB' });
    return;
  }

  const extension = contentType.includes('mp4') ? 'mp4' : contentType.includes('quicktime') ? 'mov' : contentType.includes('webm') ? 'webm' : 'mp4';
  const storagePath = `products/${productId}/video_${Date.now()}.${extension}`;
  const bunnyUrl = `https://storage.bunnycdn.com/${CONFIG.bunnyStorageZone}/${storagePath}`;

  try {
    const response = await axios.put(bunnyUrl, videoBuffer, {
      headers: {
        AccessKey: CONFIG.bunnyStoragePassword,
        'Content-Type': 'application/octet-stream',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120_000,
    });

    if (![200, 201].includes(response.status)) {
      throw new Error(`Unexpected Bunny response: ${response.status}`);
    }
  } catch (error: any) {
    console.error('Bunny upload failed', error?.response?.data || error?.message || error);
    res.status(500).json({ error: 'upload-failed', message: 'Failed to upload video to CDN' });
    return;
  }

  const videoUrl = `https://${CONFIG.bunnyCdnHostname}/${storagePath}`;
  await syncProductVideoUrl(productId, videoUrl);

  res.status(200).json({
    success: true,
    productId,
    videoUrl,
    size: videoBuffer.length,
  });
});

export const deleteProductVideo = functions.https.onCall(async (data, context) => {
  const uid = await requireAdminUid(context);

  if (!CONFIG.bunnyStoragePassword) {
    throw new functions.https.HttpsError('failed-precondition', 'Video service is not configured');
  }

  const productId = nonEmptyString(data?.productId, 'productId');
  const videoUrl = nonEmptyString(data?.videoUrl, 'videoUrl');
  const productSnap = await db.collection('parts').doc(productId).get();
  if (!productSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Product not found');
  }

  const product = productSnap.data() || {};
  const ownerAdminId = safeString(product.ownerAdminId || product.adminId || product.tenantId);
  const isLegacyAdmin = context.auth?.token?.admin === true || context.auth?.token?.role === 'admin';
  if (ownerAdminId && ownerAdminId !== uid && !isLegacyAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'You do not own this product');
  }

  const cdnHostname = `https://${CONFIG.bunnyCdnHostname}/`;
  if (!videoUrl.startsWith(cdnHostname)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid video URL');
  }

  const storagePath = videoUrl.replace(cdnHostname, '');
  try {
    await axios.delete(`https://storage.bunnycdn.com/${CONFIG.bunnyStorageZone}/${storagePath}`, {
      headers: { AccessKey: CONFIG.bunnyStoragePassword },
      timeout: 30_000,
    });
  } catch (error) {
    console.warn('Bunny video delete warning', error);
  }

  await syncProductVideoUrl(productId, null);
  return { success: true, productId };
});

export const onUserMessageCreate = functions.firestore.document('conversations/{conversationId}/messages/{messageId}').onCreate(async () => {
  // Intentionally left as a no-op.
  // The old project had two different AI auto-reply triggers on the same path,
  // which could create duplicate AI replies. `onMessageCreate` is now the single source of truth.
  return null;
});

export const linkPhoneIndex = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const phoneE164 = normalizePhone(nonEmptyString(data?.phoneE164, 'phoneE164'));

  let type = 'customer';
  let tenantId: string | undefined;
  const adminSnap = await db.collection('admins').doc(uid).get();
  if (adminSnap.exists) {
    type = 'admin';
    tenantId = safeString(adminSnap.data()?.tenantId) || undefined;
  }

  await db.runTransaction(async (transaction) => {
    const indexRef = db.collection('phoneIndex').doc(phoneE164);
    const indexSnap = await transaction.get(indexRef);
    if (indexSnap.exists && safeString(indexSnap.data()?.uid) !== uid) {
      throw new functions.https.HttpsError('already-exists', 'Phone number already in use by another account');
    }

    transaction.set(indexRef, {
      uid,
      type,
      ...(tenantId ? { tenantId } : {}),
      createdAt: indexSnap.exists ? indexSnap.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(db.collection('users').doc(uid), {
      phoneNumber: phoneE164,
      phoneVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (type === 'admin') {
      transaction.set(db.collection('admins').doc(uid), {
        phoneNumber: phoneE164,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  return { success: true };
});

export const sendCustomVerificationEmail = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const email = nonEmptyString(data?.email, 'email').toLowerCase();
  const transporter = getEmailTransporter();

  const userRecord = await admin.auth().getUser(uid);
  if (!userRecord.email || userRecord.email !== email) {
    await admin.auth().updateUser(uid, { email, emailVerified: false });
  }

  const verificationLink = await admin.auth().generateEmailVerificationLink(email, {
    url: 'https://ASANKARY_DOMAIN_TBD/profile',
    handleCodeInApp: false,
  });

  await transporter.sendMail({
    from: `"Asankary" <${CONFIG.smtpUser}>`,
    to: email,
    subject: 'Verify your email address for Asankary',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your Email - Asankary</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f7fa;font-family:Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fa;padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:600px;width:100%;">
              <tr><td align="center" style="background:#121223;padding:40px 20px;border-bottom:4px solid #FF7622;">
                <h1 style="color:#fff;font-size:28px;margin:0;font-weight:800;">Asankary</h1>
              </td></tr>
              <tr><td style="padding:40px 48px;">
                <h2 style="color:#32343E;font-size:24px;margin:0 0 24px;">Welcome to the family</h2>
                <p style="color:#646982;font-size:16px;line-height:24px;margin:0 0 32px;">Thank you for joining Asankary. Please verify your email address to secure your account.</p>
                <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
                  <a href="${verificationLink}" style="display:inline-block;background:#FF7622;color:#fff;text-decoration:none;padding:16px 48px;border-radius:12px;font-weight:bold;">Verify Email Address</a>
                </td></tr></table>
                <p style="color:#A0A5BA;font-size:14px;line-height:22px;margin:32px 0 0;text-align:center;">This link will expire automatically. If you did not request it, you can ignore this email.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  });

  return { success: true, message: 'Verification email sent successfully.' };
});

export const sendAdminEmailOTP = functions.https.onCall(async (data) => {
  const email = nonEmptyString(data?.email, 'email').toLowerCase();
  const transporter = getEmailTransporter();
  const otpRef = db.collection('emailOTPs').doc(email);
  const code = String(Math.floor(100000 + Math.random() * 900000));

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(otpRef);
    if (existing.exists) {
      const existingData = existing.data() as EmailOtpRecord;
      const createdAt = coerceTimestamp(existingData.createdAt);
      if (createdAt && Date.now() - createdAt.getTime() < 60_000) {
        throw new functions.https.HttpsError('resource-exhausted', 'Please wait before requesting a new code');
      }
    }

    transaction.set(otpRef, {
      email,
      codeHash: hashOtp(email, code),
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60_000)),
      attempts: 0,
    });
  });

  await transporter.sendMail({
    from: `"Asankary" <${CONFIG.smtpUser}>`,
    to: email,
    subject: 'Your admin verification code — Asankary',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#f4f7fa;font-family:Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fa;padding:40px 0;">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);max-width:520px;width:100%;">
              <tr><td align="center" style="background:#121223;padding:32px 20px;border-bottom:4px solid #FF7622;">
                <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Asankary</h1>
              </td></tr>
              <tr><td style="padding:40px;">
                <h2 style="color:#32343E;font-size:22px;margin:0 0 16px;">Admin verification code</h2>
                <p style="color:#646982;font-size:15px;line-height:22px;margin:0 0 28px;">Use this code to verify your email. It expires in 10 minutes.</p>
                <div style="text-align:center;background:#F4F6F9;border-radius:12px;padding:24px;">
                  <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#FF7622;">${code}</span>
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  });

  return { success: true };
});

export const verifyAdminEmailOTP = functions.https.onCall(async (data) => {
  const email = nonEmptyString(data?.email, 'email').toLowerCase();
  const code = nonEmptyString(data?.code, 'code');
  const otpRef = db.collection('emailOTPs').doc(email);

  const verified = await db.runTransaction(async (transaction) => {
    const otpSnap = await transaction.get(otpRef);
    if (!otpSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'No code found. Please request a new one.');
    }

    const otpData = otpSnap.data() as EmailOtpRecord;
    const expiresAt = coerceTimestamp(otpData.expiresAt);
    if (!expiresAt || Date.now() > expiresAt.getTime()) {
      transaction.delete(otpRef);
      throw new functions.https.HttpsError('deadline-exceeded', 'Code expired. Request a new one.');
    }

    if ((otpData.attempts || 0) >= 5) {
      transaction.delete(otpRef);
      throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Request a new code.');
    }

    const nextAttempts = (otpData.attempts || 0) + 1;
    transaction.set(otpRef, { attempts: nextAttempts }, { merge: true });

    const expectedHash = hashOtp(email, code);
    if (!timingSafeEquals(expectedHash, otpData.codeHash)) {
      if (nextAttempts >= 5) {
        transaction.delete(otpRef);
      }
      throw new functions.https.HttpsError('permission-denied', 'Incorrect code.');
    }

    transaction.delete(otpRef);
    return true;
  });

  return { success: true, verified };
});

export const upsertPhoneToUid = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const userRecord = await admin.auth().getUser(uid);
  if (!userRecord.phoneNumber) {
    throw new functions.https.HttpsError('failed-precondition', 'No phone number on auth user');
  }

  const docId = phoneDocId(userRecord.phoneNumber);
  const phoneToUidRef = db.collection('phoneToUid').doc(docId);
  const existing = await phoneToUidRef.get();
  if (existing.exists && safeString(existing.data()?.uid) !== uid) {
    throw new functions.https.HttpsError('already-exists', 'This phone is linked to another account');
  }

  await phoneToUidRef.set({
    uid,
    phone: userRecord.phoneNumber,
    collection: 'users',
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existing.exists ? existing.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});

export const resolvePhoneLogin = functions.https.onCall(async (data) => {
  const rawPhone = nonEmptyString(data?.phone, 'phone');
  const phoneE164 = (() => {
    try {
      return normalizePhone(rawPhone);
    } catch {
      return rawPhone;
    }
  })();

  try {
    const mapping = await db.collection('phoneToUid').doc(phoneDocId(phoneE164)).get();
    if (mapping.exists) {
      const uid = safeString(mapping.data()?.uid);
      if (uid) {
        const userRecord = await admin.auth().getUser(uid).catch(() => null);
        return { internalEmail: userRecord?.email || `${uid}@asankaryapp.internal` };
      }
    }
  } catch {
    // continue to legacy lookups
  }

  for (const collectionName of ['users', 'admins']) {
    for (const fieldName of ['phone', 'phoneNumber']) {
      const snapshot = await db.collection(collectionName).where(fieldName, '==', phoneE164).limit(1).get();
      if (!snapshot.empty) {
        const uid = snapshot.docs[0].id;
        const userRecord = await admin.auth().getUser(uid).catch(() => null);
        return { internalEmail: userRecord?.email || `${uid}@asankaryapp.internal` };
      }
    }
  }

  throw new functions.https.HttpsError('not-found', 'Invalid credentials');
});

export const checkPhoneRegistered = functions.https.onCall(async (data) => {
  const rawPhone = nonEmptyString(data?.phone, 'phone');
  const phoneE164 = (() => {
    try {
      return normalizePhone(rawPhone);
    } catch {
      return rawPhone;
    }
  })();

  for (const collectionName of ['users', 'admins']) {
    for (const fieldName of ['phone', 'phoneNumber']) {
      const snapshot = await db.collection(collectionName).where(fieldName, '==', phoneE164).limit(1).get();
      if (!snapshot.empty) {
        return { exists: true, uid: snapshot.docs[0].id };
      }
    }
  }

  return { exists: false, uid: null };
});

export const deleteAdminAccount = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const adminSnap = await db.collection('admins').doc(uid).get();
  if (!adminSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Admin account not found');
  }

  const adminData = adminSnap.data() || {};
  const tenantId = safeString(adminData.tenantId);
  if (!tenantId || tenantId !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'You can only delete your own tenant account');
  }

  const tenantSubcollections = ['products', 'orders', 'categories', 'customers', 'settings', 'members', 'notifications', 'locations', 'public', 'analytics', 'discounts'];
  for (const sub of tenantSubcollections) {
    await deleteCollectionInBatches(db.collection(`tenants/${tenantId}/${sub}`));
  }

  const conversationSnap = await db.collection('conversations').where('adminId', '==', uid).get();
  for (const conversationDoc of conversationSnap.docs) {
    await deleteConversationTree(conversationDoc.ref);
  }

  while (true) {
    const partsSnap = await db.collection('parts').where('ownerAdminId', '==', uid).limit(200).get();
    if (partsSnap.empty) break;
    const batch = db.batch();
    partsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    if (partsSnap.size < 200) break;
  }

  await db.collection('tenants').doc(tenantId).delete().catch(() => undefined);
  await db.collection('admins').doc(uid).delete().catch(() => undefined);
  await db.collection('users').doc(uid).delete().catch(() => undefined);

  for (const fieldName of ['phone', 'phoneNumber']) {
    const phoneValue = safeString(adminData[fieldName]);
    if (phoneValue) {
      try {
        await db.collection('phoneToUid').doc(phoneDocId(normalizePhone(phoneValue))).delete();
      } catch {
        // ignore cleanup failure
      }
      break;
    }
  }

  await admin.auth().deleteUser(uid).catch((error) => {
    console.warn('Auth user delete warning', error?.message || error);
  });

  return { success: true, message: 'Admin account and tenant data deleted' };
});

export const deleteUserAccount = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  
  // 1. Get user record to find phone number
  let phoneE164: string | undefined;
  try {
    // Check Firestore first (most reliable source for our custom auth flow)
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      if (data?.phone) {
        phoneE164 = normalizePhone(data.phone);
      }
    }
    
    // Fallback to Auth record if not found in Firestore
    if (!phoneE164) {
      const userRecord = await admin.auth().getUser(uid);
      if (userRecord.phoneNumber) {
         phoneE164 = normalizePhone(userRecord.phoneNumber);
      }
    }
  } catch (err) {
    console.warn('Could not fetch user record for deletion', err);
  }

  // 2. Delete Firestore user document
  await db.collection('users').doc(uid).delete().catch(() => undefined);

  // 3. Delete phoneIndex and phoneToUid mappings
  if (phoneE164) {
    try {
      await db.collection('phoneIndex').doc(phoneE164).delete().catch(() => undefined);
      await db.collection('phoneToUid').doc(phoneDocId(phoneE164)).delete().catch(() => undefined);
    } catch (err) {
      console.warn('Could not delete phone mappings', err);
    }
  }

  // 4. Delete Auth user
  await admin.auth().deleteUser(uid).catch((err) => {
    console.warn('Could not delete Auth user', err);
  });

  return { success: true, message: 'User account deleted' };
});

export const setInternalEmail = functions.https.onCall(async (data, context) => {
  const uid = requireAuth(context);
  const internalEmail = `${uid}@asankaryapp.internal`;
  const password = safeString(data?.password);

  const updates: admin.auth.UpdateRequest = {};
  const userRecord = await admin.auth().getUser(uid);
  if (userRecord.email !== internalEmail) {
    updates.email = internalEmail;
    updates.emailVerified = false;
  }
  if (password) {
    if (password.length < 6) {
      throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters');
    }
    updates.password = password;
  }

  if (Object.keys(updates).length > 0) {
    await admin.auth().updateUser(uid, updates);
  }

  return { success: true, email: internalEmail };
});

export const sendBulkPushNotifications = functions.https.onCall(async (data, context) => {
  await requireAdminUid(context);

  const title = nonEmptyString(data?.title, 'title');
  const body = nonEmptyString(data?.body, 'body');
  const targetUsers = Array.isArray(data?.targetUsers) ? data.targetUsers.map((value: unknown) => safeString(value)).filter(Boolean) : [];
  const notificationData = typeof data?.data === 'object' && data.data ? data.data : {};

  let userIds: string[];
  if (targetUsers.length > 0) {
    userIds = [...new Set(targetUsers)] as string[];
  } else {
    const usersSnapshot = await db.collection('users').select().get();
    userIds = usersSnapshot.docs.map((doc) => doc.id);
  }

  const result = await sendPushToUsers(userIds, title, body, notificationData);
  return {
    success: true,
    sentCount: result.sent,
    failureCount: result.failed,
    totalTargeted: userIds.length,
    cleanedDevices: result.cleaned,
  };
});

console.log('[functions] Refactored backend loaded', {
  aiConfigured: Boolean(CONFIG.openAiApiKey),
  imageUploadConfigured: Boolean(CONFIG.imgbbApiKey),
  bunnyConfigured: Boolean(CONFIG.bunnyStoragePassword),
  smtpConfigured: Boolean(CONFIG.smtpUser && CONFIG.smtpPass),
  sandboxPayments: CONFIG.paymentSandboxMode,
});

// VIP System Backend Validation
export const verifyAdminActionPassword = functions.https.onCall(async (data: any, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Endpoint requires authentication');
  }

  // React Native Firebase SDK may wrap data in data.data
  const payload = data?.data || data;
  console.log('verifyAdminActionPassword received action:', payload?.action, 'keys:', Object.keys(payload || {}));

  const { password, action, targetUserId, newRole } = payload;

  if (!password || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Verify the admin caller (make sure they exist in admins collection or have token claim)
  const isLegacyAdmin = context.auth?.token?.admin === true || context.auth?.token?.role === 'admin';
  const adminDocReq = await db.collection('admins').doc(uid).get();
  
  if (!isLegacyAdmin && !adminDocReq.exists) {
     throw new functions.https.HttpsError('permission-denied', 'Only admins can perform this action');
  }

  // Master admin action password is in `settings/security` document
  // Fallback ONLY to prevent full lockouts during deployment
  const securityDoc = await db.doc('settings/security').get();
  let validPassword = process.env.ADMIN_ACTION_PASSWORD || '1990'; 
  
  if (securityDoc.exists && securityDoc.data()?.adminActionPassword) {
      validPassword = securityDoc.data()?.adminActionPassword;
  }
  
  if (password !== validPassword) {
      console.warn(`Failed admin action auth attempt from UID: ${uid} for action: ${action}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid authorization password');
  }
  
  // Password validated. Perform the requested secure action.
  const result: any = { success: true, message: 'Action authorized' };
  
  try {
      if (action === 'assign_vip_role') {
          if (!targetUserId || !newRole) {
             throw new functions.https.HttpsError('invalid-argument', 'Missing target userId or role');
          }
          
          if (!['customer', 'vip'].includes(newRole)) {
             throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
          }
          
          const { tenantId: targetTenantId } = payload;

          // Update the global user document
          await db.doc(`users/${targetUserId}`).update({
              role: newRole,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Also update the tenant-specific customer document if tenantId is provided
          // Admin panel reads from tenants/{tenantId}/customers
          if (targetTenantId) {
              const tenantCustomerRef = db.doc(`tenants/${targetTenantId}/customers/${targetUserId}`);
              const tenantCustomerDoc = await tenantCustomerRef.get();
              if (tenantCustomerDoc.exists) {
                  await tenantCustomerRef.update({
                      role: newRole,
                      updatedAt: admin.firestore.FieldValue.serverTimestamp()
                  });
              }
          }
          
          result.actionResult = `Role updated to ${newRole}`;
      } else if (action === 'toggle_user_block') {
          if (!targetUserId || typeof payload.isBlocked !== 'boolean') {
              throw new functions.https.HttpsError('invalid-argument', 'Missing target userId or isBlocked flag');
          }
          const { tenantId: targetTenantId, isBlocked } = payload;

          const isTargetAdmin = (await db.doc(`admins/${targetUserId}`).get()).exists;
          const collectionPath = isTargetAdmin ? 'admins' : 'users';

          await db.doc(`${collectionPath}/${targetUserId}`).update({
              isBlocked,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          if (targetTenantId && !isTargetAdmin) {
              const tenantCustomerRef = db.doc(`tenants/${targetTenantId}/customers/${targetUserId}`);
              const tenantCustomerDoc = await tenantCustomerRef.get();
              if (tenantCustomerDoc.exists) {
                  await tenantCustomerRef.update({
                      isBlocked,
                      updatedAt: admin.firestore.FieldValue.serverTimestamp()
                  });
              }
          }
          result.actionResult = `User ${isBlocked ? 'blocked' : 'unblocked'}`;
      } else if (action === 'unlock_wholesale_settings') {
          // Just return success for client to unlock local state
          result.actionResult = 'Settings unlocked';
      } else {
          throw new functions.https.HttpsError('invalid-argument', 'Unknown secure action');
      }
      
      // Log successful secure action
      await db.collection('admin_action_logs').add({
          adminUid: uid,
          action,
          targetUserId: targetUserId || null,
          details: payload,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          ip: context.rawRequest ? context.rawRequest.ip : 'unknown'
      });
      
  } catch (error: any) {
      console.error(`Secure action failed: ${error.message}`);
      throw new functions.https.HttpsError('internal', `Failed to execute action: ${error.message}`);
  }

  return result;
});

export const visualSearch = functions
  .runWith({ timeoutSeconds: 60, memory: '1GB' })
  .https.onCall(async (data: any, context) => {
    // Handle both native SDK (data.imageBase64) and fetch-based (data.data.imageBase64) wrapping
    const payload = data?.data || data;
    const imageBase64 = payload?.imageBase64;
    
    console.log('visualSearch: received data keys:', Object.keys(data || {}), 
      'payload keys:', Object.keys(payload || {}),
      'base64 length:', typeof imageBase64 === 'string' ? imageBase64.length : 'not a string');
    
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'imageBase64 must be a valid base64 string');
    }

    try {
      // Decode base64 to buffer, resize with sharp, encode back to base64
      // This prevents 48MP iPhone images from destroying token limits
      const sharp = require('sharp');
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const resizedBuffer = await sharp(imageBuffer)
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      
      const resizedBase64 = resizedBuffer.toString('base64');
      console.log('visualSearch: resized base64 length:', resizedBase64.length);

      const result = await analyzeVisualSearch(resizedBase64);
      return {
        success: true,
        query: result.primaryQuery, // backward compat
        analysis: result,           // full structured data
      };
    } catch (error: any) {
      console.error('visualSearch cloud function error:', error.message, error.response?.data || '');
      throw new functions.https.HttpsError('internal', 'Visual search failed');
    }
  });
