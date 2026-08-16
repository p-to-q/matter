# Changes

Append-only. Newest first. A few lines per entry.

Record a change here when it is durable: protocol, rendering model, provider,
privacy, deployment, license, or workflow. A local reversible change belongs in
a PR note. Multi-slice implementation belongs in a plan.

Format:

```text
## YYYY-MM-DD — one line
Changed:    what is now true
Why:        the reason, not the restatement
Forecloses: what this makes harder or impossible
```

---

## 2026-08-17 — E2E output has one exact owner

Changed: the browser-proof wrapper now records one canonical process-and-token
owner and removes a lock only when both its owner record and inode still match.
A dead owner fails closed for explicit cleanup instead of starting an automatic
stale-lock transaction. Cleanup errors remain visible without replacing the
browser process's failure result.

Why: clearing a stale generated directory is safe only when no second runner can
acquire it at the same time. A PID prefix, automatic stale deletion, or
unconditional release could make two proofs share one build output; the smaller
fail-closed rule removes that race without creating another locking subsystem.

Forecloses: permissive lock metadata, automatic recovery of an ambiguous owner,
concurrent mutation of `.next-e2e`, or a cleanup fault making a failed browser
run appear to have failed for another reason.

## 2026-08-17 — Canvas ruling shares the material camera

Changed: the leaf-off ruling is now one full-paper render layer whose repeated
cell origin, span, dash rhythm, and open intersections move and scale with the
same camera as material. Its cell width remains exactly the existing online
column width plus gap; the taller vertical rhythm and custom `1.4px` filled
dashes use softened Bézier ends rather than a native round stroke, adding
orientation without changing any material box. Direct hover
or keyboard focus now reveals one frosted field that prefers the passage's
upper-left edge and falls back to another collision-safe side. Its Branch/Focus
actions reveal in the same frame, with Show all as the focus-view projection.
The material index keeps its active/normal/faint hierarchy while raising the
two quiet text tiers and its selection and drawer controls to readable text
and non-text contrast. On narrow paper, the index entry and Matter menu now
share one right-hand instrument axis and one icon scale.

Why: a screen-fixed or separately phased ruling stopped reading as one canvas
during movement. Balanced complete dashes and a transparent joint at every
crossing keep the texture quiet and deterministic, while the first vertical
action capsule exposed icons without the local softened field the interaction
needed. The earlier quiet index tiers fell below readable small-text contrast.

Forecloses: fitting material to decorative lines, persisting camera/grid state,
mounting a toolbar per node, or letting the auxiliary field become another tool
catalog or material mutation path.

## 2026-08-16 — Leaf-off paper exposes structure and one local action lens

Changed: turning leaf atmosphere off now reveals one low-contrast, solid-line
structural ruling fixed to the paper and aligned to the derived column rhythm.
One collision-safe action lens is delegated across every active canvas passage:
full view exposes the existing Branch and Focus intents, focus view exposes Show
all, and coarse pointers receive 48 px actions after selection. Its placement
measures the actual first text line rather than the passage column; ArrowRight
enters its vertical keyboard actions and Escape returns to the passage. Precise
gestures, pending work, held material, canvas chrome overlays, stale material,
and unsafe adjacent space suppress the lens.

Why: the blank FX-off paper lacked spatial orientation, while reaching only for
the fixed rail made a precise passage feel unnecessarily remote. One paper layer
and one measured lens add locality without changing material geometry.

Forecloses: treating the ruling as authored coordinates or snapping, mounting
controls per node, using a hover `×` for deletion, or creating a second tool
catalog outside the current revalidated intent path.

## 2026-08-16 — Directory disclosure no longer reads as subtraction

Changed: the material index again uses `›` / `⌄` as its default branch control.
The context `−` is a trailing action revealed by hover or direct focus; current
selection exposes it only on coarse pointers that have no hover. A held branch
replaces its disclosure with a persistent `+` recovery handle. Directory
disclosure never changes working context. Chevron, plus and minus restore the
original 11 px / 1 px icon proportion; the 1 px relationship rail leaves 8 px
at a glyph endpoint and 6 px at a blank leaf endpoint. Select retains the same
guide axis and keeps its 11 px checkbox in the disclosure slot without moving
titles. At narrow widths, both action columns expose a real 48 px pointer target
without changing that shared axis.

Why: a permanent `−` on every row made the initial material read like a list of
pending removals and made relationship guides compete with context controls.

Forecloses: using one default glyph for both directory disclosure and model
scope, or hiding the only recovery action for held material.

## 2026-08-15 — Working context can hold material aside

Changed: the material index now uses `−` and `+` to temporarily set aside or
restore a complete material branch for the active working context. The branch
remains readable but is excluded from canvas interaction, lasso measurement, and
Ask Matter's bounded projection; its descendants close and reopen with the same
control in the left index only.

Why: a person needs to narrow what Matter can read without hiding, deleting, or
rewriting their material.

Forecloses: treating index disclosure as model scope, persisting a second
visibility model, or sending held-aside ids as a hidden inquiry channel.

## 2026-08-15 — Ask Matter does not replay finished replies

Changed: closing or reloading Ask Matter now opens a clean inquiry composer.
The answer shown during the current opening still has its pending-dot,
grapheme-reveal, and terminal-punctuation presentation; a saved completed
exchange is not re-injected into that UI.

Why: reopening into an old answer turned the small orientation surface into a
visible chat residue, including text that was no longer the person’s current
question.

Forecloses: a persistent transcript behind the inquiry trigger, or treating a
storage record as a second render authority.

## 2026-08-14 — Ask Matter restores its original frame while keeping text arrival

Changed: the closed Ask Matter surface again uses its original input, frame,
alignment, and short entry transition. Pending work starts with one `.` then
uses a fixed-width `.. ↔ ...` dot cycle. A completed answer still becomes
readable by grapheme and settles its existing or locale-appropriate terminal
stop; this is text presentation only.

Why: the presentation layer changed the familiar inquiry surface instead of
making a confirmed local improvement. The confirmed text rhythm remains useful,
but the original frame preserves the established inquiry behavior without
changing its record or wire contract.

Forecloses: treating render-only animation as an authority for the inquiry text,
or widening the surface with a scaled frame or new visual system before a
tested visual direction exists.

## 2026-08-13 — The pool probe speaks the deployed repair contract

Changed: the generated cross-surface deployment probe now sends
`transcript-repair/4`, matching the strict repair route and its source prompt.

Why: a stale `/3` probe was correctly refused by the `/4` route but could be
misread as a model-pool or repair outage during release verification.

Forecloses: accepting old prompt contracts at the route, weakening strict wire
parsing, or treating an operational probe as independent protocol authority.

## 2026-08-13 — Repair gains evidence-backed redraft; the rail returns to Undo only

Changed: transcript repair now distinguishes a narrow lexical correction from
an evidence-backed faithful redraft. The prompt boundary is
`transcript-repair/4`; stronger edits require spoken scaffolding and preserve
numbers, units, stable identifiers, vocabulary, speaker, modality, relations,
question type, and claim order. The right editing rail no longer displays Redo.
Exact Redo remains available through `Cmd/Ctrl+Shift+Z` and `Ctrl+Y`, backed by
the same persisted inverse journal.

Why: spoken language sometimes needs a real local redraft rather than a final
period, while a global rewrite budget would transfer authorship to the model.
The visible rail needs one quiet direction of retreat without taking away the
platform safety convention for reversing an accidental Undo.

Forecloses: free style polishing at admission, model-authored facts or logic,
locale-blind numeric replacement, a visible Redo rail tool, and snapshot-based
history restoration.

## 2026-08-13 — Ask Matter answers arrive as bounded material feedback

Changed: the existing, closed Ask Matter bubble now presents a pending request
as three visual dots, then reveals a terminal answer with a short elastic
entrance. Its visual frame begins slightly larger around the growing text, which
remains centred before the frame settles to normal; stacking remains native
layout. Terminal punctuation is briefly withheld while the answer becomes
readable and then restored or lent by locale. The canonical response, request
protocol, record, and material tree are unchanged.

Why: an answer arriving all at once gave no sense of local material becoming
present, while a transform-only scale or a second text model would let frames
and words desynchronize as the small stack changes width and height.

Forecloses: server token streaming in this surface, durable partial responses,
using animation state as inquiry authority, a permanent transcript UI, and a
game-derived visual skin.

## 2026-08-12 — One provider foundation no longer means one failure domain

Changed: thought labels and transcript repair still share one server-only model
registry, credential boundary, transport, and prompt harness, while each
scenario now owns its mutable candidate-health lane. A label request keeps one
deadline through headers, bounded body, decoding, parsing, and validation. The
browser independently revalidates and adjudicates every returned label, sheds
after bounded upstream fallback, cancels obsolete material bases, and refuses a
stale cached model name before it can appear. Cache restoration is scoped to a
document epoch and generation, so an older load cannot release a newer restore
barrier. Oversized or stalled response bodies cannot hold a request lane, and a
manual name releases its cancelled lane immediately. Deterministic labels and
local repair rules remain the complete provider-free paths.

Why: repair and labels have different latency contracts and product authority.
A short repair stall used to reorder label candidates, a label success could
erase repair's cooldown, and a stalled label body could occupy every browser
request slot. The server was also the only semantic judge of a label despite
the browser being the last boundary before presentation and persistence.

Forecloses: merging the two APIs, sharing their business caches, treating one
scenario's latency as another's health, trusting a server label because its
envelope is valid, retaining obsolete requests, adding provider status UI, or
turning a navigation label into the durable canvas title.

## 2026-08-12 — Repair reveals changed ink, not a changed paragraph

Changed: the repair command remains atomic, but its bounded presentation now
diffs canonical before/after text by grapheme. Stable language never animates;
after a 160 ms recognition beat, only inserted or replaced units arrive in
reading order. Deletion-only repair cues one adjacent seam glyph. At most 64
timing units complete below 800 ms, while reduced motion presents the final text
whole.

Why: a whole-passage fade says that something happened but hides what changed.
The person needs enough time to register the heard baseline, then see the exact
language Matter restored, without turning provider latency into a fake stream or
letting animation become a second text model.

Forecloses: animating unchanged language, token streaming into the tree,
per-character commands, an old-text overlay, unbounded typewriter duration, or
using visual fragments as selection, accessibility, history, or persistence
authority.

## 2026-08-12 — Repair's live budget and visual signal match its real role

Changed: one managed repair now receives six to eight seconds inside the
twelve-second material lease, with 95% of that budget available to the first
relay. The browser ceiling is 8.8 seconds and still covers the entire bounded
response body. A committed result settles only the glyph color for 240 ms;
selection fill, focus outline, geometry, and hit targets remain visually steady.
Its feature-local owner tolerates React development effect replay and disposes
retained before/after text only after the final lifecycle release.

