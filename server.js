import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT || 3000);

const deployment = {
  environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'local',
  branch: process.env.RAILWAY_GIT_BRANCH || 'local',
  commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || 'local',
  commitMessage: process.env.RAILWAY_GIT_COMMIT_MESSAGE || '',
  author: process.env.RAILWAY_GIT_AUTHOR || '',
  deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || '',
  publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || '',
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function resolveAssetPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const requestedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(root, requestedPath);

  if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return join(root, 'index.html');
}

const server = createServer((request, response) => {
  if (request.url === '/health') {
    return sendJson(response, 200, {
      status: 'ok',
      service: 'creatorverse-web',
      timestamp: new Date().toISOString(),
      environment: deployment.environment,
      branch: deployment.branch,
      commit: deployment.commitSha.slice(0, 12),
    });
  }

  if (request.url === '/version') {
    return sendJson(response, 200, {
      service: 'creatorverse-web',
      ...deployment,
    });
  }

  if (!existsSync(root)) {
    return sendJson(response, 503, {
      error: 'BUILD_NOT_FOUND',
      message: 'Run npm run build before starting the production server.',
    });
  }

  const assetPath = resolveAssetPath(request.url || '/');
  const extension = extname(assetPath).toLowerCase();
  const isHtml = extension === '.html';

  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });

  createReadStream(assetPath).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Creatorverse listening on 0.0.0.0:${port}`);
  console.log(`Deployment ${deployment.environment} ${deployment.branch} ${deployment.commitSha.slice(0, 12)}`);
});
