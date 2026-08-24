# Matter brand assets

`slate-bone-master-1024.png` is the authoritative raster master for Matter's
negative-stone icon. It keeps the original stone silhouette at 68% of the
square, uses the Slate / Bone material palette, and retains quiet facet relief
without an outline or runtime filter.

The platform files in `app/` are pre-rendered from this master at 16, 32, 180,
192, and 512 pixels. The 180, 192, and 512 pixel files preserve the master's 68%
composition and use faithful Lanczos3 downsampling with no output sharpening.
The browser-only 16 and 32 pixel profiles place the same silhouette at 60% of
their target square so the mark keeps deliberate air in a tab. The 16 pixel
file then applies a four-neighbour 0.04 unsharp pass only to the downsampled
stone luminance; the 32 pixel file uses one restrained output unsharp pass.
These small-size profiles do not alter the palette, silhouette, background, or
master, and they are not sources for any larger output. Keep the target sizes
separate: browsers and launchers must not invent a small icon by resizing an
unrelated platform asset.

`brand-assets.json` versions these profiles, enforces each encoded-file digest,
and records the decoded-RGB checksum used for visual-baseline comparison.
Encoding is losslessly optimized with no palette quantization. Updating a file
requires an intentional manifest update and a decoded-pixel comparison against
the previous approved baseline.

The `p → q` image in `public/matter-ui/` is the parent identity and is not a
Matter icon source.
