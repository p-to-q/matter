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
- `matter.json` contains tree id, protocol version, and snapshot revision;
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

`matter.json` is UTF-8 JSON with exactly `protocolVersion`, `treeId`, and
`revision`, written with stable key order and LF. An empty tree contains only
this file. A rooted bundle additionally has exactly one `matter/index.md`.
Node frontmatter accepts exactly `id`, `createdAt`, and `updatedAt`; duplicate or
unknown keys fail. Markdown is UTF-8 and LF without content normalization.

Child directories are numbered contiguously from `001`. The display slug is
NFC-normalized, lowercase where applicable, whitespace and reserved path
characters collapse to `-`, repeated/edge hyphens are removed, and output is
bounded to both 48 Unicode scalar values and 48 UTF-8 bytes; empty output becomes `thought`. Paths use
`/` only. Renaming a slug may produce different bundle bytes, but decoding must
produce the same tree identity and sibling order.

## Runtime and export

Automatic durability uses one record per tree, not one OPFS file per Markdown
node:

```ts
type StoredSnapshot = {
  storageSchemaVersion: 1;
  treeId: string;
  treeRevision: number;
  writeGeneration: number;
  bundle: SnapshotBundle;
};
```

Load always calls `bundleToTree`; it never casts a stored `ThoughtTree`. A commit
updates memory immediately and enqueues a save. One write runs at a time and one
latest pending bundle is retained. Inside one IndexedDB readwrite transaction,
save compares the tab's base `writeGeneration` and increments it on success.
Mismatch is a recoverable `PERSISTENCE_CONFLICT`, never last-write-wins; this
also covers two tabs producing different trees with the same tree revision.
The conflict control explicitly reloads and hydrates the newer validated stored
tree, clearing local history. It never advances the stale generation and never
labels the dirty local tree saved. If a newer local commit arrives while reload
is in flight, hydration is refused and the conflict remains visible.

Runtime persistence state tracks base generation, persisted revision, queued
revision, dirty revision, and error. Write failure does not roll back material;
pointer retry saves the latest dirty bundle for transient write failures;
generation conflict instead requires explicit reload. `visibilitychange: hidden` requests
a flush, but the UI says material is saved only when persisted revision equals
tree revision. Browser crash between commit and IndexedDB completion cannot be
promised away.

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
interaction at maximum bounds.

Directory export, if offered, creates a new directory rather than overwriting an
old one, so a renamed slug cannot leave stale node files behind.

Snapshot round-trip covers the `ThoughtTree`, not runtime command or undo
history.

Rejected for `0.2`: path identity, a flat heading outline as the canonical form,
a duplicated `tree.json` containing structure, binary/database-native export,
one OPFS file per node for autosave, and CRDT-native storage before collaboration
exists.

Required proofs: empty/rooted tree → bundle → tree identity; deterministic paths
and bytes; manual slug rename → same tree; malformed frontmatter, duplicate
ids/order/path, unreachable node, and version mismatch rejection; IndexedDB
reload, coalescing, generation conflict, quota, and retry; ZIP export → import;
traversal, Unicode/case collision, compressed/expanded size, path depth, and
entry count limits. Picker absence or cancellation never removes ZIP return.

Platform context: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API),
[origin-private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system),
[persistent storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist),
and [`showDirectoryPicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker).