Why: two deployed short-utterance probes exhausted the former 2.6-second floor
before the production relay answered, so the managed level existed in health
metadata but not in the user journey. The old whole-button opacity also faded
interaction chrome together with text, making a correction look like focus or
selection instability instead of new ink settling into material. The first
effect cleanup also used to terminally dispose a memoized presentation owner,
so development Strict Mode could erase the feedback before any repair arrived.

Forecloses: calling a configured health gate proof of a working model, spending
the repair lease on retries, letting a late result outlive the lease, or using
focus/selection flicker as correction feedback.

## 2026-08-12 — Repair earns its second material change

Changed: a heard transcript is still committed immediately, then an ordered,
locale-exact rule pipeline and one optional managed proposal compete to produce
a single repair command. The baseline remains visible for at least 650 ms. The
rules cover high-confidence punctuation, filler residue, ASR echoes and
stutters, exact restarts, explicit correction shapes, dictated addresses,
bounded unit forms, casing, and mixed CJK/Latin spacing while protecting
literals and semantic facts. The managed level may remove contextually empty
scaffolding and abandoned speech, adopt a later correction, and lightly settle
forced grammar without changing a claim. Short CJK utterances may now reach the
managed path; the browser and store judge a model only against the recomputed
rule floor.

Why: the prior material path never called the existing repair route, most local
inputs therefore changed only by terminal punctuation, short Chinese thoughts
were excluded by a Latin-sized threshold, and safe rule deletions were charged
again when a model candidate was revalidated. Mature dictation systems use a
staged cleanup pipeline; Matter needs the same engineering separation without
adopting their silent rewriting authority.

Forecloses: blocking admission on a model, treating repair as one unconstrained
rewrite budget, replaying token streams into material, caching transcripts or
outputs, retrying a late proposal, or exposing provider/cache status in the UI.

## 2026-08-11 — Ask Matter distinguishes a timeout from a busy application

Changed: the browser reads the bounded, exact inquiry error envelope and maps
only its closed fallback receipt to localized terminal copy. A timeout,
temporary model failure, application admission busy, and an unsent request are
separate outcomes in the bounded local inquiry record. Unknown or malformed
429/503 responses fail closed as unreachable; server and provider prose is
discarded.

Why: the live preview returned `MODEL_TIMEOUT` after its provider budget, but
the browser classified every 503 as busy. That made a configured health gate
look like a contradictory dependency receipt and gave the person the wrong
recovery instruction.

Forecloses: status-only refusal classification, treating the health probe as a
relay monitor, persisting unparsed provider detail, or showing a gateway 503 as
proof that Matter received the question.

## 2026-08-11 — Transcript correction settles as material, not status

Changed: local repair computes beside the baseline paint gate but may commit
only after it. A successful repair returns a private, exact before/after receipt
to a bounded per-node presentation owner; the complete canonical text then
performs one short opacity settle. Store state, persistence, history, archives,
context, rejected repairs, Undo/Redo, reduced motion, and forced colors do not
replay or expose it.

Why: a person should notice that heard text was corrected without seeing a
spinner, breathing draft, duplicated text layer, or paragraph retyped one
character at a time. Keeping the final DOM text whole preserves selection,
shaping, layout measurement, focus, and accessibility.

Forecloses: a repair status surface, infinite pulse, old/new semantic overlays,
per-character DOM wrapping, and animation as a second source of truth.

## 2026-08-11 — Voice admission precedes detachable local repair

Changed: a final transcript commits and paints immediately. A lifecycle-local
repair port may settle one conservative candidate within twelve seconds; an
opaque store capability, store-owned clock, document epoch, exact node memento,
and semantic floor gate a separate `source: "repair"` command. Every terminal
path consumes the capability, and admission and repair remain separate undo
steps across reload. The store atomically rejects an admission from an earlier
document epoch and generates capability identity itself rather than trusting a
caller command id to be globally unique.

Why: speech should become material as soon as transcription finishes, while
small recognition artifacts can still disappear without making a network call
or granting a late worker authority over material the person has changed.

Forecloses: blocking admission on repair, exposing model/cache status in the UI,
restoring repair authority through Undo/Redo, trusting caller timing, or letting
light cleanup become silent interpretive rewriting.

## 2026-08-11 — Ask Matter retention is not a user-managed surface

Changed: the inquiry no longer exposes a Clear record control. Retention still
lives behind the existing repository boundary, but record management has no
first-release UI, navigation, or visual language.

Why: the retained exchange is a quiet continuity mechanism, not a log product.
Giving it a management action turned a secondary orientation surface into an
interface for storage rather than material.

Forecloses: treating Ask Matter as a transcript manager, while preserving a
future system/account adapter's ability to manage the record outside this
surface.

## 2026-08-11 — Matter names its actual interface

Changed: public, in-product, and repository copy now calls Matter an interface
for unfinished thought, not a brain-computer interface. The product promise is
one rooted, reversible thought-growth loop; the saved Ask Matter record remains
an internal persistence boundary rather than a new product surface.

Why: the running web product uses ordinary voice and gesture, not neural input.
Calling it BCI made the product sound more technically exotic while hiding the
actual differentiator: precise authorship over one material change.

Forecloses: using hardware-adjacent language as a substitute for a clear
interaction contract, or turning a local persistence detail into a chat surface.

## 2026-08-11 — First voice use waits for a real transport, never for permission by surprise

Changed: hydration now prepares the selected voice transport before its first
pointer activation. Browser speech constructs one unstarted recognition lease;
the recorded-audio path waits for a bounded worker code-graph handshake. Neither
path can request permission, capture audio, decode a recording, invoke Whisper,
or download a speech model until an actual voice turn. Browser speech start also
has a bounded watchdog.

Why: the old first turn combined capability discovery with the only pointer a
person had offered. A slow worker or browser recognition that never started
made that first action feel lost or remain in a waiting state with no outcome.

Forecloses: using eager microphone permission or a speculative model download
as a warm-up mechanism, and leaving a first browser recognition attempt
unbounded.

## 2026-08-11 — Ask Matter record is an explicit local exception

Changed: top-level product and engineering contracts now name the bounded Ask
Matter record as a clearable local exception. It survives reload only behind
the existing inquiry surface; it never becomes material, undo history, archive
content, or later model context.

Why: a durable behavior cannot be left implied by lower-level storage code. The
record is useful orientation, not a second knowledge system or a conversation
authority beside the tree.

Forecloses: a hidden chat transcript, implicit retrieval from prior answers,
and ambiguity about whether an inquiry can alter material authority.

---

## 2026-08-11 — Reversibility and Ask Matter records have separate durable boundaries

Changed: material history now keeps unlimited local undo and redo stacks through
reload, while completed Ask Matter exchanges live in a separate, bounded,
generation-checked per-tree record with one clear action inside Ask Matter.

Why: a person must be able to return to the state before the first local change
and move forward again without a snapshot swap. Inquiry can be worth returning
to, but making it material history, archive content, or implicit model memory
would give a secondary orientation surface authority it does not have.

Forecloses: silently dropping old local inverses, a redo that cannot survive a
reload, and a durable chat transcript that becomes hidden retrieval.

---

## 2026-08-10 — Resetting a manual name is durable or visibly unfinished

Changed: removing a manual label now returns the same typed storage receipt as
writing one. The automatic label resumes only after the delete reaches disk;
when it fails, the editor remains available for retry instead of presenting a
reset that reappears after reload.

Why: a durable manual name is a human decision in both directions. Treating its
deletion as best effort restored the exact silent-loss shape preview.19 removed
for writes.

Forecloses: a successful-looking reset whose old manual name returns after a
reload, and a separate untyped failure contract for delete versus write.

---

## 2026-08-10 — Large-tree timing stays honest without becoming a launch veto

Changed: the fixed 2,000-node receipt continues to record pointer-to-paint and
long-task cost against the existing `<100 ms` target. Missing that target opens
optimization and diagnosis work, but does not by itself block a release or force
a smaller claimed product bound.

Why: performance work is continuous. Treating one diagnostic threshold as a
release veto encourages either a premature rendering rewrite or a softened
measurement, while treating it as unimportant hides a real experience cost.
The target stays fixed so progress remains comparable; the release decision
still weighs the complete product path and its actual evidence.

Forecloses: lowering the threshold to manufacture a pass, silently deleting the
measurement, or making one benchmark result the authority over product launch.

---

## 2026-08-09 — A refused answer is not a broken relay, and a stall is not a refusal

Changed: `runScenario` no longer counts an adjudication rejection toward the
provider cooldown, and the pool grades a candidate that spent its whole attempt
without answering as reaching the cooldown threshold in one event rather than
two. A candidate that refuses quickly still needs two.

Why: both conflated a fact about one request with a fact about a relay. Three
refusable requests in a row — a tight bound, a sibling set with no room left —
took a whole surface off a live provider for the cooldown, for every person on
that instance, and the next person waited for a floor that was always there.
The pool made the mirror-image error: a relay that hangs and one that refuses in
200 ms cost the caller very different amounts, and were recorded identically, so
one stalled relay kept its place at the front of the order and spent the next
caller's deadline too. Measured in production, where which surface answered
flipped between runs while the code did not.

Forecloses: treating any per-request verdict as provider health, and any pool
ordering that cannot tell a slow relay from an unavailable one.

---

## 2026-08-09 — The load window enters conflict instead of picking a winner

Changed: material committed between mount and the first IndexedDB read no longer
resolves against stored material by revision. Divergence raises the same
explicit conflict a second tab already raises, and neither version is written
over the other.

Why: a revision is monotonic only inside one lineage. The live tree in that
window descends from the seeded document and the stored tree descends from the
last session, so comparing their numbers compared nothing. Both directions lost
material silently: a stored r6 beat a live r6 and the sentence just spoken
disappeared, and a live r7 beat a stored r6 and the whole prior session did.

Forecloses: any rule that resolves two lineages by arithmetic, and any silent
choice between two versions of a person's material.

---

## 2026-08-09 — A name that did not reach disk is not reported as kept

Changed: label writes return a typed receipt. A manual name whose write failed
returns to its editor with what was typed still in it; a model label ignores the
receipt exactly as before. The read cap keeps manual rows ahead of cache rows.

Why: the repository swallowed every storage failure and resolved, so the driver
published the name as committed. A person typed a name, saw it, reloaded, and it
was gone — with nothing having reported a failure. Losing a model label costs a
regeneration; losing a name costs a decision, and the two shared one best-effort
API. The read cap had the same shape: it cut in index order, so a manual name
could be dropped in favour of a label that regenerates for free.

Forecloses: a storage failure that presents as success, and a cache policy
evicting something that cannot be recomputed.

