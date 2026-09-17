# Submitted actions, lasso geometry, and private providers

Status: research record for the 2026-09 correction. Product and protocol
contracts remain in the parent documents. This note records the evidence,
engineering bets, rejected paths, and falsification plan behind them.

## Method

The three slices were not treated as one convenient UI patch. Each started with
one falsifiable question, then compared primary research, current platform and
provider documentation, and mature implementations. Sources inform the design;
they do not override Matter's explicit product and architecture invariants.

Matter does not train or fine-tune a model in this slice. A manufactured
"training strategy" would therefore be false precision. The corresponding
scientific work is to state the product and engineering hypothesis, hold its
authority boundary fixed, test adversarial counterexamples, and keep synthetic,
localhost-provider, browser, and deployed-origin evidence distinct.

## Bet 1 — submission is an operation boundary, not a presentation lifetime

[Herlihy and Wing's linearizability paper](https://www.cs.columbia.edu/~wing/publications/HerlihyWing90.pdf)
provides the useful correctness lens: overlapping operations remain reasoned
about as complete operations with explicit invocation and response boundaries.
[Kung and Robinson's optimistic concurrency work](https://www.cs.cmu.edu/~15712/papers/kung81.pdf)
provides the closer implementation path: perform bounded work without holding a
long lock, then validate the relevant read/write set before applying it.

Matter adopts a local version of those ideas:

- capture and draft state may follow the visible surface and can be dismissed;
- submit freezes one immutable operation, its input, locale, document owner, and
  exact material basis;
- unrelated UI, selection, navigation, revision, and temporary page visibility
  changes do not destroy that submitted work;
- a material result waits for a visible, pointer-idle delivery window, validates
  the exact target and lineage it read, then gives the tree engine one command;
- a real target conflict, document replacement, owner unmount, or page exit
  revokes authority rather than overwriting newer human material.

This is not a claim of exactly-once provider billing. Browser cancellation and
serverless transport cannot prove that property. It is a claim that one accepted
result has at most one durable tree effect, and that already-paid useful work is
not discarded merely because its composer or selection stopped being visible.
The platform's page lifecycle remains best effort; the
[web lifecycle guidance](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Deferred_Fetch)
is why Matter does not promise background completion after page exit.

Rejected paths:

- cancelling every request when a React presenter closes confuses UI ownership
  with operation ownership and wastes accepted user intent;
- accepting any late answer against only a global revision either loses useful
  unrelated concurrency or overwrites changed material;
- a durable background queue would require identity, storage, revocation, and
  privacy systems outside the first-release architecture.

Falsification focuses on late completion after overlay close, selection and
navigation changes, temporary page hiding, and unrelated edits; same-target
edits, reparenting, document replacement, page exit, and unmount must instead
make a late material result inert. Pointer-down delivery races must never mutate
material beneath the active hand.

## Bet 2 — preserve the complete lasso shape; infer no hidden semantic scope

Ramer's 1972 curve approximation and
[Douglas and Peucker's 1973 line-reduction method](https://utppublishing.com/doi/10.3138/FM57-6770-U75U-7727)
support an error-bounded complete-polyline simplification. That is materially
different from retaining an accurate prefix and replacing an over-budget tail
with one chord. Matter therefore uses one bounded full-stroke polyline for both
visible ink and semantic hit testing. If the point budget cannot preserve the
declared client-pixel error, the stroke saturates and cannot change selection.

Selection research also marks an important limit. Microsoft's
[Smart Selection](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/P14-1143.pdf)
recovers text intent with learned linguistic signals, but that would silently
let a model widen or reinterpret Matter's explicit address. Matter keeps its
deterministic punctuation-segment grammar and uses geometry only to decide which
measured fragments the person actually enclosed. Layout projection is only a
fail-open broad phase before DOM measurement, never a second authority.

The interaction sequence is supported by the selection/action separation in
[Scriboli](https://www.microsoft.com/en-us/research/publication/design-analysis-delimiters-selection-action-pen-gesture-phrases-scriboli/)
and by the localized action handles studied in
[Handle Flags](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/HandleFlags-GI-2009.pdf).
Matter's narrower bet is: lasso fixes the reference, an Elastic grip fixes only
degree, and a later click in the shaped address confirms the operation. A grip
click without movement is not a submit gesture.

The selected outline follows the same distinction. A precise range is one
reading-order interval, not one decorative capsule per line. Its corner radius
scales within a bounded optical range from measured type, and coordinates are
compared after the same serialization precision used by SVG so subpixel noise
cannot create zero-length steps. Structural whole-node selection retains its
separate line-by-line shape.

Rejected paths:

- smoothing only the painted SVG creates a different visible and semantic path;
- semantic or learned auto-expansion beyond hit punctuation segments violates
  the person's reference authority;
- measuring every node in the DOM is unnecessary work at the 2,000-node bound;
- aggressive visual rounding or per-line cards turns material into decorative
  chrome and obscures where a multi-line range begins and ends.

Falsification includes long winding paths, tail-only hits, saturation, pointer
coalescing, self-intersection, RTL and wrapping, multi-segment whitespace,
positive and negative camera translation, non-unit scale, visual-viewport
offsets, scroll/resize/font epoch drift, and serialized subpixel microsteps.

## Bet 3 — a closed compatible mirror, not a generic proxy

The [Vercel AI SDK custom-provider contract](https://github.com/vercel/ai/blob/main/content/docs/07-reference/01-ai-sdk-core/42-custom-provider.mdx)
supports a registry of named models plus ordered fallback. LangChain's
[provider package structure](https://github.com/langchain-ai/langchainjs/blob/main/AGENTS.md#creating-new-integrations)
reinforces that providers need separate adapters and compatibility tests rather
than one ever-growing "OpenAI-compatible" request object.

Cloudflare's current
[custom-provider documentation](https://developers.cloudflare.com/ai-gateway/configuration/custom-providers/)
adds the useful base-URL distinction: a compatible client owns one base and
appends its known operation path, while arbitrary provider-native paths are a
different, much broader proxy product. Matter adopts the smaller contract:

- the client supplies only one compatible HTTPS address and its opaque key; it
  cannot choose a model, completion path, header set,
  request shape, or response vocabulary;
- the server registry owns a small named serializer/parser matrix and bounded
  model discovery; a catalog name becomes usable only after a real sentinel
  proves the selected wire;
- the authenticated user candidate is request-local and attempted first, while
  the existing managed candidates remain ordered fallback;
- candidate health and derived cache scope are isolated by an opaque credential
  scope, but the existing scenario governor remains global so a new credential
  cannot mint extra concurrency;
- one content-free connection probe requires `MATTER_READY` as the only
  non-whitespace model output,
  uses the production transport bounds, and returns no provider text to the
  browser. This proves the shared non-streaming text-generation capability used
  by all five current scenarios, not quality, billing, or an unreleased gate.

This deliberately rejects the generic-proxy path. The
[OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
warns that full URLs are difficult to validate, redirects bypass validation,
and DNS pinning/rebinding defeats a separate lookup followed by an ordinary
request. Product authorization requires a custom base here, so the accepted
surface is narrower than a URL relay: ASCII HTTPS, default port, DNS hostname,
no credentials/query/fragment. A reviewed complete `/chat/completions` or
`/v1/messages` path is reduced to its server-owned base; every other path stays
a base to which the reviewed registry appends its own operation. Every
request resolves the complete answer set, rejects mixed public/private and
special-use addresses, then gives `node:https` a lookup callback pinned to one
accepted address. The original hostname remains the TLS SNI and certificate
identity; redirects are never followed. DNS is repeated for each new request,
so an address change is revalidated instead of inherited from session state.
Public/special classification follows IANA's current
[IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and
[IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/)
special-purpose registries, with boundary fixtures that preserve neighboring
public space. Matter rejects a registry entry even when IANA marks one
more-specific anycast assignment globally reachable: a provider mirror must use
ordinary public-unicast space, not a special-purpose address. Those registries
are moving policy inputs and require the same release-time re-check as provider
wire documentation.

A mature relay such as
[byok-relay](https://github.com/avikalpg/byok-relay#security)
illustrates the additional DNS, token, storage, revocation, rate, and path
controls required once arbitrary endpoints or persistent accounts are admitted;
its own trust note distinguishes prototype relay use from production handling.
Matter admits no arbitrary method, path, body, model, redirect, or reusable relay
token. Same-origin admission, three concurrent checks, eight checks per window,
the fixed completion body, and existing scenario governors remain independent
bounds.

Compatibility is negotiated once rather than guessed on every material action.
Official bases have one current profile. A custom endpoint receives at most two
parallel model-list reads: bearer-auth OpenAI-compatible and native Anthropic.
Known embedding, moderation, realtime, transcription, audio, image, and rerank
identifiers are excluded; a reviewed inexpensive alias wins, otherwise stable
catalog order and conservative cost markers select one text candidate per wire.
At most two 2.5-second sentinels prove those candidates. Matter does not parse an
arbitrary provider error body, so it does not pretend to know which field was
rejected. All work shares the route deadline and process drain cap; the sealed
lease records only the profile and model that produced the exact sentinel.
Runtime never renegotiates.

The key is posted once to the same-origin server, authenticated-encrypted with a
fresh nonce, and returned only as a fixed 30-day `HttpOnly`, `Secure`,
`SameSite=Strict` cookie. Because a narrow cookie path cannot use the `__Host-`
prefix, Matter follows the
[MDN secure-cookie guidance](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
with a `__Secure-` name and the normalized Matter API path. The UI states the
actual boundary: scripts cannot read the sealed cookie, but the browser stores
it temporarily and selected material is sent to the chosen provider when a
model action runs. Removal expires the bearer and rotates an independent
HttpOnly generation marker. A save binds the generation present when it began
but never writes that marker, so a late save response cannot restore access in
an ordinary browser jar. A browser with no marker uses one write-free initial
generation so concurrent status reads cannot invalidate another tab's accepted
save. Only DELETE writes the random marker. If that marker is later selectively
evicted, stateless code cannot distinguish the jar from its initial state. The
marker has high cookie priority and the bearer low priority, reducing—but not
proving against—selective marker eviction. This does not revoke an
attacker-copied bearer plus matching
generation or survive arbitrary selective cookie eviction; those stronger
promises require shared durable state.

Provider wire behavior is checked against the current
[OpenAI API documentation](https://platform.openai.com/docs/api-reference/chat/create)
and [DeepSeek API documentation](https://api-docs.deepseek.com/api/create-chat-completion/),
not inferred from an "OpenAI-compatible" label. New wire formats require an
explicit registry change and focused fixtures; ordinary model lifecycle changes
are admitted through bounded catalog discovery and the sentinel rather than a
client-visible model setting.
DeepSeek's current [quick start](https://api-docs.deepseek.com/) and
[model-list example](https://api-docs.deepseek.com/api/list-models/) use
`deepseek-flash` and
explicitly identify `deepseek-v4-flash` as an accepted legacy name whose
corresponding model is retired. Some subordinate schema and pricing surfaces
can lag that primary guidance, so the reviewed alias is not treated as a pinned
revision: every release must re-check current primary documentation and a live
wire fixture. The UI keeps the neutral capability label “DeepSeek Flash” rather
than claiming a revision it cannot pin.

The settings icon received the same bounded comparison. The former document
frame was semantically false. A socket/port frame was clear at 24 px but became
another square beside three already outlined symbols at 16 px. A symmetric
two-terminal connector preserved air but read as a stretch/electrical diagram.
The retained single-outline plug (`M9 2v6m6-6v6m3 0v4a6 6 0 0 1-12 0V8h12M12 18v4`)
has the fastest connection reading, one optical centre, and uses the existing
24-unit view box, 1.5 round stroke, and inherited light/dark colour without a
second visual system.

Rejected paths:

- `localStorage`, browser-readable headers, or re-echoing a saved key enlarges
  the script-exfiltration boundary;
- an arbitrary URL, method, path, model, or preflight-followed redirect creates
  an SSRF/open-proxy surface; a separately validated DNS lookup followed by
  global `fetch` still has a DNS-to-connect rebinding race;
- silently trying many OpenAI-compatible bodies at runtime hides incompatibility,
  multiplies cost, and makes a successful connection claim meaningless;
- a process-wide credential registry leaks request ownership across people;
- one governor per credential bypasses deployment backpressure and spend intent;
- adding LangChain or a provider SDK duplicates only a small serializer boundary
  while increasing the client/server supply-chain and runtime proof surface.

Falsification includes malformed and oversized requests, unsupported pairs,
URL normalization and path duplication, credentials/fragments/ports/IP literals,
mixed DNS answers, private and IPv4-mapped IPv6 addresses, connect pinning,
redirects, lookup/socket/body abort, profile-attempt bounds, tampering, expiry,
key rotation, duplicate cookies, base-path normalization, cross-origin
submission, late-save replay after removal in the browser jar, explicit active-
replay limitations, inaccessible form states, coarse-pointer
targets, provider-specific request bodies, pool ordering and fallback, global
load shedding, credential-scoped health/cache/drain identity, and proof that no
key reaches status JSON, material, history, logs, cache keys, or health/drain
keys; status returns only the canonical endpoint plus one opaque non-secret
lease receipt.

## Decision rule

The bet survives only if focused unit and integration tests, independent review,
the complete source and Chromium suites, and a desktop/narrow localhost walk all
agree. A live provider probe can prove connectivity for one explicit credential;
it cannot promote a production gate, certify provider quality, or substitute for
the deployed-origin release profile. Contrary evidence reopens the smallest
affected freeze rather than lowering a bound or expanding authority to make a
test pass.
