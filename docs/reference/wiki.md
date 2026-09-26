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

Evidence is deliberately lossy and bounded. Record V5 keeps separate term and
alias ledgers with saturating support and a candidate-local quiet counter. One
successful human admission is one logical clock tick; after a bounded number
of quiet ticks, only the candidate that was absent decays. It stores no passage,
node id, tree id, timestamp,
transcript, prompt, model answer, embedding, occurrence list, or source address.
Existing trees are not rescanned because persisted nodes do not prove whether
their text was human- or model-authored. Model-generated material contributes
zero learning evidence: it can be corrected by Wiki, but it cannot teach Wiki. Machine
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

The 32-admission candidate-local quiet horizon is an evidence-aging clock, not
a user-intent window. It says how quickly one unobserved candidate loses support
without creating a global cohort boundary. One future
interaction owner may classify an exact applied occurrence after bounded
foreground-visible survival, but it never infers intent from generic deletion,
Material Undo or Redo, repetition, a later whole-text diff, or nearby pointer
activity. The current `recent-material` evidence source still has no production
producer. The ordering of authority is fixed: an addressed human decision
bypasses scoring; an automatic proposal must pass both scoring gates; an
ambiguous proposal abstains.

Two deterministic human decision representations are defined. Settings may create, rename,
scope, or remove one canonical lexeme as an explicit local configuration
decision. Domain events can confirm, reject, or replace one exact alias, but no
production surface is yet authorized to emit those events. The latter remains
reserved for the error-local correction path. It must be introduced together
with the UI that owns one short-lived, one-shot attribution token captured when
the rule was applied. That token binds the applied basis and rule to the exact
visible occurrence and current document/interaction epoch; it contains no
surrounding passage and expires instead of reconstructing intent from a later
whole-text diff. Until that complete path exists, Matter does not create an
empty generic decision port or claim that a canonical settings entry corrects
future text by itself.

No rule falls back across locales. The same form may resolve differently in
`zh-CN`, `zh-TW`, `ja-JP`, `de-DE`, and `en-US`; an unsupported or missing
locale cannot activate a rule.

The repository provisions `Engelbart`, `Morphogenesis`, `KFC`, and `[p → q]` as
ordinary automatic lexemes on the first successful local load. On Matter's
current `zh-CN` speech path, that product-owned `[p → q]` starter owns the two
exact spoken aliases `P to Q` and `p to q`; a human-created homograph owns no
such relation. These are bounded product
rules, not approximate pronunciation fitting. The repository also performs that
provisioning as a one-time record-versioned migration for older valid records.
Existing canonical identity, scope, provenance, tombstones, and a saturated
decision ledger win; a migration that cannot fit or commit leaves the prior
valid Wiki readable. Scope filters the hidden aliases instead of deleting them,
so restoring spoken scope restores exact authority. The UI
does not synthesize these rows and recovery restores the same starter state. A
record-V4 repair consolidates the former automatic `en-US` `[p → q]` seed with
its `zh-CN` successor only when its scope, provenance, and relations still prove
that it is product-owned. It abstains around human ownership or unknown evidence.
A one-time compatibility migration replaces a former `Matter` or
`Douglas Engelbart` starter only when the complete four-entry legacy set
remains pristine; any human change disables that migration.

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

The compiled dual-channel tries and fitting index are disposable caches. Each
basis contains the release-selected matcher snapshot and a confirmed-only
fallback. Both are bounded by rule count and total code points, partitioned by
exact locale and channel, contain no evidence scores, and are rebuilt from the
validated durable state. MaterialIngress chooses one immutable snapshot when a
turn begins; it never waits for IndexedDB, reads preference state during a
match, or recompiles on a material hot path. Evidence-only writes reuse the
exact tries until applicable authority changes, and reuse the fitting index
until lexeme identity, scope, or provenance changes. Written-only lexemes never
enter the spoken fitting index. Before hydration or after storage failure,
material uses the empty or last valid basis; only Wiki learning degrades.
One compiled basis is reused for durable publication. A content-free BroadcastChannel
message carries only the newer write generation so another tab can refresh its
own durable record. Burst generations coalesce behind one in-flight refresh;
completion loops only when the published basis still trails the highest seen
generation, and no storage progress stops the loop rather than spinning.
Observation CAS conflicts rehydrate and reapply the same
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

In the current release, Wiki is never serialized into a model request, system
prompt, harness, server route, provider cache key, telemetry record, material
archive, or public agent action. This includes the whole dictionary, a filtered
dictionary, selected canonical terms, and derived pronunciation aliases.
Server, protocol, and API modules are forbidden from importing Wiki code through
either static imports or string-literal dynamic imports, so a later product idea
cannot silently widen today's privacy boundary.

The former transcript-repair `vocabulary` hint was removed rather than reused.
Repair receives one utterance and locale. Local lexical authority is applied
after the response crosses back into the browser-side material boundary.

