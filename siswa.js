// ════════════════ SISWA: DAFTAR UJIAN ════════════════
function initSiswa() {
  const u = S.user;
  $('sSekolah').textContent = S.cfg.sekolah; $('sNama').textContent = u.nama; $('sSub').textContent = 'Kelas ' + u.kelas + ' · NISN ' + u.nisn;
  show('viewSiswa', true); pgDaftarUjian();
}
const fmtWaktu = s => { const d = new Date(String(s).replace(' ', 'T') + ':00+07:00'); return isNaN(d) ? s : d.toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'; };
async function pgDaftarUjian() {
  EX = null; $('siswaContent').innerHTML = '<div class="s-wrap"><div class="text-center py-5"><div class="spinner-border text-primary"></div></div></div>';
  const res = await call('ujianSiswa'); if (!res) return;
  const { ujian, nilai } = res.data;
  const chip = { buka: ['ok', 'Siap dikerjakan'], berlangsung: ['warn', 'Sedang berlangsung'], selesai: ['', 'Selesai'], terjadwal: ['warn', 'Belum dibuka'], ditutup: ['bad', 'Ditutup'] };
  $('siswaContent').innerHTML = '<div class="s-wrap"><h1 class="page-title">Daftar Ujian</h1><p class="text-muted">Pilih ujian yang tersedia untuk kelas ' + esc(S.user.kelas) + '.</p>' +
    (ujian.length ? ujian.map(u => '<div class="card-x ujian-card mb-3"><div><div class="mb-1"><span class="badge-x ' + chip[u.status][0] + '">' + chip[u.status][1] + '</span> <span class="badge-x">Triwulan ' + esc(u.Triwulan) + '</span></div><h4 class="mb-1">' + esc(u.Mapel) + '</h4><div class="text-muted small"><i class="bi bi-clock"></i> ' + esc(u.Durasi) + ' menit · <i class="bi bi-list-ol"></i> ' + u.JumlahSoal + ' soal<br><i class="bi bi-calendar-event"></i> Dibuka ' + esc(fmtWaktu(u.Mulai)) + ' – ' + esc(fmtWaktu(u.Selesai)) + '</div></div>' +
      '<div class="text-end">' + (u.status === 'buka' || u.status === 'berlangsung' ? '<button class="btn btn-primary btn-lg" onclick="konfirmasiMulai(\'' + u.ID + '\',\'' + esc(u.Mapel) + '\',' + u.Durasi + ',\'' + u.status + '\')">' + (u.status === 'berlangsung' ? 'Lanjutkan' : 'Mulai Ujian') + ' <i class="bi bi-arrow-right"></i></button>' : u.status === 'selesai' ? '<div class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> Sudah dikumpulkan' + (nilai[u.ID] !== undefined ? '<div class="nunito fs-3 text-primary">' + num(nilai[u.ID]) + '</div>' : '') + '</div>' : '<button class="btn btn-soft" disabled>Belum tersedia</button>') + '</div></div>').join('') : '<div class="card-x text-center text-muted py-5"><i class="bi bi-inbox fs-1"></i><p class="mb-0">Belum ada ujian untuk kelasmu.</p></div>') + '</div>';
}
function konfirmasiMulai(id, mapel, durasi, status) {
  const lanjut = status === 'berlangsung';
  modal(lanjut ? 'Lanjutkan ujian?' : 'Mulai ujian ' + mapel + '?', lanjut ? '<p class="mb-0">Waktu tetap berjalan sejak kamu memulai. Jawaban yang sudah tersimpan akan dimuat kembali.</p>' : '<p>Waktu pengerjaan <b>' + durasi + ' menit</b> dan langsung berjalan setelah kamu menekan Mulai.</p><ul class="mb-0"><li>Pastikan internet stabil dan baterai cukup.</li><li>Ujian hanya bisa dikerjakan satu kali.</li><li>Jawaban tersimpan otomatis.</li></ul>', '<button class="btn btn-soft" data-bs-dismiss="modal">Belum</button><button class="btn btn-primary btn-lg" id="btnMulai">' + (lanjut ? 'Lanjutkan' : 'Mulai Sekarang') + '</button>');
  $('btnMulai').onclick = async () => { const r = await call('ujianMulai', { ujianId: id }, $('btnMulai')); if (!r) return; closeModal(); masukRuang(r.data); };
}

// ════════════════ SISWA: RUANG UJIAN ════════════════
const lsKey = () => 'ujian_' + EX.u.ID + '_' + S.user.refId;
function masukRuang(d) {
  EX = { u: d.ujian, soal: d.soal, jaw: d.jawaban || {}, cur: 0, deadline: d.deadline, offset: d.serverNow - Date.now(), ver: 0, sent: 0, dirty: false, saving: false, submitting: false, selesai: false, tAuto: null, tClock: null };
  const lok = lsGet(lsKey()); if (lok && lok.t > (d.waktuSimpan || 0)) EX.jaw = lok.j;   // pakai cadangan lokal bila lebih baru
  EX.soal.forEach(s => { if (!EX.jaw[s.ID]) EX.jaw[s.ID] = { a: s.Jenis === 'PGK' ? [] : s.Jenis === 'BS' ? [] : null, r: false }; });
  $('siswaContent').innerHTML = '<div class="exam-bar"><div><div class="fw-bold nunito" style="color:var(--navy)">' + esc(EX.u.Mapel) + ' · Triwulan ' + esc(EX.u.Triwulan) + '</div><span class="save-ind" id="saveInd"><i class="bi bi-cloud-check"></i> Jawaban tersimpan otomatis</span></div>' +
    '<div class="flex-grow-1" style="max-width:260px"><div class="small fw-semibold" id="progTxt"></div><div class="progress"><div class="progress-bar" id="progBar"></div></div></div><div class="timer" id="timer"><i class="bi bi-alarm"></i> <span id="timerTxt">--:--:--</span></div></div>' +
    '<div class="s-wrap"><div class="exam-grid"><div class="card-x" id="qCard"></div><div class="nav-card"><div class="card-x mb-3"><div class="d-flex align-items-center gap-2 mb-3"><span class="avatar m-0" style="width:44px;height:44px">' + inisial(S.user.nama) + '</span><div><b>' + esc(S.user.nama) + '</b><div class="small text-muted">Kelas ' + esc(S.user.kelas) + ' · NISN ' + esc(S.user.nisn) + '</div></div></div>' +
    '<h6><i class="bi bi-grid-3x3-gap"></i> Daftar Nomor Soal</h6><div class="legend"><span><i style="background:var(--primary)"></i>Terjawab</span><span><i style="background:var(--yellow)"></i>Ragu-ragu</span><span><i></i>Belum</span></div><div class="qgrid" id="qGrid"></div>' +
    '<button class="btn btn-primary w-100 mt-3 py-3" onclick="konfirmasiKirim()"><i class="bi bi-check2-circle"></i> Selesai & Kumpulkan Jawaban</button><div class="small text-muted mt-2 text-center">Periksa kembali nomor yang bertanda ragu-ragu.</div></div></div></div></div>';
  window.onbeforeunload = e => { if (EX && !EX.selesai) { e.preventDefault(); e.returnValue = ''; } };
  gambarSoal(); tick(); EX.tClock = setInterval(tick, 1000); EX.tAuto = setInterval(() => { if (EX.dirty) simpanOtomatis(); }, 15000);
  window.scrollTo(0, 0);
}
function gambarSoal() { drawQ(); drawGrid(); }
const adaJawab = s => { const a = EX.jaw[s.ID].a; if (s.Jenis === 'PG') return !!a; if (s.Jenis === 'PGK') return a.length > 0; const n = Math.max(s.Pilihan.length, 1); return a.filter(Boolean).length >= n; };
function drawQ() {
  const s = EX.soal[EX.cur], j = EX.jaw[s.ID], n = EX.soal.length; let h = '';
  h += '<div class="mb-3"><span class="q-chip">' + JENIS[s.Jenis] + '</span><span class="small text-muted">Soal ' + (EX.cur + 1) + ' dari ' + n + '</span>' + (s.Jenis === 'PGK' ? '<span class="small text-primary fw-semibold float-end">Bisa memilih lebih dari 1</span>' : '') + '</div>';
  if (s.Jenis === 'PGK') h += '<div class="p-2 mb-3 small" style="background:var(--primary-50);border-radius:12px"><i class="bi bi-info-circle"></i> <b>Petunjuk:</b> Beri tanda centang pada semua jawaban yang benar!</div>';
  h += '<div class="d-flex gap-3 mb-3"><span class="q-num">' + (EX.cur + 1) + '</span><div class="q-text">' + nl2br(s.Teks) + '</div></div>';
  if (s.GambarID) h += '<img class="q-img" src="' + gambarUrl(s.GambarID, 1200) + '" onclick="pratinjauGambar(\'' + s.GambarID + '\')" alt="Gambar soal">';
  if (s.Jenis === 'PG') h += s.Pilihan.map((p, i) => '<button class="opt ' + (j.a === HUR[i] ? 'sel' : '') + '" onclick="pilihPG(\'' + HUR[i] + '\')"><span class="ltr">' + HUR[i] + '</span><span>' + esc(p) + '</span><span class="chk">' + (j.a === HUR[i] ? '<i class="bi bi-check-lg"></i>' : '') + '</span></button>').join('');
  else if (s.Jenis === 'PGK') h += s.Pilihan.map((p, i) => '<button class="opt kotak ' + (j.a.includes(HUR[i]) ? 'sel' : '') + '" onclick="pilihPGK(\'' + HUR[i] + '\')"><span class="chk">' + (j.a.includes(HUR[i]) ? '<i class="bi bi-check-lg"></i>' : '') + '</span><span>' + esc(p) + '</span></button>').join('');
  else {
    const btns = i => '<div class="bs-btns"><button class="opt ' + (j.a[i] === 'B' ? 'sel' : '') + '" onclick="pilihBS(' + i + ',\'B\')"><i class="bi bi-check-circle"></i> BENAR</button><button class="opt ' + (j.a[i] === 'S' ? 'sel' : '') + '" onclick="pilihBS(' + i + ',\'S\')"><i class="bi bi-x-circle"></i> SALAH</button></div>';
    h += s.Pilihan.length ? s.Pilihan.map((p, i) => '<div class="bs-row"><div class="fw-semibold">' + (i + 1) + '. ' + esc(p) + '</div>' + btns(i) + '</div>').join('') : '<div class="bs-row">' + btns(0) + '</div>';
  }
  h += '<div class="act-bar"><button class="btn btn-soft" ' + (EX.cur === 0 ? 'disabled' : '') + ' onclick="lompat(' + (EX.cur - 1) + ')"><i class="bi bi-arrow-left"></i> Soal Sebelumnya</button><button class="btn btn-ragu ' + (j.r ? 'on' : '') + '" onclick="toggleRagu()"><i class="bi bi-flag' + (j.r ? '-fill' : '') + '"></i> Tandai Ragu-Ragu</button><button class="btn btn-primary" ' + (EX.cur === n - 1 ? 'disabled' : '') + ' onclick="lompat(' + (EX.cur + 1) + ')">Soal Berikutnya <i class="bi bi-arrow-right"></i></button></div>';
  $('qCard').innerHTML = h;
  const done = EX.soal.filter(adaJawab).length; $('progTxt').textContent = 'Terjawab ' + done + ' dari ' + n; $('progBar').style.width = (done / n * 100) + '%';
}
function drawGrid() {
  $('qGrid').innerHTML = EX.soal.map((s, i) => '<button class="qb ' + (EX.jaw[s.ID].r ? 'ragu' : adaJawab(s) ? 'done' : '') + (i === EX.cur ? ' cur' : '') + '" onclick="lompat(' + i + ')" aria-label="Soal ' + (i + 1) + '">' + (i + 1) + '</button>').join('');
}
function lompat(i) { if (i < 0 || i >= EX.soal.length) return; EX.cur = i; drawQ(); drawGrid(); const c = $('qCard'); if (window.innerWidth < 992) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function ubah(fn) { const s = EX.soal[EX.cur]; fn(EX.jaw[s.ID], s); EX.ver++; EX.dirty = true; lsSet(lsKey(), { j: EX.jaw, t: Date.now() }); setInd('dirty'); drawQ(); drawGrid(); }
function pilihPG(h) { ubah(j => { j.a = h; }); }
function pilihPGK(h) { ubah(j => { j.a = j.a.includes(h) ? j.a.filter(x => x !== h) : j.a.concat(h).sort(); }); }
function pilihBS(i, v) { ubah((j, s) => { const a = j.a.slice(); const n = Math.max(s.Pilihan.length, 1); for (let k = 0; k < n; k++) if (!a[k]) a[k] = ''; a[i] = v; j.a = a; }); }
function toggleRagu() { ubah(j => { j.r = !j.r; }); }

// ── Autosave & timer ──
function setInd(st) {
  const el = $('saveInd'); if (!el) return;
  const m = { dirty: ['', 'bi-cloud-upload', 'Menyimpan sebentar lagi...'], saving: ['', 'bi-arrow-repeat', 'Menyimpan...'], saved: ['', 'bi-cloud-check', 'Jawaban tersimpan otomatis'], err: ['err', 'bi-wifi-off', 'Belum tersimpan di server — jawaban aman di perangkat, akan dicoba lagi'] }[st];
  el.className = 'save-ind ' + m[0]; el.innerHTML = '<i class="bi ' + m[1] + '"></i> ' + m[2];
}
async function simpanOtomatis() {
  if (!EX || EX.saving || EX.submitting || EX.selesai) return;
  EX.saving = true; setInd('saving'); const v = EX.ver;
  try {
    const res = await api('jawabanSimpan', { ujianId: EX.u.ID, jawaban: EX.jaw });
    if (res.success) { if (EX.ver === v) EX.dirty = false; setInd(EX.dirty ? 'dirty' : 'saved'); }
    else if (res.message === 'WAKTU_HABIS') kirimAkhir(true);
    else if (res.message === 'FINAL') { EX.selesai = true; tampilSelesai({ selesai: true, nilai: null }); }
    else setInd('err');
  } catch (e) { setInd('err'); } finally { if (EX) EX.saving = false; }
}
function tick() {
  if (!EX || EX.selesai) return;
  const sisa = EX.deadline - (Date.now() + EX.offset), t = Math.max(0, sisa), p = n => String(n).padStart(2, '0');
  $('timerTxt').textContent = p(Math.floor(t / 3600000)) + ':' + p(Math.floor(t / 60000) % 60) + ':' + p(Math.floor(t / 1000) % 60);
  $('timer').classList.toggle('low', sisa < 300000);
  if (sisa <= 0 && !EX.submitting) kirimAkhir(true);
}

// ── Kumpulkan ──
function konfirmasiKirim() {
  const n = EX.soal.length, done = EX.soal.filter(adaJawab).length, ragu = EX.soal.filter(s => EX.jaw[s.ID].r).length, belum = n - done;
  modal('Kumpulkan jawaban?', '<div class="row g-2 text-center mb-3"><div class="col-4"><div class="card-x p-2"><div class="nunito fs-3 text-primary">' + done + '</div><div class="small text-muted">Terjawab</div></div></div><div class="col-4"><div class="card-x p-2"><div class="nunito fs-3" style="color:#B7791F">' + ragu + '</div><div class="small text-muted">Ragu-ragu</div></div></div><div class="col-4"><div class="card-x p-2"><div class="nunito fs-3 text-danger">' + belum + '</div><div class="small text-muted">Belum</div></div></div></div><p class="mb-0">' + (belum || ragu ? 'Masih ada soal yang belum dijawab atau ragu-ragu. ' : '') + 'Setelah dikumpulkan, jawaban <b>tidak dapat diubah</b>.</p>', '<button class="btn btn-soft" data-bs-dismiss="modal">Periksa Lagi</button><button class="btn btn-primary btn-lg" id="btnKirim">Ya, Kumpulkan</button>');
  $('btnKirim').onclick = () => { closeModal(); kirimAkhir(false); };
}
async function kirimAkhir(otomatis) {
  if (!EX || EX.submitting || EX.selesai) return; EX.submitting = true;
  clearInterval(EX.tAuto);
  $('qCard').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><h5 class="mt-3">' + (otomatis ? 'Waktu habis — ' : '') + 'Mengumpulkan jawaban...</h5><p class="text-muted">Jangan tutup halaman ini.</p></div>';
  for (let k = 0; k < 6; k++) {
    try {
      const res = await api('ujianKirim', { ujianId: EX.u.ID, jawaban: EX.jaw });
      if (res.success) { EX.selesai = true; clearInterval(EX.tClock); lsSet(lsKey(), null); window.onbeforeunload = null; tampilSelesai(res.data); return; }
      toast('Gagal', res.message, 'danger'); break;
    } catch (e) { await new Promise(r => setTimeout(r, 2500)); }
  }
  EX.submitting = false;
  $('qCard').innerHTML = '<div class="text-center py-5"><i class="bi bi-wifi-off fs-1 text-warning"></i><h5 class="mt-2">Belum berhasil mengirim</h5><p class="text-muted">Jawabanmu aman di perangkat ini. Periksa internet lalu coba lagi.</p><button class="btn btn-primary btn-lg" onclick="kirimAkhir(false)">Coba Kirim Lagi</button></div>';
}
function tampilSelesai(d) {
  $('siswaContent').innerHTML = '<div class="s-wrap" style="max-width:560px"><div class="card-x text-center py-5"><i class="bi bi-check-circle-fill text-success" style="font-size:4rem"></i><h2 class="mt-2">Ujian Selesai!</h2><p class="text-muted">Jawabanmu sudah dikumpulkan. Terima kasih sudah mengerjakan dengan jujur dan teliti.</p>' +
    (d && d.nilai !== null && d.nilai !== undefined ? '<div class="my-3"><div class="small text-muted">Nilai kamu</div><div class="nunito" style="font-size:3rem;color:var(--primary)">' + num(d.nilai) + '</div></div>' : '<p class="small text-muted">Hasil akan disampaikan oleh guru / dikirim ke email orang tua.</p>') +
    '<button class="btn btn-primary btn-lg mt-2" onclick="pgDaftarUjian()">Kembali ke Daftar Ujian</button></div></div>';
}
