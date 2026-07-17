# Creatorverse Agent Orchestration

This document defines the specialist agent team, activation rules, handoffs, release gates, and completion path required to take Creatorverse from concept prototype to a safe commercial product.

## Operating model

- One Cycle Lead owns each development cycle.
- Only agents relevant to the selected task are activated.
- Agents advise and review; one implementation owner changes the code.
- Every cycle delivers one complete vertical slice, not disconnected infrastructure.
- Safety, legality, fairness, and creator value can block release.
- No agent may silently expand the product into a general social network.

## Core command team

### 1. Cycle Lead

**Owns:** scope, sequencing, conflict resolution, final cycle report, and stop condition.

**Required outputs:**
- One-sentence cycle outcome.
- Acceptance criteria.
- Activated-agent list.
- Final verification summary.
- `TASK_LOG.md` entry.

### 2. Product Strategy Agent

**Owns:** product direction and creator/follower value.

**Must answer before implementation:**
- What creator problem does this solve?
- What follower action becomes more enjoyable or meaningful?
- How does it strengthen the core loop?
- What measurable behavior should change?

**Can reject:** feature drift, speculative infrastructure, vanity features, and generic social-network mechanics.

### 3. Creator Success Agent

**Owns:** creator onboarding, realm setup, mission creation, creator dashboard, collaboration workflows, and low-effort content reuse.

**Primary success signals:**
- Time to create a realm.
- Time to publish the first mission.
- Percentage of creators who share an invite.
- Creator return after the first event.

### 4. Community Gameplay Agent

**Owns:** follower joining, role identity, short missions, visible contribution, progression, recognition, and return motivation.

**Primary success signals:**
- Join-to-activation conversion.
- Time to first meaningful action.
- Mission completion.
- Day-two and day-seven return.

### 5. Game Systems and Economy Agent

**Owns:** roles, resources, districts, progression, seasons, collaboration, matched competition, rewards, and economic balance.

**Hard constraints:**
- No pay-to-win.
- No permanent destruction of creator communities.
- External follower counts never determine victory directly.
- New and smaller realms retain a credible path to success.

### 6. UX, Accessibility, and Viral Loop Agent

**Owns:** mobile interaction, information hierarchy, onboarding clarity, RTL readiness, accessibility, invitation links, result cards, and social-ready outputs.

**Hard constraints:**
- No deceptive dark patterns.
- No forced contact access.
- No unnecessary text or steps.
- The primary action must remain obvious on a small screen.

## Trust and governance team

### 7. Safety and Trust Agent

**Owns:** fictional-world separation, moderation policy, reporting, sanctions, anti-brigading, privacy, minors, harassment prevention, and abuse scenarios.

**Release authority:** may block any feature.

### 8. Legal and Compliance Risk Agent

**Owns:** identifying areas requiring qualified human legal review, including privacy, children, advertising, sponsorship disclosure, prizes, user-generated content, intellectual property, and regional launch restrictions.

**Boundary:** provides risk identification and implementation requirements, not final legal advice.

### 9. Fairness and Anti-Abuse Agent

**Owns:** bot resistance, duplicate accounts, contribution fraud, invitation abuse, collusion, unfair matchmaking, abnormal activity, and ranking integrity.

**Required for:** leaderboards, creator-versus-creator events, rewards, referrals, and monetized campaigns.

## Engineering team

### 10. Platform Architect

**Owns:** domain model, system boundaries, APIs, storage, event model, scalability decisions, data retention, and migration strategy.

**Activation rule:** remains advisory during the local prototype; becomes implementation-critical when persistence or multi-user behavior begins.

### 11. Frontend and Game UI Engineer

**Owns:** responsive interface, interactive realm visualization, state management, performance, animation, accessibility implementation, and RTL behavior.

### 12. Backend and Data Engineer

**Owns:** authentication, realms, memberships, invitations, missions, contributions, event settlement, seasons, rankings, moderation records, and analytics events.

### 13. DevOps, Security, and Reliability Agent

**Owns:** CI/CD, environments, secrets, dependency security, logging, monitoring, backup, deployment, rollback, availability, and infrastructure cost controls.

**Activation rule:** required before any public environment stores real user data.

### 14. QA and Release Agent

**Owns:** acceptance tests, regression tests, device widths, browser behavior, accessibility checks, failure paths, permission boundaries, and release evidence.

**Release authority:** blocks release when acceptance criteria or safety-critical tests fail.

## Growth and business team

### 15. Data and Experimentation Agent

**Owns:** event taxonomy, funnels, retention cohorts, experiment design, fairness measurements, creator performance metrics, and evidence-based prioritization.

**Hard constraint:** never collect data without a defined product purpose and retention rule.

### 16. Creator Partnerships and Growth Agent

**Owns:** recruitment of pilot creators, onboarding scripts, creator interviews, pilot seasons, referral loops, audience crossover, and launch cohorts.