That prompt field must not return. It had no audio and could only bias a repair
model with words from other material, creating hidden context, privacy exposure,
and a second non-deterministic authority. Native speech phrase bias is a
different capability owned by a concrete recognition adapter. Matter will add
such a port only with a real adapter and corpus proof; it will not be a Wiki
fallback or a repair-prompt surrogate.

Vendor phrase lists, custom vocabulary, contextual strings, and personal text
replacement demonstrate adapter-owned bias or explicit substitution, not a
general right to disclose local lexical state to a model. Matter keeps those
concerns separate. A future bounded lexical-hint adapter remains an open design
question, not a shipped capability or a permanent prohibition. It requires a
separate privacy and prompt-harness freeze covering explicit purpose, minimum
necessary entries, consent and revocation, transport and cache treatment,
provider retention, adversarial tests, and visible evidence that it improves a
real adapter. Until that review is accepted, Wiki correction remains local
after provider output returns and every model payload remains Wiki-free.

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
may add, edit, remove, search, progressively load, and export lexemes. Export
starts a browser download of the strict snapshot; its short control-local
receipt may say that the download started, but must not claim that a browser,
operating system, or person saved the file. Locale is inferred from the word and
interface language rather than exposed as a picker.
One `Use for` selector controls the lexeme's reversible applicability to voice,
generated text, or both. It does not expose aliases, matcher channels,
confidence, evidence scores, or a routine clear action. Source filters use the
lifecycle labels `Automatically added` and `Manually added`: editing an
automatic entry promotes it to confirmed authority. The single lossless
personal-data format is `matter-wiki.json`; there is no import UI. Schema V5
stores scope explicitly and separates term recurrence from alias-relation
evidence into candidate-local ledgers. Strict V2 and V3 migration assigns `both`
so an upgrade cannot silently disable previously applicable authority; strict
V4 migration preserves its existing scope while splitting the former aggregate.
Strictly corrupt local state
exposes an explicit reset that rechecks the row inside the write transaction and
refuses to replace data that has become valid. It must not require the person
to understand evidence scores, provisional state, or matcher boundaries.

Two quiet underlined actions at the lower-right of the main Wiki surface store
local permission for automatic term collection and phonetic fitting. Both
preferences default on and may be turned off independently; the action text
changes from `Turn off` to `Turn on` in place. They live in a strict, versioned
local preference record outside the dictionary export and material history.
Effective automation is always the intersection of that local permission and a
release-qualified runtime capability. A preference cannot qualify a producer,
manufacture an alias, or make an unavailable capability active.

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

Research freezes the next candidate as a local **pronunciation compiler**, not
a fuzzy matcher and not a model feature. It may run only when canonical
authority changes, emit bounded aliases into the existing immutable exact-match
index, and stay absent from the synchronous material hot path. Its first corpus
target is deliberately finite:

- exact Chinese homophones under one pinned locale-owned pronunciation table;
- only the Mandarin final confusions `an`/`ang`, `en`/`eng`, and `in`/`ing`,
  with the rest of the syllable and locale unchanged; and
- exact English phoneme-sequence identity from one pinned, licensed CMUdict
  snapshot, with no grapheme or phoneme-distance fallback.

Polyphones, unknown names, multiple English pronunciations, cross-locale
matches, protected literals, collisions, bucket overflow, and insufficient
human evidence all abstain. A pronunciation resource version becomes part of
the disposable-cache identity; changing it cannot reinterpret durable human
authority or tombstones. No portion is enabled until representative positive,
negative, ambiguity, locale-isolation, protected-literal, generated-output, and
performance corpora pass for the exact compiler and resource version. Until
then the product must not claim Chinese near-sound, English homophone, or
unconfirmed automatic correction as an available capability.

Confirmed corrections and the deterministic ingress boundary do not depend on
that gate. Bulk editing, imports, public sharing, vector search, cross-account
sync, and model prompt injection are out of scope.

The same release gate controls both halves of provisional authority: when the
candidate producer is off, persisted provisional rules are also excluded from
the compiled material basis. Their canonical lexemes remain visible in the
settings projection as automatic entries, without implying that an alias is
active. This prevents an
older experiment from remaining active after the feature is disabled. Adding a
canonical word in settings alone does not assert an alias and therefore does
not promise an immediate correction. The first public release of automatic
matching remains **NO-GO** until a real visible-error correction path and its
positive and negative corpus receipts exist.

## Automatic-learning calibration boundary

`wiki-learning-policy.ts` is the pure domain policy used by V5 evidence aging,
competition, and offline calibration. It has no DOM, persistence, provider,
model, or settings dependency. Runtime projection still supplies no qualified
producer, so consuming the policy cannot activate automatic aliases.

Record V5 separates two facts which the former V4 aggregate mixed:

- term evidence asks whether one canonical word should become a collected Wiki
  entry; and
- alias evidence asks whether one particular local `form → canonical` relation
  may become provisional rewrite authority.

Term frequency cannot contribute to alias authority. A successful human
admission is one logical clock tick and an identical candidate contributes at
most once in that tick. Each candidate owns a bounded quiet counter instead of
sharing a global cohort boundary. Term support uses one bounded integer:

