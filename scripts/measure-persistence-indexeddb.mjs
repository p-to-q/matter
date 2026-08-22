import http from "node:http";
import { chromium } from "@playwright/test";

const server = http.createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end("<!doctype html><title>Matter persistence benchmark</title>");
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The benchmark has no local port.");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}`);
  const receipt = await page.evaluate(measureIndexedDb);
  console.log(JSON.stringify(receipt));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

async function measureIndexedDb() {
  const openDatabase = (name) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots", { keyPath: "treeId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transactionDone = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const requestDone = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const summarize = (rounds, key) => {
    const durations = rounds.map((round) => round[key]).sort((left, right) => left - right);
    return {
      medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
      maxMs: Number(durations.at(-1).toFixed(2)),
    };
  };
  const measureProfile = async (database, treeId, text) => {
    const files = { "matter/matter.json": "{}" };
    for (let index = 0; index < 2_000; index += 1) {
      const id = String(index).padStart(4, "0");
      files[`matter/${id}/index.md`] =
        `---\nid: thought_${id}\ncreatedAt: 2026-08-22T00:00:00.000Z\n` +
        `updatedAt: 2026-08-22T00:00:00.000Z\n---\n\n${text}${id}`;
    }
    const snapshot = {
      storageSchemaVersion: 1,
      treeId,
      treeRevision: 0,
      writeGeneration: 1,
      bundle: { files },
      history: { entries: [], redoEntries: [], retainedInverseBytes: 0 },
    };
    const serializedBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
    const rounds = [];
    for (let round = 0; round < 5; round += 1) {
      const startedAt = performance.now();
      const transaction = database.transaction("snapshots", "readwrite");
      const putStartedAt = performance.now();
      transaction.objectStore("snapshots").put(snapshot);
      const putCallMs = performance.now() - putStartedAt;
      await transactionDone(transaction);
      const putTotalMs = performance.now() - startedAt;

      const getStartedAt = performance.now();
      const getTransaction = database.transaction("snapshots", "readonly");
      await requestDone(getTransaction.objectStore("snapshots").get(treeId));
      rounds.push({ putCallMs, putTotalMs, getMs: performance.now() - getStartedAt });
    }
    return {
      serializedBytes,
      putCall: summarize(rounds, "putCallMs"),
      putTotal: summarize(rounds, "putTotalMs"),
      get: summarize(rounds, "getMs"),
    };
  };
  const databaseName = "matter-persistence-benchmark";
  const database = await openDatabase(databaseName);
  const storageBefore = await navigator.storage?.estimate();
  try {
    const realistic = await measureProfile(
      database,
      "realistic",
      "这是一段大约用于现实材料记录的文字。".repeat(12),
    );
    const maximumText = await measureProfile(database, "maximum-text", "界".repeat(2_000));
    const storageAfter = await navigator.storage?.estimate();
    return {
      userAgent: navigator.userAgent,
      storage: {
        usageBefore: storageBefore?.usage ?? null,
        usageAfter: storageAfter?.usage ?? null,
        quota: storageAfter?.quota ?? storageBefore?.quota ?? null,
      },
      realistic,
      maximumText,
    };
  } finally {
    database.close();
    indexedDB.deleteDatabase(databaseName);
  }
}
