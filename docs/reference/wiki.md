# Wiki: local lexical authority

Status: first-release engineering contract. The scoring constants remain a
corpus-calibration boundary, not a claim of product quality.

Wiki is a thin, origin-local authority for forms that Matter can resolve
deterministically. It exists to make repeated recognition and wording mistakes
disappear from future material. It is not a notebook, memory system, retrieval
index, user profile, prompt supplement, or second document model.

## Product posture

The successful interaction is no interaction. Wiki infers, learns, and applies
a safe decision behind the paper. It does not announce a hit, ask the person to
approve routine learning, place a badge on material, or expose a permanent
management surface. A person should not need to know that Wiki exists in order
to receive its benefit.

A person enters the loop only after noticing that the automatic result is
wrong. The error site may then disclose one quiet correction affordance; a
deeper Wiki surface, labelled `词典 WIKI` in Chinese, is discoverable from settings
or that exception, not promoted into the primary experience. Its settings entry
sits immediately before Model API. The main paper never asks the person to
maintain, approve, or periodically review a dictionary. One explicit
correction promotes one canonical lexeme to confirmed authority; all hidden
aliases keep the same lexeme identity and follow a rename. Removing a lexeme
removes its aliases and leaves bounded negative authority so machine evidence
cannot recreate it. Neither action
produces a separate success notification. The deeper surface nevertheless
preserves agency: a person may inspect, add, change, or remove canonical words
when they choose to configure them. Invisibility is the normal path,
not a denial of control.

## Authority and evidence

Wiki stores bounded canonical lexemes. Matching aliases are implementation
evidence attached by stable lexeme id, not person-visible `wrong → right` rows.
Each alias belongs to one exact supported locale and one of two channels:

- `spoken` applies after local transcript normalization and before admission;
- `written` applies to eligible model-generated text immediately before a tree
  command is constructed.

Confirmed human correction always wins. Renaming a lexeme, changing its inferred locale,
or removing it applies to all hidden aliases as one atomic decision. Each
lexeme also owns one reversible applicability scope: `spoken`, `written`, or
`both`. Scope filters projection and fitting only. A disabled channel's aliases,
evidence, and tombstones remain durable so returning to `both` restores the
same authority rather than relearning it. Machine observations may never widen
a person-selected scope. Provisional authority is machine-owned:
it requires a deterministic local inference plus enough aggregate corroboration
to clear both an activation floor and an ambiguity margin. Routine provisional
creation and application require no human confirmation. Material frequency can
support a candidate but can never invent the relation between two forms.

Evidence is deliberately lossy and bounded. Wiki retains only saturating
aggregate counts. Explicitly human observations first enter a recent cohort;
after a bounded number of later human observations they age into a decaying
historical cohort. It stores no passage, node id, tree id, timestamp,
transcript, prompt, model answer, embedding, occurrence list, or source address.
Recent human evidence has more weight than historical human evidence. Existing
trees are not rescanned because persisted nodes do not prove whether their text
was human- or model-authored. Model-generated material contributes zero learning
evidence: it can be corrected by Wiki, but it cannot teach Wiki. Machine
inference counts decay with the same observation clock, including successful
human admissions that produce no candidate, so one early false proposal cannot
remain silently active forever. Only the successful human-admission owner may
advance this clock or submit evidence. Repair, transform, and text-swap paths
receive read capability only.

Negative authority is bounded without sacrificing an older human decision. If
either negative ledger has no room for a new rejection, the decision still
succeeds and a persistent saturation latch disables all further automatic
learning and provisional activation. Explicit human creation, rename, locale
change, removal, and confirmed exact rules remain available. This is the only
honest combination of finite storage and permanent human precedence.

The current weights, activation floor, and ambiguity margin are versioned in
code. They must be calibrated against a representative error corpus before a
provisional mapping is enabled for release; changing them is a scoring-version
decision, not an incidental refactor.

No rule falls back across locales. The same form may resolve differently in
`zh-CN`, `zh-TW`, `ja-JP`, `de-DE`, and `en-US`; an unsupported or missing
locale cannot activate a rule.

## Commit boundary

