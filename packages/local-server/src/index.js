// @pvp/local-server: the game server's glue running inside the page (practice mode, no network).
// createLocalServer() gives a WebSocket-like connect(token) speaking @pvp/net-protocol and a fetch()
// for @pvp/api-client; createBots() fills the island with simple bots.
export { createLocalServer, practiceHash, practiceCanClaim, PRACTICE_FORM_SINCE, TICK_MS } from './server.js';
export { createFakeSocket, CONNECTING, OPEN, CLOSING, CLOSED } from './socket.js';
export { createBots, BOT_DEFAULTS } from './bots.js';
