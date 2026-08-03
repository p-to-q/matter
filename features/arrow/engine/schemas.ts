import { z } from "zod";

export const pointSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});

const textRevisionSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().max(2_000),
  createdAt: z.string().min(1).max(100),
  source: z.enum(["human", "agent", "fixture"]),
});

export const thoughtObjectSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal("thought"),
  kind: z.enum(["primary", "satellite", "whisper"]),
  text: z.string().trim().min(1).max(800),
  position: pointSchema,
  width: z.number().finite().min(160).max(760),
  parentId: z.string().min(1).max(100).optional(),
  revisions: z.array(textRevisionSchema).max(100),
  style: z.object({
    emphasis: z.number().finite().min(0).max(1),
    opacity: z.number().finite().min(0).max(1),
  }),
});

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const textSelectionSchema = z.object({
  type: z.literal("text-range"),
  objectId: z.string().min(1).max(100),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  selectedText: z.string().min(1).max(800),
  before: z.string().max(800),
  after: z.string().max(800),
  screenRects: z.array(rectSchema).min(1).max(40),
});

const stretchGestureSchema = z.object({
  type: z.literal("stretch"),
  axis: z.literal("vertical"),
  amount: z.number().finite().min(-1).max(1),
  startExtent: z.number().finite().positive(),
  endExtent: z.number().finite().positive(),
});

const compactDocumentNodeSchema = z
  .object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(800),
    kind: z.enum(["primary", "satellite", "whisper"]),
    parentId: z.string().min(1).max(100).optional(),
  })
  .strict();

const compactDocumentContextSchema = z
  .object({
    focus: z.tuple([compactDocumentNodeSchema]),
    ancestors: z.array(compactDocumentNodeSchema).max(4),
    children: z.array(compactDocumentNodeSchema).max(6),
    related: z.array(compactDocumentNodeSchema).max(6),
  })
  .strict();

const emptyDocumentContextSchema = z
  .object({
    focus: z.tuple([]),
    ancestors: z.tuple([]),
    children: z.tuple([]),
    related: z.tuple([]),
  })
  .strict();

const createThoughtActionSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal("create-thought"),
  thought: thoughtObjectSchema,
});

const replaceTextRangeActionSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal("replace-text-range"),
  objectId: z.string().min(1).max(100),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string().max(800),
  intent: z.enum(["expand", "compress", "reinterpret", "refine"]),
});

const createRelatedThoughtActionSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.literal("create-related-thought"),
  parentId: z.string().min(1).max(100),
  thought: thoughtObjectSchema,
});

export const canvasActionSchema = z.discriminatedUnion("type", [
  createThoughtActionSchema,
  replaceTextRangeActionSchema,
  createRelatedThoughtActionSchema,
]);

const interactionContextBase = {
  nearbyObjectIds: z.array(z.string().min(1).max(100)).max(30),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().min(0.25).max(4),
  }),
};

const interactionEnvelopeBaseSchema = z.object({
  protocolVersion: z.literal("0.1"),
  id: z.string().min(1).max(100),
  experienceId: z.literal("elastic-language"),
  sceneRevision: z.number().int().nonnegative(),
  voice: z.object({
    transcript: z.string().trim().min(1).max(2_000),
    language: z.string().max(35).optional(),
    durationMs: z.number().int().nonnegative().max(120_000).optional(),
  }),
  client: z.object({
    locale: z.string().min(1).max(35),
    fixtureMode: z.boolean(),
    inputCapabilities: z.object({
      pointer: z.boolean(),
      touch: z.boolean(),
    }),
  }),
});

export const interactionEnvelopeSchema = z
  .discriminatedUnion("mode", [
    interactionEnvelopeBaseSchema.extend({
      mode: z.literal("create"),
      anchor: pointSchema,
      context: z
        .object({
          ...interactionContextBase,
          document: emptyDocumentContextSchema,
        })
        .strict(),
    }),
    interactionEnvelopeBaseSchema.extend({
      mode: z.literal("transform"),
      selection: textSelectionSchema,
      gesture: stretchGestureSchema,
      context: z
        .object({
          ...interactionContextBase,
          document: compactDocumentContextSchema,
        })
        .strict(),
    }),
  ])
  .superRefine((input, context) => {
    if (
      input.mode === "transform" &&
      input.context.document.focus[0].id !== input.selection.objectId
    ) {
      context.addIssue({
        code: "custom",
        message: "Document focus must match the selected thought.",
        path: ["context", "document", "focus", 0, "id"],
      });
    }
  });

export const actionPlanSchema = z.object({
  protocolVersion: z.literal("0.1"),
  interactionId: z.string().min(1).max(100),
  sceneRevision: z.number().int().nonnegative(),
  actions: z.array(canvasActionSchema).min(1).max(2),
  presentation: z
    .object({
      focusObjectIds: z.array(z.string().min(1).max(100)).max(4).optional(),
      motionHint: z.enum(["grow", "compress", "settle"]).optional(),
    })
    .optional(),
});
