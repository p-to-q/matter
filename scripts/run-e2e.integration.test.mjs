import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("run-e2e process cleanup", () => {
  it(
    "handles two SIGINTs, waits for the child fallback, and restores next-env",
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
      const fakeNpx = join(binDirectory, "npx");
      await writeFile(
        fakeNpx,
        `#!/usr/bin/env node
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
    },
    12_000,
  );
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
    }, 5_000);
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}
