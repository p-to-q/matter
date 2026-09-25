import {
  projectWikiConfigurationRules,
  type WikiConfigurationInput,
  type WikiConfigurationRule,
} from "../wiki/wiki-configuration";
import type {
  WikiCoordinatorResult,
  WikiCoordinatorStatus,
} from "./wiki-coordinator";
import {
  decideMatterWiki,
  getMatterWikiStatus,
  matterWikiProjectionPolicy,
  readMatterWikiState,
  resetCorruptMatterWiki,
  retryMatterWikiAuthority,
  startMatterWikiAuthority,
  subscribeMatterWikiAuthority,
} from "./wiki-runtime-core";

export type MatterWikiConfigurationSnapshot = Readonly<{
  status: WikiCoordinatorStatus;
  stateRevision: number | null;
  hasStoredData: boolean;
  rules: readonly WikiConfigurationRule[];
}>;

export type MatterWikiConfiguration = Readonly<{
  start(): Promise<WikiCoordinatorStatus>;
  retry(): Promise<WikiCoordinatorStatus>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): MatterWikiConfigurationSnapshot;
  add(
    input: WikiConfigurationInput,
    expectedStateRevision: number,
  ): Promise<WikiCoordinatorResult>;
  replace(
    before: WikiConfigurationRule,
    after: WikiConfigurationInput,
    expectedStateRevision: number,
  ): Promise<WikiCoordinatorResult>;
  remove(
    rule: WikiConfigurationRule,
    expectedStateRevision: number,
  ): Promise<WikiCoordinatorResult>;
  resetCorrupt(): Promise<WikiCoordinatorResult>;
  exportFile(): Promise<Readonly<{
    ok: true;
    bytes: Uint8Array;
    fileName: string;
  }> | Readonly<{ ok: false; code: "NOT_READY" | "EXPORT_FAILED" }>>;
}>;

let cachedStatus: WikiCoordinatorStatus | null = null;
let cachedState = readMatterWikiState();
let cachedSnapshot: MatterWikiConfigurationSnapshot = Object.freeze({
  status: getMatterWikiStatus(),
  stateRevision: null,
  hasStoredData: false,
  rules: Object.freeze([]),
});

function getConfigurationSnapshot(): MatterWikiConfigurationSnapshot {
  const status = getMatterWikiStatus();
  const state = readMatterWikiState();
  if (status === cachedStatus && state === cachedState) return cachedSnapshot;
  cachedStatus = status;
  cachedState = state;
  cachedSnapshot = Object.freeze({
    status,
    stateRevision: state?.revision ?? null,
    hasStoredData: state !== null && (
      state.evidence.length > 0 ||
      state.lexemes.length > 0 ||
      state.authorities.length > 0 ||
      state.aliasTombstones.length > 0 ||
      state.lexemeTombstones.length > 0
    ),
    rules: state === null
      ? Object.freeze([])
      : projectWikiConfigurationRules(state, matterWikiProjectionPolicy),
  });
  return cachedSnapshot;
}

export const matterWikiConfiguration: MatterWikiConfiguration = Object.freeze({
  start: startMatterWikiAuthority,
  retry: retryMatterWikiAuthority,
  subscribe: subscribeMatterWikiAuthority,
  getSnapshot: getConfigurationSnapshot,
  add(input, expectedStateRevision) {
    return decideMatterWiki(Object.freeze({
      type: "create-lexeme",
      locale: input.locale,
      canonical: input.canonical,
      scope: input.scope,
    }), expectedStateRevision);
  },
  replace(before, after, expectedStateRevision) {
    return decideMatterWiki(Object.freeze({
      type: "rename-lexeme",
      lexemeId: before.lexemeId,
      locale: after.locale,
      canonical: after.canonical,
      scope: after.scope,
    }), expectedStateRevision);
  },
  remove(rule, expectedStateRevision) {
    return decideMatterWiki(Object.freeze({
      type: "remove-lexeme",
      lexemeId: rule.lexemeId,
    }), expectedStateRevision);
  },
  resetCorrupt() {
    return resetCorruptMatterWiki();
  },
  async exportFile() {
    const state = readMatterWikiState();
    if (state === null) return Object.freeze({ ok: false, code: "NOT_READY" });
    const { encodeWikiExport, WIKI_EXPORT_FILE_NAME } = await import("../wiki/wiki-export");
    const exported = encodeWikiExport(state);
    return exported.ok
      ? Object.freeze({
          ok: true,
          bytes: exported.bytes,
          fileName: WIKI_EXPORT_FILE_NAME,
        })
      : Object.freeze({ ok: false, code: "EXPORT_FAILED" });
  },
});
