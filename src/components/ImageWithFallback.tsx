import { useState } from 'react';
import { Smartphone } from 'lucide-react';

interface ImageWithFallbackProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function ImageWithFallback({
  src,
  alt,
  className = '',
  loading = 'lazy',
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-sky-50/40 to-slate-100 text-slate-400 p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Smartphone className="w-8 h-8 mb-2 text-blue-600/40" />
        <span className="text-xs font-medium text-slate-500 line-clamp-2 max-w-[140px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
