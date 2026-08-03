import type {
  ActionPlan,
  CanvasAction,
  CommandResult,
  SceneCommand,
  SceneDocument,
  SceneMutation,
} from "./protocol";

function assertNever(value: never): never {
  throw new Error(`Unsupported value: ${JSON.stringify(value)}`);
}

function applyMutation(
  scene: SceneDocument,
  mutation: SceneMutation,
): { scene: SceneDocument; inverse: SceneMutation; affectedId: string } {
  if (mutation.type === "insert-object") {
    if (scene.objects[mutation.object.id]) {
      throw new Error(`Object ${mutation.object.id} already exists.`);
    }

    const index = Math.min(Math.max(0, mutation.index), scene.order.length);
    const order = [...scene.order];
    order.splice(index, 0, mutation.object.id);

    return {
      scene: {
        ...scene,
        objects: { ...scene.objects, [mutation.object.id]: mutation.object },
        order,
      },
      inverse: { type: "remove-object", objectId: mutation.object.id },
      affectedId: mutation.object.id,
    };
  }

  if (mutation.type === "remove-object") {
    const object = scene.objects[mutation.objectId];
    if (!object) throw new Error(`Object ${mutation.objectId} does not exist.`);
    const index = scene.order.indexOf(mutation.objectId);
    const objects = { ...scene.objects };
    delete objects[mutation.objectId];

    return {
      scene: {
        ...scene,
        objects,
        order: scene.order.filter((id) => id !== mutation.objectId),
      },
      inverse: { type: "insert-object", object, index },
      affectedId: mutation.objectId,
    };
  }

  if (mutation.type === "replace-object") {
    const previous = scene.objects[mutation.object.id];
    if (!previous) {
      throw new Error(`Object ${mutation.object.id} does not exist.`);
    }

    return {
      scene: {
        ...scene,
        objects: {
          ...scene.objects,
          [mutation.object.id]: mutation.object,
        },
      },
      inverse: { type: "replace-object", object: previous },
      affectedId: mutation.object.id,
    };
  }

  return assertNever(mutation);
}

export function applySceneCommand(
  scene: SceneDocument,
  command: SceneCommand,
): CommandResult {
  let next = scene;
  const inverseMutations: SceneMutation[] = [];
  const affectedObjectIds = new Set<string>();

  try {
    for (const mutation of command.mutations) {
      const result = applyMutation(next, mutation);
      next = result.scene;
      inverseMutations.unshift(result.inverse);
      affectedObjectIds.add(result.affectedId);
    }
  } catch (error) {
    throw new Error(
      `Scene command ${command.id} was rejected atomically: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  return {
    scene: { ...next, revision: scene.revision + 1 },
    inverse: {
      id: `inverse_${command.id}`,
      interactionId: command.interactionId,
      mutations: inverseMutations,
      createdAt: command.createdAt,
    },
    affectedObjectIds: [...affectedObjectIds],
  };
}

function actionToMutation(
  scene: SceneDocument,
  action: CanvasAction,
  now: string,
): SceneMutation {
  if (action.type === "create-thought") {
    return {
      type: "insert-object",
      object: action.thought,
      index: scene.order.length,
    };
  }

  if (action.type === "create-related-thought") {
    const parent = scene.objects[action.parentId];
    if (!parent || parent.type !== "thought") {
      throw new Error(`Parent thought ${action.parentId} does not exist.`);
    }
    if (action.thought.parentId !== action.parentId) {
      throw new Error(`Related thought ${action.thought.id} has the wrong parent.`);
    }
    return {
      type: "insert-object",
      object: action.thought,
      index: scene.order.length,
    };
  }

  if (action.type === "replace-text-range") {
    const object = scene.objects[action.objectId];
    if (!object || object.type !== "thought") {
      throw new Error(`Thought ${action.objectId} does not exist.`);
    }
    if (action.start > action.end || action.end > object.text.length) {
      throw new Error(`Text range for ${action.objectId} is invalid.`);
    }
    const text =
      object.text.slice(0, action.start) +
      action.text +
      object.text.slice(action.end);

    return {
      type: "replace-object",
      object: {
        ...object,
        text,
        revisions: [
          ...object.revisions,
          {
            id: `rev_${action.id}`,
            text,
            createdAt: now,
            source: "agent",
          },
        ],
      },
    };
  }

  return assertNever(action);
}

export function planToSceneCommand(
  scene: SceneDocument,
  plan: ActionPlan,
  now = new Date().toISOString(),
): SceneCommand {
  if (plan.sceneRevision !== scene.revision) {
    throw new Error(
      `Scene revision conflict: expected ${scene.revision}, received ${plan.sceneRevision}.`,
    );
  }

  const ids = new Set<string>();
  for (const action of plan.actions) {
    if (ids.has(action.id)) throw new Error(`Duplicate action ID ${action.id}.`);
    ids.add(action.id);
  }

  return {
    id: `command_${plan.interactionId}`,
    interactionId: plan.interactionId,
    mutations: plan.actions.map((action) => actionToMutation(scene, action, now)),
    createdAt: now,
  };
}
