# Tes regresi HidzMusify (end-to-end, deterministik)

Tes ini menjalankan **build yang sebenarnya** (`HidzMusify/`) di Chromium headless lewat server statis dengan
SPA-fallback yang meniru `_redirects` (`/* /index.html 200`). Semua jaringan eksternal (TIDAL auth, API musik,
CDN audio, GitHub, dsb.) di-_mock_ dengan `page.route`, jadi hasilnya **tidak bergantung pada uptime API pihak
ketiga** dan tidak ada tes yang memutar audio palsu dari internet: audio yang diputar adalah WAV yang dibuat
oleh mock sendiri, dan mock mengikuti kontrak hifi-API yang didokumentasikan upstream
(`/search/`, `/info/`, `/trackManifests/`, `/track/`).

> Mock membuktikan bahwa **kode HidzMusify benar terhadap kontrak API**. Mock **tidak** membuktikan bahwa
> endpoint produksi sedang hidup atau mengizinkan domain kamu. Itu harus dicek manual (lihat `PERBAIKAN.md`).

## Menjalankan

```bash
npm i -D playwright            # + eslint/prettier kalau mau lint
npx playwright install chromium
npm test                       # unit + e2e (lama dan YouTube)
npm run test:unit              # hanya tes fungsi /api (tanpa browser)
npm run test:youtube           # hanya jalur YouTube
```

Di repo situs (root = situs, tanpa package.json pengembangan) jalankan dari folder `tests/`:
`cd tests && npm i && npx playwright install chromium && npm test`. `tests/package.json` sengaja ada di dalam `tests/`
supaya Vercel (yang hanya meng-install `package.json` di root) tidak ikut meng-install Playwright.

Tes lama (TIDAL) berjalan dengan `localStorage["hz-source"]="tidal"` (opsi `source: 'tidal'`, default fixture);
tes baru memakai `source: 'youtube'`, yaitu default build yang di-deploy.

Satu file saja: `npm run test:search`, `test:playback`, `test:resilience`, `test:boot`, `test:sw`.

Variabel lingkungan:

| Variabel        | Fungsi                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `HIDZ_ROOT`     | Folder situs yang diuji (default `../HidzMusify`). Isi dengan build asli untuk melihat tes gagal. |
| `HIDZ_CHROMIUM` | Path executable Chromium khusus (default: yang dipasang Playwright).                              |

## Isi

| File                   | Yang dibuktikan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unit/api.test.mjs`    | Fungsi `/api/search` & `/api/resolve` (handler asli, `ytmusic-api` diganti katalog palsu): pemetaan ke bentuk track, ranking (rekaman yang sama menang; live/cover/lagu lain ditolak), validasi input, dedupe/limit, satu daftar gagal tidak menyembunyikan yang lain, outage = error 502 (bukan "kosong"), perubahan format upstream, upstream menggantung → 504 dalam batas waktu.                                                                                                                                                                                                                                                                                                                                                |
| `e2e/youtube.test.mjs` | Alur pengguna lewat UI sungguhan dengan pemutar YouTube palsu: cari → hasil; klik → waktu maju & ikon; **Pause melanjutkan video yang sama (tidak memuat ulang)**; seek/volume; Next/Prev/lanjut-otomatis; klik cepat; video diblokir (101) → versi alternatif + pemberitahuan; tak ada versi → error jujur & tombol Play memulai ulang; autoplay diblokir → pesan cepat lalu Play benar-benar memutar; video tak mulai → batas tunggu 10 dtk (maks 2×); skrip YouTube gagal dimuat; semua mode error pencarian (502/504/404/HTML/500/menggantung) tampil jujur, bukan "No tracks found"; query baru menang atas query lambat; lagu pustaka ber-id TIDAL di-resolve sekali & diingat; `/api/` tidak pernah di-cache service worker. |

### Tes Revisi 1 (jalur TIDAL, tetap dijalankan)

| File                  | Yang dibuktikan                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boot.test.mjs`       | Semua JS dalam build lolos `node --check` (regresi `SyntaxError`); app boot; Enter di kolom cari tidak me-reload halaman; boot tetap hidup saat TIDAL auth / contributors mati, menggantung, atau localStorage diblokir.                                                                                                                                                                                                                |
| `search.test.mjs`     | Judul/artis → hasil relevan; query kosong/spasi tidak memanggil API; karakter khusus di-encode; "tidak ada hasil" = empty state cepat (bukan error); semua provider mati / HTTP 500 / respons sampah → pesan error + tombol "Try again" dan **berhenti loading**; retry berhasil setelah provider pulih; query beruntun cepat → hanya query terakhir yang tampil; instance mati dilewati; field opsional kosong tidak membuat UI crash. |
| `playback.test.mjs`   | Klik Play pada stream valid benar-benar memutar audio (`currentTime` maju); pause/resume/seek/volume; ganti lagu; klik cepat berulang; fallback `/track/`; manifest tanpa `attributes.uri`; unduhan manifest 404/hang; tidak ada stream → toast + tombol kembali ke Play; byte bukan audio → error ditampilkan; autoplay diblokir browser → user diberi tahu.                                                                           |
| `resilience.test.mjs` | Outage API tidak merusak rute lain (library/settings/recent); deep link & refresh di `/search/<q>`; back/forward tidak menampilkan hasil basi; koneksi putus di tengah sesi; semua provider menggantung → watchdog tetap mengakhiri loading; viewport mobile.                                                                                                                                                                           |
| `sw.test.mjs`         | `sw.js` mandiri (tanpa workbox), aktif & meng-claim halaman, hanya meng-cache same-origin, tidak pernah cache HTML sebagai script, offline setelah satu kunjungan, **redeploy langsung terlihat**, upgrade dari worker cache-first lama, fallback saat origin lambat/5xx.                                                                                                                                                               |

## Catatan teknis

- Playwright 1.56: `page.waitForFunction` **tidak menunggu predikat async**. Gunakan polling di sisi Node (lihat `until()` di `sw.test.mjs`).
- `context.setOffline(true)` tidak memengaruhi request yang di-fulfil oleh `page.route`; tes offline memakai route yang `abort`.
- Tes tidak boleh di-skip/dihapus agar "hijau". Kalau gagal, selidiki akar masalahnya.
