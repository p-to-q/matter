import { readFileSync } from "node:fs";

const marker = "<!-- matter-film-copy:v1 -->";
const expectedKeys = Object.freeze({
  root: Object.freeze(["version", "locale", "document", "material", "pointTalk", "inquiry", "ui"]),
  document: Object.freeze(["title", "titleSentence", "rootSource", "rootSuffix", "expandedRoot"]),
  material: Object.freeze(["voice", "thirdBranch", "nestedBranch"]),
  pointTalk: Object.freeze(["passage", "direction", "result"]),
  inquiry: Object.freeze(["question", "answer"]),
  ui: Object.freeze([
    "renameCanvas",
    "topLevelVoice",
    "selectGuidance",
    "darkAppearance",
    "aboutDialog",
    "aboutClose",
    "settingsMenu",
    "modelApi",
    "speakGuidance",
    "materializingGuidance",
    "rewriteVoice",
    "done",
    "listening",
    "rewriting",
    "lowerGrip",
    "expanding",
    "askMatter",
    "inquiryField",
  ]),
});

export function parseFilmCopy(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Film copy must be Markdown text.");
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex === -1 || markdown.indexOf(marker, markerIndex + marker.length) !== -1) {
    throw new Error("Film copy must contain exactly one versioned marker.");
  }
  const fenced = markdown.slice(markerIndex + marker.length).match(/^\s*```json\s*\n([\s\S]*?)\n```(?:\s|$)/u);
  if (fenced === null) throw new Error("Film copy marker must own one fenced JSON object.");

  let value;
  try {
    value = JSON.parse(fenced[1]);
  } catch {
    throw new Error("Film copy contains invalid JSON.");
  }
  requireRecord(value, "root");
  requireExactKeys(value, expectedKeys.root, "root");
  if (value.version !== 1) throw new Error("Film copy uses an unsupported version.");
  if (value.locale !== "zh-CN") throw new Error("Film copy must use the frozen zh-CN locale.");
  for (const section of ["document", "material", "pointTalk", "inquiry", "ui"]) {
    requireRecord(value[section], section);
    requireExactKeys(value[section], expectedKeys[section], section);
    for (const [key, entry] of Object.entries(value[section])) {
      if (typeof entry !== "string" || entry.trim().length === 0) {
        throw new Error(`Film copy ${section}.${key} must be a non-empty string.`);
      }
    }
  }
  return deepFreeze(value);
}

function requireRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Film copy ${label} must be an object.`);
  }
}

function requireExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`Film copy ${label} keys do not match the frozen contract.`);
  }
}

function deepFreeze(value) {
  for (const entry of Object.values(value)) {
    if (typeof entry === "object" && entry !== null) deepFreeze(entry);
  }
  return Object.freeze(value);
}

export const FILM_COPY = parseFilmCopy(
  readFileSync(new URL("./copy.md", import.meta.url), "utf8"),
);
