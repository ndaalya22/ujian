/**
 * ============================================================
 * UJIAN DIGITAL SD — Backend (Kode.gs)
 * Platform : Google Apps Script + Sheets + Drive + Gmail
 * Versi    : 1.0  (berdasarkan PRD FINAL 12 Okt 2026)
 * ============================================================
 */

// ── Konstanta Global ──
const APP_NAME = 'Ujian Digital SD';
const FOLDER_NAME = 'Folder_UjianDigitalSD';
const SS_NAME = 'DB_UjianDigitalSD';
const SESSION_TTL = 21600;      // 6 jam (batas maksimum CacheService)
const TZ_OFFSET = '+07:00';     // WIB
const GRACE_MS = 45000;         // toleransi jaringan saat kirim jawaban akhir

// Struktur sheet (nilai & tanggal disimpan sebagai teks agar tidak diubah otomatis oleh Sheets)
const SHEETS = {
  Siswa: ['ID', 'Nama', 'NISN', 'NIS', 'TempatLahir', 'TanggalLahir', 'Kelas', 'EmailOrtu'],
  Guru: ['ID', 'Nama', 'Email', 'MapelDiampu', 'KelasDiampu'],
  Akun: ['ID', 'Username', 'Hash', 'Salt', 'Peran', 'RefID', 'Status'],
  MataPelajaran: ['ID', 'Nama'],
  Ujian: ['ID', 'MapelID', 'Kelas', 'Triwulan', 'TahunAjaran', 'Mulai', 'Selesai', 'DurasiMenit', 'Status'],
  BankSoal: ['ID', 'MapelID', 'Jenis', 'Teks', 'GambarID', 'Pilihan', 'Kunci', 'Bobot', 'Pembuat'],
  Sesi: ['ID', 'UjianID', 'SiswaID', 'Mulai', 'Deadline', 'Status'],
  Jawaban: ['ID', 'UjianID', 'SiswaID', 'Jawaban', 'WaktuSimpan'],
  Nilai: ['ID', 'UjianID', 'SiswaID', 'SkorPG', 'SkorPGK', 'SkorBS', 'NilaiAkhir', 'WaktuSubmit', 'StatusEmail'],
  Pengaturan: ['Key', 'Value']
};

const DEFAULT_CONFIG = {
  appName: APP_NAME, sekolah: 'SD Negeri Nusantara 01', logoUrl: '',
  tahunAjaranAktif: '2026/2027', kkm: '75',
  bobotPG: '30', bobotPGK: '30', bobotBS: '40',
  jumlahPG: '30', jumlahPGK: '30', jumlahBS: '40',
  modePGK: 'penuh',           // 'penuh' = harus semua benar, 'sebagian' = nilai parsial
  tampilNilaiSiswa: 'tidak',  // 'ya' = siswa langsung lihat nilai
  emailSubject: 'Hasil Ujian {mapel} — {nama}'
};

// ── Helper umum ──
function buildResponse(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function createResponse(success, data, message) { return { success: success, data: data, message: message || '' }; }
function uid() { return Utilities.getUuid(); }

// ============================================================
// ENTRY POINTS — GAS sebagai pure REST API (JSON)
// ============================================================
function doGet(e) {
  try {
    const a = (e && e.parameter && e.parameter.action) || 'ping';
    if (a === 'infoPublik') return buildResponse(infoPublik());
    return buildResponse(createResponse(true, { app: APP_NAME, status: 'online' }));
  } catch (err) { return buildResponse(createResponse(false, null, err.message)); }
}
/** Semua aksi lewat POST (token sesi di body). Body: {action, token, payload} */
function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.action === 'login') return buildResponse(login(b.username, b.password));
    if (b.action === 'infoPublik') return buildResponse(infoPublik());
    if (b.action === 'keluar') return buildResponse(keluar(b.token));
    return buildResponse(api(b.token, b.action, b.payload));
  } catch (err) { return buildResponse(createResponse(false, null, err.message)); }
}

// ============================================================
// AUTO-SETUP (jalankan sekali dari editor)
// ============================================================
function setupAppEnvironment() {
  try {
    const props = PropertiesService.getScriptProperties();
    let ss;
    const savedId = props.getProperty('spreadsheetId');
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    const main = folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
    const sub = n => { const it = main.getFoldersByName(n); return it.hasNext() ? it.next() : main.createFolder(n); };
    const gambar = sub('Gambar Soal'), unggah = sub('Unggahan Soal'), pdf = sub('PDF Hasil Ujian');

    if (savedId) { ss = SpreadsheetApp.openById(savedId); }
    else { ss = SpreadsheetApp.create(SS_NAME); DriveApp.getFileById(ss.getId()).moveTo(main); }
    props.setProperty('spreadsheetId', ss.getId());
    _ss = ss;

    const baru = {};
    Object.keys(SHEETS).forEach(name => {
      let sh = ss.getSheetByName(name);
      if (!sh) {
        sh = ss.insertSheet(name); baru[name] = true;
        const h = SHEETS[name];
        sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');
        sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#2F6FED').setFontColor('#ffffff');
        sh.setFrozenRows(1);
      }
    });
    const def = ss.getSheetByName('Sheet1');
    if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

    // Pengaturan awal
    if (baru.Pengaturan) {
      const cfgRows = Object.keys(DEFAULT_CONFIG).map(k => [k, DEFAULT_CONFIG[k]]);
      cfgRows.push(['folderId', main.getId()], ['gambarFolderId', gambar.getId()], ['unggahFolderId', unggah.getId()], ['pdfFolderId', pdf.getId()]);
      appendRows('Pengaturan', cfgRows.map(r => ({ Key: r[0], Value: r[1] })));
    }

    // Data contoh (hanya saat sheet baru dibuat)
    if (baru.MataPelajaran) {
      ['PAI', 'PPKN', 'Bahasa Indonesia', 'Matematika', 'PJOK', 'SBDP', 'Bahasa Inggris', 'Bahasa Sunda']
        .forEach(n => appendRows('MataPelajaran', [{ ID: uid(), Nama: n }]));
    }
    const mtk = tbl('MataPelajaran').rows.find(m => m.Nama === 'Matematika');
    if (baru.Guru) appendRows('Guru', [{ ID: 'G-001', Nama: 'Bu Rina, S.Pd.', Email: 'rina@contoh.sch.id', MapelDiampu: mtk.ID, KelasDiampu: '4-A,4-B' }]);
    if (baru.Siswa) {
      appendRows('Siswa', [
        { ID: 'S-001', Nama: 'Budi Anggara Pratama', NISN: '0123984510', NIS: '1001', TempatLahir: 'Bekasi', TanggalLahir: '2016-03-12', Kelas: '4-A', EmailOrtu: '' },
        { ID: 'S-002', Nama: 'Anisa Safitri', NISN: '0123984511', NIS: '1002', TempatLahir: 'Cikarang', TanggalLahir: '2016-07-02', Kelas: '4-A', EmailOrtu: '' },
        { ID: 'S-003', Nama: 'Bagas Ardiansyah', NISN: '0123984512', NIS: '1003', TempatLahir: 'Bekasi', TanggalLahir: '2016-01-21', Kelas: '4-A', EmailOrtu: '' }]);
    }
    if (baru.Akun) {
      buatAkunRaw('admin', 'admin123', 'admin', 'ADMIN');
      buatAkunRaw('guru1', 'guru123', 'guru', 'G-001');
      ['0123984510', '0123984511', '0123984512'].forEach((n, i) => buatAkunRaw(n, 'siswa123', 'siswa', 'S-00' + (i + 1)));
    }
    if (baru.BankSoal) {
      const P = (j, t, pil, k, b) => ({ ID: uid(), MapelID: mtk.ID, Jenis: j, Teks: t, GambarID: '', Pilihan: JSON.stringify(pil), Kunci: k, Bobot: String(b), Pembuat: 'Setup' });
      appendRows('BankSoal', [
        P('PG', 'Pak Surya memiliki kebun persegi panjang. Panjang 24 meter dan lebar 15 meter. Berapakah keliling kebun?', ['68 meter', '78 meter', '84 meter', '360 meter'], 'B', 1),
        P('PG', 'Hasil dari 125 + 75 adalah ...', ['190', '200', '210', '220'], 'B', 1),
        P('PGK', 'Manakah bangun datar berikut yang memiliki 4 sisi sama panjang dan 4 sudut siku-siku?', ['Persegi', 'Persegi Panjang', 'Belah Ketupat', 'Kubus'], 'A', 1),
        P('PGK', 'Pilih semua bilangan genap.', ['12', '15', '20', '27'], 'A,C', 1),
        P('BS', 'Hasil dari 250 + 150 × 2 adalah sama dengan 800.', [], 'S', 1),
        P('BS', 'Tentukan benar atau salah tiap pernyataan.', ['Segitiga sama sisi memiliki 3 sumbu simetri', 'Persegi memiliki 2 sumbu simetri'], 'B,S', 1)]);
    }
    if (baru.Ujian) {
      const now = new Date(), fmt = d => Utilities.formatDate(d, 'Asia/Jakarta', "yyyy-MM-dd'T'HH:mm");
      appendRows('Ujian', [{ ID: uid(), MapelID: mtk.ID, Kelas: '4-A', Triwulan: '1', TahunAjaran: DEFAULT_CONFIG.tahunAjaranAktif,
        Mulai: fmt(new Date(now.getTime() - 86400000)), Selesai: fmt(new Date(now.getTime() + 30 * 86400000)), DurasiMenit: '90', Status: 'Aktif' }]);
    }
    pasangTrigger();
    Logger.log('✅ Setup selesai.\n📁 Folder: ' + main.getUrl() + '\n📊 Spreadsheet: ' + ss.getUrl());
    Logger.log('Login awal → admin / admin123 | guru1 / guru123 | siswa: NISN 0123984510 / siswa123 (SEGERA GANTI)');
    return createResponse(true, { spreadsheet: ss.getUrl(), folder: main.getUrl() }, 'Setup berhasil');
  } catch (err) { Logger.log('❌ ' + err.message); return createResponse(false, null, err.message); }
}

