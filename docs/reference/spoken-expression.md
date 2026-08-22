# Spoken Expression

Need: speech-to-text loses non-lexical expression, but automatically asserting
an emotion is materially riskier than restoring a comma. Matter therefore
treats inferred emoji as a separate, undoable expression layer rather than part
of the immediate punctuation floor.

## Product and research evidence

The feature the product brief recalls is most likely WeChat's mobile voice
message transcription, not the separate WeChat Input Method. Contemporary
[product testing](https://www.ifanr.com/app/1407866) observed `[呲牙]`,
`[流泪]`, and `[发怒]` at the end of converted voice messages. Tencent's active
Chinese patent
[CN114694686B](https://patents.google.com/patent/CN114694686B/zh) describes an
instant-message transcription that combines a speech-activation classifier
with a text-emotion classifier before displaying an emoji. That patent is
useful prior art, not an implementation specification; a China launch of a
similar audio-plus-text feature requires a freedom-to-operate review.

[VoiceMoji](https://arxiv.org/abs/2112.12028) demonstrates a roughly 4 MB
on-device text pipeline that first predicts an insertion boundary and then one
of 64 emoji, but its evaluation removed code-switched examples. General speech
emotion classifiers also transfer poorly across speakers, languages, devices,
and corpora. Neither result authorizes an unreviewed five-locale classifier to
write into human material.

## Current choice

The first release is a deterministic semantic-only planner in the existing
late admission repair:

- only human material admission uses it; Ask Matter and spoken tool direction
  never do;
- the immediate words-and-punctuation baseline appears first;
- one later pointer-undoable repair may make at most one expression insertion;
- a direct affect may append exactly one of `🎉`, `😄`, `😠`, or `😢` after the
  sentence terminator;
- a small iconographic entity pack may instead decorate one exact word tail:
  airplane, coffee, birthday, rocket, music, sun, or moon in the supported
  locale spellings, plus the English bridge;
- only an explicit first-person affect, unambiguous celebration, or sustained
  written laughter can trigger it;
- negation, condition, question, report, metalinguistic use, protected literal,
  existing emoji, or conflicting affect vetoes the whole proposal;
- every primary locale may also use token-anchored English as a code-switch
  bridge;
- entity decoration is sampled at 24% from the stable admission identity. The
  same admission is reproducible through store revalidation, while separate
  admissions can naturally differ. A caller with no admission identity gets no
  sampled noun decoration;
- capacity failure silently omits the emoji instead of rejecting valid words.

The planner is insertion-only and idempotent. Removing its one insertion
restores the repaired text code-unit for code-unit. Locale word segmentation
prevents `飞机场` from being split as `飞机✈️场`; protected literals, dotted and
underscore-joined identifiers, unlisted nouns, multiple
simultaneous decorations, and two or three repeated symbols remain
closed. A known locale enables only its own entity dictionary plus English; it
does not silently activate another non-English dictionary merely because that
script appears. Unspaced CJK/English seams remain valid code-switch boundaries.
The optionality is reproducible sampling, never `Math.random()`:
nondeterminism would make the repair candidate disagree with the store's exact
recomputation and break Undo authority.

The ordinary Playwright matrix uses transport fixtures and is not evidence that
real speech reached this planner. The explicit local-transcription receipt must
provide a generated audio file outside the repository, enable
`MATTER_E2E_LOCAL_TRANSCRIPTION=true`, and assert all three boundaries together:
the browser sends no `/api/transcribe` request, local Whisper recovers the
expected spoken words, and the later admission repair appends the expected
expression. A gated receipt that merely starts the worker or exits a
`transcribing` state is not sufficient proof.

## Acoustic reopening boundary

Recorded PCM can eventually contribute prosody without widening the strict STT
response. Text must continue to choose the expression class; audio may only
confirm activation. Candidate evidence includes speech rate, voiced-run length,
relative log energy, F0 range/reset, and terminal contour, normalized against a
per-speaker median/MAD baseline. Raw volume, one peak, a short utterance, or
Web Speech callback timing never suffices.

Before enabling that path:

1. complete the patent freedom-to-operate review;
2. keep the proposal transient and admission-only;
3. require text and at least two independent, quality-gated acoustic signals;
4. prove at least 98% insertion precision and below 0.2% neutral false inserts
   for every enabled locale, accent, device, and mixed-English slice;
5. keep one emoji as the default; two require explicit intensification plus
   extreme corroborated prosody, and three remain an explicit spoken command;
6. verify screen-reader speech and the existing two-step pointer Undo receipt.

Additional word-tail emoji remain closed until corpus evidence justifies each
new entity and its locale segmentation receipts. Entity decoration runs only
after filler, restart, correction, and any accepted managed repair, so it never
needs to relocate an anchor through later lexical changes and never enters the
managed repair prompt.