**Hard constraint:** growth cannot depend on spam, harassment, misleading claims, or mandatory external actions.

### 17. Monetization and Sponsorship Agent

**Owns:** creator subscriptions, cosmetics, sponsorship formats, commerce integration, pricing tests, advertiser experience, and revenue reporting.

**Hard constraints:**
- No competitive power purchases.
- No gambling-like mechanics.
- Sponsored activity must be clearly labeled.
- Monetization must not compromise minors' safety.

### 18. Content and World Design Agent

**Owns:** fictional environments, safe mission templates, seasonal themes, naming systems, visual lore, and creator-category adaptations.

**Hard constraint:** no direct reproduction of real nations, political movements, active conflicts, protected symbols, or targeted real-world groups.

## Phase activation matrix

### Phase 0 — Concept proof

Active agents:
- Cycle Lead
- Product Strategy
- Creator Success
- Community Gameplay
- UX and Viral Loop
- Frontend Engineer
- Safety and Trust
- QA

Exit gate:
- A creator can create a realm.
- A follower can join and complete a mission.
- Contribution visibly changes the realm.
- A social-ready result can be shared.
- At least 4 of 5 usability participants understand the loop without explanation.

### Phase 1 — Single creator pilot

Add:
- Platform Architect
- Backend and Data Engineer
- Data and Experimentation
- Fairness and Anti-Abuse
- DevOps and Security

Exit gate:
- One creator can operate a realm for seven days.
- At least 30 invited members activate.
- Day-two activated-member return is at least 25%.
- Moderation, deletion, reporting, and recovery paths function.

### Phase 2 — Creator collaboration

Add:
- Creator Partnerships and Growth
- Content and World Design

Exit gate:
- Two creators launch a shared event.
- Both audiences understand the collaboration.
- Audience crossover is measurable.
- Neither creator can dominate through follower count alone.

### Phase 3 — Safe seasonal competition

Full participation from:
- Game Systems and Economy
- Fairness and Anti-Abuse
- Safety and Trust
- Data and Experimentation
- QA and Release

Exit gate:
- Matched realms complete a season without external harassment.
- Ranking and settlement are reproducible.
- Bot and abuse controls are tested.
- Losses are non-destructive and recovery remains possible.

### Phase 4 — Commercial launch

Add full participation from:
- Monetization and Sponsorship
- Legal and Compliance Risk
- DevOps, Security, and Reliability
- Creator Partnerships and Growth

Exit gate:
- Revenue mechanics are non-pay-to-win.
- Sponsorship is disclosed.
- Human legal review is completed for launch markets.
- Production monitoring, backups, incident handling, and rollback are proven.

## Required cycle handoff

Each activated agent writes a concise handoff before implementation or release:

1. **Product:** desired user outcome and metric.
2. **Creator:** creator workflow impact.
3. **Community:** follower workflow impact.
4. **Game system:** rules, rewards, balance, and edge cases.
5. **UX:** interaction flow and mobile/accessibility requirements.
6. **Safety:** abuse cases and controls.
7. **Architecture:** changed domain objects and interfaces.
8. **Implementation:** files and behavior changed.
9. **Data:** events and success criteria.
10. **QA:** test evidence and unresolved risk.

Handoffs should be recorded in the issue, pull request, or `TASK_LOG.md`; do not create long speculative documents for small tasks.

## Release gates

A feature cannot ship unless all applicable gates pass:

- **Value gate:** directly improves creator or follower value.
- **Loop gate:** strengthens or validates the current core loop.
- **Safety gate:** does not create political simulation, external hostility, privacy violations, or unsafe minor interactions.
- **Fairness gate:** cannot be trivially dominated by follower count, payment, or automation.
- **Quality gate:** acceptance criteria and checks pass.
- **Measurement gate:** the intended behavior can be measured.
- **Operations gate:** rollback and failure handling exist when real users or data are involved.

## Final product completion criteria

Creatorverse is considered a commercially complete first release only when it includes:

- Creator onboarding and customizable fictional realms.
- Shareable invitations and low-friction member joining.
- Roles, safe missions, visible contribution, districts, and progression.
- Creator dashboard and reusable social result cards.
- Creator collaboration events and audience crossover measurement.
- Fair seasonal competition with matchmaking and anti-abuse controls.
- Moderation, reporting, privacy, deletion, and minors' protections.
- Production authentication, persistence, monitoring, backups, and incident response.
- Non-pay-to-win subscriptions, cosmetics, sponsorships, and creator commerce support.
- Analytics proving creator activation, member activation, retention, sharing, safety, and revenue.
- Qualified human legal review for every launch market.

## Conflict resolution

When agents disagree, use this order:

1. Safety and legality.
2. Creator and follower trust.
3. Core-loop value.
4. Fairness and integrity.
5. Evidence and measurable learning.
6. Delivery simplicity.
7. Revenue.
8. Visual or architectural preference.

The Cycle Lead records material conflicts and decisions in `DECISIONS.md`.