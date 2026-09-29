# Markdown Snapshot

Need: a thought tree must round-trip through nested Markdown that a person can
export, inspect, rename for readability, and later reopen without losing identity
or order.

Useful prior art: Obsidian's real files, Logseq/Roam UUID identity, Git's lexical
directory order, and strict document validation in ProseMirror. The important
lesson is to separate identity from path.

Mirage's Apache-2.0 virtual filesystem was reviewed at commit `a1668482` for
freshness and metadata mechanisms. Its level-triggered watch invalidates a path
and ancestor listings before delivery; its bounded queues coalesce changes and
degrade overflow to subtree re-inventory. Matter borrows that recovery rule for
future external-directory work, not its runtime. One local `ThoughtTree`
publication is already an exact, synchronous change signal, so a watcher,
mount dispatcher, file-byte cache, and backend registry would be a second model.

Current logical format:

```text
matter/
  matter.json                 tree-level metadata
  index.md                    root node
  001-readable-slug/
    index.md
```

- node identity and times live in frontmatter;
- parent/children derive from nesting;
- sibling order derives from the numeric prefix;
- slug text is readable but non-authoritative;
- `matter.json` contains tree id, protocol version, snapshot revision, and an
  optional document title;
- invalid, duplicate, unreachable, or version-mismatched input is rejected.

The codec is independent of storage. IndexedDB automatic durability is not
user-visible. The codec exposes a strict logical bundle, not a browser API:

```ts
type SnapshotBundle = {
  files: Readonly<Record<CanonicalRelativePath, string>>;
};

treeToBundle(tree): SnapshotBundle;
bundleToTree(bundle): ThoughtTree;
```

`treeToBundle` is deterministic. `bundleToTree` decodes into memory, validates
every path and file, constructs a candidate tree, then performs schema and full
tree-invariant validation before returning anything.

`matter.json` is UTF-8 JSON with exactly `protocolVersion`, `treeId`, `revision`,
and optional `title`, written with stable key order and LF. An empty tree
contains only this file. A rooted bundle additionally has exactly one
`matter/index.md`. Node frontmatter accepts exactly `id`, `createdAt`,
`updatedAt`, and the optional `role: document-root`; duplicate, unknown, or
other role values fail. Markdown is UTF-8 and LF without content normalization.

Child directories are numbered contiguously from `001`. The display slug is
NFC-normalized, lowercase where applicable, whitespace and reserved path
characters collapse to `-`, repeated/edge hyphens are removed, and output is
bounded to both 48 Unicode scalar values and 48 UTF-8 bytes; empty output becomes `thought`. Paths use
`/` only. Renaming a slug may produce different bundle bytes, but decoding must
produce the same tree identity and sibling order.

## Runtime and export

Automatic durability uses one row per tree, not one OPFS file per Markdown
node, plus one record per retained undo step:

```ts
type StoredSnapshot = {
  storageSchemaVersion: 1;
  treeId: string;
  treeRevision: number;
  writeGeneration: number;
  bundle: SnapshotBundle;
  historyJournal: {          // manifest of this row's undo records
    formatVersion: 1;
    epoch: number;
    writeGeneration: number;  // repeats the row's, so a copied manifest is stale
    treeRevision: number;
    undo: [first: number, end: number];
    redo: [first: number, end: number];
    count: number;
    bytes: number;
  };
};
// object store `historyEntries`, key [treeId, epoch, stack, position]
type StoredHistoryEntry = {
  formatVersion: 1; treeId: string; epoch: number;
  stack: "undo" | "redo"; position: number;
  commandId: string; source: TreeCommand["source"];
  inverse: TreeCommand; retainedInverseBytes: number;
};
```

