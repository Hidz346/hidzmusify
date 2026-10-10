import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStreamUrl, searchTracks } from '../assets/tracks-fallback.mjs';

function mockResponse(payload, options = {}) {
    return {
        ok: options.ok ?? true,
        status: options.status ?? 200,
        json: async () => payload,
    };
}

test('searchTracks normalizes search results to the player schema', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = async (url) => {
        requestedUrl = String(url);
        return mockResponse({
            tracks: [
                {
                    trackId: '12345',
                    title: 'Example Song',
                    artistNames: ['Example Artist'],
                    artistIds: ['77'],
                    albumTitle: 'Example Album',
                    artwork: 'https://example.com/cover.jpg',
                    duration: 213000,
                    playable: true,
                },
            ],
        });
    };

    try {
        const result = await searchTracks('  Example Song  ');
        assert.equal(requestedUrl, 'https://tracks.monochrome.st/search?q=Example%20Song');
        assert.equal(result.tracks.items.length, 1);
        assert.equal(result.tracks.items[0].id, 'm:12345');
        assert.equal(result.tracks.items[0].duration, 213);
        assert.equal(result.tracks.items[0].artist.name, 'Example Artist');
        assert.equal(result.tracks.items[0].album.title, 'Example Album');
        assert.equal(result.tracks.items[0].isUnavailable, false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('searchTracks returns null for an empty query without making a request', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new Error('fetch should not be called for an empty query');
    };
    try {
        assert.equal(await searchTracks('   '), null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('searchTracks treats non-success responses and empty results as fallback conditions', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => mockResponse({ tracks: [] });
    try {
        assert.equal(await searchTracks(`empty-${Date.now()}`), null);
    } finally {
        globalThis.fetch = originalFetch;
    }

    globalThis.fetch = async () => mockResponse({}, { ok: false, status: 503 });
    try {
        assert.equal(await searchTracks(`unavailable-${Date.now()}`), null);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('makeStreamUrl only builds a URL for a valid track ID', () => {
    const stream = makeStreamUrl('m:12345', 'HIGH');
    assert.equal(stream.url, 'https://tracks.monochrome.st/track/12345');
    assert.equal(stream.playbackType, 'direct');
    assert.equal(stream.qualityRequested, 'HIGH');
    assert.throws(() => makeStreamUrl(''), { name: 'TypeError' });
});
