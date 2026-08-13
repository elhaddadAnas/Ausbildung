'use client';

import { useId } from 'react';
import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  compact?: boolean;
  inverse?: boolean;
  lightSurface?: boolean;
  className?: string;
};

export function BrandMark({ className = '' }: { className?: string }) {
  const instanceId = useId().replace(/:/g, '');
  const markGradientId = `azubora-mark-${instanceId}`;
  const shineGradientId = `azubora-shine-${instanceId}`;
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Azubora"
      className={className}
      fill="none"
    >
      <defs>
        <linearGradient id={markGradientId} x1="7" y1="5" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CFF" />
          <stop offset="0.52" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3A7" />
        </linearGradient>
        <linearGradient id={shineGradientId} x1="16" y1="13" x2="32" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="#DFF7FF" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill={`url(#${markGradientId})`} />
      <path d="M14.2 34.2 22.4 14a2 2 0 0 1 3.7 0l8 20.2" stroke={`url(#${shineGradientId})`} strokeWidth="4.2" strokeLinecap="round" />
      <path d="M18.1 27.5h12" stroke="white" strokeWidth="3.8" strokeLinecap="round" />
      <path d="m34.7 9.4.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" fill="white" />
      <path d="M9 35.5c4.4 3.8 10.3 5.3 16 4.1" stroke="white" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function BrandLogo({ href, compact = false, inverse = false, lightSurface = false, className = '' }: BrandLogoProps) {
  const content = (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <BrandMark className="h-11 w-11 shrink-0 drop-shadow-[0_10px_22px_rgba(59,130,246,0.3)]" />
      {!compact && (
        <span className="leading-none">
          <span className={`block text-xl font-black tracking-[-0.045em] ${inverse ? 'text-white' : lightSurface ? 'text-slate-950' : 'text-slate-950 dark:text-white'}`}>
            Azubora
          </span>
          <span className="mt-1 block text-[9px] font-extrabold uppercase tracking-[0.24em] text-blue-500">
            Career autopilot
          </span>
        </span>
      )}
    </span>
  );

  return href ? <Link href={href} aria-label="Azubora — Accueil">{content}</Link> : content;
}
