# Persistence recovery audit

Status: execution-ready research packet, not a binding contract.

Historical audit baseline: the later closure wave implemented and passed native
R1–R5 on a source-bundled artifact of the actual owners. Its current receipt and
retained artifact identities are in [`closure-wave.md`](closure-wave.md).
The missing-proof inventory below describes the audit's starting point, not an
absence of today's runner; a deployable recovery build and byte reclamation
remain unqualified. The research acceptance conditions are preserved intact.

This note records the evidence and missing proof for the IndexedDB v7 boundary
and future image-blob compaction. It does not authorize a database upgrade,
release, migration, deletion, storage clear, or compaction implementation. The
current contracts remain
[`product.md`](../product.md), [`principles.md`](../principles.md),
[`material.md`](../material.md), and the binding portions of
[`virtual-file-system.md`](virtual-file-system.md).

## Decision summary

- The source has a narrow, constant-time physical database v7 upgrade: it adds
  the empty `blobs` store and its `storedAt` index. Unit tests describe this
  boundary, and a real-browser proof script contains a v6-to-v7 case.
- This is not yet a release recovery receipt. The present `npm run check`
  script does not invoke `npm run proof:persistence`; this audit ran neither
  command and opened no browser database.
- Once an origin has opened physical database v7, a build that requests v6
  must receive `VersionError`. Recovery therefore means deploying a v7-aware
  forward recovery build, never downgrading the database or treating a v6 build
  as a usable rollback.
- Image blobs are durable person-held bytes, not a cache. The repository can
  put, get, and list them, but cannot delete them. Unused-byte compaction is not
  implemented.
- Compaction is unsafe until it proves every durable and live root, coordinates
  writers across tabs, applies a grace boundary, and deletes nothing whenever
  authority is incomplete or malformed.

The safe default requiring no further product decision is to keep the v7
release gate closed and to reclaim zero image bytes. A disabled image-generation
surface does not avoid the schema upgrade, because opening the current database
owner is sufficient to move the origin to v7.

## Version vocabulary

These version domains are independent:

| Domain | Current source | Meaning |
| --- | --- | --- |
| Physical IndexedDB | `MATTER_DATABASE_VERSION = 7` | Object stores and indexes for `ptoq-matter` |
| Snapshot row | `storageSchemaVersion: 1 \| 2` | `2` means the serialized tree carries an image pointer |
| History journal | `formatVersion: 1`, store introduced at physical v6 | Per-step Undo and Redo records |
| Image blob row | `storageSchemaVersion: 1` | Verified bytes and image metadata keyed by SHA-256 |
| Wiki row | `WIKI_RECORD_SCHEMA_VERSION`, currently `7` | Codec for the value in the existing `wiki` store |

The equal `7` values for the current physical database and Wiki record are a
coincidence, not a coupling. A proposed Wiki record V8 is not physical
IndexedDB v8. Changing the Wiki row codec alone does not justify changing
`MATTER_DATABASE_VERSION`; a physical bump requires an object-store or index
change with its own compatibility and recovery proof.

## Current owners and evidence

### Physical database and lifecycle

`features/matter/persistence/matter-database.ts` owns the database name,
physical version, stores, indexes, upgrade callback, blocked upgrade reporting,
and terminal `superseded` / `cleared` behavior. Its v7 callback creates only:

```text
blobs
  keyPath: contentHash
  index: storedAt
```

`features/matter/persistence/matter-database.test.ts` has focused cases for a
v6-to-v7 store addition without row access, idempotent reopening, a newer
database becoming terminal `superseded`, and a blocked open being explicitly
retryable. These are mocked adapter tests; they do not prove a physical browser
upgrade or browser transaction rollback.

### Snapshot, journal, and import recovery

`features/matter/persistence/document-repository.ts` owns the atomic
`snapshots` + `historyEntries` transaction, write-generation compare and swap,
snapshot stamps, import reservation, rollback, and corrupt-row replacement.
`features/matter/persistence/history-journal.ts` owns persisted Undo and Redo
ranges and records. `features/matter/persistence/history-recovery.ts` owns
strict recovery and release of unusable history.

The nearby tests establish the intended local behavior:

