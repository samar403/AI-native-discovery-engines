/** The mark: a loop with a spark where hypothesis meets evidence. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#4fe3c1" />
          <stop offset="1" stopColor="#ffb547" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="11" fill="none" stroke="url(#logo-g)" strokeWidth="2" strokeDasharray="52 17" strokeLinecap="round" transform="rotate(-60 16 16)" />
      <circle cx="16" cy="16" r="3.2" fill="#ffb547" />
      <circle cx="25.5" cy="10.5" r="2" fill="#4fe3c1" />
    </svg>
  );
}
