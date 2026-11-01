"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MatterLocale } from "../config/locales";
import type { MatterStoreViewState } from "../store/matter-store";
import { BRANCH_VERSION, BRANCH_TIMEOUT_MS } from "../config/branch";
import type { BranchRequest } from "../protocol/branch-contract";
import { underChildRoom } from "../runtime/under-child";
import { useDeliveryWindow } from "./use-delivery-window";

type BranchStatus = "idle" | "pending" | "failed" | "stale";
type Input = Readonly<{
  read: () => MatterStoreViewState;
  commit: MatterStoreViewState["commitBranch"];
  locale: MatterLocale;
  available: boolean;
  deliveryAvailable: boolean;
}>;

/** Owns one submitted child request; UI dismissal never submits another call. */
export function useBranch({ read, commit, locale, available, deliveryAvailable }: Input) {
  const flight = useRef<AbortController | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const ready = useRef<{ deliver: () => void; revision: number; epoch: number } | null>(null);
  const [status, setStatus] = useState<BranchStatus>("idle");
  const refreshDelivery = useDeliveryWindow({
    isAvailable: () => deliveryAvailable,
    onExit: (exit) => { if (!exit.persisted) flight.current?.abort(); },
    onChange: (open) => {
      const result = ready.current;
      if (result === null) return;
      const current = read();
      if (!open && current.tree.revision === result.revision && current.documentEpoch === result.epoch) return;
      ready.current = null; result.deliver();
    },
  }, flight);
  useEffect(() => { refreshDelivery(); });
  useEffect(() => () => flight.current?.abort(), []);
  const dismiss = useCallback(() => setStatus((value) => value === "pending" ? value : "idle"), []);
  const start = useCallback((parentId: string) => {
    if (flight.current !== null || !available) return;
    const current = read();
    const parent = current.tree.nodes[parentId];
    if (parent === undefined || parent.role === "document-root" || underChildRoom(current.tree, parentId) !== null) {
      setStatus("failed"); return;
    }
    const input: BranchRequest = { version: BRANCH_VERSION, requestId: crypto.randomUUID(),
      treeId: current.tree.id, revision: current.tree.revision, parentId,
      locale, parentText: parent.text, children: parent.children.map((id) => current.tree.nodes[id].text) };
    const controller = new AbortController();
    flight.current = controller;
    setParentId(parentId);
    setStatus("pending");
    // Includes lazy chunk delivery, so a stalled import cannot hold the paper.
    const timer = window.setTimeout(() => controller.abort(), BRANCH_TIMEOUT_MS);
    controller.signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      if (flight.current === controller) { ready.current = null; flight.current = null; setStatus("failed"); }
    }, { once: true });
    void import("./branch-client").then(({ requestBranch }) => requestBranch(input, controller.signal))
      .then((answer) => {
        if (controller.signal.aborted) return;
        window.clearTimeout(timer);
        // A resolved paid answer waits for its visible, pointer-idle passage.
        ready.current = { revision: input.revision, epoch: current.documentEpoch, deliver: () => {
          if (controller.signal.aborted || flight.current !== controller) return;
          const receipt = commit(input, answer, { nodeId: `thought_${crypto.randomUUID()}`,
            createdAt: new Date().toISOString() }, current.documentEpoch);
          flight.current = null;
          setStatus(receipt.status === "committed" ? "idle" : "stale");
        } };
        refreshDelivery();
      }).catch(() => { if (!controller.signal.aborted) setStatus("failed"); })
      .finally(() => {
        window.clearTimeout(timer);
        if (flight.current === controller && ready.current === null) {
          flight.current = null;
          if (controller.signal.aborted) setStatus("failed");
        }
      });
  }, [available, commit, locale, read, refreshDelivery]);
  return { status, start, dismiss, parentId };
}