- `document-repository.test.ts` covers stamp 1/2 selection, exact stamp
  restoration after import rollback, same-material adoption, and the rule that
  derived-label reclamation never opens or mutates `blobs`;
- `history-recovery.image.test.ts` accepts a stored `replace-image` inverse and
  replays recovered Undo then Redo to the same pointer;
- `persistence-controller.test.ts` and
  `document-import-coordinator.test.ts` cover reservation ownership,
  activation, stale preparation, and rollback before queued local work drains.

An import deliberately starts a new journal epoch and keeps the replaced
epoch's records until rollback authority ends. A future blob root scan cannot
look only at the current manifest and assume every other stored epoch is dead.

### Blob and archive ownership

`features/matter/persistence/image-blob-repository.ts` verifies pointer shape,
byte length, image structure, and SHA-256 before storing bytes. It owns
`putImageBlob`, `getImageBlob`, and `listImageBlobHashes`; there is no delete or
compaction operation. `image-blob-repository.test.ts` covers exact round-trip,
idempotent content addressing, rejection, damage, repair, newer-row refusal,
quota classification, and list behavior over an in-memory database double.

`features/matter/interaction/accept-picture.ts` owns Keep ordering: bytes become
durable before the tree may name them. A stale or rejected pointer commit may
therefore leave a legitimate orphan. `accept-picture.test.ts` holds that order
and the no-commit-on-storage-failure behavior.

`features/matter/persistence/archive-transport.ts` and
`archive-transport.blobs.test.ts` own strict ZIP paths, byte verification,
bounds, deterministic export, absent-byte reporting, and orphan-entry refusal.
`features/matter/interaction/archive-pictures.ts` restores verified archive
bytes before the document switch so the first render can read them.
`features/matter/components/MatterApp.tsx` currently calls that restore before
`importMaterial`. A rejected or stale import can therefore also leave durable
orphan bytes. That is tolerated today; it is not permission for an uncoordinated
collector to delete them while the import is still live.

### Browser proof already encoded, but not freshly receipted here

`scripts/prove-persistence-indexeddb.entry.ts` contains real IndexedDB cases for
random journal round-trip and compaction, a two-connection generation race, an
issued put that aborts the whole write, v5 migration, v6-to-v7 store creation,
blob round-trip and damage repair, derived-reclaim isolation, and a request for
version 6 receiving `VersionError` after v7 exists.

`npm run proof:persistence` runs that browser proof. It is the last step of
`npm run bench:persistence`, but it is not part of `npm run check`:

```text
check
  doctor → docs → unit/architecture → typegen → typecheck → lint → build

proof:persistence
  separate real-Chromium IndexedDB proof
```

The presence of this source is evidence that a proof can be run, not evidence
that the current candidate passed it. A release receipt must name the exact
source revision, browser version, command, result, and retained output.

## What remains unproven

1. The existing v6 fixture does not simultaneously seed and compare every
   existing store plus populated Undo and Redo records across a physical
   v6-to-v7 upgrade.
2. No current receipt proves a real older connection blocking the upgrade,
   closing, and allowing exactly one lossless v7 completion.
3. No current receipt proves that an aborted v7 version-change transaction
   leaves the physical database at v6 with every seeded value readable.
4. The scripted v6 `VersionError` is not followed by a v7 reopen and canonical
   readback of the same material, journal, metadata, and blobs.
5. No frozen, source-identified v7-aware recovery build has demonstrated
   load, Archive export, and clean import/readback from an upgraded database.
6. Blob deletion, complete root discovery, grace policy, transient retention,
   and multi-tab writer coordination do not exist in product source.

Unit, full-check, E2E, and production-health results answer different questions.
None may be promoted into one of these physical recovery receipts without
running its stated browser boundary.

## Minimum physical-v7 recovery packet

All five receipts below are required against the same frozen candidate. Each
receipt writes structured output containing source revision, runtime and browser
versions, fixture digest before the action, result, and digest after readback.
No receipt uses real user material.

### R1 — `v6-to-v7-preserves-all-stores-and-undo-redo`

Create a physical v6 fixture with snapshot rows, populated Undo and Redo
`historyEntries`, labels, inquiry records, and a Wiki row. Record canonical
keys, values, generations, and digests. Open it with the candidate and require:

