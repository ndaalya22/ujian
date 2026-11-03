/**
 * ============================================================
 * UJIAN DIGITAL SD — Frontend (SPA)
 * Semua navigasi di sisi klien; data diambil lewat fetch() ke GAS REST API.
 * ============================================================
 */
const S = { token: null, user: null, mapel: [], kelas: [], cfg: {} };
let EX = null;                 // state ruang ujian siswa
const charts = {};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const num = (v, d = 2) => (v === '' || v == null || isNaN(Number(v))) ? '-' : String(Math.round(Number(v) * Math.pow(10, d)) / Math.pow(10, d));
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
const gambarUrl = (id, w) => 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 1000);
const namaMapel = id => (S.mapel.find(m => m.ID === id) || {}).Nama || '-';
const inisial = n => String(n || '?').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

// ════════════════ UTILITAS UI ════════════════
let _busy = 0;
function progress(d) { _busy = Math.max(0, _busy + (d ? 1 : -1)); const b = $('barLoading'); b.style.width = _busy ? '70%' : '100%'; if (!_busy) setTimeout(() => { if (!_busy) b.style.width = '0'; }, 300); }
function toast(title, msg, type) {
  const el = $('appToast'); $('toastTitle').textContent = title; $('toastBody').textContent = msg;
  el.style.borderLeft = '5px solid ' + ({ danger: 'var(--danger)', success: 'var(--success)', warning: 'var(--warning)' }[type] || 'var(--primary)');
  bootstrap.Toast.getOrCreateInstance(el, { delay: 4500 }).show();
}
function setBtn(btn, on, html) { if (!btn) return; if (on) { btn._h = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> ' + (html || 'Memproses...'); } else { btn.disabled = false; if (btn._h) btn.innerHTML = btn._h; } }
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function loadingBox(id) { $(id).innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Memuat data...</p></div>'; }

/** Panggilan server terautentikasi (Promise) — fetch() ke GAS REST API (lihat api.js) */
function api(action, payload) {
  progress(1);
  return gasPost({ action: action, token: S.token, payload: payload || {} }, action === 'aiChat' ? 120000 : 60000)
    .then(res => {
      progress(0);
      if (res && !res.success && res.message === 'SESI_HABIS') { sesiHabis(); throw new Error('Sesi berakhir. Silakan masuk kembali.'); }
      return res;
    })
    .catch(err => { progress(0); throw err; });
}
/** Pembungkus: tampilkan toast bila gagal; kembalikan res atau null */
async function call(action, payload, btn) {
  setBtn(btn, true);
  try {
    const res = await api(action, payload);
    if (!res.success) { toast('Gagal', res.message, 'danger'); return null; }
    return res;
  } catch (e) { toast('Error', e.message, 'danger'); return null; }
  finally { setBtn(btn, false); }
}

let mdlInst = null;
function modal(title, body, foot, size) {
  $('mdlTitle').textContent = title; $('mdlBody').innerHTML = body; $('mdlFoot').innerHTML = foot || '';
  $('mdlDialog').className = 'modal-dialog modal-dialog-centered modal-dialog-scrollable' + (size ? ' modal-' + size : '');
  mdlInst = bootstrap.Modal.getOrCreateInstance($('mdl')); mdlInst.show();
}
function closeModal() { if (mdlInst) mdlInst.hide(); }
function konfirmasi(judul, pesan, labelOk, onOk, bahaya) {
  modal(judul, '<p class="mb-0">' + pesan + '</p>', '<button class="btn btn-soft" data-bs-dismiss="modal">Batal</button><button class="btn ' + (bahaya ? 'btn-danger' : 'btn-primary') + '" id="btnOk">' + labelOk + '</button>');
  $('btnOk').onclick = async () => { setBtn($('btnOk'), true); try { await onOk(); } finally { closeModal(); } };
}
function pratinjau(judul, html, dl) { $('prevTitle').textContent = judul; $('prevBody').innerHTML = html; const a = $('prevDl'); a.style.display = dl ? '' : 'none'; if (dl) a.href = dl; bootstrap.Modal.getOrCreateInstance($('mdlPrev')).show(); }
function pratinjauGambar(id) { pratinjau('Gambar Soal', '<img class="img-fluid rounded" src="' + gambarUrl(id, 1600) + '" alt="Gambar soal">', 'https://drive.google.com/uc?export=download&id=' + id); }

// ════════════════ TEMA & LOGIN ════════════════
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); const d = $('darkToggle'); if (d) d.checked = t === 'dark'; }
function toggleTheme() { const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; applyTheme(t); lsSet('theme', t); Object.values(charts).forEach(c => c && c.update()); }
function togglePass() { const i = $('inPass'); i.type = i.type === 'password' ? 'text' : 'password'; $('eyeIc').className = i.type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash'; }

S.pub = { sekolah: 'SD Negeri Nusantara 01', appName: 'Ujian Digital SD', logoUrl: '' };
function inisialSekolah() {
  const w = String(S.pub.sekolah || '').split(/\s+/).filter(x => /^[A-Za-z]{3,}$/.test(x) && !/^(negeri|swasta|sdn|sdit)$/i.test(x));
  return (w.length ? w[0].slice(0, 2) : 'SD').toUpperCase();
}
/** Logo sekolah: gambar bila ada, jika belum diunggah tampil inisial (tanpa ikon toga) */
function setLogos() {
  const html = S.pub.logoUrl ? '<img src="' + esc(S.pub.logoUrl) + '" alt="Logo sekolah">' : esc(inisialSekolah());
  document.querySelectorAll('.logo-slot').forEach(b => b.innerHTML = html);
  $('loginSekolah').textContent = S.pub.sekolah + ' · Silakan masuk'; $('introSekolah').textContent = S.pub.sekolah;
}
function ambilPublik() { return gasPost({ action: 'infoPublik' }, 20000).then(r => (r && r.success ? r.data : {})).catch(() => ({})); }

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(lsGet('theme') || 'light');
  ['inUser', 'inPass'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
  if (!gasSiap()) { $('loadingOverlay').innerHTML = '<div class="text-center p-4" style="max-width:480px"><h4>Konfigurasi belum lengkap</h4><p class="text-muted">Isi <b>GAS_URL</b> di berkas <code>js/config.js</code> dengan URL <code>/exec</code> dari Apps Script, lalu muat ulang.</p></div>'; return; }
  Object.assign(S.pub, await ambilPublik()); setLogos();
  S.token = ssGet('token');
  if (S.token) { mulaiApp(true); return; }
  show('loadingOverlay', false);
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) tampilLogin(); else mulaiIntro();
});

