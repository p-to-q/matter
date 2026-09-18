import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSeededDocument } from "../material/seeded-document";
import { createNavigationState } from "../runtime/navigation";
import { normalizeDocumentTree } from "../tree/document-root";
import type { ThoughtTree } from "../tree/model";
import { MaterialFiles } from "./MaterialFiles";

describe("Material Files empty document copy", () => {
  it("invites the first admission when only the invisible document root exists", () => {
    const tree = normalizeDocumentTree(createSeededDocument("empty").tree, "Matter");

    expect(renderMaterialFiles(tree)).toContain("说出第一个想法，开始吧。");
  });

  it("keeps the branch copy once visible material exists", () => {
    const tree = normalizeDocumentTree(createSeededDocument("root").tree);
    const markup = renderMaterialFiles(tree);

    expect(markup).not.toContain("说出第一个想法，开始吧。");
    expect(markup).toContain("这段想法还没有分支。");
  });
});

function renderMaterialFiles(tree: ThoughtTree): string {
  return renderToStaticMarkup(createElement(MaterialFiles, {
    documentEpoch: 0,
    interactionPending: false,
    locale: "zh-CN",
    navigation: createNavigationState(),
    onFocusNode: () => undefined,
    onSelectNode: () => undefined,
    persistence: {
      status: {
        phase: "saved",
        persistedRevision: tree.revision,
        dirtyRevision: null,
        errorCode: null,
      },
      retry: () => undefined,
      resolveConflict: () => undefined,
    },
    tree,
  }));
}
