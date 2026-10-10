// The phone side of the Swissquote web → phone handoff (SPEC §10 F1). The onboarding token stays in memory (api.ts);
// only the client's first name is kept in sessionStorage so "Hi Lea" survives a reload of the same tab.
'use client';

import type { ClaimHandoffResponse } from '@keyline/shared';
import { setOnboardingToken } from './api';

const KEY = 'keyline.handoffClient';

export function rememberClaim(claim: ClaimHandoffResponse): void {
  setOnboardingToken(claim.onboardingToken);
  try {
    window.sessionStorage.setItem(KEY, claim.client.firstName);
  } catch {
    // blocked storage: the greeting falls back to the name in memory below
  }
  memoryName = claim.client.firstName;
}

let memoryName: string | null = null;

export function handoffFirstName(): string | null {
  if (memoryName) return memoryName;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetClaim(): void {
  setOnboardingToken(null);
  memoryName = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** "482137" → "482 137" (two groups of three, as on the laptop). */
export function groupCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
