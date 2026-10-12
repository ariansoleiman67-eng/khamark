// Copy every file in the `media` storage bucket from the old Supabase project
// (Seoul) to the new one (London). Part of the EU migration — see README.md here.
//
// Keys are read from the environment and NEVER printed. Set them in your own
// terminal (not in chat):
//
//   export OLD_URL=https://ucopzrdubjnyfprbaqus.supabase.co
//   export NEW_URL=https://<new-ref>.supabase.co
//   export OLD_SERVICE_ROLE_KEY=...   # old project: Settings -> API -> service_role
//   export NEW_SERVICE_ROLE_KEY=...   # new project: Settings -> API -> service_role
//   node scripts/migrate-eu/copy-media.mjs            # copies everything
//   node scripts/migrate-eu/copy-media.mjs --dry-run  # only lists and counts
//
// Safe to run more than once: uploads use upsert, so a re-run fills gaps and
// overwrites with the same bytes. Reads from the old project, writes only to the
// new one.

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'media';
const DRY = process.argv.includes('--dry-run');

const need = (k) => {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing ${k} in the environment. See the header of this file.`);
    process.exit(1);
  }
  return v;
};

const oldUrl = need('OLD_URL');
const newUrl = need('NEW_URL');
if (oldUrl === newUrl) {
  console.error('OLD_URL and NEW_URL are the same project. Refusing to run.');
  process.exit(1);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const from = createClient(oldUrl, need('OLD_SERVICE_ROLE_KEY'), opts);
const to = DRY ? null : createClient(newUrl, need('NEW_SERVICE_ROLE_KEY'), opts);

// Folders come back from list() with id === null; files have an id.
async function listAll(prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await from.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listAll(path)));
      else out.push({ path, type: entry.metadata?.mimetype || 'application/octet-stream', size: entry.metadata?.size || 0 });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function ensureBucket() {
  const { data } = await to.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await to.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) throw new Error(`create bucket: ${error.message}`);
  console.log(`Created bucket "${BUCKET}" (public) in the new project.`);
}

const files = await listAll();
const totalMB = files.reduce((s, f) => s + f.size, 0) / 1048576;
console.log(`Old project: ${files.length} files in "${BUCKET}", ${totalMB.toFixed(1)} MB.`);
if (DRY) process.exit(0);

await ensureBucket();

let done = 0;
let failed = 0;
const failures = [];
// A few at a time: fast, without hammering either project.
const queue = [...files];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    try {
      const { data: blob, error: dErr } = await from.storage.from(BUCKET).download(f.path);
      if (dErr) throw new Error(`download: ${dErr.message}`);
      const { error: uErr } = await to.storage
        .from(BUCKET)
        .upload(f.path, blob, { upsert: true, contentType: f.type });
      if (uErr) throw new Error(`upload: ${uErr.message}`);
      done++;
    } catch (e) {
      failed++;
      failures.push(`${f.path} — ${e.message}`);
    }
    if ((done + failed) % 25 === 0) console.log(`  ${done + failed}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

console.log(`Copied ${done}/${files.length}. Failed: ${failed}.`);
if (failures.length) {
  console.log('Failures (re-run the script to retry them):');
  for (const line of failures.slice(0, 50)) console.log('  ' + line);
  process.exit(2);
}