Load always calls `bundleToTree`; it never casts a stored `ThoughtTree`. A commit
updates memory immediately and enqueues a save. One write runs at a time and one
latest pending bundle is retained. Inside one IndexedDB readwrite transaction,
save compares the tab's base `writeGeneration` and increments it on success.
Mismatch is a recoverable `PERSISTENCE_CONFLICT`, never last-write-wins; this
also covers two tabs producing different trees with the same tree revision.
Two tabs that commit the same revision with byte-identical bundles (both
relocalizing an untouched seed, say) are not in conflict: the losing save adopts
the stored generation, with an empty journal basis so its next save rewrites
its own steps whole. The conflict control explicitly reloads and hydrates the
newer validated stored tree, clearing local history. It never advances the
stale generation and never labels the dirty local tree saved. If a newer local
commit arrives while reload is in flight, hydration is refused and the conflict
remains visible.

Every replacement of the loaded document by a stored row (first load, another
tab's newer row, and the explicit reload) is two-phase. The controller reads the
row and returns a candidate without adopting its basis; until then the first
load stays in its loading phase. Adoption is one synchronous step: the
controller first refuses a candidate that went stale since the read (another
document, terminal storage, local material, or a different conflict) without
hydrating anything; the store then hydrates it only by compare-and-swap against
the exact tree the caller expects (the seed for the first load, the tree last
handed to the controller for a refresh, the held conflict tree for a reload);
and the controller adopts the row's basis, with the store's history notice,
only after the store accepted it. A refused hydration holds a conflict with the
live material instead, so a commit made after storage was read, including one
the store holds but has not yet published, is never overwritten and a later
save still meets the newer row through its own generation compare. A save or
import reservation that expects a generation but finds no row reports
`PERSISTENCE_CLEARED` rather than recreating the row; the controller reaches the
same terminal state when a generation read, refresh, or reload finds the row it
last saved missing. Before this tab has saved, a missing row is a first run.

Runtime persistence state tracks base generation, persisted revision, queued
revision, dirty revision, error, whether the tab holds unsaved material the
person made (a pending or in-flight write of it, or an import), whether an
archive may replace material storage refused, a blocked upgrade, and the
history notice, and where a conflict came from: another tab's row, or a row
this tab never read — material that changed while the first load was in
flight, or a first save after a failed load meeting a stored row (the line then
says the page and stored material differ, never that another tab exists). Write failure does not
roll back material; pointer retry saves the
latest dirty bundle for transient write failures; generation conflict instead
requires explicit reload. Browser crash between commit and IndexedDB completion
cannot be promised away.

### Other tabs and the page lifecycle

Every committed save, activated import, rollback, and repair is announced on the
`matter.document-generation.v1` BroadcastChannel as `{ version: 1, treeId,
generation, schema }`, never material. A receiver ignores a generation it
already holds. With no write or import outstanding it applies the newer row only
while the material is idle — no admission, no submitted or composed Point-and-Talk
request, no Elastic request or parked result, nothing typed or awaited in Ask
Matter, and no open name editor — the same material-turn reporting that gates
seed relocalization, extended to the two holders bound to the document
instance. Hidden and visible tabs wait for the same idleness; a visible tab
also waits for a released pointer, and a pointer whose release never arrives is
ended by window blur, a lost capture with no button held, or a move with no
button held. Idleness is asked again after the read, before hydration. A
broadcast that arrives during a refresh is applied after it. With a write
waiting the newer row is a conflict immediately. A frozen or
back-forward-cached page misses broadcasts, so `visibilitychange` to visible
and `pageshow` with `persisted` perform one read-only generation lookup treated
the same way. Web Locks are not used: the generation compare already lives
inside one transaction, and a long-held lock would make pages ineligible for
the back-forward cache. The watch lives in `stored-generation-watch.ts`, the
unload rule in `unload-guard.ts`, and the superseded reload in
`superseded-reload.ts`, each with an injectable window and document.

A hidden page no longer requests a flush: publication already starts the one
write immediately. Authorship belongs to the store: its untouched tree is the
material this document instance began as (the seed, a hydrated row, or an
imported archive), carried forward by seed relocalization only while nothing
else changed it. The controller counts only material that differs from it as
unsaved, and before the first load is reconciled authorship alone answers
(`holdsUnsavedPersonMaterial`); both exit guards use that one answer.
`beforeunload` is attached only while such material is at risk — changed while
stored material is still loading, refused by storage, or still writing after one
second — and removed as soon as that ends. An untouched seed, a stored row, or
their relocalization never arms it, so a browser that refuses storage does not
prompt on every exit.

A newer schema is terminal for an older tab. `blocking` closes its connection
and every later operation reports `PERSISTENCE_SUPERSEDED` without reopening;
`VersionError` on open means the same, and a row whose `storageSchemaVersion`
is newer is superseded, never corrupt, so Repair cannot let an older build
overwrite it. A deletion from another tab (`blocking` with no new version) is
`PERSISTENCE_CLEARED`, equally terminal. Such a tab offers only an export from
memory and a page reload. A superseded tab reloads by itself only while it is
hidden, nothing the person made is unsaved, and the material is idle, and at most once per
minute: the time of the last automatic reload is kept in session storage so a
reload that serves the same older build cannot loop, and without session
storage it never reloads by itself. A visible tab keeps the line and Archive's
Reload. The newer tab, when an older one does not close, keeps waiting and says
so.

Under storage pressure the save first reclaims recomputable caches (model labels
beyond one maximum document; never a manual name) and retries once, then sheds
durable undo steps as described below. WebKit's full-disk `UnknownError`
classifies as storage-full, and a connection WebKit reports as lost is reopened
and the operation retried once. A same-document archive import normally waits
for unsaved material, but after a full or failed write the person may confirm
replacing the refused material with the archive; the reservation then compares
against the row this tab last loaded or saved, and a refusal (storage still
full) keeps the unsaved material and its error. An import refused over unsaved
material says why: a save still in flight, a held conflict, a damaged row, or
material waiting to be saved. `navigator.storage.persisted()` is read at
startup; `persist()` is requested only inside Export, Retry, or Replace, and
synchronously as the gesture's first act, because some engines honour it only
while the gesture's activation lasts. Most refusals are silent engine
heuristics, so a refusal only quiets Retry and Replace for seven days; Export
always asks again, and a grant forgets the refusal. Archive says that an
exported copy is the safeguard when storage is not persistent.

Continuous editing does not add a debounce window: the controller starts the
first save immediately, permits one write at a time, and replaces at most one
pending value with the newest complete tree plus history. An exact tree/history
reference already owned by the in-flight or pending save is ignored. This
reference check does not widen the existing saved-state rule: after a revision
is saved, that revision remains authoritative. A structurally divergent value
claiming the same revision violates the caller invariant and is not promised a
second write. Nothing pretends that a browser can synchronously guarantee disk
completion while suspending or crashing.

The canonical slug allocator stops once the persisted 48-scalar/48-byte prefix
is decided, but produces exactly the same normalized path as the original
whole-string replacement grammar. The decoder reuses one UTF-8 encoder and
counts each path once. `npm run bench:persistence` records the deterministic
2,000-node codec/JSON/structured-clone profile and a local Chromium IndexedDB
profile. On the 2026-08-22 development machine, the realistic encode median
moved from 24.74 ms to 11.56 ms; the 2,000-node, maximum-text median moved from
125.83 ms to 18.42 ms. The corresponding serialized rows with empty history
were 1,282,656 and 13,063,261 bytes. Headless Chromium 151 measured a synthetic
12.27 MB row at 9.2 ms median synchronous `put()` clone and 9.6 ms through
transaction completion. These receipts compare implementations on one machine;
they are not device or quota promises.

### Undo journal (schema v6)

Undo is bounded at 1,000 steps and 32 MiB of exact inverses across both stacks
(see [`history-and-undo.md`](history-and-undo.md)), so the journal is stored per
step rather than inside the row. The v5 row rewrote the whole journal on every
save and recovery replayed every step through the engine: 17.9 s of main thread
for 2,000 nodes × 2,000 commits. `persistence/history-journal.ts` owns the
layout; the repository executes it.

- **One transaction.** Save opens `snapshots` and `historyEntries` together:
  compare the row's generation, put the row with its manifest, put the steps
  that reached a stack since the last save, and range-delete every record of the
  tree outside the manifest (other epochs, positions below or above each stack).
  Nothing else writes `historyEntries`. The controller keeps the returned
  generation and journal layout as one basis; they change only together.
- **Positions, not rewrites.** Each stack is a run `[first, end)`. Commit, undo,
  redo, and eviction only push, pop, or release the oldest end, and entries are
  matched by identity, so several commits between saves collapse to their net
  change and an ordinary save writes one record.
- **Constant-cost recovery.** Load reads the row and the newest `maxEntries`
  positions of each stack in one readonly transaction. Material renders as soon
  as the bundle is valid. History attaches after an O(entries) shape check
  (known source and mutation kind, `expectedTreeId`, byte bound; manifest count
  and bytes when stacks are read whole) and a dry-run of only the next Undo and
  the next Redo. Every deeper step is validated by the engine at use, which
  refuses any memento that no longer matches, so exactness holds.
- **Truncate and say so.** A stack keeps the steps above its newest missing or
  unreadable record, since exactly those remain reachable; a failed top or a
  step that fails at use releases its whole stack. A restored step's stored byte
  count is compared with its memento when it is first applied, so a damaged
  count fails closed instead of escaping the byte bound. The next save persists
  the release even when the material revision is unchanged: the controller
  skips a publication only with the history last saved or loaded whole, and a
  read that released steps never counts as loaded whole. The row then names
  only records that exist, so the notice does not return on the next reload;
  the footer carries it once. A "released" notice
  ends when a save keeps the whole history again, and a shed never hides an
  unread "unavailable" one. A manifest in another format
  or one that no longer repeats its row's generation and revision is unusable:
  material loads, history is released with the same notice, and the next save
  reclaims the orphaned records.
- **Migration.** The v6 upgrade only creates the store. A row that still has the
  v5 inline `history` is parsed on load (newest steps above any unreadable one,
  then the bound); its first save writes records plus manifest and drops the
  inline field. Release risk: once any tab has opened v6, a deployment rolled
  back to a pre-v6 build cannot open the database (`VersionError`). Local
  material is then unavailable in that build (superseded), not destroyed;
  redeploying v6 or later makes it readable again. A rollback plan must say so.
- **Epochs.** An import writes the next epoch and never deletes the replaced
  row's records, so a rolled-back import restores the previous manifest and its
  records intact. A rollback adopts the restored generation only when the
  replaced row is the one this tab's basis described; otherwise the next save
  meets the newer row as a conflict. Later saves compact every other epoch.
  Corrupt-row replacement is different: nothing can roll it back and the damaged
  row's journal is never trusted, so it writes the journal it retains into the
  next epoch and deletes every other epoch's records in the same transaction.
  It sheds under storage pressure exactly as a save does. A replacement storage
  still refuses leaves the damaged row, its exported basis, and the corrupt
  status in place, so Replace can be tried again; Retry and archive
  replacement stay closed, because both would compare against a row this tab
  never read.
- **Material before history.** When storage refuses a save, the controller
  retries the same transaction with half the durable undo bytes, then none, then
  no redo, and records the release; only a snapshot that cannot fit alone
  reports `PERSISTENCE_STORAGE_FULL`. The shed retention holds until a later
  save finds, in `navigator.storage.estimate()`, room for twice the whole
  in-memory history plus 1 MiB; that save tries full retention first and the
  notice ends when it lands. A refusal falls back to the shed retention within
  the same save and stops further attempts for the document epoch, because the
  estimate evidently overstates this engine's room; Retry after a failed save,
  an adopted row, or a new document starts from full retention again. The tab
  keeps its whole in-memory history, so the notice says older steps will not
  survive a reload.

`npm run bench:persistence` records both sides. On 2026-09-29 (Node 22.20), a
2,000-node tree with 1,050 commits (bounded to 1,000 steps) recovered in 9.35 ms
median, against 8,786 ms to replay the same journal; planning an unchanged save
took 0.05 ms and wrote no record. Headless Chromium 153 with a 31.2 MB,
1,000-step journal beside a realistic row measured a per-step save at 2.9 ms
median (row, one record, six range deletes), recovery at 43.8 ms median, and the
v5 layout's inline 31 MB rewrite at 25.9 ms per save. A run on the same machine
under concurrent load measured about twice each figure; these receipts compare
layouts, not devices.

The Vitest suites run the repository over an in-memory IndexedDB double for
fault injection. `npm run proof:persistence` (also the last step of
`bench:persistence`) bundles the same repository, journal, and controller into
headless Chromium and checks them against the real engine: a randomized
commit/undo/redo/shed/save session whose stored records always equal the
manifest, two connections racing from one generation (exactly one wins, the
other conflicts, storage matches the winner), a put that throws while issued
(nothing commits), the v5 upgrade (other stores intact, lazy migration), an
older build's `VersionError`, and quota: at 1.5 MB material saves with 199 of
400 undo steps and a "released" notice, at 20 kB the snapshot alone does not fit
and the save reports storage-full with nothing written.

The material-index footer is deliberately not a recovery control, but it no
longer claims the material is kept when it is not. Its one localized line under
the non-account identity reads, until resolved: "Not saved on this device"
(write failed, storage full, damaged row), "Not saving in this browser"
(IndexedDB unavailable, as in a private window), "A newer copy is open in
another tab" (conflict), "A newer Matter is open in another tab" (superseded
schema), "Local storage was cleared" (by another tab or by the browser), "This
page and stored material differ" (the page met a stored row it never read), "Close other Matter tabs to finish updating" (blocked upgrade), or the
history notice; otherwise the local-device line, with a brief saving phrase
while a write is in flight. An attention line carries a static ink dot, is
announced once through a polite live region that sits outside the index (a
closed index is `aria-hidden` and inert, and must not silence it), and its only
action is opening Archive; the Archive button carries the same dot, and the
narrow drawer's closed toggle carries one static dot for both risk and notice
tones. There is no
toast, banner, or modal. Conflict, storage-full, generic save failure,
corrupt-row export/repair, retry, reload of stored material, and the terminal
export-and-reload path are owned by the explicit Archive panel, so a durable
failure remains recoverable without becoming permanent status chrome.

