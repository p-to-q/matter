import { describe, expect, it } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { applyTreeCommand } from "../tree/engine";
import { MAX_TREE_IMAGE_NODES, type ImagePointer } from "../tree/image-pointer";
import { normalizeDocumentTree } from "../tree/document-root";
import { PROTOCOL_VERSION, type ThoughtTree } from "../tree/model";
import { bundleCarriesImage, bundleToTree, treeToBundle, type SnapshotBundle } from "./snapshot-codec";

const PNG: ImagePointer = {
  mediaType: "image/png",
  byteLength: 120_000,
  width: 1024,
  height: 768,
  contentHash: "ab".repeat(32),
};
const CANONICAL_LINE =
  'image: {"byteLength":120000,"contentHash":"' + "ab".repeat(32) + '","height":768,"mediaType":"image/png","width":1024}';

function pictured(): { tree: ThoughtTree; childId: string } {
  const source = normalizeDocumentTree(createSeededDocument().tree);
  const childId = source.nodes[source.rootId!].children[0]!;
  const child = source.nodes[childId];
  const result = applyTreeCommand(source, {
    id: "attach-picture",
    source: "human",
    expectedTreeId: source.id,
    expectedRevision: source.revision,
    createdAt: "2026-10-12T00:00:00.000Z",
    mutation: {
      type: "replace-image",
      nodeId: childId,
      expectedUpdatedAt: child.updatedAt,
      expectedImage: null,
      image: PNG,
    },
  });
  if (!result.ok) throw new Error(result.error.message);
  return { tree: result.tree, childId };
}

function fileOf(bundle: SnapshotBundle, nodeId: string, tree: ThoughtTree): string {
  const needle = `id: ${nodeId}\n`;
  const path = Object.keys(bundle.files).find((candidate) =>
    candidate.endsWith("/index.md") && bundle.files[candidate as keyof typeof bundle.files].includes(needle));
  if (path === undefined) throw new Error(`no file for ${nodeId} in ${tree.id}`);
  return path;
}

function mutateNode(
  bundle: SnapshotBundle,
  path: string,
  change: (content: string) => string,
) {
  const files = { ...bundle.files } as Record<string, string>;
  files[path] = change(files[path]);
  return bundleToTree({ files });
}

