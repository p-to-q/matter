type IconProps = { size?: number };

export function VoiceIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function UndoIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 8H4.75V4.25M5 8c1.65-2.25 4.08-3.5 7-3.5a7.5 7.5 0 1 1-6.82 10.61" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StopIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function LassoIcon({ size = 19 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.8 8.2c1.7 3.3-1.4 7-6.4 7.4-5 .4-8.6-1.7-8.3-4.9.3-3.1 4.1-5.4 8.6-5.1 4.7.3 7.3 2.7 6.1 5.9-.7 2-2.7 3.7-5.5 4.9-2.1.9-3.4 2.1-2.9 3.1.5 1 2.3.9 3.2-.2" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BranchIcon({ size = 19 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="17" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="17" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 7h3a5 5 0 0 1 5 5v3M12 7h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MoveIcon({ size = 19 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
