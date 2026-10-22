/** Знак CardForge: карточка товара со строками текста. Тот же рисунок — в app/icon.svg. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#141414" />
      <rect x="8.5" y="7" width="14" height="18" rx="2.5" fill="#c8f26b" opacity=".35" transform="rotate(-9 15.5 16)" />
      <rect x="10" y="7.5" width="13.5" height="17" rx="2.5" fill="#c8f26b" />
      <rect x="12.75" y="11" width="8" height="2.2" rx="1.1" fill="#141414" />
      <rect x="12.75" y="15" width="5.5" height="2.2" rx="1.1" fill="#141414" opacity=".45" />
      <rect x="12.75" y="19" width="6.75" height="2.2" rx="1.1" fill="#141414" opacity=".45" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <LogoMark />
      CardForge
    </span>
  );
}