// ════════════════ MOTION GRAFIS PENGANTAR (15 detik) ════════════════
let introTimer = null;
function mulaiIntro() {
  const cf = $('confetti'), warna = ['#FFC93C', '#ffffff', '#5B8DF5', '#ff8fab', '#16A34A'];
  cf.innerHTML = Array.from({ length: 26 }, () => '<i style="left:' + Math.random() * 100 + '%;background:' + warna[Math.floor(Math.random() * warna.length)] + ';animation-duration:' + (6 + Math.random() * 7) + 's;animation-delay:' + (-Math.random() * 10) + 's"></i>').join('');
  show('viewIntro', true); introTimer = setTimeout(akhiriIntro, 15100);
}
function akhiriIntro() {
  if (introTimer === null) return; clearTimeout(introTimer); introTimer = null;
  const el = $('viewIntro'); el.style.animation = 'introOut .45s ease both';
  setTimeout(() => { show('viewIntro', false); el.style.animation = ''; tampilLogin(); }, 420);
}
function tampilLogin() {
  show('viewLogin', true); const c = document.querySelector('.login-card'); c.classList.remove('enter'); void c.offsetWidth; c.classList.add('enter');
  setTimeout(() => $('inUser').focus({ preventScroll: true }), 700);
}

function doLogin() {
  const u = $('inUser').value.trim(), p = $('inPass').value;
  const err = $('loginError'); err.classList.add('hidden');
  if (!u || !p) { err.textContent = 'Username dan kata sandi wajib diisi.'; err.classList.remove('hidden'); return; }
  const btn = $('btnLogin'); setBtn(btn, true, 'Memeriksa...');
  gasPost({ action: 'login', username: u, password: p }, 45000)
    .then(res => {
      setBtn(btn, false);
      if (!res.success) { err.textContent = res.message; err.classList.remove('hidden'); return; }
      S.token = res.data.token; ssSet('token', S.token); $('inPass').value = '';
      mulaiApp(false);
    })
    .catch(e => { setBtn(btn, false); err.textContent = 'Tidak dapat terhubung ke server: ' + e.message; err.classList.remove('hidden'); });
}
function sesiHabis() {
  if (EX && !EX.selesai) { toast('Koneksi sesi bermasalah', 'Jawaban Anda aman di perangkat ini. Muat ulang halaman lalu masuk lagi.', 'warning'); return; }
  kembaliKeLogin('Sesi berakhir');
}
function doLogout() {
  if (EX && !EX.selesai) { konfirmasi('Keluar dari ujian?', 'Waktu ujian tetap berjalan. Anda dapat masuk lagi untuk melanjutkan selama waktu belum habis.', 'Keluar', () => kembaliKeLogin('Sampai jumpa!'), true); return; }
  kembaliKeLogin('Sampai jumpa!');
}
/** Kembali ke halaman login TANPA muat ulang: transisi animasi logo sekolah → form login */
function kembaliKeLogin(teks) {
  const tokenLama = S.token;
  if (tokenLama) { gasPost({ action: 'keluar', token: tokenLama }, 10000).catch(() => {}); }
  if (EX) { clearInterval(EX.tClock); clearInterval(EX.tAuto); }
  EX = null; window.onbeforeunload = null; ssSet('token', null);
  Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; } });
  const t = $('viewTransisi'); $('trTeks').textContent = teks || 'Sampai jumpa!';
  t.classList.remove('hidden', 'out', 'in'); void t.offsetWidth; t.classList.add('in');
  setTimeout(() => {
    S.token = null; S.user = null; S.mapel = []; S.kelas = [];
    show('viewStaff', false); show('viewSiswa', false); closeSidebar();
    ['pageContent', 'siswaContent'].forEach(id => $(id).innerHTML = '');
    try { bootstrap.Modal.getInstance($('mdl')) && bootstrap.Modal.getInstance($('mdl')).hide(); } catch (e) {}
    applyTheme(lsGet('theme') || 'light'); $('inUser').value = ''; $('inPass').value = ''; $('loginError').classList.add('hidden');
    tampilLogin();
    t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.classList.add('hidden'), 750);
  }, 1700);
}

