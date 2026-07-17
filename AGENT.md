# Creatorverse Agent Operating Guide

Read this file before every development cycle.

## Mission

Build a mobile-first creator-community game that turns each creator's audience into a fictional digital realm. Members complete short missions, grow their realm, collaborate with other creator communities, and participate in safe seasonal competition.

## Non-negotiable boundaries

1. The universe is fictional and must not reproduce real countries, borders, governments, political parties, conflicts, flags, or geopolitical events.
2. All competition remains inside Creatorverse. Never create mechanics that encourage harassment, brigading, mass reporting, misinformation, boycotts, or hostile activity on external platforms.
3. External follower count is never the primary source of power. Active participation, retention, collaboration, and skill matter more.
4. Never sell competitive power. Monetization may include cosmetics, creator tools, sponsorships, and commerce integrations, but not pay-to-win.
5. Protect minors by default. No private adult-to-minor messaging, precise location, open file sharing, gambling-like rewards, or unrestricted spending.
6. Avoid building a general-purpose social network. Creatorverse complements existing platforms.
7. Social integrations must use official APIs, public oEmbed data, or explicit creator authorization. Never request social-media passwords or scrape private data.

## North star

A creator shares one link, followers join in seconds, complete a meaningful action in under one minute, visibly change the creator's realm, and give the creator a result worth sharing back to social media.

## Current core loop

Creator creates realm → follower joins → chooses role → completes short mission → realm gains energy → district unlocks → creator shares result.

Every development cycle must improve, complete, measure, or validate this loop.

## Five-agent team

Only these five agents are used in normal development:

### 1. Product Lead

Owns scope, priority, creator value, follower value, success metric, and conflict resolution. Rejects feature drift and decides the single task for the cycle.

### 2. Game and UX Agent

Owns gameplay rules, creator workflow, follower workflow, mobile UX, accessibility, RTL/LTR behavior, progression, fairness-by-design, and sharing loops.

### 3. Safety and Fairness Reviewer

Owns fictional-world separation, privacy, minors, content safety, anti-abuse, integration permissions, political-risk review, and no-pay-to-win review. May block release only for a concrete safety, legal-risk, privacy, or fairness failure.

### 4. Full-Stack Engineer

The only agent allowed to change application code in a cycle. Implements the approved vertical slice, keeps architecture simple, and adds secure validation and failure handling.

### 5. QA and Release Agent

Owns acceptance tests, regression checks, mobile and browser review, accessibility basics, security-critical paths, Railway deployment verification, and the release decision.

## Required reading order

1. `AGENT.md`
2. `README.md`
3. `ROADMAP.md`
4. `TASK_LOG.md`
5. `DECISIONS.md`
6. `BACKLOG.md`
7. `METRICS.md`
8. `RAILWAY_AGENT_WORKFLOW.md`
9. `package.json`
10. `.github/workflows/ci.yml`

## One-cycle workflow

Run exactly one focused cycle:

1. Product Lead inspects current implementation and selects one unfinished high-value task.
2. Product Lead writes one user outcome, one success metric, and explicit acceptance criteria.
3. Game and UX Agent provides at most five concise requirements.
4. Safety and Fairness Reviewer provides at most five risks or controls. It says `PASS`, `PASS WITH CONTROLS`, or `BLOCK`.
5. Full-Stack Engineer implements the smallest complete vertical slice. No other agent writes competing code.
6. QA and Release Agent runs available checks and records evidence.
7. Update `TASK_LOG.md` and any document whose facts changed.
8. Create or update one Pull Request using `.github/pull_request_template.md`.
9. Wait for GitHub CI and Railway Preview. Add the Preview URL and `/version` result to the PR.
10. Stop. Do not merge, begin another task, or modify production.

## Branch and Pull Request rules

- Branch name: `feat/<short-task>`, `fix/<short-task>`, or `chore/<short-task>`.
- One branch and one Pull Request per cycle.
- Pull Requests target `staging` when that branch exists; otherwise target `main` during prototype setup.
- Never push development work directly to `main`.
- Never merge automatically unless the repository owner explicitly requests it.
- Railway Preview is required for user-visible changes.

## Anti-loop rules

- Do not rebuild working components because another architecture looks cleaner.
- Do not rename or reorganize files without a direct benefit to the selected task.
- Do not add speculative infrastructure.
- Do not repeat completed work recorded in `TASK_LOG.md`.
- Do not introduce more than one major concept per cycle.
- Do not activate extra agents for a small task.
- Do not create long design documents for a small implementation.
- If blocked, document the blocker and implement the best unblocked slice only when it still satisfies the cycle outcome.

## Definition of done

A cycle is done only when:

- Acceptance criteria are met.
- `npm run check` passes.
- The changed path works at a mobile width.
- Interactive controls are keyboard reachable and understandable.
- Empty, loading, success, and error states are considered where relevant.
- User-provided text is safely rendered.
- Applicable ownership and permission checks are enforced server-side.
- No real-world political or off-platform hostile mechanic is introduced.
- Railway Preview is healthy for user-visible changes.
- The PR contains test evidence, known risks, Preview URL, and exact next task.

## Architecture direction

The current application is a lightweight Vite and Node prototype deployed as one Railway service. Keep the design simple until the core loop is validated. Add PostgreSQL, authentication, persistence, OAuth integrations, and separate services as focused milestones rather than one large migration.

## Decision priority

Safety and legality → creator and follower trust → core-loop value → fairness → measurable learning → simplicity → revenue → visual polish → technical elegance.
