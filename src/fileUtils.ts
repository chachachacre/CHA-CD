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

  // Handle typo in stored filename (%E1%85%A5 -> %E1%85%A9 for "포트폴리오")
  if (cleaned.includes("%E1%85%A5_2026ver") || cleaned.includes("포트폴리어")) {
    cleaned = cleaned.replace(/%E1%85%A5_2026ver/g, "%E1%85%A9_2026ver").replace(/포트폴리어/g, "포트폴리오");
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
 * Triggers a direct file download in the browser by creating an anchor element with a Blob URL.
 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
}

/**
 * High-reliability cross-platform download trigger.
 * Handles static hosts (Netlify, GitHub Pages), sandboxed iframes, Google Drive links,
 * IndexedDB blobs, and remote Firebase Storage files.
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
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
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
  if (cleanedUrl.startsWith("http://") || cleanedUrl.startsWith("https://") || cleanedUrl.startsWith("/uploads/")) {
    // Attempt A: Direct client-side fetch (instant zero-hop download if CORS permits)
    try {
      const directRes = await fetch(cleanedUrl);
      if (directRes.ok) {
        const contentType = directRes.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          const blob = await directRes.blob();
          triggerBlobDownload(blob, safeFilename);
          return true;
        }
      }
    } catch {
      // Direct CORS fetch failed or blocked; proceed to proxy or direct browser navigation
    }

    // Attempt B: If it is Firebase Storage, fetch through same-origin /_fb_storage/ proxy
    // This works on Netlify via _redirects AND on Express backend via server.ts
    if (cleanedUrl.includes("firebasestorage.googleapis.com")) {
      try {
        const proxyUrl = cleanedUrl.replace(/^https?:\/\/firebasestorage\.googleapis\.com/, "/_fb_storage");
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          // Strict check: Ensure Netlify/SPA did NOT return index.html
          if (!contentType.includes("text/html")) {
            const blob = await res.blob();
            triggerBlobDownload(blob, safeFilename);
            return true;
          }
        }
      } catch (proxyErr) {
        console.warn("Storage proxy fetch failed:", proxyErr);
      }
    }

    // Attempt C: Bulletproof Local Static Bundle Fallback (Netlify / Static CDN / Offline)
    // Both files exist in /uploads/ and / in the build output, guaranteeing 100% successful direct downloads
    const isPortfolio = safeFilename.includes("포트폴리오") || safeFilename.toLowerCase().includes("portfolio");
    const isRateCard = safeFilename.includes("단가") || safeFilename.toLowerCase().includes("rate");
    const localFallbacks = isPortfolio
      ? ["/uploads/CHA_CD_Portfolio_2026.pdf", "/CHA_CD_Portfolio_2026.pdf"]
      : isRateCard
      ? ["/uploads/CHA_CD_Rate_Card_2026.pdf", "/CHA_CD_Rate_Card_2026.pdf"]
      : [];

    for (const fallbackPath of localFallbacks) {
      try {
        const fbRes = await fetch(fallbackPath);
        if (fbRes.ok) {
          const contentType = fbRes.headers.get("content-type") || "";
          if (!contentType.includes("text/html")) {
            const blob = await fbRes.blob();
            triggerBlobDownload(blob, safeFilename);
            return true;
          }
        }
      } catch {}
    }

    // Attempt D: Safe direct opening of verified Cloud Storage URL
    // Never open relative paths that could route to index.html
    if (cleanedUrl.startsWith("https://firebasestorage.googleapis.com/")) {
      window.open(cleanedUrl, "_blank", "noopener,noreferrer");
      return true;
    }

    return false;
  }

  // 5. Local /uploads/ files
  if (cleanedUrl.startsWith("/uploads/") || cleanedUrl.startsWith("/")) {
    try {
      const res = await fetch(cleanedUrl);
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          const blob = await res.blob();
          triggerBlobDownload(blob, safeFilename);
          return true;
        }
      }
    } catch {}

    const a = document.createElement("a");
    a.href = cleanedUrl;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }

  // Fallback: only open absolute https links to prevent SPA loops
  if (cleanedUrl.startsWith("https://") || cleanedUrl.startsWith("http://")) {
    window.open(cleanedUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