The outline relationship grammar stays pure, local, and presentation-only. For
each same-parent group in the current visible outline:

- if at least one sibling is a structural branch, every leaf sibling receives a
  local terminal point; if all siblings are leaves, every leading slot is blank;
- a structural branch receives its disclosure instead of a point;
- only a currently expanded branch disclosure may start a guide, and only when
  the flattened outline contains at least one visible interior row before the
  next same-parent sibling control (`toIndex - fromIndex > 1`). It connects to
  that sibling's disclosure or local terminal point. A collapsed arrow, an
  immediately adjacent row, a point, or a blank slot never starts a segment;
- the guide runs in the parent's indentation lane and leaves stable clearance
  around its source disclosure and the target row's disclosure or point.
  Because adjacency belongs to siblings rather than flattened row indexes, the
  segment between two root-level branches may pass the first branch's visible
  descendants. Folding those descendants removes the segment until expansion
  makes an interior row visible again;
- when a group contains at least two direct siblings and its final sibling is
  an expanded structural branch with visible descendants, that branch receives
  one scope tail instead of needing a fictional next sibling. The vertical part
  stays on the source disclosure axis and ends at the branch's last visible
  descendant row; a rightward run of at most 14 px closes in indentation air.
  It retains 2 px before a blank lane, 4 px before a terminal point, and 8 px
  before a disclosure or restore control, retracting further as indentation
  compression approaches another leading control.
  The tail is absent for a singleton, collapsed or held branch, and never makes
  a descendant into an endpoint;
