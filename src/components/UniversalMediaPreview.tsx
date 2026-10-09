import { Download, ExternalLink } from 'lucide-react';
import { resolveMediaUrl, type MediaKind } from '@/lib/mediaResolver';

interface UniversalMediaPreviewProps {
  url: string;
  kind: MediaKind;
  title?: string;
  className?: string;
  mediaClassName?: string;
  controlsClassName?: string;
  showDownload?: boolean;
}

/** Shared renderer for media links handled by the universal URL resolver. */
export function UniversalMediaPreview({ url, kind, title = 'Media preview', className = '', mediaClassName = '', controlsClassName = '', showDownload = false }: UniversalMediaPreviewProps) {
  const media = resolveMediaUrl(url, kind);
  if (!media) return <p className="text-xs text-rose-300">This media link is invalid. Use an http or https sharing URL.</p>;

  return (
    <div className={className}>
      {media.render === 'video' && <video className={mediaClassName || 'h-auto w-full'} controls playsInline preload="metadata" src={media.previewUrl} />}
      {media.render === 'audio' && <audio className={mediaClassName || 'h-8 w-full'} controls preload="none" src={media.previewUrl} />}
      {media.render === 'pdf' && <object data={media.previewUrl} type="application/pdf" className={mediaClassName || 'h-[65vh] min-h-[360px] w-full rounded-lg'}><iframe src={media.previewUrl} title={title} className="h-full min-h-[360px] w-full" /></object>}
      {media.render === 'iframe' && <iframe title={title} src={media.previewUrl} className={mediaClassName || 'aspect-video w-full rounded-lg border border-white/10 bg-black'} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
      {showDownload && <a href={media.downloadUrl ?? media.sourceUrl} download={media.provider === 'youtube' || media.provider === 'spotify' ? undefined : true} target="_blank" rel="noopener noreferrer" className={controlsClassName || 'mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300'}>
        {media.provider === 'youtube' || media.provider === 'spotify' ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {media.provider === 'youtube' ? 'Watch on YouTube' : media.provider === 'spotify' ? 'Open on Spotify' : media.provider === 'pcloud' ? `Open / Download ${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'PDF'}` : `Download ${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'PDF'}`}
      </a>}
    </div>
  );
}
