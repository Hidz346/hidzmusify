# Patcher bundel HidzMusify

`HidzMusify/` hanya berisi **hasil build** (Vite): tidak ada `src/` maupun `package.json`, jadi source asli tidak bisa
dibangun ulang dari sini. Daripada mengedit file minified secara manual, setiap perubahan ditulis sebagai
penggantian _exact-match_ di `apply-patches.mjs` yang:

- menolak berjalan kalau potongan kode yang dicari tidak cocok **tepat N kali** (build baru ≠ patch diam-diam merusak);
- menjalankan `node --check` pada hasilnya sebelum menulis file (gerbang syntax);
- bisa diulang: input selalu bundel **asli**, outputnya deterministik.

```bash
node patches/apply-patches.mjs <bundel-asli>/assets/index-Dg7h0oU_.js <situs>/assets/index-Dg7h0oU_.js
# <situs> = HidzMusify/ atau root repo (kalau repo-nya langsung berisi index.html)
```

`prelude.js` berisi helper level-modul (`__hzSig`, `__hzNotify`, `__hzManifestOk`, ...) yang disisipkan di awal bundel.
`prelude-youtube.js` (disisipkan tepat setelahnya) berisi sumber YouTube: pencarian lewat `/api/search`, pemutaran lewat YouTube IFrame Player,
dan pemetaan lagu → video (lihat `PERBAIKAN.md`, Revisi 2).
Semua pesan UI untuk user ada di satu tempat (`__hzMsg`), dalam bahasa Inggris agar sama dengan UI aplikasi.

Nama file bundel **sengaja tidak diganti** (`index-Dg7h0oU_.js`): ±31 chunk lain mengimpor nama itu, dan menambah
query string membuat modul ter-instansiasi dua kali. Konsekuensinya: CDN/browser yang menyimpan versi lama dengan
`max-age` panjang harus di-purge (lihat `PERBAIKAN.md`, bagian Deploy). `sw.js` baru sudah memaksa revalidasi.

Identitas berkas (SHA-256):

| Berkas                                             | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| bundel asli `assets/index-Dg7h0oU_.js`             | `f442b350d4a2b15fb8616259ecf6d764ffd0f3609b0391aba1b0ad710b1ff617` |
| bundel hasil patch (Revisi 2, 33 patch)            | `f602060f892b0487b9e5766fd2d3013ec59548a50dc6572d7e0face4ed83fbb2` |
| bundel hasil patch Revisi 1 (23 patch, digantikan) | `c45f97d335e98f9fd7bdd138e7ae7e81feee79179440c3ee1552944e4e07ffc6` |

## Daftar patch (33)

