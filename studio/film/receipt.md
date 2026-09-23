# Latest film candidate

Only the current V15 candidate is retained as the studio's publication receipt.
Older takes are neither referenced nor accepted as release media.

## Artifact identity

- Name: `matter-launch-master-68s.mp4`
- SHA-256: `abf2659246febc59125ed302b5701d15ac7662b6203721d93a92f581c8ac5f2b`
- Duration: 68.000 seconds
- Picture: 1440 × 810, 30 fps, H.264, yuv420p
- Audio: AAC, 48 kHz, stereo
- Size: 11,205,912 bytes
- Capture contract: version 15
- Product basis: `7a67d5c`, including the merged native zoom-readout change

README playback uses a derived delivery copy because GitHub Markdown accepts
video attachments smaller than 10 MB. The source master remains authoritative.
The delivery copy is `matter-film-readme-68s.mp4`, 9,404,432 bytes,
1440 × 810 at 30 fps, H.264/AAC at 48 kHz stereo, with SHA-256
`53b939b18285820a5b9d40d1d1815cecea4f6960ec0404a477ea10d1df4b200c`.
It completed a full decode and measured 0.997678 whole-picture SSIM against the
master. Both files remain inside the ignored local artifact directory; only the
delivery copy is published as the reviewed README attachment
`https://github.com/user-attachments/assets/020cd8b3-7d86-4cbd-b466-d6ce7c6c24aa`.

The native lower-left Move guidance is asserted at 60% during the settled
zoom/pan composition and at 100% after the closing restoration. The percentage
is product UI, not a composited overlay.

## Verification

- Full media decode passed.
- No audio gap of at least one second was detected at -45 dB.
- Film render tests passed 19/19 before the studio colocation.
- Film fixture tests passed 2/2 before the studio colocation.
- Focused product coverage passed 173/173.
- Zoom-guidance browser coverage passed 3/3 at laptop, phone, and compact-phone widths.
- Capture passed 1/1.
- `npm run check` passed 138 Node tests, 2,688 Vitest tests with four expected
  skips, type generation, typecheck, zero-warning lint, documentation,
  architecture, production build, and runtime-artifact budgets.
- Two complete concurrent browser runs exposed three load-sensitive timing
  failures across Voice admission, mid-animation sampling, and settings-menu
  appearance. All three passed isolated serial replay. The concurrent browser
  suite is therefore not claimed as clean.

## Publication gate

The current master uses an archival excerpt from Douglas Engelbart's 1968
demonstration. A repository Markdown upload makes the file publicly accessible.
Do not upload or reference the final attachment until the owner records the
applicable audio-use decision. The video itself, raw capture, supplied audio,
frames, and failed takes remain untracked.
