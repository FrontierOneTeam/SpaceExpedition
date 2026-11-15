import { type SaveStorage, SAVE_KEY,loadSave } from './save.ts';
/** IndexedDB-backed storage with a synchronous facade for the existing controller. */
export async function openSaveStorage(fallback: SaveStorage | null): Promise<SaveStorage | null> {
  if (typeof indexedDB === 'undefined') return fallback;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('outpost-builder', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saves');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Save database is blocked'));
    });
    const values = new Map<string, string>();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readonly');
      const request = tx.objectStore('saves').openCursor();
      request.onsuccess = () => { const c = request.result; if(c){values.set(String(c.key), String(c.value));c.continue();} };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    if (!values.has(SAVE_KEY)) { const old = fallback?.getItem(SAVE_KEY); if(old) values.set(SAVE_KEY,old); }
    const primary=values.get(SAVE_KEY);
    if(primary){try{const parsed=JSON.parse(primary);if(parsed.outpost&&!loadSave({getItem:()=>primary,setItem:()=>{},removeItem:()=>{}}).outpost)throw new Error('Damaged save');}catch{const recovery=values.get('recovery');if(recovery&&loadSave({getItem:()=>recovery,setItem:()=>{},removeItem:()=>{}}).outpost)values.set(SAVE_KEY,recovery);}}
    return {
      getItem: key => values.get(key) ?? null,
      setItem(key, value) {
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        if (key === SAVE_KEY && values.has(key)) store.put(values.get(key), 'recovery');
        store.put(value, key);
        values.set(key, value);
        tx.onabort = tx.onerror = () => window.dispatchEvent(new Event('outpost-save-error'));
      },
      removeItem(key) { values.delete(key); db.transaction('saves','readwrite').objectStore('saves').delete(key); },
    };
  } catch { return fallback; }
}
