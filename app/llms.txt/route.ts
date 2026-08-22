import {
  MATTER_LLMS_FULL_URL,
  MATTER_PRODUCT_DESCRIPTION,
  MATTER_PRODUCT_TAGLINE,
  MATTER_ROBOTS_URL,
  MATTER_SITE_URL,
  MATTER_SITEMAP_URL,
} from "@/features/matter/seo/site";

const llms = `# Matter

> Matter — An interface for unfinished thought.

${MATTER_PRODUCT_DESCRIPTION}

${MATTER_PRODUCT_TAGLINE}

## Product

Matter is a browser-native environment where unfinished thought becomes
touchable material. Voice admits human material. Pointer and gesture identify
material and degree; Elastic Language fixes direction to its
\`expand-in-place\` tool policy. A rooted tree keeps lineage. AI is a property of
the material, not an assistant standing beside it. "Thinking with AI" is a
related category, not a prompt-box workflow.

## Product grammar

The intended turn is: reference a node or lassoed segment, set a non-negative
degree with gesture, use Elastic Language's fixed \`expand-in-place\` direction,
and receive one local, perceivable, reversible change. Voice admits human
material rather than directing that transform. The person keeps the handle and
can undo the change with a pointer.

## Current preview

The current public build is an early, root-seeded preview. It demonstrates a
rooted spatial tree, focus and folding, punctuation lasso selection, stretch
degree preview, browser-native voice admission with a lazy local fallback,
exact undo, local Markdown durability, and bounded Ask Matter inquiry. Thought
labels, transcript repair, and inquiry have independent live gates. Elastic and
Text Swap remain unavailable on the public deployment;
the preview does not expose a chat transcript, assistant panel, or hidden
retrieval.

## Canonical pages

- Matter: ${MATTER_SITE_URL}
- Sitemap: ${MATTER_SITEMAP_URL}
- Robots: ${MATTER_ROBOTS_URL}
- Full LLM map: ${MATTER_LLMS_FULL_URL}
`;

export function GET() {
  return new Response(llms, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