- disclosure, local terminal point, and blank leading space are mutually
  exclusive. A held branch's restore `+` owns that slot alone and never stacks
  with a point.

Thus an all-leaf child group is blank. In a leaf / branch / leaf group the rows
read point / disclosure / point: the first transition has no guide and the
second has disclosure → point only while the branch is expanded and its child
creates a visible interior row. That branch's sole all-leaf child stays blank.
Collapsing the branch makes its point sibling immediately adjacent, so no short
connector remains. In a branch / branch group, the first expanded branch may
lead to the second across its descendants; if the second is expanded, its tail
closes only the second branch's own visible range. Selection replaces every
leading mark with a checkbox on the same axis and recomputes these guides from
the complete subtree it actually presents; it does not erase structural
relationships merely because the operation changed. Search, local fold
projection, and virtual-window clipping may omit, recompute, or clip visible
relationships, but cannot change their parent, bridge across a leaf,
manufacture an endpoint, or turn geometry into structure. In particular, a
virtual window may expose only a vertical piece of a tail; it may draw the
rightward close only when the structural last descendant is mounted.

Automatic durability stores the bounded undo journal as per-step records beside
the validated bundle. A history that cannot be recovered never withholds valid
material; what is released is announced once rather than silently replaced by
an empty journal. The portable Markdown archive deliberately excludes runtime
history.

