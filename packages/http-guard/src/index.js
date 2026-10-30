// Safety helpers for a small Node web server that is put online:
// security headers (Content-Security-Policy and friends), the real client IP behind a host's proxy,
// whether the page came over https, safe static file paths, and hashes of inline <script> blocks.
import crypto from 'node:crypto';
import path from 'node:path';

/** Hosts the page may load scripts from, besides itself (three.js in the practice page comes from jsdelivr). */
export const DEFAULT_SCRIPT_HOSTS = Object.freeze(['https://cdn.jsdelivr.net']);

/**
 * A Host header we can safely put into a header value, or null.
 * Only letters, numbers, dots, dashes, and an optional :port (or an [IPv6] address).
 */
export function safeHost(host) {
  if (typeof host !== 'string' || host.length > 255) return null;
  return /^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(host) ? host.toLowerCase() : null;
}

/**
 * The Content-Security-Policy text.
 * - scriptHashes: 'sha256-...' values of inline scripts that are allowed (e.g. the import map)
 * - host: the page's own host (from safeHost), so its WebSocket (ws:// or wss://) is allowed
 * - scriptHosts: other places scripts may come from (default: cdn.jsdelivr.net)
 */
export function contentSecurityPolicy({ scriptHashes = [], host = null, scriptHosts = DEFAULT_SCRIPT_HOSTS } = {}) {
  const sockets = host ? [`ws://${host}`, `wss://${host}`] : [];
  return [
    "default-src 'self'",
    `script-src ${["'self'", ...scriptHosts, ...scriptHashes.map(h => `'${h}'`)].join(' ')}`,
    // inline style attributes are used by the game's HTML and SVG icons; styles cannot run code
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${["'self'", ...sockets].join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Every security header for one answer, as a plain object for res.writeHead / res.setHeader.
 * https: true adds Strict-Transport-Security (only when the page really came over https).
 */
export function securityHeaders({ scriptHashes, host, scriptHosts, https = false } = {}) {
  const h = {
    'Content-Security-Policy': contentSecurityPolicy({ scriptHashes, host: safeHost(host), scriptHosts }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
  if (https) h['Strict-Transport-Security'] = 'max-age=15552000';
  return h;
}

/** 'sha256-<base64>' of a text, the way CSP wants it. */
export function cspHash(text) {
  return 'sha256-' + crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

/** The CSP hashes of every inline <script> (without src) in an HTML text, e.g. the import map. */
export function inlineScriptHashes(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m; (m = re.exec(html));) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out.push(cspHash(m[2]));
  }
  return out;
}

const cleanIp = ip => {
  if (typeof ip !== 'string') return '';
  ip = ip.trim();
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  return ip;
};

/**
 * Read the TRUST_PROXY setting: '' / '0' / 'false' / undefined -> 0 (trust nobody),
 * '1' / 'true' -> 1 proxy (Render, Railway, Fly...), a number n -> n proxies in front.
 */
export function parseTrustProxy(value) {
  if (value === undefined || value === null) return 0;
  const v = String(value).trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false' || v === 'no') return 0;
  if (v === 'true' || v === 'yes') return 1;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10) : 0;
}

/**
 * The client's IP address. req: { socket: { remoteAddress }, headers }.
 * trustProxy: how many proxies in front of us (0: X-Forwarded-For is ignored, anyone can fake it).
 * With n proxies the client is the n-th address from the right of X-Forwarded-For.
 */
export function clientIp(req, { trustProxy = 0 } = {}) {
  const direct = cleanIp(req?.socket?.remoteAddress) || 'unknown';
  if (!trustProxy) return direct;
  const xff = req.headers?.['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : String(xff ?? '')).split(',').map(cleanIp).filter(Boolean);
  if (!list.length) return direct;
  return list[Math.max(0, list.length - trustProxy)];
}

/** True when the page came over https (directly, or through a trusted proxy that says X-Forwarded-Proto: https). */
export function isHttps(req, { trustProxy = 0 } = {}) {
  if (req?.socket?.encrypted) return true;
  if (!trustProxy) return false;
  const proto = String(req.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

/**
 * The file for a URL path inside `root`, or null if the path tries to leave it (../, encoded ../, NUL bytes).
 * urlPath is the decoded path (e.g. '/js/main.js').
 */
export function safeJoin(root, urlPath) {
  if (typeof urlPath !== 'string' || urlPath.includes('\0')) return null;
  const parts = urlPath.split(/[\\/]+/);
  if (parts.includes('..')) return null; // nobody needs ../ in a real game file path
  const base = path.resolve(root);
  const file = path.resolve(base, '.' + path.posix.normalize('/' + parts.join('/')));
  return file === base || file.startsWith(base + path.sep) ? file : null;
}
