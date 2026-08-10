# Ask Matter record

This is the freeze for the product correction named in the active plan: Ask
Matter may keep a small local record that a person can return to only by
reopening Ask Matter. It creates no separate product surface. It is deliberately
not conversation memory, material, or hidden retrieval.

## Scope

One record belongs to one `treeId`. It contains at most 20 **completed**
question/answer exchanges, in visible order. A completed exchange contains the
question, the answer or its stated unavailable outcome, its local creation
time, and a compact receipt of the context that was used. Drafts, speech
partials, pending requests, provider messages, raw audio, and a copy of the
material context are never retained.

The compact receipt names only `{ treeId, revision, scope }`; it is evidence
for a person reading an old exchange, not a way to reconstruct or silently
retrieve material. A record may never be supplied as context to `/api/inquiry`
or a generative material turn. Asking again always projects current visible
material through the existing bounded context projector.

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

## Export and migration

Matter `0.2` ZIP remains material-only. It does not silently include questions
and answers in an archive that has historically meant durable thought material.
A later explicit record export/import needs a new, separately versioned archive
envelope and an opt-in UI. Database upgrades treat missing records as empty;
they never infer a record from a current transient composer.

## Proof boundary

- completed record reloads for its own document, while draft and pending work do not;
- a changed material revision preserves old visible exchanges but never gives
  them authority over a new request;
- internal clear, quota, malformed data, and cross-tab generation conflict
  cannot modify material or command history;
- only bounded, terminal outcomes are encoded; provider content and material
  context never enter routine logs;
- an archive round-trip leaves the record absent unless a future explicit
  record transport is selected.
