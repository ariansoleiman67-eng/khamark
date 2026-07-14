/**
 * Script to create/update the force update config document in Firestore automatically.
 * Reads version info from app.json so it's always in sync.
 *
 * Run:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json npx ts-node scripts/init-force-update-config.ts
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-read version from app.json
const appJsonPath = path.resolve(__dirname, '../app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const version = appJson.expo?.version || appJson.version || '1.0.0';
const versionCode = appJson.expo?.android?.versionCode || 1;
const buildNumber = Number(appJson.expo?.ios?.buildNumber || '1');

console.log(`📱 Read from app.json: version=${version}, versionCode=${versionCode}, buildNumber=${buildNumber}`);

const config = {
  minAppVersion: version,
  minVersionCode: versionCode,
  minBuildNumber: buildNumber,
  forceUpdate: false, // Change to true when you want to force users to update
  updateMessage:
    'A new version of Haryad Auto Part is available with important updates. Please update to continue.',
  updateMessageAr:
    'إصدار جديد من تطبيق هرياد متاح. الرجاء التحديث للاستمرار.',
  updateMessageKu:
    'وەشانی نوێی ئەپی هەریاد بەردەستە. تکایە نوێ بکەرەوە.',
  androidStoreUrl:
    'https://play.google.com/store/apps/details?id=com.haryad.autopart',
  iosStoreUrl:
    'https://apps.apple.com/app/haryad-auto-part/id123456789',
  updatedAt: new Date(),
};

function initFirebase() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
    return;
  }

  const serviceAccountPath = './serviceAccountKey.json';
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      'No Firebase credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or add serviceAccountKey.json'
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
}

async function main() {
  initFirebase();
  const db = getFirestore();
  await db.collection('config').doc('app').set(config, { merge: true });

  console.log('✅ Firestore config/app updated successfully');
  console.log(config);
}

main().catch((error) => {
  console.error('❌ Failed to initialize force update config');
  console.error(error);
  process.exit(1);
});