A corrupt IndexedDB row is not retried against an unknown generation. Matter
first produces a bounded recovery copy of that exact row, then replaces it only
if the same serialized row is still present in the readwrite transaction. A
late export or a row changed by another tab loses authority instead of erasing
the newer value.

Load accepts only the exact protocol version and complete valid tree. It never
casts, partially restores, or silently migrates. Requesting persistent browser
storage is a progressive safeguard, not a promise; explicit export remains the
recovery boundary.

The default cross-browser return path is ZIP export and ZIP import of the same
bundle.
Directory export through `showDirectoryPicker()` is progressive enhancement
because it requires user activation and is not supported in every target
browser. When ZIP lands, `fflate` is preferred over implementing archive and CRC
logic locally.

The logical bundle is bounded to 18 MB so every valid 2,000-node tree, including
maximum high-byte text and maximum canonical paths, can encode before archive
transport applies its tighter input checks. Archive transport first bounds compressed bytes. During and after decompression
it bounds entry count, path bytes/depth, per-entry declared and actual bytes, and
total declared and actual bytes. It rejects empty or dot components, repeated
separators, directory records, non-regular entries when exposed, absolute or
drive paths, backslashes, control characters, NUL, `..`, non-NFC paths,
Unicode-normalized/case-folded duplicates, unexpected files, and anything except
one top-level `matter/` directory. Transport produces a bundle in memory;
`bundleToTree` and complete tree validation run before a single document-import
commit. Archive work uses an asynchronous boundary and cannot block pointer
interaction at maximum bounds. The import attempt therefore carries the current
tree id, revision, and document epoch across preparation and revalidates them
immediately before the synchronous runtime switch. A foreign tree id is
rejected before any reservation because the first release has no
durable active-document pointer. A stale same-document reservation is adopted
before the newest pending local material drains.