/** Trigger pengiriman email massal tiap 5 menit (idempotent) */
function pasangTrigger() {
  const ada = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'kirimEmailAntrean');
  if (!ada) ScriptApp.newTrigger('kirimEmailAntrean').timeBased().everyMinutes(5).create();
}

// ============================================================
// AKSES SHEET (batch) & CACHE
// ============================================================
let _ss = null;
function getSS() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty('spreadsheetId');
  if (!id) throw new Error('Aplikasi belum disiapkan. Jalankan setupAppEnvironment() dahulu.');
  return (_ss = SpreadsheetApp.openById(id));
}
function tbl(name) {
  const sh = getSS().getSheetByName(name);
  const v = sh.getDataRange().getValues();
  const headers = v[0];
  const rows = v.slice(1).filter(r => r[0] !== '' && r[0] !== null).map(r => { const o = {}; headers.forEach((k, i) => o[k] = r[i] === null ? '' : String(r[i])); return o; });
  return { sh: sh, headers: headers, rows: rows };
}
function appendRows(name, objs) {
  if (!objs.length) return;
  const sh = getSS().getSheetByName(name), h = SHEETS[name];
  const start = sh.getLastRow() + 1;
  if (start + objs.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), objs.length + 50);
  sh.getRange(start, 1, objs.length, h.length).setNumberFormat('@')
    .setValues(objs.map(o => h.map(k => o[k] === undefined || o[k] === null ? '' : String(o[k]))));
}
function rowOf(name, key) {   // cari baris dari ID (kolom A) memakai TextFinder → cepat
  const sh = getSS().getSheetByName(name);
  const last = sh.getLastRow(); if (last < 2) return 0;
  const f = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(key)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}
function writeRow(name, row, obj) {
  const sh = getSS().getSheetByName(name), h = SHEETS[name];
  sh.getRange(row, 1, 1, h.length).setNumberFormat('@').setValues([h.map(k => obj[k] === undefined ? '' : String(obj[k]))]);
}
function readRow(name, row) {
  const sh = getSS().getSheetByName(name), h = SHEETS[name];
  const v = sh.getRange(row, 1, 1, h.length).getValues()[0]; const o = {}; h.forEach((k, i) => o[k] = String(v[i])); return o;
}
function hapusBaris(name, predikat) {   // hapus dari bawah agar indeks tidak bergeser
  const t = tbl(name); const v = t.sh.getDataRange().getValues(); let n = 0;
  for (let i = v.length - 1; i >= 1; i--) {
    const o = {}; t.headers.forEach((k, j) => o[k] = String(v[i][j]));
    if (predikat(o)) { t.sh.deleteRow(i + 1); n++; }
  }
  return n;
}
function withLock(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); return fn(); }
  catch (e) { throw new Error(e.message.indexOf('lock') >= 0 ? 'Sistem sedang sibuk, coba lagi sebentar.' : e.message); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}
