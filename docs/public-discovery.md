# Public Discovery

Matter's public discovery surface is a product boundary, not a separate
marketing site. The canonical product sentence is:

> Matter — An interface for unfinished thought.

"Thinking with AI" is related category language. It can help people find the
product, but it does not replace the material-interface definition or turn
Matter into a chat product.

## One origin resolver

`features/matter/seo/site.ts` is the only owner of the public origin and the
Matter mount. It resolves values in this order:

1. `MATTER_PUBLIC_ORIGIN`, when it is a valid HTTP(S) origin;
2. `NEXT_PUBLIC_BASE_URL`, for compatibility with the public `[p → q]` site;
3. a Vercel production project host, then `https://www.ptoq.io`;
4. a Vercel preview host;
5. `http://localhost:3000` for local development.

The origin must not include a path, query, fragment, credentials, or a trailing
route. `MATTER_BASE_PATH=/matter` is appended to that origin by the same
resolver. Set `MATTER_BASE_PATH=` for a dedicated domain where Matter owns `/`.

The dedicated Matter preview at `matter.ptoq.io` uses this production
configuration through `vercel.json`:

```text
MATTER_PUBLIC_ORIGIN=https://matter.ptoq.io
MATTER_BASE_PATH=
MATTER_INITIAL_DOCUMENT=root
MATTER_TRANSCRIPTION_ADAPTER=browser
NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED=true
NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED=true
NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED=true
```

That initial document contains only the canonical root sentence. It is not a
server-side account or shared record: generated children are durable only in
the visitor's local browser document. The mounted `www.ptoq.io/matter` shape
remains available for local and companion deployments with the default expanded
fixture.

## Generated surfaces

All of these use the same canonical URL and product vocabulary:

- page metadata and canonical link at the Matter root;
- Organization, WebSite, and WebApplication JSON-LD;
- `robots.txt` with search and machine-reader access plus internal exclusions;
- `sitemap.xml` containing only the public Matter root;
- `manifest.webmanifest` and the 1200x630 `/og` image;
- `llms.txt` for a short factual map;
- `llms-full.txt` for the product grammar and current preview boundary.

The performance fixture is excluded from discovery.
The performance page also emits `noindex, nofollow` metadata. API paths are
disallowed in robots and return operational data rather than product copy.

## Copy boundary

Public copy can describe the intended interaction grammar: reference a node or
segment, set degree with gesture, speak direction, and receive one local,
perceivable, reversible change. It must also say that the current public build
is root-seeded, uses browser-native speech when supported, keeps a live
transform provider gated, and exposes Ask Matter only as a bounded
non-mutating question whose answer adapter may be unavailable. Do not expose material,
transcripts, provider configuration, hidden retrieval, or user state in metadata
or machine-readable text.

## Verification

Run the normal proof boundary:

```bash
npm run typecheck
npm run lint
npm run build
```

Then inspect the generated HTML and these routes under the configured mount:
`/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/og`, `/llms.txt`, and
`/llms-full.txt`. A dedicated-domain build must produce the same paths without a
`/matter` prefix.
