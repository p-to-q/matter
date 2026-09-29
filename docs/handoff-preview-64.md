# Handoff — Preview.64: nothing a person does is silently lost; Wiki becomes addressable

This is the maintainer handoff for the campaign merged through
[p-to-q/matter#124](https://github.com/p-to-q/matter/pull/124) (branch
`claude/material-trust`, base `c6027c8` = Preview.63). It records what changed,
why, how the work was run, and what is still open, so the next person can pick
up without the conversation that produced it. The contract documents remain the
authority; this note is the map into them.

```text
Status:     done in source; PR open; merge → Production once CI is green
Scope:      admission, turns, keyboard/Escape, persistence/history, Wiki,
            server robustness, runtime budget, contract documents
Validation: npm run check (3,735 unit tests, qualify:wiki 9/9, architecture
            677 files no leak/cycle, docs, build, runtime budget 385.6/396 KiB
            gzip); npm run test:e2e 240 passed; CI e2e 237 passed
Risks:      see "Open items and risks" below
Next:       grant the workflow scope and push `ci-timeout-pending`, then merge
```

## Why this campaign existed

A nine-part audit of `c6027c8` found the product's promise broken in three
places: a person's action could be silently lost (spoken words, a submitted AI
request, unsaved material, a typed direction), AI rarely reached people in
production, and the repository was growing heavier rather than more precise.
The campaign fixed the first completely, prepared the second where it is under
our control, and trimmed the third. Research came first (bounded undo, local
durability, exit motion, IME/Escape/pen input, implicit feedback — Vim, Emacs,
VS Code, ProseMirror, tldraw, Excalidraw, Replicache, LatinIME, Rime, Gboard),
then a frozen plan in `plans/active-tree-material.md`.

## Owner decisions (2026-09-29/30) that reopened earlier freezes

1. Wiki may disclose an applied change: one restrained heard→canonical settle
   and a quiet mark while unsettled; the person may take over at the word.
2. Informed implicit acceptance is approval (dwell, continued use, copy/export,
   leaving the page, no correction) — but only after the change was
   perceivable; each occurrence settles once; it retains a rule and never
   activates or confirms one; Wiki never observes Material Undo.
3. Undo is bounded: 1,000 steps / 32 MiB; Archive is long-term recovery.
4. Transient surfaces leave crisply, never in one frame.
5. Point & Talk's field leaves only for five named, visible reasons (below).
6. Verifiers run on Sonnet to save tokens; builders on the main model.

Each is recorded as a dated entry in [`changes.md`](changes.md) naming what it
supersedes.

## What changed, by slice

| Slice | Merge | What a person gets |
| --- | --- | --- |
| T6 server | `bb214b8` | transcription refuses a closed purpose before reading audio; `RATE_LIMITED`; one stop-reason classifier; SHA-256 label cache with adjudicated hits; one abort boundary; declared rejection codes in receipts |
| T5 AI turns | `db65d37` | late results keep a still-applicable redo future; visibility gates delivery, not draft identity; failed/parked Elastic and Point & Talk results are perceivable with Discard; a Wiki spelling never costs a valid answer |
| T1 keyboard & chrome | `e55477c` | IME-safe Enter/Escape (`isComposing \|\| keyCode 229`); one Escape stack; Ask Matter keeps a pending question across close/reopen/breakpoints; pen-active palm rejection; complete five-locale copy; hover gated to hover devices |
| W1 Wiki evidence | `f781cb7` | V7 quarter-unit evidence, comparable-opportunity aging, bounded admission queue, partial batches, producer precedence, pure occurrence-outcome policy |
| T2 voice & presence | `75cc8b5` | words are never dropped (retry re-anchors; any failed commit holds words for Place/Discard); a slow local worker never costs a recording; one presence primitive (no one-frame flash) |
| D0 docs | `5e19a78` | plan 4,397→803 lines, release record 2,344→285; history archived verbatim; surfaces made true |
| T3/T4 persistence | `00fc30a` | undo bounded and stored per step (IndexedDB v6), recovery ≈9 ms instead of ≈9 s; a quiet truthful footer line; cross-tab generation broadcast; another tab's copy replaces this one only when every turn/draft/editor is idle, via two-step adoption |
| integration | `16b3be0` | browser-proven fixes found by the first full e2e run |
| W5 script routing | `7e4b247` | Latin names inside Chinese/Japanese speech reach the qualified Latin fitting producer; full-width URLs/paths/code are never rewritten |
| W2–W4 addressable Wiki | `a792d33` | each applied word is attributed, disclosed once, marked while unsettled, reachable by pointer and keyboard (Keep / heard form / Wiki…), and settled exactly once |
| round-1 fixes | `bc49b9b`, `cd07573`, `3aca868` | one authorship fact for exit guards; one retention policy; Wiki evidence split into owners; outcome-line queue; paper Escape tier; person's dismissal fades |
| D1 docs | `af0fe7a` | contract documents match the code; binding reference notes named |
| B runtime budget | `dd1ccff` | back under the unchanged budget by lazy boundaries; gesture chunks preloaded so no gesture waits on a fetch |
| round-2 fixes | `02a468e`, `e435c2e` | corrupt Replace under quota; engine chunk retry; takeover focus; held words survive Replace and bfcache; failed chunks retry while Wiki withholds |
| P Point & Talk | `ca4ff42` | the field grows from the AI mark, dwells ≥800 ms, stays pending in place, fades with its result; five close reasons only; bfcache suspends submitted turns |
| inquiry bfcache | `4fc1547` | a bfcache hide suspends Ask Matter's pending question |
| release | `3834f60`, `d43871e` | version `0.2.0-preview.64`; Wiki highlight paint moved out of `globals.css` (it produced 1,415 dev-parser warnings per CI run) |

