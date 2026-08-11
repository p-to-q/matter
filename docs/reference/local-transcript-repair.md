# Local Transcript Repair

Use this note when changing the late admission-repair port, its deterministic
rules, or a future browser model. The product contract lives in `product.md`,
`material.md`, and `protocol.md`; this is implementation context.

## Product position

Dictation products commonly compose capture, STT, an AI cleanup pass, and final
insertion. Typeless advertises automatic removal of repetitions and self-
corrections; open projects such as [OpenTypeless](https://github.com/tover0314-w/opentypeless)
and [Voquill](https://github.com/voquill/voquill) similarly separate
transcription from AI polish. Matter shares the separation but not the commit
order or breadth: the recognizer result becomes material first, and a local
repair may only make a narrow, separately undoable correction.

## Day-one boundary

The composition injects one lifecycle-local object:

```ts
type LocalTranscriptRepairPort = Readonly<{
  repair(input: {
    text: string;
    locale: MatterLocale;
    vocabulary: readonly string[];
    signal: AbortSignal;
  }): Promise<{ text: string; source: "rules" | "local-model" }>;
  dispose(): void;
}>;
```

It never sees a tree, node, revision, lease, model id, or deadline. Day one
injects a zero-dependency TypeScript implementation. Except for caller abort, a
future adapter must contain expected infrastructure failures and return the rule
floor. UI never observes warmup, cache, model, busy, or fallback state.

Rules are locale-exact and deliberately incomplete. They may handle terminal
punctuation, safe CJK/Latin spacing, horizontally delimited spoken CJK
punctuation, `um/uh/erm` or `呃/额/額`, and whitespace-delimited recognition
echoes. They preserve `嗯`, Cantonese `唔`, names, numbers, negation, uncertainty,
meaningful repetition, false starts, and ordinary mentions of punctuation. The
negative corpus is more important than the positive corpus; the function must
be idempotent.

## Future worker and fallback

Do not add a generic provider framework. A future worker-backed factory may
replace the injected port only after an evaluated model exists:

```text
disabled → cold → loading → ready
                    ↘ cooling → one retry → disabled for this page
```

- Compute the rule floor synchronously for every utterance. A model receives
  that floor, not the raw transcript; an invalid model result returns the rule
  result rather than discarding a safe deterministic improvement.
- A cold uncached model starts one warmup for a later utterance and returns
  rules immediately; the current utterance never waits for a download.
- One worker owns one pinned model and at most one inference. Busy means rules,
  not queueing or retry.
- A warm inference has an internal 2.5-second ceiling inside the store's
  twelve-second lease. An uninterruptible inference retires its worker.
- Caller abort, candidate rejection, cache miss, and busy shedding are not
  circuit failures. One transient runtime failure cools for 60 seconds; a
  second disables the model for the page. Asset/graph incompatibility disables
  it immediately.
- `dispose()` terminates the worker and makes every old-generation message
  inert. Repair and Whisper do not share a worker or queue.
- `visibilitychange:hidden` and `pagehide` retire the in-memory worker, settle
  pending model work to rules, advance its generation, and return the adapter
  to `cold`; they do not clear asset cache or terminally dispose a page that may
  return from bfcache. Becoming visible never triggers eager loading.

The repository already depends on `@huggingface/transformers`. Its browser
runtime supports WASM, optional WebGPU, quantized dtypes, and browser Cache API
model/WASM caching; see the official [Transformers.js overview](https://huggingface.co/docs/transformers.js/main/en/index)
and [environment reference](https://huggingface.co/docs/transformers.js/main/en/api/env).
This makes it the first runtime to evaluate, not permission to enable a model.
WebGPU remains an optional acceleration path; WASM must pass the release gate.

Cache only immutable model, tokenizer, and runtime bytes. The repair worker must
set its own Transformers.js `env.cacheKey` before pipeline construction. Its
ASCII name starts `matter-local-repair-assets-v1--` and includes model slug,
full immutable revision, dtype, backend, and runtime version. Never enumerate
or delete the default `transformers-cache`: the local Whisper path may own it.
Only after a new profile reaches `ready` may caches with the repair-specific
prefix and a different profile be removed.

Never cache transcript, vocabulary, candidate, or output; never put model bytes
in the Matter document IndexedDB; never request persistent storage for
reproducible assets. Hidden, idle, and circuit-open states release memory but
keep asset cache. The Cache API is disposable. `navigator.storage.estimate()`
is only a conservative preflight hint, not a capacity promise; the
[StorageManager contract](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)
states that its usage and quota values are approximate.

The first evaluated profile is WASM plus q8. WebGPU is an optional later profile
only after it materially improves measured p95; WebGPU and WASM sessions do not
co-reside or retry within one utterance. While the local transcription flag is
enabled, repair remains rules-only until combined Whisper→repair receipts prove
that transfer, peak memory, main-thread tasks, and worker survival stay within
the release budgets below. This avoids adding a speculative cross-model resource
manager to day one.

## Candidate direction and gate

The most relevant small-purpose prior art is punctuation restoration rather
than a generative language model. [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/blob/master/nodejs-addon-examples/README.md)
ships Chinese/English offline and streaming punctuation examples, but its model
and runtime are a benchmark candidate, not a drop-in dependency for this web
path. Free-form small LLM cleanup is out: its larger semantic freedom fights the
repair boundary and increases download, memory, and adjudication risk.

A model may enter the default path only with all of these receipts:

- clear proprietary-compatible model/tokenizer/runtime licences and a pinned
  immutable revision;
- total quantized transfer no more than 80 MiB, warm p95 at most 1.5 seconds on
  the primary desktop and 2.5 seconds on the lowest supported device, added
  peak memory no more than 250 MiB, and no main-thread task over 50 ms;
- cold-load admission latency remains zero and failure always returns rules;
- zero accepted changes to numbers, names, negation, modality, uncertainty, or
  sentence order across `zh-CN`, `zh-TW`, `en-US`, mixed Chinese/English,
  `ja-JP`, and `de-DE` negative corpora;
- at least a 10% repair-error reduction over the deterministic floor.

Light tone rewriting is a different product profile. It needs an explicit
direction and adjudicator; it must not arrive by widening this repair budget.
