# Creatorverse Progress Dashboard

This file is the single human-readable status page for Creatorverse. Update it at the end of every development cycle.

## Current phase

**Phase 0 — Concept proof**

Goal: prove that a creator can create a realm, invite followers, let them complete a short mission, visibly change the realm, and share the result.

## Current release

- Environment: Railway test deployment
- Branch: `feat/initial-creatorverse-mvp`
- Pull request: `#1`
- Status: ready for external deployment test; not merged

## Core loop status

| Step | Status | Evidence |
|---|---|---|
| Creator creates a realm | Done | Three-step onboarding and live preview |
| Creator receives invite link | Not started | Next after share-result card |
| Follower joins realm | Prototype only | Static realm entry exists |
| Follower chooses a role | Done | Builder, Explorer, Guardian |
| Follower completes a mission | Done | Two route choices and energy contribution |
| Realm visibly changes | Partial | Energy changes; district unlock is not complete |
| Creator shares a result | Not started | Current highest-priority product task |
| Five-user usability test | Not started | Required before persistence |

## Active cycle

No cycle is active. The next cycle must start from GitHub Issue #2 after the Railway deployment check in Issue #1.

## Release gates

- [ ] Railway public deployment verified
- [ ] `/health` returns HTTP 200
- [ ] Creator share-result card completed
- [ ] Invite/challenge link completed
- [ ] Five-user usability test completed
- [ ] At least 4 of 5 users understand the loop without explanation
- [ ] Safety and fairness review passed
- [ ] CI build passed

## Product metrics to capture next

- Time to create a realm
- Percentage reaching realm preview
- Time to first follower action
- Mission completion rate
- Percentage of creators who copy or share the result
- User understanding score in usability testing

## Current known risks

1. The prototype stores state locally and resets after refresh.
2. User-generated text is rendered through template HTML and must be hardened before real data is accepted.
3. No real invite identity, authentication, moderation, or database exists yet.
4. The product loop has not been validated with real creators or followers.

## Decision rule

Do not add database, authentication, alliances, seasons, commerce, or creator-versus-creator competition until the Phase 0 release gates above pass.
