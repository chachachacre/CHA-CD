import { useState, useEffect } from "react";

const DB_NAME = "CHA_CD_Database";
const STORE_NAME = "portfolio_assets";
const PDF_KEY = "portfolio_pdf";

export function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePDF(file: File): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(file, PDF_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPDF(): Promise<File | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(PDF_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("Failed to fetch PDF from IndexedDB", e);
    return null;
  }
}

export async function saveMediaFile(key: string, file: File): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(file, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMediaFile(key: string): Promise<File | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error(`Failed to fetch media key ${key} from IndexedDB`, e);
    return null;
  }
}

export async function deleteMediaFile(key: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deletePDF(): Promise<void> {
  return deleteMediaFile(PDF_KEY);
}

export function useMediaUrl(src: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (src && src.startsWith("indexeddb:")) {
      return undefined;
    }
    return src;
  });

  useEffect(() => {
    if (!src) {
      setUrl(undefined);
      return;
    }

    if (src.startsWith("indexeddb:")) {
      setUrl(undefined);
      let active = true;
      let objectUrl: string | null = null;

      const load = async () => {
        const key = src.replace("indexeddb:", "");
        const file = await getMediaFile(key);
        if (active) {
          if (file) {
            objectUrl = URL.createObjectURL(file);
            setUrl(objectUrl);
          } else {
            setUrl(undefined);
          }
        }
      };

      load();

      return () => {
        active = false;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    } else {
      setUrl(src);
    }
  }, [src]);

  return url;
}
