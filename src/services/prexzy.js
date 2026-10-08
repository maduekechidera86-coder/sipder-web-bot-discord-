import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

/**
 * The ONE place that talks to the external API layer.
 * No command file contains a URL: it passes an endpoint from ENDPOINTS below.
 *
 * Handles URL building, query encoding, GET/POST, JSON parsing, HTTP errors,
 * timeouts, non-JSON responses, binary media downloads and useful error objects.
 * The base URL comes from MEDIA_API_ENDPOINT, so it can be swapped from .env.
 */

export class ApiError extends Error {
  constructor(message, { type = 'api_error', status = null, endpoint = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.status = status;
    this.endpoint = endpoint;
  }
}

/** Endpoint paths that are verified against the live API. Nothing else is invented. */
export const ENDPOINTS = Object.freeze({
  // Verified: GET /tts/<voice>?text=… returns audio/mpeg.
  ttsVoice: (voice = 'amy') => `/tts/${encodeURIComponent(voice)}`,
  ttsVoices: () => '/tts/tts-voices',
});

const DEFAULT_MAX_BYTES = 7_500_000; // Discord's attachment ceiling for a normal server

function baseUrl() {
  return (config.mediaApiEndpoint || 'https://prexzyapis.com').replace(/\/+$/, '');
}

function buildUrl(path, query = {}) {
  if (typeof path !== 'string' || !path.trim()) {
    throw new ApiError('No API endpoint was provided.', { type: 'invalid_request' });
  }
  const url = new URL(`${baseUrl()}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
    else url.searchParams.set(key, String(value));
  }
  return url;
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

function normalizeError(error, { path, timeout }) {
  if (error instanceof ApiError) return error;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return new ApiError(`The API did not answer within ${Math.round(timeout / 1000)}s.`, { type: 'timeout', endpoint: path });
  }
  return new ApiError(`The API could not be reached (${error?.message ?? 'network error'}).`, { type: 'network_error', endpoint: path });
}

async function request(path, { method = 'GET', query = {}, body = undefined, timeout = config.apiTimeoutMs } = {}) {
  const url = buildUrl(path, query);
  const { controller, done } = withTimeout(timeout);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined && method !== 'GET' ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError(`The API responded with HTTP ${response.status}.`, {
        type: 'http_error',
        status: response.status,
        endpoint: url.pathname,
      });
    }

    const text = await response.text();
    if (!text.trim()) {
      throw new ApiError('The API returned an empty response.', { type: 'invalid_payload', status: response.status, endpoint: url.pathname });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError('The API returned a response that is not valid JSON.', {
        type: 'invalid_payload',
        status: response.status,
        endpoint: url.pathname,
      });
    }

    logger.debug(`[api] ${method} ${url.pathname} → ${response.status} in ${Date.now() - started}ms`);
    return data;
  } catch (error) {
    const normalized = normalizeError(error, { path, timeout });
    logger.warn(`[api] ${method} ${url.pathname} failed (${normalized.type}): ${normalized.message}`);
    throw normalized;
  } finally {
    done();
  }
}

function extensionFor(contentType = '') {
  const map = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'video/mp4': 'mp4',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[contentType] ?? 'bin';
}

/**
 * Downloads the media itself (audio, image, video) and returns a Buffer that can be
 * attached to a Discord message. Refuses to pretend a download worked when it failed.
 */
async function fetchMedia(path, { query = {}, maxBytes = DEFAULT_MAX_BYTES, timeout = Math.max(config.apiTimeoutMs, 30000) } = {}) {
  const url = buildUrl(path, query);
  const { controller, done } = withTimeout(timeout);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: '*/*' } });

    if (!response.ok) {
      throw new ApiError(`The API responded with HTTP ${response.status}.`, { type: 'http_error', status: response.status, endpoint: url.pathname });
    }

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared && declared > maxBytes) {
      throw new ApiError(`The file is ${(declared / 1024 / 1024).toFixed(1)}MB — too large for a Discord attachment.`, {
        type: 'too_large',
        endpoint: url.pathname,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new ApiError('The API returned an empty file.', { type: 'invalid_payload', endpoint: url.pathname });
    }
    if (buffer.length > maxBytes) {
      throw new ApiError(`The file is ${(buffer.length / 1024 / 1024).toFixed(1)}MB — too large for a Discord attachment.`, {
        type: 'too_large',
        endpoint: url.pathname,
      });
    }

    const contentType = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim();
    logger.debug(`[api] GET ${url.pathname} → ${buffer.length} bytes (${contentType})`);

    return {
      buffer,
      contentType,
      size: buffer.length,
      extension: extensionFor(contentType),
    };
  } catch (error) {
    const normalized = normalizeError(error, { path, timeout });
    logger.warn(`[api] GET ${url.pathname} failed (${normalized.type}): ${normalized.message}`);
    throw normalized;
  } finally {
    done();
  }
}

/** Reachability probe used by /status and /stats — never throws. */
async function health() {
  const { controller, done } = withTimeout(Math.min(config.apiTimeoutMs, 8000));
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl()}/`, { method: 'GET', signal: controller.signal });
    return { reachable: true, status: response.status, ms: Date.now() - started, endpoint: baseUrl() };
  } catch (error) {
    return { reachable: false, status: null, ms: Date.now() - started, endpoint: baseUrl(), error: error?.message ?? 'unreachable' };
  } finally {
    done();
  }
}

/** Pulls the first usable media URL out of payloads that differ shape per endpoint. */
function findMediaUrl(payload) {
  if (!payload) return null;
  if (typeof payload === 'string' && /^https?:\/\//i.test(payload)) return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findMediaUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === 'object') {
    for (const key of ['url', 'link', 'download_url', 'downloadUrl', 'mp3', 'audio', 'video', 'image', 'thumbnail', 'result', 'data']) {
      const found = findMediaUrl(payload[key]);
      if (found) return found;
    }
  }
  return null;
}

export const prexzy = {
  request,
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, options = {}) => request(path, { ...options, method: 'POST' }),
  fetchMedia,
  health,
  findMediaUrl,
  buildUrl,
  baseUrl,
  ENDPOINTS,
};

export default prexzy;
