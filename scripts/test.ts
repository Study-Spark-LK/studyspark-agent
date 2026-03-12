/**
 * Manual integration test for POST /internal/process.
 *
 * Prerequisites:
 *   1. Copy .env to .env and fill in INTERNAL_API_KEY.
 *   2. Start the server in another terminal: npm run serve
 *
 * Run:
 *   npx tsx scripts/test.ts
 *
 * Note: this project uses "type": "module" (ESM). If you prefer ts-node use:
 *   npx ts-node --esm scripts/test.ts
 */
import 'dotenv/config';

const BASE_URL = process.env.SERVER_URL ?? 'http://localhost:8080';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? '';

if (!INTERNAL_KEY) {
  console.error('ERROR: INTERNAL_API_KEY is not set in .env');
  process.exit(1);
}

const payload = {
  userId: 'test_user_001',
  material: {
    text: `
      Photosynthesis is the process by which green plants, algae, and some bacteria
      convert light energy (usually from the sun) into chemical energy stored as glucose.
      The overall reaction is:
        6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂
      It occurs in two main stages:
      1. Light-dependent reactions (in the thylakoid membranes): water is split,
         releasing oxygen as a by-product, and ATP + NADPH are produced.
      2. Light-independent reactions / Calvin cycle (in the stroma): CO₂ is fixed
         into organic molecules using the ATP and NADPH from stage 1.
      Chlorophyll, the green pigment in chloroplasts, absorbs red and blue light
      most effectively and reflects green light, which is why plants appear green.
    `.trim(),
  },
};

console.log('→ POST', `${BASE_URL}/internal/process`);
console.log('→ userId:', payload.userId);
console.log('→ material: plain text (%d chars)\n', payload.material.text.length);

const res = await fetch(`${BASE_URL}/internal/process`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Key': INTERNAL_KEY,
  },
  body: JSON.stringify(payload),
});

const body = await res.json();

console.log('← status:', res.status);
console.log('← response:\n');
console.log(JSON.stringify(body, null, 2));

if (!res.ok) {
  process.exit(1);
}
