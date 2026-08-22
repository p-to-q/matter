# Runtime cache and delivery

This note fixes Matter's delivery boundary. It distinguishes caches that remove
reproducible transport or derivation work from state that carries a person's
material. It is reference context, not a license to cache a new response.

## Cache matrix

| Resource | Owner and key | Bound and invalidation | Failure fallback | Authority |
| --- | --- | --- | --- | --- |
| prerendered product shell | Next/Vercel deployment, route + deployment | immutable deployment; replaced by promotion | fetch the current deployment | reproducible presentation |
| `/_next/static` JavaScript, CSS, fonts, and WASM | Next/Vercel, content-hashed URL | one year and immutable; a content change creates a new URL | network fetch of the same hash | reproducible code/artwork |
| stable-name `/matter-ui/*` visuals | browser HTTP cache, exact URL | `max-age=14400, must-revalidate`; a later deployment may change the bytes | revalidate after four hours | reproducible artwork |
| on-device Whisper files | Transformers.js Cache Storage, pinned model-revision URL | browser-quota bounded and disposable; a code change must deliberately change revision | redownload, then fail the voice turn recoverably if unavailable | reproducible model weights, never a transcript |
| thought label proposal | `label-generator`, fingerprint of complete normalized input (material, locale, bound, ordered reference context) + prompt version | 256 process-local entries, ten minutes; validate again on read | deterministic label | disposable model proposal |
| accepted model label | browser `LabelRepository`, tree/node key + current material basis | best-effort IndexedDB, at most the tree's 2,000-node bound on load; stale/deleted material invalidates it | regenerate from the deterministic label and bounded model path | disposable local presentation cache |
| CI compiler output | GitHub Actions, OS + lockfile + source hashes | restored only for a compatible build; Next validates entries internally | cold build | disposable compiler work |

No HTTP, Next, CDN, browser, or shared application cache may retain raw audio,
a transcript, repair or inquiry answer, transform result, lineage, material
request, or material document. Those routes and their clients use `no-store`.
The server-to-provider POST is also `no-store`; its body is bounded, cancelled
with the owning request, and never becomes a Next data-cache entry. The label
exception above is intentionally process-local and revalidated: it can improve
a derived index label but cannot mutate or recover material.

A manual name may use the same browser label repository, but it is durable local
choice rather than a cache: it is written before presentation, is never evicted
while its node exists, and a write failure remains explicit. Neither accepted
model labels nor manual names enter `ThoughtTree`, history, a material snapshot,
or an archive.

`llms.txt` and `llms-full.txt` are public product-description documents with a
one-hour browser cache. They contain no person-specific state. The health probe
is `no-store`, because it describes the currently configured release surface.

## Initial and deferred work

The product route stays a permanent static prerender. Initial HTML may preload
the primary local font and references only the ordinary application chunks. It
must not reference the local-transcription worker, ONNX WASM, or Whisper model.

The local fallback is a separate sequence:

```text
Web Speech unavailable
  -> hydration confirms recorded-audio capability only (no worker)
person starts Voice and supplies one recording
  -> dynamic import and worker handshake run beside recording
recording ends
  -> decode and resample in the browser
  -> initialise pinned whisper-tiny q8/WASM pipeline
  -> Cache Storage hit, or one remote model download
  -> inference in the worker
```

The Hub model is pinned to commit
`ff4177021cc41f7db950912b73ea4fdf7d01d8e7`. The revision is part of the
Transformers.js browser-cache URL, so a deployment rollback and a repeat visit
refer to the same weights. Cache Storage is opportunistic: quota eviction or an
unavailable Cache API may make a later voice turn cold again, and correctness
must not depend on a hit. Model preparation is not pulled into page load or an
idle prefetch; downloading a speech model for a person who can use browser
recognition would make the primary path slower and consume their bandwidth.

The ambient video is similarly deferred until an idle opportunity, declares
`preload="none"`, pauses in a hidden document, and keeps the poster visible as
its weak-network floor. The hashed primary font uses `display: swap`; the
secondary Plantin face is not preloaded.

