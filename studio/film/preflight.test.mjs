import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FILM_COPY } from "./copy.mjs";
import {
  CAPTURE_INQUIRY_MATERIAL,
  CAPTURE_INQUIRY_QUESTION,
  captureInquiryRequest,
  normalizeLoopbackMatterOrigin,
  parseInquiryCapturePreflightArguments,
  preflightMatterInquiryCapture,
} from "./preflight.mjs";

const APP_VERSION = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
).version;

test("capture preflight stays dry by default and accepts only the loopback Matter path", () => {
  assert.deepEqual(parseInquiryCapturePreflightArguments([]), {
    execute: false,
    origin: "http://127.0.0.1:3121/matter",
  });
  assert.deepEqual(parseInquiryCapturePreflightArguments([
    "--execute",
    "--origin=http://localhost:4111/matter/",
  ]), {
    execute: true,
    origin: "http://localhost:4111/matter",
  });
  assert.throws(() => normalizeLoopbackMatterOrigin("https://127.0.0.1:3121/matter"), /plain-HTTP/u);
  assert.throws(() => normalizeLoopbackMatterOrigin("http://example.com/matter"), /loopback/u);
  assert.throws(() => normalizeLoopbackMatterOrigin("http://127.0.0.1:3121/"), /\/matter/u);
  assert.throws(() => normalizeLoopbackMatterOrigin("http://user:secret@127.0.0.1:3121/matter"), /credentials/u);
});

test("capture inquiry carries only one frozen synthetic root and one bounded question", () => {
  const request = captureInquiryRequest("capture-inquiry-test");
  assert.equal(request.requestId, "capture-inquiry-test");
  assert.equal(request.question, CAPTURE_INQUIRY_QUESTION);
  assert.equal(request.context.lineage.length, 1);
  assert.equal(request.context.lineage[0].text, CAPTURE_INQUIRY_MATERIAL);
  assert.equal(request.context.scope, "tree");
});

test("capture preflight accepts one strict live answer without exposing its text", async () => {
  const calls = [];
  const now = timeline([1_000, 1_845]);
  const receipt = await preflightMatterInquiryCapture("http://127.0.0.1:3121/matter", {
    requestId: "capture-inquiry-test",
    now,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/health")) return jsonResponse(health());
      const request = JSON.parse(init.body);
      return jsonResponse({
        protocolVersion: "0.2",
        basis: {
          requestId: request.requestId,
          treeId: request.context.treeId,
          revision: request.context.revision,
          scope: request.context.scope,
        },
        status: "answered",
        text: FILM_COPY.inquiry.answer,
        receipt: {
          scope: request.context.scope,
          lineageNodes: 1,
          contextCodePoints: Array.from(request.context.lineage[0].text).length,
          clipped: false,
          thoughtCount: 1,
        },
      });
    },
  });
  assert.deepEqual(receipt, {
    ok: true,
    configured: "available",
    status: 200,
    durationMs: 845,
    outcome: "model",
    reason: null,
  });
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(receipt).includes(FILM_COPY.inquiry.answer), false);
});

function health() {
  return {
    protocolVersion: "0.2",
    appVersion: APP_VERSION,
    basePath: "/matter",
    status: "ok",
    surfaces: {
      inquiry: "available",
    },
  };
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  });
}

function timeline(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
