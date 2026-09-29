import { describe, expect, it } from "vitest";
import { createWikiMaterialLexicalPort } from "../application/wiki-material-lexical-adapter";
import { createWikiCoordinator } from "../persistence/wiki-coordinator";
import type { WikiRepository } from "../persistence/wiki-repository";
import { createMatterStore } from "../store/matter-store";
import type { ThoughtTree } from "../tree/model";
import { WikiBasisOwner } from "../wiki/wiki-basis-owner";
import {
  applyWikiEvent,
  applyWikiObservationBatch,
  createEmptyWikiState,
  createWikiProjectionPolicy,
} from "../wiki/wiki-evidence";
import type { WikiState } from "../wiki/wiki-model";
import { createWikiOccurrenceRegistry } from "../wiki/wiki-occurrence-registry";
import { MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES } from "../wiki/wiki-qualified-producer-releases";
import {
  createWikiOccurrenceDriver,
  WIKI_OCCURRENCE_TICK_MS,
  type WikiOccurrenceEnvironment,
} from "./wiki-occurrence-driver";

const ALIAS = Object.freeze({
  type: "observe-evidence" as const,
  source: "machine-inference" as const,
  locale: "en-US" as const,
  channel: "spoken" as const,
  boundary: "word" as const,
  form: "Englebart",
  canonical: "Engelbart",
  producer: "en-metaphone-v1" as const,
});

describe("Wiki occurrence settlement through W1 policy", () => {
  it("records informed acceptance, then a revert strike, and ignores Undo", async () => {
    const session = await composedSession();
    session.admit("Englebart spoke");
    const [first] = session.driver.getSnapshot();
    expect(first).toMatchObject({ canonicalText: "Engelbart", sourceText: "Englebart" });
    session.driver.markDisclosed(first!.id);
    session.advance(1_500);
    session.admit("a second thought");
    session.admit("a third thought");
    await session.flush();
    expect(session.coordinator.readState()?.aliasEvidence[0]).toMatchObject({
      form: "Englebart",
      phase: "active",
      kept: 4,
    });
    expect(session.coordinator.readState()?.settledOccurrences).toEqual([first!.id]);

    session.admit("Englebart returned");
    const [second] = session.driver.getSnapshot();
    expect(session.driver.openTakeover(second!.id)).toBe(true);
    expect(session.driver.revert(second!.id)).toBe("reverted");
    await session.flush();
    const nodeId = second!.nodeId;
    expect(session.text(nodeId)).toBe("Englebart returned.");
    expect(session.coordinator.readState()?.revertStrikes).toHaveLength(1);
    expect(session.coordinator.readState()?.aliasEvidence).toEqual([]);

    // Material Undo restores the canonical word; Wiki is never told.
    const revision = session.coordinator.readState()?.revision;
    session.store.getState().undo();
    await session.flush();
    expect(session.text(nodeId)).toBe("Engelbart returned.");
    expect(session.coordinator.readState()?.revision).toBe(revision);
    expect(session.driver.getSnapshot()).toEqual([]);
  });
});

