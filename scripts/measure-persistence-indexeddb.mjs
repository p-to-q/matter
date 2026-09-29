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
    request.onupgradeneeded = () => {
      request.result.createObjectStore("snapshots", { keyPath: "treeId" });
      request.result.createObjectStore("historyEntries", {
        keyPath: ["treeId", "epoch", "stack", "position"],
      });
    };
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
  const bundleFor = (text) => {
    const files = { "matter/matter.json": "{}" };
    for (let index = 0; index < 2_000; index += 1) {
      const id = String(index).padStart(4, "0");
      files[`matter/${id}/index.md`] =
        `---\nid: thought_${id}\ncreatedAt: 2026-08-22T00:00:00.000Z\n` +
        `updatedAt: 2026-08-22T00:00:00.000Z\n---\n\n${text}${id}`;
    }
    return { files };
  };
  const manifest = (writeGeneration, undoEnd) => ({
    formatVersion: 1,
    epoch: 0,
    writeGeneration,
    treeRevision: 0,
    undo: [0, undoEnd],
    redo: [0, 0],
    count: undoEnd,
    bytes: 0,
  });
  const measureProfile = async (database, treeId, text) => {
    const snapshot = {
      storageSchemaVersion: 1,
      treeId,
      treeRevision: 0,
      writeGeneration: 1,
      bundle: bundleFor(text),
      historyJournal: manifest(1, 0),
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
  /**
   * A full bounded journal: 1,000 steps and about 32 MiB of inverses beside a
   * realistic row. Compares one per-step save and one recovery read with the
   * v5 layout, which rewrote the whole journal inside the row on every save.
   */
  const measureJournal = async (database) => {
    const treeId = "journal";
    const bundle = bundleFor("这是一段大约用于现实材料记录的文字。".repeat(12));
    const nodeText = "界".repeat(2_000);
    const inverse = (position) => ({
      id: `step_${position}:inverse`,
      source: "human",
      expectedTreeId: treeId,
      expectedRevision: position + 1,
      createdAt: "2026-09-29T00:00:00.000Z",
      mutation: {
        type: "restore-subtree",
        detached: {
          rootId: `n${position}_0`,
          parentId: "root",
          index: 0,
          parentChildrenBeforeDetach: [`n${position}_0`],
          nodes: Object.fromEntries(Array.from({ length: 5 }, (_, node) => [`n${position}_${node}`, {
            id: `n${position}_${node}`,
            text: nodeText,
            parentId: node === 0 ? "root" : `n${position}_0`,
            children: [],
            createdAt: "2026-09-29T00:00:00.000Z",
            updatedAt: "2026-09-29T00:00:00.000Z",
          }])),
        },
      },
    });
    const record = (position) => ({
      formatVersion: 1,
      treeId,
      epoch: 0,
      stack: "undo",
      position,
      commandId: `step_${position}`,
      source: "human",
      inverse: inverse(position),
      retainedInverseBytes: 0,
    });
    const records = Array.from({ length: 1_000 }, (_, position) => record(position));
    const journalBytes = new TextEncoder().encode(JSON.stringify(records)).byteLength;

    const seed = database.transaction(["snapshots", "historyEntries"], "readwrite");
    seed.objectStore("snapshots").put({
      storageSchemaVersion: 1, treeId, treeRevision: 0, writeGeneration: 1, bundle,
      historyJournal: manifest(1, 1_000),
    });
    for (const value of records) seed.objectStore("historyEntries").put(value);
    await transactionDone(seed);

    const rounds = [];
    for (let round = 0; round < 5; round += 1) {
      const generation = round + 2;
      const saveStartedAt = performance.now();
      const save = database.transaction(["snapshots", "historyEntries"], "readwrite");
      await requestDone(save.objectStore("snapshots").get(treeId));
      save.objectStore("snapshots").put({
        storageSchemaVersion: 1, treeId, treeRevision: generation, writeGeneration: generation, bundle,
        historyJournal: manifest(generation, 1_000 + round + 1),
      });
      save.objectStore("historyEntries").put(record(1_000 + round));
      const entries = save.objectStore("historyEntries");
      entries.delete(IDBKeyRange.bound([treeId, -Infinity], [treeId, 0], false, true));
      entries.delete(IDBKeyRange.bound([treeId, 1], [treeId, Infinity]));
      for (const stack of ["undo", "redo"]) {
        entries.delete(IDBKeyRange.bound([treeId, 0, stack, -Infinity], [treeId, 0, stack, round + 1], false, true));
        entries.delete(IDBKeyRange.bound([treeId, 0, stack, 1_000 + round + 1], [treeId, 0, stack, Infinity]));
      }
      await transactionDone(save);
      const stepSaveMs = performance.now() - saveStartedAt;

      const loadStartedAt = performance.now();
      const load = database.transaction(["snapshots", "historyEntries"], "readonly");
      await requestDone(load.objectStore("snapshots").get(treeId));
      await requestDone(load.objectStore("historyEntries").getAll(
        IDBKeyRange.bound([treeId, 0, "undo", round + 1], [treeId, 0, "undo", 1_000 + round + 1], false, true),
      ));
      await transactionDone(load);
      const loadMs = performance.now() - loadStartedAt;

      const legacyStartedAt = performance.now();
      const legacy = database.transaction("snapshots", "readwrite");
      legacy.objectStore("snapshots").put({
        storageSchemaVersion: 1, treeId: "legacy", treeRevision: generation, writeGeneration: generation, bundle,
        history: { entries: records, redoEntries: [], retainedInverseBytes: journalBytes },
      });
      await transactionDone(legacy);
      rounds.push({ stepSaveMs, loadMs, legacyInlineSaveMs: performance.now() - legacyStartedAt });
    }
    return {
      entries: records.length,
      journalBytes,
      stepSave: summarize(rounds, "stepSaveMs"),
      load: summarize(rounds, "loadMs"),
      legacyInlineSave: summarize(rounds, "legacyInlineSaveMs"),
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
    const journal = await measureJournal(database);
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
      journal,
    };
  } finally {
    database.close();
    indexedDB.deleteDatabase(databaseName);
  }
}
