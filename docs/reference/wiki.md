# Wiki: local lexical authority

Status: first-release engineering contract. The scoring constants remain a
corpus-calibration boundary, not a claim of product quality.

Wiki is a thin, origin-local authority for forms that Matter can resolve
deterministically. It exists to make repeated recognition and wording mistakes
disappear from future material. It is not a notebook, memory system, retrieval
index, user profile, prompt supplement, or second document model.

## Product posture

The successful interaction asks nothing of the person. Wiki infers, learns,
and applies a safe decision behind the paper. It does not ask the person to
approve routine learning, place a badge or success notice on material, or
expose a permanent management surface. A person should not need to know that
Wiki exists in order to receive its benefit.

It does not hide what it changed. Since the owner's decision of 2026-09-29 an
applied change is disclosed once, restrained and perceivable, and an unsettled
occurrence carries a quiet mark the person can tap to take over (see
[Exceptional correction surface](#exceptional-correction-surface)). This
reverses the earlier rule that an applied rule adds no mark, icon, or hover
action. Disclosure is what
makes silence informed, and informed silence is approval; see
[Occurrence outcomes](#occurrence-outcomes). Routine learning still never
becomes a review or approval workload.

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

Evidence is deliberately lossy and bounded. Record V7 keeps separate term and
alias ledgers of saturating integers in quarter-observation units, each with a
candidate-local quiet counter; every alias row also carries bounded kept
evidence, a separate bounded ledger holds revert strikes, and a bounded window
holds the opaque identities of recently settled occurrences. One successful
human admission is one logical clock tick; a candidate ages only on a tick that
was a comparable opportunity for it, and after a bounded number of such quiet
ticks its support halves. It stores no passage, node id, tree id, timestamp,
transcript, prompt, model answer, embedding, or source address; the settled
window holds only opaque random identities, never an occurrence's text or
address.
Existing trees are not rescanned because persisted nodes do not prove whether
their text was human- or model-authored. Model-generated material contributes
zero admission evidence: it can be corrected by Wiki, but its text can never
teach Wiki a term or a relation. An applied occurrence in generated text may
still settle as described under [Occurrence outcomes](#occurrence-outcomes).
Machine inference counts decay with the same observation clock, including
comparable human admissions that produce no candidate, so one early false
proposal cannot remain silently active forever. Only the successful
human-admission owner may advance this clock or submit admission evidence.
Repair, transform, and text-swap paths receive read capability only.

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

The 32-tick candidate-local quiet horizon is an evidence-aging clock, not a
user-intent window. It says how quickly one unobserved candidate loses support
without creating a global cohort boundary. A tick ages a candidate only when it
was a comparable opportunity: a complete scan in the candidate's locale (and,
for a relation, its channel) whose eligible, unprotected words contained every
script the candidate needs. Absence from a turn that could not have contained
the word is not evidence of disuse. A Chinese or Japanese turn whose scan
contained Latin words also offers the `en-US` ledger a routed opportunity for
the Latin script alone (see [Script routing](#script-routing)), so English
candidates age only on turns that actually contained Latin; a turn without
Latin words offers that ledger nothing. The production `recent-material` source
receives only a successful, validated human admission; it records one
content-minimal candidate vote per turn and never observes a later document
diff. The ordering of authority is fixed: an addressed human decision bypasses
scoring; an automatic proposal must pass both scoring gates; an ambiguous
proposal abstains.

Two deterministic human decision representations are defined. Settings may create, rename,
scope, or remove one canonical lexeme as an explicit local configuration
decision. Domain events can confirm, reject, or replace one exact alias, and
the occurrence settlement below routes explicit outcomes through them. The
error-local takeover emits confirm (Keep) and revert (the heard form); reject
and replace remain reserved. Each applied edit carries a short-lived, one-shot
attribution token captured when the rule was applied (see
[Occurrence attribution](#occurrence-attribution)). That token binds the
applied basis and rule to the exact committed occurrence and document epoch;
it contains no surrounding passage and expires instead of reconstructing intent
from a later whole-text diff. Matter still does not create an empty generic
decision port or claim that a canonical settings entry corrects future text by
itself.

### Occurrence outcomes

Informed implicit acceptance is approval (owner decision, 2026-09-29). One
exact applied occurrence settles exactly once, through the pure policy in
`wiki-learning-policy.ts` and the state transition in
`wiki-occurrence-settlement.ts`, entered through `applyWikiOccurrenceSettlement`
in `wiki-evidence.ts`, which routes explicit outcomes through its own human
decision paths. A settlement carries an
opaque random occurrence identity minted by the occurrence owner (never derived
from text or an address), the applied rule descriptor, the Wiki state revision
of the basis that applied it (the lexical session's `sourceRevision`), and the
origin of the material. It never carries surrounding text, and it never claims
authority: the current state decides whether the rule is human-confirmed when
the occurrence settles. The outcomes are:

- `accepted-implicit`: the change was disclosed and perceivable, the unchanged
  word still stands at its committed address, and one informed trigger fired:
  two further human admissions, about 60 s of foreground dwell, copy or export
  of the unchanged word, or leaving the page after perception. Copy, export,
  dwell, and leaving only settle the occurrence; they never stack.
  `settleWikiImplicitOccurrence` owns that classification from content-free
  facts.
- `inspected-kept`: the person opened the takeover, could read it for at least
  500 ms, and dismissed it without reverting.
- `explicit-confirm`: Keep; the existing confirm path makes the alias human
  authority.
- `explicit-reject` and `explicit-replace`: the existing reject and replace
  paths.
- `reverted`: the person restored the heard form.
- `censored`: neutral. The occurrence was removed or rewritten by any material
  change, including Material Undo, document replacement, repair, swap, or
  Elastic; its range became unmappable; or it was never perceived, because it
  stayed hidden or could not be perceived through assistive technology.

Wiki still never observes Material Undo or Redo. "Not undone" is expressed only
as the occurrence's address still holding the unchanged word; an address that
disappears censors the occurrence without a Wiki event.

One browser occurrence driver (`interaction/wiki-occurrence-driver.ts`, pure
lifecycle in `wiki-occurrence-lifecycle.ts`) owns every live occurrence from
its committed publication to its one settlement. Its address is the tree,
document epoch, node, node timestamp, range, and canonical word; any other
commit to that node, including repair, swap, Elastic, removal, or an Undo that
restores older text, censors it. The only change it follows is the person's
own revert of a sibling word in the same node. The driver attaches its page
listeners, 250 ms perception clock, and IntersectionObserver only while an
occurrence is live, and releases them idempotently. The driver, its lifecycle,
and the Wiki policy it consults load as one lazy chunk with the first committed
occurrence; until then an eager stand-in buffers at most 16 publications and
answers every question with the empty set.

- Perceived means the disclosure was shown (the settle, or the static mark
  where motion is off or unavailable) and then at least 50% of the word's
  painted area sat inside the visual viewport, with the page visible and the
  paper not covered by a modal, for 1.5 s cumulative. These are the named
  constants in `WIKI_OCCURRENCE_PERCEPTION`. A settle cut off before the
  change was readable (before its crossfade ends, or before an underline
  finished drawing) is not disclosure; it is retried once, and a word whose
  settle keeps being cut off waits unperceived until it is censored.
- Only after perception do informed facts accumulate: further successful human
  admissions (the one that carried the occurrence never counts), foreground
  time on the uncovered paper, a Material Files copy of the passage or a native
  copy whose selection covers the word, an archive export, and `pagehide`. Any
  one closes the wait through `settleWikiImplicitOccurrence`; they never stack.
  Dwell never accrues while a dialog, including the Wiki settings, covers the
  paper.
- An open takeover suspends silence. Dismissing it is `inspected-kept` only
  once it could be read for 500 ms and when the dismissing press is not on the
  word itself; a quicker dismissal, or the second press of a double-click, is
  not an inspection and returns the word to silence unsettled, while that press
  selects the passage as any press would. Keep is `explicit-confirm`, leaving
  the page while it is open is `inspected-kept`, and the heard form commits an
  ordinary human text restoration and then settles `reverted`. A restoration
  that fails closes the takeover and leaves every live occurrence where it was;
  when the passage no longer holds the word, the guidance line says so once,
  “Passage changed. Not restored.”, until the person's next action.
  Undoing that restoration is Material Undo and settles nothing.
- Wiki… hands the takeover to the settings dialog and keeps the occurrence
  suspended until that dialog has covered the paper and let it go again (or,
  if it never covers the paper, for 3 s of visible time). Nothing settles it
  meanwhile except losing the word or leaving the page. Opening the takeover
  and handing it to the dialog each restart the occurrence's 5 min registry
  wait, so a word the person is still deciding about late in its life keeps
  the attribution its Keep or revert records.
- A Keep or revert that Wiki cannot record (a failed write or an attribution
  that already expired) is said once in the guidance line and announced
  politely: “Wiki could not save that.” The material change stands; the line
  clears at the person's next action. Both lines are outcomes on the paper's
  one outcome line: one that ends while another is shown waits its turn.
- A live occurrence expires 15 s before its registry attribution would, and at
  most 64 stay live; both censor. So does `pagehide` before perception, which
  covers a tab that stayed hidden the whole time.
- A rewrite that re-applies the same correction to the same passage within
  15 s, typically its late repair, is a new occurrence that inherits the
  earlier disclosure instead of settling on screen a second time. That memory
  is presentation continuity only; perception, evidence, and settlement start
  afresh. It holds heard forms, so it keeps at most 16 entries, prunes expired
  ones on every write and lookup, and is cleared when the document or its epoch
  changes.

Informed acceptance adds `kept` evidence to the relation that was applied: +4
quarter-units for informed silence and +8 for an inspection, saturating at 24,
halving after 32 comparable ticks, and at most one implicit settlement per
alias between comparable ticks. Kept evidence only retains. While a relation
is active, its retention score (producer evidence plus kept evidence) must
clear the retention floor and lead every rival's retention score by the
retention margin, so a rule in use does not decay while it is used and resists
a challenger. Whenever no relation is active, candidates are ranked, and the
activation floor and margin are measured, on producer evidence alone. Implicit
evidence therefore never creates a relation, never activates one, never
re-activates a demoted one, never picks a winner between candidates, and never
becomes human-confirmed authority, which remains a human act. Acceptance of an
occurrence applied before a later revert of the same relation is neutral.

The first revert returns every automatic relation for that visible form to
zero, so a competing canonical cannot take over merely because the reverted one
stepped aside, and records one strike, stamped with its revision, for 128
comparable ticks. A second revert becomes a tombstone only when its occurrence
was applied from a basis that already held the strike: two reverts of
occurrences applied in the same turn, or one revert delivered twice, strike
once. A revert of a relation that no longer holds evidence is neutral; it never
strikes and never tombstones, even when strike memory is full. With evidence
and a full strike ledger the stronger reading wins and the revert tombstones. A
reject in the Wiki surface also tombstones; tombstones are permanent until a
person decides otherwise. Confirmed human rules and tombstones stay outside
scoring: implicit acceptance, inspection, and reversion of a confirmed rule are
neutral, and changing that authority is an explicit Wiki decision.

Settle-once is also a state guarantee. The state keeps the identities of the
128 most recent occurrences that produced an effect; a second kept or strike
effect for a recorded identity is ignored, while a person's explicit confirm,
reject, or replace is never swallowed by that window. Neutral outcomes leave no
record and cost no write.

Explicit outcomes on generated text always count. Informed implicit acceptance
on generated text counts at the same weights behind the single
`countGeneratedImplicitAcceptance` switch, which defaults to counting (the
owner's "basically all counts as approval"). Because kept evidence only
retains, that switch can keep an already active relation alive and defend it
against a challenger; it can never activate or create one. The risk it accepts
is that silence over disclosed but unread generated text is weaker evidence
than silence over a person's own dictation. Every weight and memory is a
calibration candidate.

Today that switch is unreachable. Generated text receives only the written
channel's rules, and every automatic relation is spoken, because the one
released fitting producer observes spoken human admission only; a written rule
is therefore always human-confirmed, and confirmed rules stay outside scoring.
The switch gains an effect only when a written-channel producer exists. The
`generated-implicit-acceptance-counts-by-policy` policy scenario replays a
spoken relation settled from generated text, a combination production cannot
produce; it stays in the corpus as a forward guard for that producer, not as
evidence of current behavior.

No rule falls back across locales. The same form may resolve differently in
`zh-CN`, `zh-TW`, `ja-JP`, `de-DE`, and `en-US`; an unsupported or missing
locale cannot activate a rule. [Script routing](#script-routing) is not a
fallback: it assigns a span to a ledger by the span's own script before any
rule is consulted, never because the turn's locale lacked one.

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

### Script routing

Matter's default interface admits `zh-CN` speech, and the recognition errors
Wiki exists for cluster on the Latin names inside it: `Engelbart`,
`Morphogenesis`, product names. The only released fitting producer is an
internal edit over ASCII Latin words, qualified in the `en-US` ledger, so
before routing it never saw them.

A word inside a `zh-CN`, `zh-TW`, or `ja-JP` turn whose letters are all Latin
script belongs to the `en-US` ledger. That is the locale settings already infer
for a Latin word typed under those interfaces, so learned and hand-added Latin
names share one identity. Every other word, and every word of an `en-US` or
`de-DE` turn, stays in the turn's own locale. Nothing routes toward a CJK
ledger, and a span holding any CJK letter never reaches a Latin producer or a
Latin rule. `wiki-script-routing.ts` owns this table.

Words are the turn locale's `Intl.Segmenter` word segments, which break
between Latin and Han, kana, or Hangul whether or not the speaker left a space.
A segment is routed when it has a letter and every letter is Latin. A segment
mixing scripts, such as Latin joined to Bopomofo, stays in the turn locale,
where no Latin producer reads it, so a host segmenter that failed to break
would lose routing, not precision. Full-width ASCII, meaning letters, digits,
and symbols such as `＠／．－｀`, folds to ASCII for reading only, index for
index, as does the ideographic space. The CJK sentence marks `，！？；` stay
unfolded so a URL or path tail still ends at the sentence. Committed text is
never width-normalized: only a rule that replaces a whole span changes it.

Width is decided by a word's script, not by its ledger. A Latin word is read
by its folded spelling in every turn, routed or not: fitting votes for a
full-width `Ｅｎｇｌｅｂａｒｔ` in an English turn exactly as it does routed out
of a Chinese one. Term collection never collects a full-width Latin spelling in
any locale, because a collected canonical becomes rewrite output, and it does
not count one as an opportunity either, since that would age the very term it
spells. An English or German turn's own matcher still reads a rule's form as
written, so a relation learned from a full-width spelling rewrites its
half-width spelling there and both spellings in a routed turn.

Routing keeps every existing contract of the routed ledger:

- evidence is keyed by the routed locale, channel, and form, so a relation
  learned from `我读了Englebart的论文` is the same `en-US` relation an English
  turn would teach, under the same four-turn gate, margin, precedence, kept
  evidence, and strikes;
- the routed ledger ages only on routed opportunities, and the turn's own
  opportunity still names every script it scanned, so a Latin term stored
  under a CJK locale before routing is retired at the ordinary cadence
  instead of living forever;
- a unique internal-edit relation still claims its source in the same
  ledger, so a routed misspelling with one target is not also collected as a
  word, while competing targets still suppress nothing;
- protected literals are checked on the text as written and again after
  width folding, so a full-width URL, email address, path, flag, code span, or
  identifier stays protected;
- an occurrence is relation evidence only where a word rule for its form
  could apply, so `@name`, `#tag`, and a hyphen- or underscore-joined word,
  in full width or not, neither vote nor offer an opportunity. Nor does a
  Latin word the internal-edit producer cannot read in any width, such as one
  holding a digit, an apostrophe, or a non-ASCII letter: no relation could
  name it, so its presence says nothing about a relation's absence. This
  holds for English turns as well. Term collection still reads such a word as
  a word.

Application is additive, and the turn's own locale keeps authority. In a CJK
turn the turn's own rules match first, unchanged. The `en-US` view of the same
channel then matches only graphemes the own rules left untouched and that
hold no non-Latin letter, and never a span that overlaps a complete form of
the turn's own rules, as written or width-folded. That holds even where the
own rule could not apply, for instance a word-boundary form written against
Han characters, so a human-confirmed `zh-CN` spelling of a Latin form is never
overridden by an automatic `en-US` relation at any spacing. A routed word rule
treats a CJK letter as a word boundary; digits, apostrophes, hyphens, `@`,
`#`, backticks, and any other letter still join the word, in full width too. A
turn without a Latin letter skips the routed pass entirely. Otherwise the
routed pass walks the routed view once per start and, near a routed candidate,
the own view at most twice per start, so the hot path stays bounded by the
grapheme count times three own-view and one routed-view longest forms. The
written channel routes the same way, which today reaches only human-confirmed
`en-US` written rules, because fitting learns spoken relations.

Of the product starters, `Engelbart` and `Morphogenesis` are `en-US`
internal-edit targets and are reached from routed words. `KFC` is an `en-US`
target in principle but has three graphemes, below the seven-grapheme edit
minimum, and an all-caps word is a protected identifier during matching.
`[p → q]` is a `zh-CN` lexeme whose two exact spoken aliases apply through the
turn's own rules; routing neither reaches nor overrides it, and a `zh-TW` or
`ja-JP` turn still does not receive it.

The rejected alternative was a separate `latin` pseudo-locale. It would split
one Latin name into two identities, depending on whether it was first heard in
English or Chinese speech; leave settings, which infer `en-US`, out of step
with learning; and give the qualified producer a ledger its corpus never
covered. Routing reuses the ledger, the producer, and the evidence semantics
that were already qualified.

A multi-word Latin phrase term, such as `Douglas Engelbart`, is deferred. It
would add listing, not correction: internal-edit fitting reads single words,
multi-word fuzzy fitting is out of scope, and the single word `Engelbart`
already carries the recognition error. Title-case collocations such as
sentence starts, headings, and `Machine Learning` recur often enough to be
collected, and the product already retired its former `Douglas Engelbart`
starter in favour of `Engelbart`. Admitting phrases would need a corpus of recurring names
against adversarial collocations with zero false collections, a precedence rule
between a phrase and its contained words, and a candidate bound that keeps the
33rd-candidate partial scan honest when one word opens up to three phrases.

## Commit boundary

Matter core does not depend on Wiki. It depends on one neutral material lexical
port whose `capture()` returns an immutable synchronous session. The browser
composition root adapts one compiled Wiki basis to that port; Store retains the
session, never the basis or coordinator. A session may return only ordered,
non-overlapping patches contained by the scenario's eligible ranges; the
neutral port validates and applies them. `MaterialIngress` validates the source
candidate, asks the session once, validates the changed candidate again, and
returns the one command the existing tree engine may publish. When the changed
candidate fails that final validation, only the suggestion is withheld: the
already validated source candidate becomes the command, and the content-free
ingress receipt records `canonicalizationWithheld`. A spelling rule may refine
spoken words or a valid model answer; it can never cost either. The exception
is a canonical candidate identical to the current material: an answer that
differs only by spellings the person's Wiki replaces is no change at all, so
it keeps its ordinary rejection rather than writing the replaced form. The
port does not own storage, network requests, interaction state, history, tree
mutation, or publication.

Replacements inspect only the original input. Output from one rule cannot
trigger another rule in the same commit. Matching is leftmost-longest,
grapheme-safe, boundary-aware, and skips protected literals such as quoted
text, code, URLs, email addresses, paths, flags, versions, IP addresses, and
identifier-shaped tokens. In `en-US` and `de-DE` turns, protection and word
boundaries also read full-width ASCII folded, index for index, so `＠name`,
`＃tag`, a full-width code span, URL, email address, path, or flag, and a
full-width joiner such as `－` or `＇` protect exactly as their half-width forms
do. Half-width text folds to itself, so its outcome is unchanged; the same
test decides what fitting and term collection may count. The trie itself
reads a rule's form as written, so a full-width spelling of an `en-US` or
`de-DE` rule's form is not rewritten in its own turn. A Chinese or Japanese
turn's own matching keeps the written-text protection, and Latin spans its
own rules left untouched are also matched against the `en-US` view they route
to; see [Script routing](#script-routing).

Human admission, a late repair of that admission, and a generated text turn
must each capture one lexical session for the complete synchronous preparation.
Late repair uses the exact session captured by the admission lease. A change in
another tab may therefore leave an in-flight operation on one complete older
generation, but can never mix generations inside one material command.

The adapter is fail-open but not authoritative. If capture throws or a session
returns a malformed result, the port becomes an identity suggestion and Matter
continues. If a coherent changed suggestion violates the final material
contract, Matter drops that changed candidate and keeps the validated source,
as above. Wiki can neither rescue an
invalid source nor veto otherwise valid unchanged material.

Elastic expansion is stricter than whole-text replacement. Source-carried
spans remain protected; only ranges proven to be newly generated are eligible
for Wiki. If that projection is ambiguous, it protects more text rather than
guessing. Matching runs over the complete final node text restricted to those
generated gaps, so word boundaries and protected literals see the real
neighbouring language rather than the edge of the answer.

### Occurrence attribution

Each applied edit may carry one opaque occurrence token. The Wiki session mints
it per edit from a secure random source (never from text or position) and
registers `occurrence → { rule, appliedAtRevision, origin }` in a bounded
in-memory registry owned by the Wiki runtime: room for 64 committed
occurrences (the driver's live bound) plus 64 uncommitted candidates, a 10 s
window for a token whose candidate never committed, and 5 min for a committed
one. Only an uncommitted candidate is ever evicted, oldest first, so a
candidate that never commits can never cost a marked word its attribution. A
registry full of committed occurrences refuses the next mint; that edit, like
one whose token was evicted or expired before its commit, is applied as an
ordinary corrected word without a mark, exactly as an edit beyond the live
bound is censored. Withholding it instead would cost the person the
correction, and marking it would promise a settlement nothing could record.
The rule is the exact `locale, channel, boundary, form, canonical` identity of
the compiled rule that matched, so a Latin span routed out of a Chinese or
Japanese turn settles against its `en-US` ledger, never the turn's locale;
`appliedAtRevision` is the session's `sourceRevision`; the spoken channel is
`human-admission` origin and the written channel is `generated`. The heard form
is always the text the edit actually replaced (a full-width match keeps its
full-width form), never a reconstruction from the rule. The neutral
lexical port checks only the token's shape (`[A-Za-z0-9_-]{1,64}`) and
uniqueness within one suggestion; a malformed or repeated token loses its
attribution, never its edit.

`canonicalizeMaterialText` returns its applied edits in output coordinates with
the form it replaced (`sourceText`). `MaterialIngress` maps attributed edits
into the committed node text for every stage: admission (only when the second
admission normalization leaves the canonical text untouched), repair (the whole
repaired node), Elastic (the final node text), and Text Swap (the swapped
segment or whole node at its start offset). Each mapped edit must land exactly
on its canonical form, or all attribution for that commit is dropped; an edit
whose heard form equals its committed word is not attributed, since nothing
visibly changed. A withheld canonicalization carries no edits, and an Elastic
answer whose generated gaps cannot be proven keeps its valid raw form with
canonicalization withheld rather than being refused. The content-free ingress receipt
lists `lexicalEdits: { start, end, occurrence }[]`; the heard form travels
only in the transient prepared value.

After a successful commit whose committed node still equals the text those
edits measured, the store calls one narrow port,
`publishCommittedLexicalOccurrences({ treeId, documentEpoch, nodeId,
nodeUpdatedAt, stage, channel, locale, edits })`, after its state update and
after the committed-observation call. Composition claims the tokens in the
registry and hands the browser occurrence driver only the edits it could
claim. The store
never learns that Wiki exists, and no heard form reaches store state, history,
a receipt, persistence, the archive, a model request, or a log.

Settlement consumes the registry entry before any write, so a repeated,
late, or expired id settles to nothing. A censored occurrence releases its
memory without loading durable storage. `coordinator.settle` records the rest:
informed acceptance and inspection take the soft byte-bound path; Keep and
revert report every failure; both rebase over a concurrent write because a
settlement addresses a rule, not a configuration view.

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
enter the spoken fitting index. A process-local weak receipt lets a deeply
frozen state that already passed every invariant reuse those unchanged indexes;
structured clones, persisted rows, and caller-authored objects still cross the
complete strict parser. The receipt is disposable and is never serialized.
Before hydration or after storage failure,
material uses the empty or last valid basis; only Wiki learning degrades.
One compiled basis is reused for durable publication. A content-free BroadcastChannel
message carries only the newer write generation so another tab can refresh its
own durable record. Burst generations coalesce behind one in-flight refresh;
completion loops only when the published basis still trails the highest seen
generation, and no storage progress stops the loop rather than spinning.
Observation CAS conflicts never replay a derived evidence batch. The background
admission FIFO rehydrates, rereads capability preferences, and re-derives term
and fitting evidence from the original human turn against the newer authority,
with a strict retry bound; an unsaved attempt never advances the durable
human-turn clock. The material commit itself does not wait for that background
work. The FIFO is bounded: at most 16 waiting turns and 64 Ki UTF-16 code units
of retained text. When a new turn would exceed either bound the oldest waiting
turn is dropped, a turn larger than the whole budget is dropped on arrival, and
the turn in progress is never interrupted; a content-free receipt counts
waiting, completed, and dropped turns. Learning is optional, so dropping one
turn costs one logical tick and never delays material. When an automatic batch
would exceed the byte budget, the coordinator retries already-known relations
and quiet aging without unseen allocations; if even that cannot fit, it becomes
a no-op and leaves current authority ready. Explicit decisions still return a
normal capacity error rather than being silently discarded.

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
cannot silently widen today's privacy boundary. The persistence modules that own
snapshot, undo-journal, and archive shapes may not reach Wiki either, even
through the shared database schema; `npm run check:architecture` holds both
rules.

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
- A Wiki suggestion that makes an otherwise valid result fail the scenario's
  final policy is withheld: the validated source commits unchanged and the
  receipt records `canonicalizationWithheld` (see
  [Commit boundary](#commit-boundary)). Wiki never publishes an invalid
  candidate and never costs a valid one; a canonical candidate identical to
  current material keeps its ordinary no-op rejection.
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

A word Wiki changed in admitted, repaired, or generated text settles once from
the heard form into the canonical one at its first perceivable arrival (about
half a second: a hold, a blurred crossfade, one sub-pixel shiver), then keeps a
dotted 1 px underline at 35% ink while its occurrence is unsettled. The render
contract lives in [`text-material.md`](text-material.md): Custom Highlights and
an inert world-space overlay, never a wrapped word. A tap on the marked word
opens one small popover at the word, in Point Talk's restrained field, offering
**Keep**, the literal heard form, and **Wiki…**. Its accessible name states the
change (“Wiki changed ‘P to Q’ to ‘[p → q]’”); it never starts Point and Talk or
a passage selection, and it respects the pen-and-palm touch commitment. Keep
confirms the alias; the heard form restores exactly that range as an ordinary,
pointer-undoable human text change, failing closed with a quiet “the passage
changed” line when the memento no longer matches; Wiki… opens the settings
dialog filtered to and focused on that canonical term and settles nothing;
Escape or an outside tap, once the takeover could be read, is an inspection.
The keyboard and touch reach the same takeover without aiming at the word: a
focused (entered by keyboard) or selected (on touch) passage adds one **Review
Wiki change** action per live, disclosed word to its passage actions, at most
three, each naming both forms and opening the takeover at its word with Keep
focused. While such changes are live the passage carries a count-aware
accessible description (“Wiki changed 1 word. Review it in this passage's
actions.”); no word is wrapped to say so. A fine pointer's hover actions never
grow over the word, which it taps directly. Only after a person invokes
correction from an erroneous word does the surface reveal what is necessary to
repair that visible occurrence. Rejecting the responsible automatic mapping
from the word remains reserved. A deeper Wiki configuration surface opens from
Matter settings for people who choose it. It presents one canonical term per tile and
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
personal-data format is `matter-wiki.json`; there is no import UI. Schema V6
stores scope explicitly, separates term recurrence from alias-relation evidence
into candidate-local ledgers, and records the producer family for automatic term
evidence. Strict V2 and V3 migration assigns `both` so an upgrade cannot silently
disable previously applicable authority; strict V4 migration preserves its
existing scope while splitting the former aggregate, and strict V5 migration
maps producer-less term evidence to a zero-authority legacy producer.
The repository writes that V5-to-V6 normalization back once with a monotonic
record generation. If the optional migration write cannot commit, the valid V5
row remains readable and a later ordinary write may converge it. Schema V7
stores evidence in quarter-observation units, adds kept evidence to every alias
row, and adds a bounded revert-strike ledger. Strict V6 migration multiplies
every stored support value by four, starts with no kept evidence and no
strikes, and preserves every former phase, gate, and projection; older schemas
migrate through the same scaling. Wiki record version 7 makes the repository
write that migration back once on load, with a monotonic record generation,
exactly as the V5-to-V6 normalization did. Raw rows are bounded by the schema
that wrote them. A row written by a newer Matter is not corrupt: this build
reports Wiki storage as unavailable, keeps the last basis, and refuses the
corrupt-row reset, so an older tab can never destroy a newer Wiki.
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

The released automatic baseline is deliberately broad in discovery and narrow
in authority. Automatic collection observes only successful human admissions.
Locale word segmentation may collect ordinary Latin, Han, and Japanese words
after recurrence; all-caps, internal-capital identifiers such as `OpenAI`, and
Katakana may surface after one turn. Ordinary title case does not receive that
shortcut. A Latin word of a Chinese or Japanese turn is classified in the
`en-US` ledger under English stop words and shape rules, so `OpenAI` said in
Chinese is the same term as `OpenAI` said in English and English glue such as
`with` is never collected. Stop words, numeric-only tokens, protected literals,
full-width Latin spellings in any locale, generated ranges, and malformed
ranges produce no evidence. A producer scans eligible
words in text order and stops before the 33rd distinct candidate: that turn is
a partial scan, which scores what it saw and ages nothing, because a candidate
absent from the scanned prefix may sit in the unscanned remainder. Host
`Intl.Segmenter` behavior must pass a pinned multi-locale conformance fixture or
collection fails closed.

Near-sound fitting is a local compiler, not a fuzzy hot-path matcher and not a
model feature. It rebuilds bounded disposable indexes only when Wiki authority
changes, observes spoken human admission only, and projects a relation into the
existing immutable exact-match index only after independent turns clear the
score and ambiguity margin. The product runtime currently releases one
conservative internal ASCII-Latin edit after four turns. It requires a bounded
single internal edit toward an eligible canonical target; a form that is itself
already canonical is a hard no-op authority. Its targets are `en-US` lexemes,
and it reads Latin words of English turns and Latin words routed out of
Chinese and Japanese turns. In any locale it cannot tell a misspelling from a
different real name exactly one internal edit away, such as `Engelhart` beside
`Engelbart`, and no corpus can prove otherwise. The four-turn gate and margin,
the hard no-op once that name is itself a canonical, and the revert and reject
paths are its mitigation.

Exact Double Metaphone identity, exact tone-bearing Mandarin pinyin identity,
and `an`/`ang`, `en`/`eng`, and `in`/`ing` final-pair normalization remain in the
offline qualification catalog only. Their deterministic implementations and
corpora are useful research evidence, but a transcript supplies neither audio
confidence nor semantic proof that one otherwise valid homophone should replace
another. They therefore cannot observe runtime evidence, project a rule, or
rewrite visible material. Single-character Chinese polyphones, cross-locale
matches, multiple candidate canonicals, protected literals, collisions, bucket
overflow, and insufficient human evidence abstain. Exact producer and resource
versions participate in disposable cache and qualification identity; changing
either cannot reinterpret durable human authority or tombstones.

Collection and fitting remain separate ledgers, but their events share one
admission boundary. One versioned producer precedence table owns every choice
between producers. When exactly one relation from a producer whose entry claims
its collection source targets an existing eligible canonical, that admission
does not also teach the same observed source as a new broad locale term. The
orthographic internal-edit producer claims its source, because such a form is
a misspelling rather than a word; pronunciation producers do not, because their
sources are often real words, and letting one become canonical is a deliberate
no-op veto on a risky rewrite. Multiple candidate targets do not suppress
collection and remain ambiguous. When two producers describe the same term or
relation in one turn, the lower rank wins regardless of event order, and tied
competitors order by rank and then code units. This narrow arbitration
prevents soft discovery from racing the more specific relation while
preserving every human-confirmed or already-collected canonical as a hard
no-op veto.

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
not promise an immediate correction: a relation still requires independent
observations from one qualified producer. The existing Wiki edit/remove surface,
immediate global pause, and human tombstones are the bounded takeover path.
Recognizer-time phrase bias and broader pronunciation distance remain **NO-GO**
until a concrete ASR adapter owns their privacy and evaluation contract.

## Automatic-learning calibration boundary

`wiki-learning-policy.ts` is the pure domain policy used by V7 evidence aging,
competition, occurrence outcomes, and offline calibration. It has no DOM,
persistence, provider, model, or settings dependency. Runtime projection
accepts only complete qualified release identities; a producer name or
preference alone cannot activate an automatic alias.

Record V7 keeps three facts apart:

- term evidence asks whether one canonical word should become a collected Wiki
  entry;
- alias evidence asks whether one particular local `form → canonical` relation
  may become provisional rewrite authority; and
- kept evidence records informed acceptance of that relation's applied
  occurrences. It supports retention and never activation.

Term frequency cannot contribute to alias authority. A successful human
admission is one logical clock tick and an identical candidate contributes at
most once in that tick. Each candidate owns a bounded quiet counter instead of
sharing a global cohort boundary. Every stored quantity is a saturating integer
in quarter-observation units:

```text
one observation = 4 units; support = min(1020, support + units)
observed:                              quiet = 0
absent from 32 comparable ticks:       support = floor(support / 2), quiet = 0
one observation therefore fades        4 -> 2 -> 1 -> 0

term candidate -> collected at support >= 8   (two observations)
term collected -> candidate below support 4   (one observation)
```

The unit change preserves every former gate exactly. What changes is memory:
short-range evidence still acts at once, while a remnant persists across three
half-lives instead of vanishing at the first, stays visible to competition,
and is evicted later, so newer evidence weighs more while older evidence still
counts. The first and second independent turns are meaningful immediately at
any position in the product lifetime; no global boundary can erase the second
vote. Thirty-two consecutive quiet comparable ticks are a candidate-local
far-horizon aging boundary, never an activation requirement. The retention
band prevents a collected term from flickering out at the first quiet horizon;
without new evidence it sinks at the next aging, while stronger repeated
support survives proportionally longer. A partial scan scores what it saw and
ages nothing. An automatic lexeme is listed only while its term is collected or
a relation, human decision, or tombstone depends on it; a demoted term keeps its
fading support in the ledger but no longer appears under `Automatically added`
or blocks a canonical form. Fully decayed machine-only candidates may be
evicted only when they have no authority, alias evidence, or tombstone. Human
decisions and product seeds never enter that eviction policy.

A full automatic reservoir (512 term rows or 512 relation rows) never refuses a
newcomer while an independent row can leave. Because a candidate ages only on
comparable turns, rows learned in another locale or script would otherwise
hold the reservoir forever after a person switches language. The newcomer
therefore evicts the weakest row that nothing depends on: never a human-owned
term, a product starter, an active relation, a row observed in the same turn,
or an identity that a relation, human decision, tombstone, or strike depends
on. Candidates leave before collected terms and relations with kept evidence;
then lower support, then the longest quiet, then code-unit identity decides.
Evicting a collected term also removes its automatic lexeme.

Alias evidence is producer-specific. The relation score is producer weight
times support: exact pronunciation producers have weight `3`; restricted
near-sound and internal orthographic producers have weight `2`; migrated legacy
evidence has weight `0`. Activation score `32` makes the earliest unopposed
gates three independent turns for exact relations and four for restricted
relations. Activation margin `16` accepts exact `3 versus 1` and restricted `4
versus 2`, but abstains on exact `3 versus 2` or restricted `4 versus 3`
(observations). Retention uses score `20` and margin `12`; a challenger never
inherits that lower gate. Kept evidence adds to the retention score of an
active relation and of its rivals; whenever no relation is active, ranking and
the activation gates use relation scores alone.
Competition is immediate counter-evidence, while one addressed human reject or
replacement bypasses the score and becomes durable authority. Production
projection supplies complete runtime-allowlisted identities for two term
producers and one fitting producer.
The offline qualification catalog also contains three higher-ambiguity
pronunciation producers, but qualification is not product authority. Evidence
stores the versioned producer family id; qualification admits it only while one
exact current release for that family is present. The
qualification parser enforces that a producer id ending in `-vN` matches
version major `N`, so any change that can alter candidate semantics must use a
new family id rather than reinterpret old machine votes under a new digest.
Merely adding source code, turning on a preference, or persisting old evidence still
cannot grant runtime authority.

Script routing did not need a new family. It widens which turns can present a
word to a producer, but the candidate function and what a stored vote asserts
are unchanged: an `en-US` internal-edit vote still says that one human turn
held that ASCII word one conservative edit from that `en-US` canonical, and an
`en-US` term vote still says that the word surfaced under English
classification. No older vote is reinterpreted, since before routing no CJK
turn could produce either. The releases therefore carry minor versions,
`latin-internal-edit-v2` 2.1.0 on resource `ascii-latin` 1.1.0 (which names the
route and the width fold) and both term producers 1.1.0, each requalified on a
version-2 corpus. The Latin corpus adds whole Chinese and Japanese turns:
routed positives including full-width, punctuation, and emoji; adversarial Han
transliteration, a different real name outside one edit, code-switched English,
a digit-joined word, a URL, an email address, a file path, a mention, a
hashtag, a full-width URL, email address, path, flag, mention, hashtag, and
code span, a full-width identifier, and the written channel; a two-name
collision, a two-brand collision, and a correct name that is already
canonical; and locale-isolation cases whose targets live in every locale
except the turn's Latin ledger. Corpus 1's `locale-isolation` case asserted
that a Chinese turn never reaches `en-US`; routing deliberately reverses that,
so the case was replaced by those isolation cases, not relabelled. Every Latin
action names the ledger locale, the stored form, and the canonical, so the
full-width positive proves the folded ASCII form is what is kept. The term
corpora likewise bind the ledger locale into every action.

Deciding width by script rather than by ledger moved the same releases again,
to `latin-internal-edit-v2` 2.2.0 on resource `ascii-latin` 1.2.0 and both term
producers 1.2.0, each requalified on a version-3 corpus; the families stay
unchanged for the same reason. Version 1.2.0 of the resource names the fold
for every Latin word and the rule that only a readable word is an opportunity.
The Latin corpus adds full-width English positives, a word and a sentence,
that store the folded form; a full-width digit-joined word; and full-width
German turns that reach no `en-US` target, in the German ledger or in
isolation. The term corpora add full-width English and German spellings, both
distinctive and ordinary, that are never collected.

These values are versioned calibration candidates, not evidence that a language
producer is ready. The bounded replay harness admits observations only from the
`human-admission` environment. Generated output and protected text produce zero
admission votes and do not advance the learning clock. Offline producer evaluation
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
closed. The generic verifier does not execute a producer and therefore cannot
prove that a self-reported receipt came from supplied bytes. Controlled local
harnesses close that gap for every catalogued producer: they execute exact hashed
producer artifacts, hash manifest-owned corpora and pinned resources, and
measure the complete 512-target derived-index bound plus 1,000 lookups. Each
harness records every vote a producer casts for a case, sorted, before it
derives the one application the verifier scores: votes that name different
targets for one source compete and apply nothing, every other vote applies,
and a case with more than one application reports them all, so an abstention
can never hide two votes. The qualification test pins that only ambiguity
cases carry competing votes and that every other non-positive case casts none. The
live wall-clock receipt runs three serial trials and records the best complete
trial as the uncontended host estimate; a sustained regression must exceed the
fixed gate in every trial. The
separate 5,000-entry human-confirmed dictionary bound is covered by admission,
removal/reopening, and over-bound recovery tests. The 15,000-row structural
lexeme ceiling exists only to load every formerly valid V2-V5 state and is not
an allowance for new human entries. Neither bound is misreported as the
automatic hot-index size. The persistence ceiling is 9 MiB plus a proved
256 KiB V5-to-V6 producer-field allowance and a proved 160 KiB V6-to-V7
allowance for the kept fields, one quarter-unit digit per evidence row, and the
two empty strike and settled-occurrence collections. Every committed receipt
reports zero
false applications for cases labelled adversarial or ambiguous by its frozen
corpus, plus zero cross-locale, protected, or generated applications, and stays
below the background-compile and hot-lookup budgets. That bounded result is not
a claim that an otherwise valid homophone is semantically unambiguous; the
separate runtime allow-list remains the product safety gate.
`npm run qualify:wiki` reruns the controlled receipts; source, resource, corpus,
or output drift invalidates the compact runtime identity. The synthetic generic
fixture continues to prove only the parser and gate.

The default-on learning policy has its own controlled receipt rather than
borrowing producer success. A manifest-owned replay (policy V4,
`scripts/wiki/qualification/learning-policy-v4.ts`) runs the production state
transitions, occurrence settlements, and projection over eighteen scenarios:
exact three-turn activation, restricted four-turn activation, ambiguity-margin
abstention and later activation, quiet decay and retention, quarter-unit
gradual decay, two-turn ordinary-term collection, non-comparable turns that do
not age, a routed Latin relation that activates from Chinese turns and ages
only on Chinese turns that contained Latin, a partial scan that scores only
what it saw, informed acceptance that
retains a used rule, generated-text implicit acceptance under the policy
switch (a forward guard; see [Occurrence outcomes](#occurrence-outcomes)),
two-strike reversion, strike-memory expiry, confirmed authority outside
scoring, two same-epoch reverts that strike once, duplicate delivery that
settles once, kept evidence that never re-activates a demoted relation, and
generated/protected zero-vote behavior. Its compact release binds
policy and scoring versions, all units, gates, weights, precedence, and
occurrence-outcome constants, the policy source digest, the exact
qualification catalog, corpus digest, and result digest. Any change to those
inputs invalidates `npm run qualify:wiki` until the expected replay is
deliberately requalified: rerun the controlled harnesses, confirm every
manifest scenario and producer decision still matches, then record the
reported digests. The manifest owns the expected outcomes; a requalification
may never edit an expectation to match an unexplained result.

Interaction evaluation is a separate labelled corpus. One exact applied
occurrence reaches exactly one terminal state:

```text
pending -> accepted-implicit | inspected-kept | explicit-confirm
        -> explicit-reject | explicit-replace | reverted | censored
```

A later independent application creates another occurrence; the first one
cannot award itself nested dwell, copy, export, or exit settlements. Censoring
stays neutral and is reported with its denominator, so evaluation cannot
improve by manufacturing attribution, and censored exposure is never counted as
either acceptance or rejection.

Material Undo and Redo are a separate tree-history system. Wiki neither
observes nor interprets them, and no Wiki authority, evidence, or terminal
metric changes because that history moved. If a material mutation removes the
visible address, the transient occurrence is censored without a Wiki event. A
revert chosen at the takeover is an ordinary pointer-undoable material change
whose settlement is `reverted`; it is not an observation of history. A future
Wiki reversal, if the product ever needs one, owns a separate explicit
decision, implementation, and persistence lifecycle. It may reuse strict
contract principles but never the material history framework, command types,
stack, or state. Protected text may never receive an application. The
interaction evaluator reports explicit, inspected, and implicit acceptances,
rejections (explicit reject, replace, and revert), unsafe attribution, false
implicit positives, generated exclusions under the policy switch, censor rate,
and decision latency on a fixed corpus, and can compare the alternative
generated-text setting. No arbitrary energy weights, adaptive optimizer,
telemetry, or online reinforcement learning enters the running product; the
weights stay versioned integers.

V7 persists term and alias evidence as separate bounded ledgers, records the
producer family for automatic term evidence, and keeps kept evidence, revert
strikes, and the settled-occurrence window bounded beside them. Legacy aggregate evidence migrates to a
zero-weight producer and therefore cannot acquire authority during migration.
Runtime-allowlisted fitting producers may project provisional rules only after
their own relation evidence clears the calibrated gate; closing `近音`
immediately selects the confirmed-only snapshot without deleting evidence. The
occurrence-outcome policy is pure domain policy; the running product emits it
through the attribution token, the browser occurrence driver, and the
render-edge disclosure described above. Occurrences do not survive a reload.

## Research translated into the boundary

Speech platforms place custom vocabulary at recognition time, but their own
documentation treats bias as probabilistic and warns that stronger boost can
raise false positives. The Web Speech draft likewise defines phrase bias as a
recognizer-owned likelihood boost, not a post-transcript truth source. Matter
therefore keeps phrase bias out of Wiki until one concrete recognition adapter
owns its privacy and evaluation contract:

- [Google Speech adaptation](https://docs.cloud.google.com/speech-to-text/docs/adaptation-model)
- [Web Speech contextual bias](https://webaudio.github.io/web-speech-api/#dom-speechrecognition-phrases)

Local dictation products demonstrate two useful but separable mechanisms:
repeated proper-name discovery and explicit deterministic replacement. Matter
adopts the former as bounded term evidence and keeps relation authority in its
separate alias ledger; it does not adopt prompt glossary injection or whole-
text correction diffs. See [Yap vocabulary learning](https://github.com/AkuchiS/yap)
and [Voquill personal dictionary](https://github.com/voquill/voquill).

The qualification harness uses exact, pinned dependencies rather than model
prompt glossaries: MIT-licensed `pinyin-pro` for deterministic tone-bearing
Mandarin keys and MIT-licensed `double-metaphone` for bounded English phonetic
codes. They remain inside offline qualification tooling and never enter the
product runtime or material bundle. The runtime allow-list is a separate
product-only manifest, and the production-artifact gate mechanically rejects
either offline phonetic package name. This trade keeps experiments reproducible
without claiming acoustic confidence or a full pronunciation lexicon. Their current
catalog qualification does not grant runtime rewrite authority; promoting one
would require a new explicit product decision and false-rewrite evidence.

- [pinyin-pro](https://github.com/zh-lx/pinyin-pro)
- [double-metaphone](https://github.com/words/double-metaphone)