---

## 2026-08-09 — The architecture fitness rules are executable

Changed: `npm run check:architecture` holds four rules over the static import
graph — layers point inward, a wire contract does not import either side of its
wire, only server code reaches the model pool, and there are no cycles. It runs
inside `npm test`. The three recorded exceptions were cleared first: the seeded
document moved from `fixtures/` to `material/`, the wire contracts moved from
`server/` to a neutral `protocol/`, and the two voice transports now share a
`voice-port` module instead of importing each other.

Why: `docs/engineering.md` already said a stable dependency rule belongs in
`npm run check` rather than in prose. It stayed prose because the tree had
exceptions, and a check that fails on the day it lands is a check someone
silences. Type-only edges are not counted: they are erased before anything runs,
and the rule is about the runtime graph.

Forecloses: an architecture document that describes an aspiration, and a
dependency rule whose final enforcement is whether a reviewer remembers it.

---

## 2026-08-09 — A label's budget is sized for a cold connection

Changed: the thought-label budget rises from 6 s to 12 s, with the browser's
bound at 13 s.

Why: measured against the deployed origin, an inquiry with an 8 s attempt
answers in 1.3-2.2 s while a label with a 3 s attempt spends its whole budget
and falls back — the same pool, the same relays, the same function. The first
call from a cold function pays the connection before it pays the model, and
only the wider budget survives that. Repair keeps its short budget on purpose:
a person is holding still for repair, and admitting the words as heard is the
better answer there. Nobody waits for a label.

Forecloses: reading a fallback as a model that could not answer, when it was a
connection that had not finished opening.

---

## 2026-08-09 — A branched thought carries its own identity and time

Changed: the Branch action takes a node id and an ISO timestamp from the
composition edge instead of deriving them from the tree revision and a build
constant. The dead fixture text-replacement action left the production store.

Why: every node anyone branched was written with `2026-08-03T08:10:00.000Z` as
both `createdAt` and `updatedAt`, and that reaches exported Markdown
frontmatter. A person's material recorded a moment that was not theirs, and
ordering material by time was wrong wherever they had used the tool.

Forecloses: a pure command inventing identity or reading a clock, and a
production store surfacing a fixture mutation nothing calls.

---

## 2026-08-09 — Material clears the rail at every phone width

Changed: the narrow material column now starts below 390px rather than at
340px.

Why: between those widths the 280px column ran under the fixed editing rail —
18px at 341px, 8px at 360px, 1px at 375px, flush at 376px. Galaxy S8 and
iPhone SE sit inside that band, so material was drawn beneath the controls on
two of the most common widths a person holds. The band had never been measured;
it now has a browser receipt across eight widths.

Forecloses: a responsive boundary whose only evidence is the stylesheet.

---

## 2026-08-09 — An unanswered inquiry says why it could not answer

Changed: the inquiry error envelope carries `fallbackReason` — the same
field, and the same stable vocabulary, that label and repair already publish.

Why: inquiry is the one surface with no floor, so its failure is the visible
one — and it was a single opaque 503. Nothing outside the function could tell a
relay that stalled from one that refused, was busy, or answered something the
adjudicator would not use, which is why a live production failure stayed
unmeasurable.

Forecloses: diagnosing a released model surface by guessing, and a provider
message, status, or identity reaching the browser in the name of diagnosis.

---

## 2026-08-09 — A short utterance buys one real repair attempt, not two halves

Changed: transcript repair keeps almost its whole budget for one relay instead
of reserving half for a second, and its floor rose from 2.0 s to 2.6 s.

Why: repair's budget is deliberately short because a person is holding still
while it runs. Halving two seconds did not buy a fallback; it bought two
attempts neither of which could finish from the deployed region, so every short
utterance was admitted exactly as heard. Where the floor is already correct,
one real attempt is worth more than two doomed ones.

Forecloses: reading the pool's fairness rule as scenario-independent when the
scenario's budget is smaller than one relay's answer.

---

## 2026-08-09 — Lasso ink belongs to the paper; the field keeps only its echo

Changed: the drawn stroke is clipped to the paper's own rounded rectangle, so
past that edge a person sees only the square particle echo, now drawn in the
field's ink and fading back from the pointer along the stroke.

Why: the line was drawn across the material index and the surrounding chrome,
which reads as though the index were selectable document space. It is not, and
it never was: hit testing was already limited to visible canvas text.

Forecloses: a stroke that looks like it addresses anything outside the paper,
and a clip that could quietly narrow selection — the geometry below the clip is
untouched, so the same stroke selects the same passages.

---

## 2026-08-09 — One relay can no longer spend the whole pool's deadline

Changed: a pool attempt is bounded to half of the caller's deadline, except for
the last candidate, which keeps the remainder. The label, transcript-repair,
and inquiry budgets were raised to hold two attempts instead of one, and the
three model routes now declare a platform duration above their own deadline.

Why: the relays answer in about a second from a workstation beside them and far
more slowly from the deployed region. An attempt was allowed the entire
deadline, so the first relay to hang consumed the budget alone and the ordered
fallback the pool exists for never happened: every deployed call fell back to
the floor, and inquiry — the surface with no floor — returned unavailable.

Forecloses: reading a green health receipt as evidence that a released AI
surface answers, and a single slow relay deciding the outcome for the pool.

---

## 2026-08-09 — Cancelled on-device speech cannot occupy the next turn

Changed: the lazy Whisper worker now distinguishes a queued cancellation from
active inference. Queued work is skipped; active inference retires its worker,
rejects that lease's pending requests, and makes late worker messages inert.
The next transcription creates a fresh worker only when needed.

Why: cancelling the Promise without cancelling or retiring its worker left a
dismissed recording consuming CPU and serial-queue time before the next voice
attempt could begin.

Forecloses: a cancelled utterance delaying later speech, treating a late result
as current material, and keeping raw audio or a transcript beyond its attempt.

---

## 2026-08-09 — Production configuration makes all released model gates explicit

Changed: the dedicated-domain runtime configuration now declares the existing
live label, transcript-repair, and inquiry gates together. The repository's
configuration and deployment receipts require all three to report `available`;
the model pool endpoint and credentials remain exclusively encrypted Vercel
environment variables.

Why: a release that can silently omit the inquiry gate presents the product as
having an answer capability while its browser can only receive an unavailable
result. The gate is not a secret and should be reviewed with the rest of the
runtime deployment shape.

Forecloses: shipping a root-domain preview that has a live model pool but leaves
one released AI surface disconnected without a failing configuration or
deployment check.

---

## 2026-08-09 — Inquiry answers keep their material scope, not a render identity

Changed: the transient Ask Matter bubble compares its projected, bounded
selection-or-tree context before it clears a pending request or visible answer.
A parent render may replace the projection callback while the underlying
material remains identical; that implementation detail no longer throws away a
reply. New questions still follow the existing no-memory contract, and a real
material scope change still clears the temporary thread.

The public and archived dependency graphs now pin `nanoid` to `3.3.17`, which
removes the reported high-severity transitive advisory without widening any
runtime dependency range.

Why: inquiry is a bounded, non-persistent reference surface, but a React
callback identity is not a change in the material someone asked about. Dropping
an answer on that boundary made the interface appear to retract language the
person had not had time to read. The dependency repair protects the public
repository and deployed runtime from a known transitive defect while preserving
the existing Next/PostCSS compatibility contract.

Forecloses: treating render churn as a material change, retaining a hidden chat
history after its actual scope changes, and knowingly shipping the affected
`nanoid` version from either public lockfile.

---

## 2026-08-08 — The model gates open, and the surfaces behind them tell the truth

Changed: labels, transcript repair, and Ask Matter run against the live pool on
`matter.ptoq.io`, configured as encrypted Vercel production variables, so the
deployed origin and a local `.env.local` now carry the same three gates.

Six surfaces behind those gates were corrected first, because opening a gate is
what makes them reachable. Admission no longer substitutes English spoken
punctuation: "period" and "comma" are ordinary nouns, and no lexical rule can
tell a dictated command from the word itself, so "during that period we
shipped" was being admitted as "during that.we shipped". CJK substitution stays
and now skips a punctuation word that follows a determiner. A refused inquiry
reports being rate-limited or shed rather than never sent. A label queue dropped
on cooldown releases its session entries instead of stranding those rows
permanently. Enter and Escape yield to an IME composition wherever they commit
or discard, which includes the durable canvas title. The material index is
localized, so the only signal that saving stopped is readable. `<html lang>`
follows the canvas language. A modal's inert set is live rather than a snapshot
and now covers the docked material index. Voice reports a navigation
restriction as one instead of as a missing capability.

Why: a truthful floor is what makes a failing provider harmless, and every one
of these surfaces was either untruthful or unreachable in exactly the states a
live provider produces. Enabling a model first would have shipped them.

Forecloses: rewriting a person's wording on the human admission path, telling
someone a received question was never sent, a cooldown that costs rows their
label for the rest of a session, committing an IME pre-conversion buffer as
durable material, and an aria-modal dialog with a reachable background.

## 2026-08-08 — The deployment build shape is configuration, not a command prefix

Changed: `vercel.json` declares the dedicated-domain build shape in `build.env`
and its server-read subset in `env`, and `buildCommand` is now `npm run build`.
`npm test` checks that file: the build command stays inside Vercel's 256-character
schema bound, both shapes carry every value their side actually reads, and no
credential-shaped key or value appears in a world-readable file. The repair and
inquiry gates return to owner-controlled encrypted environment variables so the
handoff's labels-then-repair-then-inquiry order stays possible; the label gate
stays declared as before. `npm run check:deployment` also runs for the first
time: its retry clock defaulted to an unbound `performance.now`, so the real
release gate threw before probing anything while its tests, which all injected a
clock, passed.

Why: carrying seven assignments as an environment prefix inside `buildCommand`
grew that string to 340 characters. Vercel rejected the deployment during schema
validation, before any build step, so eight consecutive production deployments
failed with no build log and `matter.ptoq.io` silently stayed on Preview.7 while
source, tags, CI, and local receipts all stayed green. A deployment constraint
that only exists in a maintainer's memory is not a constraint.

Forecloses: expressing build configuration as command-line syntax, a release
whose deployable shape is only proven after a deployment attempt, committing a
provider key to `vercel.json`, and enabling all three model gates at once from
repository configuration.

## 2026-08-08 — Preview.12 keeps voice feedback below material

Changed: recording feedback now claims one measured material lane beneath its
selected passage. With no selection it anchors beneath the seeded first passage;
if that passage is unavailable it falls back to the first visible first-level
passage. A conservative pre-measure reservation and a one-column width prevent
the feedback controls from crossing into text or a right-hand branch. Ask Matter
keeps its visible pointer button, while plain Enter is an IME-safe shortcut for
the same bounded request; Shift+Enter remains a line break. Closing the inquiry
clears its transient exchange.

