# Voice Input

Need: bounded microphone capture must survive permission denial, slow prompts,
final MediaRecorder chunks, retry, and cleanup without falling back to a keyboard
or retaining audio.

Useful platform pieces are the browser-managed Web Speech API and, only when a
real server adapter is configured, `getUserMedia` plus `MediaRecorder`. Browser
speech behavior and service retention remain vendor-controlled, so the public
preview states that limitation and disables voice immediately when native
recognition is absent rather than recording into an unavailable fallback.

Current choice:

```text
pointer starts at empty root / node / segment
  → bounded recording + local anchored level feedback
  → stop and collect final chunk
  → browser-native Web Speech API (preferred)
  → POST /api/transcribe (explicit server fallback)
  → transcript
  → human material admission, or transform direction
```

Raw audio is never written to storage or logs. Failure preserves the anchor or
selection and exposes a pointer retry. A transcript is not rendered as a message:
for admission it becomes human material; for transformation it enters the
envelope and only the resulting material change is shown.

The public preview uses the browser-managed Web Speech capability for transient
interim text and one final admission. Client-side Whisper and an
application-owned audio relay remain out of scope.

## Admission boundary

The voice control has a target only in the full material view: at an empty tree
it initializes the root; in a nonempty tree it appends a first-level child under
the sole root. Activation freezes that target, tree id and revision;
transcription never reads a newer selection and never relocates a result. A
successful admission keeps the current selection, so recording never changes
what a person is handling.

The framework-free controller owns these serializable phases:

```text
idle → requesting → recording → stopping → transcribing → committing
                                                    ↘ recoverable error
```

Browser resources live behind `VoicePort`, keyed by interaction id and attempt.
They never enter the store, tree, history, or a retry cache. Cancel invalidates
the token and releases recorder handlers, chunks, tracks, optional meter,
timers, and fetch. Since microphone permission cannot be aborted reliably, a
stream that resolves after cancellation is immediately stopped. Stopping waits
for the final `dataavailable` before using the recording; `timeslice` is never a
duration clock.

React does not interpret these effects directly. A small Matter-specific driver
serializes reducer events, owns the operation registry, and disposes idempotently.
It receives the current `{ treeId, revision }` scope; a document or material
revision change cancels capture or fetch immediately. Fold and selection remain
outside that scope, so navigation alone does not waste or retarget an utterance.
Client and server deadlines settle independently of whether a fetch wrapper or
provider adapter observes its abort signal.

The first-release recording policy prefers WebM/Opus and falls back to MP4/AAC
where supported. Capture stops at 60 seconds; the route allows 65 seconds of
timing jitter and at most 2 MiB of audio. Bounds reject rather than truncate.
Empty or whitespace-only transcript and text beyond the node bound change
nothing.

The public preview prefers the browser-managed Web Speech API: interim and final
partials remain transient in the admission state, and only the final transcript
is committed. It needs no Matter API key or extra server, though browser vendors
may use their own speech service. Browsers without the API keep the MediaRecorder
path only when the client build explicitly enables audio upload. The dedicated
public browser-recognition deployment disables that capability, so unsupported
browsers fail before microphone access; it never uses the fixture transcript in
production. `POST /api/transcribe` is strict multipart and echoes protocol version,
interaction id and attempt. It receives purpose, locale, duration and audio,
but no tree, target, lineage, provider name or fixture flag. The route parses;
server-only adapters transcribe. Provider selection is deployment configuration.
Fixture and live adapters use the same controller, request, response and human
tree-command path.

Stable failures distinguish unsupported capture, denied or missing microphone,
recording failure, malformed or unsupported audio, empty speech, timeout,
unavailable service and invalid provider response. UI copy is local to the
frozen target; provider messages and voice content never enter routine logs.

## Live deployment gate

The fixture proves the browser-resource and multipart lifecycle, not public live
readiness. A live adapter remains disabled until the deployed route has bounded
origin/request admission, rate and spend controls, streaming upload rejection or
an equivalent proxy bound, authoritative decoded audio duration/type validation,
and physical HTTPS Chrome and Safari receipts. Background suspension and
`pagehide`, recorder-constructor fallback, and real local level feedback must be
proved before the static recording indicator can be presented as final voice UX.

## Future managed real-time correction

The current preview does not mint a credential or open a configurable provider
session: its real-time partials come only from the browser-managed Web Speech
capability. A later managed-provider slice may mint a short-lived, origin-bound
credential through one same-origin endpoint, then let the browser establish the
media session directly. The application must never receive a permanent API key
or forward raw audio.

Partial hypotheses are transient interaction feedback, keyed by interaction id,
attempt, and a monotonic sequence. They are never stored in `ThoughtTree`,
history, IndexedDB, archives, analytics, or logs. Cancellation, scope change,
document switch, and unmount close the browser session and make late partials
inert. Explicit stop yields one final transcript, which alone enters the
existing atomic admission command and remains pointer-undoable.

Before enabling this route, freeze the provider's WebRTC/session contract,
allowed origin, token TTL, concurrent-session and byte/duration limits, and
daily spend cap. The public deployment keeps voice unavailable until those
controls and Chrome/Safari HTTPS receipts pass.
