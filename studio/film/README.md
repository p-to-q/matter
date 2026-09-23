# Matter film studio

Need: a short Matter film must show the real product surface without recording
the operator's desktop, leaking private notifications, or disguising a
deterministic demonstration as an unrestricted live-provider evaluation.

Status: the restrained hybrid V15 workflow is implemented. Its closing proof
uses the real history to return the authored tree to its seeded root;
publication remains subject to the archival audio rights decision.

## Repository contract

This directory is the single, reviewable home for the Matter film's capture
source, editorial copy, closed fixtures, render orchestration, focused tests,
and latest release receipt. Localized on-screen copy lives only in
[`copy.md`](copy.md); executable files remain English-only. The repository
retains one current receipt rather than an archive of superseded takes.

Rendered media is not source. Local masters and their derived frames belong in
the gitignored `artifacts/` directory, while the released README player uses a
reviewed GitHub Markdown attachment. Neither representation is part of a
deployment or application package. `.vercelignore` excludes all of `studio/`
before upload, Next.js output tracing excludes the same tree from standalone
runtime artifacts, and the film boundary plus runtime-artifact checks
fail when either exclusion or the source-only rule drifts. Any future desktop,
mobile, or archive packager must establish the same exclusion before shipping.

## Boundary

Outcome: an operator can render one reproducible 68-second Matter screen film
from genuinely blank paper and combine it with an audio file supplied outside
the repository.

Boundary: Playwright owns a 1600×900 webpage-only capture and emits versioned
camera cues from real DOM bounds; the renderer owns the opening focus return,
one archival-audio credit, the final rounded screen departure, and the
1440×810, 30 fps MP4 mux. FFmpeg owns five cue-bounded camera moves and the
composition boundary. Material-changing AI surfaces use closed fixtures. Ask
Matter uses a strict, receipt-marked local fixture for the reproducible release
take, while an explicitly selected live mode remains available for a separate
provider evaluation. The document model, production gates, and provider
adapters do not change.

Invariants: capture never treats `.env.local` alone as permission for provider
traffic, never records the desktop, blocks browser egress beyond its isolated
loopback origin, begins from the explicit root-document variant, and keeps the
opening passage visible while a real FX action introduces daylight leaf motion
and a real appearance action establishes dark leaf motion. All feature
demonstrations then remain on that same night paper. The canvas title is
“被允许想象的其他生活”; the opening never replaces its material with a
video-only title. A restrained bottom-right credit identifies the archival
Engelbart excerpt and disappears before the blurred curtain clears. The closing departure begins from the captured
night paper, contains no invented control or closing title, and uses no network,
scan, sweep, or beam. It never commits external audio, transcripts, provider
answers, or rendered media. Generated files stay under the gitignored local
`artifacts/` directory unless the operator explicitly chooses another
untracked directory.

Proof: the launcher is dry by default; its parser, cue reader, camera filter,
and encoder contract have focused Node tests; the capture config pins every
material-changing adapter to a fixture; and the take waits for real layout,
paint, strict Inquiry, material-commit, index, and Undo receipts. A candidate is
not a finished master until fresh contact-sheet, camera-transition, media-probe,
and full-playback review all pass.

Non-goals: this is not a production-provider health claim, a public CI release
receipt, or a replacement for product E2E tests. It does not synthesize
narration, invent interface chrome, or grant publication rights to supplied
archival audio.

## Render

The final master is intentionally local. Pass an operator-supplied audio file; the
repository does not contain or download it.

```bash
npm run film:capture -- \
  --execute \
  --offline-demo \
  --audio /absolute/path/to/audio.wav
```

Use `--live-inquiry` instead of `--offline-demo` only for an explicitly
authorized provider evaluation. The two modes are mutually exclusive, and a
complete take refuses to start until the operator selects exactly one.

