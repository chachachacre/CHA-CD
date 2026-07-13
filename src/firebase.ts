import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, writeBatch, getDocs } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from "firebase/storage";
import { PortfolioItem, ContactInfo, PortfolioSettings } from "./types";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

// Sync existing storage files to portfolio items and settings automatically
export async function syncStorageUrlsToFirestore(
  items: PortfolioItem[],
  onUpdateItems: (items: PortfolioItem[]) => Promise<void>
): Promise<{ updatedItems: PortfolioItem[]; count: number }> {
  try {
    const videosRef = ref(storage, "videos");
    const thumbsRef = ref(storage, "thumbnails");

    // List all videos
    let videoFiles: any[] = [];
    try {
      const res = await listAll(videosRef);
      videoFiles = res.items;
    } catch (e) {
      console.warn("Failed to list videos from Storage:", e);
    }

    // List all thumbnails
    let thumbFiles: any[] = [];
    try {
      const res = await listAll(thumbsRef);
      thumbFiles = res.items;
    } catch (e) {
      console.warn("Failed to list thumbnails from Storage:", e);
    }

    const updatedItems = [...items];
    let changeCount = 0;

    // Map videos based on prefix (e.g. "2_" or "178348363182_")
    for (const fileRef of videoFiles) {
      const name = fileRef.name;
      const underscoreIdx = name.indexOf("_");
      if (underscoreIdx !== -1) {
        const itemId = name.substring(0, underscoreIdx);
        const itemIdx = updatedItems.findIndex((item) => item.id === itemId);
        if (itemIdx !== -1) {
          const downloadUrl = await getDownloadURL(fileRef);
          if (updatedItems[itemIdx].videoUrl !== downloadUrl) {
            updatedItems[itemIdx].videoUrl = downloadUrl;
            changeCount++;
          }
        }
      }
    }

    // Map thumbnails based on prefix
    for (const fileRef of thumbFiles) {
      const name = fileRef.name;
      const underscoreIdx = name.indexOf("_");
      if (underscoreIdx !== -1) {
        const itemId = name.substring(0, underscoreIdx);
        const itemIdx = updatedItems.findIndex((item) => item.id === itemId);
        if (itemIdx !== -1) {
          const downloadUrl = await getDownloadURL(fileRef);
          if (updatedItems[itemIdx].thumbnailUrl !== downloadUrl) {
            updatedItems[itemIdx].thumbnailUrl = downloadUrl;
            changeCount++;
          }
        }
      }
    }

    if (changeCount > 0) {
      await onUpdateItems(updatedItems);
    }

    return { updatedItems, count: changeCount };
  } catch (err) {
    console.error("Storage syncing failed:", err);
    return { updatedItems: items, count: 0 };
  }
}

// Sync PDF files from storage
export async function syncPdfUrlToFirestore(
  settings: PortfolioSettings,
  onUpdateSettings: (settings: PortfolioSettings) => Promise<void>
): Promise<{ updatedSettings: PortfolioSettings; changed: boolean }> {
  try {
    const pdfRef = ref(storage, "pdf");
    let pdfFiles: any[] = [];
    try {
      const res = await listAll(pdfRef);
      pdfFiles = res.items;
    } catch (e) {
      console.warn("Failed to list PDFs from Storage:", e);
    }

    if (pdfFiles.length > 0) {
      // 1. If current filename is still in storage, preserve it
      let fileRef = pdfFiles.find((item) => item.name === settings.pdfFileName);

      // 2. If current filename does not exist, find the newest file in storage by updated/created time
      if (!fileRef) {
        try {
          const filesWithMeta = await Promise.all(
            pdfFiles.map(async (file) => {
              try {
                const meta = await getMetadata(file);
                const timeStr = meta.updated || meta.timeCreated || "0";
                return { file, time: new Date(timeStr).getTime() };
              } catch {
                return { file, time: 0 };
              }
            })
          );
          // Sort by newest first
          filesWithMeta.sort((a, b) => b.time - a.time);
          fileRef = filesWithMeta[0].file;
        } catch (metaErr) {
          console.warn("Failed to sort PDFs by metadata, falling back to first file:", metaErr);
          fileRef = pdfFiles[0];
        }
      }

      if (fileRef) {
        const downloadUrl = await getDownloadURL(fileRef);
        if (settings.pdfUrl !== downloadUrl || settings.pdfFileName !== fileRef.name) {
          const updated = {
            ...settings,
            pdfUrl: downloadUrl,
            pdfFileName: fileRef.name,
          };
          await onUpdateSettings(updated);
          return { updatedSettings: updated, changed: true };
        }
      }
    }
    return { updatedSettings: settings, changed: false };
  } catch (err) {
    console.error("PDF Storage syncing failed:", err);
    return { updatedSettings: settings, changed: false };
  }
}

// Helper to upload a file to Firebase Storage and get download URL
export async function uploadToStorage(path: string, file: File): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadUrl = await getDownloadURL(snapshot.ref);
  return downloadUrl;
}

// Helper to delete a file from Firebase Storage
export async function deleteFromStorage(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  try {
    await deleteObject(storageRef);
  } catch (err) {
    console.error("Failed to delete from storage:", path, err);
  }
}

// Sync all portfolio items to Firestore (handles inserts, updates, deletions, and ordering)
export async function syncAllPortfolioItemsToFirestore(items: PortfolioItem[]): Promise<void> {
  const snapshot = await getDocs(collection(db, "portfolio_items"));
  const existingIds = new Set(snapshot.docs.map(docSnap => docSnap.id));
  const newIds = new Set(items.map(item => item.id));

  const batch = writeBatch(db);

  // Delete items in Firestore that are not in the new list
  existingIds.forEach(id => {
    if (!newIds.has(id)) {
      batch.delete(doc(db, "portfolio_items", id));
    }
  });

  // Set/update all items in the new list
  items.forEach(item => {
    batch.set(doc(db, "portfolio_items", item.id), item);
  });

  await batch.commit();
}

// Save contact info to Firestore
export async function saveContactInfoToFirestore(contact: ContactInfo): Promise<void> {
  await setDoc(doc(db, "configs", "contact"), contact);
}

// Save portfolio settings to Firestore
export async function savePortfolioSettingsToFirestore(settings: PortfolioSettings): Promise<void> {
  await setDoc(doc(db, "configs", "settings"), settings);
}

