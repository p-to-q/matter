import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyLocalAiResponse,
  localAiRequests,
  normalizeLoopbackOrigin,
  parseLocalAiProbeArguments,
  probeLocalAi,
} from "./probe-local-ai.mjs";

test("is dry by default and accepts only an explicit loopback execution", () => {
  assert.deepEqual(parseLocalAiProbeArguments([]), { execute: false, origin: "http://127.0.0.1:3000/matter" });
  assert.deepEqual(parseLocalAiProbeArguments(["--execute", "--origin=http://localhost:3210/matter/"]), {
    execute: true,
    origin: "http://localhost:3210/matter",
  });
  assert.throws(() => normalizeLoopbackOrigin("https://matter.ptoq.io"), /loopback/);
  assert.throws(() => normalizeLoopbackOrigin("http://example.com/matter"), /loopback/);
  assert.throws(() => normalizeLoopbackOrigin("http://user:key@localhost:3000/matter"), /credentials/);
});

test("the default command exits successfully without a listening server", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./probe-local-ai.mjs", import.meta.url)),
    "--origin=http://127.0.0.1:1/matter",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry run — zero requests sent/);
  assert.equal(result.stderr, "");
});

test("builds one bounded synthetic request for every server-backed AI surface", () => {
  const requests = localAiRequests();
  assert.deepEqual(Object.keys(requests), ["repair", "label", "inquiry", "transform", "text-swap"]);
  assert.equal(requests.transform.requestVersion, "transform/2");
  assert.equal(requests.transform.selection.selectedText, "这件事可能没那么重要");
  assert.equal(requests["text-swap"].requestVersion, "text-swap/2");
});

