// Preload script HidzMusify Desktop.
// Sengaja dikosongkan (contextIsolation aktif, nodeIntegration mati) supaya
// halaman web tetap berjalan sama persis seperti di browser biasa.
//
// Kalau nanti butuh fitur khusus desktop (mis. notifikasi native, tray icon,
// shortcut keyboard global), tambahkan lewat contextBridge di sini:
//
// const { contextBridge } = require('electron');
// contextBridge.exposeInMainWorld('hidzDesktop', {
//   version: process.versions.electron,
// });
