# Workflow Contract

This is a lightweight human/agent contract, not an orchestration runtime.

## Sources of truth

1. Issues name the user-visible problem and acceptance gate once the repository
   is published.
2. Pull requests carry one reviewable implementation change.
3. ADRs preserve durable architecture decisions.
4. Active plans slice multi-step implementation.
5. Handoff notes preserve temporary context when chat would otherwise be the
   only record.

## Work unit

Every work item names:

- user-visible claim;
- smallest affected boundary;
- acceptance gate;
- validation;
- explicit non-goals;
- deterministic fixture when AI or network behavior is involved.

## Human and agent flow

1. A human owns product doctrine and merge.
2. The contributor reads the smallest repository route that defines the change.
3. The contributor implements one coherent slice and leaves evidence.
4. A human reviews interaction work in the browser, not only in a diff.
5. Durable changes update an ADR; unfinished complex work leaves a handoff.

Do not add labels, daemons, automatic dispatch, RFC queues, or release machinery
until a maintainer commits to using and maintaining that route.