test("does not mistake fallback floors for a usable provider", () => {
  assert.deepEqual(
    classifyLocalAiResponse("repair", "available", 200, { source: "verbatim", fallbackReason: "MODEL_TIMEOUT" }),
    { ok: false, outcome: "floor", reason: "MODEL_TIMEOUT" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("label", "available", 200, { source: "model" }),
    { ok: true, outcome: "model", reason: null },
  );
  assert.deepEqual(
    classifyLocalAiResponse("transform", "fixture", 422, { error: { fallbackReason: "MODEL_REJECTED" } }),
    { ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("transform", "available", 422, {
      error: {
        code: "TURN_REJECTED",
        message: "Synthetic bounded refusal.",
        retryable: true,
        fallbackReason: "MODEL_REJECTED",
      },
    }),
    { ok: false, outcome: "rejected", reason: "MODEL_REJECTED" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("inquiry", "available", 503, {
      error: {
        code: "INQUIRY_FAILED",
        message: "Synthetic provider busy.",
        retryable: true,
        fallbackReason: "MODEL_BUSY",
      },
    }),
    { ok: false, outcome: "busy", reason: "MODEL_BUSY" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("text-swap", "available", 503, {
      error: {
        code: "TURN_UNAVAILABLE",
        message: "Synthetic provider timeout.",
        retryable: true,
        fallbackReason: "MODEL_TIMEOUT",
      },
    }),
    { ok: false, outcome: "timeout", reason: "MODEL_TIMEOUT" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("transform", "available", 503, {
      error: {
        code: "TURN_UNAVAILABLE",
        message: "Synthetic provider unavailable.",
        retryable: true,
        fallbackReason: "MODEL_UNAVAILABLE",
      },
    }),
    { ok: false, outcome: "unavailable", reason: "MODEL_UNAVAILABLE" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("transform", "available", 429, {
      error: {
        code: "TURN_UNAVAILABLE",
        message: "Synthetic admission limit.",
        retryable: true,
        fallbackReason: "MODEL_BUSY",
      },
    }),
    { ok: false, outcome: "busy", reason: "MODEL_BUSY" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("transform", "available", 429, {
      error: {
        code: "TURN_UNAVAILABLE",
        message: "Wrong fallback for this status.",
        retryable: true,
        fallbackReason: "MODEL_TIMEOUT",
      },
    }),
    { ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("transform", "available", 503, {
      error: {
        code: "TURN_REJECTED",
        message: "Wrong status for this refusal.",
        retryable: true,
        fallbackReason: "MODEL_REJECTED",
      },
    }),
    { ok: false, outcome: "refused", reason: "INVALID_ENVELOPE" },
  );
  assert.deepEqual(
    classifyLocalAiResponse("text-swap", "available", 504, {
      error: {
        code: "TURN_FAILED",
        message: "Synthetic route timeout.",
        retryable: true,
      },
    }),
    { ok: false, outcome: "timeout", reason: "HTTP_504" },
  );
});

test("checks the expected health identity before issuing at most five posts", async () => {
  const calls = [];
  const requests = localAiRequests("testrun");
  const surfaces = {
    material: "available",
    localPersistence: "available",
    voiceAdmission: "available",
    thoughtLabel: "available",
    transcriptRepair: "available",
    inquiry: "available",
    transformTurn: "fixture",
    textSwap: "available",
    archiveExportImport: "available",
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
  const report = await probeLocalAi("http://127.0.0.1:3000/matter", {
    runId: "testrun",
    now: () => 1,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, redirect: init.redirect });
      if (url.endsWith("/api/health")) return json({
        status: "ok",
        protocolVersion: "0.2",
        appVersion: "0.2.0-preview.55",
        basePath: "/matter",
        surfaces,
      });
      if (url.endsWith("/api/repair")) return json({
        protocolVersion: "0.2",
        promptVersion: requests.repair.promptVersion,
        operationId: requests.repair.operationId,
        attempt: requests.repair.attempt,
        text: "Probe round one: the quiet room held its shape until morning.",
        source: "model",
      });
      if (url.endsWith("/api/label")) return json({
        protocolVersion: "0.2",
        promptVersion: requests.label.promptVersion,
        operationId: requests.label.operationId,
        basis: requests.label.basis,
        label: "Quiet room",
        source: "model",
      });
      if (url.endsWith("/api/inquiry")) return json({
        protocolVersion: "0.2",
        basis: {
          requestId: requests.inquiry.requestId,
          treeId: requests.inquiry.context.treeId,
          revision: requests.inquiry.context.revision,
          scope: requests.inquiry.context.scope,
        },
        status: "answered",
        text: "The material says the arrangement remains after the people leave.",
        receipt: {
          scope: requests.inquiry.context.scope,
          lineageNodes: requests.inquiry.context.lineage.length,
          contextCodePoints: requests.inquiry.context.lineage.reduce(
            (total, node) => total + Array.from(node.text).length,
            0,
          ),
          clipped: requests.inquiry.context.clipped,
          thoughtCount: requests.inquiry.context.thoughtCount,
        },
      });
      const textSwap = url.endsWith("/api/text-swap");
      const request = textSwap ? requests["text-swap"] : requests.transform;
      return json({
        protocolVersion: "0.2",
        requestVersion: textSwap ? "text-swap/2" : "transform/2",
        id: request.id,
        treeId: request.treeId,
        treeRevision: request.treeRevision,
        action: {
          id: request.id,
          type: "replace-text-range",
          nodeId: request.selection.nodeId,
          start: request.selection.start,
          end: request.selection.end,
          text: "replacement",
          intent: textSwap ? "paraphrase" : "expand",
        },
        presentation: { motionHint: textSwap ? "settle" : "grow" },
      });
    },
  });
  assert.equal(calls.length, 6);
  assert.equal(calls.filter((call) => call.method === "POST").length, 5);
  assert.ok(calls.every((call) => call.redirect === "error"));
  assert.ok(report.results.every((result) => result.ok));
  assert.deepEqual(report.voice, { configured: "available", outcome: "browser-proof-required" });
  const safeReport = JSON.stringify(report);
  assert.doesNotMatch(safeReport, /Probe round one|replacement|arrangement remains/u);
});

test("refuses to probe a different or stale Matter build", async () => {
  await assert.rejects(() => probeLocalAi("http://127.0.0.1:3000/matter", {
    fetchImpl: async () => new Response(JSON.stringify({
      status: "ok",
      protocolVersion: "0.2",
      appVersion: "0.2.0-preview.52",
      basePath: "/matter",
      surfaces: {},
    }), { headers: { "content-type": "application/json", "cache-control": "no-store" } }),
  }), /expected Matter version and base path/);
});

test("does not mistake an all-fixture development server for the AI demo profile", async () => {
  await assert.rejects(() => probeLocalAi("http://127.0.0.1:3000/matter", {
    fetchImpl: async () => new Response(JSON.stringify({
      status: "ok",
      protocolVersion: "0.2",
      appVersion: "0.2.0-preview.55",
      basePath: "/matter",
      surfaces: {
        material: "available",
        localPersistence: "available",
        voiceAdmission: "fixture",
        thoughtLabel: "fixture",
        transcriptRepair: "fixture",
        inquiry: "unavailable",
        transformTurn: "fixture",
        textSwap: "fixture",
        archiveExportImport: "available",
      },
    }), { headers: { "content-type": "application/json", "cache-control": "no-store" } }),
  }), /not running the localhost AI demo profile/);
});

test("keeps the exported probe loopback-only before any fetch", async () => {
  let calls = 0;
  await assert.rejects(() => probeLocalAi("https://matter.example.invalid/matter", {
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not fetch");
    },
  }), /loopback/);
  assert.equal(calls, 0);
});

test("rejects a route response without no-store before classifying it", async () => {
  await assert.rejects(() => probeLocalAi("http://127.0.0.1:3000/matter", {
    runId: "testrun",
    fetchImpl: async (url) => {
      if (url.endsWith("/api/health")) {
        return new Response(JSON.stringify({
          status: "ok",
          protocolVersion: "0.2",
          appVersion: "0.2.0-preview.55",
          basePath: "/matter",
          surfaces: {
            material: "available",
            localPersistence: "available",
            voiceAdmission: "available",
            thoughtLabel: "fixture",
            transcriptRepair: "available",
            inquiry: "available",
            transformTurn: "fixture",
            textSwap: "available",
            archiveExportImport: "available",
          },
        }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      return new Response("{}", { headers: { "content-type": "application/json" } });
    },
  }), /was not marked no-store/);
});

test("bounds a response body even when its stream ignores the fetch signal", async () => {
  let calls = 0;
  let canceled = 0;
  await assert.rejects(() => probeLocalAi("http://127.0.0.1:3000/matter", {
    routeTimeoutMs: 10,
    fetchImpl: async (url) => {
      calls += 1;
      if (url.endsWith("/api/health")) return localAiHealthResponse();
      return {
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "cache-control": "no-store",
        }),
        body: {
          getReader: () => ({
            read: () => new Promise(() => undefined),
            cancel: () => {
              canceled += 1;
              return Promise.resolve();
            },
          }),
        },
      };
    },
  }), /probe deadline/);
  assert.equal(calls, 2);
  assert.equal(canceled, 1);
});

test("rejects oversized declarations and malformed UTF-8 before classification", async () => {
  const routeResponses = [
    () => new Response("{}", {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "content-length": String(12 * 1_024 + 1),
      },
    }),
    () => new Response(new Uint8Array([0xc3, 0x28]), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }),
  ];
  for (const response of routeResponses) {
    let calls = 0;
    await assert.rejects(() => probeLocalAi("http://127.0.0.1:3000/matter", {
      fetchImpl: async (url) => {
        calls += 1;
        return url.endsWith("/api/health") ? localAiHealthResponse() : response();
      },
    }), /probe bound|malformed JSON/);
    assert.equal(calls, 2);
  }
});

function localAiHealthResponse() {
  return new Response(JSON.stringify({
    status: "ok",
    protocolVersion: "0.2",
    appVersion: "0.2.0-preview.55",
    basePath: "/matter",
    surfaces: {
      material: "available",
      localPersistence: "available",
      voiceAdmission: "available",
      thoughtLabel: "fixture",
      transcriptRepair: "available",
      inquiry: "available",
      transformTurn: "fixture",
      textSwap: "available",
      archiveExportImport: "available",
    },
  }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
