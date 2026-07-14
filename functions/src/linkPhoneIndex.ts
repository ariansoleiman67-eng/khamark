import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Minimal Iraqi-focused normalizer to E.164.
 * If you support more countries later, switch to libphonenumber-js server-side.
 */
function normalizePhoneToE164(raw: string): string {
  const trimmed = (raw || '').trim();
  const compact = trimmed.replace(/\s+/g, '').replace(/-/g, '');

  if (!compact) return '';

  // Already E.164
  if (compact.startsWith('+')) return compact;

  // 00964xxxxxxxxxx -> +964xxxxxxxxxx
  if (compact.startsWith('00964')) return `+${compact.slice(2)}`;

  // 964xxxxxxxxxx -> +964xxxxxxxxxx
  if (compact.startsWith('964')) return `+${compact}`;

  // Local Iraqi: 07xxxxxxxxx or 7xxxxxxxxx
  const digits = compact.replace(/\D/g, '');
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+964${local}`;
}

function isValidE164(phoneE164: string): boolean {
  // Basic E.164: + then 8-15 digits
  return /^\+\d{8,15}$/.test(phoneE164);
}

export const linkPhoneIndex = functions.https.onCall(
  async (data: any, context: functions.https.CallableContext) => {
    try {
      // 1) Determine UID (context.auth preferred, hybrid idToken supported)
      let uid = context.auth?.uid;

      if (!uid && data?.idToken) {
        try {
          const decoded = await admin.auth().verifyIdToken(String(data.idToken));
          uid = decoded.uid;
        } catch (e) {
          throw new functions.https.HttpsError(
            'unauthenticated',
            'Invalid token. Please sign in again.'
          );
        }
      }

      if (!uid) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated to link phone'
        );
      }

      // Optional: client can send uidExpected (recommended)
      const uidExpected = data?.uidExpected ? String(data.uidExpected) : undefined;
      if (uidExpected && uidExpected !== uid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Security error: uid mismatch.'
        );
      }

      // 2) Validate + normalize phone
      const rawPhone = String(data?.phoneE164 || '');
      const phoneE164 = normalizePhoneToE164(rawPhone);

      if (!phoneE164) {
        throw new functions.https.HttpsError('invalid-argument', 'Phone number is required');
      }
      if (!isValidE164(phoneE164)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid phone format');
      }

      const indexRef = db.collection('phoneIndex').doc(phoneE164);
      const userRef = db.collection('users').doc(uid);

      // 3) Transaction prevents race conditions
      await db.runTransaction(async (tx) => {
        const indexSnap = await tx.get(indexRef);

        if (indexSnap.exists) {
          const existing = indexSnap.data() as { uid?: string } | undefined;

          // If linked to someone else -> block
          if (existing?.uid && existing.uid !== uid) {
            throw new functions.https.HttpsError(
              'already-exists',
              'This phone number is already linked to another account'
            );
          }

          // If already linked to same user -> idempotent success
          // Still update the user profile phone + timestamps
          tx.set(
            userRef,
            {
              phone: phoneE164,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // Optional: refresh updatedAt in index as well
          tx.set(
            indexRef,
            {
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          return;
        }

        // Decide type (optional): admin vs customer
        // If you have an "admins" collection, we can detect it:
        // const adminSnap = await tx.get(db.collection('admins').doc(uid));
        // const type = adminSnap.exists ? 'admin' : 'customer';

        const type: 'customer' = 'customer';

        // Create index entry
        tx.create(indexRef, {
          uid,
          type,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Ensure user has phone
        tx.set(
          userRef,
          {
            phone: phoneE164,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      console.log(`Phone linked: ${phoneE164} -> ${uid}`);
      return { success: true, phoneE164, uid };
    } catch (error: any) {
      // If it’s already an HttpsError, rethrow cleanly
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      console.error('linkPhoneIndex internal error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to link phone number');
    }
  }
);
