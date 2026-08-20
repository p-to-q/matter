import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildTransformPlan,
  parseTransformEnvelope,
} from "../features/matter/protocol/transform-contract";
import {
  buildTextSwapPlan,
  parseTextSwapEnvelope,
} from "../features/matter/protocol/text-swap-contract";
import {
  MATERIAL_PROBE_MAX_CALLS_PER_SURFACE,
  MATERIAL_PROBE_MINIMUM_PACE_MS,
  MATERIAL_PROBE_PRODUCTION_ORIGIN,
  MATERIAL_PROBE_SUITE_DIGEST,
  MATERIAL_PROBE_SUITE_VERSION,
  assertMaterialProbeAuthorization,
  buildSyntheticEnvelope,
  createFileMaterialProbeReceiptStore,
  formatMaterialProbeReport,
  materialProbeSuiteMetadata,
  runMaterialOriginProbe,
  summarizeMaterialProbe,
} from "./material-origin-probe";
import { segmentText } from "../features/matter/material/text-segments";

const VERSION = "0.2.0-preview.36";
const REMOTE_ORIGIN = "https://preview.example.test";
const EXPANDED = "我们仍在认真而缓慢地学习如何让这个想法落到纸上";
const SWAPPED = "我们还在探索怎样让这个想法真正落到纸上";

