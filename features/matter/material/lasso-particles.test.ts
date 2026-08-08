import { describe, expect, it } from "vitest";
import { projectOutsideLassoParticles } from "./lasso-particles";

const paper = { left: 100, top: 100, right: 500, bottom: 500 };

describe("projectOutsideLassoParticles", () => {
  it("survives the first frame of a stroke, which has one point", () => {
    expect(projectOutsideLassoParticles([], paper)).toEqual([]);
    expect(projectOutsideLassoParticles([{ x: 300, y: 300 }], paper)).toEqual([]);
    expect(projectOutsideLassoParticles([{ x: 20, y: 20 }], paper)).toHaveLength(1);
  });

  it("echoes a corner cutout the rounded paper does not cover", () => {
    const corner = { x: paper.left + 2, y: paper.top + 2 };
    expect(projectOutsideLassoParticles([corner], paper)).toEqual([]);
    expect(projectOutsideLassoParticles([corner], paper, 18)).toHaveLength(1);
    // A point well inside the same corner's arc still belongs to the paper.
    expect(projectOutsideLassoParticles([{ x: paper.left + 18, y: paper.top + 18 }], paper, 18))
      .toEqual([]);
  });

  it("keeps an inside-only stroke visually quiet", () => {
    expect(projectOutsideLassoParticles([{ x: 200, y: 200 }, { x: 300, y: 300 }], paper)).toEqual([]);
  });

  it("projects only sampled points outside the paper and scales distant marks", () => {
    const particles = projectOutsideLassoParticles([
      { x: 200, y: 200 }, { x: 210, y: 210 }, { x: 90, y: 120 }, { x: 80, y: 130 },
      { x: 20, y: 200 }, { x: 10, y: 210 },
    ], paper);
    expect(particles).toHaveLength(2);
    expect(particles.map((particle) => particle.size)).toEqual([3, 4]);
    expect(particles.every((particle) => Number.isInteger(particle.x) && Number.isInteger(particle.y))).toBe(true);
  });

  it("fades the trail back from the pointer", () => {
    const points = Array.from({ length: 24 }, (_, index) => ({ x: 10 + index, y: 20 }));
    const particles = projectOutsideLassoParticles(points, paper);
    const opacities = particles.map((particle) => particle.opacity);
    expect(opacities.at(0)).toBeLessThan(opacities.at(-1)!);
    expect(Math.min(...opacities)).toBeGreaterThan(0);
    expect(Math.max(...opacities)).toBeLessThanOrEqual(1);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
  });

  it("reaches full weight under the pointer", () => {
    const points = Array.from({ length: 24 }, (_, index) => ({ x: 10 + index, y: 20 }));
    const particles = projectOutsideLassoParticles(points, paper);
    expect(particles.at(-1)?.opacity).toBe(1);
  });

  it("bounds the count by dropping the tail rather than the head", () => {
    const points = Array.from({ length: 400 }, (_, index) => ({ x: index, y: 20 }));
    const particles = projectOutsideLassoParticles(points, paper);
    expect(particles).toHaveLength(72);
    // The final sampled point is what the hand is on, so it is never the one
    // the bound throws away.
    expect(particles.at(-1)?.opacity).toBe(1);
    expect(Math.abs((particles.at(-1)?.x ?? 0) - points.at(-1)!.x)).toBeLessThanOrEqual(10);
    // What the bound dropped is the far end of the stroke, not the near one.
    expect(particles.at(0)!.x).toBeGreaterThan(points.length / 2);
  });
});
