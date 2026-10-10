'use client';

import Link from 'next/link';
import { BitcoinRoadmap } from '@/src/components/BitcoinRoadmap';
import { copy, copyV2 } from '@/src/copy';

export default function SqBitcoinRoadmapPage() {
  return (
    <div className="grid max-w-[640px] gap-6">
      <Link className="kl2-link text-14" href="/swissquote/portfolio">
        {copy.common.back}
      </Link>
      <h1 className="kl-title">{copyV2.security.bitcoin.title}</h1>
      <BitcoinRoadmap />
    </div>
  );
}
