import { createMatterStore } from "../store/matter-store";
import { createBranchChildCommand } from "../material/seeded-document";

/** Explicit sample composition for tests that exercise local tree history. */
export function createDemoMatterStore(...args: Parameters<typeof createMatterStore>) {
  return createMatterStore(args[0], { ...args[1], demoBranch: createBranchChildCommand });
}
