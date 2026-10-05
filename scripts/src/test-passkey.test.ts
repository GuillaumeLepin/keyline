import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPasskeyAccount } from '@keyline/chain';
import { describe, expect, it } from 'vitest';
import { loadTestKeys } from './test-passkey.js';

describe('test keyfile (harness only)', () => {
  it('persists passkey + guardians, survives a reload, and records the Safe after a rotation', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'keyline-')), 'k.json');
    const first = await loadTestKeys(file);
    const again = await loadTestKeys(file);
    expect(again.passkey.publicKey).toEqual(first.passkey.publicKey);
    expect(again.guardians).toEqual(first.guardians);
    expect(again.safe).toBeUndefined();

    const safe = createPasskeyAccount({
      pubKeyX: first.passkey.publicKey.x,
      pubKeyY: first.passkey.publicKey.y,
    }).address;
    const rotated = await loadTestKeys();
    await again.save({ passkey: rotated.passkey, safe });
    const third = await loadTestKeys(file);
    expect(third.safe).toBe(safe);
    expect(third.passkey.publicKey).toEqual(rotated.passkey.publicKey);
    expect(third.guardians).toEqual(first.guardians);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveProperty('passkey.d');
  });

  it('produces a WebAuthn-shaped assertion whose clientDataJSON carries the challenge', async () => {
    const keys = await loadTestKeys();
    const challenge = `0x${'ab'.repeat(32)}` as const;
    const assertion = await keys.passkey.sign(challenge);
    const clientData = JSON.parse(new TextDecoder().decode(assertion.clientDataJSON as Uint8Array)) as {
      type: string;
      challenge: string;
    };
    expect(clientData.type).toBe('webauthn.get');
    expect(Buffer.from(clientData.challenge, 'base64url').toString('hex')).toBe('ab'.repeat(32));
    expect((assertion.authenticatorData as Uint8Array).length).toBe(37);
  });
});
