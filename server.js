import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT || 3000);
const maxRequestBytes = 8_192;

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

const providers = [
  {
    id: 'youtube',
    label: 'YouTube',
    hostnames: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
    endpoint: url => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hostnames: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com'],
    endpoint: url => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  },
  {
    id: 'x',
    label: 'X',
    hostnames: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    endpoint: url => `https://publish.x.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`,
  },
];

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function deploymentMetadata() {
  return {
    service: 'creatorverse-web',
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'local',
    branch: process.env.RAILWAY_GIT_BRANCH || 'local',
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || 'local',
    commitMessage: process.env.RAILWAY_GIT_COMMIT_MESSAGE || '',
    author: process.env.RAILWAY_GIT_AUTHOR || '',
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || '',
    publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || '',
  };
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

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxRequestBytes) {
        reject(new Error('REQUEST_TOO_LARGE'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    request.on('error', reject);
  });
}

function findProvider(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  const provider = providers.find(item => item.hostnames.includes(parsed.hostname.toLowerCase()));
  return provider ? { provider, normalizedUrl: parsed.toString() } : null;
}

async function fetchSocialPreview(rawUrl) {
  const match = findProvider(rawUrl);
  if (!match) {
    const error = new Error('UNSUPPORTED_SOCIAL_URL');
    error.statusCode = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const upstream = await fetch(match.provider.endpoint(match.normalizedUrl), {
      headers: { 'User-Agent': 'Creatorverse/0.1 social-preview' },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const error = new Error('SOCIAL_PROVIDER_REJECTED');
      error.statusCode = upstream.status === 404 ? 404 : 502;
      throw error;
    }

    const data = await upstream.json();
    return {
      provider: match.provider.id,
      providerLabel: match.provider.label,
      sourceUrl: match.normalizedUrl,
      type: String(data.type || 'link').slice(0, 32),
      title: String(data.title || 'Untitled public post').slice(0, 300),
      authorName: String(data.author_name || '').slice(0, 160),
      authorUrl: typeof data.author_url === 'string' ? data.author_url : '',
      thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseYouTubeProfile(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(parsed.hostname.toLowerCase())) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts[0]?.startsWith('@')) return { filter: 'forHandle', value: parts[0] };
  if (parts[0] === 'channel' && parts[1]) return { filter: 'id', value: parts[1] };
  if (parts[0] === 'user' && parts[1]) return { filter: 'forUsername', value: parts[1] };
  return null;
}

async function fetchYouTubeProfile(rawUrl) {
  if (!process.env.YOUTUBE_API_KEY) {
    const error = new Error('YOUTUBE_API_NOT_CONFIGURED');
    error.statusCode = 503;
    throw error;
  }
  const profileRef = parseYouTubeProfile(rawUrl);
  if (!profileRef) {
    const error = new Error('UNSUPPORTED_PROFILE_URL');
    error.statusCode = 400;
    throw error;
  }

  const params = new URLSearchParams({
    part: 'snippet,statistics',
    key: process.env.YOUTUBE_API_KEY,
    [profileRef.filter]: profileRef.value,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const upstream = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, { signal: controller.signal });
    if (!upstream.ok) {
      const error = new Error('PROFILE_PROVIDER_REJECTED');
      error.statusCode = 502;
      throw error;
    }
    const data = await upstream.json();
    const channel = data.items?.[0];
    if (!channel) {
      const error = new Error('PROFILE_NOT_FOUND');
      error.statusCode = 404;
      throw error;
    }
    const snippet = channel.snippet || {};
    const statistics = channel.statistics || {};
    return {
      provider: 'youtube',
      providerLabel: 'YouTube',
      sourceUrl: rawUrl,
      id: channel.id,
      title: String(snippet.title || '').slice(0, 160),
      description: String(snippet.description || '').slice(0, 1000),
      avatarUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
      customUrl: snippet.customUrl || '',
      country: snippet.country || '',
      subscriberCount: statistics.hiddenSubscriberCount ? null : Number(statistics.subscriberCount || 0),
      videoCount: Number(statistics.videoCount || 0),
      viewCount: Number(statistics.viewCount || 0),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');

  if (requestUrl.pathname === '/health') {
    const metadata = deploymentMetadata();
    return sendJson(response, 200, {
      status: 'ok',
      service: metadata.service,
      timestamp: new Date().toISOString(),
      environment: metadata.environment,
      branch: metadata.branch,
      commit: metadata.commitSha.slice(0, 12),
      integrations: { youtubeProfiles: Boolean(process.env.YOUTUBE_API_KEY) },
    });
  }

  if (requestUrl.pathname === '/version') {
    return sendJson(response, 200, deploymentMetadata());
  }

  if (requestUrl.pathname === '/api/social/preview' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      if (typeof body.url !== 'string' || body.url.length > 2_048) return sendJson(response, 400, { error: 'INVALID_URL' });
      return sendJson(response, 200, { preview: await fetchSocialPreview(body.url.trim()) });
    } catch (error) {
      const statusCode = Number(error.statusCode) || (error.name === 'AbortError' ? 504 : 400);
      return sendJson(response, statusCode, { error: error.name === 'AbortError' ? 'SOCIAL_PROVIDER_TIMEOUT' : error.message });
    }
  }

  if (requestUrl.pathname === '/api/social/profile' && request.method === 'POST') {
    try {
      const body = await readJsonBody(request);
      if (typeof body.url !== 'string' || body.url.length > 2_048) return sendJson(response, 400, { error: 'INVALID_URL' });
      return sendJson(response, 200, { profile: await fetchYouTubeProfile(body.url.trim()) });
    } catch (error) {
      const statusCode = Number(error.statusCode) || (error.name === 'AbortError' ? 504 : 400);
      return sendJson(response, statusCode, { error: error.name === 'AbortError' ? 'PROFILE_PROVIDER_TIMEOUT' : error.message });
    }
  }

  if (!existsSync(root)) {
    return sendJson(response, 503, { error: 'BUILD_NOT_FOUND', message: 'Run npm run build before starting the production server.' });
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
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  createReadStream(assetPath).pipe(response);
});

server.listen(port, '0.0.0.0', () => console.log(`Creatorverse listening on 0.0.0.0:${port}`));
