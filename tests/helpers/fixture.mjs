// Shared e2e fixture: one static server + one Chromium per test file, a fresh browser context
// (clean storage, no service worker unless asked) per test, and collected page errors.
import { startStaticServer } from './static-server.mjs';
import { installMocks } from './mock-network.mjs';
import { installYouTubeMocks } from './mock-youtube.mjs';
import { launch, siteRoot } from './browser.mjs';

export async function setup() {
    const server = await startStaticServer(siteRoot());
    const browser = await launch();
    return {
        server,
        browser,
        async close() {
            await browser.close();
            await server.close();
        },
        /**
         * @param {import('./mock-network.mjs').MockOptions} [mock]
         * @param {{path?: string, serviceWorkers?: 'block'|'allow', viewport?: {width:number,height:number}, init?: string|Function,
         *          source?: 'tidal'|'youtube', youtube?: import('./mock-youtube.mjs').YouTubeMockOptions}} [opts]
         *   `source` picks the playback/search backend under test: 'tidal' (default, the legacy hifi-API path, selected through
         *   localStorage `hz-source`) or 'youtube' (the default of the shipped build; fakes from mock-youtube.mjs are installed).
         */
        async open(
            mock = {},
            {
                path = '/',
                serviceWorkers = 'block',
                viewport = { width: 1280, height: 800 },
                init,
                waitBoot = true,
                source = 'tidal',
                youtube = {},
            } = {}
        ) {
            const context = await browser.newContext({ viewport, serviceWorkers });
            const page = await context.newPage();
            const pageErrors = [];
            const consoleErrors = [];
            page.on('pageerror', (e) => pageErrors.push(String(e.message)));
            page.on('console', (m) => {
                if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text());
            });
            if (source === 'tidal')
                await page.addInitScript(() => {
                    try {
                        localStorage.setItem('hz-source', 'tidal');
                    } catch {
                        /* storage blocked */
                    }
                });
            if (init) await page.addInitScript(init);
            const net = await installMocks(page, mock);
            if (source === 'youtube') net.yt = await installYouTubeMocks(page, youtube);
            await page.goto(server.url + path, { waitUntil: 'domcontentloaded' });
            if (waitBoot) await bootReady(page);
            return { page, context, net, pageErrors, consoleErrors, close: () => context.close() };
        },
    };
}

/** The app is "booted" once the search form handler is attached: Enter must NOT cause a native reload. */
export async function bootReady(page, timeout = 15000) {
    await page.waitForFunction(
        () => !!document.getElementById('search-input') && document.readyState !== 'loading',
        null,
        { timeout }
    );
    // give the async init chain a moment; callers that need a hard check use `searchIsSpa()`
    await page.waitForTimeout(1500);
}

/** Submit a search the way a user does (type + Enter). Returns once the SPA route changed. */
export async function submitSearch(page, query) {
    const input = page.locator('#search-input');
    await input.click();
    await input.fill(query);
    await input.press('Enter');
}

/** Wait until the search page shows tracks, a placeholder (empty/error) or times out. */
export async function waitSearchSettled(page, timeout = 45000) {
    await page.waitForFunction(
        () => {
            const c = document.getElementById('search-tracks-container');
            if (!c) return false;
            if (c.querySelector('.track-item')) return true;
            const ph = c.querySelector('.placeholder-text');
            return !!ph && !ph.classList.contains('loading') && !c.querySelector('.skeleton');
        },
        null,
        { timeout }
    );
}

export const trackRows = (page) =>
    page.$$eval('#search-tracks-container .track-item', (els) =>
        els.map((e) => ({
            id: e.getAttribute('data-track-id'),
            title: e.querySelector('.title')?.textContent.replace(/\s+/g, ' ').trim(),
            artist: e.querySelector('.artist-link')?.textContent.trim(),
        }))
    );

export const searchPlaceholder = (page) =>
    page.$eval(
        '#search-tracks-container',
        (c) => c.querySelector('.placeholder-text')?.textContent.replace(/\s+/g, ' ').trim() || ''
    );

export const audioState = (page) =>
    page.evaluate(() => {
        const a = document.getElementById('audio-player');
        return {
            src: a.currentSrc || a.src || '',
            paused: a.paused,
            t: a.currentTime,
            ready: a.readyState,
            errCode: a.error ? a.error.code : null,
            duration: a.duration,
        };
    });

export const toastTexts = (page) =>
    page.$$eval('#download-notifications .download-task', (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())
    );
