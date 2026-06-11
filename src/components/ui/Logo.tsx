export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="#fff" aria-hidden>
      <rect x="2.2" y="11" width="3.6" height="10" rx="1.8" opacity="0.5" />
      <rect x="8.2" y="7" width="3.6" height="18" rx="1.8" opacity="0.72" />
      <rect x="14.2" y="3" width="3.6" height="26" rx="1.8" />
      <rect x="20.2" y="6" width="3.6" height="20" rx="1.8" opacity="0.72" />
      <rect x="26.2" y="10" width="3.6" height="12" rx="1.8" opacity="0.5" />
    </svg>
  );
}