Why: live transcription should read as a small continuation of the material,
never as an overlay that hides it. Keyboard support should accelerate an
available pointer action without becoming the primary path or corrupting CJK
composition.

Forecloses: canvas-origin feedback, post-paint overlap repair, a keyboard-only
Ask action, duplicate pending inquiries, and a closed inquiry retaining a
visible conversation history.

## 2026-08-08 — Preview.11 corrects the source-release verifier

Changed: the lasso browser verifier and the editing rail now give active lasso
and Canvas pan modes the same re-click-to-exit contract. The Vercel
configuration also enables the live label gate once a server-only pool is
configured, while the exact Preview.11 version remains an ignored build until a
permissions holder completes deployment controls.

Why: a source prerelease must not retain a test that asserts the behaviour it
just intentionally removed, and deployment configuration should expose every
already-bounded server scenario without publishing credentials or promoting an
unreviewed build.

Forecloses: hiding a mode change behind a stale test name, enabling a browser
model credential, or accidentally making this source candidate production.

## 2026-08-08 — Preview.10 remains a source prerelease

Changed: the exact `0.2.0-preview.10` package version remains Vercel's
ignored-build version. Its `main` commit and immutable GitHub prerelease can be
published for review without replacing the dedicated-domain production
deployment.

Why: the interaction and durability candidate has a complete local verifier,
but production promotion still requires its own owned deployment receipt.

Forecloses: silently turning a GitHub prerelease into production deployment,
claiming a local/browser receipt verifies live provider controls, or moving the
immutable preview tag later.

## 2026-08-08 — Selected admission becomes structural descent and undo survives reload

Changed: recording under a selected visible passage now commits the transcript
as that passage's child; without a selection it remains a first-level thought.
Lasso and Canvas pan are explicit, re-click-to-exit modes, so a completed
single-passage selection keeps its stretch handles after either mode exits.
Every local material commit
now writes its exact inverse journal atomically beside the IndexedDB snapshot;
reload restores only a chain that can be validated all the way back to the
stored document baseline. The material index carries every actual tree depth,
so a title's subtitle is visibly one step below its parent.

Why: the visual hierarchy must agree with the authored tree, every active tool
must have one discoverable exit gesture, and undo must remain trustworthy after
the browser has been closed or refreshed.

Forecloses: treating a selected passage as a sibling insertion target, silently
dropping old undo entries in normal operation, or claiming that an archive or a
pre-journal legacy snapshot can recreate commands it never stored.

## 2026-08-08 — Cold material reveals only after geometry is valid

Changed: a newly opened or restored document keeps only its root passage visible
while the rendering edge measures language. Descendants remain measurable but
invisible and inert until the first valid geometry publication; later changes
within the same document do not reopen that reveal gate.

Why: unpositioned absolute nodes otherwise share the root origin for a frame,
turning loading into an illegible pile of language.

Forecloses: a spinner or loading card over the paper, delaying the initial
bundle to disguise layout work, flashing the whole tree on every edit, and
migrating titles or language in non-fixture documents.

## 2026-08-08 — Admission feedback occupies temporary layout space

Changed: the rendering edge measures the live recording feedback and reserves
that height beneath its target passage. The document title remains metadata,
while the same phrase may also exist as first-level material alongside future
first-level passages.

Why: an absolutely positioned recording status could overlap the next branch,
and removing a first-level passage merely because it repeats the document title
would erase a real structural role.

Forecloses: persisting recording chrome in the tree, using a guessed fixed
feedback height, and treating the document title as the tree's only first level.

## 2026-08-08 — Preview.9 publication does not promote Vercel production

Changed: the exact `0.2.0-preview.9` package version exits Vercel's ignored-build
step successfully. Its `main` commit and immutable GitHub prerelease may be
published without replacing the dedicated-domain production deployment; a later
package version resumes the normal build path automatically.

Why: the source candidate is ready for maintainer review, while live provider
credentials, distributed rate rules, and spend ceilings still need an owned
deployment receipt. Source publication and production promotion are separate
decisions.

Forecloses: accidentally shipping an unconfigured live-provider surface with
this prerelease, permanently disconnecting the Vercel project, or moving an old
release tag after production configuration catches up.

## 2026-08-08 — Persistence failure remains recoverable from a closed drawer

Changed: quota exhaustion is distinct in the material index, marks the narrow
drawer handle while it is closed, and opens the existing archive surface with
export and explicit retry still available. Durable gestures are temporarily
inert while the initial IndexedDB load identifies the stored lineage.

Why: retaining the latest dirty tree in memory is insufficient if a person
cannot discover the failure or carry material out. Likewise, revisions order
one lineage; they cannot safely arbitrate a fixture-based edit made before the
stored lineage is known.

Forecloses: a permanent global status banner, automatic deletion, silent
revision-based merge, and treating archive recovery as a second document model.

## 2026-08-08 — Maintenance owns cancellation and generated build state

Changed: one-request inquiry and repair scenarios now inherit the combined
disconnect/deadline signal through the provider call without charging a user
cancellation to provider cooldown. Next route declarations are generated by an
explicit typegen step rather than tracked, the E2E output directory requires an
explicit Playwright owner marker, and interrupted POSIX proofs signal the whole
spawned process group before bounded escalation.

Why: a closed interaction must stop the work it alone owns, and a local proof
must not leave either repository noise or a server holding its port. Generated
framework files and inherited environment values are not durable source.

Forecloses: provider work surviving its request boundary, cancellation poisoning
relay health, a leaked E2E dist directory redirecting normal development, and
committing Next-generated type references.

## 2026-08-07 — Preview.8 closes transient and provider-boundary races

Changed: lasso cancellation preserves the prior transient selection, multi-block
selection settles without entering document history, inquiry responses echo and
validate their request identity and context receipt, stale requests abort when
scope changes, empty document-root excerpts are omitted from label reference
material, and voice restart/cancel events remain bound to one recording session.
Dependency updates from the two open Dependabot proposals are absorbed with
audited transitive overrides rather than left as release branches.

Why: pointer cancellation, late browser callbacks, empty metadata, and stale
network answers are normal boundary conditions. They must fail closed without
changing material, leaking provider detail, or manufacturing a second history.

Forecloses: clearing a useful selection on an ambiguous gesture, applying an
answer to changed context, sending empty reference fields, letting a late voice
event finish a newer session, and shipping known vulnerable transitive packages.

## 2026-08-07 — Preview.8 keeps one independent demo-document title

Changed: the current preview remains a single seeded demo document. Its title is
independent metadata, starts as `被允许想象的其他生活`, survives material edits,
deletions, generation, reload, and export/import, and returns to that same title
when the person clears the title. There is no new-document UI in this preview;
the multi-document activation path remains planned rather than implied.

Why: the opening sentence is material and must remain untouched, while the small
upper-left title gives the document a stable identity. Treating an empty rename
as a deterministic reset keeps the demo legible without letting a model or a
first paragraph silently rename it.

Forecloses: deriving the title from the first passage, allowing model output to
rename the document, presenting a premature document picker, or persisting an
empty title as an accidental `Untitled matter` state in the demo flow.

## 2026-08-07 — Every model call is one scenario on one harness

Changed: repair, labelling, inquiry, and the gated transform are now four
`MatterScenario` values on a shared spine. `runScenario` is the only function
that awaits a provider, and it owns the deadline, the shedding, the backoff, and
the refusal to leak provider identity. Prompts are assembled from named sections
in a fixed order rather than written as prose; every one opens with the same
five-line statement of what Matter is, and material reaches a prompt only
through a fence that escapes it and carries the never-instruction sentence with
it. Every scenario declares an adjudicator and a floor; the pool is one module
with four independent environment gates. Ask Matter's dictation shares the
repair pass. The transform prompt, degree bound, and answer judgement are frozen
and tested; its route stays gated.

Why: four independent integrations meant four deadlines, four retry policies,
and four chances to forget the sentence that keeps a person's own writing from
acting as an instruction. A prompt is odds, not a guarantee — the guarantee has
to be a deterministic check that the person's fixed scope survived. And a model
told only its immediate task assumes the product it was trained in, where
greeting the reader and choosing how much to change are both correct.

Forecloses: a surface that talks to a provider on its own terms, a prompt whose
material is not fenced, an answer accepted without a floor to compare it to,
per-scenario provider pools, and inventing prose where the inquiry should state
that it has none.

## 2026-08-07 — Public voice has an on-device transcription fallback

Changed: browser-native Web Speech remains the live, zero-download preference.
When it is unavailable, the public client may record within the existing bounds,
decode to 16 kHz mono, and lazily run multilingual Whisper Tiny in a single
browser worker. Audio does not cross the Matter server boundary; both admission
and inquiry dictation reuse the same transcription contract.

Why: the public preview needs a usable voice path without operating an STT
service or exposing a third-party credential, while keeping model cost off the
initial page and off browsers that already provide live recognition.

Forecloses: fixture speech in production, mandatory raw-audio upload, eager model
loading on first paint, concurrent inference against one model instance, and
running fallback inference on the UI thread.

## 2026-08-07 — A bounded repair pass sits between transcript and admission

Changed: a final voice transcript passes through `POST /api/repair` before it is
admitted. The scenario may only restore punctuation, sentence boundaries, a
misheard word, and one spelling for a repeated term; every answer is adjudicated
against the spoken skeleton of the original and discarded unless it stays inside
a proportional edit budget. Failure of any kind admits the words as heard. The
admission machine gains a `repairing` phase that holds the transcript while the
answer is outstanding, and `MATTER_REPAIR_ADAPTER` gates the server side.

Why: recognition loses punctuation and the occasional homophone, and the only
fix a person otherwise has is the keyboard the primary path exists to avoid.
Repair belongs to hearing rather than to thinking, so it must be unable to
change what was said — which is a deterministic property, not a prompt.

Forecloses: treating a model answer as authoritative over a transcript, giving
repair its own error state or retry, and letting punctuation restoration become
a second durable command or an agent-sourced mutation.

## 2026-08-07 — Provider stations may explicitly disable thinking

Changed: an OpenAI-compatible model-pool station may set
`MATTER_LABEL_<STATION>_ENABLE_THINKING=false`; the server sends the provider
switch only when configured. The environment example records AIPing as a
separate optional station with Qwen3.5-Flash, DeepSeek-V4-Flash, and
Step-3.5-Flash in measured Matter order.

Why: low-latency inquiry and naming should not pay for hidden reasoning, and a
model offered by one gateway cannot be assumed to exist at another gateway.

Forecloses: mixing credentials between relays, treating model names as globally
portable, and relying on a provider's changing default thinking mode.

