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

When handing off, report:

```text
Status:     done / partial / blocked
Scope:      files and system boundary changed
Validation: exact commands run and not run
Risks:      concrete remaining failure modes
Next:       one executable step
```
