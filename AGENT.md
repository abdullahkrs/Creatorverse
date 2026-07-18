# Creatorverse Autonomous Agent Contract

Read this file before every autonomous action.

## Mission

Build a mobile-first creator-community game where creators form fictional digital realms and followers complete short, safe actions that visibly grow those realms.

## North star

Creator creates realm → shares link → follower joins in seconds → chooses role → completes an action in under one minute → realm visibly changes → creator receives a result worth sharing.

Every cycle must improve, validate, secure, or restore this loop.

## Mandatory standards

Before changing visible requirements, code, workflow state, or release state, read `docs/standards/README.md` and every standard mapped to your role. New visible UI must use `src/design-system/tokens.css` before introducing hardcoded visual values.

The repository standards are release gates, not suggestions. Agents must reject or repair work that:

- looks like a generic AI-generated landing page or default component kit;
- relies on excessive explanatory copy, oversized slogans, repetitive cards, generic gradients, glows, decorative geometry, or placeholder icons;
- lacks a clear dominant action and original product identity;
- fails responsive behavior at 320/390/768/1024/1440 widths as applicable;
- treats Arabic RTL as a simple mirrored English layout;
- hides essential behavior behind hover or lacks keyboard, focus, reduced-motion, loading, empty, error, and success states;
- lacks locked installs, real browser evidence, accessibility checks, localization parity, or exact Railway Preview identity where applicable.

A full React/Tailwind migration requires its own focused issue. Libraries are adopted incrementally under `docs/standards/LIBRARY_POLICY.md`.

## Single source of truth

GitHub Issues and labels are the only workflow state.

Only one open issue may carry `auto:active`.

The valid pipeline is:

`stage:ux` → `stage:safety` → `stage:build` → `stage:release`

Agents must not use private scratch files, duplicate status documents, or a second issue to represent the same cycle.

## Workflow ownership

- Creatorverse Continuity Guard alone repairs disabled automations, duplicate active issues, missing or duplicate stage labels, and stale workflow routing.
- Product Lead creates and prioritizes a new issue only when no active cycle exists. It does not perform routine stage repair or race specialist transitions.
- Game & UX moves only `stage:ux` → `stage:safety`.
- Safety Review moves only `stage:safety` → `stage:build` or records a genuine external blocker.
- Engineer moves only `stage:build` → `stage:release` after implementation and required checks.
- QA moves `stage:release` → `stage:build` for reproducible blockers or closes the cycle after merge and production verification.

## Five agents

1. Product Lead: creates one focused issue only when no `auto:active` issue exists; does not modify code or routine stage state.
2. Game & UX Agent: defines flow, professional visual direction, copy budget, responsive behavior, accessibility, Arabic/English parity, RTL/LTR, and all states; does not modify code.
3. Safety & Fairness Reviewer: defines concrete safeguards and blocks only concrete release risks; does not modify product code.
4. Full-Stack Engineer: the only primary code author; creates one branch and one PR for the active issue; does not merge.
5. QA & Release Agent: verifies all functional, safety, deployment, responsive, accessibility, professional visual-quality, browser-artifact, and localization gates; returns actionable failures to `stage:build`, squash-merges passing work, and verifies Railway production.

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
7. Use a committed lockfile and `npm ci`; use `npm install` only while intentionally updating the lockfile.
8. Run `npm run check`, all available unit tests, localization checks, and applicable Playwright/axe tests.
9. Update `TASK_LOG.md` with facts only.
10. Create or update one dedicated branch and one linked PR.
11. Include acceptance evidence, real responsive screenshots, tests, safety notes, Railway Preview expectations, `/health`, `/version`, limitations, and rollback notes.
12. Move the issue from `stage:build` to `stage:release` and stop.

## CI failure protocol

Classify failures as code, test, dependency, transient network, configuration, secret, security, or deployment.

- Fix the cause; never hide the failure.
- Keep repairs on the same branch and PR.
- A transient failure may be retried once without code changes.
- Integration tests must use mocks in CI when secrets are unavailable.
- Never commit a secret, disable a valid check, delete a valid test, weaken branch protection, or use broad `continue-on-error` to force green status.
- Maximum: three focused repair attempts for the same failure. After that, add exact evidence, label `ci:blocked`, and let Product Lead close or split an externally blocked cycle while Continuity Guard preserves correct workflow state.

## QA and release gates

QA may merge only when all applicable checks pass:

- Acceptance criteria.
- Required GitHub CI checks and locked `npm ci` installation.
- No disabled or bypassed checks.
- Professional visual-quality requirements in `docs/standards/DESIGN_SYSTEM.md`.
- Real Playwright screenshots and no unintended horizontal overflow.
- Mobile behavior, touch targets, keyboard accessibility, visible focus, and axe critical/serious results.
- Arabic and English key parity; composed RTL and LTR.
- Loading, empty, success, and error states.
- Reduced-motion behavior when motion exists.
- Safety, privacy, fairness, and secret handling.
- One exact non-Production Railway Preview `/health` returns 200.
- The same Preview `/version` matches the PR branch and commit before and after malformed-path verification.

Before reviewing, QA checks the latest `QA-REVIEWED-HEAD:<sha>` marker. If it equals the current head and there is no newer CI, deployment, or review evidence, QA does nothing and posts no duplicate review.

After squash merge, QA must verify Railway production `/health` and `/version` match the merged commit. Then close the issue, remove workflow labels, and delete the branch when possible.

If production verification fails, no new feature may start. Create or restore a critical production-fix cycle and return to the last known good version when a safe rollback path exists.

## Railway environment roles

- Production is permanently linked to `main`.
- Staging is permanently linked to `main` or a dedicated `staging` branch; do not repoint it to each feature branch.
- Each pull request is verified through its isolated Railway PR Environment.
- Production is never a Preview candidate.

## Priority order

Production outage → security vulnerability → failed deployment → broken core loop → professional usability and visual quality → current milestone → new feature breadth.

## Anti-loop and recovery rules

- One active issue, one user outcome, one branch, one PR, one primary code author.
- Never begin a second feature in the same cycle.
- Never rebuild a working component without a user-facing or proven maintenance benefit.
- Never combine a broad refactor with a product feature.
- Do not reopen decisions already recorded in `DECISIONS.md` unless the underlying facts changed.
- Do not create duplicate task keys.
- If no meaningful progress occurs for 90 minutes, Continuity Guard restores the correct stage from issue, PR, CI, and Railway evidence.
- If a cycle remains unresolvable after six hours or three focused repairs, preserve useful work; Product Lead may close or split it only after Continuity Guard records the correct blocked state.
- Missing external approval, paid account, secret, or permission must not cause hourly retries. Implement a safe fallback or feature-disabled state, record the external blocker, and move to unblocked work.
- Agents do not wait for user approval.

## Definition of complete

A cycle is complete only when:

- The issue is closed.
- The PR is squash-merged.
- CI passed with locked dependencies.
- Railway production is healthy.
- Production `/version` matches the merged commit.
- Arabic and English paths work and localization parity passes.
- Responsive, mobile, keyboard, Playwright, and accessibility checks pass.
- Visible UI meets the professional design and copy standards.
- No concrete security or safety blocker remains.
- `TASK_LOG.md` is updated.
- The feature branch is removed when possible.
- No stale `auto:active` label remains.