## 2026-08-07 — Matter inquiry uses the existing server model pool

Changed: the non-mutating inquiry route may use the existing OpenAI-compatible
server model pool behind an independent `MATTER_INQUIRY_ADAPTER=live` gate.
Questions and bounded selection-or-tree material are serialized as separate
JSON values in a fixed prompt; answers are trimmed and bounded before they
cross the route.

Why: the lightweight inquiry can now be tried without exposing a credential,
adding a browser-to-provider path, or creating a second pool configuration.

Forecloses: provider selection in the client, silent fixture answers, following
instructions embedded in material, and leaking provider errors or identity.

## 2026-08-07 — Lightweight Matter inquiry returns as a bounded exception

Changed: the lower-right Guide control is again Ask Matter. It opens one small,
non-persistent question surface and sends either bounded lasso passages or a
bounded virtual-tree projection through
`/api/inquiry`; without an answer adapter it reports that fact instead of
inventing prose.

Why: product intent explicitly restored a quiet orientation and future memory
entry point without restoring a permanent assistant panel.

Forecloses: treating static help as the final corner action, browser-to-provider
calls, persistent chat history, hidden whole-tree retrieval, and answers that
silently imply a connected model.

## 2026-08-07 — Browser voice transport fails closed before capture

Changed: native Web Speech is preferred when explicitly enabled and available,
while MediaRecorder upload requires a separate explicit client build capability.
The inquiry composer shares that transport for voice questions. The dedicated
browser-recognition deployment disables audio upload; unsupported browsers keep
the microphone affordance visible but fail before requesting access.

Why: a missing client adapter constant allowed an unsupported browser to record
audio for a server route that browser mode intentionally rejects.

Forecloses: inferring upload authority from a server adapter name, collecting
audio for a guaranteed 503, and exposing provider/deployment names to client
interaction code.

## 2026-08-07 — Canvas rendering follows structure without a fixture identity

Changed: root presentation derives from the absence of a parent, thought clicks
are delegated by the ordered material list, and validated layout boxes publish
directly at the DOM edge without a second frozen geometry projection.

Why: imported roots must look like roots regardless of their id, and a complete
tree remount should not allocate one handler and two disposable publication
objects for every visible passage.

Forecloses: fixture ids as styling authority, per-node click closures, and a
parallel geometry value model between pure layout and the rendering edge.

## 2026-08-07 — The preview returns to a material-only AI boundary

Changed: the inquiry prompt, assistant transcript, and inquiry API have been
removed from the candidate. Help is static, while a future explicit
context-and-memory adapter remains documented behind a later product freeze.

Why: Matter currently permits AI output only as one perceivable change to
material; a parallel chat surface would split attention, history, and context
ownership before that durable boundary exists.

Forecloses: connecting a provider through truncated lineage, applying stale
assistant responses across document revisions, and treating chat as a shortcut
around tree commands.

## 2026-08-07 — Material drag changes structure; canvas pan is an explicit mode

Changed: a selected non-root node can be pointer-dragged to a different visible
parent through one exact, undoable `move-node` command. Canvas pan/zoom runs only
while the Move tool is selected; lasso, material handling, and pan are disjoint.

Why: dragging language must not be mistaken for moving the camera, and every
tree-derived view must follow one structural source of truth.

Forecloses: authored coordinates, same-parent reorder guessing, root movement,
and HTML drag-and-drop as a desktop-only second interaction system.

## 2026-08-07 — Lasso boundary feedback has no selection authority

Changed: one lasso stroke may cross the paper boundary; its outside portion
draws a bounded field of off-white and grey square particles while semantic hit
testing remains limited to visible canvas text.

Why: the gesture should remain continuous at the physical paper edge without
turning surrounding chrome or the material index into selectable document space.

Forecloses: particles entering history/context, outside-paper text targets, and
an unbounded per-pointer animation system.

## 2026-08-07 — Speech admission normalizes punctuation only

Changed: explicit spoken punctuation becomes language-appropriate marks and a
missing terminal mark is added before the existing bounded admission command.

Why: browser speech should enter as readable human material without invoking a
generative rewrite or changing the person's internal wording and spacing.

Forecloses: AI rewriting at admission, silent text truncation, and accepting a
normalized result that exceeds the node bound.

## 2026-08-07 — transient multi-passage lasso selection

Changed:    a lasso can address several visible passages without a prior node selection. One passage remains a stretchable semantic range; two or more become a non-transforming selection set, mark their source nodes in the material index, and expose only a compact canvas count.
Why:        selection is a temporary handle and must support comparison without changing the rooted document.
Forecloses: treating a multi-selection as one hidden transform range, adding a competing right-side tray, or implying node deletion.

## 2026-08-07 — Tree shadows respond to canvas navigation

Changed: the ambient tree-shadow video uses a restrained accelerated playback
rate while the person is actively panning. Wheel zoom and pan receive only a
short navigation pulse; releasing the gesture immediately restores the quiet
baseline rate. Reduced-motion and the existing FX toggle still take priority.

Why: the background should acknowledge physical movement and make the canvas
feel spatial without competing with the material when the person is still.

Forecloses: continuous high-speed atmosphere, motion that persists after the
gesture, or a second animation system coupled to document state.

## 2026-08-07 — Canvas preferences have one runtime owner

Changed: MatterApp owns the canvas preference binding and passes it through the
rooted renderer. Admission, labels, guidance, and chrome now read the same
snapshot instead of creating competing local controllers.

Why: presentation and server locale must change as one transaction from the
person's point of view; duplicate subscriptions created avoidable races.

Forecloses: component-local preference controllers for the same canvas.

## 2026-08-07 — Locale is shared presentation and server request context

Changed: Matter supports Simplified Chinese, English, Japanese, German, and
Traditional Chinese. The picker shows them in that order, while the shared
locale allow-list is enforced by transcription and label request boundaries.
The selected locale now flows from the preference controller into browser
speech, `/api/transcribe`, derived labels, and future generative turns.

Why: language selection must change the language of work performed by the
server as well as the language of the surrounding interface.

Forecloses: treating locale as cosmetic-only UI state or accepting arbitrary
locale strings at provider boundaries.

## 2026-08-07 — The public preview does not invent speech

Changed: `matter.ptoq.io` starts from a root-only local document and disables
the fixture transcription adapter. Its voice control and health probe report
unavailable until a managed realtime provider has a credential, origin, rate,
spend, and browser-device receipt.

Why: a fixed transcript is a lifecycle test, not a person's speech. Public
material must never present it as live or real-time transcription.

Forecloses: exposing fixture output on the dedicated domain, placing a provider
key in browser code, or persisting partial speech outside the final human tree
command.

## 2026-08-07 — Auto appearance follows local daylight hours

Changed: Auto appearance resolves to light from 07:00 through 18:59 and dark
from 19:00 through 06:59 in the browser's local time zone. The next boundary
is scheduled once; `prefers-color-scheme` is retained as a fallback when the
clock cannot be read.

Why: automatic appearance should match the person's day without adding theme
state to the material document or requiring a server request.

Forecloses: treating Auto as a live system-theme mirror or persisting a
location-specific sunrise/sunset service contract.

## 2026-08-07 — The editing rail keeps its primary handles reachable

Changed: Voice becomes a stop control while recording, Canvas pan remains
available even when lasso mode is off, and Branch defaults to the root when no
node is explicitly selected. Only actions that would conflict with an active
recording remain locked.

Why: the physical instrument should invite the next meaningful action instead
of presenting several controls that appear permanently unavailable.

Forecloses: requiring a hidden selection prerequisite for the first branch,
making Canvas pan a dead-looking control, or disabling the only visible Voice
control while it is recording.

## 2026-08-07 — The dedicated preview starts with one thought

Changed: the `matter.ptoq.io` Vercel build owns `/`, sets its canonical origin
to that domain, and starts from a root-only fixture with a distinct document ID.
The root remains the canonical sentence about an imagined past; child material
is created only when the visitor takes an action and persists in that visitor's
local browser document.

Why: an online preview should present one clear beginning instead of a
pre-authored tree while retaining a working, undoable growth path.

Forecloses: serving the dedicated domain at `/matter`, publishing a shared
pre-filled descendant tree as though it belonged to a visitor, or overwriting
locally created material on reload.

## 2026-08-07 — The rail returns to the preview's white material

Changed: the selected rail keeps the preview's white surface and light border.
Its hover tile remains `#f5f5f2`, its selected tile remains black with a white
icon, and shadows stay removed.

Why: the cool-gray and translucent experiments made the hover tile disappear
against the dark paper; the original white material gives it a readable step.

Forecloses: tinting the rail body away from the preview white while this
direction remains selected.

## 2026-08-07 — The quieter rail surface experiment is superseded

Changed: an intermediate lower-luminance cool-paper rail experiment was
rejected; the following entry records the current white-material direction.

Why: the experiment was evaluated during the visual pass and did not remain the
selected product surface.

Forecloses: treating this discarded intermediate surface as the current rail
contract.

## 2026-08-07 — The second rail preview is the selected direction

Changed: the product rail now uses the second preview as the explicit current
choice: `60px` desktop width, `44px` buttons, `22px` outer radius, `13px`
button radius, and larger artwork. Narrow screens retain `48px` targets.

Why: the rounder, fuller instrument is the selected visual direction. The
earlier compact geometry remains in the log only as historical comparison.

Forecloses: treating the compact `56px` rail as the current product choice
while this direction is selected.

## 2026-08-06 — Preview deployments support both a mount and a dedicated domain

Changed: `MATTER_BASE_PATH=/matter` remains the default deployment shape, while
an empty value mounts the same application at a dedicated domain root. The
default build redirects `/` to `/matter`, and the health probe reports the
effective prefix in either mode.

Why: `matter.ptoq.io` is a natural preview origin, but the existing
`ptoq.io/matter` deployment must remain stable. One normalized boundary keeps
assets, API fetches, redirects, and deployment checks aligned without a fork.

Forecloses: hostname-specific UI copies, duplicated root routes, and silently
changing the canonical `ptoq.io/matter` mount.

## 2026-08-06 — The rounder rail was rejected as the release geometry

Changed: the second preview's fuller proportions (`60px` desktop width, `44px`
buttons, `22px` outer radius, `13px` button radius, and larger artwork) remain
only as a historical comparison in the rail study.

Why: the enlarged rail competed with the material, so the first compact
proportions remain the current release direction.

Forecloses: treating the rounded comparison as shipped product chrome.

## 2026-08-06 — The right instrument returns to its first proportions

Changed: the desktop rail is again `56px` wide with `40px` buttons, `16px`
artwork, a `16px` outer radius, and the original quieter spacing. Its invisible
hit area reaches `44px`; narrow screens retain `48px` physical targets. The
selected tool still uses the stable black tile and white icon.

