# Canvas foreground experiment

Status: superseded. This is a recovery index, not a current implementation
guide.

The experiment copied the ambient tree media through a Canvas foreground pass
so its texture could cross quiet corner chrome. It proved the intended visual
layering and supplied the light and dark composition calibration, but it also
introduced a second media lifecycle and made the browser compositor semantics
part of application code.

The complete runnable state is preserved on
`codex/archive-canvas-foreground-20260824`:

- `adfe781` captures the complete experimental worktree;
- `d9ffdf3` adds the final responsive and interaction receipts.

The replacement on `codex/native-ambient-foreground` keeps one browser-native
media source at a time, keeps the wash below the document, and lets only that
media cross quiet chrome. It reuses the Canvas experiment's measured
composition semantics without retaining its copy loop.

To inspect or recover the experiment, use the archived branch or either commit.
Do not copy this directory into current source and do not treat it as active
architecture. Current behavior and constraints are documented under `docs/`.
