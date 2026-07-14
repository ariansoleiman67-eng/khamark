const { parsePhoneNumber } = require('libphonenumber-js');

function normalizeClient(raw) {
  const trimmed = (raw || '').trim();
  const compact = trimmed.replace(/\s+/g, '').replace(/-/g, '');
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('00964')) return `+${compact.slice(2)}`;
  if (compact.startsWith('964')) return `+${compact}`;
  const digits = compact.replace(/\D/g, '');
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+964${local}`;
}

function normalizeServer(raw) {
  try {
    const parsed = parsePhoneNumber(raw, 'IQ');
    if (parsed && parsed.isValid()) return parsed.number;
    return "INVALID_BY_SERVER";
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

const inputs = [
  "+964 750 215 3222",
  "+964 750 215 3223",
  "07502153222",
  "07502153223",
  "+9647502153222",
  "+9647502153223"
];

for (const input of inputs) {
  console.log(`Input: ${input}`);
  console.log(`Client: ${normalizeClient(input)}`);
  console.log(`Server: ${normalizeServer(input)}`);
  console.log('---');
}

console.log("TESTING NATIVE UID RESOLVER WITH REAL CODE:");
const hashed1 = require('crypto').createHmac('sha256', 'otp-fallback-secret').update('+9647502153222').digest('hex').slice(0, 32);
const hashed2 = require('crypto').createHmac('sha256', 'otp-fallback-secret').update('+9647502153223').digest('hex').slice(0, 32);

console.log(`Hashed 3222: ${hashed1}`);
console.log(`Hashed 3223: ${hashed2}`);
