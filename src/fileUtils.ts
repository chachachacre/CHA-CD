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
 * Checks if a URL is a Google Drive file link.
 */
export function isGoogleDriveUrl(url: string | undefined): boolean {
  if (!url) return false;
  const cleaned = cleanFileUrl(url).toLowerCase();
  return cleaned.includes("drive.google.com/file/d/") || cleaned.includes("docs.google.com");
}

/**
 * Converts a Google Drive file URL to an embeddable preview URL.
 */
export function getGoogleDrivePreviewUrl(url: string | undefined): string {
  if (!url) return "";
  const cleaned = cleanFileUrl(url);
  const match = cleaned.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return cleaned;
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
/**
 * Returns a server-proxied download URL that enforces RFC 5987 Content-Disposition
 */
export function getDownloadEndpoint(url: string | undefined, defaultFilename: string, inline = false): string {
  const cleanedUrl = cleanFileUrl(url);
  if (!cleanedUrl) return "";
  let safeFilename = defaultFilename || "document.pdf";
  if (isPdfFile(cleanedUrl, safeFilename) && !safeFilename.toLowerCase().endsWith(".pdf")) {
    safeFilename = `${safeFilename}.pdf`;
  }
  return `/api/download?url=${encodeURIComponent(cleanedUrl)}&name=${encodeURIComponent(safeFilename)}${inline ? "&inline=true" : ""}`;
}

/**
 * High-reliability cross-browser download trigger.
 * Handles sandboxed iframe restrictions (e.g. AI Studio preview), Google Drive links,
 * IndexedDB blobs, and remote Firebase Storage attachments.
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

  // 1. Google Drive URLs
  if (isGoogleDriveUrl(cleanedUrl)) {
    window.open(cleanedUrl, "_blank", "noopener,noreferrer");
    return true;
  }

  // 2. IndexedDB local protocol
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

  // 3. Blob or Data URL
  if (cleanedUrl.startsWith("blob:") || cleanedUrl.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = cleanedUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  // 4. Remote HTTP/HTTPS URL (e.g. Firebase Cloud Storage) OR Local /uploads/
  // In Chrome sandboxed iframe previews (like AI Studio preview), standard in-frame <a download>
  // clicks get blocked by Chrome's sandbox policy with "사이트에서 사용할 수 없는 파일" (File unavailable from site).
  // Opening the proxy endpoint in a top-level tab (_blank) escapes the iframe sandbox completely.
  // The server sends Content-Disposition: attachment, so Chrome downloads the file to disk and closes the new tab.
  if (cleanedUrl.startsWith("http://") || cleanedUrl.startsWith("https://") || cleanedUrl.startsWith("/uploads/")) {
    const downloadEndpoint = getDownloadEndpoint(cleanedUrl, safeFilename);

    try {
      const win = window.open(downloadEndpoint, "_blank");
      if (!win || win.closed || typeof win.closed === "undefined") {
        // Fallback if popup blocker intercepted window.open
        const link = document.createElement("a");
        link.href = downloadEndpoint;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      return true;
    } catch (apiErr) {
      console.warn("Proxy download failed, trying direct anchor fallback:", apiErr);
      window.open(cleanedUrl, "_blank", "noopener,noreferrer");
      return true;
    }
  }

  // Fallback
  window.open(cleanedUrl, "_blank", "noopener,noreferrer");
  return true;
}

