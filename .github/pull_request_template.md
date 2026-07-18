## Active cycle

- Issue:
- Task key (`CV-MVP-###`):
- Current stage: `stage:release`

## User outcome

<!-- One user-visible outcome only. -->

## Scope and non-goals

- Included:
- Excluded:

## Five-agent handoff

### Product Lead
- Acceptance criteria:
- Success signal:

### Game & UX
- User flow:
- Mobile/accessibility notes:
- Arabic/English and RTL/LTR notes:
- Loading/empty/error states:

### Safety & Fairness
- Decision: PASS / PASS WITH CONTROLS / BLOCKED
- Required controls:

### Full-Stack Engineer
- Implementation summary:
- Reason for each changed file:

### QA & Release
- Decision: READY / RETURN TO BUILD
- Evidence:

## Acceptance criteria

- [ ] All issue acceptance criteria pass
- [ ] Exactly one coherent user outcome is implemented
- [ ] Mobile behavior reviewed
- [ ] Keyboard controls and understandable labels reviewed
- [ ] Arabic and English remain synchronized when text changed
- [ ] RTL and LTR reviewed when UI changed
- [ ] Loading, empty, success, and error states reviewed
- [ ] Imported/user content is escaped or safely rendered
- [ ] API inputs, authorization, rate limits, and secrets reviewed when applicable

## CI and tests

- [ ] `npm run check`
- [ ] All available automated tests
- [ ] No required check was disabled, bypassed, or made optional
- CI failure classification, repairs, and retry count:

## Railway Preview

- Preview URL:
- `/health` URL and result:
- `/version` URL and result:
- Preview branch:
- Preview commit SHA:
- [ ] `/version` matches this PR commit

## Social integration review

- [ ] Uses official API, public oEmbed, or explicit OAuth authorization
- [ ] Does not request social-media passwords
- [ ] Does not scrape accounts, private profiles, messages, or follower lists
- [ ] Secrets remain server-side in Railway Variables
- [ ] A safe disabled/error state exists when an external integration is unavailable

## Known limitations and risks

<!-- Concrete remaining limitations only. -->

## Rollback

<!-- State the last-known-good or safe revert method. -->

## Release completion

QA completes these after merge:

- [ ] Squash merge completed
- [ ] Railway production `/health` returns 200
- [ ] Railway production `/version` matches the merged commit
- [ ] Active issue closed and workflow labels removed
- [ ] Feature branch deleted when possible
- [ ] `TASK_LOG.md` reflects the released facts

## Next single task

<!-- Record only; do not start it in this PR. -->
