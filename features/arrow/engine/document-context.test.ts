import { describe, expect, it } from "vitest";
import {
  createEmptyScene,
  type RelationshipObject,
  type SceneDocument,
  type ThoughtObject,
} from "./protocol";
import { readDocumentContext } from "./document-context";

function thought(id: string, parentId?: string): ThoughtObject {
  return {
    id,
    type: "thought",
    kind: parentId ? "satellite" : "primary",
    text: id,
    position: { x: 0, y: 0 },
    width: 320,
    parentId,
    revisions: [],
    style: { emphasis: 0.8, opacity: 1 },
  };
}

function relationship(
  id: string,
  fromId: string,
  toId: string,
): RelationshipObject {
  return { id, type: "relationship", fromId, toId, role: "relates" };
}

function sceneWith(
  objects: Array<ThoughtObject | RelationshipObject>,
  order = objects.map((object) => object.id),
): SceneDocument {
  return {
    ...createEmptyScene(),
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order,
  };
}

describe("document context", () => {
  it("reads bounded hierarchy in stable scene order", () => {
    const scene = sceneWith(
      [
        thought("root"),
        thought("parent", "root"),
        thought("focus", "parent"),
        thought("child_b", "focus"),
        thought("child_a", "focus"),
        thought("child_c", "focus"),
      ],
      ["root", "parent", "focus", "child_a", "child_b", "child_c"],
    );

    const context = readDocumentContext(scene, "focus", {
      ancestors: 1,
      children: 2,
      related: 0,
    });

    expect(context?.ancestors.map((node) => node.id)).toEqual(["parent"]);
    expect(context?.children.map((node) => node.id)).toEqual([
      "child_a",
      "child_b",
    ]);
  });

  it("deduplicates explicit relations and excludes hierarchy duplicates", () => {
    const scene = sceneWith([
      thought("root"),
      thought("focus", "root"),
      thought("child", "focus"),
      thought("related_a"),
      thought("related_b"),
      relationship("edge_a", "focus", "related_a"),
      relationship("edge_a_duplicate", "related_a", "focus"),
      relationship("edge_parent", "focus", "root"),
      relationship("edge_child", "child", "focus"),
      relationship("edge_b", "related_b", "focus"),
    ]);

    const context = readDocumentContext(scene, "focus", { related: 10 });

    expect(context?.ancestors.map((node) => node.id)).toEqual(["root"]);
    expect(context?.children.map((node) => node.id)).toEqual(["child"]);
    expect(context?.related.map((node) => node.id)).toEqual([
      "related_a",
      "related_b",
    ]);
  });

  it("stops safely on missing or cyclic parents and ignores dangling links", () => {
    const missingParentScene = sceneWith([
      thought("focus", "missing"),
      thought("related"),
      relationship("dangling", "focus", "missing_related"),
      relationship("valid", "focus", "related"),
    ]);

    expect(readDocumentContext(missingParentScene, "focus")).toMatchObject({
      ancestors: [],
      related: [{ id: "related" }],
    });

    const cyclicScene = sceneWith([
      thought("focus", "parent"),
      thought("parent", "focus"),
    ]);
    expect(
      readDocumentContext(cyclicScene, "focus")?.ancestors.map(
        (node) => node.id,
      ),
    ).toEqual(["parent"]);
    expect(readDocumentContext(cyclicScene, "missing")).toBeNull();
  });

  it("clamps caller limits to a finite maximum", () => {
    const children = Array.from({ length: 24 }, (_, index) =>
      thought(`child_${index}`, "focus"),
    );
    const scene = sceneWith([thought("focus"), ...children]);

    const context = readDocumentContext(scene, "focus", {
      children: Number.POSITIVE_INFINITY,
    });

    expect(context?.children).toHaveLength(6);
    expect(
      readDocumentContext(scene, "focus", { children: 999 })?.children,
    ).toHaveLength(20);
  });
});