Why: the enlarged rail competed with the material and made the paper-side
instrument feel like application chrome. The first proportions are more precise
without making nearby clicks brittle or shrinking touch targets.

Forecloses: using visual bulk as the only way to enlarge a hit area, weakening
the selected state, or applying desktop density to touch layouts.

## 2026-08-06 — Matter is proprietary and internal-only

Changed: Matter is licensed as `UNLICENSED`, marked private for package tooling,
and documented as proprietary software owned by Wooden Computer Co., Ltd.
External code contributions and public support requests are not accepted;
private vulnerability reporting remains the outside security channel. The
repository may remain publicly readable for operational reasons without
granting a license.

Why: public source visibility and open-source permission are different choices.
The project needs one explicit ownership, contribution, support, and package
publication boundary while internal maintainers continue to collaborate.

Forecloses: treating the current main branch as Apache-2.0, inferring permission
from repository visibility, publishing the package to npm by mistake, or merging
outside code without a separate ownership agreement. It does not retroactively
alter the license attached to already published historical revisions.

## 2026-08-06 — The first preview has one auditable release boundary

Changed: the integrated candidate is versioned as `0.2.0-preview.1`; its
release receipt runs the repository check, the pointer-only Chromium matrix, and
the production 2,000-node performance proof. ZIP archive return is available,
while directory export, live transcription, and generative transform remain
explicitly gated in release-readiness.

Why: a first preview needs a reproducible claim that matches what a person can
actually use, and a version must not imply the complete Matter loop before its
provider and deployed-origin evidence exists.

Forecloses: calling this candidate a complete public pre-release, treating the
health endpoint as an uptime claim, or silently widening the preview to a live
AI product.

## 2026-08-05 — A node is named once, and a person can overrule the name

Changed: a label is now a phrase rather than a tag — Chinese aims for 11
graphemes and is bounded at 14, Japanese at 15 and 20, Latin at 26 and 32 — with
brevity as a smooth weight rather than a veto, so a short label stays reachable
but rare. Model answers and typed names persist in their own browser store keyed
by tree and node with the fingerprint of the material they came from, so a node
is named once instead of once per reload; deterministic labels are recomputed. Double click, or
long press on touch, names a row; that name outranks every automatic label until
it is cleared. Index search matches the name on screen. Japanese joins the
deterministic path with its own fillers, particle boundaries and bound.

Why: two or three characters name a topic, and a list of topics is
indistinguishable from anyone else's — the author has to recognise their own
thought, which takes a phrase. Paying a request and a wait for the same sentence
on every reload is paying for nothing, and a name a person chose is a decision,
not a derivation.

Forecloses: labels as a pure per-session derivation, a model answer that can
overwrite a person's name, a name that lives in the document protocol, searching
only the material under a row, and single-kana particle splitting without a
morphological analyser.

## 2026-08-05 — The physical instrument stays still while human material stays rooted

Changed: the five-slot right instrument returns to compact 20 px artwork inside
stable 44 px desktop and 48 px narrow targets. Active state expands only the
black-and-white surface within its fixed target; the old target-size jump and
icon scaling are gone. The initial complete
return-arrow mark is restored. `Delete` and `Backspace` remove only a selected
non-root thought in full view through one human tree command and exact Undo.
Voice initializes an empty root, then always appends first-level thoughts under
that root; fixture transcription remains explicitly fixture-gated.

Why: a physical tool should not move nearby targets when recording or lassoing
starts. Removal needs the same committed/invertible material boundary as every
other durable act. A selected deep thought should not silently change where a
new human utterance enters the rooted document, and a fixed demo transcript is
not a substitute for configured live STT.

Forecloses: layout-shifting active controls, toolbar-sized icon artwork, root
deletion, lasso-range deletion by a keyboard shortcut, admission under an
arbitrary deep selection, and silently presenting fixture text as live speech.

## 2026-08-05 — The label model is a pool, calibrated against a corpus

Changed: `MATTER_LABEL_ADAPTER=live` resolves an ordered pool of
OpenAI-compatible relays declared per station in git-ignored local
configuration. The first healthy candidate answers; a recently failed station is
tried last rather than dropped; an attempt that cannot finish inside the
remaining deadline is not started. Adjudication thresholds and deadlines were
reset from measurement rather than intuition: Han grounding is per character
instead of per bigram, sibling distinctness needs a margin, the Latin bound is
the panel's existing 32-grapheme title width, and the provider deadline is 3 s.

Why: relays disappear, so fallback is normal operation, not an error path. The
first thresholds refused most good answers — 35% acceptance, largely on labels
that recombined phrases the person had actually used. Corpus evidence moved that
to 88% with no observed hallucination, and showed a flash-class model matching a
large one at a third of the latency.

Forecloses: a single hard-coded provider, keys in tracked configuration, a paid
evaluation inside `npm run check`, treating prompt instructions as the boundary
that stops injected material, and tuning label judgement without a corpus.

## 2026-08-05 — The right canvas composition is a local frozen boundary

Changed: the private visual reference is recorded only as an anonymized study
of the rounded paper. Its leaf atmosphere, right editing rail, and corner
utilities are frozen as paper-owned presentation. The left material field is
explicitly pending redesign and has no visual freeze.

Why: the useful reference is the paper's quiet instrument composition, not an
external product identity or a prescription for Matter's unfinished left field.
Keeping the freeze local prevents right-side utilities from spreading while
leaving the structural index free for its own future research slice.

Forecloses: branded reference leakage, canvas tools in the left field, and
treating the current file index as a finished visual system.

## 2026-08-05 — A node is named before anything is asked

Changed: the material index shows a short navigation label instead of the
32-grapheme material title. The label is derived deterministically and appears
synchronously; a small model may then improve it through `/api/label`, whose
answer is applied only after validation, adjudication against the deterministic
label, and a re-check of node, material fingerprint, and latest operation. The
label is derived presentation: it never enters the document, history,
persistence, or an archive, so protocol `0.2` is unchanged. Health reports a
`thoughtLabel` surface; `MATTER_LABEL_ADAPTER` gates it.

Why: a truncated first clause is a preview, not a name, and a tree of nodes is
only navigable when each row is recognisable at a glance. Deriving first and
asking second means the interface never waits for a model and never shows a
failure.

Forecloses: a label field in the document protocol, a label that a model alone
decides, an index row that waits on the network, a retry or streaming path for
a handful of tokens, and treating a generated name as material a person wrote.

## 2026-08-05 — Lasso guidance belongs to the paper only

Changed: the canvas keeps the one state-derived lasso sentence at its lower-left
edge; the fixed full-screen lasso hint is gone. The `[p → q] / matter` mark uses
the original system mono stack while the paper utilities retain Departure Mono.
Deep appearance now darkens the same leaf-shadow source with scoped contrast and
brightness rather than introducing a second background asset. The leaf-shadow
layer may sit over DOM text with low-opacity multiply blending, while the paper
keeps a readable blue-black base and stronger text contrast.

Why: the old fixed hint leaked into the left material field and duplicated the
canvas action. The header is part of the original workbench identity, while dark
mode should change the atmosphere without changing the FX contract.

Forecloses: sidebar-owned gesture hints, duplicated lasso presenters, a second
tree-shadow download, and coupling FX on/off to appearance mode.

## 2026-08-05 — Canvas utilities stay at the paper edge

Changed: the rounded paper alone owns a 24 px corner utility system: About and
settings at the upper-right, the existing state-derived next action at the
lower-left, and static help, language, leaf-shadow and appearance controls at
the lower-right. Validated local preferences synchronize across tabs but never
enter material, commands or history.

Why: the reference composition makes secondary controls discoverable without
turning the left material field into application chrome or replacing the one
truthful guidance state with another toast system.

Forecloses: a Herald-style prompt or assistant composer, empty billing/legal
claims, full-app theme leakage, corner controls in the left field, and a second
feedback event bus.

## 2026-08-05 — The workbench silhouette and editing instrument stay fixed

Changed: desktop always reserves the 262 px material field beside one 10 px-inset,
18 px-rounded paper canvas, whether or not the file index is open. The supplied
silent leaf-shadow media remains inside that paper. The only visible editing
instrument is Voice, Lasso, Branch, canvas pan, and Undo; the Focus/Fold local
presenter is withdrawn while its navigation state and intents remain available
behind the presentation boundary.

Why: resizing the canvas when the index closed broke the browser-workbench form,
and a second two-button island appeared to be part of the primary tool vocabulary.
One stable silhouette and one stable instrument are easier to learn and verify.

Forecloses: desktop canvas expansion on index visibility, selection-dependent
control islands, moving the leaf field into durable material, and deleting
navigation capability merely because it is not exposed in the first-release UI.

## 2026-08-05 — A verified archive is a document boundary

Changed: the strict Markdown snapshot can leave as a deterministic ZIP and return
only after bounded streaming extraction, central-directory CRC verification, full
snapshot validation and a generation-checked save. A successful return advances a
document epoch that clears history, navigation and transient file, lasso, stretch
and voice state even when tree identity and revision are unchanged.

Why: a portable copy is the recovery boundary only if corrupt archives, duplicate
paths, decompression abuse, conflicting writes and late interaction results cannot
partially replace or leak into the current material.

Forecloses: upload-then-repair imports, object-map unzip that hides duplicates,
same-generation document replacement, archive actions during live canvas/voice
ownership, and treating ZIP as a second document model.

## 2026-08-04 — Production performance proof is explicit

Changed: the 2k performance receipt has an explicit production configuration
and command: it builds with the fixture gate, starts a separate production
server, then runs Chromium against that output. Development E2E remains a
separate path. Its structural samples wait with bounded failures rather than
leaving a missed expected state to the outer test timeout.

Why: a development server receipt cannot prove the deployed renderer, and a
hang only reports a timeout without identifying the missing material action.
The receipt must retain its real control availability and report the actual
long-task gate rather than manufacture a passing run.

Forecloses: using dev-server timings as release proof, silently inheriting
fixture state, and unbounded mutation-observer waits in performance tests.

## 2026-08-04 — The file index renders as a window

Changed: the complete authored material-file projection remains the source for
the left index, while only a fixed-height, overscanned visible range is mounted
once it exceeds 200 rows. Focused DOM rows remain mounted; deferred projections
remain inert; selection and copy continue to resolve from the tree.

Why: a second fully mounted 2,000-row representation of the material caused
structure interactions to exceed their release performance bounds. Restricting
this only at the render edge keeps the document and interaction authorities
unchanged while bounding browser work.

Forecloses: treating rendered rows as a second tree, progressive partial index
data, generic virtual-list state in the document, and CSS-only offscreen
rendering as the performance contract.

## 2026-08-04 — Browser proof owns its development output

