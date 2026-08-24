import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

const sharedProps = {
  "aria-hidden": true,
  fill: "none",
  height: 16,
  viewBox: "0 0 16 16",
  width: 16,
} as const;

export function ChevronIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="m5.5 3.5 4.5 4.5-4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinusIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><path d="M3.5 8h9" stroke="currentColor" strokeLinecap="round" /></svg>;
}

export function ArrowLeftIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M12.5 8h-9M7 3.5 2.5 8 7 12.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SyncIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M13 8a5 5 0 0 1-8.6 3.5M3 8a5 5 0 0 1 8.6-3.5M11.6 2v2.5H9.1M4.4 14v-2.5h2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FocusIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

/** The selected material-local inquiry mark. */
export function MatterAiIcon({ className, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" height="31" viewBox="0 0 42 31" width="42" {...props}>
      <path d="M5.73431 15.1365L0 30.273L3.46125 30.5313C5.32103 30.6863 7.07749 30.6347 7.33579 30.428C7.59409 30.2214 8.21402 28.9299 8.67896 27.5867L9.50553 25.107L15.2915 24.952L21.0258 24.797L21.8524 27.69L22.679 30.5313H26.5535C28.6716 30.5313 30.3764 30.4797 30.3764 30.3764C30.3764 30.273 28.6199 25.5719 26.4502 19.8893C24.2804 14.2583 21.8007 7.49077 20.8708 4.95941L19.2177.309963L15.3432.154982L11.4686 0L5.73431 15.1365ZM17.2546 13.7417L18.9077 18.1328H15.2915C12.6052 18.1328 11.7269 17.9778 11.8819 17.4612C13.2767 13.4834 15.1365 8.93726 15.3432 9.14391C15.4981 9.29889 16.3247 11.3653 17.2546 13.7417Z" />
      <path d="M33.9926 11.5203C33.9926 17.8746 34.1476 24.7971 34.3542 26.9152L34.6642 30.7897H38.3321H42V15.5499L41.9483.31001L37.9705.155029L33.9926 0V11.5203Z" />
    </svg>
  );
}

export function UndoIcon({ className, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" height="24" viewBox="0 0 24 24" width="24" {...props}>
      <path d="M8.5 8H4.75V4.25M5 8c1.65-2.25 4.08-3.5 7-3.5a7.5 7.5 0 1 1-6.82 10.61" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function FoldIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M3 5.25h10M5.5 8.5h5M7 11.75h2" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function UnfoldIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M7 4.25h2M5.5 7.5h5M3 10.75h10" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function ShowAllIcon({ className, ...props }: IconProps) {
  return (
    <svg {...sharedProps} className={className} {...props}>
      <path d="M3 3.5v9M3 5.25h4M3 10.75h4M7 5.25v2.5h4M7 10.75v-1.5h4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VoiceIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><rect x="5.5" y="2" width="5" height="8" rx="2.5" stroke="currentColor" /><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2M5.5 14h5" stroke="currentColor" strokeLinecap="round" /></svg>;
}

export function LassoIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><path d="M12.6 5.2c1.1 2.2-.9 4.7-4.3 4.9-3.3.3-5.7-1.1-5.5-3.2.2-2.1 2.7-3.6 5.7-3.4 3.1.2 4.9 1.8 4.1 3.9-.5 1.4-1.8 2.5-3.7 3.3-1.4.6-2.2 1.4-1.9 2.1.3.7 1.5.6 2.1-.1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function BranchIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><circle cx="4.5" cy="4.5" r="1.5" stroke="currentColor" /><circle cx="11.5" cy="4.5" r="1.5" stroke="currentColor" /><circle cx="11.5" cy="11.5" r="1.5" stroke="currentColor" /><path d="M6 4.5h2a3.5 3.5 0 0 1 3.5 3.5v2M8 4.5h2" stroke="currentColor" strokeLinecap="round" /></svg>;
}

export function MoveIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><path d="M8 1.5v13M1.5 8h13M8 1.5 6.5 3M8 1.5 9.5 3M8 14.5 6.5 13M8 14.5 9.5 13M1.5 8 3 6.5M1.5 8 3 9.5M14.5 8 13 6.5M14.5 8 13 9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function SearchIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><circle cx="7" cy="7" r="4" stroke="currentColor" /><path d="m10 10 3 3" stroke="currentColor" strokeLinecap="round" /></svg>;
}

export function FileIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><path d="M4 1.75h5l3 3v9.5H4z" stroke="currentColor" strokeLinejoin="round" /><path d="M9 1.75v3h3M6 8h4M6 10.5h3" stroke="currentColor" strokeLinecap="round" /></svg>;
}

export function CopyIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><rect x="5.25" y="5.25" width="7.25" height="7.25" rx="1" stroke="currentColor" /><path d="M10.5 5.25V3.5h-7v7h1.75" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function DownloadIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><path d="M8 2v8M5 7.5 8 10.5l3-3M3 12.5h10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function SidebarIcon({ className, ...props }: IconProps) {
  return <svg {...sharedProps} className={className} {...props}><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" /><path d="M6 2.5v11M8.5 5h3M8.5 8h3M8.5 11h2" stroke="currentColor" strokeLinecap="round" /></svg>;
}
