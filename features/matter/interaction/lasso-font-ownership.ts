/**
 * A document FontFaceSet also reports fonts used only by sibling chrome.
 * Lasso geometry is revoked only when a reported family participates in the
 * active material's computed font stack. An event with no font-face contract
 * stays fail-closed; an explicit empty loading set has not changed geometry.
 */
export function fontLoadAffectsMaterialGeometry(
  loadedFamilies: readonly string[] | null,
  materialFontDeclarations: readonly string[],
): boolean {
  if (loadedFamilies === null) return true;
  if (loadedFamilies.length === 0) return false;
  const materialFamilies = new Set(
    materialFontDeclarations.flatMap(splitCssFontFamilies).map(normalizeFontFamily),
  );
  return loadedFamilies.some((family) => materialFamilies.has(normalizeFontFamily(family)));
}

export function fontFamiliesFromLoadingEvent(event: Event): readonly string[] | null {
  if (!("fontfaces" in event) || event.fontfaces == null) return null;
  const families: string[] = [];
  for (const value of Array.from(event.fontfaces as Iterable<unknown>)) {
    if (!(value instanceof FontFace)) return null;
    families.push(value.family);
  }
  return families;
}

function splitCssFontFamilies(declaration: string): string[] {
  const families: string[] = [];
  let start = 0;
  let quote: "\"" | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < declaration.length; index += 1) {
    const character = declaration[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character !== ",") continue;
    families.push(declaration.slice(start, index));
    start = index + 1;
  }
  families.push(declaration.slice(start));
  return families;
}

function normalizeFontFamily(value: string): string {
  const trimmed = value.trim();
  const unquoted = trimmed.length >= 2 && (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    ? trimmed.slice(1, -1)
    : trimmed;
  return unquoted.replaceAll(/\\([\\'",])/gu, "$1").toLocaleLowerCase("en-US");
}
