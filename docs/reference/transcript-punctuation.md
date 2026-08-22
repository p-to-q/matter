# Transcript Punctuation

Need: a person should not have to type punctuation after speaking, but Matter
must not turn an immediate human admission into an invisible rewrite.

## Prior art

Mature speech systems separate recognized words from the marks attached after
them:

- [FunASR streaming CT-Transformer](https://github.com/modelscope/FunASR/blob/main/funasr/models/ct_transformer_streaming/model.py)
  predicts a punctuation label after each token, freezes output through the
  most recent sentence end, and keeps only an undecided tail in cache. Its
  [paper](https://arxiv.org/abs/2003.01309) uses controllable future context.
- [OpenAI Whisper word timing](https://github.com/openai/whisper/blob/main/whisper/timing.py)
  derives word alignment from cross-attention and dynamic time warping, then
  merges punctuation tokens into neighboring words. These times are useful
  evidence, not exact acoustic truth.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py)
  exposes word timestamps separately from its Silero VAD filter. Its silence
  filter is an audio-chunking policy, not a punctuation policy.
- [Silero VAD](https://github.com/snakers4/silero-vad/blob/master/src/silero_vad/utils_vad.py)
  uses threshold hysteresis and explicit streaming state so noise near one
  threshold does not repeatedly open and close speech.
- [sherpa-onnx](https://k2-fsa.github.io/sherpa/onnx/c-api/html/punctuation.html)
  keeps endpointing, offline punctuation, and online punctuation as separate
  replaceable modules.
- [NVIDIA NeMo punctuation and capitalization](https://docs.nvidia.com/nemo-framework/user-guide/24.09/nemotoolkit/nlp/punctuation_and_capitalization.html)
  treats punctuation as one classifier label after every word and merges
  overlapping context-window evidence for long input.

The shared lesson is a pipeline, not a model choice: preserve lexical text,
measure acoustic and semantic evidence independently, plan marks at token
boundaries, and freeze what has already been accepted. Matter uses that shape
without adding another model or dependency.

There is also a credible text-only learned path, but it is not yet a good
baseline for Matter. sherpa-onnx publishes the
[Edge-Punct-Casing](https://github.com/k2-fsa/sherpa/blob/master/docs/source/onnx/punctuation/pretrained_models.rst)
CNN-BiLSTM as a 7.1 MB int8 model plus a 146 KB vocabulary and reports 13 ms for
one short English example on one CPU thread. It supports English only and also
predicts casing. Its Chinese-English CT-Transformer is 72 MB int8 or 281 MB at
full precision and still does not cover Japanese or German. Shipping several
language-specific weights would therefore add download, cache, runtime, and
version ownership before Matter has a corpus proving that the gain is worth
it. Unicode text segmentation is useful for safe token boundaries, but
[UAX #29](https://www.unicode.org/reports/tr29/) cannot restore marks that are
absent from the text. The current text-only implementation is consequently a
small deterministic grammar, with the same insertion-plan seam reserved for a
future compact classifier if evidence justifies it.

## Current choice

Every final STT path runs the same pure punctuation floor before its text can be
admitted, become an Ask Matter draft, or become a spoken tool direction. The
floor may normalize whitespace beside punctuation and insert marks. It never
deletes, replaces, or reorders a spoken word. Filler removal, restart collapse,
self-correction, number recovery, and other lexical changes remain in the later
separately undoable repair.

The punctuation engine first produces an insertion plan against UTF-16 offsets,
then assembles the original slices and planned marks in offset order. Tests can remove exactly the
planned characters and recover the input. Existing marks win, a second pass is
idempotent, and URL, email, path, code, address, version, numeric, and quoted
spans veto internal candidates and spacing rewrites. Unquoted dotted or
underscore-joined Unicode identifiers receive the same protection. Inferred marks are also
all-or-nothing against the receiving consumer's code-unit or code-point limit:
valid raw words at exact capacity remain valid instead of failing because of an
added final mark. If recognized human material already ends in an emoji but no
terminal, the insertion lands before that emoji; the emoji is neither moved nor
reinterpreted.

Dense speech stays bounded by building content-count prefixes and nearest
sentence boundaries once per Chinese transcript, then querying each candidate
without rescanning either clause. Planned marks are assembled as chunks instead
of copying the whole string per insertion. Literal masking first rejects text
that cannot contain a protected form, so the comprehensive URL/code/identifier
grammar is not repeatedly attempted against ordinary all-CJK speech.

### Trusted timing

The pinned local Whisper export does not contain the cross-attention outputs
required by word-level timestamps. The worker therefore requests supported
segment timestamps; asking this export for `return_timestamps: "word"` makes an
otherwise valid transcription throw after inference. Adjacent segment times
locate a possible seam. Matter then measures the already decoded 16 kHz
waveform itself in 20 ms RMS frames. Per-utterance twentieth- and
ninetieth-percentile energy estimates must establish a real speech-to-noise
range before a two-threshold hysteresis band can exist; uniformly quiet speech
therefore degrades to semantic-only rather than masquerading as silence. A
timestamp gap is admitted only when at least 120 ms and at least half of that
interval is sustained acoustic silence. Segment timing and waveform evidence must
agree. A short utterance commonly produces one segment and therefore uses the
semantic punctuation floor without acoustic pause evidence.

The resulting evidence is transient `{ afterCodeUnit, durationMs, source }`.
It never leaves the worker, enters an HTTP response, reaches the tree, appears
in history, or gets logged. A future server adapter may provide the same bounded
shape privately and must collapse it into final text before returning the
strict transcription envelope.

Every offset must be a complete Unicode grapheme boundary. English and German
word gaps must additionally land beside whitespace, so a provider sub-token
cannot split a contraction or hyphenated word. Malformed, unsorted, duplicate,
empty, non-finite, or non-reconstructing evidence is rejected as one unit before
PCM analysis and the text continues through semantic-only punctuation.

Browser Web Speech exposes `transcript` and `isFinal`, not word-level acoustic
time. Callback delay, result grouping, session restart, upload time, and total
recording duration are not pauses. That path therefore uses the semantic rules
only; it never fabricates timing.

### Pause policy

With fewer than six valid gaps, comma and sentence thresholds are 420 ms and
900 ms. With enough evidence, each utterance calibrates itself:

```text
commaMs    = clamp(median + 2.5 × MAD, 360, 650)
sentenceMs = clamp(median + 5 × MAD, 850, 1400)
```

A pause below the comma threshold does nothing. A medium pause inserts a comma
only when both sides meet locale-specific clause minima. A sentence pause may
insert a period only when both sides look independently complete and the left
side does not end in a conjunction, article, preposition, particle, or other
unfinished form. A long pause alone never creates a question mark.

### Semantic policy

The text-only layer uses one insertion planner with locale packs. A known
locale owns its punctuation style and primary grammar, while token-anchored
English rules remain available as a code-switch bridge in every supported
locale. An unknown locale activates a Chinese, Japanese, or German pack only
from script or language-specific lexical evidence; it never treats the five
packs as one undifferentiated vocabulary. Supplementary Han characters use
Unicode script properties rather than a BMP range.

The planner deliberately recognizes a bounded high-confidence grammar:

- simplified and traditional Chinese: opening discourse markers; internal
  contrast, sequence, result, and addition; `如果…那么`, `因为…所以`, and
  `虽然…但是`, `即使…也`, and `无论…都`; longer spoken
  discourse phrases such as `然后呢` win before their shorter words; long
  stance openings such as `我觉得…`, bounded `从…来看` and `在…情况下`
  frames, `…的话` and temporal frame tails before a new main clause, paired
  relations such as `先…再` and `一方面…另一方面`, and a closed set of
  completion-state endings before a modal-bearing subject restart; direct
  interrogatives, A-not-A shapes, and final `吗/嗎`;
- English: opening discourse markers only before a plausible subject; contrast
  and sequence only before a plausible new clause; balanced `; however,` and
  bounded `if/although…then`; only auxiliary inversion or wh-plus-auxiliary
  counts as a text-only direct question;
- Japanese: opening and internal discourse markers rendered with `、`; final
  `か` is a question only outside `かどうか` and `かもしれない` statements;
- German: grammar-bearing subordinate and coordinating conjunctions such as
  `weil`, `dass`, `wenn`, `obwohl`, `aber`, and `sondern`; multiword
  conjunctions such as `ohne dass` are atomic; direct questions
  require either verb-first order or a wh word immediately followed by a
  finite/modal verb.

Rules require content on both sides and avoid broad `and/or`, `和/与/以及`,
Japanese particles, English `because/since`, and length-only splitting. A false
negative is safer than changing the structure of a claim.

The earlier Chinese floor was visibly sparse for a structural reason rather
than a rendering failure: a short local Whisper result commonly has one segment,
so it contributes no acoustic seam, while the semantic floor recognized mostly
explicit connectives. Continuous Mandarin without one of those words therefore
fell through to the terminal stop. The added rules recover only seams whose
words carry redundant structure: a bounded frame plus a main-clause start, two
members of a paired relation, or a closed completion ending plus a
modal-bearing subject restart. They do not split by character count, guess a
predicate from arbitrary nouns, or punctuate through a protected literal.
The late lexical repair does not carry a second connector regex: after its
bounded word cleanup it re-enters this same planner, so compound guards such as
`所以然`, `同时代`, `不过关`, and `自然而然` cannot drift between admission
and repair.

One stronger mark is available only from redundant textual evidence: a colon
requires both an explicit list cue (`具体如下`, `as follows`, `次のとおり`,
or `wie folgt`) and a first-item anchor. English transition adverbs may form a
balanced `; however,`-style boundary only when both sides look like complete
clauses. The floor never guesses an em dash, exclamation mark, ellipsis,
parenthesis, or quotation from intensity. A person can still say an explicit
punctuation command, including `破折号` or `em dash`, and paired spoken quote
commands remain atomic in the later repair.

## Integration boundary

```text
Web Speech final text ────────────────── semantic rules ─┐
                                                        ├─ final punctuated text
recorded PCM → Whisper segment times → Matter RMS VAD ──┘
                                                        ↓
             admission / Ask Matter / spoken direction
```

The HTTP `TranscriptionSuccess` shape remains exactly version, interaction id,
attempt, and transcript. Timing is provider-private implementation evidence,
so adding this behavior does not widen protocol `0.2`.

## Reopening the choice

Tune thresholds only from retained synthetic fixtures or consented, scrubbed
evaluation recordings; real voice and transcripts never belong in the
repository. Consider a compact punctuation model only if a five-locale corpus
shows a meaningful semantic false-negative rate after these rules, and keep it
behind the same insertion-only plan. Do not reuse VAD endpoint thresholds as
comma or sentence thresholds, and do not infer acoustic evidence from Web
Speech callback time.
