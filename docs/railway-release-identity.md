# Railway release identity evidence

`CV-OPS-001` defines repository-native operational evidence for Railway deployments. It does not measure or claim user comprehension, demand, retention, preference, fairness, or market value.

## Trusted execution

`.github/workflows/railway-health-verification.yml` runs only from the default `main` branch on push, hourly schedule, or explicit workflow dispatch. It does not run with write permissions on `pull_request` or `pull_request_target`, so untrusted pull-request code cannot write issues or commit statuses.

The workflow uses only:

- the public Production and Staging `/health` and `/version` endpoints;
- the scoped built-in `GITHUB_TOKEN` with `contents: read`, `issues: write`, and `statuses: write`;
- locked `npm ci` installation.

No repository secret, Railway credential, paid account, manual evidence, or owner action is required.

## Passing invariants

A passing attestation requires all of the following in one bounded run:

1. Production and Staging are distinct public HTTPS `*.up.railway.app` origins.
2. Production `/health` returns JSON with `status: "ok"`.
3. Production `/version` reports environment `production` and the exact full triggering `main` SHA.
4. Staging `/health` returns JSON with `status: "ok"`.
5. Staging `/version` reports environment `staging` and a full Git commit SHA.
6. The attestation passes the repository integrity validator before publication.

Deployment status alone is never sufficient. Production is never accepted as Staging or as a pull-request Preview.

## Bounded verification

The workflow permits at most 18 attempts. Each endpoint request has a 12-second timeout and retries are separated by 20 seconds. The workflow has a 12-minute job timeout. Exhaustion publishes an explicit failed marker and fails the stable commit status instead of waiting indefinitely.

## GitHub evidence

For each exact SHA, the workflow publishes:

- commit status context `railway-production-identity`;
- one canonical open issue titled `[Ledger] Railway release identity evidence`;
- one idempotent per-SHA comment, updated rather than duplicated:
  - `RAILWAY-IDENTITY-VERIFIED:<sha>` on success;
  - `RAILWAY-IDENTITY-FAILED:<sha>` on failure.

The marker comment contains JSON with schema version, evidence kind, exact SHA, sanitized origins, environment identities, health result, verification timestamp, workflow run URL, and bounded attempt count. Endpoint response bodies and headers are not copied into the ledger.

## Integrity and freshness

A verified marker is accepted only when:

- its marker and JSON both match the expected full SHA;
- Production identity matches that SHA exactly;
- Production and Staging origins remain distinct;
- the workflow run URL is present and identifies one GitHub Actions run;
- the timestamp is no more than 30 minutes old and no more than 5 minutes in the future;
- the JSON does not overstate operational automation as user or market evidence.

The hourly run refreshes the same per-SHA comment without comment spam. QA may read the canonical issue and validate the JSON without direct Railway DNS or an Actions-run listing connector.
