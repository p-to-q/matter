export type DeploymentReloadState = Readonly<{
  different: boolean;
  idle: boolean;
  hydrated: boolean;
  unsaved: boolean;
  visible: boolean;
  current: boolean;
}>;

/** Read at the actual click, not at the render that enabled the button. */
export function requestDeploymentReload(read: () => DeploymentReloadState, reload: () => void): boolean {
  const state = read();
  if (!state.different || !state.idle || !state.hydrated || state.unsaved || !state.visible || !state.current) return false;
  reload();
  return true;
}
