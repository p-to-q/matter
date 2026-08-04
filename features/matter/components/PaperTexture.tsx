export function PaperTexture() {
  return (
    <svg className="paper-texture" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <filter id="matter-paper-mottle" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="27" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id="matter-paper-fiber" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.72 0.38" numOctaves="2" seed="11" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100" height="100" filter="url(#matter-paper-mottle)" opacity="0.2" />
      <rect width="100" height="100" filter="url(#matter-paper-fiber)" opacity="0.1" />
    </svg>
  );
}
