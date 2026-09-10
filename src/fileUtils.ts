import { getMediaFile } from "./pdfStorage";

/**
 * Checks if a file or URL corresponds to an image format.
 */
export function isImageFile(urlOrName: string | undefined, fallbackName?: string): boolean {
  if (!urlOrName && !fallbackName) return false;
  const target = `${urlOrName || ""} ${fallbackName || ""}`.toLowerCase();
  
  if (target.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif)($|\?|#|\s)/i.test(target);
}

/**
 * Checks if a file or URL corresponds to a PDF document.
 */
export function isPdfFile(urlOrName: string | undefined, fallbackName?: string): boolean {
  if (!urlOrName && !fallbackName) return false;
  const target = `${urlOrName || ""} ${fallbackName || ""}`.toLowerCase();
  
  if (target.startsWith("data:application/pdf")) return true;
  return /\.pdf($|\?|#|\s)/i.test(target);
}

/**
 * Resolves any URL (including local indexeddb: keys) to a displayable browser URL.
 */
export async function resolveViewUrl(url: string | undefined): Promise<string> {
  if (!url) return "";
  if (url.startsWith("indexeddb:")) {
    const key = url.replace("indexeddb:", "");
    try {
      const file = await getMediaFile(key);
      if (file) {
        return URL.createObjectURL(file);
      }
    } catch (e) {
      console.warn("Failed to resolve indexeddb file URL:", e);
    }
    return "";
  }
  return url;
}

/**
 * Universal, bulletproof file downloader for all environments (including sandboxed iframes).
 * Automatically handles IndexedDB blobs, Server API attachments, CORS fetched blobs, and fallbacks.
 */
export async function downloadFile(url: string | undefined, defaultFilename: string): Promise<boolean> {
  if (!url) {
    alert("다운로드할 파일이 등록되지 않았습니다.");
    return false;
  }

  const safeFilename = defaultFilename || "CHA_CD_Rate_Card";

  // 1. IndexedDB local protocol
  if (url.startsWith("indexeddb:")) {
    const key = url.replace("indexeddb:", "");
    try {
      const file = await getMediaFile(key);
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeFilename.includes(".") ? safeFilename : `${safeFilename}.${file.name.split(".").pop() || "pdf"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        return true;
      } else {
        alert("로컬 저장소에 파일 데이터가 없습니다. 파일을 다시 업로드해 주세요.");
        return false;
      }
    } catch (err) {
      console.error("IndexedDB download failed:", err);
      alert("파일 다운로드 중 오류가 발생했습니다.");
      return false;
    }
  }

  // 2. Server uploads directory - use dedicated forced-download API
  if (url.startsWith("/uploads/")) {
    try {
      const downloadEndpoint = `/api/download?file=${encodeURIComponent(url)}&name=${encodeURIComponent(safeFilename)}`;
      const a = document.createElement("a");
      a.href = downloadEndpoint;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch (e) {
      console.warn("Server /api/download attempt failed, continuing with direct fetch:", e);
    }
  }

  // 3. Blob or Data URL
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  // 4. Remote HTTP/HTTPS URL (e.g. Firebase Cloud Storage)
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      // Attempt CORS fetch to convert to blob and trigger real browser download
      const response = await fetch(url, { mode: "cors" });
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        return true;
      }
    } catch (corsErr) {
      console.warn("Direct blob fetch failed (likely CORS), falling back to anchor trigger:", corsErr);
    }

    // Direct anchor fallback
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  // Fallback
  window.open(url, "_blank");
  return true;
}
