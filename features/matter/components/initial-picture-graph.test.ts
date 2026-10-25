import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

/**
 * The initial JavaScript has a byte ceiling (`scripts/check-runtime-artifact.mjs`)
 * that picture code once pushed against. Everything below is needed only by a
 * passage that carries a picture, a Keep, or an archive with pictures, so it
 * must be reachable from the page only through a dynamic `import()`. This walks
 * the static imports from the page and fails when one of them comes back.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const PAGE = "app/page.tsx";

const LAZY_ONLY = [
  "features/matter/components/PassagePicture.tsx",
  "features/matter/components/picture-copy.ts",
  "features/matter/components/picture-store.ts",
  "features/matter/components/passage-picture-load.ts",
  "features/matter/interaction/archive-pictures.ts",
  "features/matter/interaction/picture-session-cache.ts",
  "features/matter/persistence/image-blob-repository.ts",
  "features/matter/protocol/image-structure.ts",
  "features/matter/protocol/image-verify.ts",
];

describe("the initial bundle's picture code", () => {
  const reachable = staticClosure(PAGE);

  it("reaches the lazy boundary and the pieces that stay small", () => {
    expect(reachable.has("features/matter/components/MatterApp.tsx")).toBe(true);
    expect(reachable.has("features/matter/components/LazyPassagePicture.tsx")).toBe(true);
    expect(reachable.has("features/matter/components/use-picture-store.ts")).toBe(true);
    expect(reachable.has("features/matter/components/PicturePlaceholder.tsx")).toBe(true);
  });

  it.each(LAZY_ONLY)("does not statically import %s", (file) => {
    expect(existsSync(join(ROOT, file)), `${file} exists`).toBe(true);
    expect(reachable.has(file)).toBe(false);
  });
});

function staticClosure(entry: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticSpecifiers(join(ROOT, file))) {
      const target = resolveSpecifier(file, specifier);
      if (target !== null) queue.push(target);
    }
  }
  return seen;
}

/** Runtime static imports and re-exports only: type-only edges are erased, `import()` is lazy. */
function staticSpecifiers(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, false,
    path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const erased = clause !== undefined && (
        clause.isTypeOnly ||
        (clause.name === undefined && clause.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly))
      );
      if (!erased && ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(statement) && !statement.isTypeOnly &&
      statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

function resolveSpecifier(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".") ? resolve(dirname(join(ROOT, from)), specifier) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && /\.tsx?$/u.test(candidate)) return relative(ROOT, candidate).split(sep).join("/");
  }
  return null;
}
