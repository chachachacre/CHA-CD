import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  CreditCard,
  Download,
  ExternalLink,
  X,
  FileText,
  Eye,
  AlertCircle,
  Maximize2,
  Globe
} from "lucide-react";
import {
  downloadFile,
  getDownloadEndpoint,
  isImageFile,
  isPdfFile,
  isGoogleDriveUrl,
  getGoogleDrivePreviewUrl,
  resolveViewUrl,
  cleanFileUrl
} from "../fileUtils";

interface RateCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawUrl?: string;
  fileName?: string;
  title?: string;
}

export default function RateCardModal({
  isOpen,
  onClose,
  rawUrl,
  fileName,
  title,
}: RateCardModalProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let active = true;

    const cleaned = cleanFileUrl(rawUrl);
    if (isOpen && cleaned) {
      setIsLoading(true);
      resolveViewUrl(cleaned)
        .then((url) => {
          if (active) {
            setResolvedUrl(url);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setResolvedUrl(cleaned);
            setIsLoading(false);
          }
        });
    } else {
      setResolvedUrl("");
      setIsLoading(false);
    }

    return () => {
      active = false;
    };
  }, [isOpen, rawUrl]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isImage = isImageFile(resolvedUrl, fileName);
  const isGDocs = isGoogleDriveUrl(resolvedUrl || rawUrl);
  const isPdf = isPdfFile(resolvedUrl, fileName) || isGDocs;
  const embedUrl = isGDocs
    ? getGoogleDrivePreviewUrl(resolvedUrl || rawUrl)
    : `${resolvedUrl}#toolbar=1&navpanes=0`;

  const displayTitle = title || "제작 단가표 (Rate Card)";
  const isRateCard = displayTitle.includes("단가") || displayTitle.toLowerCase().includes("rate");
  const displayFileName = fileName || (isPdf ? "Document.pdf" : isImage ? "Image.png" : "Document");

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadFile(resolvedUrl || rawUrl, displayFileName);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenExternal = () => {
    const target = cleanFileUrl(resolvedUrl || rawUrl);
    if (!target) return;

    if (isGoogleDriveUrl(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
    } else {
      // Use our server inline proxy so the browser displays the PDF directly in a fresh tab
      const viewEndpoint = getDownloadEndpoint(target, displayFileName, true);
      window.open(viewEndpoint, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6" id="rate-card-modal-container">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-neutral-950/85 backdrop-blur-sm cursor-pointer"
      />

      {/* Modal Box */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-5xl bg-white border border-neutral-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-black text-white shrink-0">
              {isRateCard ? <CreditCard className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-neutral-950 tracking-tight truncate">
                  {displayTitle}
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-100 text-neutral-600 font-bold border border-neutral-200 uppercase shrink-0">
                  {isGDocs ? "DRIVE" : isPdf ? "PDF" : isImage ? "IMAGE" : "LINK"}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 font-mono truncate">
                {displayFileName}
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold font-mono tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              title={`${displayTitle} 파일 다운로드`}
              id="modal-document-download-btn"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? "다운로드 중..." : "다운로드"}</span>
            </button>

            {/* Open in New Tab Button */}
            <button
              type="button"
              onClick={handleOpenExternal}
              className="p-2 text-neutral-600 hover:text-black border border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer"
              title="새 창에서 원본 열기"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer ml-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Viewer */}
        <div className="flex-1 overflow-auto bg-neutral-100 p-3 md:p-6 flex items-center justify-center min-h-[420px] max-h-[calc(92vh-80px)]">
          {isLoading ? (
            <div className="text-center space-y-3 py-16">
              <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-neutral-600">{displayTitle} 문서를 불러오는 중입니다...</p>
            </div>
          ) : !resolvedUrl ? (
            <div className="text-center space-y-3 py-16 bg-white p-8 border border-neutral-200 max-w-md">
              <AlertCircle className="w-8 h-8 text-neutral-400 mx-auto" />
              <p className="text-sm font-bold text-neutral-900">{displayTitle} 파일을 불러올 수 없습니다</p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                파일 링크가 올바르지 않거나 아직 등록되지 않았습니다. 관리자 콘솔에서 파일을 다시 업로드해 주세요.
              </p>
            </div>
          ) : isImage ? (
            /* Image Viewer */
            <div className="relative flex items-center justify-center w-full h-full">
              <img
                src={resolvedUrl}
                alt={displayTitle}
                className="max-w-full max-h-[calc(92vh-140px)] object-contain shadow-md bg-white border border-neutral-200"
              />
            </div>
          ) : isPdf ? (
            /* PDF or Google Drive Embedded Viewer */
            <div className="w-full h-[76vh] flex flex-col bg-white border border-neutral-200 shadow-sm overflow-hidden">
              <iframe
                src={embedUrl}
                title={`${displayTitle} Viewer`}
                className="w-full flex-1 border-0"
              />
              <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-xs">
                <span className="text-neutral-500 font-mono text-[11px]">
                  문서 뷰어가 브라우저에서 보이지 않을 경우 [새 창 열기] 또는 [다운로드] 버튼을 이용해 주세요.
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenExternal}
                    className="font-bold text-neutral-700 hover:text-black hover:underline inline-flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    새 창으로 열기
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="font-bold text-black hover:underline inline-flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    직접 파일 다운로드
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Generic / Web Document Viewer */
            <div className="text-center space-y-4 bg-white p-8 border border-neutral-200 max-w-md shadow-sm">
              <div className="p-3 bg-neutral-50 border border-neutral-200 inline-block mx-auto">
                {isRateCard ? (
                  <CreditCard className="w-8 h-8 text-neutral-900 mx-auto" />
                ) : (
                  <Globe className="w-8 h-8 text-neutral-900 mx-auto" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-base text-neutral-950">{displayTitle}</h4>
                <p className="text-xs text-neutral-500 font-mono truncate max-w-sm">{displayFileName}</p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="w-full py-3 bg-black text-white font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  웹 링크 새 창으로 열람하기
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full py-2.5 border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  파일 다운로드 시도
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export { RateCardModal as PdfViewerModal };