async function composedSession() {
  const state = applyWikiEvent(createEmptyWikiState(), {
    type: "create-lexeme",
    locale: "en-US",
    canonical: "Engelbart",
    scope: "both",
  });
  if (!state.ok) throw new Error(state.error.message);
  let wiki: WikiState = state.state;
  for (let turn = 0; turn < 4; turn += 1) {
    const observed = applyWikiObservationBatch(wiki, [ALIAS], Object.freeze({
      term: Object.freeze({ disposition: "paused" as const }),
      alias: Object.freeze({
        disposition: "observed" as const,
        opportunity: Object.freeze({
          locale: "en-US" as const,
          channel: "spoken" as const,
          scripts: Object.freeze(["latin" as const]),
        }),
      }),
    }));
    if (!observed.ok) throw new Error(observed.error.message);
    wiki = observed.state;
  }
  const coordinator = createWikiCoordinator(
    memoryRepository(wiki),
    new WikiBasisOwner(),
    createWikiProjectionPolicy(MATTER_WIKI_QUALIFIED_PRODUCER_RELEASES),
  );
  await coordinator.start();

  let now = 0;
  let ticker: (() => void) | null = null;
  const pending: Promise<unknown>[] = [];
  const registry = createWikiOccurrenceRegistry();
  const environment: WikiOccurrenceEnvironment = {
    now: () => now,
    isPageVisible: () => true,
    startTicker(tick) {
      ticker = tick;
      return () => {
        ticker = null;
      };
    },
    listenPage: () => () => undefined,
    track: () => undefined,
    untrack: () => undefined,
    isPerceivable: () => true,
    selectionCovers: () => false,
    hitTest: () => null,
    dispose: () => undefined,
  };
  let sequence = 0;
  const store = createMatterStore("root", {
    materialLexical: createWikiMaterialLexicalPort(coordinator.readBasis, {
      mintOccurrence: (attribution) => {
        const occurrenceId = `occurrence_${++sequence}`;
        return registry.register(occurrenceId, attribution, now) ? occurrenceId : null;
      },
    }),
    humanAdmissionObservation: Object.freeze({
      observeCommitted: () => driver.noteHumanAdmission(),
    }),
    lexicalOccurrences: Object.freeze({
      publishCommitted: (publication) => {
        for (const edit of publication.edits) registry.claim(edit.occurrence, now);
        driver.admit(publication);
      },
    }),
  });
  const readMaterial = () => {
    const current = store.getState();
    return { tree: current.tree as ThoughtTree, documentEpoch: current.documentEpoch };
  };
  const driver = createWikiOccurrenceDriver({
    readMaterial,
    settle: (occurrenceId, outcome) => {
      const attribution = registry.take(occurrenceId, now);
      if (attribution === null || outcome === "censored") return;
      pending.push(coordinator.settle({
        occurrenceId,
        outcome,
        rule: attribution.rule,
        origin: attribution.origin,
      }));
    },
    restore: (request) => store.getState().restoreHumanTextRange({
      ...request,
      commandId: `human_restore_${++sequence}`,
      createdAt: `2026-09-29T00:01:${String(sequence).padStart(2, "0")}.000Z`,
      expectedDocumentEpoch: request.documentEpoch,
    }).status === "committed",
    environment,
  });
  store.subscribe(() => driver.reconcile());

  let admission = 0;
  return {
    coordinator,
    driver,
    store,
    admit(transcript: string) {
      admission += 1;
      const current = store.getState();
      const receipt = current.admitHumanTranscript({
        target: "child",
        treeId: current.tree.id,
        baseRevision: current.tree.revision,
        parentNodeId: current.tree.rootId!,
      }, {
        interactionId: `voice_integration_${admission}`,
        commandId: `human_admission_integration_${admission}`,
        nodeId: `voice_node_integration_${admission}`,
        createdAt: `2026-09-29T00:00:${String(admission).padStart(2, "0")}.000Z`,
        transcript,
        expectedDocumentEpoch: current.documentEpoch,
        repairLocale: "en-US",
      });
      if (receipt.status !== "committed") throw new Error("admission rejected");
    },
    advance(milliseconds: number) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += WIKI_OCCURRENCE_TICK_MS) {
        now += WIKI_OCCURRENCE_TICK_MS;
        ticker?.();
      }
    },
    text(nodeId: string) {
      return store.getState().tree.nodes[nodeId]?.text;
    },
    async flush() {
      await Promise.all(pending.splice(0));
    },
  };
}

function memoryRepository(initial: WikiState): WikiRepository {
  let durable = { state: initial, writeGeneration: 1 };
  return {
    async load() {
      return { ok: true as const, value: durable };
    },
    async save(state, expectedGeneration) {
      if (expectedGeneration !== durable.writeGeneration) {
        return {
          ok: false as const,
          error: { code: "PERSISTENCE_CONFLICT" as const, message: "conflict" },
        };
      }
      durable = { state, writeGeneration: durable.writeGeneration + 1 };
      return { ok: true as const, value: durable.writeGeneration };
    },
    async resetCorrupt() {
      return {
        ok: false as const,
        error: { code: "PERSISTENCE_CONFLICT" as const, message: "not corrupt" },
      };
    },
    close() {},
  };
}
