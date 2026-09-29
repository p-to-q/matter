"use client";

import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import {
  DEFAULT_MATTER_DOCUMENT_TITLE,
  EMPTY_MATTER_DOCUMENT_TITLE,
  normalizeMatterInitialDocument,
} from "../config/initial-document";
import {
  createWikiMaterialLexicalObservationPort,
  createWikiMaterialLexicalPort,
} from "../application/wiki-material-lexical-adapter";
import {
  claimMatterWikiOccurrences,
  isMatterWikiPhoneticFittingEnabled,
  mintMatterWikiOccurrence,
  observeMatterWikiEvidence,
  readMatterWikiBasis,
  readMatterWikiInterpreter,
  settleMatterWikiOccurrence,
} from "../persistence/wiki-runtime-bridge";
import type { WikiOccurrenceDriver } from "../interaction/wiki-occurrence-driver";
import { createLazyWikiOccurrenceDriver } from "../interaction/wiki-occurrence-handle";
import { readAdmissionRepairAdjudicator } from "../interaction/transcript-repair-runtime";
import type { MaterialView } from "../interaction/wiki-occurrence-lifecycle";
import {
  createMatterStore,
  type MatterStoreViewState,
} from "../store/matter-store";

const singletonInitialDocument = normalizeMatterInitialDocument(
  process.env.NEXT_PUBLIC_MATTER_INITIAL_DOCUMENT,
);

const readMaterial = (): MaterialView => {
  const state = viewStore().getState();
  return { tree: state.tree, documentEpoch: state.documentEpoch };
};

// The occurrence driver and the store are composed side by side: the store
// publishes committed occurrences through a neutral port and never learns
// that Wiki, the driver, or its browser resources exist. The driver itself
// loads with the first committed occurrence.
const wikiOccurrences: WikiOccurrenceDriver = createLazyWikiOccurrenceDriver({
  readMaterial,
  settle: settleMatterWikiOccurrence,
  restore: (request) => matterStore.getState().restoreHumanTextRange({
    ...request,
    commandId: `human_restore_${createOperationId()}`,
    createdAt: new Date().toISOString(),
    expectedDocumentEpoch: request.documentEpoch,
  }).status === "committed",
}, () => import("../interaction/wiki-occurrence-browser")
  .then((module) => module.createBrowserWikiOccurrenceDriver));

const matterStore = createMatterStore(singletonInitialDocument, {
  documentRoot: true,
  materialLexical: createWikiMaterialLexicalPort(
    readMatterWikiBasis,
    readMatterWikiInterpreter,
    {
      phoneticFittingEnabled: isMatterWikiPhoneticFittingEnabled,
      mintOccurrence: mintMatterWikiOccurrence,
    },
  ),
  humanAdmissionObservation: createWikiMaterialLexicalObservationPort((observation) => {
    wikiOccurrences.noteHumanAdmission();
    observeMatterWikiEvidence(observation);
  }),
  lexicalOccurrences: Object.freeze({
    publishCommitted: (publication) => {
      claimMatterWikiOccurrences(publication.edits.map((edit) => edit.occurrence));
      wikiOccurrences.admit(publication);
    },
  }),
  // Loaded with the repair port, before any repair candidate can exist.
  admissionRepair: readAdmissionRepairAdjudicator,
  initialTitle: singletonInitialDocument === "empty"
    ? EMPTY_MATTER_DOCUMENT_TITLE
    : DEFAULT_MATTER_DOCUMENT_TITLE,
});

let reconciledTree: MatterStoreViewState["tree"] | null = null;
let reconciledEpoch = -1;
viewStore().subscribe((state) => {
  if (state.tree === reconciledTree && state.documentEpoch === reconciledEpoch) return;
  reconciledTree = state.tree;
  reconciledEpoch = state.documentEpoch;
  wikiOccurrences.reconcile();
});

/** The browser composition root chooses Wiki without exposing it to the store. */
export function useMatterStore<T>(selector: (state: MatterStoreViewState) => T): T {
  return useStore(viewStore(), selector);
}

/** The one committed-occurrence owner for this material session. */
export function useWikiOccurrences(): WikiOccurrenceDriver {
  return wikiOccurrences;
}

function viewStore(): Pick<
  StoreApi<MatterStoreViewState>,
  "getState" | "getInitialState" | "subscribe"
> {
  return matterStore as Pick<
    StoreApi<MatterStoreViewState>,
    "getState" | "getInitialState" | "subscribe"
  >;
}

function createOperationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
