# HidzMusify — Laporan Perbaikan Search & Streaming

**Revisi 2 — 14 Oktober 2026** (di atas Revisi 1 yang ada di bagian "Revisi 1" lebih bawah)

## Revisi 2: search & putar lewat YouTube

### Kenapa Revisi 1 saja tidak cukup

Revisi 1 memperbaiki kode (boot, timeout, validator, error yang jujur) dan itu tetap berlaku. Tetapi saat dicek langsung ke backend-nya,
**layanan musik yang dipakai Monochrome/HidzMusify (TIDAL lewat instance hifi-API) sudah tidak bisa dipakai** — ini bukan bug kode:

| Host                        | Hasil pemeriksaan                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `api.monochrome.tf`         | Tidak ada record DNS (`NXDOMAIN`; dicek di HP kamu dan lewat `dns.google` → `Status 3`)                                            |
| `hifi.geeked.wtf`           | Tidak ada record DNS (`NXDOMAIN`)                                                                                                  |
| `monochrome-api.samidy.com` | Hidup, tapi balasannya: refresh token TIDAL milik servernya ditolak (HTTP 403 dari `auth.tidal.com`) → tidak bisa mengambil stream |
| daftar uptime               | Kosong: 0 host unik yang sehat (diagnostik di konsol HP kamu); satu host lain terblokir CORS, satu tidak terjangkau                |

Memperbaikinya dari sisi kode hanya mungkin dengan melewati pembatasan akses milik pihak lain (proxy/penyamaran origin/token yang bukan milikmu).
PRD melarang itu, jadi **tidak dicoba**. (Ada laporan komunitas bahwa Monochrome menghentikan layanannya; itu tidak saya verifikasi dari sumber resmi.)

### Apa yang diganti — hanya yang rusak

Sesuai permintaanmu ("yang diganti yang error saja"), nama, logo, tema, layout, library, playlist, antrean, pengaturan, PWA, `desktop/` dan `mobile/` **tidak berubah**.
Yang diganti hanya dua hal yang memang mati, dengan pendekatan dari source MUSIK yang kamu kirim (YouTube Music lewat fungsi server + YouTube IFrame Player):

| Bagian          | Sebelum                               | Sesudah                                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search          | hifi-API TIDAL (mati) → spinner/error | `GET /api/search?q=` (fungsi Vercel, `ytmusic-api`) → daftar lagu; batas waktu 8 dtk di server, 15 dtk di browser; gagal = pesan error yang jelas, **tidak pernah** "hasil kosong" palsu                                                                                           |
| Putar           | stream manifest TIDAL (mati)          | YouTube IFrame Player resmi; elemen `<audio>` aplikasi tetap menjadi "pengendali" UI sehingga progress bar, ikon play/pause, antrean, Next/Prev, lanjut-otomatis, Media Session tetap bekerja tanpa menulis ulang Player                                                           |
| Lagu di library | id TIDAL → tidak bisa diputar         | Saat diputar, dicari padanannya di YouTube lewat `GET /api/resolve` (judul + artis + durasi, hasil di-ranking; versi live/cover/lagu lain ditolak), lalu diingat di `localStorage["hz-yt-map-v1"]`                                                                                 |
| Video gagal     | diam                                  | Video diblokir/dihapus → otomatis coba versi lain (maks 3 kali) + pemberitahuan; tidak mulai dalam 10 dtk → 1 alternatif lalu error (tunggu maksimal ~20 dtk, tidak "loading terus"); autoplay diblokir browser → pesan dalam beberapa detik, tombol Play lalu benar-benar memutar |

Jalur TIDAL lama **tidak dihapus**: `localStorage.setItem("hz-source","tidal")` mengembalikannya (berguna kalau suatu hari ada instance yang hidup lagi).

### File

Di-deploy (ke root repo):