async function mulaiApp(dariSesi) {
  try {
    const res = await api('bootstrap');
    if (!res.success) throw new Error(res.message);
    Object.assign(S, { user: res.data.user, mapel: res.data.mapel, kelas: res.data.kelas, cfg: res.data.cfg });
  } catch (e) {
    ssSet('token', null); show('loadingOverlay', false); show('viewLogin', true);
    if (!dariSesi) toast('Error', e.message, 'danger'); return;
  }
  document.title = S.cfg.appName || 'Ujian Digital SD';
  S.pub.sekolah = S.cfg.sekolah; S.pub.logoUrl = S.cfg.logoUrl || ''; setLogos();
  show('viewLogin', false);
  if (S.user.peran === 'siswa') { applyTheme('light'); initSiswa(); } else initStaff();
  show('loadingOverlay', false);
}

// ════════════════ SHELL STAF ════════════════
const MENU = {
  admin: [['dashboard', 'bi-grid', 'Dashboard'], ['siswa', 'bi-people', 'Data Siswa'], ['guru', 'bi-person-workspace', 'Data Guru'], ['mapel', 'bi-journal-bookmark', 'Mata Pelajaran'], ['akun', 'bi-key', 'Akun'], ['soal', 'bi-patch-question', 'Bank Soal'], ['ai', 'bi-stars', 'Soal dengan AI'], ['ujian', 'bi-calendar-event', 'Jadwal Ujian'], ['hasil', 'bi-bar-chart', 'Hasil Nilai'], ['pengaturan', 'bi-gear', 'Pengaturan'], ['profil', 'bi-person-lock', 'Ganti Sandi']],
  guru: [['dashboard', 'bi-grid', 'Dashboard'], ['soal', 'bi-patch-question', 'Bank Soal'], ['hasil', 'bi-bar-chart', 'Hasil Nilai'], ['profil', 'bi-person-lock', 'Ganti Sandi']]
};
function initStaff() {
  const u = S.user;
  $('sbSekolah').textContent = S.cfg.sekolah; $('sbPeran').textContent = u.peran === 'admin' ? 'Panel Admin' : 'Portal Guru';
  $('topNama').textContent = u.nama; $('topSub').textContent = u.peran === 'admin' ? 'Administrator' : 'Guru';
  $('sbNav').innerHTML = MENU[u.peran].map(m => '<li><a data-p="' + m[0] + '" onclick="nav(\'' + m[0] + '\')"><i class="bi ' + m[1] + '"></i> ' + m[2] + '</a></li>').join('');
  applyTheme(document.documentElement.getAttribute('data-theme'));
  show('viewStaff', true); nav('dashboard');
}
const PAGES = { dashboard: pgDashboard, siswa: () => pgCrud('siswa'), guru: () => pgCrud('guru'), mapel: () => pgCrud('mapel'), ujian: () => pgCrud('ujian'), akun: pgAkun, soal: pgSoal, ai: pgAi, hasil: pgHasil, pengaturan: pgPengaturan, profil: pgProfil };
function nav(p) {
  document.querySelectorAll('#sbNav a').forEach(a => a.classList.toggle('active', a.dataset.p === p));
  const m = MENU[S.user.peran].find(x => x[0] === p); $('topTitle').textContent = m ? m[2] : '';
  closeSidebar(); Object.keys(charts).forEach(k => { if (charts[k]) { charts[k].destroy(); delete charts[k]; } });
  loadingBox('pageContent'); PAGES[p]();
}
function toggleSidebar() { $('sidebar').classList.toggle('show'); $('sbOverlay').classList.toggle('show'); }
function closeSidebar() { $('sidebar').classList.remove('show'); $('sbOverlay').classList.remove('show'); }
const pageHead = (judul, sub, aksi) => '<div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3"><div><h1 class="page-title">' + judul + '</h1><div class="text-muted">' + (sub || '') + '</div></div><div class="d-flex flex-wrap gap-2">' + (aksi || '') + '</div></div>';
const statCard = (ic, lbl, val, sub) => '<div class="card-x stat"><div class="stat-ic"><i class="bi ' + ic + '"></i></div><span class="lbl">' + lbl + '</span><span class="val">' + val + '</span><span class="sub">' + (sub || '') + '</span></div>';

