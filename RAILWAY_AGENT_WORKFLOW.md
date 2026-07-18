# Railway Agent Development Workflow

This workflow lets development agents change Creatorverse through GitHub while Railway automatically provides a live review URL for each pull request.

## Target environments

### Production
- Branch: `main`
- Purpose: approved public version only
- Automatic deploy: enabled after merge to `main`
- Manual approval: recommended before merging

### Staging
- Branch: `staging`
- Purpose: integrated testing before production
- Persistent environment: enabled
- Railway-provided domain: enabled

### Pull request environments
- Source: every non-bot agent pull request by default
- Purpose: isolated live preview of one development cycle
- Lifetime: created when the PR opens and removed when it closes or merges
- Railway-provided domain: enabled automatically when the base environment has a Railway domain

## One-time Railway dashboard setup

1. Create a Railway project from `abdullahkrs/Creatorverse`.
2. In the production environment, connect the service to branch `main`.
3. Keep Root Directory `/`.
4. Generate a Railway public domain for the service.
5. Create a persistent environment named `staging`.
6. Connect staging to branch `staging` and generate a Railway domain.
7. Open Project Settings → Environments → PR Environments.
8. Enable PR Environments.
9. Enable Focused PR Environments.
10. Enable Bot PR Environments only when the chosen coding agent opens PRs as a supported bot and you want those previews automatically.
11. Keep the service watch path as `/**` while the repository contains one deployable application.

## Agent operating rule

Each development cycle must:

1. Branch from the current approved base branch.
2. Implement one vertical slice.
3. Run `npm run check`.
4. Open a pull request.
5. Wait for GitHub CI and Railway PR Environment deployment results.
6. Put the Railway preview URL, tested commit, checks, risks, and screenshots or observations in the PR description or comment.
7. Stop without merging.

Only the repository owner approves merging.

## Review endpoints

Every Railway deployment exposes:

- `/health` — health, environment, branch, and short commit SHA.
- `/version` — full deployment metadata supplied by Railway.

Examples:

```text
https://<preview-domain>/health
https://<preview-domain>/version
```

Use `/version` to confirm the page being reviewed corresponds to the PR commit.

## Promotion flow

```text
agent branch
  → pull request
  → isolated Railway PR preview
  → human review
  → merge to staging
  → persistent staging deployment
  → acceptance review
  → merge staging to main
  → production deployment
```

For the current concept stage, direct PRs to `main` are acceptable if production is still only a private prototype. Before inviting real creators, adopt the full staging flow.

## Database rule

Do not add production PostgreSQL to every PR environment by default. During the UI concept phase, previews use local mock data. When persistence begins:

- Production gets its own PostgreSQL service.
- Staging gets an isolated staging database.
- PR environments use either an ephemeral database or a safe shared test database with resettable test data.
- Never copy production secrets or personal data into PR environments.

## Direct progress review

Review progress from three places:

1. GitHub Pull Request — scope, commits, checks, agent handoff, and discussion.
2. Railway PR Environment — live usable preview.
3. `/version` — exact branch and commit deployed.

A change is not considered complete merely because Railway deployed it. Acceptance criteria, CI, safety review, and human product review must also pass.
