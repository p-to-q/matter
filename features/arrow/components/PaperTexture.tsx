export function PaperTexture() {
  return (
    <svg
      className="paper-texture"
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="paper-mottle" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.02"
            numOctaves="3"
            seed="27"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id="paper-fiber" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72 0.38"
            numOctaves="2"
            seed="11"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100" height="100" filter="url(#paper-mottle)" opacity="0.2" />
      <rect width="100" height="100" filter="url(#paper-fiber)" opacity="0.1" />
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0.08"
        opacity="0.34"
        vectorEffect="non-scaling-stroke"
      >
        <path d="M6.8 18.4l.9-.35" />
        <path d="M15.2 77.8l.45.7" />
        <path d="M29.4 43.1l.75-.18" />
        <path d="M48.1 12.6l.2.82" />
        <path d="M63.8 84.6l.65-.55" />
        <path d="M78.2 28.4l.82.24" />
        <path d="M91.4 68.1l.42-.72" />
      </g>
      <g fill="currentColor" opacity="0.28">
        <circle cx="10.3" cy="52.8" r="0.07" />
        <circle cx="35.7" cy="22.1" r="0.055" />
        <circle cx="56.4" cy="67.3" r="0.065" />
        <circle cx="72.8" cy="9.7" r="0.05" />
        <circle cx="86.2" cy="47.9" r="0.075" />
      </g>
    </svg>
  );
}
