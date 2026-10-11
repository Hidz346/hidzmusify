# HidzMusify — Laporan Perbaikan Search & Streaming

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
