# Search and streaming fallback

HidzMusify currently serves a static built bundle rather than its original application source. This change adds a small, separately testable fallback module instead of replacing the app or rewriting unrelated files.

## Behavior

- Search first calls the public Tracks API at `https://tracks.monochrome.st/search?q=...`.
- A successful response is normalized to the track result shape consumed by the current HidzMusify UI. Track IDs are marked internally with the `m:` prefix so the playback adapter can route those tracks to the Tracks API streamer.
- Tracks API requests have an 8-second timeout. If the request fails or returns no matching tracks, the existing provider path remains as a fallback.
- The legacy combined-search and track-search paths now have a 15-second upper bound for the UI response instead of waiting indefinitely.
- `sw.js` precaches the replacement bundle and fallback module, and the HTML points at a new bundle filename to avoid serving the previously cached JavaScript.

## Verification

Run the isolated tests with:

```sh
node --test tests/tracks-fallback.test.mjs
```

The tests mock the network and verify response normalization, empty-query behavior, error/empty-result fallback, and stream URL formatting. They do not prove that the live upstream endpoint is reachable or that audio plays in production.

## External dependency and limitation

Search and playback still depend on the upstream service being online, returning the documented response shape, and permitting requests from the deployed domain. The Monochrome source documentation warns that self-hosted domains may be denied streaming unless authorized/configured. This change does not bypass those restrictions. If the upstream rejects the domain or the browser blocks the response due to server-side CORS/access policy, the deployment must be configured with an authorized endpoint; frontend code alone cannot guarantee playback.

Because the repository currently contains a generated bundle rather than the matching application source tree, this patch keeps the change scoped to the current deployed bundle and an independent fallback module. Future maintainable changes should be made against the full original source and rebuilt through its normal build pipeline.
