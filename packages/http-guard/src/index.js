// Safety helpers for a small Node web server that is put online:
// security headers (Content-Security-Policy and friends), the real client IP behind a host's proxy,
// whether the page came over https, safe static file paths, and hashes of inline <script> blocks.
import crypto from 'node:crypto';
import net from 'node:net';
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

/**
 * Line endings the way a browser reads an HTML page: every \r\n and every lone \r becomes \n
 * (the HTML spec's "input stream preprocessing"). Browsers hash an inline script AFTER this,
 * so a page saved with Windows line endings (CRLF) must be hashed the same way (issue #58).
 */
export function normalizeNewlines(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

/** The CSP hashes of every inline <script> (without src) in an HTML text, e.g. the import map. CRLF-safe. */
export function inlineScriptHashes(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const text = normalizeNewlines(html);
  for (let m; (m = re.exec(text));) {
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

/** The TRUST_PROXY value for a Cloudflare Tunnel (cloudflared running on the same computer). */
export const CLOUDFLARE = 'cloudflare';

/**
 * Read the TRUST_PROXY setting: '' / '0' / 'false' / undefined -> 0 (trust nobody),
 * '1' / 'true' -> 1 proxy (Render, Railway, Fly...), a number n -> n proxies in front,
 * 'cloudflare' -> 'cloudflare' (a Cloudflare Tunnel on this computer: CF-Connecting-IP is believed,
 * but only from a loopback peer, see clientIp).
 */
export function parseTrustProxy(value) {
  if (value === undefined || value === null) return 0;
  const v = String(value).trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false' || v === 'no') return 0;
  if (v === 'true' || v === 'yes') return 1;
  if (v === CLOUDFLARE || v === 'cloudflared') return CLOUDFLARE;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10) : 0;
}

/** True for this computer's own addresses: 127.x.x.x and ::1 (also written ::ffff:127.0.0.1). */
export function isLoopback(ip) {
  ip = cleanIp(ip);
  if (net.isIPv4(ip)) return ip.startsWith('127.');
  return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
}

const firstHeader = v => (Array.isArray(v) ? v[0] : v);

// cloudflared runs on this computer, so its requests come from loopback. Anyone else (the Wi-Fi) is not believed.
const fromLocalTunnel = req => isLoopback(req?.socket?.remoteAddress);

/**
 * The client's IP address. req: { socket: { remoteAddress }, headers }.
 * trustProxy: how many proxies in front of us (0: X-Forwarded-For is ignored, anyone can fake it).
 * With n proxies the client is the n-th address from the right of X-Forwarded-For.
 * With 'cloudflare' the CF-Connecting-IP header is used, but only when the connection comes from this
 * computer (cloudflared) and the header is a real IP; players on the same Wi-Fi keep their own address.
 */
export function clientIp(req, { trustProxy = 0 } = {}) {
  const direct = cleanIp(req?.socket?.remoteAddress) || 'unknown';
  if (!trustProxy) return direct;
  if (trustProxy === CLOUDFLARE) {
    if (!fromLocalTunnel(req)) return direct;
    const cf = cleanIp(String(firstHeader(req.headers?.['cf-connecting-ip']) ?? ''));
    return net.isIP(cf) ? cf : direct;
  }
  const xff = req.headers?.['x-forwarded-for'];
  const list = (Array.isArray(xff) ? xff.join(',') : String(xff ?? '')).split(',').map(cleanIp).filter(Boolean);
  if (!list.length) return direct;
  return list[Math.max(0, list.length - trustProxy)];
}

/**
 * True when the page came over https (directly, or through a trusted proxy that says X-Forwarded-Proto: https).
 * With 'cloudflare': only from a loopback peer, by X-Forwarded-Proto: https or CF-Visitor {"scheme":"https"}.
 */
export function isHttps(req, { trustProxy = 0 } = {}) {
  if (req?.socket?.encrypted) return true;
  if (!trustProxy) return false;
  if (trustProxy === CLOUDFLARE && !fromLocalTunnel(req)) return false;
  const proto = String(firstHeader(req.headers?.['x-forwarded-proto']) ?? '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  if (trustProxy !== CLOUDFLARE) return false;
  try { return JSON.parse(String(firstHeader(req.headers?.['cf-visitor']) ?? '')).scheme === 'https'; } catch { return false; }
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
