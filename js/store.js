/* ==========================================================================
   STORE: the library lives in the browser (IndexedDB), so tracks, their
   analysis, hot cues and BPM fixes survive reloads.
   ========================================================================== */
const Store = (() => {
    const DB_NAME = 'webdj';
    const DB_VERSION = 2; // 2: + 'pads' (your own sounds on the sampler pads)
    let dbPromise = null;

    function db() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = () => {
                    const d = req.result;
                    if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
                    if (!d.objectStoreNames.contains('pads')) d.createObjectStore('pads', { keyPath: 'pad' });
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    }

    async function run(mode, fn, name = 'tracks') {
        const d = await db();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(name, mode);
            const req = fn(tx.objectStore(name));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    let persistAsked = false;
    return {
        all: () => run('readonly', s => s.getAll()),
        put: (record) => {
            // Ask the browser not to evict the library when space runs low
            if (!persistAsked && navigator.storage && navigator.storage.persist) { persistAsked = true; navigator.storage.persist().catch(() => {}); }
            return run('readwrite', s => s.put(record));
        },
        remove: (id) => run('readwrite', s => s.delete(id)),
        clear: () => run('readwrite', s => s.clear()),
        // Your own samples: { pad, name, bytes }
        pads: {
            all: () => run('readonly', s => s.getAll(), 'pads'),
            put: (record) => run('readwrite', s => s.put(record), 'pads'),
            remove: (pad) => run('readwrite', s => s.delete(pad), 'pads'),
        },
        usage: async () => {
            try { return navigator.storage && navigator.storage.estimate ? (await navigator.storage.estimate()).usage : null; } catch (e) { return null; }
        },
    };
})();
