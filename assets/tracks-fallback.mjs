const TRACKS_API_BASE_URL = 'https://tracks.monochrome.st';
const REQUEST_TIMEOUT_MS = 8000;

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeArtist(value, fallbackName = 'Unknown Artist') {
    if (typeof value === 'string') {
        return { id: '', artistId: '', tracksArtistId: '', name: value || fallbackName, provider: 'tracks', _href: '' };
    }

    const artistId = String(value?.artistId || value?.id || '');
    return {
        id: artistId,
        artistId,
        tracksArtistId: artistId,
        name: value?.name || value?.displayName || fallbackName,
        avatar: value?.avatar || value?.picture || null,
        picture: value?.picture || value?.avatar || null,
        provider: 'tracks',
        _href: artistId ? `/artist/${encodeURIComponent(artistId)}` : '',
    };
}

function normalizeTrack(item) {
    if (!item || typeof item !== 'object') return null;

    const trackId = String(item.trackId || item.id || '').trim();
    if (!trackId) return null;

    const sourceArtists = asArray(item.artists);
    const artistNames = asArray(item.artistNames);
    const artistIds = asArray(item.artistIds);
    let artists = sourceArtists.map((artist) => normalizeArtist(artist));

    if (!artists.length && artistNames.length) {
        artists = artistNames.map((name, index) => ({
            id: String(artistIds[index] || ''),
            artistId: String(artistIds[index] || ''),
            tracksArtistId: String(artistIds[index] || ''),
            name: typeof name === 'string' && name.trim() ? name : 'Unknown Artist',
            provider: 'tracks',
            _href: artistIds[index] ? `/artist/${encodeURIComponent(String(artistIds[index]))}` : '',
        }));
    }

    const firstArtist = artists[0] || normalizeArtist(null, artistNames[0] || 'Unknown Artist');
    const artwork = item.artwork || item.cover || item.album?.cover || item.release?.cover || '';
    const albumId = String(item.releaseId || item.album?.id || item.album?.releaseId || '');
    const albumTitle = item.albumTitle || item.releaseTitle || item.album?.title || item.release?.title || '';
    const rawDuration = Number(item.duration || 0);

    return {
        id: `m:${trackId}`,
        trackId,
        tracksTrackId: trackId,
        recordingId: item.recordingId ? String(item.recordingId) : null,
        provider: 'tracks',
        type: 'track',
        title: item.title || 'Unknown Title',
        duration: rawDuration > 1000 ? Math.round(rawDuration / 1000) : Math.round(rawDuration),
        explicit: Boolean(item.explicit),
        isrc: item.isrc || '',
        artist: firstArtist,
        artists: artists.length ? artists : [firstArtist],
        album: {
            id: albumId,
            releaseId: albumId,
            tracksReleaseId: albumId,
            title: albumTitle,
            cover: artwork,
            releaseDate: item.releaseDate || item.album?.releaseDate || '',
            _href: albumId ? `/album/${encodeURIComponent(albumId)}` : '',
        },
        cover: artwork,
        image: artwork,
        imageId: artwork,
        releaseDate: item.releaseDate || '',
        trackNumber: item.trackNumber || 1,
        volumeNumber: item.discNumber || 1,
        discNumber: item.discNumber || 1,
        audioModes: ['LOSSLESS', 'STEREO'],
        audioQuality: 'LOSSLESS',
        isUnavailable: item.playable === false,
        allowStreaming: item.playable !== false,
        streamReady: item.playable !== false,
        url: `${TRACKS_API_BASE_URL}/track/${encodeURIComponent(trackId)}`,
        _href: `/track/${encodeURIComponent(trackId)}`,
    };
}

function emptySection() {
    return { items: [], limit: 0, offset: 0, totalNumberOfItems: 0 };
}

function buildSearchResult(rawTracks) {
    const items = rawTracks.map(normalizeTrack).filter(Boolean);
    if (!items.length) return null;

    return {
        tracks: {
            items,
            limit: items.length,
            offset: 0,
            totalNumberOfItems: items.length,
        },
        videos: emptySection(),
        artists: emptySection(),
        albums: emptySection(),
        playlists: emptySection(),
    };
}

export async function searchTracks(query, options = {}) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const callerSignal = options?.signal;
    const forwardAbort = () => controller.abort(callerSignal?.reason);

    if (callerSignal?.aborted) {
        controller.abort(callerSignal.reason);
    } else {
        callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    }

    try {
        const response = await fetch(
            `${TRACKS_API_BASE_URL}/search?q=${encodeURIComponent(cleanQuery)}`,
            {
                method: 'GET',
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: controller.signal,
            },
        );

        if (!response.ok) return null;
        const payload = await response.json();
        return buildSearchResult(asArray(payload?.tracks));
    } catch (error) {
        if (callerSignal?.aborted) throw error;
        // Provider/network timeouts trigger the legacy API fallback instead of leaving the UI loading.
        return null;
    } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', forwardAbort);
    }
}

export function makeStreamUrl(id, quality = 'LOSSLESS') {
    const trackId = String(id || '').replace(/^(?:m:|tracks:(?:track:)?)/, '').trim();
    if (!trackId) throw new TypeError('A valid track ID is required to build a stream URL.');

    const url = `${TRACKS_API_BASE_URL}/track/${encodeURIComponent(trackId)}`;
    return {
        url,
        sourceUrl: url,
        provider: 'monochrome-track-streamer',
        quality: 'LOSSLESS',
        qualityRequested: quality || 'LOSSLESS',
        qualityDisplay: 'FLAC',
        codec: 'flac',
        mediaMimeType: 'audio/flac',
        playbackType: 'direct',
        lossless: true,
        rgInfo: null,
        waveform: null,
    };
}
