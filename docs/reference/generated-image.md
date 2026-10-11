# Generated image: style, transport, and what a probe proved

Status: context, not contract. This note records what a bounded probe of one
operator-supplied relay actually returned, and the illustration style the owner
selected from a reference drawing. It does not freeze a slice, authorize an
Image control, or name a provider as chosen. The slices it informs are S1 and S2
in [`../handoff-post-preview-direction.md`](../handoff-post-preview-direction.md).

No key appears here. Credentials live in `.env.local`, which is gitignored.

## What the probe found

One relay, two disjoint model families, two different endpoints and two
different return shapes. A model from either family fails on the other's path.

| Family | Path | Returns | Cross-call |
| --- | --- | --- | --- |
| `gpt-image-*` | `POST /v1/images/generations` | `data[0].url`, a CDN link | `chat/completions` → `unsupported_endpoint` |
| `gemini-*-image` | `POST /v1/chat/completions` | a markdown `![image](data:image/jpeg;base64,…)` inside `message.content` | `images/generations` → HTTP 500 |
| `flux-*` | — | — | `images/generations` → HTTP 404 |

Measured: 11–30 s per image; 348–472 KB of JPEG for one 1024² square;
base64 inflates that by about a third. The returned bytes carry an embedded
C2PA manifest — `urn:c2pa:` is visible in the first bytes of the payload — which
confirms that re-encoding on our side would destroy provider provenance.

Three consequences for the design.

*The standard path is real but not uniform here.* `/v1/images/generations` is
still the right contract to design against, because it is what a self-hosted
local server speaks. But an adapter must also absorb the chat-shaped family,
including parsing a data URL out of a markdown string. Both normalize to one
internal result of bytes plus a media type; neither shape reaches a scenario.

*This cannot ride the chat pool.* One image is roughly twenty-eight times the
pool's 32 KiB response ceiling. Raising that ceiling to reach images would
fracture the seam that keeps every text scenario bounded. The image port is a
separate port with its own ceiling, its own deadline, and its own lazy chunk.

*A URL is a result we must not accept.* One family returns a CDN link whose
lifetime the relay owns. The port fetches and persists inside the request, or
refuses; a link never becomes the operation's result.

## The style

Selected by the owner from a reference drawing: black ink line work, one cyan
accent, hand-drawn, square. Sampled from that reference, the palette is a white
ground at about three quarters of the image, black ink, and a cyan family
running from a pale `#B8F2FE` through a mid `#29ABE2` to a deep teal `#017D97`.

The style is a frozen server-owned constant, not a person-supplied instruction.
It is assembled the way `MATTER_BACKGROUND` already is: the scenario receives it
rather than composing it, so no caller can weaken or restyle it, and a person's
own direction enters separately through the bounded intent layer.

```text
Square 1:1 hand-drawn ink illustration on a pure white background.
Black brush-marker line work: thick, confident, gestural strokes with visibly
uneven weight and dry-brush roughness at the ends, as if drawn fast with a
chisel-tip felt pen. Lines overshoot and do not always close.
Exactly one accent colour family — cyan blue, from a pale wash (#B8F2FE)
through mid sea cyan (#6BDFF2) to deep teal (#017D97) — laid in as flat,
opaque marker blocks with hard edges that deliberately overshoot or fall short
of the ink lines, leaving bare white paper showing through.
No other colours. No gradient, no soft airbrush, no photographic shading, no
texture overlay, no frame, no background scenery, no text, no logo.
Let one thing in the drawing run past the edge of whatever was meant to hold
it, and leave the picture unresolved rather than explained.
If a person appears, they are drawn simply, with hair indicated by a few
strokes and no facial features at all. Generous empty white space.
Subject:
```

Three corrections earned by testing, and one lesson about the prompt itself.

*The mid tone is aqua, not sky blue.* The first draft used `#29ABE2`, whose blue
channel dominates its green, and the result read as too deep. Sampling the
reference showed its mid tones are a family where green and blue are nearly
equal — `#65E2FF`, `#63DFF9`, `#68DDF1` — which is why the owner described the
colour as sea-like. `#6BDFF2` is that family.

*One sentence carries the thought, and a section destroys it.* The picture's job
in the product is to hold thinking rather than close it, so the drawing has to
stay as unfinished as the passage. An attempt to specify this properly — a
paragraph on the escape device, another on vitality, worked examples of fish,
pots and mechanisms — produced exactly the wrong thing: the texture flattened,
the line went thin and neat, and the model reused the worked examples as
subjects. One sentence does the work that the paragraph ruined. The prompt is a
style, and a style tolerates very little explanation.

Two further findings. Naming the square format in the prose is what
produced a square; the chat path accepts no size parameter. And asking for a
figure with "no facial features" alone produced a blank oval that reads as
eerie — adding "hair indicated by a few strokes" fixes it, which is also what
the reference drawing does.

The style survives an abstract subject. Given a passage about missing a past
that never existed, the model produced gesture and motion rather than a literal
scene, which is the behaviour Matter needs: its subjects are passages of
someone's thinking, not objects.

## What the harness is

The prompt is assembled by `composePrompt`, with no new mechanism:

```text
STYLE       the frozen constant above, received by the scenario
MANDATE     one square illustration of the passage below
FIXED       the style; exactly one image; no lettering inside the image
NEVER       words, logos, borders, other colours, photographic rendering
<material>  the addressed passage, fenced — reference, never instruction
<intent>    the person's optional bounded direction, under INTENT_IS_BOUNDED
```

The person's direction is bounded by the same layer that already governs a Text
Swap direction, so it may steer the subject and cannot restyle the output or
widen the operation.

## Gates it needs

- a scenario-level authority switch, off by default, in the shape of the
  existing per-surface adapter switches;
- the shared public-request admission perimeter — origin, rate, concurrency;
- its own response-byte ceiling, sized for an image rather than for text, and
  enforced by the existing bounded-byte accumulator;
- its own deadline above the measured 30 s, and no automatic retry;
- an adjudicator that checks decodability, an allowlisted media type, dimension
  bounds and byte bounds, and that rejects anything else to the floor;
- no re-encoding anywhere in the path, so the provider's C2PA manifest survives;
- a fully lazy chunk and a route that never prerenders.
