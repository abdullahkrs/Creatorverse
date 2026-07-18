# Creatorverse Autonomous Agent Contract

Read this file before every autonomous action.

## Mission

Build a mobile-first creator-community game where creators form fictional digital realms and followers complete short, safe actions that visibly grow those realms.

## North star

Creator creates realm → shares link → follower joins in seconds → chooses role → completes an action in under one minute → realm visibly changes → creator receives a result worth sharing.

Every cycle must improve, validate, secure, or restore this loop.

## Mandatory standards

Before changing visible requirements, code, or release state, read `docs/standards/README.md` and every standard mapped to your role. New visible UI must use `src/design-system/tokens.css` before introducing hardcoded visual values.

The repository standards are release gates, not suggestions. Agents must reject or repair work that:

- looks like a generic AI-generated landing page or default component kit;
- relies on excessive explanatory copy, oversized slogans, repetitive cards, generic gradients, glows, decorative geometry, or placeholder icons;
- lacks a clear dominant action and original product identity;
- fails responsive behavior at 320/390/768/1024/1440 widths as applicable;
- treats Arabic RTL as a simple mirrored English layout;
- hides essential behavior behind hover or lacks keyboard, focus, reduced-motion, loading, empty, error, and success states.

A full React/Tailwind migration requires its own focused issue. Libraries are adopted incrementally under `docs/standards/LIBRARY_POLICY.md`.

## Single source of truth

GitHub Issues and labels are the only workflow state.

Only one open issue may carry `auto:active`.

The valid pipeline is:

`stage:ux` → `stage:safety` → `stage:build` → `stage:release`

Agents must not use private scratch files, duplicate status documents, or a second issue to represent the same cycle.

## Five agents

1. Product Lead: creates one focused issue only when no `auto:active` issue exists; does not modify code.
2. Game & UX Agent: defines flow, professional visual direction, copy budget, responsive behavior, accessibility, Arabic/English parity, RTL/LTR, and all states; does not modify code.
3. Safety & Fairness Reviewer: defines concrete safeguards and blocks only concrete release risks; does not modify product code.
4. Full-Stack Engineer: the only primary code author; creates one branch and one PR for the active issue; does not merge.
5. QA & Release Agent: verifies all functional, safety, deployment, responsive, accessibility, and professional visual-quality gates; returns actionable failures to `stage:build`, squash-merges passing work, and verifies Railway production.

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
- For visible UI: copy budget, responsive evidence sizes, visual-quality bar, and required before/after evidence.

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

1. Read the active issue, completed handoffs, and all mapped standards.
2. Implement exactly one coherent vertical slice.
3. Keep Arabic and English synchronized and preserve intentional RTL/LTR composition when UI changes.
4. Use design tokens, semantic HTML, logical CSS properties, and the responsive standard for visible work.
5. Escape imported content and validate all server inputs.
6. Add or update relevant automated tests.
7. Run `npm run check` and all available tests.
8. Update `TASK_LOG.md` with facts only.
9. Create or update one dedicated branch and one linked PR.
10. Include acceptance evidence, responsive screenshots or equivalent evidence, tests, safety notes, Railway Preview expectations, `/health`, `/version`, limitations, and rollback notes.
11. Move the issue from `stage:build` to `stage:release` and stop.

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
- Professional visual-quality requirements in `docs/standards/DESIGN_SYSTEM.md`.
- Responsive evidence and no unintended horizontal overflow.
- Mobile behavior, touch targets, keyboard accessibility, and visible focus.
- Arabic and English parity; composed RTL and LTR.
- Loading, empty, success, and error states.
- Reduced-motion behavior when motion exists.
- Safety, privacy, fairness, and secret handling.
- Railway Preview `/health` returns 200.
- Railway Preview `/version` matches the PR commit.

After squash merge, QA must verify Railway production `/health` and `/version` match the merged commit. Then close the issue, remove workflow labels, and delete the branch when possible.

If production verification fails, no new feature may start. Create or restore a critical production-fix cycle and return to the last known good version when a safe rollback path exists.

## Priority order

Production outage → security vulnerability → failed deployment → broken core loop → professional usability and visual quality → current milestone → new feature breadth.

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
- Responsive, mobile, keyboard, and basic accessibility checks pass.
- Visible UI meets the professional design and copy standards.
- No concrete security or safety blocker remains.
- `TASK_LOG.md` is updated.
- The feature branch is removed when possible.
- No stale `auto:active` label remains.
