const {
  chromium,
} = require('/Users/guillaume/Documents/Hackathon BSA 2026/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const BASE = process.env.BASE ?? 'http://localhost:3000';
// A wallet the local bank knows (deployed), so Home's bank reads succeed.
const SAFE = '0x74DedAEce5CD9d4dCA25e2beeA6E9b45F41F679F';
const TX = '0xa40c042a5774cd1fec93c9832d00311611fd6bd34896ef0b3a21be7e1850d425';
const wallet = (over = {}) => ({
  address: SAFE,
  credentialId: '7fHuxTnGZjBvjlMPImN18zhVVe8',
  pubKeyX: '0x3dde7e9860b39940ebaeee2c9456a13ddf04b9278a3ec770b6479a7ee0fb9a8d',
  pubKeyY: '0x19d77dbe7a0c91ea3c0144945dca03537c2e7fe4a58170aee397ec62afa595e1',
  deviceLabel: 'iPhone · this phone',
  status: 'deployed',
  protectTxHash: TX,
  attested: true,
  recoveryMode: 'default',
  guardians: {
    safetyKey: '0x52dAe4d3a08C6E3A3b4bB4A4E1b17C19ab78F0f6',
    emergencyCard: '0x745C7a2d2B0A9d1E3F4b5C6D7E8f9A0b1c2d1926',
    swissquote: '0x01Bbd43cd140a7BfcA7836e577470Af2B1d04dE8',
  },
  onboardingStep: 7,
  ...over,
});
async function seed(context, storage) {
  await context.addInitScript((s) => {
    try {
      localStorage.setItem('keyline.device', 'lea-phone');
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  }, storage);
}
module.exports = { chromium, BASE, SAFE, TX, wallet, seed };
