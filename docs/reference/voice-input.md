# Voice Input

Need: bounded microphone capture must survive permission denial, slow prompts,
final MediaRecorder chunks, retry, and cleanup without falling back to a keyboard
or retaining audio.

Useful platform pieces are the browser-managed Web Speech API and
`getUserMedia` plus `MediaRecorder`. A recorded utterance may be transcribed by
an explicitly configured server adapter or by the lazy on-device Whisper
fallback. Browser
speech behavior and service retention remain vendor-controlled, so the public
preview states that limitation and reports voice unavailable immediately when
native recognition is absent rather than hiding the control or recording into
an unavailable fallback.

Current choice:

```text
pointer starts at empty root / node / segment
  → bounded recording + local anchored level feedback
  → stop and collect final chunk
  → browser-native Web Speech API (preferred)
  → on-device Whisper worker, or POST /api/transcribe (explicit fallbacks)
  → transcript
  → immediate human material admission
  → one repair lease after a short visibility floor
```

Raw audio is never written to storage or logs. Failure preserves the admission
anchor and exposes a pointer retry. A transcript is not rendered as a message:
it becomes human material. The dormant Text Swap grammar does not give Voice a
selected-language or transform-direction mode in the current release.

The public preview uses browser-managed Web Speech for transient interim text
and one final admission when available. Otherwise it records locally and lazily
loads a quantized multilingual Whisper model in a worker. The model and runtime
are fetched on first fallback use and may be cached by the browser; raw audio is
decoded and transcribed on the person's device.

At hydration, Matter first checks the selected transport without asking for
permission. Browser speech constructs one unstarted recognition lease; the first
voice port consumes that exact object and calls `start()` only from the person's
pointer action. Recorded audio is a ready capture capability without evaluating
the optional local-transcription graph. That check requires capture APIs and,
for a local-only deployment, the worker and audio-decoding APIs, but it neither
constructs nor imports them. The person's first voice action starts
that worker handshake beside microphone permission and recording; no worker,
Whisper runtime, model, audio decoding, or transcription is requested during
page hydration. The handshake remains bounded to fifteen seconds, and the
actual transcription call owns the same lazy factory if speculative warming did
not finish or failed. Browser-native recognition also has a bounded start
watchdog, so a browser that neither starts nor errors returns a recoverable
failure instead of leaving the first turn indefinitely in "waiting for
microphone".

## Admission boundary

The voice control has a target only in the full material view. A truly empty
tree initializes its root. In the document-root runtime, speaking with no
visible passage selected appends first-level material beneath the invisible
structural root; speaking with an active visible passage selected appends a
child beneath that passage. Activation freezes the exact parent, tree id, and
revision. Transcription never chooses a newer target or relocates its result.
A successful admission keeps the current selection, so recording does not
select the material it creates.

Commit revalidates that frozen handle. A different tree or revision, leaving
the full view, losing the parent, or selecting another non-empty target makes
the result stale. Clearing the selection or changing only fold state does not
retarget or invalidate it. Working-context exclusion clears an affected
selection before admission can start, so held-aside material never becomes a
voice parent through this path.

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
outside that asynchronous resource scope. The synchronous commit boundary still
applies the frozen-parent rules above, so a later selection can invalidate an
utterance but can never retarget it. Client and server deadlines settle
independently of whether a fetch wrapper or provider adapter observes its abort
signal.

The first-release recording policy prefers WebM/Opus and falls back to MP4/AAC
where supported. Capture stops at 60 seconds; the route allows 65 seconds of
timing jitter and at most 2 MiB of audio. Bounds reject rather than truncate.
Empty or whitespace-only transcript and text beyond the node bound change
nothing.

The Ask Matter composer uses the same transport boundary for keyboard-free
questions. Browser recognition writes transient partials into its question
field. When a recorded-audio fallback is enabled, MediaRecorder stops first and
sends a bounded `direction` transcription request to either the local worker or
the same-origin route; the resulting
text remains a draft until the person asks. Closing the inquiry cancels capture
or transcription, and neither path admits material or enters command history.