| File                                             | Keterangan                                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/_lib.js`, `api/search.js`, `api/resolve.js` | **Baru.** Fungsi Vercel (Node, CommonJS). Tanpa rahasia/cookie/data pengguna; hanya GET; input divalidasi.                                                              |
| `package.json`                                   | **Baru, runtime saja:** satu dependency `ytmusic-api` (`^5.3.1`, versi yang sama dengan yang dipakai MUSIK) + `engines.node = 22.x`. Tanpa devDependencies/skrip build. |
| `assets/index-Dg7h0oU_.js`                       | 33 patch (23 lama + 10 baru). SHA-256 `f602060f…83fbb2`. Nama file tetap.                                                                                               |
| `sw.js`                                          | Satu baris tambahan: `/api/*` tidak pernah dilayani dari cache service worker (jangan sajikan hasil cari basi).                                                         |

Bukan bagian situs: `patches/` (patcher + `prelude-youtube.js`), `tests/` (unit + e2e), `docs/`.

### Validasi (dijalankan di sini; semua jaringan di-mock)

| Perintah                                                                         | Hasil                                                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `node --test tests/unit/*.test.mjs`                                              | **15/15** (handler `/api` asli di atas katalog `ytmusic-api` palsu)                                            |
| `node --test --test-force-exit tests/e2e/*.test.mjs`                             | **63/63**: 44 tes Revisi 1 (jalur TIDAL, `hz-source=tidal`) + 19 tes YouTube (UI nyata, pemutar YouTube palsu) |
| Uji mutasi: patch `P12c` dilepas                                                 | Tes "Pause melanjutkan video yang sama" **gagal** → tes memang menjaga bug itu                                 |
| `eslint .`, `prettier --check`, `node --check` (semua chunk + `sw.js` + `api/*`) | Bersih                                                                                                         |
| Patcher dijalankan ulang dari bundel asli                                        | 33/33 patch cocok, `node --check` lolos, hasil byte-identik (SHA sama)                                         |

### Yang BELUM terbukti (harus kamu cek setelah deploy)

Tes membuktikan **logika aplikasi**. Dari lingkungan ini saya tidak bisa menjangkau YouTube, npm, maupun Vercel kamu, jadi **belum terbukti**:

1. `ytmusic-api` benar-benar mengembalikan hasil dari server Vercel-mu (ia scraper tidak resmi; bisa diblokir/berubah kapan saja).
2. Pemutar YouTube benar-benar mau memutar video di domainmu (lihat "Risiko" di bawah).
3. Build Vercel meng-install `ytmusic-api` dan fungsi `/api/*` terdeploy.

Cek tercepat setelah deploy: buka `https://hidzmusify-com.vercel.app/api/search?q=daft%20punk` — harus keluar JSON berisi `items`.
Kalau keluar `502`/`504`: lihat Vercel → Logs (`[hidzmusify-api] ...`); itu berarti masalahnya di sisi `ytmusic-api`/YouTube, bukan di UI.
Kalau lagu tidak berbunyi: jalankan `localStorage.setItem("hz-yt-visible","1")` lalu reload — pemutar YouTube tampil di kanan bawah dan menunjukkan alasan yang diberikan YouTube.

### Batasan fitur (jujur)

- **Hanya tab Tracks** yang berfungsi. Artists/Albums/Playlists menampilkan "Only tracks are available in this version."; halaman artis/album bawaan masih butuh API TIDAL yang mati.
- Lencana kualitas ("Lossless") pada lagu library mencerminkan metadata TIDAL lama; yang diputar sebenarnya audio YouTube, **bukan lossless**.
- Lirik, rekomendasi/radio/autoplay-mix masih memanggil endpoint TIDAL yang mati; gagal di latar belakang tanpa menghentikan pemutaran.
- Pemutaran tab latar di HP bergantung pada browser; iframe YouTube yang disembunyikan kadang dihentikan OS (aplikasi mencoba melanjutkan otomatis kecuali kamu menekan Pause).
- Refresh pada deep link (mis. `/search/xxx`) di Vercel memberi 404 karena `_redirects` hanya dikenali Netlify/EdgeOne; ini sudah ada sebelum perbaikan dan **tidak diubah** (butuh `vercel.json` rewrites — keputusan konfigurasi deploy ada padamu).

### Risiko & hal yang perlu keputusanmu

- **Syarat layanan YouTube.** Pemutar disembunyikan (1×1 piksel di luar layar), sama seperti MUSIK. Sepengetahuan saya, kebijakan YouTube API Services mensyaratkan pemutar embed berukuran minimal 200×200 dan terlihat, serta melarang memisahkan audio dari video, dan `ytmusic-api` adalah scraper tidak resmi. Untuk pemakaian pribadi/uji ini lazim, tetapi untuk produk publik berisiko dihentikan. Sakelar `hz-yt-visible=1` menampilkan pemutar.
- **Lisensi MUSIK.** Zip MUSIK tidak menyertakan berkas LICENSE. Saya menulis kode baru sendiri (tidak menyalin file); yang diambil hanya pendekatannya (`ytmusic-api` + IFrame API). Pastikan kamu berhak memakai/mengadaptasi MUSIK.
- Tidak ada rahasia/token/API key baru di frontend maupun repo. Tidak ada proxy, bypass, atau penyamaran origin.

### Deploy (Termux)

```sh
cd ~/hidzmusify && git pull            # pastikan repo terbaru
unzip -o ~/storage/downloads/hidzmusify-fix-pack.zip -d ~/
sh ~/hidzmusify-fix-pack/apply-fix.sh ~/hidzmusify
git add -A && git commit -m "Search & playback via YouTube Music (api/) + YouTube IFrame player"
git push origin master                 # Vercel otomatis build & deploy
```

Di Vercel: Framework Preset "Other", tanpa Build Command, Root Directory = root repo. Setelah deploy: hard refresh (atau hapus data situs sekali) karena nama bundel tidak berubah.

---

# Revisi 1 — Search & Streaming (11 Oktober 2026)

> Catatan: bagian ini adalah laporan Revisi 1 apa adanya. Jalur TIDAL yang dibahas di sini masih ada di bundel tetapi tidak lagi dipakai secara default (lihat Revisi 2).
> Penyebutan "23 patch" dan "dua file yang di-deploy" berlaku untuk Revisi 1; Revisi 2 memakai 33 patch dan menambah `api/` + `package.json`.

Tanggal: 11 Oktober 2026 · Basis: `hidzmusify.zip` (build Vite, bundel `assets/index-Dg7h0oU_.js`) · Referensi: Monochrome v2.5.1

Ringkasan: halaman **mati total** karena `SyntaxError` di bundel utama; setelah itu ada lima masalah berlapis yang membuat
search menggantung/kosong dan stream tidak pernah mau jalan, plus service worker yang tidak berfungsi. Semuanya diperbaiki
dengan perubahan minimal pada **dua file yang di-deploy** (`assets/index-Dg7h0oU_.js` dan `sw.js`), dibuktikan oleh 44 tes
end-to-end dengan jaringan di-mock. **Yang belum bisa dibuktikan dari sini:** apakah endpoint produksi (api.monochrome.tf, dsb.)
sedang hidup dan mengizinkan domain kamu. Itu bergantung pada pihak luar dan harus dicek manual (lihat "Status streaming").

---

## 1. Root cause (hasil diagnosis, bukan tebakan)

Setiap butir di bawah **direproduksi** (tes gagal pada build asli, lulus pada build perbaikan).

| #   | Akar masalah                                                                                                                                                                                                                                                                                                                    | Gejala yang dilihat user                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R1  | `loadInstancesFromGitHub()` mendeklarasikan `const e` **dua kali** di scope yang sama → `SyntaxError: Identifier 'e' has already been declared`. Browser menolak **seluruh modul utama**.                                                                                                                                       | UI statis tampil tapi tidak ada yang merespons; Enter di kolom cari me-reload halaman; tidak ada search/play. |
| R2  | Boot (`DOMContentLoaded`) menunggu `HiFiClient.initialize()` → token OAuth TIDAL tanpa timeout & tanpa `catch`; fetch contributors dan daftar instance juga tanpa timeout. Satu host yang lambat/diblokir membekukan atau menjatuhkan seluruh startup.                                                                          | Setelah R1 diperbaiki, jaringan yang blokir `auth.tidal.com` tetap membuat app mati.                          |
| R3  | `fetchWithRetry` merotasi 2N instance × 9 dtk + refresh **tanpa batas total**; kegagalan provider dikembalikan sebagai hasil **kosong** (tak bisa dibedakan dari "tidak ada hasil") dan hasil kosong ikut di-cache; halaman cari tanpa watchdog, tanpa guard hasil basi, tanpa state error.                                     | Spinner "Searching…" abadi, atau "No tracks found" padahal provider yang mati; query lama menimpa query baru. |
| R4  | `enrichArtistsWithPicture` dipanggil pada objek yang salah (`this.api`, seharusnya `this.api.tidalAPI`) → `TypeError` setelah respons berhasil.                                                                                                                                                                                 | Hasil search sampai ke klien tapi tidak pernah dirender.                                                      |
| R5  | **Validator respons `/trackManifests/` bertentangan dengan parser-nya.** Validator menuntut kunci legacy (`manifest`, `url`, …); respons valid upstream hanya berisi `data.data.attributes.uri` (URL manifest bertanda tangan). Setiap respons valid ditolak → instance dirotasi sampai habis. Tidak ada fallback ke `/track/`. | Klik Play: ikon berubah ke Pause lalu tidak ada suara (pada tes: 36 request percuma sebelum gagal).           |
| R6  | Pemutar menelan kegagalan: `playTrackFromQueue` tidak mengembalikan tombol Play dan tidak memberi pesan; `safePlay` menelan `NotAllowedError`; error elemen `<audio>` tidak ditampilkan.                                                                                                                                        | "Diam saja" — user tidak tahu apa yang salah.                                                                 |
| R7  | `sw.js` memuat `./workbox-52263f48.js` yang **tidak ada di build**; worker terdaftar tapi tidak bisa precache/serve apa pun (cache kosong). Worker versi lama yang punya workbox bersifat _cache-first_ dan terus menyajikan `index.html` + bundel lama (yang rusak).                                                           | Offline tidak berfungsi; user lama bisa tetap tersangkut di bundel rusak setelah deploy.                      |

Bukan akar masalah (dicek dan dikesampingkan): struktur `_redirects`, `<base href>`, manifest PWA, chunk lain (semua lolos `node --check`).

> Satu hal yang **tidak** diubah dan perlu perhatianmu: bundel berisi _client id/secret_ TIDAL yang di-hardcode (bawaan Monochrome,
> dipakai untuk jalur API langsung). Saya tidak menyentuh, menyalin, atau menambah kredensial apa pun. Pastikan kamu berhak memakainya;
> kalau ragu, putar/hapus. Lihat "Batasan tersisa".

## 2. Perbaikan (sebelum → sesudah)

| Area   | Sebelum                                                                     | Sesudah                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot   | `SyntaxError`, modul ditolak; bergantung pada TIDAL auth                    | Boot lolos; token TIDAL di-warm-up di background (gagal = peringatan konsol, bukan crash); semua fetch boot punya timeout.                                                            |
| Search | Menggantung / kosong palsu / hasil basi / `TypeError` render                | Hasil muncul; "tidak ada hasil" = empty state; semua provider gagal = **pesan error + tombol "Try again"**; watchdog 40 dtk; hanya query terakhir yang tampil; kosong tidak di-cache. |
| Rotasi | 2N × 9 dtk tanpa batas total                                                | Deadline total (30 dtk default, 15 dtk search, 20 dtk stream, 8 dtk `/info/`); `AbortError` diteruskan.                                                                               |
| Stream | Semua respons `/trackManifests/` valid ditolak                              | Validator mengikuti kontrak upstream (`data.data.attributes.uri`); manifest bertanda tangan diunduh dengan timeout 15 dtk; gagal → fallback `/track/`; pesan error gabungan.          |
| Player | Gagal diam-diam                                                             | Ikon kembali ke Play + toast alasan; autoplay diblokir → "Press Play"; error `<audio>` ditampilkan.                                                                                   |
| PWA    | Worker rusak (workbox hilang), cache-first lama bisa menyajikan bundel basi | Worker mandiri: aktif langsung, hapus cache lama, **network-first** dengan revalidasi (redeploy langsung terlihat), cache hanya saat offline/lambat/5xx.                              |

Yang **sengaja tidak** dilakukan (sesuai PRD): tidak ada proxy/penyamaran origin, tidak ada bypass pengecekan domain/auth, tidak ada kredensial
baru, tidak ada endpoint cadangan yang di-hardcode, tidak ada data/audio palsu, tema/logo/layout/nama tidak berubah, wrapper `desktop/` dan `mobile/` tidak disentuh.

## 3. File yang berubah

Di-deploy (hanya dua):

| File                                  | Alasan                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `HidzMusify/assets/index-Dg7h0oU_.js` | 23 patch exact-match (R1–R6), dihasilkan oleh `patches/apply-patches.mjs`. Nama file **sama** (lihat catatan cache di bawah). |
| `HidzMusify/sw.js`                    | Diganti service worker mandiri tanpa workbox (R7).                                                                            |

Tidak di-deploy (alat & bukti): `patches/` (patcher + helper + README), `tests/` (44 tes e2e + README), `package.json`, `eslint.config.mjs`,
`.prettierrc.json`, `PERBAIKAN.md`.

Sengaja **tidak diubah**: `HidzMusify/assets/sw.js` — ternyata halaman 404 EdgeOne ("Tencent Edgeone"), bukan service worker. Tes membuktikan tidak ada
berkas di build yang merujuknya, tetapi PRD melarang menghapus berkas tanpa bukti penuh (mis. konfigurasi CDN), jadi saya hanya melaporkannya. Aman dihapus
setelah kamu cek bahwa tidak ada aturan EdgeOne yang menunjuk ke sana.

Mengapa bundel di-patch, bukan dibangun ulang: repo hanya berisi hasil build (tanpa `src/`/`package.json`), dan registry npm diblokir di lingkungan kerja ini.
Source referensi (Monochrome v2.5.1) tersedia, tetapi tidak identik dengan bundel HidzMusify (mis. v2.5.1 memanggil `/trackManifests/` tanpa validator respons, sedangkan bundel punya validator
yang bermasalah itu), jadi menimpa bundel dengan hasil build Monochrome akan menghilangkan perbedaan/kustomisasi yang ada di build HidzMusify. Patcher gagal-keras jika bundel berubah, dan hasilnya diverifikasi ulang (byte-identik) tiap kali dijalankan.

## 4. Validasi (perintah yang benar-benar dijalankan)

| Perintah                                                                               | Hasil                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node patches/apply-patches.mjs <asli> HidzMusify/assets/index-Dg7h0oU_.js`            | 23/23 patch cocok, `node --check` lolos; keluaran byte-identik antar-run                                                                                                                                                                                                                                   |
| `node --check` pada semua `assets/*.js` (kecuali `assets/sw.js` yang HTML) dan `sw.js` | Lolos (build asli: bundel utama `SyntaxError`)                                                                                                                                                                                                                                                             |
| `eslint .` (patches/, tests/, sw.js)                                                   | 0 masalah                                                                                                                                                                                                                                                                                                  |
| `prettier --check` (file milik perbaikan, konfigurasi Monochrome)                      | Lolos                                                                                                                                                                                                                                                                                                      |
| `node --test --test-force-exit tests/e2e/*.test.mjs` (build perbaikan)                 | **44/44 lulus** (boot 6 · search 12 · playback 12 · resilience 6 · sw 8)                                                                                                                                                                                                                                   |
| Sama, dengan `HIDZ_ROOT=` build asli (dijalankan 2×, dibatasi timeout)                 | Boot **0/6**; tes playback, resilience, search, dan SW yang sempat selesai **semua gagal** (kecuali 2 tes sepele: query kosong tidak memanggil API, dan `assets/sw.js` tidak direferensikan). Sisanya dibatalkan timeout karena halaman tidak pernah boot, jadi suite tidak selesai penuh pada build asli. |

Tidak bisa dijalankan di sini: `vite build` / `npm run build` (tidak ada source & toolchain; npm diblokir) dan tes terhadap endpoint produksi (egress diblokir kebijakan).
Tidak ada tes yang di-skip atau dihapus; dua tes SW yang sempat gagal ternyata bug di tes saya (Playwright tidak menunggu predikat async) dan diperbaiki di tesnya, bukan di worker.

## 5. Tes manual setelah deploy

1. Deploy folder `HidzMusify/` (lihat catatan cache di bawah), buka situs dengan hard refresh (Ctrl+Shift+R).
2. DevTools → Application → Service Workers: `sw.js` berstatus _activated_; Cache Storage hanya berisi `hidzmusify-shell-…`.
3. Cari "daft punk": hasil muncul. Matikan jaringan lalu cari kata lain: harus muncul pesan error + "Try again" (bukan spinner abadi). Nyalakan, klik "Try again".
4. Klik lagu: audio berbunyi, bar waktu maju. Coba lagu lain, pause, seek.
5. Reload saat offline: shell tetap terbuka.
6. Perhatikan Network: jika semua host API gagal/403, pesan error harus tampil dalam ≤ ~30 dtk — itu berarti masalahnya di endpoint/domain, bukan di kode.

## 6. Status streaming

- **Dibuktikan (lingkungan tes, mock berkontrak upstream):** boot, search, klik Play → audio nyata terputar (`currentTime` maju), pause/seek/ganti lagu, fallback `/track/`, pesan error saat provider mati/timeout/respons sampah.
- **Belum dibuktikan / bergantung pada pihak luar:** endpoint produksi sedang hidup, mengizinkan origin/domain HidzMusify, dan bentuk respons nyatanya persis sesuai kontrak. Perbaikan R5 didasarkan pada tipe kontrak upstream
  (`TrackManifestAttributes` di Monochrome `js/HiFi.ts`), **bukan tangkapan respons live**. README Monochrome menyatakan API resminya dapat menolak domain tidak resmi; itu tidak dicoba dilewati.

## 7. Batasan tersisa & langkah konkret

1. **Verifikasi endpoint dari komputermu.** Dari browser/terminal biasa: `curl -sI https://api.monochrome.tf/search/?s=test` dan host lain di `instances.json`; cek status & header CORS untuk origin domainmu.
   Jika 403/CORS ditolak, minta izin/daftarkan domain ke penyedia, atau jalankan instance hifi-API milik sendiri dan tambahkan di `instances.json` (`api`/`streaming`) atau di Settings (disimpan di `localStorage["monochrome-user-api-instances-v1"]`). Jangan hardcode satu backup seolah selalu hidup.
2. **Purge cache saat deploy.** Nama bundel tidak berubah, jadi purge `/assets/index-Dg7h0oU_.js`, `/sw.js`, `/index.html` di CDN/EdgeOne. Rekomendasi header: `Cache-Control: no-cache` untuk `index.html` dan `sw.js`.
   Pengguna yang sudah punya service worker lama akan otomatis dibebaskan (tes "upgrade"); pengguna tanpa SW butuh hard refresh bila CDN belum di-purge.
3. **Kredensial TIDAL ter-hardcode di bundel** (bawaan upstream). Pastikan kamu berhak memakainya; pertimbangkan merotasi/menghapus. Tidak diubah di sini.
4. **Bundel adalah build output yang di-patch tangan.** Rekomendasi: pulihkan source HidzMusify asli (atau fork Monochrome v2.5.1 + kustomisasi), pindahkan 23 patch ke source, bangun ulang dengan Vite. Migrasi ke alur `tracks.monochrome.st` yang lebih baru hanya dengan izin penyedia.
5. **Latensi:** percobaan Qobuz-first bisa menambah hingga ~32 dtk sebelum jalur TIDAL (perilaku bawaan, tidak diubah).
6. **Pesan UI berbahasa Inggris** agar konsisten dengan UI; terpusat di `__hzMsg` pada `patches/prelude.js` bila ingin diterjemahkan.
7. `HidzMusify/README.md` bawaan menyebut `sw.js` "sudah lengkap"; pernyataan itu sudah tidak berlaku (lihat R7). README itu tidak diubah.
8. `HidzMusify/assets/sw.js` (halaman 404 EdgeOne) — hapus setelah memastikan tidak ada aturan CDN yang menunjuk ke sana.

## 8. Catatan untuk repo GitHub (Hidz346/hidzmusify)

Pada saat pemeriksaan, `master` (commit `84d3326`) punya perbaikan sebelumnya: `index.html` memuat `assets/index-HzSearchFix1.js` (+ `assets/tracks-fallback.mjs`, `docs/SEARCH-STREAMING-FALLBACK.md`, `tests/tracks-fallback.test.mjs`).
Bundel itu **masih memuat `SyntaxError` yang sama** (`const e` ganda; `node --check` gagal), jadi halaman tetap tidak boot walau fallback Tracks API-nya ada. Paket perbaikan ini:

- mengembalikan `index.html` agar memuat `assets/index-Dg7h0oU_.js` (yang sekarang sudah diperbaiki; hanya satu baris `<script type="module">` yang berubah, sisanya identik dengan `index.html` asli),
- mengganti `sw.js`,
- **tidak** menghapus `index-HzSearchFix1.js`, `tracks-fallback.mjs`, dan tes/CI lama (CI `tracks-fallback` tetap 4/4 lulus). Berkas-berkas itu kini tidak dipakai halaman. Setelah kamu yakin, `git rm assets/index-HzSearchFix1.js` aman (tidak ada yang merujuknya selain `index.html` lama).
- Fallback `tracks.monochrome.st` dari perbaikan lama tidak dimasukkan: PRD mensyaratkan migrasi ke alur itu hanya dengan izin penyedia, dan belum bisa diverifikasi dari sini.
