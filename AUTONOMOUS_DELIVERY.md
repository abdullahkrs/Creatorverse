# Creatorverse Autonomous Delivery Runbook

This runbook explains the repository-enforced autonomous pipeline. `AGENT.md` is authoritative when rules conflict.

## Workflow labels

Required labels:

- `auto:active`: the only active autonomous cycle.
- `auto:blocked`: external dependency or permission prevents completion.
- `stage:ux`: waiting for Game & UX handoff.
- `stage:safety`: waiting for Safety & Fairness review.
- `stage:build`: ready for implementation or returned for repair.
- `stage:release`: ready for QA and release.
- `ci:blocked`: three focused CI repair attempts failed.
- `priority:critical`: production or security recovery preempts feature work.
- `type:production-fix`: restores broken production.

Exactly one stage label is allowed on the active issue.

## Normal cycle

1. Product Lead confirms production is healthy and no `auto:active` issue exists.
2. Product Lead creates one issue with `auto:active` and `stage:ux`.
3. Game & UX adds one handoff and changes the stage to `stage:safety`.
4. Safety adds one concrete review and changes the stage to `stage:build`.
5. Engineer creates one branch and PR, runs checks, and changes the stage to `stage:release`.
6. QA verifies CI and Railway Preview.
7. QA squash-merges, verifies production, closes the issue, and clears labels.
8. The next hourly Product Lead run may create the next cycle.

## Issue template

```markdown
# CV-MVP-### — Short task title

## User outcome

## Acceptance criteria
- [ ]

## Non-goals

## Success signal

## Safety and privacy constraints

## Languages and direction
- [ ] English
- [ ] Arabic
- [ ] LTR
- [ ] RTL

## Expected affected areas
```

## CI failure decision tree

1. Read the failed job and exact failing step.
2. Classify: code, test, dependency, network, configuration, secret, security, or deployment.
3. Apply the smallest causal fix on the same branch.
4. Re-run local checks and push to the same PR.
5. Stop after three focused attempts.

Never make a failing required check optional merely to merge.

## Release evidence

Every PR must include:

- Linked active issue and task key.
- Changed behavior and non-goals.
- Acceptance evidence.
- Commands and tests run.
- Arabic/English and RTL/LTR evidence where applicable.
- Safety and privacy notes.
- Railway Preview URL.
- Preview `/health` output.
- Preview `/version` output matching the PR commit.
- Known limitations.
- Rollback method.

## Production incident rule

When production health or version verification fails:

- Stop feature selection.
- Mark the current or new recovery issue `priority:critical`, `type:production-fix`, `auto:active`, and `stage:build`.
- Diagnose build, runtime, variables, healthcheck, or external dependency failures.
- Apply a small hotfix or restore the last known good revision when safe.
- Resume feature work only after production `/health` returns 200 and `/version` identifies the intended stable commit.

## External blockers

Do not retry a missing key, paid account, platform review, or legal permission every hour.

Instead:

- Complete the safe UI, contract, mock, tests, and disabled/error state.
- Add `auto:blocked` only when the selected outcome cannot be safely completed.
- Record the exact missing dependency and how to activate it later.
- Close or split the cycle so unblocked work can continue.

## Recovery timers

- Three hours without meaningful evidence: restore the correct stage.
- Three failed focused repair attempts: mark `ci:blocked` and split or replace the task.
- Six hours unresolved: preserve useful work, close/split the cycle, and choose the highest-value unblocked task.
