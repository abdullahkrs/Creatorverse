# Creatorverse Agent Quickstart

Use this guide to start a development cycle with ChatGPT, Codex, or another coding agent.

## Start command

Give the agent this instruction:

> Work in `abdullahkrs/Creatorverse`. Read `AGENT.md` first and follow `.github/agents/orchestrator.agent.md`. Run exactly one development cycle. Create a dedicated branch and Pull Request. Do not merge. Wait for GitHub CI and Railway Preview, add the Preview URL and `/version` result to the PR, then stop.

## What the agent must do

1. Read the required project files.
2. Select one task from the current milestone or a specific issue.
3. Use the fixed five-agent handoff:
   - Product Lead;
   - Game and UX;
   - Safety and Fairness;
   - Full-Stack Engineer;
   - QA and Release.
4. Create a branch.
5. Implement one vertical slice.
6. Run `npm run check`.
7. Update `TASK_LOG.md`.
8. Open a Pull Request using the repository template.
9. Wait for Railway Preview.
10. Add the live Preview URL and `/version` output.
11. Stop without merging.

## What the repository owner reviews

Review these items before approving a Pull Request:

- The Railway Preview works on mobile.
- The result matches the issue acceptance criteria.
- Arabic RTL and English LTR work when relevant.
- No real-world political or external-hostility mechanics were introduced.
- Social integrations use official APIs, public oEmbed, or OAuth.
- No secrets appear in code, logs, screenshots, or the Pull Request.
- `/version` matches the Pull Request branch and commit.
- GitHub CI passes.
- The Pull Request names exactly one next task.

## Railway endpoints

For every deployed environment:

- `/health` confirms that the service is responding.
- `/version` confirms the exact environment, branch, and commit.

Never approve a Preview when `/version` points to a different commit than the Pull Request head.

## Environment progression

- Feature branch → Railway PR Preview.
- Approved Pull Request → merge to `staging` when available.
- Staging verification → merge to `main` only by the repository owner.
- Production → Railway service tracking `main`.

## Secrets

Agents may add only empty names to `.env.example`. Real values belong in Railway Variables. Agents must never create, reveal, rotate, or copy production secrets unless the repository owner explicitly handles that action.
