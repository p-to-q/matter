# Ask Matter record

This is the persistence boundary for the product correction named in the active
plan: Ask Matter may keep a small local record, but reopening Ask Matter always
starts clean and does not replay it. It creates no separate product surface. It
is deliberately not conversation memory, material, or hidden retrieval.

## Scope

One record belongs to one `treeId`. It contains at most 20 **completed**
question/answer exchanges, in chronological order. A completed exchange
contains the question, the answer or its stated unavailable outcome, its local
creation time, and a compact receipt of the context that was used. Drafts, speech
partials, pending requests, provider messages, raw audio, and a copy of the
material context are never retained.

An answered outcome retains at most one complete 3,200-code-point value. The
same bound is enforced before presentation, at the wire, and when a record is
decoded; a longer provider value becomes unavailable rather than a stored
fragment.

The compact receipt names only `{ treeId, revision, scope }`; it is not a way to
reconstruct or silently retrieve material. A record may never be supplied as
context to `/api/inquiry` or a generative material turn. Asking again always
projects current visible material through the existing bounded context projector.

## Ownership and storage

The record lives in a versioned `InquiryRecordRepository`, separate from the
`ThoughtTree` snapshot and its forward/inverse journal. The browser implementation
uses a separate IndexedDB store and generation-checked writes. It exposes only
`load(treeId)`, `save(record, expectedGeneration)`, and `clear(treeId,
expectedGeneration)` to its presentation owner. A later system folder, account,
or sync adapter implements that same port; neither changes tree serialization
nor becomes a second browser-owned document model.

A save failure leaves the current exchange in memory and makes its unsaved state
explicit inside the inquiry. A generation conflict never overwrites another
tab's record. Closing the inquiry only closes the bubble; it does not erase a
saved record. The repository retains its complete-record clear operation for a
future system/account adapter or recovery flow, but the first-release inquiry
does not expose a record-management action. There is no per-message deletion
shape.

The writer serializes load, append, conflict rebase, and clear work outside the
React view lifecycle. An accepted exchange remains assigned to its addressed
`treeId` when the visible document changes before an initial load or save
settles. UI state may ignore that old-tree completion, but storage work does not
change owners or disappear. Clear advances the record epoch; an append that was
based before that boundary is discarded rather than resurrected, while an
answer accepted after clear queues behind its tombstone as a new record. A
replaceable repository adapter that rejects instead of returning a typed result
is normalized to the same unavailable/write-failed seam.

## Export and migration

Matter `0.2` ZIP remains material-only. It does not silently include questions
and answers in an archive that has historically meant durable thought material.
A later explicit record export/import needs a new, separately versioned archive
envelope and an opt-in UI. Database upgrades treat missing records as empty;
they never infer a record from a current transient composer.

## Proof boundary

- completed record reloads only for its own document, while the inquiry itself
  still opens without an exchange and draft and pending work do not reload;
- an exchange accepted while its initial load is pending persists to its own
  tree even if the view switches first; rapid appends serialize against the
  latest durable version, and clear ordering cannot resurrect a stale epoch;
- each request writes only its original `{ treeId, revision, scope }` receipt;
  ordinary material, scope, lineage, selection, and tab-visibility changes do
  not erase that captured read-only answer, while a different local document
  owner, explicit close, AI-surface switch, page exit, or unmount revokes it;
- internal clear, quota, malformed data, and cross-tab generation conflict
  cannot modify material or command history;
- only bounded, terminal outcomes are encoded; provider content and material
  context never enter routine logs;
- an archive round-trip leaves the record absent unless a future explicit
  record transport is selected.