```text
support = min(255, support + one observation)
observed: quiet = 0
absent from 32 successful human admissions:
          support = floor(support / 2), quiet = 0

candidate -> collected at support >= 2
collected -> candidate only at support = 0
```

The first and second independent turns are therefore meaningful immediately at
any position in the product lifetime; no global boundary can erase the second
vote. Thirty-two consecutive quiet human admissions are a candidate-local
far-horizon aging boundary, never an activation requirement. The one-count
retention band prevents a collected term from flickering out at the first quiet
horizon; without new evidence it sinks at the next aging, while stronger
repeated support survives proportionally longer. Fully decayed machine-only candidates
may be evicted only when they have no authority, alias evidence, or tombstone.
Human decisions and product seeds never enter that eviction policy.

Alias evidence is producer-specific. Exact pronunciation producers have
calibration weight `3`; restricted near-sound and internal orthographic
producers have weight `2`; migrated legacy evidence has weight `0`. Activation
score `8` makes the earliest unopposed gates three independent turns for exact
relations and four for restricted relations. Activation margin `4` accepts
exact `3 versus 1` and restricted `4 versus 2`, but abstains on exact `3 versus
2` or restricted `4 versus 3`. Retention uses score `5` and margin `3`; a
challenger never inherits that lower gate. Competition is immediate
counter-evidence, while one addressed human reject or replacement bypasses the
score and becomes durable authority. Production projection currently supplies
an empty qualification set, so adding a classifier to source code cannot
silently grant it runtime authority. A later bridge must consume the complete
qualified producer, resource, and corpus identity rather than reconstructing
authority from a producer id.

These values are versioned calibration candidates, not evidence that a language
producer is ready. The bounded replay harness admits observations only from the
`human-admission` environment. Generated output and protected text produce zero
votes and do not advance the learning clock. Offline producer evaluation
compares one frozen case set lexicographically: false and protected/generated
applications remain the first vetoes, followed by misses, before correct
applications, latency, or transition churn can improve. Producer qualification
separately binds producer, resource, and corpus versions and digests. The
manifest owns the sorted labelled cases and their complete producer inputs; the
receipt supplies only outputs and measurements. Qualification recomputes the
corpus digest and hashes the bounded raw producer and resource artifacts,
requires positive, adversarial, ambiguity,
locale-isolation, protected, generated, and capacity/performance classes, and
fails malformed, incomplete, mismatched, oversized, or duplicated candidates
closed. This verifier does not execute the producer and therefore cannot prove
that a self-reported receipt came from the supplied bytes. A controlled harness
must execute the pinned artifacts and own receipt production before any real
candidate can qualify. Its synthetic unit fixture proves the parser and gate,
not a language capability: no controlled harness, licensed resource, or real
qualification receipt exists, so the release-qualified producer set remains
empty.

Interaction evaluation is a separate labelled corpus. One exact applied
occurrence reaches exactly one terminal state:

```text
pending -> explicit-confirm | explicit-reject | explicit-replace
        -> survived-horizon | censored
```

`survived-horizon` is the bounded form of foreground dwell plus no addressed
reversal. Visible exposure accumulates only while that exact occurrence remains
current and emits once at a corpus-calibrated horizon. It is weak implicit
retention evidence, never human confirmation and never permission to bootstrap
an inactive relation. A later independent application creates another
occurrence; the first one cannot award nested dwell, next-action, and reuse
votes to itself. Hidden-tab time, hover, selection, copy, unrelated edits, page
exit, and generic silence remain censored or invalid proxies. Censoring stays
neutral and is reported with its denominator, so evaluation cannot improve by
manufacturing attribution.

Material Undo and Redo are a separate tree-history system. Wiki neither
observes nor interprets them, and no Wiki authority, evidence, or terminal
metric changes because that history moved. If a material mutation removes the
visible address, the transient occurrence simply ceases to exist without a Wiki
event. A future Wiki reversal, if the product ever needs one, owns a separate
explicit decision, implementation, and persistence lifecycle. It may reuse
strict contract principles but never the material history framework, command
types, stack, or state. Generated output may
receive an explicit addressed human decision, but contributes zero implicit
learning; protected text may never receive an application. The interaction evaluator
reports unsafe attribution, false implicit positives, explicit reject rate,
survived counts, exposure counts, censor rate, and decision latency on a fixed
corpus. It does not turn censored exposure into a failed survival. No arbitrary
energy weights, adaptive optimizer, telemetry, or online reinforcement learning
enters the running product.

V5 persists term and alias evidence as separate bounded ledgers, with
provisional projection still disabled. Legacy aggregate evidence migrates to a
zero-weight producer and therefore cannot acquire authority during migration.
The migration must pass compatibility, cross-tab, capacity, and corrupt-input
proof before any producer or status copy is enabled. Until a real producer
corpus and the later one-shot attribution lifecycle pass, the existing
exact-only UI and empty release gate remain the truthful product behavior.