Matter core does not depend on Wiki. It depends on one neutral material lexical
port whose `capture()` returns an immutable synchronous session. The browser
composition root adapts one compiled Wiki basis to that port; Store retains the
session, never the basis or coordinator. A session may return only ordered,
non-overlapping patches contained by the scenario's eligible ranges; the
neutral port validates and applies them. `MaterialIngress` validates the source
candidate, asks the session once, validates the changed candidate again, and
returns the one command the existing tree engine may publish. The
port does not own storage, network requests, interaction state, history, tree
mutation, or publication.

Replacements inspect only the original input. Output from one rule cannot
trigger another rule in the same commit. Matching is leftmost-longest,
grapheme-safe, boundary-aware, and skips protected literals such as quoted
text, code, URLs, email addresses, paths, flags, versions, IP addresses, and
identifier-shaped tokens.

Human admission, a late repair of that admission, and a generated text turn
must each capture one lexical session for the complete synchronous preparation.
Late repair uses the exact session captured by the admission lease. A change in
another tab may therefore leave an in-flight operation on one complete older
generation, but can never mix generations inside one material command.

The adapter is fail-open but not authoritative. If capture throws or a session
returns a malformed result, the port becomes an identity suggestion and Matter
continues. If a coherent changed suggestion violates the final material
contract, Matter rejects that changed candidate. Wiki can neither rescue an
invalid source nor veto otherwise valid unchanged material.

Elastic expansion is stricter than whole-text replacement. Source-carried
spans remain protected; only ranges proven to be newly generated are eligible
for Wiki. If that projection is ambiguous, it protects more text rather than
guessing.

## Persistence and cache

The durable state is one strict, versioned IndexedDB record for the origin. It
is outside material snapshots and exports. Writes use compare-and-swap against
a write generation, await the complete transaction, and only then publish one
new compiled basis by reference replacement. A failed compile, aborted
transaction, quota failure, or corrupt durable row cannot replace the last
valid in-memory basis. Corrupt data is retained for recovery rather than
silently treated as an empty Wiki.

The compiled dual-channel trie and fitting index are disposable caches. They are bounded by rule
count and total code points, partitioned by exact locale and channel, contains
no evidence scores, and is rebuilt from the validated durable state.
MaterialIngress reads it synchronously; it never waits for IndexedDB or
recompiles on a material hot path. Evidence-only writes reuse the exact trie
until applicable authority changes, and reuse the fitting index until lexeme
identity, scope, or provenance changes. Written-only lexemes never enter the
spoken fitting index. Before hydration or after storage failure,
material uses the empty or last valid basis; only Wiki learning degrades.
One compile is reused for durable publication. A content-free BroadcastChannel
message carries only the newer write generation so another tab can refresh its
own durable record. Observation CAS conflicts rehydrate and reapply the same
logical batch against the newer authority with a strict retry bound; an unsaved
attempt never advances the durable human-turn clock. A candidate exceeding the byte budget is rejected as a
normal capacity result before persistence, leaving current authority ready.

The browser composition owns one Wiki runtime for the lifetime of the origin.
Development Fast Refresh reuses that coordinator and generation channel rather
than creating a second authority beside a Store that captured the first one.
Settings edits retain the state revision observed when an editor opens. A
concurrent write therefore returns `STALE_VIEW`, keeps the local draft, and
requires one visible review against the refreshed entry before a second
commit. Loading, unavailable, and corrupt states never masquerade as an empty
dictionary. A blocked IndexedDB upgrade rejects the current open attempt and
permits an explicit later retry; a native connection which completes after the
attempt was abandoned is closed instead of becoming an unowned cache.

Every persisted state and transition uses an exact-key codec. Domain objects
are projected into their durable shape rather than spread into it, so transient
or future in-memory fields cannot leak into a record that a later strict read
would reject. The bounded settings projection is `O(L + R log R)` for lexemes
and active rules; it never rescans the complete rule set for each visible word.

## Model and privacy boundary

Wiki is never serialized into a model request, system prompt, harness, server
route, provider cache key, telemetry record, material archive, or public agent
action. Server, protocol, and API modules are statically forbidden from
importing Wiki code.

