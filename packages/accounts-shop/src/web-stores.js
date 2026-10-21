// Stores with no Node imports, so they work in the browser too.
//   load()      -> all records as a plain object (called once at start)
//   save(data)  -> ask for `data` to be written
//   flush()     -> Promise, resolves once every pending write is done

/** Keeps everything in memory. save() stores a copy right away, so a later load() sees it. */
export function createMemoryStore(initial = {}) {
  let saved = structuredClone(initial);
  return {
    load: () => structuredClone(saved),
    save(data) { saved = structuredClone(data); },
    flush: () => Promise.resolve(),
  };
}

/**
 * Keeps everything as JSON under one key of a localStorage-like object (getItem/setItem).
 * Every storage call is wrapped in try/catch: if storage is blocked or full (private mode),
 * the data is still kept in memory for this page. A broken saved value starts empty.
 */
export function createWebStorageStore(storage, key = 'pvp.accounts') {
  const memory = createMemoryStore();
  let loaded = false;
  return {
    load() {
      if (!loaded) {
        loaded = true;
        let data = null;
        try {
          const text = storage?.getItem(key);
          data = text ? JSON.parse(text) : null;
        } catch { /* blocked or broken: start empty */ }
        memory.save(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
      }
      return memory.load();
    },
    save(data) {
      memory.save(data);
      try { storage?.setItem(key, JSON.stringify(data)); } catch { /* blocked or full: memory only */ }
    },
    flush: () => Promise.resolve(),
  };
}
