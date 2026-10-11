'use client';

import { createContext, useContext } from 'react';
import type { Classified, Verification } from './requests';
import type { WcRequestRef } from './respond';
import type { WalletKit, WalletKitTypes } from './walletkit';

export type WcSession = ReturnType<WalletKit['getActiveSessions']>[string];
export type WcProposalEvent = WalletKitTypes.SessionProposal;

export interface DappInfo {
  readonly name: string;
  readonly url: string;
  readonly icon?: string;
  readonly verification: Verification;
  /** The Verify origin, when Reown attested one. */
  readonly origin?: string;
}

export interface ProposalView {
  readonly raw: WcProposalEvent;
  readonly app: DappInfo;
  readonly verdict: 'allow' | 'block';
  readonly reasons: readonly string[];
  /** On the bank's allowlist ("Reviewed by Swissquote"). */
  readonly allowlisted: boolean;
  /** 'review' until answered; 'expired' when the app stopped waiting. */
  readonly state: 'review' | 'connecting' | 'connected' | 'refused' | 'expired' | 'error';
  readonly error?: unknown;
}

export interface RequestView {
  readonly ref: WcRequestRef;
  readonly app: DappInfo;
  readonly classified: Classified;
  readonly params: unknown;
  readonly receivedAt: number;
  /** Epoch ms, from the request's WalletConnect `expiryTimestamp` (seconds). */
  readonly expiresAt?: number;
  readonly expired: boolean;
  /** Already answered automatically (chain switch / unsupported): the sheet only explains. */
  readonly answered: boolean;
  /** Answered from its sheet (signed): out of the inbox, the sheet still shows the receipt until closed. */
  readonly settled?: boolean;
}

export interface WcContextValue {
  readonly status: 'off' | 'starting' | 'ready' | 'error';
  readonly error?: unknown;
  readonly sessions: readonly WcSession[];
  readonly proposal: ProposalView | null;
  readonly requests: readonly RequestView[];
  /** Id of the request whose sheet is open (sign / refusal kinds); transactions open /send/review instead. */
  readonly activeId: number | null;
  /** Requests still waiting for an answer (the inbox). */
  readonly waiting: readonly RequestView[];
  start(): void;
  pair(uri: string): Promise<void>;
  approveProposal(): Promise<void>;
  rejectProposal(): Promise<void>;
  dismissProposal(): void;
  disconnect(topic: string): Promise<void>;
  open(id: number): void;
  close(): void;
  /** The request was answered (approved, declined, blocked, failed): drop it from the inbox. */
  resolve(id: number): void;
  /** Answered, sheet still open on the result: leaves the inbox now. */
  settle(id: number): void;
  find(id: number): RequestView | undefined;
}

export const WcContext = createContext<WcContextValue | null>(null);

/** WalletConnect state for the client screens; null outside the client route group. */
export function useWc(): WcContextValue | null {
  return useContext(WcContext);
}
