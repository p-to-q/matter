# Workflow

Work proceeds as one reviewable slice, not as a document or agent hierarchy.

1. **Researcher** resolves only unknowns that can change the slice.
2. **Freezer** records outcome, boundary, invariants, proof, and non-goals in the
   active plan or pull request.
3. **Builder** implements only that contract and leaves exact validation output.
4. **Verifier** reads the contract and diff independently, reruns or inspects the
   evidence, and reports: pass, revise with named gaps, or reopen with contrary
   evidence.

The verifier must be a separate review pass; it may be another contributor,
agent, or a deliberately fresh pass by the same contributor. It checks behavior
and scope, not style preference. A failed verification returns to the same slice
instead of creating a new phase or a parallel implementation.

## Review questions

Research, building, enhancement, and independent review use the same questions:

1. What uncertainty could change this slice, what primary documentation or
   source resolves it, and what existing research remains sufficient?
2. Which bounds, malformed inputs, late results, cancellation, recovery and
   relevant multi-tab or multi-instance cases can contradict the outcome?
3. Which owner holds each fact, what are its allowed dependencies, and does the
   change conflict with surrounding behavior or another active edit lane?
4. Can the next change extend this owner without duplicating facts, mixing
   lifecycles, widening capabilities, or introducing a second material model?
5. Which established building block or product informs the choice, what is
   borrowed or rejected, and what evidence would reopen the decision? Cite
   primary sources where needed; do not repeat broad research for routine work
   or copy outside code into the wholly owned repository.
6. Is the result precise and coherent to use as well as correct in code? For
   visible interaction, inspect the real page and record visual acceptance
   separately from test success.

For each relevant question, leave evidence, a named gap, or a reason it does
not apply. More agents, sources, tests or abstractions do not by themselves
answer a question. A verifier reports concrete counterexamples and scope;
an enhancer implements an accepted correction under the same frozen slice.
No reviewer promotes a model, migration, paid surface or release by implication.

When handing off, report:

```text
Status:     done / partial / blocked
Scope:      files and system boundary changed
Validation: exact commands run and not run
Risks:      concrete remaining failure modes
Next:       one executable step
```