Changed: the Playwright development server owns the exact `.next-e2e` output
only during its development phase, while manual development and every
production phase retain `.next`. The E2E wrapper restores the tracked Next type
reference after success, failure, or repeated interruption.

Why: two Next development servers sharing one lock made the local preview look
unreliable and caused browser proof to depend on whether someone already had
Matter open. Generated type references must not make that temporary server an
input to ordinary type checking.

Forecloses: a shared dev lock, arbitrary environment-selected output
directories, inherited test base paths, and leaving generated E2E type paths in
the working tree.

## 2026-08-04 — The editing island is stable; structure stays local

Changed: the right editing island has five permanent slots — Voice, Lasso,
Branch, canvas pan, and Undo. Focus, Fold, Unfold, and Show all are transient
handles beside the visible material they address. Their screen position is
derived at the rendering edge and they disappear rather than overlap material,
the island, guidance, an active lasso/stretch, or the narrow-screen file drawer.

Why: changing the rail's height and order as selection changed made the
instrument hard to learn and placed structural actions away from their object.
An unavailable or overlapping control is less honest than a temporarily absent
local handle.

Forecloses: context-driven rail reordering, fake Move affordances, local
controls in the measured tree DOM, and treating structural navigation as a new
durable tool state.

## 2026-08-04 — One truthful action sits at the paper edge

Changed: the canvas footer is one state-derived sentence at the lower-left
paper edge. A closed pure projection gives voice progress and recovery priority,
then maps empty, selection, lasso, stretch, focus and fold states to one current
action. It uses the existing Departure Mono face and does not announce beside
the interaction-specific live regions.

Why: the prior two-sided footer offered several choices at once and told a
stretched selection to speak a generative direction even though the current
voice control admits human material. Guidance must describe the capability that
actually exists and remain visually attached to the canvas rather than read as
status chrome.

Forecloses: multi-action coaching, duplicated live announcements, and promising
directional AI voice before the transformation path is connected.

## 2026-08-04 — Guidance returns to the canvas and controls recede

Changed: the canvas lower edge now keeps one product sentence on the left and
one state-derived next-action sentence on the right. Fixture text versions stay
available to tests and store fixtures but no longer appear in product chrome.
The left outline defaults to a manuscript index; search and copy selection are
explicit transient modes instead of permanent row controls. The still leaf
field paints first and video joins only after the browser yields.

Why: people need to know what their hand can do next without reading a tool
dashboard, while development fixtures, revision counters, checkboxes and media
startup must not compete with the material or delay first paint.

Forecloses: visible fixture/version controls, permanent file-operation chrome,
status-led guidance, and making decorative motion a prerequisite for the canvas.

## 2026-08-04 — The canvas sits inside a material workbench

Changed: the full-bleed field becomes a quiet browser-like workbench with the
Markdown material outline held at the left and one rounded canvas inset on the
right. A supplied silent leaf-shadow loop is decorative atmosphere within that
canvas and has a reduced-motion still fallback. Departure Mono carries interface
chrome; the language material keeps its existing reading face. The right editing
island now exposes stable visual grouping hooks while the closed `ToolIntent`
projection remains its only source of actions.

Why: file lineage, spatial material, and the editing instrument need to read as
three parts of one durable environment rather than unrelated floating panels.
The ambient motion gives the field a recognizable material quality without
turning AI or infrastructure into a surface.

Forecloses: a decorative card grid, a prompt or assistant panel, brand imitation,
durable UI preferences, freely draggable controls that compete with canvas
gestures, and any visual control that manufactures an unavailable command.

## 2026-08-04 — Deployment health reports gated Matter surfaces

Changed: Matter exposes `app/api/health`, deployed under `/matter/api/health`,
as a no-store deployment probe. It reports protocol version, app version, base
path, and coarse surface states for material, local persistence, voice
admission, transform turns, and archive export/import. The probe deliberately
does not expose provider names, raw environment values, material, transcripts,
or lineage.

Why: early deployment needs a machine-readable cross-section without confusing
fixture/demo readiness with a public live-AI release.

Forecloses: treating deployment health as a debug API, leaking provider
configuration, or claiming `/api/turn` and archive flows before they exist.

## 2026-08-04 — The Markdown tree becomes a visible material outline

Changed: every thought is projected as one logical Markdown document in a
left-edge file outline. Display titles and search terms derive deterministically
from node text but carry no identity. The same canonical path allocator writes
`index.md` paths with numeric sibling order; strict frontmatter keeps node id and
created/updated times. IndexedDB stores one generation-checked bundle per tree,
while sidebar search, copy selection, navigation and status stay transient.

Why: material must be inspectable and recoverable as files without turning the
file browser into another editor or state owner. One tree revision can update
the canvas, file outline and snapshot atomically from the person's point of
view, while storage completion remains honest and retryable.

Forecloses: path identity, watcher-driven local refresh, one OPFS file per node,
lexical reordering, persisted UI selection, and importing a generic VFS beside
the tree engine.

## 2026-08-04 — Expansion projects language without splitting the document

Changed: one validated range derives a transient centered `before / selected +
outer seam / after` projection. The connected source text remains the sole DOM
and accessibility owner. Pointer preview changes only local CSS geometry; after
settlement the presentation box may grow and the pure tree layout repacks.
Viewport clipping never changes the normalized expansion degree.
Words above a downward expansion retain their original inline layout through an
invisible suffix ghost; only the displaced suffix becomes a centered block.
Both physical grips adjust this one downward projection; grip ownership is not
a second semantic direction.

Why: stretching a middle phrase must physically move the suffix instead of
painting a taller rectangle over an unchanged paragraph, while preserving one
addressable document and predictable downstream layout.

Forecloses: durable span nodes, viewport-dependent generation length, duplicate
accessible text, and publishing tree layout on every pointer move.

## 2026-08-04 — Lasso success and expansion remain material-local

Changed: the lasso closing seam appears only when the current path resolves one
valid punctuation selection through the same pure target rule used at release.
A selected range exposes upper and lower physical grips anchored to its first
and last visual lines; both adjust one shared non-negative expansion degree.

Why: gesture qualification alone cannot promise that language will be selected,
and a wrapped text range is not a rectangular resize box. Feedback must follow
the real material address and the handles must remain attached to visible text.

Forecloses: success feedback based only on stroke size, a decorative upper grip,
signed compression hidden inside an expansion gesture, and union-center handles
for stepped multi-line selections.

## 2026-08-03 — Language addresses remain semantic, geometry remains disposable

Changed: lasso selection resolves plain DOM text into one grapheme-safe,
punctuation-bounded address. Pointer ink, Range rectangles and camera geometry
remain transient; resize, fonts, layout or material changes remeasure or clear
them rather than persisting screen coordinates.

Why: reference must survive reflow while its physical measurement cannot. The
separation also keeps pointer movement outside the tree and durable history.

Forecloses: token-wrapped text, stored selection rectangles, cross-node guessing,
and per-pointer-move tree or layout work.

## 2026-08-03 — Human admission is one cancellable voice operation

Changed: voice admission freezes an empty-root or selected-parent target and
commits a verbatim transcript through one human tree command. Browser resources
remain behind a tokened effect boundary; fixture and live transcription share a
strict Matter-native route selected only by server configuration.

The first running adapter is fixture-only. It crosses the real browser recording
and multipart boundary, while live transcription stays unavailable until its
deployment limits and physical-device receipts are proven.

Why: permission, recording, final chunks, transcription and commit cross several
failure domains. One lifecycle owner and commit-time tree revalidation prevent a
late result or changed selection from relocating material.

Forecloses: transcript preview/editing, cached audio retry, client-selected
fixtures or providers, partial streaming, and independent voice lifecycle hooks.

## 2026-08-03 — Hackathon surface returns over rooted geometry

Changed: Matter restores the original frameless paper surface, fixture sentence,
brand, hints, and editing island. The complete derived world can be panned and
zoomed transiently, while child-right, first-child-top, and sibling-left
alignment remain structural and unauthorable. The root column, rather than the
complete tree bounds, anchors the surface, so growth cannot move the thought
already in hand. Pointer capture distinguishes a sub-threshold node selection
from a pan and cancels safely when capture is lost.

Why: the columnar proof established the correct growth rules but its boxes and
connectors made material read as a diagram. The hackathon surface expresses the
intended bodily, direct interaction more accurately.

Forecloses: treating card frames or connectors as product structure, persisting
camera state, and interpreting pan as permission to freely position nodes.

## 2026-08-03 — The retired scene system leaves the build

Changed: the non-archive Arrow feature tree, `/api/arrow/*` routes, scene CSS,
and `ARROW_*` configuration were removed. Matter now owns the only running
document and interface path; provider routes return in Phase 2 with protocol
`0.2` rather than through compatibility aliases.

Why: the old routes encode a coordinate scene, broader agent authority, and a
different multi-mutation contract. Renaming them would make an incompatible
system appear current and preserve two sources of product truth.

Forecloses: deploying the hackathon API accidentally, importing scene types into
Matter code, or preserving the old contract through environment aliases.

## 2026-08-03 — Spatial outline replaces nested-flow presentation

Changed: visible material is arranged as a top-anchored columnar tree with
derived geometry. Depth owns the left edge, a first child aligns to its parent,
and later siblings pack below prior subtrees. The editing rail is a closed
projection of runtime capability and owns no state.

Why: the semantic flow proved the runtime and browser envelope but read as one
long conversation. Product review confirmed that constrained spatial lineage
and the visible editing instrument are part of Matter's form.

Forecloses: treating nested flow as the final renderer, persisting coordinates,
free node movement, a stateful mode bar, and a speculative plugin registry.

## 2026-08-03 — Runtime becomes a reducer with capability ports

Changed: durable tree state, runtime history, navigation, interaction, and
persistence have one owner each. A framework-free reducer describes async
effects; late results carry an operation token and must pass current tree and
revision checks. Browser voice, turn transport, document storage, and archives
enter through four narrow ports.

Why: the `0.1` store and hooks duplicate lifecycle state across Zustand, React
refs, timers, browser resources, and request closures. That path can demonstrate
the gesture but cannot make cancellation, stale results, recovery, or another
host reliably testable.

Forecloses: adding more independent lifecycle hooks, treating a cache as a
document model, and building a generic SDK, event log, or native adapter before
the browser release needs one.

## 2026-08-03 — Roadmap ends at the first release

Changed: the active plan is the only roadmap. Work moves through a small
research → freeze → build and proof loop, across four vertical phases ending at
the first deployed, recoverable version. Only the current phase carries detailed
implementation scope.

Why: foundation quality needs explicit evidence and stable boundaries, while
specifying later product phases before using the first version creates planning
debt rather than robustness.

