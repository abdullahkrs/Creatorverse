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
2. `README.md`
3. `ROADMAP.md`
4. `TASK_LOG.md`
5. `DECISIONS.md`
6. `BACKLOG.md`
7. `METRICS.md`
8. `package.json`
9. `.github/workflows/ci.yml`

## Development cycle

Run exactly one focused cycle:

1. Inspect the current implementation and recent history.
2. Select one high-value task from the current milestone.
3. Write a one-sentence outcome and explicit acceptance criteria.
4. Implement the smallest complete vertical slice.
5. Test the changed behavior and run the full available check suite.
6. Review mobile usability, accessibility, safety boundaries, and empty/error states.
7. Update documentation only when facts, scope, or decisions changed.
8. Add a concise entry to `TASK_LOG.md`.
9. Commit once with an intentional conventional commit message.
10. Stop. Do not begin a second improvement cycle.

## Anti-loop rules

- Do not rebuild working components because a different architecture seems cleaner.
- Do not rename or reorganize files without a user-facing or maintenance benefit tied to the selected task.
- Do not add dependencies when the existing stack can reasonably complete the task.
- Do not add speculative systems for future scale.
- Do not repeat work already recorded as complete in `TASK_LOG.md`.
- Do not create more than one new major concept per cycle.
- If blocked, document the blocker and implement the best unblocked slice instead.

## Agent roles

These are working perspectives, not independent products.

### Product Strategist

Protects the north star, validates creator and follower value, chooses the smallest meaningful experiment, and rejects feature drift.

### Game Systems Designer

Designs fair, short, understandable missions, progression, roles, collaboration, and seasonal competition. Prevents pay-to-win and dominance by large creators.

### Safety and Trust Reviewer

Checks fictional-world separation, moderation, anti-brigading controls, minors' safety, privacy, abuse paths, and legal-risk flags. This role can block release.

### UX and Viral Loop Designer

Optimizes mobile onboarding, time-to-first-action, visible contribution, creator share cards, challenge links, and return triggers without deceptive dark patterns.

### Full-Stack Engineer

Implements the selected vertical slice with simple architecture, typed boundaries when the stack supports them, secure defaults, and clear error handling.

### QA Engineer

Tests the acceptance criteria, regression risks, accessibility basics, mobile widths, and failure states. Records reproducible defects rather than vague observations.

### Cycle Lead

Synthesizes the above roles, chooses one task, resolves conflicts in favor of safety and the north star, updates `TASK_LOG.md`, and stops after the cycle.

## Definition of done

A task is done only when:

- Acceptance criteria are met.
- `npm run check` passes.
- The changed path works at mobile width.
- Interactive controls are keyboard reachable and have understandable labels.
- Empty, loading, and error states are considered where relevant.
- No real-world political or off-platform hostile mechanic is introduced.
- Documentation reflects material changes.

## Architecture direction

The current repository is a lightweight Vite prototype. Keep mock data local until the first interaction loop is validated. Do not add authentication, a database, real social-platform APIs, payments, real-time multiplayer, or generative AI until a roadmap milestone explicitly requires them.

## Decision priority

Safety and legality → creator value → follower fun → measurable learning → simplicity → visual polish → technical elegance.
