import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createComponentCell, preloadableComponent } from "./preloadable-component";

function Loaded(props: Readonly<{ label: string }>) {
  return createElement("span", null, props.label);
}

describe("preloadable component", () => {
  it("fetches once however many preloads and mounts ask for it", async () => {
    const load = vi.fn(() => Promise.resolve(Loaded));
    const cell = createComponentCell(load);
    const listener = vi.fn();
    cell.subscribe(listener);

    expect(cell.read()).toBeNull();
    await Promise.all([cell.preload(), cell.preload()]);
    await cell.preload();

    expect(load).toHaveBeenCalledOnce();
    expect(cell.read()).toBe(Loaded);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("lets a later preload retry a failed fetch", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Loaded);
    const cell = createComponentCell(load);

    await expect(cell.preload()).rejects.toThrow("offline");
    expect(cell.read()).toBeNull();
    await expect(cell.preload()).resolves.toBe(Loaded);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("renders nothing on the server, even once loaded, so hydration cannot mismatch", async () => {
    const Preloadable = preloadableComponent(() => Promise.resolve(Loaded));
    expect(renderToStaticMarkup(createElement(Preloadable, { label: "ready" }))).toBe("");

    await Preloadable.preload();
    expect(renderToStaticMarkup(createElement(Preloadable, { label: "ready" }))).toBe("");
  });
});