The former transcript-repair `vocabulary` hint was removed rather than reused.
Repair receives one utterance and locale. Local lexical authority is applied
after the response crosses back into the browser-side material boundary.

That prompt field must not return. It had no audio and could only bias a repair
model with words from other material, creating hidden context, privacy exposure,
and a second non-deterministic authority. Native speech phrase bias is a
different capability owned by a concrete recognition adapter. Matter will add
such a port only with a real adapter and corpus proof; it will not be a Wiki
fallback or a repair-prompt surrogate.

## Failure posture

- An invalid or ambiguous provisional rule does not compile or apply.
- A Wiki result that fails the scenario's final policy rejects that candidate;
  it never falls back to publishing the uncorrected generated answer.
- A failed Wiki persistence operation leaves material interaction available on
  the last valid basis and exposes recovery only in the exceptional settings
  surface.
- Correcting visible material is the primary human act. A Wiki persistence
  failure must not undo that correction or turn it into a repeated approval
  flow; it only prevents the new local authority from being claimed as durable.
- No failure path logs the form, canonical text, transcript, entry id, or
  surrounding material.
- Undo owns the complete material command. Wiki never appends a second command
  and never appears as an extra undo step.

## Exceptional correction surface

The default release has no mark revealing that a rule was applied. Only after a
person invokes correction from an erroneous word may the surface reveal what is
necessary to repair that visible occurrence and, if requested, add the corrected
relation as local authority. It must also permit rejecting the responsible
automatic mapping. A deeper Wiki configuration surface opens from Matter
settings for people who choose it. It presents one canonical term per tile and
may add, edit, remove, search, progressively load, and export lexemes. Locale is
inferred from the word and interface language rather than exposed as a picker.
One `Use for` selector controls the lexeme's reversible applicability to voice,
generated text, or both. It does not expose aliases, matcher channels,
confidence, evidence scores, or a routine clear action. Source filters use the
truthful lifecycle labels `Automatically found` and `Confirmed`: editing an
automatic entry promotes it to confirmed authority. The single lossless
personal-data format is `matter-wiki.json`; there is no import UI. Schema V4
stores scope explicitly; strict V2 and V3 migration assigns `both` so an upgrade
cannot silently disable previously applicable authority. Strictly corrupt local state
exposes an explicit reset that rechecks the row inside the write transaction and
refuses to replace data that has become valid. It must not require the person
to understand evidence scores, provisional state, or matcher boundaries.

The implementation exposes capabilities rather than one Wiki service:

- material ingress may capture a read-only lexical session;
- correction may decide or edit one addressed mapping;
- successful human admission may submit one bounded, content-minimal evidence
  batch through a capability no generated ingress can obtain;
- recovery may replace corrupt state through an explicit guarded operation.

These capabilities are not a plugin framework. Personal customization changes
data; release-wide scoring and locale inference remain versioned product policy.

The implemented candidate producer is deliberately narrower than the product
direction: it considers only person-confirmed, single-token Latin lexemes of
7–48 graphemes, uses bounded buckets and one conservative internal orthographic
edit, and abstains on bucket overflow or ambiguity. It is not phonetic matching,
English homophone support, Chinese front/back-nasal support, or automatic
canonical discovery. It remains off by default and may be enabled only with
`NEXT_PUBLIC_MATTER_WIKI_FITTING=latin-conservative` for controlled corpus work.
Release remains gated until representative positive and negative corpora prove
precision, ambiguity rejection, locale isolation, and generated-output
exclusion. Confirmed corrections and the deterministic ingress boundary do not
depend on that gate. Bulk editing, imports, public sharing, vector search,
cross-account sync, and model prompt injection are out of scope.

The same release gate controls both halves of provisional authority: when the
candidate producer is off, persisted provisional rules are also excluded from
the compiled material basis and from the settings projection. This prevents an
older experiment from remaining active after the feature is disabled. Adding a
canonical word in settings alone does not assert an alias and therefore does
not promise an immediate correction. The first public release of automatic
matching remains **NO-GO** until a real visible-error correction path and its
positive and negative corpus receipts exist.
