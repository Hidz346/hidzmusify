const INVIDIOUS = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://iv.datura.network'];
const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee', 'https://pipedapi.leptons.xyz'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.query?.proxy === '1' && req.query?.url) {
    try {
      const target = decodeURIComponent(req.query.url);
      const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36' };
      if (req.headers.range) headers['Range'] = req.headers.range;
      const up = await fetch(target, { headers });
      res.status(up.status);
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((k) => {
        const v = up.headers.get(k);
        if (v) res.setHeader(k, v);
      });
      return res.end(Buffer.from(await up.arrayBuffer()));
    } catch (_) {
      return res.status(502).json({ error: 'Proxy error' });
    }
  }

  const videoId = String(req.query?.id || req.query?.v || req.query?.videoId || '').trim();
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  const timedJson = async (url) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2600);
    try {
      const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 HidzMusify/3.0' } });
      if (!r.ok) throw new Error('bad');
      return await r.json();
    } finally { clearTimeout(t); }
  };

  try {
    const fast = await Promise.any([
      ...INVIDIOUS.map(async (inv) => {
        const d = await timedJson(`${inv}/api/v1/videos/${encodeURIComponent(videoId)}`);
        const u = `${inv}/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`;
        return {
          ok: true, id: videoId, videoId,
          title: d.title || '', uploader: (d.author || '').replace(/\s*-\s*Topic$/i, ''),
          duration: d.lengthSeconds || 0,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: u, audioUrl: u, streamUrl: u, mimeType: 'audio/mp4',
          fallbackMode: 'youtube-iframe',
          embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1`
        };
      }),
      ...PIPED.map(async (p) => {
        const d = await timedJson(`${p}/streams/${encodeURIComponent(videoId)}`);
        const s = (d.audioStreams || []).find((x) => x.mimeType?.includes('audio/mp4')) || (d.audioStreams || [])[0];
        if (!s?.url) throw new Error('empty');
        return {
          ok: true, id: videoId, videoId,
          title: d.title || '', uploader: (d.uploader || '').replace(/\s*-\s*Topic$/i, ''),
          duration: d.duration || 0,
          thumbnailUrl: d.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: s.url, audioUrl: s.url, streamUrl: s.url, mimeType: s.mimeType || 'audio/mp4',
          fallbackMode: 'youtube-iframe',
          embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1`
        };
      })
    ]);
    return res.status(200).json(fast);
  } catch (_) {
    const u = `https://inv.nadeko.net/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`;
    return res.status(200).json({
      ok: true, id: videoId, videoId, url: u, audioUrl: u, streamUrl: u, mimeType: 'audio/mp4',
      fallbackMode: 'youtube-iframe',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1`
    });
  }
}
