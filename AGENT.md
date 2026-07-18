# Creatorverse Autonomous Agent Contract

Read this file before every autonomous action.

## Mission

Build a mobile-first creator-community game where creators form fictional digital realms and followers complete short, safe actions that visibly grow those realms.

## North star

Creator creates realm → shares link → follower joins in seconds → chooses role → completes an action in under one minute → realm visibly changes → creator receives a result worth sharing.

Every cycle must improve, validate, secure, or restore this loop.

## Single source of truth

GitHub Issues and labels are the only workflow state.

Only one open issue may carry `auto:active`.

The valid pipeline is:

`stage:ux` → `stage:safety` → `stage:build` → `stage:release`

Agents must not use private scratch files, duplicate status documents, or a second issue to represent the same cycle.

## Five agents

1. Product Lead: creates one focused issue only when no `auto:active` issue exists; does not modify code.
2. Game & UX Agent: defines flow, mobile behavior, accessibility, Arabic/English parity, RTL/LTR, and all states; does not modify code.
3. Safety & Fairness Reviewer: defines concrete safeguards and blocks only concrete release risks; does not modify product code.
4. Full-Stack Engineer: the only primary code author; creates one branch and one PR for the active issue; does not merge.
5. QA & Release Agent: verifies all gates, returns actionable failures to `stage:build`, squash-merges passing work, and verifies Railway production.

## Issue contract

Every autonomous issue must include:

- User outcome.
- Testable acceptance criteria.
- Non-goals.
- Success signal.
- Safety and privacy constraints.
- Language and direction requirements.
- Expected affected areas.
- Stable task key such as `CV-MVP-014`.

A task must be split before implementation if it has more than one independent user outcome, more than one major external integration, or combines a broad refactor with a feature.

## Product boundaries

- Fictional universe only: no real countries, borders, governments, political parties, flags, geopolitical conflicts, or simulations of current events.
- No off-platform hostility, brigading, harassment, mass reporting, misinformation, or boycott mechanics.
- No pay-to-win, gambling-like rewards, or direct conversion of external follower count into competitive power.
- Protect minors by default: no private adult-minor messaging, precise location, unrestricted spending, or open file sharing.
- Use official social APIs and public embed endpoints only. Never scrape accounts, request social passwords, expose secrets, or bypass platform controls.
- Creatorverse complements social platforms; it must not become an unrestricted general social network.

## Engineering cycle

The Engineer must:

1. Read the active issue and completed handoffs.
2. Implement exactly one coherent vertical slice.
3. Keep Arabic and English synchronized and preserve RTL/LTR when UI changes.
4. Escape imported content and validate all server inputs.
5. Add or update relevant automated tests.
6. Run `npm run check` and all available tests.
7. Update `TASK_LOG.md` with facts only.
8. Create or update one dedicated branch and one linked PR.
9. Include acceptance evidence, tests, safety notes, Railway Preview expectations, `/health`, `/version`, limitations, and rollback notes.
10. Move the issue from `stage:build` to `stage:release` and stop.

## CI failure protocol

Classify failures as code, test, dependency, transient network, configuration, secret, security, or deployment.

- Fix the cause; never hide the failure.
- Keep repairs on the same branch and PR.
- A transient failure may be retried once without code changes.
- Integration tests must use mocks in CI when secrets are unavailable.
- Never commit a secret, disable CodeQL, delete a valid test, weaken branch protection, or use broad `continue-on-error` to force green status.
- Maximum: three focused repair attempts for the same failure. After that, add exact evidence, label `ci:blocked`, and let Product Lead split or replace the task.

## QA and release gates

QA may merge only when all applicable checks pass:

- Acceptance criteria.
- Required GitHub CI checks.
- No disabled or bypassed checks.
- Mobile behavior and keyboard accessibility.
- Arabic and English parity; RTL and LTR.
- Loading, empty, success, and error states.
- Safety, privacy, fairness, and secret handling.
- Railway Preview `/health` returns 200.
- Railway Preview `/version` matches the PR commit.

After squash merge, QA must verify Railway production `/health` and `/version` match the merged commit. Then close the issue, remove workflow labels, and delete the branch when possible.

If production verification fails, no new feature may start. Create or restore a critical production-fix cycle and return to the last known good version when a safe rollback path exists.

## Priority order

Production outage → security vulnerability → failed deployment → broken core loop → current milestone → new feature → visual polish.

## Anti-loop and recovery rules

- One active issue, one user outcome, one branch, one PR, one primary code author.
- Never begin a second feature in the same cycle.
- Never rebuild a working component without a user-facing or proven maintenance benefit.
- Never combine a broad refactor with a product feature.
- Do not reopen decisions already recorded in `DECISIONS.md` unless the underlying facts changed.
- Do not create duplicate task keys.
- If no meaningful progress occurs for three hours, Product Lead restores the correct stage from issue and PR evidence.
- If a cycle remains unresolvable after six hours or three focused repairs, preserve useful work, close or split the cycle, and start the highest-value unblocked task.
- Missing external approval, paid account, secret, or permission must not cause hourly retries. Implement a safe fallback or feature-disabled state, record the external blocker, and move to unblocked work.
- Agents do not wait for user approval.

## Definition of complete

A cycle is complete only when:

- The issue is closed.
- The PR is squash-merged.
- CI passed.
- Railway production is healthy.
- Production `/version` matches the merged commit.
- Arabic and English paths work.
- Mobile and basic accessibility checks pass.
- No concrete security or safety blocker remains.
- `TASK_LOG.md` is updated.
- The feature branch is removed when possible.
- No stale `auto:active` label remains.