## Server cold starts

All request routes stay on the Node runtime in `hkg1`, close to the configured
model relay. The function bundles include no provider SDK and no server-side
model weights. A cold instance reads the small environment-defined pool and
opens its first outbound HTTP connection only for an admitted scenario. A warm
instance may reuse the runtime's connection pool and retains only bounded
scenario health, concurrency counters, and the disposable label cache.

Cold-start resets are safe: those values are performance evidence, never
authority. Matter does not send synthetic keep-warm traffic. It would spend
provider capacity, cannot guarantee which horizontal replica stays warm, and
would blur operational probes with human requests. Scenario deadlines, per-
candidate attempt ceilings, cancellation, load shedding, cooldown, and honest
floors are the cold-path contract.

## CDN and RSC correctness

Next owns the static shell and all RSC variants. On Vercel, content-hashed
static files are deployment-cacheable automatically. A future non-Vercel CDN
must preserve the `rsc` request header, include `_rsc` in its cache key, respect
Next's `Vary`, and preserve prefetch headers; an HTML response must never be
served to an RSC request. Matter does not add a parallel CDN rule for the shell
or its RSC payload.

The stable-name artwork is different. Its four-hour browser TTL matches the
observed production contract and is deliberately not `immutable` or
`s-maxage`: the browser must revalidate after the bound, while Vercel owns edge
lifetime and invalidation with the deployment. This is a portability and
regression contract, not a claim that this release invented a new cache hit.

## Mechanical budgets

`npm run check:runtime` reads the completed production artifact and fails when:

- `/` is no longer a permanent static prerender or an API route is prerendered;
- root HTML exceeds 48 KiB;
- initial assets exceed 1,280 KiB raw or 384 KiB at gzip level 9;
- content-hashed `.next/static` assets exceed 26 MiB;
- the complete stable-name `public/` directory exceeds 512 KiB, including
  visuals, fonts, licences, and any future public file;
- the one lazy ONNX WASM exceeds 24 MiB, loses its content hash, is duplicated,
  or enters the initial HTML graph;
- emitted `next/font` files exceed 128 KiB or lose their content hashes;
- the four requested stable-name visual files exceed 400 KiB; this subset is
  measured separately from the complete `public/` budget and does not classify
  a font or licence as visual media;
- a production source map, document, E2E file, archive trace, temporary file,
  environment file, or test enters a runtime trace.

These are ceilings, not targets. A change that crosses one must first explain
the measured user benefit and update the budget in the same reviewed change;
silently widening a number to make CI pass is not an optimization. Vercel's
build cache and GitHub's `.next/cache` are separate disposable compiler caches
and are not part of the deployed runtime measurement.

## Operational receipt

After deployment, run the existing bounded deployment check. In addition to
version, surface, security, routing, and health `no-store` checks, it sends
header-only probes for the shell, legacy route, and poster, then requires the
real origin to return the four-hour,
must-revalidate, non-immutable media policy. A static `x-vercel-cache` hit is
useful observation but not a correctness condition: a first request or a newly
promoted deployment may truthfully miss.

Operations should retain aggregate, content-free measurements for:

- build duration and whether the Next build cache restored;
- root and hashed-static cache status, transfer bytes, and regional latency;
- function cold versus warm duration by scenario;
- provider attempt duration, timeout/fallback class, and pool candidate health;
- local-worker code load, model-cache hit/miss, model initialisation, and final
  inference duration, only if those can be observed without audio or text.

None of those observations may contain a question, transcript, answer,
selected passage, lineage, provider key, or stable person identifier. External
distributed rate limits, spend ceilings/alerts, and access control remain
deployment-owner controls; a healthy cache or origin does not prove them.

Primary references: the bundled Next 16 guides
`caching-without-cache-components`, `cdn-caching`, `lazy-loading`, and
`ci-build-caching`; Vercel's cache-control and CDN documentation; and the
Transformers.js `env` contract for browser and WASM caches.