The default output is a timestamped directory under
`studio/film/artifacts/`. It contains `matter-launch-raw.webm`,
`capture-cues.json`, a transparent `matter-launch-credit.png`, an extracted
night-paper still, a deterministic 75-frame rounded screen departure, and a 68-second
`matter-launch-master-68s.mp4` encoded as 1440×810, 30 fps H.264/AAC. The raw
browser take is 1600×900. The sequence is one causal movement: root-seeded
light paper holding the passage “我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象的其他生活。”;
the real FX control introducing daylight moving leaf shadow; the real appearance
control establishing night; a closer About hold and Settings → Model API as orientation;
the real pressed Voice control on neutral paper; Voice recording,
showing “正在将声音变成材料”, and admitting one spoken subtitle beneath it; a Branch
whose index row is opened into Point Talk; Stop shows “正在听清…”, the transcript
is validated against the request receipt, and Voice Stop acts as the current
product's explicit submit boundary before “正在换一种说法…” appears. The four visible child passages have distinct jobs rather than
paraphrasing one another: a Voice-born proposition, a rewritten contrast, a
second root claim, and one nested consequence. The canvas title is never reused
as body material. A third root branch and one more native Branch beneath it make
the paper and index both expose three levels, then a smooth native canvas zoom-out
and restrained leftward drag leave roughly half of the short right-hand continuation
visible before the tool rail. The existing lower-left guidance slot visibly reads
`60%` throughout the settled pan, preserving both the root's breathing room and the sense
that the canvas continues beyond the frame;
Elastic release followed by an explicit click inside the shaped address; one
branch set aside from the canvas minus control and restored from the matching
index plus control; one real Ask Matter turn; then six ordinary native Undo
hover-and-click operations in the same wide composition visibly remove the
Elastic change, nested branch, sibling branch, rewrite, first branch, and voice branch
until only the seeded root remains; a short reading breath; then that same
passage is returned through native move mode to the opening's scale and screen
position, with the same lower-left slot visibly settling at `100%`, before the
night paper rounds, shrinks, and exits over a solid black
field. Capture rejects any closing root whose position or dimensions differ
from the measured opening by 5 CSS pixels or more. The outro draws that page exactly once; it
never repeats the same interface as a blurred background. This closing state
keeps accumulating haze throughout the shrink, settles only near the final
fade, and rhymes with the opening passage without replaying its daylight
composition. Corner rounding leads the departure, while scale, dimming, blur,
edge attenuation, and the final opacity exit overlap as one continuous curve
rather than completing as separate beats. It does so without
adding tutorial labels,
device frames, scanning light, and a feature-list
montage. The opening credit is editorial film language, not invented product
chrome. The supplied audio begins after the credit starts leaving, fades in for
2.2 seconds, and fades out over its final 2.6 seconds.

The capture asserts three Transcription requests—first-material admission, the
visible Point Talk direction, and the Ask Matter question—plus one Transform,
one Text Swap, and one Inquiry
request. It also records ordered story-event and opening/daylight/night
presentation receipts, an explicit post-Elastic selection-clear receipt, the
explicit Inquiry mode, native `60%` and `100%` zoom-readout receipts,
post-navigation and closing-geometry receipts, and the durable canvas title in a version-15
`capture-cues.json` beside the raw WebM. The renderer accepts
only the frozen 1600×900 capture surface and valid, non-overlapping cue windows,
generates the transparent title and deterministic closing frames through the
same local Chrome dependency used for capture, then applies a brief focus return,
its restrained credit fade, and five semantically distinct moves: the strongest close-up for the
real pressed Voice control, a short Point Talk spring, a restrained Elastic move,
the About and monotonic Inquiry reading moves. Undo deliberately stays in the
wide shot with only the native hover and click while history contracts. Every
crop is fitted and clamped from the union of the real target DOM
bounds recorded at that take. Voice waits for computed pixels to settle before
each cue, so idle remains transparent, hover is a quiet ink tint, and pressed is
the native solid-ink tile with paper-white icon. Its crop includes the actual pressed-state bounds,
and Elastic includes the actual confirmation moment. Pointer travel uses a
bounded Bezier route with zero-velocity endpoints; the paper's own zoom-out
and its following leftward paper drag remain real pointer input. Neither overlaps
a post camera move. Camera motion may clarify an action, but it may not create,
hide, or relabel product state.