The public preview prefers the browser-managed Web Speech API: interim and final
partials remain transient in the admission state, and only the final transcript
is committed. It needs no Matter API key or extra server, though browser vendors
may use their own speech service. Browsers without the API keep the MediaRecorder
path only when the client build explicitly enables a recorded-audio transport.
The dedicated public deployment enables on-device transcription, so unsupported
Web Speech browsers can still admit or dictate material without a Matter STT
service. It never uses the fixture transcript in production. The microphone
remains visible in its stable composer position. `POST /api/transcribe` is strict
multipart and echoes protocol version,
interaction id and attempt. It receives purpose, locale, duration and audio,
but no tree, target, lineage, provider name or fixture flag. The route parses;
server-only adapters transcribe. Provider selection is deployment configuration.
Fixture and live adapters use the same controller, request, response and human
tree-command path.

One browser admission owns one recognition instance, one 60-second timer, and
one operation identity. A browser-initiated restart after silence does not reset
that deadline. Every native callback verifies that its instance is still current,
so cancellation, scope invalidation, and unmount make queued results and end
events inert. On an explicit stop, the committed candidate is the confirmed
final text followed by the latest interim hypothesis when the browser did not
emit a final result before ending. It is bounded by the same node-text limit as
every other admission before it can reach the command translator.

Stable failures distinguish unsupported capture, denied or missing microphone,
recording failure, malformed or unsupported audio, empty speech, timeout,
unavailable service and invalid provider response. UI copy is local to the
frozen target; provider messages and voice content never enter routine logs.

## Transcript repair

Recognition can lose punctuation, duplicate a seam, retain verbal scaffolding,
or record both sides of a correction. Retyping is exactly the keyboard the
primary path is built to avoid, but waiting for cleanup makes the microphone
feel slower than transcription. The final transcript therefore commits first
with a formatting-only floor. Repair computes beside a visibility gate, but its
second command cannot settle until the baseline has crossed two animation-frame
opportunities and remained visible for at least 650 ms.

Its mandate is faithful spoken-to-written recovery, not free improvement. The ordered pure TypeScript rules
settle CJK/Latin spacing, locale punctuation and sentence shape, explicit spoken
punctuation, a closed filler list, bounded recognition echoes and stutters,
well-formed addresses, stable product casing, and explicit self-correction
shapes. The managed proposal may additionally resolve a contextual filler,
abandoned start, later correction, misheard word, or forced grammar seam.
Destructive passes protect URLs, email addresses, numbers, units, negation,
uncertainty, quantifiers, emphasis, and punctuation words used as ordinary
nouns. A false negative is acceptable; changing a claim is not.

That mandate is enforced outside the model. A rules candidate must equal the
pure function result exactly. A managed-model candidate must pass the existing
spoken-skeleton edit budget plus zero-change guards for numeric facts, negation,
modality, and uncertainty. Rewriting, translating, answering, and obeying an
instruction spoken inside the utterance are refused regardless of model output.

Repair is allowed to fail and does so silently. There is no `repairing` UI
phase, spinner, retry, cache status, or error. A committed correction leaves
unchanged language visually still, gives the changed seam one short recognition
beat, then reveals only inserted or replaced graphemes in reading order. This is
a bounded repair cue, not model-token streaming: the full final text is already
present, selectable, and accessible, and focus, selection, hit testing, and
layout never read a provisional string. Reduced motion presents it whole. A
successful admission mints one
opaque capability that is returned only to the driver and omitted from
observable store state. No-change, adapter failure, abort, timeout, document
replacement, and candidate settlement all consume it. The store uses its own
monotonic clock and a twelve-second ceiling; it never trusts caller timing.

An optional correction never outranks a person's precise material gesture.
Starting lasso, stretch, or node drag, or invoking Undo/Redo, discards pending
repair capabilities before the gesture can observe changing text geometry.
This first-release rule is deliberately conservative; a later node-local policy
requires evidence that it preserves selection and layout receipts.

