# Ujian Digital SD — Frontend (GitHub Pages)

Frontend statis (HTML/CSS/JS) untuk aplikasi Ujian Digital SD. Data dan logika ujian ada di Google Apps Script (REST API), bukan di repository ini.

```
index.html
css/style.css
js/config.js   ← isi GAS_URL di sini
js/api.js
js/core.js     ← login, shell, dashboard, data master, akun, pengaturan
js/soal.js     ← bank soal, impor Excel/Word, hasil nilai, asisten AI
js/siswa.js    ← daftar ujian & ruang pengerjaan siswa
```

Langkah pasang: lihat `PANDUAN-INSTALASI.md`. Berkas backend (`Kode.gs`) sengaja tidak ada di sini.
