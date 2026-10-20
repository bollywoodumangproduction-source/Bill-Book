import { useState } from 'react';
import { Download, ExternalLink, Play } from 'lucide-react';
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
      {media.render === 'iframe' && (media.provider === 'youtube'
        ? <YouTubePreview mediaUrl={media.previewUrl} title={title} className={mediaClassName || 'aspect-video w-full rounded-lg border border-white/10 bg-black'} />
        : <iframe title={title} src={media.previewUrl} className={mediaClassName || 'aspect-video w-full rounded-lg border border-white/10 bg-black'} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />)}
      {showDownload && <a href={media.downloadUrl ?? media.sourceUrl} download={media.provider === 'youtube' || media.provider === 'spotify' ? undefined : true} target="_blank" rel="noopener noreferrer" className={controlsClassName || 'mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-300'}>
        {media.provider === 'youtube' || media.provider === 'spotify' ? <ExternalLink className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {media.provider === 'youtube' ? 'Watch on YouTube' : media.provider === 'spotify' ? 'Open on Spotify' : media.provider === 'pcloud' ? `Open / Download ${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'PDF'}` : `Download ${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'PDF'}`}
      </a>}
    </div>
  );
}

function YouTubePreview({ mediaUrl, title, className }: { mediaUrl: string; title: string; className: string }) {
  const [playing, setPlaying] = useState(false);
  const videoId = new URL(mediaUrl).pathname.split('/').filter(Boolean).pop();
  if (playing || !videoId) {
    const embedUrl = new URL(mediaUrl);
    if (playing) {
      embedUrl.searchParams.set('autoplay', '1');
      embedUrl.searchParams.set('playsinline', '1');
    }
    const src = playing ? embedUrl.toString() : mediaUrl;
    return <iframe title={title} src={src} className={className} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
  }
  return <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className={`relative block cursor-pointer overflow-hidden bg-black p-0 ${className}`}>
    <img src={`https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
    <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/25"><span className="flex h-10 w-14 items-center justify-center rounded-xl bg-red-600 text-white shadow-lg"><Play className="h-5 w-5 fill-current" /></span></span>
  </button>;
}
