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
  isMatterWikiAutomaticCollectionEnabled,
  isMatterWikiPhoneticFittingEnabled,
  observeMatterWikiEvidence,
  readMatterWikiBasis,
  matterWikiFittingMode,
} from "../persistence/wiki-runtime-bridge";
import {
  createMatterStore,
  type MatterStoreViewState,
} from "../store/matter-store";

const singletonInitialDocument = normalizeMatterInitialDocument(
  process.env.NEXT_PUBLIC_MATTER_INITIAL_DOCUMENT,
);

const matterStore = createMatterStore(singletonInitialDocument, {
  documentRoot: true,
  materialLexical: createWikiMaterialLexicalPort(readMatterWikiBasis, {
    phoneticFittingEnabled: isMatterWikiPhoneticFittingEnabled,
  }),
  humanAdmissionObservation: createWikiMaterialLexicalObservationPort(
    readMatterWikiBasis,
    observeMatterWikiEvidence,
    {
      mode: matterWikiFittingMode,
      automaticCollectionEnabled: isMatterWikiAutomaticCollectionEnabled,
      phoneticFittingEnabled: isMatterWikiPhoneticFittingEnabled,
    },
  ),
  initialTitle: singletonInitialDocument === "empty"
    ? EMPTY_MATTER_DOCUMENT_TITLE
    : DEFAULT_MATTER_DOCUMENT_TITLE,
});

/** The browser composition root chooses Wiki without exposing it to the store. */
export function useMatterStore<T>(selector: (state: MatterStoreViewState) => T): T {
  return useStore(
    matterStore as Pick<
      StoreApi<MatterStoreViewState>,
      "getState" | "getInitialState" | "subscribe"
    >,
    selector,
  );
}
