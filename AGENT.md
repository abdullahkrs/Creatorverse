# Creatorverse Agent Operating Guide

Read this file before every development cycle.

## Mission

Build a mobile-first creator-community game that turns each creator's audience into a fictional digital realm. Members complete short missions, grow their realm, collaborate with other creator communities, and participate in safe seasonal competition.

## Non-negotiable product boundaries

1. The universe is fictional and must not reproduce real countries, borders, governments, political parties, conflicts, flags, or geopolitical events.
2. All competition remains inside Creatorverse. Never create mechanics that encourage harassment, brigading, mass reporting, misinformation, boycotts, or hostile activity on external platforms.
3. Never make external follower count the primary source of power. Active participation, retention, collaboration, and skill must matter more.
4. Do not sell competitive power. Monetization may include cosmetics, creator tools, sponsorships, and commerce integrations, but not pay-to-win mechanics.
5. Use controlled mission templates. User-created free text requires moderation and must not be necessary for the MVP.
6. Protect minors by default: no private adult-to-minor messaging, precise location, open file sharing, gambling-like rewards, or unrestricted spending.
7. Avoid building a general-purpose social network. Creatorverse complements existing social platforms.

## North star

A creator shares one link, followers join in seconds, complete a meaningful action in under one minute, visibly change the creator's realm, and give the creator a result worth sharing back to social media.

## Current MVP loop

Creator creates realm → follower joins → chooses role → completes short mission → realm gains energy → district unlocks → creator shares result.

Every development cycle must improve or validate this loop. Work outside it requires a written decision in `DECISIONS.md`.

## Required reading order

1. `AGENT.md`
2. `AGENT_ORCHESTRATION.md`
3. `README.md`
4. `ROADMAP.md`
5. `TASK_LOG.md`
6. `DECISIONS.md`
7. `BACKLOG.md`
8. `METRICS.md`
9. `package.json`
10. `.github/workflows/ci.yml`

## Agent activation

`AGENT_ORCHESTRATION.md` is the authoritative specialist-team definition. The Cycle Lead must activate only the agents required for the selected task and record them in the cycle handoff. Specialist agents are working perspectives; they do not independently expand scope or create separate product directions.

Every cycle must include:

- Cycle Lead.
- Product Strategy Agent.
- One implementation owner.
- QA and Release Agent.
- Safety and Trust Agent whenever the task affects users, content, competition, invitations, data, minors, or monetization.

## Development cycle

Run exactly one focused cycle:

1. Inspect the current implementation and recent history.
2. Select one high-value task from the current milestone.
3. Write a one-sentence outcome and explicit acceptance criteria.
4. Activate the minimum specialist agents required by `AGENT_ORCHESTRATION.md`.
5. Record concise product, safety, UX, architecture, data, and QA handoffs where applicable.
6. Implement the smallest complete vertical slice.
7. Test the changed behavior and run the full available check suite.
8. Review mobile usability, accessibility, safety boundaries, fairness, and empty/error states.
9. Update documentation only when facts, scope, or decisions changed.
10. Add a concise entry to `TASK_LOG.md`.
11. Commit once with an intentional conventional commit message.
12. Stop. Do not begin a second improvement cycle.

## Anti-loop rules

- Do not rebuild working components because a different architecture seems cleaner.
- Do not rename or reorganize files without a user-facing or maintenance benefit tied to the selected task.
- Do not add dependencies when the existing stack can reasonably complete the task.
- Do not add speculative systems for future scale.
- Do not repeat work already recorded as complete in `TASK_LOG.md`.
- Do not create more than one new major concept per cycle.
- Do not activate the full agent team for a small task.
- Do not let agents produce conflicting implementations; one implementation owner writes the change.
- If blocked, document the blocker and implement the best unblocked slice instead.

## Core agent roles

The detailed team, phase activation matrix, handoffs, release gates, and final-product completion criteria are maintained in `AGENT_ORCHESTRATION.md`.

The always-relevant core perspectives are:

### Product Strategy Agent

Protects the north star, validates creator and follower value, chooses the smallest meaningful experiment, and rejects feature drift.

### Creator Success Agent

Ensures creators can establish and operate a realm with low effort and receive results worth sharing back to their existing social channels.

### Community Gameplay Agent

Ensures followers join quickly, understand their role, complete meaningful short actions, see their impact, and have fair reasons to return.

### Game Systems and Economy Agent

Designs fair missions, progression, roles, collaboration, seasonal competition, resources, and non-pay-to-win monetization boundaries.

### Safety and Trust Agent

Checks fictional-world separation, moderation, anti-brigading controls, minors' safety, privacy, abuse paths, and legal-risk flags. This role can block release.

### UX, Accessibility, and Viral Loop Agent

Optimizes mobile onboarding, time-to-first-action, visible contribution, RTL readiness, creator share cards, challenge links, and return triggers without deceptive dark patterns.

### Implementation Owner

The activated Frontend, Backend, Full-Stack, Platform, or DevOps engineer responsible for producing the single coherent code change for the cycle.

### QA and Release Agent

Tests acceptance criteria, regression risks, accessibility basics, mobile widths, permissions, failure states, and release gates. This role can block release.

### Cycle Lead

Synthesizes the activated agents, chooses one task, resolves conflicts in favor of safety and the north star, updates `TASK_LOG.md`, and stops after the cycle.

## Definition of done

A task is done only when:

- Acceptance criteria are met.
- `npm run check` passes.
- The changed path works at mobile width.
- Interactive controls are keyboard reachable and have understandable labels.
- Empty, loading, and error states are considered where relevant.
- Applicable value, loop, safety, fairness, quality, measurement, and operations gates in `AGENT_ORCHESTRATION.md` pass.
- No real-world political or off-platform hostile mechanic is introduced.
- Documentation reflects material changes.

## Architecture direction

The current repository is a lightweight Vite prototype. Keep mock data local until the first interaction loop is validated. Do not add authentication, a database, real social-platform APIs, payments, real-time multiplayer, or generative AI until a roadmap milestone explicitly requires them.

## Decision priority

Safety and legality → creator and follower trust → core-loop value → fairness → measurable learning → simplicity → revenue → visual polish → technical elegance.