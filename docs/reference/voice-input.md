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
  → bounded repair pass (POST /api/repair)
  → human material admission, or transform direction
```

Raw audio is never written to storage or logs. Failure preserves the anchor or
selection and exposes a pointer retry. A transcript is not rendered as a message:
for admission it becomes human material; for transformation it enters the
envelope and only the resulting material change is shown.

The public preview uses browser-managed Web Speech for transient interim text
and one final admission when available. Otherwise it records locally and lazily
loads a quantized multilingual Whisper model in a worker. The model and runtime
are fetched on first fallback use and may be cached by the browser; raw audio is
decoded and transcribed on the person's device.

## Admission boundary

The voice control has a target only in the full material view: at an empty tree
it initializes the root; in a nonempty tree it appends a first-level child under
the sole root. Activation freezes that target, tree id and revision;
transcription never reads a newer selection and never relocates a result. A
successful admission keeps the current selection, so recording never changes
what a person is handling.

The framework-free controller owns these serializable phases:

```text
idle → requesting → recording → stopping → transcribing → repairing → committing
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

Recognition reliably loses three things: punctuation, sentence boundaries, and
the occasional misheard word. A person then reads their own thought back in a
form they did not say it in, and the smallest fix — retyping — is exactly the
keyboard the primary path is built to avoid. So one bounded pass sits between a
final transcript and its admission.

Its mandate is restoration, not improvement. It may add the punctuation the
phrasing implies, find where one thought ends and the next begins, correct a
homophone the surrounding words disambiguate, and settle on one spelling for a
term said twice. It may not translate, summarize, expand, answer, reorder, or
tidy — and it may not delete a repetition, a filler, or a false start, because
hesitation is the person's material.

That mandate is stated in the prompt and enforced outside it. Every answer is
adjudicated against the transcript it was given: both are reduced to the
*skeleton* a person actually pronounced — punctuation, spacing and case removed
— and the answer is discarded unless the two are within a proportional edit
budget. Rewriting, translating, answering, and obeying an instruction spoken
inside the utterance all move far past that budget and are refused. The prompt
raises the share of answers that are the repair we wanted; adjudication makes
the rest cost nothing.

Repair is therefore allowed to fail, and does so silently. No adapter, a
cooling provider, a timeout, a shed request, a malformed answer, and a rejected
answer all settle the same way: the words as heard become material, with the
deterministic `normalizeAdmittedTranscript` floor applied at commit as before.
There is no repair error state and no retry, because nothing was lost.

The `repairing` phase is the only place a person waits on a model, so the
transcript stays visible while it runs and the deadline scales with the
utterance — roughly 1.2 s for a short thought, 4 s at the ceiling. Nothing is
committed twice: one human admission command carries the settled text, so the
result is a single pointer-undoable change and no agent-sourced mutation. The
transcript lives in transient interaction state only; it never enters the tree,
history, persistence, or a log before that command.

`POST /api/repair` receives protocol and prompt version, an operation id and
attempt, a locale, and one utterance — no tree, node, lineage, or target. It
answers with one utterance and whether it came from the model or was returned
verbatim. `MATTER_REPAIR_ADAPTER` gates the server side and reuses the existing
model pool; `NEXT_PUBLIC_MATTER_TRANSCRIPT_REPAIR_ENABLED=false` removes the
round trip from a build without changing the server.

Ask Matter's dictation shares the same pass, from both its transports — browser
recognition and the recorded-audio fallback alike. It is a looser use of it: a
dictated question is a draft the person will edit before asking, not material,
so there is no admission to hold and closing the inquiry aborts the request
mid-flight. Cancellation is the only outcome that delivers nothing; every other
failure writes exactly what was heard into the question field.

Repair also carries a vocabulary hint: the terms the person has already used
more than once elsewhere in the same tree, most-used first, bounded to 24 terms
of 32 code units. Recognition fails hardest on exactly that vocabulary — a
project's own names, a borrowed term, an acronym said aloud — and the person's
own material is the only glossary that stays current without being maintained.

The boundary is narrow on purpose. The hint is derived from visible material and
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