Point & Talk's five close reasons: the person's close (200 ms fade), the
result (240 ms fade with the text change), another surface taking the slot
(120 ms fade), the target changing (200 ms fade + "段落已变化" line), and a
modal or hidden page (0 ms, the only cut). They are one typed enumeration in
`components/point-talk-close.ts`; a source-scanning test fails on any other
close path.

## How the work was run

- **Workflow:** research → freeze (five-line contract per slice in the plan) →
  build → independent verifier → revise, per [`workflow.md`](workflow.md).
  Builders worked in isolated git worktrees under `.claude/worktrees/`
  (ignored by lint, docs check, and TypeScript); the integrator merged each
  slice with `--no-ff` and checked whole-repo impact (tests, bundle,
  architecture, e2e) at every merge.
- **Verification:** every slice had its own verifier; then three whole-diff
  rounds — architecture/ownership, robustness/edge cases/performance, and
  documentation truth plus browser UX. Every round found real defects; all
  were fixed at the root, never by weakening a gate, assertion, or budget.
- **Full e2e** ran on the integrated head four times (7 → 3 → 0 failures;
  only one failure was a genuine merge regression, the rest were journeys
  never exercised in a browser before).
- **Doc ledger:** every slice's doc consequences were collected in one ledger
  and resolved by D1 against the code, so no doc change was lost between slices.

## Where to look

- Contract: [`product.md`](product.md), [`principles.md`](principles.md),
  [`material.md`](material.md), [`architecture.md`](architecture.md),
  [`protocol.md`](protocol.md), [`surfaces.md`](surfaces.md).
- Decisions: [`changes.md`](changes.md) entries dated 2026-09-29/30.
- Binding mechanics: [`reference/index.md`](reference/index.md) marks the
  notes that hold delegated rules (Wiki, history and undo, virtual file system,
  voice input, inquiry record, working context, prompt harness, runtime cache
  and delivery, ambient workbench UI).
- Receipts: [`release-readiness.md`](release-readiness.md) (Preview.64 section).

## Open items and risks

- **CI job ceiling.** The serial e2e matrix runs ≈11.5 min on the hosted runner;
  with the other steps the job exceeds the 15-minute `timeout-minutes`. The fix
  (25 minutes, commit on local branch `ci-timeout-pending`) needs a GitHub token
  with the `workflow` scope: `gh auth refresh -h github.com -s workflow`, then
  cherry-pick and push.
- **Production AI** still reads `unavailable` until issue #104 installs the
  provider-session key ring; no tag or GitHub prerelease is created for
  Preview.64 until #104 and the strict pool probe (#52) pass.
- **Not device-proven:** real iPhone/iPad Safari voice, pinch, palm rejection,
  and IME; bfcache behavior is proven with synthetic page-transition events.
- **Calibration:** Wiki weights (+4/+8, cap 24, 1.5 s perception, 60 s dwell)
  are documented starting points, not calibrated on real error data.
- **Single-stylus assumption** in palm arbitration (a hovering pen settles all
  pen contacts).
- **Deferred by the owner:** Ask Matter record reader surface, issue/branch
  housekeeping, nested-radius canvas audit, `RootedMaterial` decomposition and
  pan/fold render cost, managed provider promotion, related-vs-unrelated voice
  routing for Point & Talk, multi-word Wiki names, pronunciation producers.
- **Next campaign candidates:** the model pool's host-diverse ordering and
  hedging for the hkg1 stalls (#52), spend controls (#34), the
  `RootedMaterial` split, and the owner-deferred items above.