A valid candidate still requires the same document epoch, tree, node text, and
node timestamp captured at admission. It becomes a second `source: "repair"`
tree command, so one Undo reveals the heard baseline and a second Undo removes
the admission. Undo/Redo cannot restore a capability, while the two durable
commands and their inverses survive reload together.

The epoch also guards the first admission itself. It is captured before the
microphone request and checked inside the store commit, not only in a later
React scope effect. This closes the same-id/same-revision hydration race. The
store also owns a unique sequence in every repair lease id, so correctness does
not depend on a caller making command ids globally unique.

The admission composition uses a detachable lifecycle-local port with only
`repair(input)` and `dispose()`. It always computes the rule floor first, then
may send that floor through the existing bounded `/api/repair` envelope. A
disabled, busy, slow, rejected, malformed, or failed managed proposal returns
the rule result without status or retry. A future worker port may replace the
managed proposal while keeping this exact boundary; it may own one pinned local
model, cache, single-flight load, busy shedding, deadline, and session-local
circuit breaker. Cold loading prepares a later utterance and returns rules for
the current one; model/runtime state stays inside the adapter. The worker,
fallback, cache, and candidate gates are frozen in
[`local-transcript-repair.md`](local-transcript-repair.md).

`POST /api/repair` is the shared managed envelope for Ask Matter dictation
drafts and one post-admission proposal. It receives protocol and prompt
version, operation identity, locale, and one utterance — no tree, node, lineage,
or target. A dictated question is a draft rather than material, so closing the
inquiry aborts the request and no repair command or lease exists.

The local port also receives a vocabulary hint: terms the person has already used
more than once elsewhere in the same tree, most-used first, bounded to 24 terms
of 32 code units. Recognition fails hardest on exactly that vocabulary — a
project's own names, a borrowed term, an acronym said aloud — and the person's
own material is the only glossary that stays current without being maintained.

The boundary is narrow on purpose. The hint is derived from material and
never fetched; it carries words only, with no node id, depth, or ordering; and
it cannot widen what an answer may change, because `adjudicateRepair` still
measures the spoken skeleton. A hinted term can be used to recognise a word that
was said and written down wrong; it cannot be inserted into a sentence that did
not contain it, however apt it looks. Repetition is the whole signal: a term
used twice is evidence it is theirs rather than the recognizer's guess.

## Live deployment gate

The fixture proves the browser-resource and multipart lifecycle, not public live
readiness. A live adapter remains disabled until the deployed route has bounded
origin/request admission, rate and spend controls, streaming upload rejection or
an equivalent proxy bound, authoritative decoded audio duration/type validation,
and physical HTTPS Chrome and Safari receipts. Background suspension and
`pagehide`, recorder-constructor fallback, and real local level feedback must be
proved before the static recording indicator can be presented as final voice UX.

The on-device fallback is a separate capability: it keeps audio local and needs
no credential or route capacity, but first use downloads a quantized model and
WASM runtime. It is intentionally lazy, worker-owned, single-flight, and bounded
by the same recording policy. Web Speech remains preferred because it provides
live partials without the model download. The local model provides final text,
not real-time partial hypotheses, and lower-powered devices may take noticeably
longer to settle.

A cancelled queued local request is explicitly skipped by that worker. If
Whisper has already started inference, the browser has no safe interrupt for
that model call, so cancellation retires the worker and invalidates every late
message from its lease; the next request lazily creates a fresh worker. This
prevents a dismissed utterance from consuming the next person's turn while
keeping all audio on-device and transient.

The same lease now ends on `visibilitychange:hidden` and `pagehide`. Admission,
Ask Matter dictation, and any related transcription or repair request cancel at
that boundary; an in-memory Whisper worker is terminated even after a successful
turn so its model memory does not remain resident through a background session.
Returning visible never starts capture, constructs a worker, or reloads model
assets. Cached immutable runtime/model bytes remain the browser's disposable
asset cache, never a cache of audio, transcript, question, or answer.

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
