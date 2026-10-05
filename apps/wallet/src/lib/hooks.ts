'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { readUsdcBalance } from './chain';
import {
  type LocalTopup,
  type LocalTransfer,
  type LocalWallet,
  topupStore,
  transferStore,
  walletStore,
} from './storage';

/** The device's local wallet profile; `undefined` until the client has read localStorage (avoids hydration flicker). */
export function useLocalWallet(): {
  wallet: LocalWallet | null | undefined;
  save: (wallet: LocalWallet) => void;
  patch: (patch: Partial<LocalWallet>) => void;
  clear: () => void;
} {
  const [wallet, setWallet] = useState<LocalWallet | null | undefined>(undefined);
  useEffect(() => {
    setWallet(walletStore.get());
  }, []);
  const save = useCallback((next: LocalWallet) => {
    walletStore.set(next);
    setWallet(next);
  }, []);
  const patch = useCallback((p: Partial<LocalWallet>) => {
    const next = walletStore.update(p);
    if (next) setWallet(next);
  }, []);
  const clear = useCallback(() => {
    walletStore.clear();
    setWallet(null);
  }, []);
  return { wallet, save, patch, clear };
}

export function useLocalTransfers(): {
  transfers: LocalTransfer[];
  topups: LocalTopup[];
  refresh: () => void;
} {
  const [transfers, setTransfers] = useState<LocalTransfer[]>([]);
  const [topups, setTopups] = useState<LocalTopup[]>([]);
  const refresh = useCallback(() => {
    setTransfers(transferStore.list());
    setTopups(topupStore.list());
  }, []);
  useEffect(refresh, [refresh]);
  return { transfers, topups, refresh };
}

export function useUsdcBalance(address: string | undefined) {
  return useQuery({
    queryKey: ['usdc-balance', address],
    queryFn: () => readUsdcBalance(address as `0x${string}`),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}

export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: api.contacts, staleTime: 60_000 });
}

export function useWalletEvents(address: string | undefined) {
  return useQuery({
    queryKey: ['wallet-events', address],
    queryFn: () => api.wallets.events(address as string),
    enabled: Boolean(address),
    refetchInterval: 10_000,
  });
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: ['me'], queryFn: api.me, enabled, retry: false });
}
