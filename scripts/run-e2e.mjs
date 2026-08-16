import { readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  acquireE2eRunLock,
  createProcessSignalTarget,
  createSignalTerminator,
  normalizeNextEnvironment,
} from "./e2e-runner.mjs";

const nextEnvironmentPath = new URL("../next-env.d.ts", import.meta.url);
const e2eOutputPath = new URL("../.next-e2e/", import.meta.url);
const e2eLockPath = new URL("../.next-e2e.lock", import.meta.url);
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const releaseRunLock = await acquireE2eRunLock(e2eLockPath);
let terminator = null;
let terminate = null;

try {
  // A stopped Next development server can leave action and chunk manifests
  // that are individually valid but no longer belong to the next browser run.
  await rm(e2eOutputPath, {
    force: true,
    maxRetries: 3,
    recursive: true,
    retryDelay: 50,
  });
  const child = spawn(executable, ["playwright", "test", ...process.argv.slice(2)], {
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });
  terminator = createSignalTerminator(createProcessSignalTarget(child));
  terminate = (signal) => {
    terminator.request(signal);
  };
  process.on("SIGINT", terminate);
  process.on("SIGTERM", terminate);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = terminator.signal() === null ? exitCode : 1;
} finally {
  terminator?.clear();
  if (terminate !== null) {
    process.off("SIGINT", terminate);
    process.off("SIGTERM", terminate);
  }
  try {
    // Next dev writes the generated file for its current distDir; leave a
    // canonical local copy without making it repository state.
    try {
      const currentNextEnvironment = await readFile(nextEnvironmentPath, "utf8");
      const normalizedNextEnvironment = normalizeNextEnvironment(currentNextEnvironment);
      if (normalizedNextEnvironment !== currentNextEnvironment) {
        await writeFile(nextEnvironmentPath, normalizedNextEnvironment);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  } finally {
    await releaseRunLock();
  }
}