// ════════════════ DASHBOARD ════════════════
async function pgDashboard(tahun) {
  const res = await call('dashboard', { tahun: typeof tahun === 'string' ? tahun : '' }); if (!res) return;
  const d = res.data, k = d.kpi;
  const opt = (d.tahunList.length ? d.tahunList : [d.tahun]).map(t => '<option ' + (t === d.tahun ? 'selected' : '') + '>' + esc(t) + '</option>').join('');
  $('pageContent').innerHTML = pageHead('Dashboard Analisis & Hasil Belajar', S.user.peran === 'guru' ? 'Rekap untuk kelas & mata pelajaran yang Anda ampu' : 'Rekap seluruh sekolah',
    '<select class="form-select" style="width:auto" onchange="pgDashboard(this.value)" aria-label="Tahun ajaran">' + opt + '</select>') +
    '<div class="row g-3 mb-3">' +
    '<div class="col-6 col-lg-3">' + statCard('bi-people', 'Total Siswa', k.siswa, 'terdaftar') + '</div>' +
    '<div class="col-6 col-lg-3">' + statCard('bi-star', 'Rata-rata Nilai', num(k.rata), 'KKM ' + k.kkm) + '</div>' +
    '<div class="col-6 col-lg-3">' + statCard('bi-check2-circle', 'Tuntas KKM', k.jumlah ? Math.round(k.tuntas / k.jumlah * 100) + '%' : '-', k.tuntas + ' dari ' + k.jumlah + ' hasil') + '</div>' +
    '<div class="col-6 col-lg-3">' + statCard('bi-arrow-down-up', 'Rentang', num(k.tertinggi, 0) + ' / ' + num(k.terendah, 0), 'tertinggi / terendah') + '</div></div>' +
    '<div class="row g-3 mb-3"><div class="col-lg-4"><div class="card-x"><h6>Rata-rata per Kelas</h6><canvas id="chKelas" height="220"></canvas></div></div>' +
    '<div class="col-lg-4"><div class="card-x"><h6>Rata-rata per Mata Pelajaran</h6><canvas id="chMapel" height="220"></canvas></div></div>' +
    '<div class="col-lg-4"><div class="card-x"><h6>Rata-rata per Triwulan</h6><canvas id="chTw" height="220"></canvas></div></div></div>' +
    '<div class="insight"><h6><i class="bi bi-lightbulb"></i> Analisis Otomatis</h6><ul class="mb-0 ps-3">' + d.insights.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul></div>';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark', tc = dark ? '#E6ECFF' : '#1E2A4A';
  const mk = (id, tipe, arr, warna) => { const c = $(id); if (!c) return; charts[id] = new Chart(c, { type: tipe, data: { labels: arr.map(x => x.label), datasets: [{ data: arr.map(x => x.rata), backgroundColor: warna, borderColor: '#2F6FED', borderRadius: 8, tension: .3, fill: tipe === 'line' }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { color: tc } }, x: { ticks: { color: tc } } } } }); };
  mk('chKelas', 'bar', d.perKelas, '#2F6FED'); mk('chMapel', 'bar', d.perMapel, '#FFC93C'); mk('chTw', 'line', d.perTriwulan, 'rgba(47,111,237,.15)');
}

