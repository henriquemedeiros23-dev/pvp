// A WebSocket-like object that talks to a server in the same page.
// It has what the game uses from a real WebSocket: send, close, readyState, onopen, onmessage,
// onclose, onerror (plus addEventListener). Everything arrives a moment later (through `defer`),
// like on a network, so the order of events is the same as with a real socket.

export const CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3;

/**
 * @param {object} o
 * @param {Function} o.defer      runs a callback later (e.g. a microtask)
 * @param {Function} o.accept     () -> true to open, or { code, reason } to close right away
 * @param {Function} o.receive    (text) -> the server gets a message from the page
 * @param {Function} o.closed     () -> the server learns that the connection is gone
 * The returned socket also has deliver(text): the server sends a message to the page.
 */
export function createFakeSocket({ defer, accept, receive, closed }) {
  const listeners = { open: [], message: [], close: [], error: [] };
  let serverKnows = false; // the server side was told about the open connection

  const ws = {
    CONNECTING, OPEN, CLOSING, CLOSED,
    readyState: CONNECTING,
    url: 'local://practice',
    onopen: null, onmessage: null, onclose: null, onerror: null,
    addEventListener(type, fn) { listeners[type]?.push(fn); },
    removeEventListener(type, fn) { const l = listeners[type]; if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); },

    /** Page -> server. Throws while still connecting (like a real WebSocket); dropped once closed. */
    send(text) {
      if (ws.readyState === CONNECTING) throw new Error('Still connecting');
      if (ws.readyState !== OPEN) return;
      const data = String(text);
      defer(() => { if (serverKnows) receive(data); });
    },

    close(code = 1000, reason = '') {
      if (ws.readyState === CLOSING || ws.readyState === CLOSED) return;
      ws.readyState = CLOSING;
      defer(() => finish(code, reason));
    },

    /** Server -> page. Dropped if the socket is not open. */
    deliver(text) {
      if (ws.readyState !== OPEN) return;
      defer(() => { if (ws.readyState === OPEN) emit('message', { type: 'message', data: text }); });
    },
  };

  function emit(type, ev) {
    const on = ws['on' + type];
    if (typeof on === 'function') on.call(ws, ev);
    for (const fn of [...listeners[type]]) fn.call(ws, ev);
  }

  function finish(code, reason) {
    if (ws.readyState === CLOSED) return;
    ws.readyState = CLOSED;
    if (serverKnows) { serverKnows = false; closed(); }
    emit('close', { type: 'close', code, reason, wasClean: code === 1000 });
  }

  defer(() => {
    if (ws.readyState !== CONNECTING) return; // closed before it opened
    const ok = accept();
    if (ok !== true) { finish(ok?.code ?? 1006, ok?.reason ?? ''); return; }
    serverKnows = true;
    ws.readyState = OPEN;
    emit('open', { type: 'open' });
  });

  return ws;
}