function cacheGet(k) { try { const v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cachePut(k, v, ttl) { try { CacheService.getScriptCache().put(k, JSON.stringify(v), ttl || 600); } catch (e) { /* terlalu besar → lewati */ } }
function cacheDel(k) { try { CacheService.getScriptCache().remove(k); } catch (e) {} }

let _cfg = null;
function cfg() {
  if (_cfg) return _cfg;
  let c = cacheGet('cfg');
  if (!c) { c = Object.assign({}, DEFAULT_CONFIG); tbl('Pengaturan').rows.forEach(r => c[r.Key] = r.Value); cachePut('cfg', c, 600); }
  return (_cfg = c);
}
function waktu(s) { if (!s) return NaN; s = String(s).replace(' ', 'T'); if (s.length === 16) s += ':00'; return new Date(s + TZ_OFFSET).getTime(); }

// ============================================================
// AUTENTIKASI & SESI
// ============================================================
function hashPw(pw, salt) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function buatAkunRaw(username, pw, peran, refId) {
  const salt = uid().slice(0, 8);
  appendRows('Akun', [{ ID: uid(), Username: username, Hash: hashPw(pw, salt), Salt: salt, Peran: peran, RefID: refId, Status: 'Aktif' }]);
}
function sandiAcak() { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

/** Login — satu-satunya fungsi publik tanpa token */
function login(username, password) {
  try {
    username = String(username || '').trim(); password = String(password || '');
    if (!username || !password) return createResponse(false, null, 'Username dan kata sandi wajib diisi.');
    const key = 'gagal_' + username.toLowerCase();
    const gagal = Number(CacheService.getScriptCache().get(key) || 0);
    if (gagal >= 5) return createResponse(false, null, 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
    const akun = tbl('Akun').rows.find(a => a.Username.toLowerCase() === username.toLowerCase());
    if (!akun || akun.Hash !== hashPw(password, akun.Salt)) {
      CacheService.getScriptCache().put(key, String(gagal + 1), 600);
      return createResponse(false, null, 'Akun tidak ditemukan atau kata sandi salah.');
    }
    if (akun.Status !== 'Aktif') return createResponse(false, null, 'Akun tidak aktif. Hubungi wali kelas atau admin.');
    const user = { akunId: akun.ID, username: akun.Username, peran: akun.Peran, refId: akun.RefID, nama: 'Administrator', kelas: '', nisn: '' };
    if (akun.Peran === 'siswa') { const s = tbl('Siswa').rows.find(x => x.ID === akun.RefID); if (!s) return createResponse(false, null, 'Data siswa tidak ditemukan.'); user.nama = s.Nama; user.kelas = s.Kelas; user.nisn = s.NISN; }
    if (akun.Peran === 'guru') { const g = tbl('Guru').rows.find(x => x.ID === akun.RefID); if (g) user.nama = g.Nama; }
    CacheService.getScriptCache().remove(key);
    const token = uid();
    cachePut('sess_' + token, user, SESSION_TTL);
    return createResponse(true, { token: token, user: user }, 'OK');
  } catch (e) { return createResponse(false, null, e.message); }
}
function getSession(token) { return token ? cacheGet('sess_' + token) : null; }
function aksiLogout(user, p) { return createResponse(true); }

/** Info publik untuk halaman pengantar & login (tanpa data sensitif) */
function infoPublik() {
  try { const c = cfg(); return createResponse(true, { sekolah: c.sekolah, appName: c.appName, logoUrl: c.logoUrl }); }
  catch (e) { return createResponse(false, null, e.message); }
}
/** Hapus sesi di server saat keluar portal */
function keluar(token) { try { if (token) cacheDel('sess_' + token); } catch (e) {} return createResponse(true); }

/** Dispatcher tunggal: semua panggilan terautentikasi lewat sini (RBAC dicek di server) */
function api(token, action, payload) {
  try {
    const user = getSession(token);
    if (!user) return createResponse(false, null, 'SESI_HABIS');
    const r = ROUTES[action];
    if (!r) return createResponse(false, null, 'Aksi tidak dikenal.');
    if (r.roles.indexOf(user.peran) < 0) return createResponse(false, null, 'Anda tidak memiliki hak akses.');
    return r.fn(user, payload || {});
  } catch (e) { return createResponse(false, null, e.message); }
}

function aksiBootstrap(user) {
  const mapel = tbl('MataPelajaran').rows;
  const c = cfg();
  const pub = { appName: c.appName, sekolah: c.sekolah, logoUrl: c.logoUrl, tahunAjaranAktif: c.tahunAjaranAktif, kkm: c.kkm, jumlahPG: c.jumlahPG, jumlahPGK: c.jumlahPGK, jumlahBS: c.jumlahBS, modePGK: c.modePGK, tampilNilaiSiswa: c.tampilNilaiSiswa };
  let data = { user: user, mapel: mapel, cfg: pub, kelas: [] };
  if (user.peran !== 'siswa') {
    data.kelas = Array.from(new Set(tbl('Siswa').rows.map(s => s.Kelas).filter(Boolean))).sort();
    if (user.peran === 'guru') { const sc = scopeGuru(user); data.mapel = mapel.filter(m => sc.mapel.indexOf(m.ID) >= 0); data.kelas = data.kelas.filter(k => sc.kelas.indexOf(k) >= 0); }
  }
  return createResponse(true, data);
}
function aksiGantiSandi(user, p) {
  if (!p.baru || String(p.baru).length < 6) return createResponse(false, null, 'Kata sandi baru minimal 6 karakter.');
  const row = rowOf('Akun', user.akunId); const a = readRow('Akun', row);
  if (a.Hash !== hashPw(p.lama || '', a.Salt)) return createResponse(false, null, 'Kata sandi lama salah.');
  a.Salt = uid().slice(0, 8); a.Hash = hashPw(p.baru, a.Salt); writeRow('Akun', row, a);
  return createResponse(true, null, 'Kata sandi berhasil diganti.');
}

// ============================================================
// RUANG LINGKUP GURU
// ============================================================
function scopeGuru(user) {
  const g = tbl('Guru').rows.find(x => x.ID === user.refId);
  const split = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  return { mapel: g ? split(g.MapelDiampu) : [], kelas: g ? split(g.KelasDiampu) : [] };
}
function bolehUjian(user, uj) {
  if (user.peran === 'admin') return true;
  const sc = scopeGuru(user); return sc.mapel.indexOf(uj.MapelID) >= 0 && sc.kelas.indexOf(uj.Kelas) >= 0;
}

// ============================================================
// CRUD DATA MASTER (admin)
// ============================================================
const ENTITAS = { siswa: 'Siswa', guru: 'Guru', mapel: 'MataPelajaran', ujian: 'Ujian' };

function aksiCrudList(user, p) {
  const name = ENTITAS[p.entitas]; if (!name) return createResponse(false, null, 'Entitas tidak valid.');
  let rows = tbl(name).rows;
  if (p.entitas === 'ujian' && user.peran === 'guru') rows = rows.filter(u => bolehUjian(user, u));
  return createResponse(true, rows);
}
function validasiEntitas(e, o, rows) {
  const wajib = { siswa: ['Nama', 'NISN', 'Kelas'], guru: ['Nama'], mapel: ['Nama'], ujian: ['MapelID', 'Kelas', 'Triwulan', 'TahunAjaran', 'Mulai', 'Selesai', 'DurasiMenit', 'Status'] }[e];
  wajib.forEach(k => { if (!String(o[k] || '').trim()) throw new Error('Kolom "' + k + '" wajib diisi.'); });
  if (e === 'siswa' && rows.some(r => r.NISN === String(o.NISN).trim() && r.ID !== o.ID)) throw new Error('NISN sudah terdaftar.');
  if (e === 'mapel' && rows.some(r => r.Nama.toLowerCase() === String(o.Nama).trim().toLowerCase() && r.ID !== o.ID)) throw new Error('Mata pelajaran sudah ada.');
  if (e === 'ujian') {
    if (!(Number(o.DurasiMenit) > 0)) throw new Error('Durasi harus lebih dari 0 menit.');
    if (!(waktu(o.Selesai) > waktu(o.Mulai))) throw new Error('Batas akhir harus setelah waktu mulai.');
  }
}
function aksiCrudSave(user, p) {
  const name = ENTITAS[p.entitas]; if (!name) return createResponse(false, null, 'Entitas tidak valid.');
  const o = p.data || {}; Object.keys(o).forEach(k => { if (typeof o[k] === 'string') o[k] = o[k].trim(); });
  validasiEntitas(p.entitas, o, tbl(name).rows);
  const hasil = withLock(() => {
    if (o.ID) { const r = rowOf(name, o.ID); if (!r) throw new Error('Data tidak ditemukan.'); writeRow(name, r, o); }
    else { o.ID = (p.entitas === 'siswa' ? 'S-' : p.entitas === 'guru' ? 'G-' : '') + (p.entitas === 'siswa' || p.entitas === 'guru' ? uid().slice(0, 6) : uid()); appendRows(name, [o]); }
    return o;
  });
  if (p.entitas === 'mapel') cacheDel('soal_' + hasil.ID);
  return createResponse(true, hasil, 'Data berhasil disimpan.');
}
function aksiCrudDelete(user, p) {
  const name = ENTITAS[p.entitas]; if (!name) return createResponse(false, null, 'Entitas tidak valid.');
  withLock(() => {
    if (p.entitas === 'siswa') hapusBaris('Akun', a => a.RefID === p.id && a.Peran === 'siswa');
    if (p.entitas === 'guru') hapusBaris('Akun', a => a.RefID === p.id && a.Peran === 'guru');
    if (p.entitas === 'mapel' && tbl('BankSoal').rows.some(s => s.MapelID === p.id)) throw new Error('Mata pelajaran masih memiliki soal. Hapus soalnya dahulu.');
    hapusBaris(name, r => r.ID === p.id);
  });
  return createResponse(true, null, 'Data dihapus.');
}

// ── Akun ──
function aksiAkunList() {
  const siswa = tbl('Siswa').rows, guru = tbl('Guru').rows;
  const rows = tbl('Akun').rows.map(a => {
    const ref = a.Peran === 'siswa' ? siswa.find(s => s.ID === a.RefID) : a.Peran === 'guru' ? guru.find(g => g.ID === a.RefID) : null;
    return { ID: a.ID, Username: a.Username, Peran: a.Peran, Status: a.Status, Nama: ref ? ref.Nama : (a.Peran === 'admin' ? 'Administrator' : '(data hilang)'), Kelas: ref && ref.Kelas ? ref.Kelas : '' };
  });
  const punya = new Set(tbl('Akun').rows.map(a => a.RefID));
  return createResponse(true, { akun: rows, tanpaAkun: siswa.filter(s => !punya.has(s.ID)).length + guru.filter(g => !punya.has(g.ID)).length });
}
function aksiAkunBuatOtomatis() {
  return createResponse(true, withLock(() => {
    const akun = tbl('Akun').rows, punya = new Set(akun.map(a => a.RefID)), dipakai = new Set(akun.map(a => a.Username.toLowerCase()));
    const hasil = [];
    tbl('Siswa').rows.filter(s => !punya.has(s.ID)).forEach(s => { const pw = sandiAcak(); if (dipakai.has(s.NISN.toLowerCase())) return; buatAkunRaw(s.NISN, pw, 'siswa', s.ID); hasil.push({ Nama: s.Nama, Kelas: s.Kelas, Username: s.NISN, Sandi: pw, Peran: 'siswa' }); });
    tbl('Guru').rows.filter(g => !punya.has(g.ID)).forEach(g => {
      let u = (g.Email ? g.Email.split('@')[0] : g.Nama.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10)) || 'guru'; let n = u, i = 1; while (dipakai.has(n.toLowerCase())) n = u + (++i);
      const pw = sandiAcak(); buatAkunRaw(n, pw, 'guru', g.ID); dipakai.add(n.toLowerCase()); hasil.push({ Nama: g.Nama, Kelas: '-', Username: n, Sandi: pw, Peran: 'guru' });
    });
    return hasil;
  }), 'Akun dibuat.');
}
function aksiAkunReset(user, p) {
  const r = rowOf('Akun', p.id); if (!r) return createResponse(false, null, 'Akun tidak ditemukan.');
  const a = readRow('Akun', r), pw = sandiAcak(); a.Salt = uid().slice(0, 8); a.Hash = hashPw(pw, a.Salt); writeRow('Akun', r, a);
  return createResponse(true, { Username: a.Username, Sandi: pw }, 'Kata sandi direset.');
}
function aksiAkunStatus(user, p) {
  const r = rowOf('Akun', p.id); if (!r) return createResponse(false, null, 'Akun tidak ditemukan.');
  const a = readRow('Akun', r); if (a.ID === user.akunId) return createResponse(false, null, 'Tidak dapat menonaktifkan akun sendiri.');
  a.Status = a.Status === 'Aktif' ? 'Nonaktif' : 'Aktif'; writeRow('Akun', r, a);
  return createResponse(true, { Status: a.Status }, 'Status diperbarui.');
}

// ── Pengaturan ──
function aksiPengaturanGet() { return createResponse(true, cfg()); }
function aksiPengaturanSimpan(user, p) {
  const izin = Object.keys(DEFAULT_CONFIG), v = p.data || {};
  const bobot = Number(v.bobotPG) + Number(v.bobotPGK) + Number(v.bobotBS);
  if (bobot !== 100) return createResponse(false, null, 'Total bobot PG + PG Kompleks + Benar/Salah harus 100 (sekarang ' + bobot + ').');
  withLock(() => {
    const t = tbl('Pengaturan');
    izin.forEach(k => {
      if (v[k] === undefined) return;
      const idx = t.rows.findIndex(r => r.Key === k);
      if (idx >= 0) t.sh.getRange(idx + 2, 2).setNumberFormat('@').setValue(String(v[k])); else appendRows('Pengaturan', [{ Key: k, Value: v[k] }]);
    });
  });
  cacheDel('cfg'); _cfg = null;
  return createResponse(true, null, 'Pengaturan disimpan.');
}

// ============================================================
// BANK SOAL
// ============================================================
function bolehMapel(user, mapelId) { return user.peran === 'admin' || scopeGuru(user).mapel.indexOf(mapelId) >= 0; }

function aksiSoalList(user, p) {
  let rows = tbl('BankSoal').rows;
  if (user.peran === 'guru') { const m = scopeGuru(user).mapel; rows = rows.filter(s => m.indexOf(s.MapelID) >= 0); }
  if (p.mapelId) rows = rows.filter(s => s.MapelID === p.mapelId);
  return createResponse(true, rows);
}
function bersihSoal(o) {
  const jenis = String(o.Jenis || '').toUpperCase();
  if (['PG', 'PGK', 'BS'].indexOf(jenis) < 0) throw new Error('Jenis soal harus PG, PGK, atau BS.');
  if (!String(o.Teks || '').trim()) throw new Error('Teks soal wajib diisi.');
  let pil = o.Pilihan; if (typeof pil === 'string') { try { pil = JSON.parse(pil); } catch (e) { pil = []; } }
  pil = (pil || []).map(x => String(x).trim()).filter(Boolean);
  let kunci = String(o.Kunci || '').toUpperCase().replace(/\s/g, '').split(',').filter(Boolean);
  const huruf = 'ABCDE'.slice(0, pil.length).split('');
  if (jenis === 'PG') {
    if (pil.length < 2) throw new Error('Minimal 2 pilihan jawaban.');
    if (kunci.length !== 1 || huruf.indexOf(kunci[0]) < 0) throw new Error('Kunci PG harus satu huruf sesuai pilihan.');
  } else if (jenis === 'PGK') {
    if (pil.length < 2) throw new Error('Minimal 2 pilihan jawaban.');
    if (!kunci.length || kunci.some(k => huruf.indexOf(k) < 0)) throw new Error('Kunci PG Kompleks harus huruf-huruf sesuai pilihan (mis. A,C).');
  } else {
    const n = Math.max(pil.length, 1);
    if (kunci.length !== n || kunci.some(k => k !== 'B' && k !== 'S')) throw new Error('Kunci Benar/Salah harus ' + n + ' huruf B atau S dipisah koma.');
  }
  const bobot = Number(o.Bobot || 1); if (!(bobot > 0)) throw new Error('Bobot harus lebih dari 0.');
  return { ID: o.ID || '', MapelID: o.MapelID, Jenis: jenis, Teks: String(o.Teks).trim(), GambarID: o.GambarID || '', Pilihan: JSON.stringify(pil), Kunci: kunci.join(','), Bobot: String(bobot) };
}
function aksiSoalSimpan(user, p) {
  const o = bersihSoal(p.data || {});
  if (!bolehMapel(user, o.MapelID)) return createResponse(false, null, 'Bukan mata pelajaran yang Anda ampu.');
  withLock(() => {
    if (o.ID) {
      const r = rowOf('BankSoal', o.ID); if (!r) throw new Error('Soal tidak ditemukan.');
      const lama = readRow('BankSoal', r); if (!bolehMapel(user, lama.MapelID)) throw new Error('Tidak berhak mengubah soal ini.');
      o.Pembuat = lama.Pembuat; writeRow('BankSoal', r, o); cacheDel('soal_' + lama.MapelID);
    } else { o.ID = uid(); o.Pembuat = user.nama; appendRows('BankSoal', [o]); }
  });
  cacheDel('soal_' + o.MapelID);
  return createResponse(true, o, 'Soal disimpan.');
}
function aksiSoalHapus(user, p) {
  const r = rowOf('BankSoal', p.id); if (!r) return createResponse(false, null, 'Soal tidak ditemukan.');
  const s = readRow('BankSoal', r); if (!bolehMapel(user, s.MapelID)) return createResponse(false, null, 'Tidak berhak menghapus soal ini.');
  withLock(() => hapusBaris('BankSoal', x => x.ID === p.id)); cacheDel('soal_' + s.MapelID);
  return createResponse(true, null, 'Soal dihapus.');
}
function aksiSoalGambar(user, p) {
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(p.mime || '')) return createResponse(false, null, 'Hanya gambar PNG, JPG, GIF, atau WEBP.');
  const bytes = Utilities.base64Decode(p.base64);
  if (bytes.length > 2 * 1024 * 1024) return createResponse(false, null, 'Ukuran gambar maksimal 2 MB.');
  const folder = DriveApp.getFolderById(cfg().gambarFolderId);
  const file = folder.createFile(Utilities.newBlob(bytes, p.mime, 'soal_' + Date.now() + '_' + (p.nama || 'gambar')));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return createResponse(true, { id: file.getId() }, 'Gambar diunggah.');
}

/** Validasi baris impor (Excel/Word). Dipakai untuk pratinjau dan simpan. */
function validasiBarisImpor(user, rows) {
  const mapel = tbl('MataPelajaran').rows, hasil = [];
  rows.forEach((r, i) => {
    const baris = r._baris || (i + 2);
    try {
      const m = mapel.find(x => x.Nama.toLowerCase() === String(r.mapel || '').trim().toLowerCase());
      if (!m) throw new Error('Mata pelajaran "' + (r.mapel || '') + '" tidak dikenal');
      if (!bolehMapel(user, m.ID)) throw new Error('Bukan mapel yang Anda ampu');
      const j = String(r.jenis || '').trim().toUpperCase().replace(/\s+/g, '');
      const jenis = { PG: 'PG', PILIHANGANDA: 'PG', PGK: 'PGK', PGKOMPLEKS: 'PGK', PILIHANGANDAKOMPLEKS: 'PGK', BS: 'BS', BENARSALAH: 'BS', 'BENAR/SALAH': 'BS' }[j];
      if (!jenis) throw new Error('Jenis harus PG, PGK, atau BS');
      const pil = ['a', 'b', 'c', 'd', 'e'].map(k => String(r[k] === undefined ? '' : r[k]).trim()).filter(Boolean);
      const o = bersihSoal({ MapelID: m.ID, Jenis: jenis, Teks: r.soal, Pilihan: pil, Kunci: r.kunci, Bobot: r.bobot || 1 });
      hasil.push({ baris: baris, valid: true, jenis: jenis, ringkas: o.Teks.slice(0, 60), kunci: o.Kunci, data: o });
    } catch (e) { hasil.push({ baris: baris, valid: false, jenis: String(r.jenis || '-'), ringkas: String(r.soal || '').slice(0, 60), kunci: String(r.kunci || ''), alasan: e.message }); }
  });
  return hasil;
}
function aksiSoalValidasi(user, p) {
  const rows = (p.rows || []).slice(0, 500);
  return createResponse(true, validasiBarisImpor(user, rows).map(h => { delete h.data; return h; }));
}
function aksiSoalImpor(user, p) {
  const hasil = validasiBarisImpor(user, (p.rows || []).slice(0, 500));
  const valid = hasil.filter(h => h.valid);
  withLock(() => appendRows('BankSoal', valid.map(h => Object.assign(h.data, { ID: uid(), Pembuat: user.nama + ' (impor)' }))));
  Array.from(new Set(valid.map(h => h.data.MapelID))).forEach(id => cacheDel('soal_' + id));
  return createResponse(true, { tersimpan: valid.length, gagal: hasil.length - valid.length }, valid.length + ' soal masuk ke bank soal.');
}

/** Ambil soal sebuah mapel sesuai komposisi ujian (dengan kunci — HANYA untuk server) */
function soalMapel(mapelId) {
  let list = cacheGet('soal_' + mapelId);
  if (!list) {
    const c = cfg(), lim = { PG: Number(c.jumlahPG), PGK: Number(c.jumlahPGK), BS: Number(c.jumlahBS) };
    const semua = tbl('BankSoal').rows.filter(s => s.MapelID === mapelId);
    list = [];
    ['PG', 'PGK', 'BS'].forEach(j => semua.filter(s => s.Jenis === j).slice(0, lim[j]).forEach(s => list.push(s)));
    cachePut('soal_' + mapelId, list, 900);
  }
  return list;
}

// ============================================================
// PENILAIAN OTOMATIS
// ============================================================
function fraksiSoal(s, a, c) {
  if (a === null || a === undefined || a === '') return 0;
  const kunci = String(s.Kunci).split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  if (s.Jenis === 'PG') return String(a).toUpperCase() === kunci[0] ? 1 : 0;
  if (s.Jenis === 'PGK') {
    const pil = (Array.isArray(a) ? a : []).map(x => String(x).toUpperCase());
    const benar = pil.filter(x => kunci.indexOf(x) >= 0).length, salah = pil.length - benar;
    if (c.modePGK === 'sebagian') return Math.max(0, (benar - salah) / kunci.length);
    return (benar === kunci.length && salah === 0) ? 1 : 0;
  }
  const arr = Array.isArray(a) ? a : [a]; let ok = 0;
  kunci.forEach((k, i) => { if (String(arr[i] || '').toUpperCase() === k) ok++; });
  return ok / kunci.length;
}
function hitungNilai(soal, jaw) {
  const c = cfg(), agg = { PG: { got: 0, max: 0 }, PGK: { got: 0, max: 0 }, BS: { got: 0, max: 0 } };
  const bobotJenis = { PG: Number(c.bobotPG), PGK: Number(c.bobotPGK), BS: Number(c.bobotBS) };
  soal.forEach(s => {
    const b = Number(s.Bobot) || 1, g = agg[s.Jenis]; if (!g) return;
    g.max += b; g.got += b * fraksiSoal(s, jaw[s.ID] ? jaw[s.ID].a : null, c);
  });
  const skor = {}; let total = 0, maksBobot = 0;
  Object.keys(agg).forEach(j => {
    skor[j] = agg[j].max > 0 ? agg[j].got / agg[j].max * bobotJenis[j] : 0;
    if (agg[j].max > 0) { total += skor[j]; maksBobot += bobotJenis[j]; }
  });
  const akhir = maksBobot > 0 ? total / maksBobot * 100 : 0;
  const r2 = n => Math.round(n * 100) / 100;
  return { PG: r2(skor.PG), PGK: r2(skor.PGK), BS: r2(skor.BS), akhir: r2(akhir) };
}

// ============================================================
// SISWA: DAFTAR UJIAN, MULAI, AUTOSAVE, KIRIM
// ============================================================
function aksiUjianSiswa(user) {
  const now = Date.now(), mapel = tbl('MataPelajaran').rows;
  const sesi = tbl('Sesi').rows.filter(s => s.SiswaID === user.refId), nilai = tbl('Nilai').rows.filter(n => n.SiswaID === user.refId);
  const list = tbl('Ujian').rows.filter(u => u.Kelas === user.kelas && u.Status === 'Aktif').map(u => {
    const m = mapel.find(x => x.ID === u.MapelID), s = sesi.find(x => x.UjianID === u.ID), n = nilai.find(x => x.UjianID === u.ID);
    const mulai = waktu(u.Mulai), akhir = waktu(u.Selesai);
    let status = 'terjadwal';
    if (n || (s && s.Status === 'Selesai')) status = 'selesai';
    else if (s) status = 'berlangsung';
    else if (now >= mulai && now <= akhir) status = 'buka';
    else if (now > akhir) status = 'ditutup';
    return { ID: u.ID, Mapel: m ? m.Nama : '-', Triwulan: u.Triwulan, TahunAjaran: u.TahunAjaran, Mulai: u.Mulai, Selesai: u.Selesai, Durasi: u.DurasiMenit, JumlahSoal: soalMapel(u.MapelID).length, status: status };
  });
  const c = cfg(); const nilaiPub = c.tampilNilaiSiswa === 'ya' ? Object.fromEntries(nilai.map(n => [n.UjianID, n.NilaiAkhir])) : {};
  return createResponse(true, { ujian: list, nilai: nilaiPub });
}
function soalUntukSiswa(soal) {   // buang kunci jawaban sebelum dikirim ke perangkat siswa
  return soal.map(s => ({ ID: s.ID, Jenis: s.Jenis, Teks: s.Teks, GambarID: s.GambarID, Pilihan: JSON.parse(s.Pilihan || '[]'), Bobot: s.Bobot }));
}
function ambilJawabanTersimpan(ujianId, siswaId) {
  const r = rowOf('Jawaban', ujianId + '|' + siswaId);
  if (!r) return { j: {}, t: 0 };
  const o = readRow('Jawaban', r); let j = {}; try { j = JSON.parse(o.Jawaban || '{}'); } catch (e) {}
  return { j: j, t: Number(o.WaktuSimpan) || 0 };
}
function aksiUjianMulai(user, p) {
  const uj = tbl('Ujian').rows.find(u => u.ID === p.ujianId);
  if (!uj || uj.Status !== 'Aktif' || uj.Kelas !== user.kelas) return createResponse(false, null, 'Ujian tidak tersedia untuk Anda.');
  if (rowOf('Nilai', uj.ID + '|' + user.refId)) return createResponse(false, null, 'Anda sudah mengerjakan ujian ini.');
  const now = Date.now(), key = uj.ID + '|' + user.refId;
  let sr = rowOf('Sesi', key), sesi = sr ? readRow('Sesi', sr) : null, deadline;
  if (sesi && sesi.Status === 'Selesai') return createResponse(false, null, 'Anda sudah mengerjakan ujian ini.');
  if (!sesi) {
    if (now < waktu(uj.Mulai)) return createResponse(false, null, 'Ujian belum dibuka.');
    if (now > waktu(uj.Selesai)) return createResponse(false, null, 'Waktu pembukaan ujian sudah ditutup.');
    deadline = now + Number(uj.DurasiMenit) * 60000;
    withLock(() => { if (!rowOf('Sesi', key)) appendRows('Sesi', [{ ID: key, UjianID: uj.ID, SiswaID: user.refId, Mulai: now, Deadline: deadline, Status: 'Berlangsung' }]); });
    sesi = readRow('Sesi', rowOf('Sesi', key)); deadline = Number(sesi.Deadline);
  } else {
    deadline = Number(sesi.Deadline);
    if (now > deadline + GRACE_MS) { selesaikan(user, uj, null, true); return createResponse(false, null, 'Waktu ujian Anda telah habis. Jawaban tersimpan sudah dikumpulkan otomatis.'); }
  }
  const tersimpan = ambilJawabanTersimpan(uj.ID, user.refId), m = tbl('MataPelajaran').rows.find(x => x.ID === uj.MapelID);
  return createResponse(true, { ujian: { ID: uj.ID, Mapel: m ? m.Nama : '-', Triwulan: uj.Triwulan, Durasi: uj.DurasiMenit }, soal: soalUntukSiswa(soalMapel(uj.MapelID)), jawaban: tersimpan.j, waktuSimpan: tersimpan.t, deadline: deadline, serverNow: now });
}
function aksiJawabanSimpan(user, p) {   // autosave berkala
  const key = p.ujianId + '|' + user.refId, sr = rowOf('Sesi', key);
  if (!sr) return createResponse(false, null, 'Sesi ujian tidak ditemukan.');
  const sesi = readRow('Sesi', sr);
  if (sesi.Status === 'Selesai') return createResponse(false, null, 'FINAL');
  if (Date.now() > Number(sesi.Deadline) + GRACE_MS) return createResponse(false, null, 'WAKTU_HABIS');
  tulisJawaban(key, p.ujianId, user.refId, p.jawaban || {});
  return createResponse(true, { t: Date.now() });
}
function tulisJawaban(key, ujianId, siswaId, jaw) {
  const o = { ID: key, UjianID: ujianId, SiswaID: siswaId, Jawaban: JSON.stringify(jaw), WaktuSimpan: Date.now() };
  let r = rowOf('Jawaban', key);
  if (r) { writeRow('Jawaban', r, o); return; }
  withLock(() => { r = rowOf('Jawaban', key); if (r) writeRow('Jawaban', r, o); else appendRows('Jawaban', [o]); });
}
function aksiUjianKirim(user, p) {
  const uj = tbl('Ujian').rows.find(u => u.ID === p.ujianId);
  if (!uj) return createResponse(false, null, 'Ujian tidak ditemukan.');
  const key = uj.ID + '|' + user.refId, sr = rowOf('Sesi', key);
  if (!sr) return createResponse(false, null, 'Sesi ujian tidak ditemukan.');
  const sesi = readRow('Sesi', sr);
  if (sesi.Status === 'Selesai') return createResponse(true, hasilUntukSiswa(uj.ID, user.refId), 'Sudah dikumpulkan.');
  const terlambat = Date.now() > Number(sesi.Deadline) + GRACE_MS;   // validasi timer di server
  return createResponse(true, selesaikan(user, uj, terlambat ? null : p.jawaban, terlambat), 'Jawaban dikumpulkan.');
}
function selesaikan(user, uj, jawabanBaru, pakaiTersimpan) {
  const key = uj.ID + '|' + user.refId;
  let jaw = jawabanBaru;
  if (!jaw) jaw = ambilJawabanTersimpan(uj.ID, user.refId).j;
  else tulisJawaban(key, uj.ID, user.refId, jaw);
  const n = hitungNilai(soalMapel(uj.MapelID), jaw);
  withLock(() => {
    if (!rowOf('Nilai', key)) appendRows('Nilai', [{ ID: key, UjianID: uj.ID, SiswaID: user.refId, SkorPG: n.PG, SkorPGK: n.PGK, SkorBS: n.BS, NilaiAkhir: n.akhir, WaktuSubmit: Date.now(), StatusEmail: 'Antrean' }]);
    const sr = rowOf('Sesi', key); if (sr) { const s = readRow('Sesi', sr); s.Status = 'Selesai'; writeRow('Sesi', sr, s); }
  });
  cacheDel('dash_all');
  return hasilUntukSiswa(uj.ID, user.refId);
}
function hasilUntukSiswa(ujianId, siswaId) {
  const tampil = cfg().tampilNilaiSiswa === 'ya', r = rowOf('Nilai', ujianId + '|' + siswaId);
  return { selesai: true, nilai: tampil && r ? readRow('Nilai', r).NilaiAkhir : null };
}

// ============================================================
// HASIL NILAI, KOREKSI, EMAIL, PDF
// ============================================================
function dataHasil(ujianId) {
  const uj = tbl('Ujian').rows.find(u => u.ID === ujianId); if (!uj) throw new Error('Ujian tidak ditemukan.');
  const nilai = tbl('Nilai').rows.filter(n => n.UjianID === ujianId);
  const siswa = tbl('Siswa').rows.filter(s => s.Kelas === uj.Kelas).sort((a, b) => a.Nama.localeCompare(b.Nama));
  const rows = siswa.map((s, i) => {
    const n = nilai.find(x => x.SiswaID === s.ID);
    return { No: i + 1, NilaiID: n ? n.ID : '', Nama: s.Nama, NISN: s.NISN, SkorPG: n ? n.SkorPG : '', SkorPGK: n ? n.SkorPGK : '', SkorBS: n ? n.SkorBS : '', NilaiAkhir: n ? n.NilaiAkhir : '', StatusEmail: n ? n.StatusEmail : 'Belum mengerjakan', Sudah: !!n };
  });
  return { uj: uj, rows: rows };
}
function aksiHasilList(user, p) {
  const uj = tbl('Ujian').rows.find(u => u.ID === p.ujianId); if (!uj) return createResponse(false, null, 'Ujian tidak ditemukan.');
  if (!bolehUjian(user, uj)) return createResponse(false, null, 'Anda tidak berhak melihat nilai ujian ini.');
  const d = dataHasil(p.ujianId), n = d.rows.filter(r => r.Sudah).map(r => Number(r.NilaiAkhir)), kkm = Number(cfg().kkm);
  const rata = n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
  return createResponse(true, { rows: d.rows, ringkas: { rata: Math.round(rata * 100) / 100, tertinggi: n.length ? Math.max.apply(null, n) : 0, terendah: n.length ? Math.min.apply(null, n) : 0, tuntas: n.filter(x => x >= kkm).length, sudah: n.length, total: d.rows.length, kkm: kkm } });
}
function aksiHasilKoreksi(user, p) {
  const v = Number(p.nilai); if (!(v >= 0 && v <= 100)) return createResponse(false, null, 'Nilai harus 0–100.');
  const r = rowOf('Nilai', p.nilaiId); if (!r) return createResponse(false, null, 'Data nilai tidak ditemukan.');
  withLock(() => { const n = readRow('Nilai', r); n.NilaiAkhir = String(v); writeRow('Nilai', r, n); });
  cacheDel('dash_all');
  return createResponse(true, null, 'Nilai dikoreksi.');
}
function aksiEmailUlang(user, p) {
  const r = rowOf('Nilai', p.nilaiId); if (!r) return createResponse(false, null, 'Data nilai tidak ditemukan.');
  const n = readRow('Nilai', r), uj = tbl('Ujian').rows.find(u => u.ID === n.UjianID);
  if (!bolehUjian(user, uj)) return createResponse(false, null, 'Tidak berhak.');
  n.StatusEmail = 'Antrean'; writeRow('Nilai', r, n);
  return createResponse(true, null, 'Email dijadwalkan ulang (dikirim pada siklus berikutnya).');
}

/** Dijalankan trigger tiap 5 menit: kirim email bertahap, patuhi kuota & batas waktu eksekusi */
function kirimEmailAntrean() {
  const mulai = Date.now(), t = tbl('Nilai'), siswa = tbl('Siswa').rows, ujian = tbl('Ujian').rows, mapel = tbl('MataPelajaran').rows;
  const c = cfg(); const iStatus = t.headers.indexOf('StatusEmail'); let kuota = MailApp.getRemainingDailyQuota();
  const v = t.sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (Date.now() - mulai > 240000 || kuota <= 0) break;   // sisakan margin dari batas ±6 menit
    const st = String(v[i][iStatus]); if (st !== 'Antrean' && st !== 'Gagal') continue;
    const s = siswa.find(x => x.ID === String(v[i][2])), uj = ujian.find(x => x.ID === String(v[i][1]));
    let hasil = 'Terkirim';
    try {
      if (!s || !s.EmailOrtu) hasil = 'Tanpa Email';
      else {
        const m = mapel.find(x => x.ID === uj.MapelID), nilai = String(v[i][6]);
        const subjek = c.emailSubject.replace('{mapel}', m ? m.Nama : '').replace('{nama}', s.Nama);
        const html = '<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#16275C">' + c.sekolah + '</h2><p>Yth. Orang Tua/Wali dari <b>' + s.Nama + '</b>,</p><p>Berikut hasil ujian <b>' + (m ? m.Nama : '') + '</b> (Triwulan ' + uj.Triwulan + ', ' + uj.TahunAjaran + '):</p><p style="font-size:32px;font-weight:bold;color:#2F6FED;margin:8px 0">' + nilai + '</p><p>Skor PG: ' + v[i][3] + ' · PG Kompleks: ' + v[i][4] + ' · Benar/Salah: ' + v[i][5] + '</p><p style="color:#64708A;font-size:12px">Email otomatis dari Aplikasi Ujian Digital SD.</p></div>';
        MailApp.sendEmail({ to: s.EmailOrtu, subject: subjek, htmlBody: html, name: c.sekolah }); kuota--;
      }
    } catch (e) { hasil = 'Gagal'; }
    t.sh.getRange(i + 1, iStatus + 1).setNumberFormat('@').setValue(hasil);
  }
}

/** PDF A4: lembar rekap hasil ujian (Google Docs sementara → PDF → arsip Drive) */
function aksiHasilPdf(user, p) {
  const uj = tbl('Ujian').rows.find(u => u.ID === p.ujianId); if (!uj) return createResponse(false, null, 'Ujian tidak ditemukan.');
  if (!bolehUjian(user, uj)) return createResponse(false, null, 'Tidak berhak.');
  const d = dataHasil(uj.ID), c = cfg(), m = tbl('MataPelajaran').rows.find(x => x.ID === uj.MapelID);
  const doc = DocumentApp.create('tmp_rekap_' + Date.now()), body = doc.getBody();
  body.setPageWidth(595).setPageHeight(842).setMarginTop(40).setMarginBottom(40).setMarginLeft(45).setMarginRight(45);
  body.appendParagraph(c.sekolah).setHeading(DocumentApp.ParagraphHeading.HEADING2).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('REKAP HASIL UJIAN ' + (m ? m.Nama.toUpperCase() : '')).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setBold(true);
  body.appendParagraph('Kelas ' + uj.Kelas + ' · Triwulan ' + uj.Triwulan + ' · Tahun Ajaran ' + uj.TahunAjaran).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const tabel = [['No', 'Nama', 'NISN', 'PG', 'PGK', 'B/S', 'Nilai']];
  d.rows.forEach(r => tabel.push([String(r.No), r.Nama, r.NISN, String(r.SkorPG), String(r.SkorPGK), String(r.SkorBS), r.Sudah ? String(r.NilaiAkhir) : '-']));
  const sudah = d.rows.filter(r => r.Sudah).map(r => Number(r.NilaiAkhir)), rata = sudah.length ? sudah.reduce((a, b) => a + b, 0) / sudah.length : 0;
  tabel.push(['', 'Rata-rata kelas', '', '', '', '', (Math.round(rata * 100) / 100).toString()]);
  const tb = body.appendTable(tabel); tb.setFontSize(9);
  tb.getRow(0).setBold(true).setBackgroundColor('#EAF1FF');
  body.appendParagraph('Dicetak: ' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd-MM-yyyy HH:mm') + ' WIB').setFontSize(8);
  doc.saveAndClose();
  const tmp = DriveApp.getFileById(doc.getId()), blob = tmp.getAs('application/pdf').setName('Rekap_' + (m ? m.Nama : 'Ujian') + '_' + uj.Kelas + '_TW' + uj.Triwulan + '.pdf');
  tmp.setTrashed(true);
  const file = DriveApp.getFolderById(c.pdfFolderId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return createResponse(true, { id: file.getId(), nama: file.getName() }, 'PDF dibuat.');
}

// ============================================================
// DASHBOARD
// ============================================================
function aksiDashboard(user, p) {
  const ujian = tbl('Ujian').rows, mapel = tbl('MataPelajaran').rows, nilai = tbl('Nilai').rows;
  const tahunList = Array.from(new Set(ujian.map(u => u.TahunAjaran))).sort().reverse();
  const tahun = p.tahun || cfg().tahunAjaranAktif;
  const uMap = {}; ujian.filter(u => u.TahunAjaran === tahun && bolehUjian(user, u)).forEach(u => uMap[u.ID] = u);
  const data = nilai.filter(n => uMap[n.UjianID]).map(n => ({ v: Number(n.NilaiAkhir), u: uMap[n.UjianID] }));
  const rata = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100 : 0;
  const kelompok = fn => { const g = {}; data.forEach(d => { const k = fn(d.u); (g[k] = g[k] || []).push(d.v); }); return g; };
  const perKelas = kelompok(u => u.Kelas), perMapel = kelompok(u => (mapel.find(m => m.ID === u.MapelID) || { Nama: '-' }).Nama), perTw = kelompok(u => 'TW ' + u.Triwulan);
  const out = g => Object.keys(g).sort().map(k => ({ label: k, rata: rata(g[k]), n: g[k].length }));
  const semua = data.map(d => d.v), kkm = Number(cfg().kkm);
  const km = out(perKelas), mp = out(perMapel), tw = out(perTw), insights = [];
  if (semua.length) {
    insights.push('Rata-rata nilai keseluruhan ' + rata(semua) + ' dari ' + semua.length + ' hasil ujian.');
    const tuntas = Math.round(semua.filter(v => v >= kkm).length / semua.length * 100);
    insights.push(tuntas + '% hasil mencapai KKM (' + kkm + ').');
    const best = mp.slice().sort((a, b) => b.rata - a.rata)[0], low = mp.slice().sort((a, b) => a.rata - b.rata)[0];
    if (mp.length > 1) { insights.push('Mapel tertinggi: ' + best.label + ' (' + best.rata + '); perlu perhatian: ' + low.label + ' (' + low.rata + ').'); }
    if (tw.length > 1) { const d = Math.round((tw[tw.length - 1].rata - tw[0].rata) * 100) / 100; insights.push('Tren triwulan: ' + (d >= 0 ? 'naik ' : 'turun ') + Math.abs(d) + ' poin dari ' + tw[0].label + ' ke ' + tw[tw.length - 1].label + '.'); }
  } else insights.push('Belum ada hasil ujian pada tahun ajaran ini.');
  return createResponse(true, { tahun: tahun, tahunList: tahunList, kpi: { jumlah: semua.length, rata: rata(semua), tertinggi: semua.length ? Math.max.apply(null, semua) : 0, terendah: semua.length ? Math.min.apply(null, semua) : 0, tuntas: semua.filter(v => v >= kkm).length, kkm: kkm, siswa: tbl('Siswa').rows.length }, perKelas: km, perMapel: mp, perTriwulan: tw, insights: insights });
}

// ============================================================
// ASISTEN AI PEMBUAT SOAL (admin) — Anthropic API via UrlFetchApp
// Kunci API disimpan di Script Properties, tidak pernah dikirim ke browser.
// ============================================================
/** Jalankan SEKALI dari editor Apps Script agar izin "akses layanan eksternal" disetujui */
function izinkanAkses() {
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/models', { muteHttpExceptions: true });
  Logger.log('Izin OK. Kode respons uji: ' + r.getResponseCode() + ' (401 = normal, belum memakai kunci)');
}
function aksiAiStatus() {
  const pr = PropertiesService.getScriptProperties();
  return createResponse(true, { adaKunci: !!pr.getProperty('ANTHROPIC_API_KEY'), model: pr.getProperty('AI_MODEL') || 'claude-sonnet-5-5' });
}
function aksiAiSetKey(user, p) {
  const pr = PropertiesService.getScriptProperties(), key = String(p.key || '').trim();
  if (p.model) pr.setProperty('AI_MODEL', String(p.model).trim());
  if (p.hapus) { pr.deleteProperty('ANTHROPIC_API_KEY'); return createResponse(true, null, 'Kunci API dihapus.'); }
  if (key) { if (key.length < 20) return createResponse(false, null, 'Kunci API tidak valid.'); pr.setProperty('ANTHROPIC_API_KEY', key); }
  return createResponse(true, null, 'Pengaturan AI disimpan.');
}
function parseJsonAi(teks) {
  let t = String(teks).replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Balasan AI tidak berformat JSON.');
  return JSON.parse(t.slice(a, b + 1));
}
function aksiAiChat(user, p) {
  const pr = PropertiesService.getScriptProperties(), key = pr.getProperty('ANTHROPIC_API_KEY');
  if (!key) return createResponse(false, null, 'Kunci API AI belum diisi (Pengaturan → Asisten AI).');
  const m = tbl('MataPelajaran').rows.find(x => x.ID === p.mapelId);
  if (!m) return createResponse(false, null, 'Pilih mata pelajaran terlebih dahulu.');
  const sys = 'Kamu asisten pembuat soal ujian untuk siswa SD (Kurikulum Merdeka) mata pelajaran ' + m.Nama + '. Gunakan bahasa yang sesuai mata pelajaran dan mudah dipahami anak SD. ' +
    'Balas HANYA dengan JSON: {"balasan":"teks singkat untuk admin","soal":[{"jenis":"PG|PGK|BS","teks":"...","pilihan":["..."],"kunci":"...","bobot":1}]}. ' +
    'Aturan: PG = 4 pilihan, kunci satu huruf (A-D). PGK = 4-5 pilihan, kunci huruf dipisah koma dengan minimal 2 jawaban benar (mis. "A,C"). ' +
    'BS = pilihan berisi 2-4 pernyataan dan kunci B atau S per pernyataan dipisah koma (mis. "B,S"); atau pilihan [] dan teks adalah satu pernyataan dengan kunci "B" atau "S". ' +
    'Jangan membuat soal yang memerlukan gambar. Pastikan kunci jawaban benar. Maksimal 20 soal per balasan. Jika admin hanya berdiskusi atau bertanya, isi "soal" dengan [].';
  let msgs = [];
  if (p.mode === 'ganti') {
    msgs = [{ role: 'user', content: 'Ganti soal berikut dengan 1 soal baru.\nSoal lama: ' + JSON.stringify(p.draft) + '\nInstruksi admin: ' + String(p.instruksi || 'buat soal lain dengan topik yang sama').slice(0, 500) + '\nBalas JSON dengan tepat 1 soal pada array "soal".' }];
  } else {
    const hist = (p.history || []).slice(-10).filter(h => h && (h.role === 'user' || h.role === 'assistant')).map(h => ({ role: h.role, content: String(h.content).slice(0, 4000) }));
    const ctx = (p.drafts || []).length ? '\n\n[Draf soal saat ini: ' + JSON.stringify((p.drafts || []).slice(0, 30).map((d, i) => ({ no: i + 1, jenis: d.Jenis, teks: String(d.Teks).slice(0, 120) }))) + ']' : '';
    hist.push({ role: 'user', content: String(p.pesan || '').slice(0, 2000) + ctx });
    hist.forEach(h => { const l = msgs[msgs.length - 1]; if (l && l.role === h.role) l.content += '\n' + h.content; else msgs.push(h); });
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  }
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: pr.getProperty('AI_MODEL') || 'claude-sonnet-5-5', max_tokens: 4000, system: sys, messages: msgs }) });
  if (resp.getResponseCode() !== 200) {
    let pesan = 'Layanan AI error (' + resp.getResponseCode() + ').'; try { pesan += ' ' + JSON.parse(resp.getContentText()).error.message; } catch (e) {}
    return createResponse(false, null, pesan);
  }
  const teks = JSON.parse(resp.getContentText()).content.filter(c => c.type === 'text').map(c => c.text).join('');
  let hasil; try { hasil = parseJsonAi(teks); } catch (e) { return createResponse(true, { balasan: teks.slice(0, 600), soal: [] }); }
  const soal = (hasil.soal || []).slice(0, p.mode === 'ganti' ? 1 : 20).map(it => {
    const raw = { Jenis: String(it.jenis || '').toUpperCase(), Teks: it.teks, Pilihan: it.pilihan || [], Kunci: it.kunci, Bobot: it.bobot || 1 };
    try { const o = bersihSoal({ MapelID: p.mapelId, Jenis: raw.Jenis, Teks: raw.Teks, Pilihan: raw.Pilihan, Kunci: raw.Kunci, Bobot: raw.Bobot }); return { ok: true, data: { Jenis: o.Jenis, Teks: o.Teks, Pilihan: JSON.parse(o.Pilihan), Kunci: o.Kunci, Bobot: o.Bobot } }; }
    catch (e) { return { ok: false, err: e.message, data: { Jenis: raw.Jenis, Teks: String(raw.Teks || ''), Pilihan: raw.Pilihan, Kunci: String(raw.Kunci || ''), Bobot: String(raw.Bobot) } }; }
  });
  return createResponse(true, { balasan: String(hasil.balasan || ''), soal: soal });
}
/** Simpan banyak soal terpilih sekaligus (hasil AI) */
function aksiSoalBatch(user, p) {
  const list = (p.data || []).slice(0, 40);
  if (!list.length) return createResponse(false, null, 'Tidak ada soal untuk disimpan.');
  const rows = list.map((d, i) => { try { const o = bersihSoal(Object.assign({}, d, { MapelID: p.mapelId })); o.ID = uid(); o.Pembuat = 'AI · ' + user.nama; return o; } catch (e) { throw new Error('Soal ke-' + (i + 1) + ': ' + e.message); } });
  withLock(() => appendRows('BankSoal', rows)); cacheDel('soal_' + p.mapelId);
  return createResponse(true, { tersimpan: rows.length }, rows.length + ' soal masuk ke Bank Soal.');
}

