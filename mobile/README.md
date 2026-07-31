# HidzMusify Mobile (Android & iOS)

Folder ini membungkus `HidzMusify/` (tidak diubah sama sekali) jadi app native
Android dan iOS pakai [Capacitor](https://capacitorjs.com/).

## Setup awal (sekali saja)

```bash
cd mobile
npm install
npx cap add android   # butuh Android Studio + JDK 17 terpasang
npx cap add ios        # butuh macOS + Xcode terpasang
```

Perintah di atas akan membuat folder `android/` dan `ios/` — **jangan di-commit**
ke git kalau mau repo tetap ringkas, karena bisa dibuat ulang kapan saja dari
`capacitor.config.json`.

## Setiap kali file di `HidzMusify/` berubah

```bash
npx cap sync
```

Ini menyalin ulang isi `HidzMusify/` ke project Android/iOS.

## Build APK/AAB Android

```bash
npx cap open android
```

Lalu di Android Studio: **Build → Generate Signed Bundle / APK**.
Atau tanpa buka Android Studio:

```bash
cd android
./gradlew assembleDebug     # hasil: app/build/outputs/apk/debug/*.apk
./gradlew bundleRelease     # untuk upload ke Play Store (butuh signing key)
```

## Build iOS (.ipa)

```bash
npx cap open ios
```

Lalu di Xcode: pilih device/simulator → **Product → Archive**.

> **Catatan penting:** build iOS **wajib** pakai macOS + Xcode — ini aturan dari
> Apple sendiri, bukan batasan dari setup ini. Untuk pasang di iPhone sendiri
> cukup Apple ID gratis (berlaku 7 hari, perlu re-sign berkala). Untuk rilis ke
> App Store butuh Apple Developer Program (berbayar, tahunan) + sertifikat
> signing.

## Alternatif tanpa install Android Studio/Xcode

Lihat `.github/workflows/build-mobile-android.yml` di root project — GitHub
Actions bisa build APK Android otomatis di server (gratis, tidak perlu install
apa pun di komputer kamu). Build iOS otomatis butuh runner macOS + kredensial
signing Apple kamu sendiri sebagai GitHub Secrets.
