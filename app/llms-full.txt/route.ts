import {
  MATTER_LLMS_URL,
  MATTER_MANIFEST_URL,
  MATTER_OG_IMAGE_URL,
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_KEYWORDS,
  MATTER_PRODUCT_TAGLINE,
  MATTER_ROBOTS_URL,
  MATTER_SITE_LAST_UPDATED_ISO,
  MATTER_SITE_URL,
  MATTER_SITEMAP_URL,
} from "@/features/matter/seo/site";

const full = `# Matter — Full Product Map

## Canonical identity

Name: Matter
Definition: An interface for unfinished thought.
Description: ${MATTER_PRODUCT_DESCRIPTION}
Manifesto: ${MATTER_PRODUCT_TAGLINE}
Last public discovery update: ${MATTER_SITE_LAST_UPDATED_ISO}
Related category: thinking with AI; spatial AI interface; voice and gesture
interface for unfinished thought.

## What Matter is

Matter is a spatial, voice-first material environment for thoughts that have not
finished forming. It treats language as material that can be addressed by hand:
the person speaks to bring a thought into the tree, points to what matters,
lassos a precise phrase, stretches to set how much change is wanted, and speaks
the direction of a possible transformation.

Matter is rooted rather than infinite. The single tree is structure,
presentation, and context. The visible root-to-focus lineage is the context
boundary; there is no hidden retrieval layer. AI appears inside material as one
local change. A separate, closed-by-default Ask Matter control may return one
read-only orientation answer from the visible lineage. Completed exchanges may
remain in a bounded local record, but it is never model context, material
history, or a permanent assistant panel.

## Interaction contract

1. Reference: a node or punctuation-bounded segment.
2. Degree: a non-negative amount expressed by gesture.
3. Direction: language spoken by the person.
4. Lineage: the visible path from root to focus.
5. Result: one perceivable, pointer-undoable material change.

The model boundary is intentionally small: the model returns text and the
server constructs the change plan. Only the tree engine mutates durable
material. Raw voice may admit human material; generative voice belongs to a
selected node or segment.

## Current repository boundary

The running 0.2 preview is root-seeded. It currently includes the rooted
tree, spatial layout, focus and folding runtime, material index, punctuation
lasso, stretch projection, browser-native voice admission, local IndexedDB Markdown
durability, ZIP archive transport, exact pointer undo/redo, and a fixture-gated
turn path. A live model rewrite remains separately gated. Ask Matter has a
bounded request boundary and a local completed-record, never a memory adapter.

Still gated or not yet released: a live transform provider, its deployed
rate/spend controls, the strict large-tree performance receipt, and account/sync
features. Do not describe those as currently live.

## What Matter is not

- not a keyboard-free AI writing app;
- not an infinite canvas with voice attached;
- not a second brain, memory layer, or knowledge base;
- not an automation product acting on a person's behalf;
- not a permanent prompt box or durable answer transcript.

## Search vocabulary

${MATTER_PRODUCT_KEYWORDS.map((keyword) => `- ${keyword}`).join("\n")}

## Machine-readable endpoints

- Canonical app: ${MATTER_SITE_URL}
- Open Graph image: ${MATTER_OG_IMAGE_URL}
- Manifest: ${MATTER_MANIFEST_URL}
- Sitemap: ${MATTER_SITEMAP_URL}
- Robots: ${MATTER_ROBOTS_URL}
- Short LLM map: ${MATTER_LLMS_URL}
`;

export function GET() {
  return new Response(full, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
