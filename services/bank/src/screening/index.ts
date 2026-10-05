// Wave 1: pass-through stub. Wave 3 loads the OFAC SDN ETH list (0xB10C) + seeded-sanctioned.json for real.
// The seeded sanctioned test address is honoured already so the `block` path can be exercised.
import type { Screening } from '@keyline/shared';
import { type Address, getAddress, isAddressEqual } from 'viem';

export type ScreeningContext = { sanctionedTestAddress?: Address };

export const screen = (counterparty: Address, ctx: ScreeningContext = {}): Screening => {
  const seededHit =
    ctx.sanctionedTestAddress != null && isAddressEqual(getAddress(counterparty), ctx.sanctionedTestAddress);
  return {
    counterparty: getAddress(counterparty),
    listsChecked: ['OFAC-SDN', 'SECO'],
    hit: seededHit,
    source: seededHit ? 'seeded-sanctioned.json (simulated test entry)' : undefined,
    simulatedHit: seededHit,
    simulated: true,
    note: 'OFAC list lookup is a pass-through stub until Wave 3; SECO publishes names, not addresses (simulated).',
  };
};