Forecloses: one plan per phase, perpetual foundation work, reopening frozen
choices by preference, and treating post-release possibilities as commitments.

## 2026-08-03 — Matter-native kernel chosen

Changed: protocol `0.2` uses a small normalized tree engine, an explicit pointer
state machine, real DOM text with pure derived layout, and a storage-independent
snapshot codec.
ProseMirror, tldraw, React Flow, CRDTs, and a fork of the local Murmur repository
are reference sources rather than application foundations. New dependencies are
limited to `idb` and `fflate` when their persistence/export slices begin.

Why: Matter's root, lineage, bounded range action, and exact handle-preserving
undo are smaller and more specific than the editing, canvas, or collaboration
models those foundations impose. Keeping that kernel pure makes its distinctive
behavior testable while still reusing generic transport code.

Forecloses: user-authored coordinates, editor-controlled selection, generic
object patches as domain history, and CRDT state before collaboration has a
product contract.

## 2026-08-03 — Empty document retains identity and revision

Changed: `ThoughtTree` always exists. Before first admission it has
`rootId: null` and no nodes; initialize and undo change the root while tree
revision remains monotonic. Commands carry an engine-checked expected revision
and domain preconditions.

Why: representing emptiness as `null` loses the document's conflict clock when
the first root is undone. A stable empty envelope makes first admission exactly
undoable without a placeholder thought or an asynchronous stale-plan gap.

Forecloses: resetting revision on undo, unconditional inverse commands, and a
fake root that leaks into material or context.

## 2026-08-03 — Contract kept small; admission separated from transformation

Changed: `product.md` and `material.md` are the only always-read product
contracts. Reference notes are optional context. Raw transcription admits human
material without a planner call; the four-signal grammar applies when AI
transforms existing material. Focus and fold are transient navigation, and model
context is the rendered root-to-focus path.

Why: the first thought has no existing anchor or meaningful degree, and forcing
it through a generative plan would overwrite the person's source expression.
Making every reference note mandatory would turn useful context into ceremony.

Forecloses: AI silently rewriting admission, persisted fold state, hidden
retrieval, and directory-shaped documentation requirements.

## 2026-08-03 — Documentation layer rebuilt around the tree

Changed: `docs/` replaced wholesale. Product and material contracts are now
separate from protocol and optional implementation references. Prior documents,
the `soft-input` Vite prototype, ADRs, and completed plans moved to `archive/`.

Why: the documents described a canvas of loosely placed thoughts and a
three-experiment playground. The product had already become one rooted tree with
a punctuation-level address space, and the documents were drifting away from it.

Forecloses: reading the old documents as current. They are kept for trace only.

## 2026-08-03 — ADRs removed in favor of an append-only log

Changed: `decisions/ADR-*.md` archived. This file replaces them. Their content is
compressed into the entries below.

Why: one file per decision was heavier than the decisions warranted, and the
ceremony meant small decisions went unrecorded — the opposite of the intent.

Forecloses: per-decision discussion threads. If a decision needs argument at
that length, it needs a plan, not a record.

## 2026-08-03 — Protocol 0.2: the tree is the document model

Changed: flat object bag replaced by `ThoughtTree` with an explicit root and
authored child order. Positions, `kind`, and `style` removed from the document.
Viewport removed from the document. Human material is inserted under a selected
parent without a generative create envelope. Context is the root-to-focus path;
siblings and descendants are excluded.

Why: one structure now carries four jobs — canvas, file system, context
boundary, and restraint. Session scoping, memory, and canvas discipline stop
being three separate mechanisms.

Forecloses: free spatial placement, infinite-canvas panning, and any
context-selection UI. Also forecloses a retrieval or memory subsystem: if the
path is not enough context, that is a product question, not a retrieval problem.

## 2026-08-03 — Markdown directory tree is the storage format

Changed: a node serializes to one `index.md` inside its own directory; children
are nested directories with numeric-prefixed, slug-suffixed names. Frontmatter
carries identity and time. The directory slug is derived and non-authoritative.

Why: local durability and export share one readable snapshot format rather than
separate data models. In the browser they remain separate physical stores.

Forecloses: a binary or database-native document format, and any schema that
cannot round-trip through a text file a person can read.

## 2026-08-03 — Cross-branch links deferred

Changed: cross-branch links remain an open product question and do not appear in
protocol `0.2`.

Why: weak references may be useful, but an inert wire shape adds weight without
validating behavior. The protocol can be versioned when the need becomes real.

Forecloses: implementing links in passing during the tree migration.

## 2026-08-04 — Lasso success and stretch edges are literal

Changed: the lasso closing seam appears only when the stroke expresses closure
intent and current epoch-bound geometry resolves to one valid contiguous
segment selection. Closure intent combines an absolute near-start gate with a
stable initial-direction angle and two scale-relative gap limits. The ink is a
heavier solid stroke, with no speculative seam at gesture start. Stretch now
has two real grips: the first and last selected visual lines can both adjust one
downward material slot. Both write one non-negative degree.

Why: a dashed seam reads as a promise that releasing will select, so geometric
closure alone was dishonest. A decorative upper grip likewise promised an
operation the system did not perform. Handle positions must come from actual
first/last line fragments, not the rectangular union of wrapped text.

Forecloses: sticky success feedback, dashed closure for empty or ambiguous
loops, a decorative upper grip, negative compression, and whole-selection
centering of grips.

## 2026-08-03 — Stretch expresses degree, not candidate choice

Changed: one two-edge gesture stores only a normalized transient degree beside
a text address. Either physical grip adjusts one downward expansion; neither
replaces text or browses model options.

Why: degree is a continuous human signal used to construct one later turn.
Candidate carousels are ordinal model output and would add a fifth interaction
channel, weaken the `{ text }` response boundary, and make commit semantics
ambiguous before the first end-to-end transformation exists.

Forecloses: option stacks, swipe-to-commit, and generated text during stretch in
the first release. A later proposal must reopen the product grammar explicitly.

## 2026-08-06 — Index width and tool reach follow the material field

Changed: the desk index reserves `304px`, with a `40px` reading row and larger
material labels. Below `960px` it becomes an overlay drawer, so the root column
keeps its field. The right rail keeps stable desktop and narrow targets, and the
black active tile fills that target.

Why: the former `238px` usable index compressed Chinese labels and the local
identity area; widening it improves reading without reducing the material to an
app panel. Hit targets should accept an imprecise hand without making the tools
look heavier or stealing canvas drag territory.

Forecloses: percentage-based rail widths, a fixed index in tablet space, and
changing a tool's target size when its active state changes.

## 2026-08-07 — Public discovery uses one canonical Matter identity

Changed: Matter now has one tested public origin and base-path resolver shared
by metadata, JSON-LD, social images, robots, sitemap, manifest, and LLM text
maps. The public definition is the deck's “A brain-computer interface for
thoughts shaping”; “thinking with AI” remains related category language rather
than a replacement. Performance paths are excluded from indexing, and the
machine-readable map states the current fixture-seeded
preview boundary.

Why: mounted and dedicated-domain deployments must produce the same canonical
product identity without leaking material, provider configuration, transcripts,
or user state. Search and machine readers need a factual description of the
product and its current release boundary, not a generic AI-writing label.

Forecloses: scattered per-route origins, internal fixture discovery, claims
that the gated generative turn is live, and SEO copy that turns Matter into a
chat or second-brain product.

## 2026-08-07 — Browser-native speech is the public admission path

Changed: the public preview selects the browser Web Speech API for live interim
and final recognition. Transcript previews remain transient and only the final
human text enters the tree. Browsers without native recognition retain the
MediaRecorder boundary, but the server refuses fixture speech in this mode.

Why: Matter can provide real-time voice admission without adding a Matter-side
speech server or API key, while keeping provider ownership and privacy limits
explicit. Browser recognition may still use a vendor-managed speech service;
it is not presented as offline recognition.

Forecloses: fixture audio masquerading as live speech, a hidden chat transcript,
and uploading native-recognition audio when no server adapter was selected.

---

## 2026-08-07 — Lasso selection favors a forgiving hand

Changed: lasso closure now accepts a practical trackpad release distance and
less rigid turn proportions, while preserving finite-point, area, topology, and
cross-node safety checks. Text hit testing accepts a substantial wrapped-block
enclosure when individual line probes straddle the stroke. Pointer handlers
also suppress browser text selection and claim touch input while drawing.

Why: the previous geometry was mathematically careful but too exact for a real
hand. A lasso that visibly draws but almost never addresses language breaks the
primary gesture promise; the simpler path must be the reliable default.

Forecloses: requiring pixel-perfect closure, selecting adjacent thoughts from a
single loose loop, or weakening topology and stale-layout invalidation.

## 2026-08-07 — The document root is structural, not a visible heading

Changed: each running canvas has an invisible document root, an independent
editable title, and one or more visible first-level passages. Direct node drag
uses four explicit intents: before, after, in, and first-level blank paper. The
tree engine now applies parent plus insertion-slot moves atomically, including
same-parent reorder, with an exact inverse.

Why: React Flow and tldraw make spatial scene data authoritative, while
Excalidraw uses a flat ordered scene; none fits Matter's structure-authoritative,
pure-layout boundary. MindElixir's before/after/in feedback and React Arborist's
`parentId + index` move contract fit the existing engine without adding a
dependency. A separate document container also preserves the single-root
invariant while allowing several visible peers.

Forecloses: multiple durable roots, authored node coordinates, same-parent moves
outside command history, using a visible passage as the canvas name, and
replacing the tree engine with a generic scene graph.

## Carried from archived ADRs

**Standalone application at a base path** (ADR-0001, 2026-08-02). Matter is an
independent repository and deployment served beneath `ptoq.io/matter` via a base
path, not a module inside the site repository. Keeps protocol, release cadence,
and provider configuration independent of the site.

**Public actions separated from private mutations** (ADR-0002, 2026-08-02). The
agent's action vocabulary is strictly smaller than the reducer's mutation
vocabulary; the reducer keeps removal and reordering so it can construct exact
inverses. This is the technical form of the retained-handle principle and it
survives into `0.2` unchanged.

**Text rendered as DOM material with local feedback** (ADR-0003, 2026-08-02).
Language is real DOM text, not canvas-painted glyphs, so selection geometry,
accessibility, and text rendering come from the platform. Feedback ink is a
local SVG overlay. Survives into `0.2`.

**Create and transform turns discriminated** (ADR-0004, 2026-08-02). The
underlying lesson survives: invalid signals should be unrepresentable. In `0.2`,
human admission is no longer a generative envelope at all; only transformation
crosses the planning boundary.

**Product renamed to Matter** (ADR-0005, 2026-08-02). The `arrow` identifier
predates the name. `0.2` removes it wholesale with no compatibility aliases.
