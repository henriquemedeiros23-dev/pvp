import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeHost, contentSecurityPolicy, securityHeaders, cspHash, inlineScriptHashes, parseTrustProxy, clientIp, isHttps, safeJoin } from '../src/index.js';

test('safeHost: normal hosts pass, header tricks do not', () => {
  assert.equal(safeHost('PvP.onrender.com'), 'pvp.onrender.com');
  assert.equal(safeHost('localhost:3000'), 'localhost:3000');
  assert.equal(safeHost('[::1]:3000'), '[::1]:3000');
  assert.equal(safeHost('evil.com; script-src *'), null);
  assert.equal(safeHost('a\r\nb'), null);
  assert.equal(safeHost(undefined), null);
});

test('CSP: only self + jsdelivr scripts, hashes, own WebSocket, no framing', () => {
  const csp = contentSecurityPolicy({ scriptHashes: ['sha256-abc'], host: 'game.example' });
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'sha256-abc'(;|$)/);
  assert.match(csp, /connect-src 'self' ws:\/\/game\.example wss:\/\/game\.example/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});

test('securityHeaders: the usual set, HSTS only on https, a bad host is dropped', () => {
  const h = securityHeaders({ host: 'x"; evil' });
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Referrer-Policy'], 'no-referrer');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(!('Strict-Transport-Security' in h));
  assert.match(h['Content-Security-Policy'], /connect-src 'self';/);
  assert.ok('Strict-Transport-Security' in securityHeaders({ https: true }));
});

test('inline script hashes: inline scripts only, same as sha256 base64', () => {
  const html = '<script type="importmap">{"a":1}</script><script src="/x.js"></script><SCRIPT>go()</SCRIPT>';
  const expected = t => 'sha256-' + crypto.createHash('sha256').update(t).digest('base64');
  assert.deepEqual(inlineScriptHashes(html), [expected('{"a":1}'), expected('go()')]);
  assert.equal(cspHash('go()'), expected('go()'));
});

test('parseTrustProxy', () => {
  assert.equal(parseTrustProxy(undefined), 0);
  assert.equal(parseTrustProxy(''), 0);
  assert.equal(parseTrustProxy('false'), 0);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('2'), 2);
  assert.equal(parseTrustProxy('lots'), 0);
});

test('clientIp: X-Forwarded-For only counts when the proxy is trusted', () => {
  const req = { socket: { remoteAddress: '::ffff:10.0.0.1' }, headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4' } };
  assert.equal(clientIp(req), '10.0.0.1');
  assert.equal(clientIp(req, { trustProxy: 1 }), '1.2.3.4'); // the address our proxy saw (the fake one is ignored)
  assert.equal(clientIp(req, { trustProxy: 2 }), '6.6.6.6');
  assert.equal(clientIp(req, { trustProxy: 5 }), '6.6.6.6');
  assert.equal(clientIp({ socket: { remoteAddress: '1.1.1.1' }, headers: {} }, { trustProxy: 1 }), '1.1.1.1');
  assert.equal(clientIp({ headers: {} }), 'unknown');
});

test('isHttps: from the socket, or a trusted proxy', () => {
  const req = { socket: {}, headers: { 'x-forwarded-proto': 'https' } };
  assert.equal(isHttps(req), false);
  assert.equal(isHttps(req, { trustProxy: 1 }), true);
  assert.equal(isHttps({ socket: { encrypted: true }, headers: {} }), true);
});

test('safeJoin: stays inside the folder', () => {
  const root = path.resolve('/srv/public');
  assert.equal(safeJoin(root, '/js/main.js'), path.join(root, 'js', 'main.js'));
  assert.equal(safeJoin(root, '//js//./main.js'), path.join(root, 'js', 'main.js'));
  assert.equal(safeJoin(root, '/'), root);
  assert.equal(safeJoin(root, '/../secret.txt'), null);
  assert.equal(safeJoin(root, '/a/../b.js'), null); // any ../ is refused
  assert.equal(safeJoin(root, '/..\\..\\x'), null);
  assert.equal(safeJoin(root, '/a..b.js'), path.join(root, 'a..b.js')); // two dots inside a name are fine
  assert.equal(safeJoin(root, '/x\0.js'), null);
  assert.equal(safeJoin(root, 5), null);
});