describe("deployed material origin probe", () => {
  it("builds only strict synthetic envelopes accepted by the production parsers", () => {
    const transform = buildSyntheticEnvelope("turn", 1);
    const swap = buildSyntheticEnvelope("text-swap", 1);
    expect(parseTransformEnvelope(transform).ok).toBe(true);
    expect(parseTextSwapEnvelope(swap).ok).toBe(true);
    expect(Object.keys(transform).sort()).toEqual([
      "context", "gesture", "id", "locale", "mode", "operation", "protocolVersion",
      "requestVersion", "selection", "treeId", "treeRevision",
    ].sort());
    expect(Object.keys(swap).sort()).toEqual([
      "context", "direction", "id", "locale", "mode", "operation", "protocolVersion",
      "requestVersion", "selection", "treeId", "treeRevision",
    ].sort());
  });

  it("freezes fifty distinct exact-segment inputs per surface across every locale, class, and axis", () => {
    expect(MATERIAL_PROBE_SUITE_VERSION).toBe("material-origin-synthetic/1");
    expect(MATERIAL_PROBE_SUITE_DIGEST).toMatch(/^[0-9a-f]{64}$/u);
    expect(MATERIAL_PROBE_SUITE_DIGEST).toBe(
      "d313d016ca1f3f698f363edfbdcb547e3f57abaf97f845d9cadff5657fe0bd91",
    );
    for (const surface of ["turn", "text-swap"]) {
      const locales = new Set();
      const semanticClasses = new Set();
      const axes = new Set();
      const inputs = new Set();
      for (let sampleNumber = 1; sampleNumber <= MATERIAL_PROBE_MAX_CALLS_PER_SURFACE; sampleNumber += 1) {
        const envelope = buildSyntheticEnvelope(surface, sampleNumber);
        const node = envelope.context.lineage.at(-1);
        expect(segmentText(node.text)).toContainEqual(expect.objectContaining({
          start: envelope.selection.start,
          end: envelope.selection.end,
        }));
        const metadata = materialProbeSuiteMetadata(surface, sampleNumber);
        locales.add(metadata.locale);
        metadata.semanticClasses.forEach((semanticClass) => semanticClasses.add(semanticClass));
        axes.add(metadata.axis);
        inputs.add(JSON.stringify({
          locale: envelope.locale,
          selectedText: envelope.selection.selectedText,
          nodeText: node.text,
          gesture: "gesture" in envelope ? envelope.gesture : undefined,
          direction: "direction" in envelope ? envelope.direction : undefined,
        }));
      }
      expect(inputs.size).toBe(50);
      expect([...locales].sort()).toEqual(["de-DE", "en-US", "ja-JP", "zh-CN", "zh-TW"]);
      expect(semanticClasses.size).toBe(12);
      expect(axes.size).toBe(3);
    }
  });

  it("performs zero network work before every execution capability is present", async () => {
    const fetchImpl = vi.fn();
    await expect(runMaterialOriginProbe(config({ execute: false }), { fetchImpl })).rejects.toThrow(
      /not been explicitly authorized/,
    );
    await expect(runMaterialOriginProbe(config({ confirmationOrigin: undefined }), { fetchImpl })).rejects.toThrow(
      /exact origin authorization/,
    );
    await expect(runMaterialOriginProbe(config({ allowRemote: false }), { fetchImpl })).rejects.toThrow(
      /exact origin authorization/,
    );
    await expect(runMaterialOriginProbe(config({
      origin: MATERIAL_PROBE_PRODUCTION_ORIGIN,
      confirmationOrigin: MATERIAL_PROBE_PRODUCTION_ORIGIN,
    }), { fetchImpl })).rejects.toThrow(/literal production authorization/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS, path-bearing, unbounded, and under-paced configurations", () => {
    expect(() => assertMaterialProbeAuthorization(config({ origin: "http://preview.example.test" })))
      .toThrow(/HTTPS origin/);
    expect(() => assertMaterialProbeAuthorization(config({ origin: `${REMOTE_ORIGIN}/matter` })))
      .toThrow(/path, query, or fragment/);
    expect(() => assertMaterialProbeAuthorization(config({ callsPerSurface: 51, profile: "promotion" })))
      .toThrow(/call count/);
    expect(() => assertMaterialProbeAuthorization(config({ callsPerSurface: 49, profile: "promotion" })))
      .toThrow(/exactly fifty/);
    expect(() => assertMaterialProbeAuthorization(config({ paceMs: 7_999 })))
      .toThrow(/pace/);
  });

  it("makes no POST when the material-live preflight is not exact", async () => {
    let posts = 0;
    const fetchImpl = deploymentFetch({
      materialState: "unavailable",
      post: async () => {
        posts += 1;
        throw new Error("POST must not happen");
      },
    });
    await expect(runProbe(config(), { fetchImpl })).rejects.toThrow(/material-live/);
    expect(posts).toBe(0);
  });

  it("creates a running receipt before health and appends safe samples before completion", async () => {
    const receipt = receiptRecorder();
    let clock = 0;
    const fetchImpl = deploymentFetch({
      post: async (url, init) => successResponse(url, init),
    });
    let fetches = 0;
    const guardedFetch = async (...args) => {
      if (fetches === 0) {
        expect(receipt.manifest?.status).toBe("running");
        expect(receipt.journal).toEqual([]);
      }
      fetches += 1;
      return fetchImpl(...args);
    };
    const times = [
      new Date("2026-08-20T12:00:00.000Z"),
      new Date("2026-08-20T12:00:20.000Z"),
    ];
    const summary = await runMaterialOriginProbe(config(), {
      fetchImpl: guardedFetch,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
      wallNow: () => times.shift(),
      receiptStore: receipt.store,
    });

    expect(summary.runOk).toBe(true);
    expect(receipt.journal).toHaveLength(2);
    expect(receipt.completed).toMatchObject({
      status: "completed",
      origin: REMOTE_ORIGIN,
      expectedVersion: VERSION,
      healthVersion: VERSION,
      expectedSamples: 2,
      completedSamples: 2,
      suiteVersion: MATERIAL_PROBE_SUITE_VERSION,
      suiteDigest: MATERIAL_PROBE_SUITE_DIGEST,
      startedAt: "2026-08-20T12:00:00.000Z",
      completedAt: "2026-08-20T12:00:20.000Z",
    });
    const artifact = JSON.stringify({
      manifest: receipt.manifest,
      journal: receipt.journal,
      stopped: receipt.stopped,
      completed: receipt.completed,
    });
    for (const forbidden of [
      "selectedText", "direction", "lineage", "passage", "nodeId", "treeId",
      "probe_transform_", "probe_text_swap_", "cookie", "127.0.0.1",
      "我们仍在学习如何让这个想法落到纸上",
    ]) expect(artifact).not.toContain(forbidden);
  });

  it("stops before the next POST when the awaited sample journal fails", async () => {
    const receipt = receiptRecorder({ failAppend: true });
    let posts = 0;
    const fetchImpl = deploymentFetch({
      post: async (url, init) => {
        posts += 1;
        return successResponse(url, init);
      },
    });
    await expect(runMaterialOriginProbe(config(), {
      fetchImpl,
      receiptStore: receipt.store,
    })).rejects.toThrow(/synthetic journal write failed/);
    expect(posts).toBe(1);
    expect(receipt.journal).toHaveLength(1);
    expect(receipt.completed).toBeUndefined();
  });

  it("persists only manifest, safe journal, and completed summary in the gitignored receipt shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "matter-origin-receipt-"));
    try {
      let clock = 0;
      await runMaterialOriginProbe(config(), {
        fetchImpl: deploymentFetch({
          post: async (url, init) => successResponse(url, init),
        }),
        now: () => clock,
        sleep: async (milliseconds) => { clock += milliseconds; },
        receiptStore: createFileMaterialProbeReceiptStore(root),
      });
      const directories = await readdir(root);
      expect(directories).toHaveLength(1);
      const runDirectory = join(root, directories[0]);
      expect((await readdir(runDirectory)).sort()).toEqual([
        "manifest.json",
        "samples.jsonl",
        "summary.json",
      ]);
      const journal = await readFile(join(runDirectory, "samples.jsonl"), "utf8");
      expect(journal.trim().split("\n")).toHaveLength(2);
      const completed = JSON.parse(await readFile(join(runDirectory, "summary.json"), "utf8"));
      expect(completed).toMatchObject({
        status: "completed",
        suiteVersion: MATERIAL_PROBE_SUITE_VERSION,
        suiteDigest: MATERIAL_PROBE_SUITE_DIGEST,
        completedSamples: 2,
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("sends one strict request per surface with same-origin headers and one global pace", async () => {
    let clock = 0;
    const starts = [];
    const requests = [];
    const fetchImpl = deploymentFetch({
      post: async (url, init) => {
        starts.push(clock);
        requests.push({ url, init });
        clock += 120;
        return successResponse(url, init);
      },
    });
    const summary = await runProbe(config(), {
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });

    expect(starts).toEqual([0, MATERIAL_PROBE_MINIMUM_PACE_MS]);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.init.method).toBe("POST");
      expect(request.init.redirect).toBe("manual");
      expect(request.init.credentials).toBe("omit");
      expect(request.init.cache).toBe("no-store");
      expect(request.init.headers).toMatchObject({
        accept: "application/json",
        "cache-control": "no-store",
        "content-type": "application/json",
        origin: REMOTE_ORIGIN,
        "sec-fetch-site": "same-origin",
      });
    }
    expect(summary.runOk).toBe(true);
    expect(summary.bySurface.turn.strictPlans).toBe(1);
    expect(summary.bySurface["text-swap"].strictPlans).toBe(1);
  });

  it("never retries rejected or unavailable model outcomes", async () => {
    let posts = 0;
    const fetchImpl = deploymentFetch({
      post: async (url) => {
        posts += 1;
        if (url.endsWith("/api/turn")) {
          return jsonResponse(url, 422, {
            error: {
              code: "TURN_REJECTED",
              message: "Synthetic transform rejected.",
              retryable: true,
              fallbackReason: "MODEL_REJECTED",
            },
          });
        }
        return jsonResponse(url, 503, {
          error: {
            code: "TURN_UNAVAILABLE",
            message: "Synthetic text swap unavailable.",
            retryable: true,
            fallbackReason: "MODEL_UNAVAILABLE",
          },
        });
      },
    });
    let clock = 0;
    const summary = await runProbe(config(), {
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(posts).toBe(2);
    expect(summary.bySurface.turn.rejected).toBe(1);
    expect(summary.bySurface["text-swap"].unavailable).toBe(1);
    expect(summary.runOk).toBe(false);
  });

  it("keeps timeout, busy, route, and transport failures distinct", async () => {
    let clock = 0;
    const providerFailures = await runProbe(config(), {
      fetchImpl: deploymentFetch({
        post: async (url) => url.endsWith("/api/turn")
          ? jsonResponse(url, 503, {
            error: {
              code: "TURN_UNAVAILABLE",
              message: "Synthetic transform timeout.",
              retryable: true,
              fallbackReason: "MODEL_TIMEOUT",
            },
          })
          : jsonResponse(url, 503, {
            error: {
              code: "TURN_UNAVAILABLE",
              message: "Synthetic text swap busy.",
              retryable: true,
              fallbackReason: "MODEL_BUSY",
            },
          }),
      }),
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(providerFailures.bySurface.turn.timeout).toBe(1);
    expect(providerFailures.bySurface["text-swap"].busy).toBe(1);

    clock = 0;
    const boundaryFailures = await runProbe(config(), {
      fetchImpl: deploymentFetch({
        post: async (url) => {
          if (url.endsWith("/api/turn")) {
            return jsonResponse(url, 504, {
              error: {
                code: "TURN_FAILED",
                message: "Synthetic route timeout.",
                retryable: true,
              },
            });
          }
          throw new Error("synthetic transport failure");
        },
      }),
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(boundaryFailures.bySurface.turn.timeout).toBe(1);
    expect(boundaryFailures.bySurface["text-swap"].transportFailed).toBe(1);
  });

  it("stops immediately when the probe itself reaches admission", async () => {
    const receipt = receiptRecorder();
    let posts = 0;
    const fetchImpl = deploymentFetch({
      post: async (url) => {
        posts += 1;
        return jsonResponse(url, 429, {
          error: {
            code: "TURN_UNAVAILABLE",
            message: "Synthetic rate boundary reached.",
            retryable: true,
            fallbackReason: "MODEL_BUSY",
          },
        });
      },
    });
    const summary = await runMaterialOriginProbe(config(), {
      fetchImpl,
      receiptStore: receipt.store,
    });
    expect(posts).toBe(1);
    expect(summary.bySurface.turn.admissionFailed).toBe(1);
    expect(summary.bySurface["text-swap"].calls).toBe(0);
    expect(receipt.stopped).toMatchObject({
      status: "stopped",
      stoppedBecause: "admission-failed",
      completedSamples: 1,
      expectedSamples: 2,
    });
    expect(receipt.completed).toBeUndefined();
  });

  it("stops on malformed success instead of accepting or retrying it", async () => {
    const receipt = receiptRecorder();
    let posts = 0;
    const fetchImpl = deploymentFetch({
      post: async (url) => {
        posts += 1;
        return jsonResponse(url, 200, {
          protocolVersion: "0.2",
          requestVersion: "transform/2",
          unexpected: true,
        });
      },
    });
    const summary = await runMaterialOriginProbe(config(), {
      fetchImpl,
      receiptStore: receipt.store,
    });
    expect(posts).toBe(1);
    expect(summary.bySurface.turn.invalidResponse).toBe(1);
    expect(summary.bySurface["text-swap"].calls).toBe(0);
    expect(summary.runOk).toBe(false);
    expect(receipt.stopped).toMatchObject({
      status: "stopped",
      stoppedBecause: "invalid-response",
      completedSamples: 1,
      expectedSamples: 2,
    });
    expect(receipt.completed).toBeUndefined();
  });

  it("lets the production candidate policy reject a shape-correct no-op plan", async () => {
    let posts = 0;
    const fetchImpl = deploymentFetch({
      post: async (url, init) => {
        posts += 1;
        const envelope = JSON.parse(init.body);
        return jsonResponse(url, 200, {
          protocolVersion: envelope.protocolVersion,
          requestVersion: envelope.requestVersion,
          id: envelope.id,
          treeId: envelope.treeId,
          treeRevision: envelope.treeRevision,
          action: {
            id: envelope.id,
            type: "replace-text-range",
            nodeId: envelope.selection.nodeId,
            start: envelope.selection.start,
            end: envelope.selection.end,
            text: envelope.selection.selectedText,
            intent: "expand",
          },
          presentation: { motionHint: "grow" },
        });
      },
    });
    const summary = await runProbe(config(), { fetchImpl });
    expect(posts).toBe(1);
    expect(summary.bySurface.turn.invalidResponse).toBe(1);
  });

  it("keeps every planned request start at least eight seconds apart", async () => {
    let clock = 0;
    const starts = [];
    const fetchImpl = deploymentFetch({
      post: async (url, init) => {
        starts.push(clock);
        clock += 9_100;
        const envelope = JSON.parse(init.body);
        return envelope.treeRevision === 0
          ? successResponse(url, init)
          : jsonResponse(url, 503, {
              error: {
                code: "TURN_UNAVAILABLE",
                message: "Synthetic provider unavailable.",
                retryable: true,
                fallbackReason: "MODEL_UNAVAILABLE",
              },
            });
      },
    });
    const summary = await runProbe(config({
      profile: "promotion",
      callsPerSurface: 50,
    }), {
      fetchImpl,
      now: () => clock,
      sleep: async (milliseconds) => { clock += milliseconds; },
    });
    expect(starts).toHaveLength(100);
    expect(starts.slice(1).every((start, index) => start - starts[index] >= 8_000)).toBe(true);
    expect(summary.runOk).toBe(true);
    expect(summary.promotionReady).toBe(false);
  });

  it("uses nearest-rank p95 and requires the full 50+50 sample for promotion", () => {
    const samples = [];
    for (const surface of ["turn", "text-swap"]) {
      for (let index = 1; index <= 50; index += 1) {
        samples.push({
          surface,
          status: index === 50 ? 503 : 200,
          durationMs: index * 100,
          outcome: index === 50 ? "model-timeout" : "strict-plan",
        });
      }
    }
    const summary = summarizeMaterialProbe({
      profile: "promotion",
      callsPerSurface: 50,
      expectedVersion: VERSION,
    }, samples);
    expect(summary.bySurface.turn.latencyMs.strictPlan.p95).toBe(4_700);
    expect(summary.bySurface.turn.timeout).toBe(1);
    expect(summary.promotionReady).toBe(true);
  });

  it("never calls a mostly rejected origin promotion-ready", () => {
    const samples = [];
    for (const surface of ["turn", "text-swap"]) {
      for (let index = 1; index <= 50; index += 1) {
        samples.push({
          surface,
          status: index === 50 ? 200 : 422,
          durationMs: 900,
          outcome: index === 50 ? "strict-plan" : "model-rejected",
        });
      }
    }
    const summary = summarizeMaterialProbe({
      profile: "promotion",
      callsPerSurface: 50,
      expectedVersion: VERSION,
    }, samples);
    expect(summary.runOk).toBe(true);
    expect(summary.promotionReady).toBe(false);
  });

  it("formats only a low-cardinality aggregate", () => {
    const report = formatMaterialProbeReport(summarizeMaterialProbe({
      profile: "smoke",
      callsPerSurface: 1,
      expectedVersion: VERSION,
    }, [
      { surface: "turn", status: 200, durationMs: 900, outcome: "strict-plan" },
      { surface: "text-swap", status: 200, durationMs: 1_100, outcome: "strict-plan" },
    ]));
    expect(report).not.toContain("我们怀念的也许不是一个真实存在过的过去");
    expect(report).not.toContain("换一种更凝练的说法");
    expect(report).not.toContain("probe_transform_");
    expect(report).not.toContain("probe_text_swap_");
    expect(report).not.toContain("treeId");
    expect(report).not.toContain("nodeId");
    expect(report).toContain('"strictPlans":1');
  });
});

function config(overrides = {}) {
  return {
    origin: REMOTE_ORIGIN,
    expectedVersion: VERSION,
    profile: "smoke",
    callsPerSurface: 1,
    paceMs: MATERIAL_PROBE_MINIMUM_PACE_MS,
    execute: true,
    allowRemote: true,
    confirmationOrigin: REMOTE_ORIGIN,
    ...overrides,
  };
}

function runProbe(probeConfig, options = {}) {
  const receipt = receiptRecorder();
  return runMaterialOriginProbe(probeConfig, {
    receiptStore: receipt.store,
    ...options,
  });
}

function receiptRecorder({ failAppend = false } = {}) {
  const state = {
    manifest: undefined,
    journal: [],
    stopped: undefined,
    completed: undefined,
  };
  state.store = {
    begin: async (manifest) => {
      state.manifest = manifest;
      return {
        append: async (receipt) => {
          state.journal.push(receipt);
          if (failAppend) throw new Error("synthetic journal write failed");
        },
        stop: async (receipt) => {
          state.stopped = receipt;
        },
        complete: async (receipt) => {
          state.completed = receipt;
        },
      };
    },
  };
  return state;
}

function deploymentFetch({ materialState = "available", post }) {
  return async (input, init = {}) => {
    const url = String(input);
    if ((init.method ?? "GET") === "POST") return post(url, init);
    if (url.endsWith("/matter")) return responseAt(url, new Response(null, { status: 404 }));
    if (url.endsWith("/api/health")) {
      return responseAt(url, Response.json({
        protocolVersion: "0.2",
        appVersion: VERSION,
        basePath: "",
        status: "ok",
        surfaces: {
          material: "available",
          localPersistence: "available",
          voiceAdmission: "available",
          thoughtLabel: "available",
          transcriptRepair: "available",
          inquiry: "available",
          transformTurn: materialState,
          textSwap: materialState,
          archiveExportImport: "available",
        },
      }, { headers: { "cache-control": "no-store" } }));
    }
    return responseAt(url, new Response("Matter", {
      status: 200,
      headers: {
        "permissions-policy": "microphone=(self)",
        "referrer-policy": "no-referrer",
        "strict-transport-security": "max-age=63072000",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      },
    }));
  };
}

function successResponse(url, init) {
  const raw = JSON.parse(init.body);
  if (url.endsWith("/api/turn")) {
    const parsed = parseTransformEnvelope(raw);
    if (!parsed.ok) throw new Error("test transform envelope invalid");
    return jsonResponse(url, 200, buildTransformPlan(parsed.envelope, EXPANDED));
  }
  const parsed = parseTextSwapEnvelope(raw);
  if (!parsed.ok) throw new Error("test text-swap envelope invalid");
  return jsonResponse(url, 200, buildTextSwapPlan(parsed.envelope, SWAPPED));
}

function jsonResponse(url, status, body) {
  return responseAt(url, Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  }));
}

function responseAt(url, response) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}
