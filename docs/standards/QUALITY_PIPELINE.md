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

## Post-merge release identity

- Every `main` SHA must receive the stable `railway-production-identity` status from the trusted default-branch workflow.
- A pass requires exact Production SHA identity plus healthy, distinct Staging; deployment status alone is insufficient.
- The canonical `[Ledger] Railway release identity evidence` issue contains one idempotent marker comment per SHA with integrity-checked JSON.
- QA may use that repository-native marker when direct Railway DNS or workflow-run listing is unavailable.
- The evidence contract, retry bounds, freshness window, and safety model are defined in `docs/railway-release-identity.md`.
- This evidence is an operational deployment signal only and must not be presented as user or market validation.

## Workflow ownership

- Continuity Guard alone repairs automations, duplicate active issues, and stage-label inconsistencies.
- Product Lead creates and prioritizes a new cycle only when no active cycle exists; it does not race routine stage transitions.
- Specialist agents move only their documented stage transition.
- QA records `QA-REVIEWED-HEAD:<sha>` and must not repeat an unchanged-head review without new evidence.

## Artifacts

Playwright HTML reports, traces, failure video, screenshots, and accessibility evidence are retained for 14 days. Artifacts must not contain secrets, private content, social credentials, or personal contact data.