describe("snapshot codec and image pointers", () => {
  it("writes one canonical sorted-key line after the clock and round-trips it", () => {
    const { tree, childId } = pictured();
    const bundle = treeToBundle(tree);
    const path = fileOf(bundle, childId, tree);
    const content = bundle.files[path as keyof typeof bundle.files];
    expect(content).toContain(`\n${CANONICAL_LINE}\n---\n\n`);
    expect(content.indexOf("updatedAt:")).toBeLessThan(content.indexOf("image:"));
    expect(content.split("image:")).toHaveLength(2);

    expect(bundleToTree(bundle)).toEqual({ ok: true, tree });
    const decoded = bundleToTree(bundle);
    if (!decoded.ok) throw new Error(decoded.error.message);
    expect(decoded.tree.nodes[childId].image).toEqual(PNG);
  });

  it("is byte-deterministic whatever key order the in-memory pointer was built in", () => {
    const { tree, childId } = pictured();
    const shuffled: ThoughtTree = {
      ...tree,
      nodes: {
        ...tree.nodes,
        [childId]: {
          ...tree.nodes[childId],
          image: {
            width: PNG.width,
            contentHash: PNG.contentHash,
            mediaType: PNG.mediaType,
            height: PNG.height,
            byteLength: PNG.byteLength,
          },
        },
      },
    };
    expect(treeToBundle(shuffled)).toEqual(treeToBundle(tree));
    expect(treeToBundle(tree)).toEqual(treeToBundle(tree));

    const decoded = bundleToTree(treeToBundle(tree));
    if (!decoded.ok) throw new Error(decoded.error.message);
    expect(treeToBundle(decoded.tree)).toEqual(treeToBundle(tree));
  });

  it("emits no image line when no pointer is set, and still decodes a file that never had one", () => {
    const { tree, childId } = pictured();
    const plain = normalizeDocumentTree(createSeededDocument().tree);
    const bundle = treeToBundle(plain);
    for (const content of Object.values(bundle.files)) expect(content).not.toContain("image:");
    expect(bundleToTree(bundle)).toEqual({ ok: true, tree: plain });

    // A pointer removed from the picture file leaves exactly the legacy layout.
    const pictureBundle = treeToBundle(tree);
    const path = fileOf(pictureBundle, childId, tree);
    const legacy = mutateNode(pictureBundle, path, (content) => content.replace(`${CANONICAL_LINE}\n`, ""));
    expect(legacy).toMatchObject({ ok: true });
    if (!legacy.ok) return;
    expect(Object.hasOwn(legacy.tree.nodes[childId], "image")).toBe(false);
  });

  it.each([
    ["bad JSON", 'image: {"byteLength":'],
    ["not an object", "image: null"],
    ["an array", "image: []"],
    ["a bare string", 'image: "x"'],
    ["an extra key", CANONICAL_LINE.replace('"width":1024}', '"width":1024,"alt":"x"}')],
    ["a missing key", CANONICAL_LINE.replace('"height":768,', "")],
    ["a wrong type", CANONICAL_LINE.replace('"byteLength":120000', '"byteLength":"120000"')],
    ["an out-of-range side", CANONICAL_LINE.replace('"height":768', '"height":100')],
    ["an oversize file", CANONICAL_LINE.replace('"byteLength":120000', '"byteLength":2097153')],
    ["an unknown media type", CANONICAL_LINE.replace("image/png", "image/gif")],
    ["an uppercase hash", CANONICAL_LINE.replace(/ab/g, "AB")],
    ["a non-canonical key order", 'image: {"mediaType":"image/png","byteLength":120000,"width":1024,"height":768,"contentHash":"' + "ab".repeat(32) + '"}'],
    ["whitespace", CANONICAL_LINE.replace('{"', '{ "')],
    ["a prototype key", CANONICAL_LINE.replace('{"byteLength"', '{"__proto__":1,"byteLength"')],
  ])("rejects an image line with %s", (_name, line) => {
    const { tree, childId } = pictured();
    const bundle = treeToBundle(tree);
    const path = fileOf(bundle, childId, tree);
    expect(mutateNode(bundle, path, (content) => content.replace(CANONICAL_LINE, line)))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
  });

  it("rejects an image line in the wrong place, repeated, or beside an unknown key", () => {
    const { tree, childId } = pictured();
    const bundle = treeToBundle(tree);
    const path = fileOf(bundle, childId, tree);

    expect(mutateNode(bundle, path, (content) =>
      content.replace(`${CANONICAL_LINE}\n`, "").replace("updatedAt:", `${CANONICAL_LINE}\nupdatedAt:`)))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
    expect(mutateNode(bundle, path, (content) =>
      content.replace(`${CANONICAL_LINE}\n`, "").replace("id:", `${CANONICAL_LINE}\nid:`)))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
    expect(mutateNode(bundle, path, (content) =>
      content.replace(CANONICAL_LINE, `${CANONICAL_LINE}\n${CANONICAL_LINE}`)))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
    expect(mutateNode(bundle, path, (content) =>
      content.replace(CANONICAL_LINE, `${CANONICAL_LINE}\nalt: x`)))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
    expect(mutateNode(bundle, path, (content) => content.replace("image:", "Image:")))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
    expect(mutateNode(bundle, path, (content) => content.replace("image: ", "image:")))
      .toMatchObject({ ok: false, error: { code: "INVALID_MARKDOWN" } });
  });

  it("rejects a pointer on the document root", () => {
    const { tree } = pictured();
    const bundle = treeToBundle(tree);
    expect(mutateNode(bundle, "matter/index.md", (content) =>
      content.replace("\n---\n\n", `\n${CANONICAL_LINE}\n---\n\n`)))
      .toMatchObject({ ok: false, error: { code: "INVALID_TREE" } });
  });

  it("rejects a decoded tree with a 33rd pointer node", () => {
    const ids = Array.from({ length: MAX_TREE_IMAGE_NODES + 1 }, (_, index) => `leaf_${index}`);
    const stamp = "2026-10-12T00:00:00.000Z";
    const nodes: ThoughtTree["nodes"] = {
      doc: {
        id: "doc",
        role: "document-root",
        text: "",
        parentId: null,
        children: ids,
        createdAt: stamp,
        updatedAt: stamp,
      },
    };
    ids.forEach((id, index) => {
      nodes[id] = {
        id,
        text: id,
        parentId: "doc",
        children: [],
        createdAt: stamp,
        updatedAt: stamp,
        ...(index < MAX_TREE_IMAGE_NODES
          ? { image: { ...PNG, byteLength: 1_000, contentHash: index.toString(16).padStart(64, "0") } }
          : {}),
      };
    });
    const tree: ThoughtTree = {
      protocolVersion: PROTOCOL_VERSION,
      id: "crowded",
      rootId: "doc",
      nodes,
      revision: 0,
    };
    const bundle = treeToBundle(tree);
    expect(bundleToTree(bundle)).toEqual({ ok: true, tree });

    const last = fileOf(bundle, `leaf_${MAX_TREE_IMAGE_NODES}`, tree);
    const line = CANONICAL_LINE.replace("ab".repeat(32), "f".repeat(64));
    expect(mutateNode(bundle, last, (content) => content.replace("\n---\n\n", `\n${line}\n---\n\n`)))
      .toMatchObject({ ok: false, error: { code: "BOUND_EXCEEDED" } });
  });

  it("refuses to write a tree whose pointer is invalid", () => {
    const { tree, childId } = pictured();
    const invalid: ThoughtTree = {
      ...tree,
      nodes: {
        ...tree.nodes,
        [childId]: { ...tree.nodes[childId], image: { ...PNG, width: 3 } },
      },
    };
    expect(() => treeToBundle(invalid)).toThrow(TypeError);
  });

  it("reads from the bundle bytes whether any node names an image", () => {
    const { tree, childId } = pictured();
    const plain = normalizeDocumentTree(createSeededDocument().tree);
    const plainBundle = treeToBundle(plain);

    expect(bundleCarriesImage(treeToBundle(tree))).toBe(true);
    expect(bundleCarriesImage(plainBundle)).toBe(false);

    // Only the frontmatter counts: text that looks like an image line is not a picture.
    const path = fileOf(plainBundle, childId, plain);
    const files = { ...plainBundle.files } as Record<string, string>;
    files[path] = `${files[path]}\n---\n\n${CANONICAL_LINE}\n\n${CANONICAL_LINE}`;
    expect(bundleCarriesImage({ files } as SnapshotBundle)).toBe(false);
  });
});
