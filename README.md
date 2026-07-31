# HidzMusify — Multi-Platform Support

## Kenapa selama ini cuma jalan di web?

Karena `HidzMusify/` isinya adalah **web app murni** (HTML/CSS/JS hasil
build) — cuma bisa dibuka lewat browser karena tidak ada "pembungkus" native
untuk tiap OS. Windows butuh `.exe`, macOS butuh `.dmg`, Linux butuh
`.AppImage`/`.deb`, Android butuh `.apk`, iOS butuh `.ipa` — semuanya format
yang berbeda-beda, dan web app biasa tidak otomatis jadi salah satu dari itu.

**Kabar baiknya:** kode `HidzMusify/` kamu sudah saya cek — `manifest.json`,
`sw.js`, semua file JSON valid, tidak ada yang error. Jadi tidak ada yang perlu
diperbaiki di situ, saya tidak menyentuh satu pun file di dalam folder itu.

## Solusi yang saya siapkan (2 lapis)

### 1. PWA — sudah otomatis jalan hari ini, gratis, tanpa build apa pun

`HidzMusify/manifest.json` dan `sw.js` kamu **sudah lengkap** (icon semua
ukuran, `display: standalone`, service worker offline caching). Ini berarti:

- **Windows/macOS/Linux (Chrome/Edge):** klik ikon install di address bar →
  jadi app dengan window sendiri, ada di Start Menu/Dock.
- **Android (Chrome):** menu → "Install app" / "Add to Home screen".
- **iOS (Safari):** tombol Share → "Add to Home Screen".

Ini sudah "app" beneran (bukan cuma shortcut), cuma belum berupa file
installer `.exe`/`.apk` yang bisa dibagikan atau naikkan ke store.

### 2. Installer native — folder baru yang saya tambahkan

```
desktop/    → Electron, hasil: HidzMusify.exe (Win), .dmg (macOS), .AppImage/.deb (Linux)
mobile/     → Capacitor, hasil: .apk/.aab (Android), project Xcode untuk .ipa (iOS)
.github/workflows/  → build otomatis di GitHub, tanpa install apa pun di laptop kamu
```

Keduanya **cuma membaca** folder `HidzMusify/` sebagai file statis lewat
server lokal — tidak mengubah, menyalin-modifikasi, atau membongkar isi
`HidzMusify/` sama sekali.

## Cara pakai

**1. Taruh folder ini** (`desktop/`, `mobile/`, `.github/`, `README.md`) di
level yang sama dengan folder `HidzMusify/`, jadi strukturnya:

```
project-kamu/
├── HidzMusify/     ← punya kamu, tidak disentuh
├── desktop/         ← baru
├── mobile/           ← baru
└── .github/workflows/  ← baru
```

**2. Build desktop** (butuh Node.js di laptop):

```bash
cd desktop
npm install
npm run dist          # semua platform sesuai OS kamu saat ini
npm run dist:win       # khusus Windows (cross-build dari macOS/Linux juga bisa)
npm run dist:mac       # khusus macOS (harus jalan di macOS)
npm run dist:linux     # khusus Linux
```

Hasil installer ada di `desktop/dist/`.

**3. Build mobile** — lihat `mobile/README.md` untuk langkah lengkap Android
& iOS (butuh Android Studio / Xcode).

**4. Cara paling gampang — biarkan GitHub yang build:**
Push folder ini ke GitHub, lalu di tab **Actions** jalankan workflow
"Build Desktop App" (hasil: exe/dmg/AppImage/deb otomatis) atau
"Build Android APK" (hasil: apk). Tidak perlu install Electron/Android Studio
di komputer kamu sama sekali.

## Batasan yang perlu kamu tahu

- Saya tidak punya akses internet di lingkungan kerja saya sekarang, jadi saya
  **belum bisa menjalankan `npm install` / build sungguhan** untuk
  menghasilkan file `.exe`/`.apk` langsung di sini. Semua kode di atas sudah
  saya cek strukturnya (valid, tidak ada syntax error) dan siap dijalankan —
  tinggal `npm install` di komputer kamu atau lewat GitHub Actions.
- iOS **wajib** di-build lewat macOS + Xcode — ini aturan Apple, bukan
  batasan dari setup ini.
- Semua fitur streaming/API di HidzMusify tetap butuh internet seperti biasa,
  di platform apa pun — bagian yang berubah di sini cuma cara app-nya
  dibuka/dipasang, bukan cara kerja di dalamnya.
