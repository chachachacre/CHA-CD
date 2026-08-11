import React, { useState } from "react";
import { useMediaUrl } from "../pdfStorage";
import { ImageOff, Sparkles } from "lucide-react";

interface ResolvedImageProps {
  src: string | undefined;
  className?: string;
  alt?: string;
  loading?: "lazy" | "eager";
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  [key: string]: any;
}

export function ResolvedImage({ src, className, alt, loading, referrerPolicy, ...props }: ResolvedImageProps) {
  const resolvedSrc = useMediaUrl(src);
  const [hasError, setHasError] = useState(false);

  if (!resolvedSrc || hasError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-neutral-900 text-neutral-500 p-4 select-none ${className || "w-full h-full"}`}>
        <Sparkles className="w-6 h-6 text-neutral-600 mb-1 animate-pulse" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 font-bold">{alt || "CHA CD WORK"}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      className={className}
      alt={alt}
      loading={loading}
      referrerPolicy={referrerPolicy}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}