Directory export, if offered, creates a new directory rather than overwriting an
old one, so a renamed slug cannot leave stale node files behind.

Portable snapshot round-trip covers the `ThoughtTree`, not runtime command or
undo history. IndexedDB restoration separately carries the bounded undo journal
described above.

Rejected for `0.2`: path identity, a flat heading outline as the canonical form,
a duplicated `tree.json` containing structure, binary/database-native export,
one OPFS file per node for autosave, and CRDT-native storage before collaboration
exists.

Required proofs: empty/rooted tree → bundle → tree identity; deterministic paths
and bytes; manual slug rename → same tree; malformed frontmatter, duplicate
ids/order/path, unreachable node, and version mismatch rejection; IndexedDB
reload, coalescing, generation conflict, quota, and retry; undo journal
round-trip, per-step writes, corrupt and missing records, stale or foreign-format
manifests, v5 migration, import epochs with rollback, and quota shedding;
cross-tab generation refresh and conflict, two-phase adoption refused by the
store, the material-idle gate (including a hidden tab holding a submitted AI
turn), pointer-release recovery, returning-page check, superseded and cleared
storage (including a missing row), the one-shot superseded reload, the unload
guard's authorship rule, same-revision adoption, and replacing refused material
by import; ZIP export → import;
traversal, Unicode/case collision, compressed/expanded size, path depth, and
entry count limits. Picker absence or cancellation never removes ZIP return.

Platform context: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API),
[origin-private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system),
[persistent storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist),
and [`showDirectoryPicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker).
