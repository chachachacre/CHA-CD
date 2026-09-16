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
 * Detects whether the current runtime environment has an active Node/Express backend (/api/health)
 * or if it's hosted statically (e.g. Netlify, Vercel static, GitHub Pages).
 */
async function checkHasServerProxy(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;

  // Well-known static hosts that do not run our Express server.ts unless functions are configured
  if (host.includes("netlify.app") || host.includes("github.io")) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("/api/health", { method: "GET", cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
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
        const blob = await directRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return true;
      }
    } catch {
      // Direct CORS fetch failed or blocked; proceed to proxy or direct browser navigation
    }

    // Attempt B: Check if server proxy (/api/download) is truly available
    const hasProxy = await checkHasServerProxy();
    if (hasProxy) {
      const downloadEndpoint = getDownloadEndpoint(cleanedUrl, safeFilename);
      try {
        const win = window.open(downloadEndpoint, "_blank");
        if (!win || win.closed || typeof win.closed === "undefined") {
          const link = document.createElement("a");
          link.href = downloadEndpoint;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        return true;
      } catch (proxyErr) {
        console.warn("Proxy launch failed:", proxyErr);
      }
    }

    // Attempt C: Static Hosting Fallback (Netlify / Vercel / GitHub Pages)
    // On static deployments, directly open the verified Cloud document in a new tab.
    // The browser's native PDF reader opens with complete controls (view, save, print)
    // and NEVER hits Netlify's 404 Page Not Found error!
    window.open(cleanedUrl, "_blank", "noopener,noreferrer");
    return true;
  }

  // Fallback
  window.open(cleanedUrl, "_blank", "noopener,noreferrer");
  return true;
}

