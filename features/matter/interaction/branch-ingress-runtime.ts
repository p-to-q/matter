import type { prepareBranchIngress } from "../application/branch-ingress";

// Only the Branch client installs this capability, before spending a request.
let prepare: typeof prepareBranchIngress | null = null;
export const readBranchIngress = () => prepare;
export function installBranchIngress(value: typeof prepareBranchIngress): void { prepare = value; }
