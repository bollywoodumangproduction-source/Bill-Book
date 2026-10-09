export type MediaKind = 'video' | 'audio' | 'pdf';
export type MediaRender = 'video' | 'audio' | 'iframe' | 'pdf';
export type MediaProvider = 'drive' | 'dropbox' | 'pcloud' | 'youtube' | 'onedrive' | 'spotify' | 'direct' | 'web';

export interface ResolvedMedia {
  previewUrl: string;
  downloadUrl: string | null;
  render: MediaRender;
  provider: MediaProvider;
  sourceUrl: string;
}

/** Converts common cloud share URLs into safe preview and download targets. */
export function resolveMediaUrl(rawValue: string, kind: MediaKind): ResolvedMedia | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  let url: URL;
  try { url = new URL(raw, typeof window === 'undefined' ? 'https://localhost' : window.location.origin); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.toLowerCase();
  const sourceUrl = url.toString();
  const driveId = url.pathname.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');

  if ((host === 'drive.google.com' || host === 'docs.google.com') && driveId) {
    return {
      previewUrl: `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`,
      render: 'iframe', provider: 'drive', sourceUrl,
    };
  }

  if (host === 'dropbox.com' || host.endsWith('.dropbox.com') || host === 'dropboxusercontent.com' || host.endsWith('.dropboxusercontent.com')) {
    const preview = new URL(url);
    preview.searchParams.delete('dl');
    preview.searchParams.set('raw', '1');
    const download = new URL(url);
    download.searchParams.delete('raw');
    download.searchParams.set('dl', '1');
    const isAudio = /\.(mp3|wav|m4a|ogg|aac|flac)(?:$)/i.test(path);
    const isPdf = /\.pdf(?:$)/i.test(path);
    const isVideo = /\.(mp4|webm|mov|m4v)(?:$)/i.test(path);
    const render: MediaRender = kind === 'pdf' || isPdf ? 'pdf' : isVideo ? 'video' : kind === 'audio' || isAudio ? 'audio' : 'video';
    return { previewUrl: preview.toString(), downloadUrl: download.toString(), render, provider: 'dropbox', sourceUrl };
  }

  if (host === 'u.pcloud.link' || host.endsWith('.pcloud.link') || host === 'pcloud.com' || host.endsWith('.pcloud.com')) {
    const code = url.searchParams.get('code');
    const previewUrl = code ? `https://u.pcloud.link/publink/show?code=${encodeURIComponent(code)}` : sourceUrl;
    return { previewUrl, downloadUrl: previewUrl, render: 'iframe', provider: 'pcloud', sourceUrl };
  }

  if (kind !== 'pdf' && (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com')) {
    const videoId = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
    if (videoId) return { previewUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=0&rel=0`, downloadUrl: null, render: 'iframe', provider: 'youtube', sourceUrl };
  }

  if (host === 'open.spotify.com') {
    const match = url.pathname.match(/^\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
    if (match) return { previewUrl: `https://open.spotify.com/embed/${match[1]}/${match[2]}`, downloadUrl: null, render: 'iframe', provider: 'spotify', sourceUrl };
  }

  if (host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('.onedrive.live.com') || host === 'sharepoint.com' || host.endsWith('.sharepoint.com')) {
    const preview = new URL(url);
    preview.searchParams.delete('download');
    preview.searchParams.set('embed', '1');
    const download = new URL(url);
    download.searchParams.delete('embed');
    download.searchParams.set('download', '1');
    return { previewUrl: preview.toString(), downloadUrl: download.toString(), render: 'iframe', provider: 'onedrive', sourceUrl };
  }

  const isVideo = /\.(mp4|webm|mov|m4v)(?:$)/i.test(path);
  const isAudio = /\.(mp3|wav|m4a|ogg|aac|flac)(?:$)/i.test(path);
  const isPdf = /\.pdf(?:$)/i.test(path);
  const render: MediaRender = kind === 'pdf' || isPdf ? 'pdf' : isVideo ? 'video' : kind === 'audio' || isAudio ? 'audio' : 'iframe';
  return { previewUrl: sourceUrl, downloadUrl: sourceUrl, render, provider: isVideo || isAudio || isPdf ? 'direct' : 'web', sourceUrl };
}

export function isSupportedMediaUrl(rawValue: string): boolean {
  const media = resolveMediaUrl(rawValue, 'video');
  return !!media && media.provider !== 'web';
}