Before the screencast clock starts, the harness uses Matter's native transient
move mode to place the opening material at the center of the complete 1600×900
frame, not merely at the center of the paper area beside the directory. The V15
receipt rejects an off-center opening. A translucent pale veil preserves a
hazy impression of the interface while the real captured material pixels
remain sharp. A feathered lower-right mask suppresses only the high-contrast
controls beneath the three-line archival credit, whose semantic line breaks
are fixed rather than left to browser-balanced wrapping.

The harness never rewrites product source to make a take pass. It requires the
recorded product revision to expose the native quiet-ink Voice hover, the
solid-ink active tile, and the Point Talk Voice Stop submission path with
perceivable transcribing and pending states. If any of those product
preconditions is absent, capture fails before it can be treated as a release
candidate.

Before the filmed clock and first Voice admission, the capture measures every
visible text Range-fragment rectangle, selects the seeded material, waits for
the structural address to paint, and requires exact equality after normalization
to 0.01 CSS pixels. It then clears selection so current Matter routes Voice to
top-level admission rather than selected-material Point and Talk.
Selection paint is therefore allowed to change pixels but not line wrapping or
text geometry; a regression aborts the take before it can become a candidate
master. A focused product E2E separately compares the pre-selection geometry
with both structural click and a real native double-click.

The capture starts an isolated Chromium and an isolated fixture-backed Next
server on `127.0.0.1:3120`. The existing E2E runner serializes it with other
browser proofs and owns process-group cleanup after pass, failure, or interrupt.
Its effective environment pins transcription, repair, labels, Elastic, and
Point Talk to closed fixtures even if Next parses local configuration. The
microphone input is synthetic, and its local fixture request never leaves the
machine. In `--offline-demo`, Inquiry is also fulfilled by a strict local
protocol fixture and the capture receipt records `inquiryMode: "fixture"`. Only
`--live-inquiry` may reach the configured server-side pool, and that separate
take records `inquiryMode: "live"`.

If capture succeeds but a later cue or encoder check fails, resume from the
same raw WebM and receipt without reopening any browser or model boundary:

```bash
npm run film:capture -- \
  --render-existing \
  --audio /absolute/path/to/audio.wav \
  --output-dir /absolute/path/to/completed-take
```

Resume mode requires the explicit take directory, rejects both Inquiry mode
flags, and
revalidates the raw stream, versioned receipt, credit, and final media profile
before publishing a master.

The dedicated loopback Inquiry preflight remains available before a take. It
sends one frozen synthetic question through the real route, verifies the strict
response and `no-store` contract, and retains only status, timing, and outcome;
it never records the live answer text. The filmed turn still performs its own
route, visible-answer, and exactly-once assertions rather than inheriting the
preflight as proof.

## Why not desktop capture or CI as the master

FFmpeg's macOS display input can record a whole screen, but that includes
notifications, other windows, and OS chrome. It is an emergency manual fallback,
not the default Matter workflow.

GitHub Actions can run the dry parser, cue, encoder, and preflight unit tests.
It should not run or publish the complete take: that would require provider
credentials, expose a provider-backed answer in an artifact, vary font
rendering by runner, and risk copying licensed archival audio into a public
repository artifact. A future browser smoke may be separately designed as
muted and fixture-only, but it is not this master workflow.

Codex can maintain and run this explicit workflow, but Playwright is the actual
recording boundary. FFmpeg performs the opening focus return, frozen archival-
credit fade, five cue-derived crop motions, closing-frame composition, resize,
and mux; Matter itself owns the recorded canvas zoom-out, leftward pan, and every background
state. The closing rounded screen departure is explicitly a film transition, not a product
claim. There is no
product reason to introduce Remotion while the film is a
continuous screen take; add a broader composition layer only if a later frozen
brief requires multiple shots.

## Publication boundary

The operator owns the decision to publish the supplied audio. Archival footage
or soundtrack may have separate rights even when it is publicly viewable.
Keep the local master private until that permission is established, and never
put the source recording or transcript into Git history.
