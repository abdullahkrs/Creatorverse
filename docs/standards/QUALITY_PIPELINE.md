# Creatorverse Quality Pipeline

This file defines the mandatory repository quality gates.

## Dependency reproducibility

- Commit `package-lock.json`.
- CI and release agents use `npm ci`; `npm install` is allowed only when intentionally updating the lockfile.
- Dependency changes must be visible in both `package.json` and `package-lock.json`.
- Browser binaries are installed explicitly in CI and are not committed.

## Browser evidence

Every visible PR runs Chromium against the exact Railway PR Environment and uploads artifacts for:

- 320×568 and 390×844 phone layouts.
- 768×1024 tablet portrait.
- 1024×768 tablet landscape or small desktop.
- 1440×900 desktop.
- English LTR and Arabic RTL.

The browser gate checks horizontal overflow, visible primary actions, minimum 44 px targets, keyboard completion, direction, reduced motion, and the changed core path. Source diagrams may supplement evidence but never replace real screenshots.

## Accessibility

`@axe-core/playwright` blocks critical and serious WCAG A/AA violations. Manual keyboard, focus order, live-region, copy clarity, and RTL checks remain required because automated tools are incomplete.

## Localization

- New feature copy uses stable keys in a dedicated localization module.
- Arabic and English key sets must match exactly.
- New visible strings inside feature view modules are rejected when they bypass the localization module.
- URLs, handles, numbers, and mixed-direction result text use bidirectional isolation.

## Railway environments

- Production deploys `main` only.
- Staging deploys `main` or a permanent `staging` branch; it is never manually repointed to each feature.
- Pull requests use isolated Railway PR Environments.
- Production is never accepted as Preview.
- One exact candidate must pass `/health`, `/version`, branch, commit, non-Production identity, malformed-path safety, and post-request liveness. Verification must not switch candidates between steps.

## Workflow ownership

- Continuity Guard alone repairs automations, duplicate active issues, and stage-label inconsistencies.
- Product Lead creates and prioritizes a new cycle only when no active cycle exists; it does not race routine stage transitions.
- Specialist agents move only their documented stage transition.
- QA records `QA-REVIEWED-HEAD:<sha>` and must not repeat an unchanged-head review without new evidence.

## Artifacts

Playwright HTML reports, traces, failure video, screenshots, and accessibility evidence are retained for 14 days. Artifacts must not contain secrets, private content, social credentials, or personal contact data.
