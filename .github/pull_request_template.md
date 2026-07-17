## Cycle outcome

<!-- One sentence describing the user-visible outcome. -->

## Success signal

<!-- One measurable behavior expected to improve. -->

## Activated five-agent handoff

### Product Lead
- Problem solved:
- Scope included:
- Explicitly excluded:

### Game and UX
- Requirement 1:
- Requirement 2:
- Requirement 3:

### Safety and Fairness
- Decision: PASS / PASS WITH CONTROLS / BLOCK
- Controls or risks:

### Full-Stack Engineer
- Implementation summary:
- Files changed:

### QA and Release
- Decision: READY / NOT READY
- Evidence:

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
- [ ] Mobile behavior reviewed
- [ ] Arabic RTL and English LTR reviewed when user-facing text changed
- [ ] Loading, empty, success, and error states reviewed
- [ ] User-provided content is escaped or safely rendered
- [ ] Server-side permissions and validation reviewed when API behavior changed

## Checks

- [ ] `npm run check`
- [ ] Relevant manual tests completed
- [ ] `/health` returns `status: ok`

## Railway Preview

- Preview URL:
- `/version` URL:
- Environment:
- Branch:
- Commit SHA:

## Social integration review

- [ ] Uses official API, public oEmbed, or explicit OAuth authorization
- [ ] Does not request social-media passwords
- [ ] Does not scrape private profiles, messages, or follower lists
- [ ] Required secrets remain in Railway Variables

## Known risks

<!-- State concrete remaining risks. Write "None identified" when appropriate. -->

## Next single task

<!-- Exactly one next task. Do not start it in this Pull Request. -->