- physical version is exactly 7;
- `blobs` exists, is empty, and has only the documented `storedAt` index;
- every pre-existing store, key, value, generation, Undo record, and Redo
  record matches its pre-upgrade digest;
- loading and one recovered Undo then Redo return the expected tree.

### R2 — `blocked-upgrade-handoff`

Keep a real v6 connection open, request v7 from another connection, and require
the v7 owner to report blocked without mutating data. Close the v6 connection,
then require one upgrade-ready transition, one completed upgrade, and the same
post-upgrade digest as R1. A timeout, duplicate completion, or guessed forced
close fails the receipt.

### R3 — `aborted-upgrade-keeps-v6-readable`

Seed the R1 fixture, abort the real version-change transaction after the new
store has been requested, and require the open to fail. Reopen at v6 and require
physical version 6, no partial `blobs` store, and exact fixture digests. Then
perform a normal v7 open and require the R1 result.

### R4 — `v6-refused-then-v7-readback-unchanged`

After a successful v7 upgrade, seed at least one current-tree image pointer
with verified available bytes, a second current-tree pointer whose bytes are
deliberately missing, and another verified image reachable only through retained
Undo/Redo or a subtree memento. Record those nonempty expected sets. Request v6
and require `VersionError` with no successful connection. Reopen at v7 and require
unchanged canonical digests, successful material load, recovered Undo and Redo,
and exact blob bytes. This proves refusal without promoting refusal itself into
recovery.

### R5 — `db7-recovery-export-import`

Freeze a v7-aware recovery build with image generation disabled but v7 reads and
Archive byte export retained. Against the R4 database require it to:

1. load the stored material and bounded history without writing a downgrade;
2. export a strict Archive containing every available referenced picture and an
   honest missing count for unavailable bytes;
3. import that Archive into a fresh test database;
4. read back the exact tree and every carried picture byte.

Require a positive exported referenced-image count, exact available-byte/hash
equality to R4's current-tree fixture, and the exact nonzero missing count.
An empty picture set cannot satisfy this receipt. The history-only image must
survive R4's recovered Undo/Redo, but is not an expected Archive entry: Archive
does not carry the history journal. Its retention during future GC belongs to
the separate compaction proof below.

The recovery build's source revision and reproducible artifact identity belong
in the receipt. Merely retaining a branch name or package version is not enough.

## Release and recovery path

Before a v7-producing release:

1. Freeze the candidate and the separate v7-aware recovery build.
2. Pass R1–R5 on the frozen source and retain their structured receipts.
3. Confirm the recovery artifact can be redeployed through the actual release
   vehicle. This is readiness, not authorization to deploy.
4. State plainly that rollback means a forward deployment of the v7-aware
   recovery build. A pre-v7 build is not a rollback target after any client has
   opened v7.

If an older build is accidentally deployed after v7, it must remain
`superseded`, perform no write or repair, and be replaced by the v7-aware
recovery build. Recovery first loads the material and produces an Archive. Any
storage clearing must be a separate, explicit human action after the exported
Archive has itself passed import/readback. This packet authorizes neither that
clear nor any production action.

## Image-blob compaction invariants

Compaction must treat the union below as the live set. A hash is collectible
only when it is absent from every class.

### Durable roots

- every readable snapshot row for every tree, not only the active document;
- every stored history entry in both Undo and Redo and across every stored
  epoch, including image pointers nested in subtree mementos or other valid
  mutations rather than only top-level `replace-image` fields;
- the previous and imported snapshots named by an import reservation until its
  activation or rollback has settled.

Scanning every stored journal record is intentionally conservative. Repository
journal compaction may first remove records it can prove unreachable; blob
compaction must not independently reinterpret journal reachability.

### Live roots

- the current in-memory tree, including a dirty or queued publication not yet
  represented by its durable snapshot;
- the complete bounded in-memory Undo and Redo stacks;
- a picture Keep from before its blob write begins until the pointer commit has
  been durably saved or the operation has ended;
- all hashes carried by a validated Archive from before byte restore until the
  import reservation has activated or rolled back;
- both sides of an active import reservation, including its in-memory previous
  row even when the durable snapshot temporarily names the imported row.

