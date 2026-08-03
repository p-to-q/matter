"use client";

import { useCallback, useState } from "react";
import type { Point, SceneCommand, ThoughtObject } from "../engine/protocol";
import { useArrowStore } from "../store/arrow-store";

type MoveSession = {
  pointerId: number;
  object: ThoughtObject;
  origin: Point;
  startPointer: Point;
  currentPointer: Point;
};

export function useThoughtMovement(zoom = 1) {
  const tool = useArrowStore((state) => state.tool);
  const commit = useArrowStore((state) => state.commit);
  const [session, setSession] = useState<MoveSession | null>(null);

  const beginMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (tool !== "move" || event.button !== 0) return false;
      const material = (event.target as HTMLElement).closest<HTMLElement>("[data-material]");
      const objectId = material?.dataset.objectId;
      const object = objectId ? useArrowStore.getState().scene.objects[objectId] : null;
      if (!material || !object || object.type !== "thought") return false;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const origin =
        object.id === "thought_sample" && object.position.x === 0 && object.position.y === 0
          ? { x: material.offsetLeft, y: material.offsetTop }
          : object.position;
      setSession({
        pointerId: event.pointerId,
        object,
        origin,
        startPointer: { x: event.clientX, y: event.clientY },
        currentPointer: { x: event.clientX, y: event.clientY },
      });
      return true;
    },
    [tool],
  );

  const move = useCallback((event: React.PointerEvent<HTMLElement>) => {
    setSession((current) =>
      current?.pointerId === event.pointerId
        ? {
            ...current,
            currentPointer: { x: event.clientX, y: event.clientY },
          }
        : current,
    );
  }, []);

  const endMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!session || session.pointerId !== event.pointerId) return;
      const position = {
        x: session.origin.x + (event.clientX - session.startPointer.x) / zoom,
        y: session.origin.y + (event.clientY - session.startPointer.y) / zoom,
      };
      setSession(null);
      if (Math.hypot(position.x - session.origin.x, position.y - session.origin.y) < 3) return;

      const createdAt = new Date().toISOString();
      const command: SceneCommand = {
        id: `command_move_${session.object.id}_${Date.now()}`,
        createdAt,
        mutations: [
          {
            type: "replace-object",
            object: { ...session.object, position },
          },
        ],
      };
      commit(command);
    },
    [commit, session, zoom],
  );

  const previewPosition = session
    ? {
        objectId: session.object.id,
        position: {
          x: session.origin.x + (session.currentPointer.x - session.startPointer.x) / zoom,
          y: session.origin.y + (session.currentPointer.y - session.startPointer.y) / zoom,
        },
      }
    : null;

  return { beginMove, move, endMove, moving: Boolean(session), previewPosition };
}
