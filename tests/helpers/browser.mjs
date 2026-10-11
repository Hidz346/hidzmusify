// Resolves Playwright from (1) the project's own node_modules, (2) a global install.
// Install on your machine with:  npm i -D playwright && npx playwright install chromium
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    const candidates = [
        import.meta.url, // project-local resolution (node_modules next to the project)
        // common global install roots (Linux/macOS); harmless if they do not exist
        'file:///opt/node22/lib/node_modules/',
        'file:///usr/local/lib/node_modules/',
        'file:///usr/lib/node_modules/',
    ];
    for (const c of candidates) {
        try {
            return createRequire(c)('playwright');
        } catch {
            /* try next */
        }
    }
    throw new Error('Playwright not found. Run: npm i -D playwright && npx playwright install chromium');
}

export const playwright = loadPlaywright();

/** Where the built site lives (auto-detected). Override with HIDZ_ROOT to test another build (e.g. the untouched original). */
export function siteRoot() {
    const here = path.dirname(new URL(import.meta.url).pathname);
    // Layouts: <project>/HidzMusify/ (tests next to it) or the site itself being the repo root (tests/ inside it).
    const candidates = [path.resolve(here, '../../HidzMusify'), path.resolve(here, '../..')];
    const root =
        process.env.HIDZ_ROOT || candidates.find((c) => fs.existsSync(path.join(c, 'index.html'))) || candidates[0];
    if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`index.html not found in ${root}`);
    return root;
}

/**
 * Launch headless Chromium. `HIDZ_CHROMIUM` can point at a specific executable.
 * Autoplay is NOT force-enabled: the tests click like a user would, so autoplay policy is exercised for real.
 */
export async function launch() {
    const executablePath = process.env.HIDZ_CHROMIUM || undefined;
    return playwright.chromium.launch({ headless: true, executablePath });
}