A session cache is not durable authority, but an active Keep or import using its
bytes must publish the corresponding live root. Closing or suspending a tab is
not evidence that its unsaved roots disappeared.

### Coordination, grace, and deletion

- Root acquisition precedes blob write or import restore. Root release follows
  durable save, completed rollback, or terminal cancellation; ordering is part
  of the proof.
- Compaction needs a bounded cross-tab writer-coordination capability that
  makes the durable scan and the complete live-root set stable for deletion.
  The existing document-generation BroadcastChannel announces committed rows;
  it does not enumerate transient roots and is insufficient by itself.
- The concrete lease transport is not selected here. In particular, this note
  does not silently introduce long-held Web Locks: the current binding
  persistence design rejects them for ordinary document writes because of page
  lifecycle costs. Any candidate must prove hidden, suspended, restored, and
  unavailable-platform behavior. If complete coordination cannot be proven,
  compaction returns unavailable and deletes nothing.
- The first compaction pass performs durable root scan and deletion in one
  readwrite transaction spanning `snapshots`, `historyEntries`, and `blobs`.
  If a bounded pass cannot cover the complete roots, refuse deletion. A changed
  writer epoch invalidates the plan. Multi-transaction batching is not selected:
  a later batch cannot roll back rows deleted by an earlier committed batch,
  so a future batching design would need per-batch receipts and truthful partial
  results rather than claiming operation-wide zero deletion after any failure.
- A blob must also be older than a frozen grace cutoff. Missing, invalid, or
  future `storedAt` values are retained. `storedAt` is creation evidence, not
  last-use evidence: an idempotent put of an existing hash does not refresh it.
  Grace reduces crash-window risk but never replaces a root or lease.
- Any unreadable, malformed, unsupported, newer-schema, incomplete, or failed
  snapshot, journal, reservation, live-root response, clock value, or
  transaction makes the whole pass delete zero rows.
- Undo, Redo, import rollback, ordinary cache reclamation, and quota pressure
  never delete a blob directly. They may only change roots observed by a later
  explicit compaction pass.

The first product form, if this work is later authorized, should be an explicit
“free unused picture space” operation. Automatic quota eviction is out of scope.
The operation must report only verified reclaimed bytes; failure remains quiet
and non-destructive.

## Minimum compaction proof matrix

Build this only after the root and coordination design is frozen:

1. A pure root collector finds image hashes in every snapshot node and every
   legal Undo/Redo memento, including removed or restored subtrees, and
   deduplicates identical content hashes.
2. Focused repository tests retain separately rooted bytes from a stored
   snapshot, stored Undo, stored Redo, old import epoch, unsaved tree, in-memory
   Undo/Redo, pending Keep, imported candidate, and previous import reservation.
3. Malformed or newer rows, missing live-root responses, unavailable
   coordination, invalid/future timestamps, and an injected read failure each
   produce an unchanged blob store.
4. A recent orphan survives grace. An old orphan is deleted only after every
   root and reservation is released, the durable state is rescanned, and the
   same writer epoch still owns the pass.
5. A transaction fault during deletion commits no partial deletion. A writer
   beginning during planning either becomes part of the stable roots or makes
   the pass retry without deletion.
6. Real-browser multi-tab proof pauses Keep after blob storage and pauses
   Archive import after restore; compaction must wait or refuse. It then proves
   successful Keep, stale Keep, activated import, rolled-back import, page hide,
   suspension/restoration, and writer replacement.
7. After successful compaction, every retained pointer renders exact bytes,
   recovered Undo and Redo still work, and Archive export/import round-trips the
   retained set. Only the intentionally unreferenced, grace-expired hashes are
   absent.

The receipt records candidate source, browser versions, coordination mode,
fixture digest, root-set digest, candidate hashes, deleted hashes and byte
count, and post-operation replay/export results. It contains no document text
or image bytes.

## Gate

Physical v7 release becomes reviewable only after R1–R5 pass on one frozen
candidate and its v7-aware recovery artifact is available through the real
release path. Blob compaction becomes reviewable only after the complete-root
and coordination design is frozen and the proof matrix passes. Until then:

```text
database v7 release   held
pre-v7 rollback       forbidden as a recovery path
blob compaction       absent
automatic blob GC     forbidden
safe current action   preserve bytes; delete nothing
```