| ID                                 | Akar masalah yang diperbaiki                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `P0-prelude`                       | Helper bersama (timeout, toast, validator respons, tombol retry).                                                                                                                                                                                                                                                  |
| `P1-instances-redeclared-const`    | `loadInstancesFromGitHub()` mendeklarasikan `const e` dua kali → `SyntaxError` → **seluruh modul utama ditolak browser**, UI mati, form cari me-reload halaman. Juga: localStorage yang melempar tidak boleh meracuni promise bersama.                                                                             |
| `P1b-instances-list-timeout`       | Fetch daftar instance tanpa timeout → satu worker uptime yang macet memblokir semua search/stream.                                                                                                                                                                                                                 |
| `P2-hifi-initialize-nonblocking`   | Boot menunggu token OAuth TIDAL (tanpa timeout & tanpa catch). Token diambil lazy saat dipakai, jadi warm-up dipindah ke background dan tidak boleh memblokir/menjatuhkan startup.                                                                                                                                 |
| `P3a/P3b-tidal-*-timeout`          | Timeout 12 dtk (token) / 15 dtk (API langsung TIDAL).                                                                                                                                                                                                                                                              |
| `P4-contributors-nonblocking`      | Fetch contributors (GitHub) di jalur boot dibuat non-blocking + timeout 8 dtk.                                                                                                                                                                                                                                     |
| `P5a/b/c-fetchWithRetry-*`         | Rotasi instance (2N percobaan × 9 dtk + refresh) tanpa batas total → ditambah deadline total (default 30 dtk, bisa di-override per panggilan).                                                                                                                                                                     |
| `P6a-search-failure-marker`        | Kegagalan provider dikembalikan sebagai hasil kosong, tak bisa dibedakan dari "tidak ada hasil" → diberi penanda `failed`.                                                                                                                                                                                         |
| `P6b/P6c-search-*`                 | `search()` ditulis ulang: kosong valid diterima, semua gagal → lempar error yang jelas, hasil kosong tidak di-cache, AbortError diteruskan, deadline 15 dtk.                                                                                                                                                       |
| `P7a-searchpage-watchdog`          | Halaman cari tanpa batas waktu → watchdog 40 dtk.                                                                                                                                                                                                                                                                  |
| `P7b-searchpage-stale-guard`       | Respons query lama menimpa query baru → guard.                                                                                                                                                                                                                                                                     |
| `P7c-searchpage-artist-enrichment` | `enrichArtistsWithPicture` dipanggil pada receiver yang salah (`this.api`, seharusnya `this.api.tidalAPI`) → `TypeError` yang membuat hasil tidak pernah dirender.                                                                                                                                                 |
| `P7d-searchpage-error-state`       | State error terlihat + tombol "Try again" (sebelumnya: spinner/placeholder abadi).                                                                                                                                                                                                                                 |
| `P8-getTrack-manifest-contract`    | Validator respons `/trackManifests/` menuntut kunci legacy (`manifest`, `url`, …) padahal respons valid hanya berisi `data.data.attributes.uri` → **setiap respons valid ditolak** dan instance dirotasi sampai habis. Sekarang: validator sesuai kontrak upstream + fallback ke `/track/` + pesan error gabungan. |
| `P9a-manifest-fetch-timeout`       | Unduhan manifest bertanda tangan (signed URL) 15 dtk timeout.                                                                                                                                                                                                                                                      |
| `P9b-track-info-deadline`          | `/info/` deadline 8 dtk.                                                                                                                                                                                                                                                                                           |
| `P10a/b/c-player-*`                | Kegagalan pemutaran tidak lagi senyap: tombol Play dikembalikan dari ikon Pause, toast alasan gagal, `NotAllowedError` (autoplay) → "Press Play", error elemen `<audio>` ditampilkan.                                                                                                                              |
| `P0-prelude` (diperluas)           | Menyisipkan `prelude-youtube.js` (objek `__hzYt`). Sakelar: `localStorage["hz-source"]="tidal"` mengembalikan jalur TIDAL lama; `localStorage["hz-yt-visible"]="1"` menampilkan pemutar YouTube untuk debug.                                                                                                       |
| `P11a-music-api-search-youtube`    | `MusicAPI.search()` memanggil `/api/search` (YouTube Music) bila sumber YouTube aktif. Jalur TIDAL tetap ada di belakang sakelar.                                                                                                                                                                                  |
| `P11b1/P11b2-searchpage-*`         | Halaman cari tidak lagi mencoba memperkaya artis/album dari API TIDAL untuk hasil YouTube (akan gagal).                                                                                                                                                                                                            |
| `P11b3/b4/b5-searchpage-empty-*`   | Tab Artists/Albums/Playlists untuk hasil YouTube memberi pesan "Only tracks are available in this version." alih-alih "No … found."                                                                                                                                                                                |
| `P11c-search-click-queue`          | Klik hasil mengantre semua hasil dari lagu yang diklik, supaya Next/Prev dan lanjut-otomatis bekerja (sebelumnya hanya 1 lagu).                                                                                                                                                                                    |
| `P12a-player-youtube-branch`       | Cabang pertama `playTrackFromQueue`: lagu biasa diputar lewat YouTube (lagu pustaka ber-id TIDAL di-_resolve_ dulu lewat `/api/resolve`); podcast/tracker/file lokal/video tetap jalur lama.                                                                                                                       |
| `P12b-preload-skip-youtube`        | Preload lagu berikutnya meminta stream ke API TIDAL yang mati; dilewati untuk sumber YouTube.                                                                                                                                                                                                                      |
| `P12c-handlePlayPause-youtube`     | `handlePlayPause` menentukan "lanjutkan" vs "mulai ulang" dari `<audio>.src` yang kosong saat YouTube memutar → tombol Pause akan memulai ulang lagu. Video YouTube yang sudah dimuat dihitung sebagai sumber.                                                                                                     |

Perubahan **tidak** menyentuh: autentikasi, pengecekan domain/origin, kredensial, tema, logo, layout, dan wrapper `desktop/` / `mobile/`.
