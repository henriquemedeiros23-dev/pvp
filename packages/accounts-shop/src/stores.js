// Storage for accounts. Every store has the same small interface:
//   load()      -> all records as a plain object (called once at start)
//   save(data)  -> ask for `data` to be written (writes may be delayed and grouped)
//   flush()     -> Promise, resolves once every pending write is done
import fs from 'node:fs';
import path from 'node:path';

// The memory and localStorage stores have no Node imports (the browser entry uses them too).
export { createMemoryStore, createWebStorageStore } from './web-stores.js';

/**
 * Keeps everything in one JSON file. Writes are delayed by saveDelayMs and grouped,
 * then written to a temp file which is renamed over the real one, so a crash
 * in the middle of a write can't leave a broken file behind.
 * Call flush() before shutting down.
 */
export function createJsonFileStore(file, { saveDelayMs = 1000 } = {}) {
  const tmp = `${file}.tmp`;
  let pending = null; // data waiting to be written
  let timer = null;

  function writeNow() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending) return;
    const json = JSON.stringify(pending, null, 1);
    pending = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, json);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  }

  return {
    load() {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return {};
        throw err;
      }
      // A broken file is an error on purpose: starting empty would overwrite everyone's accounts.
      return JSON.parse(text);
    },
    save(data) {
      pending = data;
      if (timer) return;
      timer = setTimeout(writeNow, saveDelayMs);
      timer.unref?.();
    },
    flush() {
      try {
        writeNow();
        return Promise.resolve();
      } catch (err) {
        return Promise.reject(err);
      }
    },
  };
}