// ============================================================
// PETA RUTE + RBAC
// ============================================================
const A = ['admin'], AG = ['admin', 'guru'], S = ['siswa'], SEMUA = ['admin', 'guru', 'siswa'];
const ROUTES = {
  bootstrap: { roles: SEMUA, fn: aksiBootstrap }, logout: { roles: SEMUA, fn: aksiLogout }, gantiSandi: { roles: SEMUA, fn: aksiGantiSandi },
  crudList: { roles: AG, fn: aksiCrudList }, crudSave: { roles: A, fn: aksiCrudSave }, crudDelete: { roles: A, fn: aksiCrudDelete },
  akunList: { roles: A, fn: aksiAkunList }, akunOtomatis: { roles: A, fn: aksiAkunBuatOtomatis }, akunReset: { roles: A, fn: aksiAkunReset }, akunStatus: { roles: A, fn: aksiAkunStatus },
  aiStatus: { roles: A, fn: aksiAiStatus }, aiSetKey: { roles: A, fn: aksiAiSetKey }, aiChat: { roles: A, fn: aksiAiChat }, soalBatch: { roles: A, fn: aksiSoalBatch },
  pengaturanGet: { roles: A, fn: aksiPengaturanGet }, pengaturanSimpan: { roles: A, fn: aksiPengaturanSimpan },
  soalList: { roles: AG, fn: aksiSoalList }, soalSimpan: { roles: AG, fn: aksiSoalSimpan }, soalHapus: { roles: AG, fn: aksiSoalHapus }, soalGambar: { roles: AG, fn: aksiSoalGambar },
  soalValidasi: { roles: AG, fn: aksiSoalValidasi }, soalImpor: { roles: AG, fn: aksiSoalImpor },
  dashboard: { roles: AG, fn: aksiDashboard },
  hasilList: { roles: AG, fn: aksiHasilList }, hasilKoreksi: { roles: A, fn: aksiHasilKoreksi }, hasilPdf: { roles: AG, fn: aksiHasilPdf }, emailUlang: { roles: AG, fn: aksiEmailUlang },
  ujianSiswa: { roles: S, fn: aksiUjianSiswa }, ujianMulai: { roles: S, fn: aksiUjianMulai }, jawabanSimpan: { roles: S, fn: aksiJawabanSimpan }, ujianKirim: { roles: S, fn: aksiUjianKirim }
};
