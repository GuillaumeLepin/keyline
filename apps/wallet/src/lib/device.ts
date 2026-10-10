// Demo personas: `?device=<persona>` on first load pins a deviceLabel to this browser profile.
// The label is shown in the DeviceBar and sent to the bank as `X-Device-Label` on every request.
'use client';

import { useSyncExternalStore } from 'react';
import type { Persona } from '@/src/ui';
import { copy } from '../copy';

const KEY = 'keyline.device';
const PERSONAS: readonly Persona[] = ['lea-phone', 'lea-laptop', 'lea-new-phone', 'thief', 'desk'];

export function isPersona(value: string | null | undefined): value is Persona {
  return typeof value === 'string' && (PERSONAS as readonly string[]).includes(value);
}

export function personaLabel(persona: Persona): string {
  return copy.device[persona];
}

const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

function readPersona(): Persona | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(KEY);
    return isPersona(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function setPersona(persona: Persona): void {
  try {
    window.localStorage.setItem(KEY, persona);
  } catch {
    // ignore — the in-memory fallback below still works for this page load
  }
  memory = persona;
  emit();
}

let memory: Persona | null = null;

/** Applies `?device=` from the current URL once; returns the effective persona. */
export function bootstrapPersona(defaultPersona: Persona = 'lea-phone'): Persona {
  if (typeof window === 'undefined') return defaultPersona;
  const fromQuery = new URLSearchParams(window.location.search).get('device');
  if (isPersona(fromQuery)) {
    setPersona(fromQuery);
    return fromQuery;
  }
  const stored = readPersona();
  if (stored) {
    memory = stored;
    return stored;
  }
  setPersona(defaultPersona);
  return defaultPersona;
}

export function getPersona(): Persona {
  return memory ?? readPersona() ?? 'lea-phone';
}

export function getDeviceLabel(): string {
  return personaLabel(getPersona());
}

export function usePersona(): Persona | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => memory ?? readPersona(),
    () => null,
  );
}
