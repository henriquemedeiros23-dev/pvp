# @pvp/http-guard

## What it does

Safety helpers for a small Node web server that is put online: the security headers (a Content-Security-Policy
that allows only the site itself, cdn.jsdelivr.net and the page's own inline scripts by hash; no framing; nosniff;
no referrer), the real client IP and https behind a host's proxy (only when you say you trust it), safe static
file paths (no `../`), and the CSP hashes of inline `<script>` blocks (like an import map). Node only (uses `node:crypto` and `node:path`).

## How to use

```js
import { securityHeaders, inlineScriptHashes, clientIp, isHttps, parseTrustProxy, safeJoin } from '@pvp/http-guard';

const trustProxy = parseTrustProxy(process.env.TRUST_PROXY); // '1' on Render/Railway, unset at home

http.createServer((req, res) => {
  const ip = clientIp(req, { trustProxy });                    // X-Forwarded-For only counts when trusted
  const file = safeJoin(publicDir, decodeURIComponent(req.url.split('?')[0])); // null: refuse (403)
  const html = fs.readFileSync(file, 'utf8');
  const headers = securityHeaders({
    scriptHashes: inlineScriptHashes(html),                    // allow exactly the page's import map
    host: req.headers.host,                                    // its own ws:// and wss:// for the game socket
    https: isHttps(req, { trustProxy }),                       // adds Strict-Transport-Security
  });
  res.writeHead(200, { ...headers, 'Content-Type': 'text/html' });
  res.end(html);
});
```

Also: `contentSecurityPolicy(opts)` (just the CSP text), `cspHash(text)`, `safeHost(host)` and `DEFAULT_SCRIPT_HOSTS`.

## Determinism

Fully deterministic: pure functions of their inputs (the request-like object, the HTML text); no time, no random.
