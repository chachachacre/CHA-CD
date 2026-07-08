import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, Play, Loader2, VideoOff, Info, Clock, Building } from "lucide-react";
import { PortfolioItem } from "../types";
import { useMediaUrl } from "../pdfStorage";

interface VideoModalProps {
  item: PortfolioItem | null;
  onClose: () => void;
}

export default function VideoModal({ item, onClose }: VideoModalProps) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const resolvedVideoUrl = useMediaUrl(item?.videoUrl);

  useEffect(() => {
    if (item) {
      setLoading(true);
      setHasError(false);
      // Prevent body scrolling
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [item]);

  useEffect(() => {
    if (resolvedVideoUrl) {
      setHasError(false);
    }
  }, [resolvedVideoUrl]);

  if (!item) return null;

  // Helper to parse YouTube IDs
  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Helper to parse Vimeo IDs
  const getVimeoId = (url: string) => {
    const regExp = /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/;
    const match = url.match(regExp);
    return match && match[1] ? match[1] : null;
  };

  const ytId = getYouTubeId(item.videoUrl);
  const vimeoId = getVimeoId(item.videoUrl);

  const isEmbed = !!(ytId || vimeoId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 lg:p-10">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-neutral-950/90 backdrop-blur-md"
        id="video-modal-backdrop"
      />

      {/* Modal Content container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-none overflow-hidden shadow-2xl flex flex-col md:flex-row h-auto max-h-[90vh] z-10"
        id="video-modal-content"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2.5 bg-neutral-950/80 hover:bg-neutral-800 text-white hover:text-neutral-300 rounded-none transition-all border border-neutral-800"
          id="close-modal-button"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Video Column (Left/Top) */}
        <div className="w-full md:w-[65%] bg-black aspect-video md:aspect-auto md:h-[650px] flex items-center justify-center relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 z-10">
              <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
            </div>
          )}

          {hasError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 text-neutral-400 p-4 text-center">
              <VideoOff className="w-12 h-12 text-neutral-600 mb-3" />
              <p className="text-sm font-medium text-neutral-300 mb-1">영상을 재생할 수 없습니다</p>
              <p className="text-xs text-neutral-500 max-w-xs">
                유효한 영상 URL인지 확인해 주세요. 혹은 브라우저의 미디어 정책에 의해 차단되었을 수 있습니다.
              </p>
            </div>
          ) : ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
              title={item.title}
              className="w-full h-full border-0 absolute inset-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setHasError(true);
              }}
            />
          ) : vimeoId ? (
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1&byline=0&portrait=0`}
              title={item.title}
              className="w-full h-full border-0 absolute inset-0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setHasError(true);
              }}
            />
          ) : (
            <video
              src={resolvedVideoUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain absolute inset-0"
              onLoadedData={() => setLoading(false)}
              onCanPlay={() => setLoading(false)}
              onError={() => {
                // Only show error if the URL is loaded and fails
                if (resolvedVideoUrl) {
                  setLoading(false);
                  setHasError(true);
                }
              }}
            />
          )}
        </div>

        {/* Details Column (Right/Bottom) */}
        <div className="w-full md:w-[35%] p-6 md:p-8 flex flex-col justify-between bg-neutral-900 overflow-y-auto text-white md:h-[650px]">
          <div className="space-y-6">
            <div>
              <span className="inline-block text-[10px] font-bold tracking-widest text-neutral-400 uppercase bg-neutral-800 px-2.5 py-1 rounded-none mb-3">
                {item.title}
              </span>
              <h3 className="text-2xl font-semibold font-display tracking-tight leading-snug">
                {item.client}
              </h3>
            </div>

            <div className="h-px bg-neutral-800" />

            <div className="space-y-4">
              <div className="flex items-center text-sm text-neutral-400 gap-3">
                <Building className="w-4 h-4 text-neutral-500 shrink-0" />
                <div>
                  <p className="text-xs text-neutral-500">Client / Brand</p>
                  <p className="font-medium text-neutral-200">{item.client.split(" - ")[0] || item.client}</p>
                </div>
              </div>

              <div className="flex items-center text-sm text-neutral-400 gap-3">
                <Clock className="w-4 h-4 text-neutral-500 shrink-0" />
                <div>
                  <p className="text-xs text-neutral-500">Production Year</p>
                  <p className="font-medium text-neutral-200">{item.year}년</p>
                </div>
              </div>
            </div>

            <div className="h-px bg-neutral-800" />

            {item.description && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-neutral-400 font-medium">
                  <Info className="w-3.5 h-3.5" />
                  <span>PROJECT DESCRIPTION</span>
                </div>
                <p className="text-sm leading-relaxed text-neutral-300 font-light whitespace-pre-line">
                  {item.description}
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-neutral-800 text-center md:text-left">
            <p className="text-[10px] tracking-wider text-neutral-500 uppercase font-mono">
              CHA CD • Creative Director
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