// ════════════════ CRUD GENERIK (siswa, guru, mapel, ujian) ════════════════
const ENT = {
  siswa: { judul: 'Data Siswa', f: [['Nama', 'Nama Lengkap', 'text', 1], ['NISN', 'NISN', 'text', 1], ['NIS', 'NIS'], ['TempatLahir', 'Tempat Lahir'], ['TanggalLahir', 'Tanggal Lahir', 'date'], ['Kelas', 'Kelas (mis. 4-A)', 'text', 1], ['EmailOrtu', 'Email Siswa/Orang Tua', 'email']], cols: ['Nama', 'NISN', 'NIS', 'Kelas', 'EmailOrtu'] },
  guru: { judul: 'Data Guru', f: [['Nama', 'Nama Lengkap', 'text', 1], ['Email', 'Email', 'email'], ['MapelDiampu', 'Mata Pelajaran yang Diampu', 'mapelmulti'], ['KelasDiampu', 'Kelas yang Diampu (pisahkan koma, mis. 4-A,4-B)']], cols: ['Nama', 'Email', 'MapelDiampu', 'KelasDiampu'] },
  mapel: { judul: 'Mata Pelajaran', f: [['Nama', 'Nama Mata Pelajaran', 'text', 1]], cols: ['Nama'] },
  ujian: { judul: 'Jadwal Ujian', f: [['MapelID', 'Mata Pelajaran', 'mapel', 1], ['Kelas', 'Kelas', 'kelas', 1], ['Triwulan', 'Triwulan', 'tw', 1], ['TahunAjaran', 'Tahun Ajaran', 'text', 1], ['Mulai', 'Ujian Dibuka', 'datetime-local', 1], ['Selesai', 'Batas Akhir Memulai', 'datetime-local', 1], ['DurasiMenit', 'Durasi (menit)', 'number', 1], ['Status', 'Status', 'status', 1]], cols: ['MapelID', 'Kelas', 'Triwulan', 'TahunAjaran', 'Mulai', 'DurasiMenit', 'Status'] }
};
const LBL = { MapelID: 'Mapel', MapelDiampu: 'Mapel Diampu', KelasDiampu: 'Kelas Diampu', EmailOrtu: 'Email Ortu', DurasiMenit: 'Durasi (mnt)', TahunAjaran: 'Tahun Ajaran', Triwulan: 'TW' };
let CR = { ent: '', rows: [], q: '' };
function sel(v) { return String(v || '').replace('T', ' '); }
function sel2(c, v) { if (c === 'MapelID') return esc(namaMapel(v)); if (c === 'MapelDiampu') return esc(String(v || '').split(',').filter(Boolean).map(namaMapel).join(', ')) || '-'; if (c === 'Mulai') return esc(sel(v)); if (c === 'Status') return '<span class="badge-x ' + (v === 'Aktif' ? 'ok' : v === 'Selesai' ? '' : 'warn') + '">' + esc(v) + '</span>'; return esc(v) || '<span class="text-muted">-</span>'; }
async function pgCrud(ent) {
  const res = await call('crudList', { entitas: ent }); if (!res) return;
  CR = { ent: ent, rows: res.data, q: '' };
  const e = ENT[ent];
  $('pageContent').innerHTML = pageHead(e.judul, 'Kelola data ' + e.judul.toLowerCase(), '<button class="btn btn-primary" onclick="formCrud()"><i class="bi bi-plus-lg"></i> Tambah</button>') +
    '<div class="card-x"><input class="form-control mb-3" placeholder="Cari..." oninput="CR.q=this.value;tabelCrud()" aria-label="Cari"><div class="tscroll" id="crTabel"></div></div>';
  tabelCrud();
}
function tabelCrud() {
  const e = ENT[CR.ent], q = CR.q.toLowerCase();
  const rows = CR.rows.filter(r => !q || JSON.stringify(Object.values(r)).toLowerCase().includes(q));
  $('crTabel').innerHTML = '<table class="table-x"><thead><tr><th>No</th>' + e.cols.map(c => '<th>' + (LBL[c] || c) + '</th>').join('') + '<th class="text-end">Aksi</th></tr></thead><tbody>' +
    (rows.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + e.cols.map(c => '<td>' + sel2(c, r[c]) + '</td>').join('') + '<td class="text-end text-nowrap"><button class="btn btn-soft btn-sm" onclick="formCrud(\'' + r.ID + '\')" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn btn-soft btn-sm text-danger" onclick="hapusCrud(\'' + r.ID + '\')" aria-label="Hapus"><i class="bi bi-trash"></i></button></td></tr>').join('') || '<tr><td colspan="' + (e.cols.length + 2) + '" class="text-center text-muted py-4">Belum ada data.</td></tr>') + '</tbody></table>';
}
function fieldHtml(f, v) {
  const [k, l, t, req] = f, id = 'f_' + k, r = req ? ' required' : '';
  let inp;
  if (t === 'mapel') inp = '<select class="form-select" id="' + id + '"' + r + '><option value="">Pilih...</option>' + S.mapel.map(m => '<option value="' + m.ID + '" ' + (m.ID === v ? 'selected' : '') + '>' + esc(m.Nama) + '</option>').join('') + '</select>';
  else if (t === 'kelas') inp = '<input class="form-control" id="' + id + '" list="dlKelas" value="' + esc(v) + '"' + r + ' placeholder="mis. 4-A"><datalist id="dlKelas">' + S.kelas.map(x => '<option value="' + esc(x) + '">').join('') + '</datalist>';
  else if (t === 'tw') inp = '<select class="form-select" id="' + id + '"' + r + '>' + [1, 2, 3, 4].map(n => '<option ' + (String(v) === String(n) ? 'selected' : '') + '>' + n + '</option>').join('') + '</select>';
  else if (t === 'status') inp = '<select class="form-select" id="' + id + '">' + ['Draf', 'Aktif', 'Selesai'].map(n => '<option ' + (v === n ? 'selected' : '') + '>' + n + '</option>').join('') + '</select>';
  else if (t === 'mapelmulti') { const s = String(v || '').split(','); inp = '<div class="d-flex flex-wrap gap-2" id="' + id + '">' + S.mapel.map(m => '<label class="badge-x" style="cursor:pointer;padding:.5rem .8rem"><input type="checkbox" class="form-check-input me-1" value="' + m.ID + '" ' + (s.includes(m.ID) ? 'checked' : '') + '>' + esc(m.Nama) + '</label>').join('') + '</div>'; }
  else inp = '<input class="form-control" id="' + id + '" type="' + (t || 'text') + '" value="' + esc(v) + '"' + r + (t === 'number' ? ' min="1"' : '') + '>';
  return '<div class="mb-3"><label class="form-label" for="' + id + '">' + l + (req ? ' <span class="text-danger">*</span>' : '') + '</label>' + inp + '</div>';
}
function formCrud(id) {
  const e = ENT[CR.ent], r = id ? CR.rows.find(x => x.ID === id) : { TahunAjaran: S.cfg.tahunAjaranAktif, Status: 'Draf', DurasiMenit: '90' };
  modal((id ? 'Ubah ' : 'Tambah ') + e.judul, '<form id="frmCrud" onsubmit="return false">' + e.f.map(f => fieldHtml(f, r[f[0]])).join('') + '</form>', '<button class="btn btn-soft" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnSimpan">Simpan</button>');
  $('btnSimpan').onclick = async () => {
    const frm = $('frmCrud'); if (!frm.checkValidity()) { frm.reportValidity(); return; }
    const data = { ID: id || '' };
    e.f.forEach(f => { const el = $('f_' + f[0]); data[f[0]] = f[2] === 'mapelmulti' ? [...el.querySelectorAll('input:checked')].map(i => i.value).join(',') : el.value; });
    const res = await call('crudSave', { entitas: CR.ent, data: data }, $('btnSimpan')); if (!res) return;
    toast('Berhasil', res.message, 'success'); closeModal();
    if (CR.ent === 'mapel') { const b = await api('bootstrap'); if (b.success) S.mapel = b.data.mapel; }
    if (CR.ent === 'siswa') { const b = await api('bootstrap'); if (b.success) S.kelas = b.data.kelas; }
    pgCrud(CR.ent);
  };
}
function hapusCrud(id) {
  konfirmasi('Hapus data?', 'Data yang dihapus tidak dapat dikembalikan.', 'Hapus', async () => {
    const res = await call('crudDelete', { entitas: CR.ent, id: id }); if (res) { toast('Berhasil', res.message, 'success'); pgCrud(CR.ent); }
  }, true);
}

