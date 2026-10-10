'use client';

import { BitcoinRoadmap } from '@/src/components/BitcoinRoadmap';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copyV2 } from '@/src/copy';

export default function BitcoinRoadmapPage() {
  return (
    <>
      <ScreenHeader title={copyV2.security.bitcoin.title} backHref="/security" />
      <BitcoinRoadmap />
    </>
  );
}
