import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories = [];
const FIXTURE_START_TIMEOUT_MS = 12_000;
// Some restricted runners prohibit every loopback bind. The socket below is
// the proof that process-group cleanup releases a grandchild resource, so
// skip only when this host cannot create that proof at all.
const loopbackBindingAvailable = await canBindLoopback();

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("run-e2e process cleanup", () => {
  it.skipIf(process.platform === "win32" || !loopbackBindingAvailable)(
    "terminates the POSIX process group, releases its grandchild port, and restores next-env",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "matter-e2e-runner-"));
      temporaryDirectories.push(directory);
      const scriptsDirectory = join(directory, "scripts");
      const binDirectory = join(directory, "bin");
      await mkdir(scriptsDirectory);
      await mkdir(binDirectory);
      await Promise.all([
        copyLocalScript("run-e2e.mjs", join(scriptsDirectory, "run-e2e.mjs")),
        copyLocalScript("e2e-runner.mjs", join(scriptsDirectory, "e2e-runner.mjs")),
      ]);
      await writeFile(
        join(directory, "next-env.d.ts"),
        'import "./.next-e2e/dev/types/routes.d.ts";\n',
      );
      const portFile = join(directory, "grandchild-port.txt");
      const fakeNpx = join(binDirectory, "npx");
      const grandchildSource = `
const { writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const server = createServer();
server.listen(0, "127.0.0.1", () => {
  writeFileSync(${JSON.stringify(portFile)}, String(server.address().port));
});
setInterval(() => {}, 1_000);
`;
      await writeFile(
        fakeNpx,
        `#!/usr/bin/env node
import { spawn } from "node:child_process";
spawn(process.execPath, ["-e", ${JSON.stringify(grandchildSource)}], { stdio: "ignore" });
process.stdout.write("fixture-ready\\n");
process.on("SIGINT", () => process.stdout.write("fixture-sigint\\n"));
process.on("SIGTERM", () => process.stdout.write("fixture-sigterm\\n"));
setInterval(() => {}, 1_000);
`,
      );
      await chmod(fakeNpx, 0o755);

      const wrapper = spawn(process.execPath, [join(scriptsDirectory, "run-e2e.mjs")], {
        cwd: directory,
        env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH ?? ""}` },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      wrapper.stdout.on("data", (chunk) => {
        output += String(chunk);
      });
      wrapper.stderr.on("data", (chunk) => {
        output += String(chunk);
      });

      await waitForText(() => output, "fixture-ready");
      const port = Number(await waitForFile(portFile));
      wrapper.kill("SIGINT");
      await waitForText(() => output, "fixture-sigint");
      wrapper.kill("SIGINT");
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(wrapper.exitCode).toBeNull();

      const result = await waitForExit(wrapper);
      expect(result).toEqual({ code: 1, signal: null });
      expect(output.match(/fixture-sigint/g)).toHaveLength(1);
      await expect(readFile(join(directory, "next-env.d.ts"), "utf8")).resolves.toBe(
        'import "./.next/types/routes.d.ts";\n',
      );
      await expect(waitForPortClosed(port)).resolves.toBeUndefined();
    },
    20_000,
  );

  it("does not fail cleanup when typegen never created next-env", async () => {
    const directory = await mkdtemp(join(tmpdir(), "matter-e2e-runner-no-env-"));
    temporaryDirectories.push(directory);
    const scriptsDirectory = join(directory, "scripts");
    const binDirectory = join(directory, "bin");
    await mkdir(scriptsDirectory);
    await mkdir(binDirectory);
    await Promise.all([
      copyLocalScript("run-e2e.mjs", join(scriptsDirectory, "run-e2e.mjs")),
      copyLocalScript("e2e-runner.mjs", join(scriptsDirectory, "e2e-runner.mjs")),
    ]);
    const staleOutput = join(directory, ".next-e2e", "dev");
    await mkdir(staleOutput, { recursive: true });
    await writeFile(join(staleOutput, "stale-action-manifest.json"), "{}");
    const fakeNpx = join(binDirectory, "npx");
    await writeFile(
      fakeNpx,
      `#!/usr/bin/env node
import { existsSync } from "node:fs";
process.exit(existsSync(${JSON.stringify(staleOutput)}) ? 7 : 0);
`,
    );
    await chmod(fakeNpx, 0o755);

    const result = await runWrapper(directory, binDirectory);
    expect(result).toEqual({ code: 0, signal: null });
  });
});

async function copyLocalScript(name, destination) {
  const source = await readFile(new URL(`./${name}`, import.meta.url), "utf8");
  await writeFile(destination, source);
}

function waitForText(readOutput, expected) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (readOutput().includes(expected)) {
        clearInterval(interval);
        clearTimeout(timeout);
        resolve();
      }
    }, 10);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for ${expected}: ${readOutput()}`));
    // Full Vitest runs start many module graphs at once. This fixture verifies
    // process-group cleanup, not a five-second startup-performance budget.
    }, FIXTURE_START_TIMEOUT_MS);
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForFile(path) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function waitForPortClosed(port) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const open = await portIsOpen(port);
    if (!open) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Grandchild port ${port} remained open`);
}

function portIsOpen(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error) => {
      if (error?.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
  });
}

function canBindLoopback() {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => {
      server.close((error) => resolve(error === undefined));
    });
  });
}

function runWrapper(directory, binDirectory) {
  return new Promise((resolve, reject) => {
    const wrapper = spawn(process.execPath, [join(directory, "scripts", "run-e2e.mjs")], {
      cwd: directory,
      env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH ?? ""}` },
      stdio: "ignore",
    });
    wrapper.once("error", reject);
    wrapper.once("exit", (code, signal) => resolve({ code, signal }));
  });
}