// ════════════════ AKUN ════════════════
async function pgAkun() {
  const res = await call('akunList'); if (!res) return;
  const { akun, tanpaAkun } = res.data;
  $('pageContent').innerHTML = pageHead('Akun Guru & Siswa', 'Akun hanya dibuat oleh admin. Siswa masuk memakai NISN.',
    '<button class="btn btn-primary" onclick="akunOtomatis(this)"><i class="bi bi-magic"></i> Buat Akun Otomatis' + (tanpaAkun ? ' (' + tanpaAkun + ')' : '') + '</button>') +
    '<div class="card-x"><div class="tscroll"><table class="table-x"><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Kelas</th><th>Status</th><th class="text-end">Aksi</th></tr></thead><tbody>' +
    akun.map(a => '<tr><td>' + esc(a.Nama) + '</td><td>' + esc(a.Username) + '</td><td>' + esc(a.Peran) + '</td><td>' + esc(a.Kelas || '-') + '</td><td><span class="badge-x ' + (a.Status === 'Aktif' ? 'ok' : 'bad') + '">' + esc(a.Status) + '</span></td><td class="text-end text-nowrap"><button class="btn btn-soft btn-sm" onclick="akunReset(\'' + a.ID + '\')">Reset Sandi</button> <button class="btn btn-soft btn-sm" onclick="akunStatus(\'' + a.ID + '\')">' + (a.Status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan') + '</button></td></tr>').join('') + '</tbody></table></div></div>';
}
function tampilKredensial(judul, list) {
  modal(judul, '<div class="alert-x mb-3" style="background:var(--yellow-50);color:#7a5200">Catat atau unduh sekarang. Kata sandi tidak dapat dilihat lagi setelah jendela ini ditutup.</div><div class="tscroll"><table class="table-x"><thead><tr><th>Nama</th><th>Username</th><th>Sandi</th></tr></thead><tbody>' + list.map(x => '<tr><td>' + esc(x.Nama || '-') + '</td><td>' + esc(x.Username) + '</td><td><b>' + esc(x.Sandi) + '</b></td></tr>').join('') + '</tbody></table></div>',
    '<button class="btn btn-soft" id="btnXl"><i class="bi bi-download"></i> Unduh Excel</button><button class="btn btn-primary" data-bs-dismiss="modal">Selesai</button>', 'lg');
  $('btnXl').onclick = () => { const ws = XLSX.utils.json_to_sheet(list); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Akun'); XLSX.writeFile(wb, 'akun_baru.xlsx'); };
}
async function akunOtomatis(btn) {
  const res = await call('akunOtomatis', {}, btn); if (!res) return;
  if (!res.data.length) { toast('Info', 'Semua siswa dan guru sudah punya akun.', 'info'); return; }
  tampilKredensial('Akun Baru Dibuat (' + res.data.length + ')', res.data); pgAkun();
}
async function akunReset(id) { const res = await call('akunReset', { id: id }); if (res) tampilKredensial('Kata Sandi Baru', [res.data]); }
async function akunStatus(id) { const res = await call('akunStatus', { id: id }); if (res) { toast('Berhasil', res.message, 'success'); pgAkun(); } }

// ════════════════ PENGATURAN & PROFIL ════════════════
async function pgPengaturan() {
  const res = await call('pengaturanGet'); if (!res) return; const c = res.data;
  const f = (k, l, t, extra) => '<div class="col-md-6"><label class="form-label" for="c_' + k + '">' + l + '</label><input class="form-control" id="c_' + k + '" type="' + (t || 'text') + '" value="' + esc(c[k]) + '" ' + (extra || '') + '></div>';
  const s = (k, l, opts) => '<div class="col-md-6"><label class="form-label" for="c_' + k + '">' + l + '</label><select class="form-select" id="c_' + k + '">' + opts.map(o => '<option value="' + o[0] + '" ' + (c[k] === o[0] ? 'selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div>';
  $('pageContent').innerHTML = pageHead('Pengaturan', 'Identitas sekolah, komposisi ujian, dan aturan penilaian') +
    '<div class="card-x"><form id="frmCfg" onsubmit="return false"><div class="row g-3">' +
    f('sekolah', 'Nama Sekolah') + f('appName', 'Nama Aplikasi') + f('logoUrl', 'URL Logo (opsional)') + f('tahunAjaranAktif', 'Tahun Ajaran Aktif', 'text', 'placeholder="2026/2027"') + f('kkm', 'KKM', 'number', 'min="0" max="100"') +
    f('bobotPG', 'Bobot Pilihan Ganda', 'number', 'min="0"') + f('bobotPGK', 'Bobot PG Kompleks', 'number', 'min="0"') + f('bobotBS', 'Bobot Benar/Salah', 'number', 'min="0"') +
    f('jumlahPG', 'Jumlah soal PG per ujian', 'number', 'min="0"') + f('jumlahPGK', 'Jumlah soal PG Kompleks', 'number', 'min="0"') + f('jumlahBS', 'Jumlah soal Benar/Salah', 'number', 'min="0"') +
    s('modePGK', 'Penilaian PG Kompleks', [['penuh', 'Penuh — semua jawaban harus tepat'], ['sebagian', 'Sebagian — nilai parsial, jawaban salah mengurangi']]) +
    s('tampilNilaiSiswa', 'Siswa langsung melihat nilai?', [['tidak', 'Tidak (hanya lewat email/guru)'], ['ya', 'Ya, tampil setelah selesai']]) + f('emailSubject', 'Subjek email ({mapel}, {nama})') +
    '</div><div class="text-muted small mt-2">Total bobot harus 100. Perubahan komposisi berlaku untuk ujian berikutnya.</div><button class="btn btn-primary mt-3" id="btnCfg">Simpan Pengaturan</button></form></div>';
  kartuAi();
  $('btnCfg').onclick = async () => {
    const data = {}; Object.keys(c).forEach(k => { const el = $('c_' + k); if (el) data[k] = el.value; });
    const r = await call('pengaturanSimpan', { data: data }, $('btnCfg')); if (r) { toast('Berhasil', r.message, 'success'); const b = await api('bootstrap'); if (b.success) S.cfg = b.data.cfg; }
  };
}
function pgProfil() {
  $('pageContent').innerHTML = pageHead('Ganti Kata Sandi', 'Gunakan minimal 6 karakter') +
    '<div class="card-x" style="max-width:480px"><form id="frmPw" onsubmit="return false"><div class="mb-3"><label class="form-label">Kata sandi lama</label><input type="password" class="form-control" id="pwLama" required></div><div class="mb-3"><label class="form-label">Kata sandi baru</label><input type="password" class="form-control" id="pwBaru" minlength="6" required></div><button class="btn btn-primary" id="btnPw">Simpan</button></form></div>';
  $('btnPw').onclick = async () => { const f = $('frmPw'); if (!f.checkValidity()) { f.reportValidity(); return; } const r = await call('gantiSandi', { lama: $('pwLama').value, baru: $('pwBaru').value }, $('btnPw')); if (r) { toast('Berhasil', r.message, 'success'); f.reset(); } };
}
