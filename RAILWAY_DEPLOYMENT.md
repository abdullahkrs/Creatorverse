# Railway Test Deployment

This setup deploys the current Creatorverse Vite prototype as one Railway web service. It does not use a database yet.

## Repository preparation

The repository includes:

- `railway.json` — Railway build, start, healthcheck, and restart configuration.
- `server.js` — dependency-free Node production server for the Vite `dist` output.
- `npm start` — starts the production server on Railway's injected `PORT`.
- `/health` — returns HTTP 200 when the service is ready.

## Deploy from GitHub

1. Open Railway and create a new project.
2. Choose **Deploy from GitHub repo**.
3. Select `abdullahkrs/Creatorverse`.
4. Choose the branch to test:
   - Use `feat/initial-creatorverse-mvp` before the pull request is merged.
   - Change to `main` after the pull request is merged.
5. Keep the root directory as `/`.
6. Railway should detect `railway.json`; do not add custom build or start commands in the dashboard unless troubleshooting.
7. Open **Settings → Networking → Generate Domain**.
8. Visit the generated HTTPS domain.
9. Verify the health endpoint at `/health`.

## Expected deployment commands

```text
Build: npm install && npm run build
Start: npm start
Healthcheck: /health
```

## No variables are required for the current prototype

The current prototype uses local mock data. Do not add database credentials yet.

Future server-only variables will be stored in Railway, never in Vite variables or committed files:

```text
DATABASE_URL
SESSION_SECRET
NODE_ENV
```

## Verification checklist

- Home page loads over HTTPS.
- Creator onboarding opens and completes.
- Realm choices update the preview.
- Role selection works.
- Mission completion increases realm energy.
- Refreshing the page loads the application again.
- `/health` returns JSON with `status: ok`.
- Deployment logs contain `Creatorverse listening on 0.0.0.0:<PORT>`.

## Troubleshooting

### Deployment builds but does not become healthy

Confirm the deployment uses `npm start`, and check that Railway injected `PORT`. Do not hard-code a production port.

### `BUILD_NOT_FOUND`

The Vite build did not create `dist`. Inspect the build logs and run `npm run build` locally.

### Old interface remains visible

Confirm the service is tracking the intended branch and that the latest deployment finished successfully.

### Railway does not use `railway.json`

In the service settings, set the config file path to `/railway.json`.
