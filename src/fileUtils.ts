import { getMediaFile } from "./pdfStorage";

/**
 * Strips browser extension prefixes (e.g. Adobe Acrobat "chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/https://...")
 * and normalizes URLs.
 */
export function cleanFileUrl(url: string | undefined | null): string {
  if (!url) return "";
  let cleaned = url.trim();

  // Strip wrapping quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip browser extension prefixes (e.g. Adobe Acrobat extension: chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/https://...)
  if (cleaned.includes("chrome-extension://")) {
    cleaned = cleaned.replace(/^chrome-extension:\/\/[^/]+\//i, "");
  }

  // Handle edge case where https:// or http:// was duplicated
  const httpIdx = cleaned.indexOf("https://");
  if (httpIdx > 0 && cleaned.startsWith("chrome-extension:")) {
    cleaned = cleaned.substring(httpIdx);
  }

  return cleaned;
}

/**
 * Checks if a file or URL corresponds to an image format.
 */
export function isImageFile(urlOrName: string | undefined, fallbackName?: string): boolean {
  if (!urlOrName && !fallbackName) return false;
  const target = cleanFileUrl(`${urlOrName || ""} ${fallbackName || ""}`).toLowerCase();
  
  if (target.startsWith("data:image/")) return true;
  return /\.(png|jpe?g|webp|gif|svg|avif)($|\?|#|\s)/i.test(target);
}

/**
 * Checks if a file or URL corresponds to a PDF document.
 */
export function isPdfFile(urlOrName: string | undefined, fallbackName?: string): boolean {
  if (!urlOrName && !fallbackName) return false;
  const target = cleanFileUrl(`${urlOrName || ""} ${fallbackName || ""}`).toLowerCase();
  
  if (target.startsWith("data:application/pdf")) return true;
  return /\.pdf($|\?|#|\s)/i.test(target);
}

/**
 * Resolves any URL (including local indexeddb: keys and extension URLs) to a displayable browser URL.
 */
export async function resolveViewUrl(url: string | undefined): Promise<string> {
  if (!url) return "";
  const cleaned = cleanFileUrl(url);

  if (cleaned.startsWith("indexeddb:")) {
    const key = cleaned.replace("indexeddb:", "");
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
  return cleaned;
}

/**
 * Universal, bulletproof file downloader for all environments (including sandboxed iframes).
 * Leverages server-side proxying (/api/download) for remote Cloud and local files to ensure
 * genuine file attachments without CORS or extension corruption.
 */
export async function downloadFile(url: string | undefined, defaultFilename: string): Promise<boolean> {
  const cleanedUrl = cleanFileUrl(url);
  if (!cleanedUrl) {
    alert("다운로드할 파일이 등록되지 않았습니다.");
    return false;
  }

  let safeFilename = defaultFilename || "CHA_CD_Rate_Card.pdf";
  if (isPdfFile(cleanedUrl, safeFilename) && !safeFilename.toLowerCase().endsWith(".pdf")) {
    safeFilename = `${safeFilename}.pdf`;
  }

  // 1. IndexedDB local protocol
  if (cleanedUrl.startsWith("indexeddb:")) {
    const key = cleanedUrl.replace("indexeddb:", "");
    try {
      const file = await getMediaFile(key);
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
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

  // 2. Blob or Data URL
  if (cleanedUrl.startsWith("blob:") || cleanedUrl.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = cleanedUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  // 3. Remote HTTP/HTTPS URL (e.g. Firebase Cloud Storage) OR Local /uploads/
  // Use our high-reliability server-side /api/download endpoint to ensure the OS receives
  // the exact intact file with RFC 5987 Korean headers and bypasses any Adobe browser extension interceptors!
  if (cleanedUrl.startsWith("http://") || cleanedUrl.startsWith("https://") || cleanedUrl.startsWith("/uploads/")) {
    try {
      const downloadEndpoint = `/api/download?url=${encodeURIComponent(cleanedUrl)}&file=${encodeURIComponent(cleanedUrl)}&name=${encodeURIComponent(safeFilename)}`;
      
      const link = document.createElement("a");
      link.href = downloadEndpoint;
      link.setAttribute("download", safeFilename);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch (apiErr) {
      console.warn("Proxy download failed, trying direct anchor fallback:", apiErr);
    }

    // Direct fallback
    const fallbackLink = document.createElement("a");
    fallbackLink.href = cleanedUrl;
    fallbackLink.download = safeFilename;
    fallbackLink.target = "_blank";
    fallbackLink.rel = "noopener noreferrer";
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);
    return true;
  }

  // Fallback
  window.open(cleanedUrl, "_blank");
  return true;
}

