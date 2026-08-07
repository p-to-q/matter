import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  createProcessSignalTarget,
  createSignalTerminator,
  normalizeNextEnvironment,
} from "./e2e-runner.mjs";

const nextEnvironmentPath = new URL("../next-env.d.ts", import.meta.url);
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(executable, ["playwright", "test", ...process.argv.slice(2)], {
  detached: process.platform !== "win32",
  env: process.env,
  stdio: "inherit",
});
const terminator = createSignalTerminator(createProcessSignalTarget(child));
const terminate = (signal) => {
  terminator.request(signal);
};

process.on("SIGINT", terminate);
process.on("SIGTERM", terminate);

try {
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = terminator.signal() === null ? exitCode : 1;
} finally {
  terminator.clear();
  process.off("SIGINT", terminate);
  process.off("SIGTERM", terminate);
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
}
