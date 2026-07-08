import React from "react";
import { useMediaUrl } from "../pdfStorage";

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
  return (
    <img
      src={resolvedSrc}
      className={className}
      alt={alt}
      loading={loading}
      referrerPolicy={referrerPolicy}
      {...props}
    />
  );
}
