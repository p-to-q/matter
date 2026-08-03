import { describe, expect, it } from "vitest";
import { actionPlanSchema } from "./schemas";
import { createEmptyScene, PROTOCOL_VERSION, type ActionPlan } from "./protocol";
import { applySceneCommand, planToSceneCommand } from "./scene-engine";

function createPlan(): ActionPlan {
  return {
    protocolVersion: PROTOCOL_VERSION,
    interactionId: "int_1",
    sceneRevision: 0,
    actions: [
      {
        id: "act_1",
        type: "create-thought",
        thought: {
          id: "thought_1",
          type: "thought",
          kind: "primary",
          text: "语言落在这里。",
          position: { x: 120, y: 220 },
          width: 480,
          revisions: [],
          style: { emphasis: 0.9, opacity: 1 },
        },
      },
    ],
  };
}

describe("scene engine", () => {
  it("applies a validated plan and creates an exact inverse", () => {
    const scene = createEmptyScene();
    const plan = actionPlanSchema.parse(createPlan());
    const result = applySceneCommand(scene, planToSceneCommand(scene, plan));

    expect(result.scene.objects.thought_1).toMatchObject({ text: "语言落在这里。" });
    expect(result.scene.revision).toBe(1);

    const undone = applySceneCommand(result.scene, result.inverse);
    expect(undone.scene.objects).toEqual({});
    expect(undone.scene.order).toEqual([]);
  });

  it("rejects stale plans before mutation", () => {
    const scene = { ...createEmptyScene(), revision: 2 };
    expect(() => planToSceneCommand(scene, createPlan())).toThrow(
      "Scene revision conflict",
    );
  });

  it("rejects duplicate object insertion atomically", () => {
    const scene = createEmptyScene();
    const plan = createPlan();
    plan.actions.push({ ...plan.actions[0], id: "act_2" });

    const command = planToSceneCommand(scene, plan);
    expect(() => applySceneCommand(scene, command)).toThrow("rejected atomically");
    expect(scene.objects).toEqual({});
  });

  it("restores text and revision history exactly", () => {
    const empty = createEmptyScene();
    const created = applySceneCommand(
      empty,
      planToSceneCommand(empty, createPlan(), "2026-08-02T00:00:00.000Z"),
    ).scene;
    const before = created.objects.thought_1;
    const replacePlan: ActionPlan = {
      protocolVersion: PROTOCOL_VERSION,
      interactionId: "int_2",
      sceneRevision: created.revision,
      actions: [
        {
          id: "act_replace",
          type: "replace-text-range",
          objectId: "thought_1",
          start: 0,
          end: 2,
          text: "文字",
          intent: "refine",
        },
      ],
    };

    const changed = applySceneCommand(
      created,
      planToSceneCommand(created, replacePlan, "2026-08-02T00:01:00.000Z"),
    );
    expect(changed.scene.objects.thought_1).not.toEqual(before);

    const undone = applySceneCommand(changed.scene, changed.inverse);
    expect(undone.scene.objects.thought_1).toEqual(before);
  });

  it("adds a related document node and removes it with the inverse", () => {
    const parentScene = applySceneCommand(
      createEmptyScene(),
      planToSceneCommand(createEmptyScene(), createPlan(), "2026-08-02T00:00:00.000Z"),
    ).scene;
    const relatedPlan: ActionPlan = {
      protocolVersion: PROTOCOL_VERSION,
      interactionId: "int_related",
      sceneRevision: parentScene.revision,
      actions: [
        {
          id: "act_related",
          type: "create-related-thought",
          parentId: "thought_1",
          thought: {
            id: "thought_2",
            type: "thought",
            kind: "satellite",
            parentId: "thought_1",
            text: "相关想法。",
            position: { x: 520, y: 260 },
            width: 300,
            revisions: [],
            style: { emphasis: 0.6, opacity: 0.82 },
          },
        },
      ],
    };

    const changed = applySceneCommand(
      parentScene,
      planToSceneCommand(parentScene, relatedPlan, "2026-08-02T00:01:00.000Z"),
    );
    expect(changed.scene.objects.thought_2).toMatchObject({
      parentId: "thought_1",
      kind: "satellite",
    });

    const undone = applySceneCommand(changed.scene, changed.inverse);
    expect(undone.scene.objects.thought_2).toBeUndefined();
    expect(undone.scene.objects.thought_1).toBeDefined();
  });
});
