// ════════════════ BANK SOAL ════════════════
const JENIS = { PG: 'Pilihan Ganda', PGK: 'PG Kompleks', BS: 'Benar/Salah' };
let SO = { rows: [], mapel: '', jenis: '', q: '' };
async function pgSoal() {
  const res = await call('soalList', {}); if (!res) return;
  SO.rows = res.data; SO.mapel = S.mapel.length === 1 ? S.mapel[0].ID : ''; SO.jenis = ''; SO.q = '';
  $('pageContent').innerHTML = pageHead('Bank Soal & Manajemen Butir', 'Soal dibuat lewat form, gambar, atau impor Excel/Word',
    '<button class="btn btn-soft" onclick="formImpor()"><i class="bi bi-file-earmark-arrow-up"></i> Impor Excel / Word</button><button class="btn btn-primary" onclick="formSoal()"><i class="bi bi-plus-lg"></i> Buat Soal Baru</button>') +
    '<div class="card-x mb-3"><div class="row g-2"><div class="col-md-4"><select class="form-select" id="soMapel" onchange="SO.mapel=this.value;tabelSoal()" aria-label="Mata pelajaran"><option value="">Semua mata pelajaran</option>' + S.mapel.map(m => '<option value="' + m.ID + '" ' + (m.ID === SO.mapel ? 'selected' : '') + '>' + esc(m.Nama) + '</option>').join('') + '</select></div>' +
    '<div class="col-md-3"><select class="form-select" onchange="SO.jenis=this.value;tabelSoal()" aria-label="Jenis"><option value="">Semua jenis</option>' + Object.keys(JENIS).map(j => '<option value="' + j + '">' + JENIS[j] + '</option>').join('') + '</select></div>' +
    '<div class="col-md-5"><input class="form-control" placeholder="Cari teks soal..." oninput="SO.q=this.value;tabelSoal()" aria-label="Cari"></div></div><div class="row g-2 mt-1" id="soKpi"></div></div>' +
    '<div class="card-x"><div class="tscroll" id="soTabel"></div></div>';
  tabelSoal();
}
function tabelSoal() {
  const q = SO.q.toLowerCase();
  const base = SO.rows.filter(r => !SO.mapel || r.MapelID === SO.mapel);
  const cnt = j => base.filter(r => r.Jenis === j).length, tgt = { PG: S.cfg.jumlahPG, PGK: S.cfg.jumlahPGK, BS: S.cfg.jumlahBS };
  $('soKpi').innerHTML = Object.keys(JENIS).map(j => '<div class="col-md-4"><div class="step"><span class="n" style="font-size:.8rem">' + j + '</span><div><div class="small text-muted">' + JENIS[j] + '</div><b>' + cnt(j) + ' / ' + tgt[j] + ' soal</b> ' + (SO.mapel ? (cnt(j) >= Number(tgt[j]) ? '<span class="badge-x ok">Lengkap</span>' : '<span class="badge-x warn">Kurang</span>') : '') + '</div></div></div>').join('');
  const rows = base.filter(r => (!SO.jenis || r.Jenis === SO.jenis) && (!q || r.Teks.toLowerCase().includes(q)));
  $('soTabel').innerHTML = '<table class="table-x"><thead><tr><th>No</th><th>Pratinjau Soal</th><th>Jenis</th><th>Mapel</th><th>Gambar</th><th>Kunci</th><th>Bobot</th><th class="text-end">Aksi</th></tr></thead><tbody>' +
    (rows.slice(0, 200).map((r, i) => '<tr><td>' + (i + 1) + '</td><td style="max-width:340px">' + esc(r.Teks.slice(0, 110)) + (r.Teks.length > 110 ? '…' : '') + '</td><td><span class="badge-x ' + (r.Jenis === 'BS' ? 'warn' : '') + '">' + JENIS[r.Jenis] + '</span></td><td>' + esc(namaMapel(r.MapelID)) + '</td><td>' + (r.GambarID ? '<img class="thumb" src="' + gambarUrl(r.GambarID, 120) + '" onclick="pratinjauGambar(\'' + r.GambarID + '\')" alt="Gambar soal">' : '<span class="text-muted">-</span>') + '</td><td><span class="badge-x">' + esc(r.Kunci) + '</span></td><td>' + esc(r.Bobot) + '</td><td class="text-end text-nowrap"><button class="btn btn-soft btn-sm" onclick="formSoal(\'' + r.ID + '\')" aria-label="Ubah"><i class="bi bi-pencil"></i></button> <button class="btn btn-soft btn-sm text-danger" onclick="hapusSoal(\'' + r.ID + '\')" aria-label="Hapus"><i class="bi bi-trash"></i></button></td></tr>').join('') || '<tr><td colspan="8" class="text-center text-muted py-4">Belum ada soal.</td></tr>') + '</tbody></table>' + (rows.length > 200 ? '<div class="small text-muted p-2">Menampilkan 200 dari ' + rows.length + ' soal — gunakan filter untuk mempersempit.</div>' : '');
}
function hapusSoal(id) { konfirmasi('Hapus soal?', 'Soal akan dihapus dari bank soal.', 'Hapus', async () => { const r = await call('soalHapus', { id: id }); if (r) { toast('Berhasil', r.message, 'success'); pgSoal(); } }, true); }

// ── Editor soal ──
let ED = null;
function formSoal(id) {
  const r = id ? SO.rows.find(x => x.ID === id) : null;
  let pil = []; if (r) { try { pil = JSON.parse(r.Pilihan || '[]'); } catch (e) {} }
  ED = { id: id || '', MapelID: r ? r.MapelID : (SO.mapel || (S.mapel[0] || {}).ID || ''), Jenis: r ? r.Jenis : 'PG', Teks: r ? r.Teks : '', GambarID: r ? r.GambarID : '', Bobot: r ? r.Bobot : '1', pil: pil, kunci: r ? String(r.Kunci).split(',') : [], file: null };
  if (!r) ED.pil = ['', '', '', '']; if (ED.Jenis === 'BS' && !r) { ED.pil = []; ED.kunci = ['B']; }
  modal(id ? 'Ubah Soal' : 'Buat Soal Baru', '<form id="frmSoal" onsubmit="return false"><div class="row g-3"><div class="col-md-6"><label class="form-label">Mata Pelajaran *</label><select class="form-select" id="edMapel" required>' + S.mapel.map(m => '<option value="' + m.ID + '" ' + (m.ID === ED.MapelID ? 'selected' : '') + '>' + esc(m.Nama) + '</option>').join('') + '</select></div>' +
    '<div class="col-md-6"><label class="form-label">Jenis Soal *</label><select class="form-select" id="edJenis" onchange="edGanti(this.value)">' + Object.keys(JENIS).map(j => '<option value="' + j + '" ' + (j === ED.Jenis ? 'selected' : '') + '>' + JENIS[j] + '</option>').join('') + '</select></div>' +
    '<div class="col-12"><label class="form-label">Teks Soal *</label><textarea class="form-control" id="edTeks" required>' + esc(ED.Teks) + '</textarea></div>' +
    '<div class="col-12"><label class="form-label">Gambar (opsional, maks 2 MB)</label><input type="file" accept="image/*" class="form-control" id="edFile" onchange="edFile(this)"><div id="edGbr" class="mt-2"></div></div>' +
    '<div class="col-12" id="edOps"></div><div class="col-md-4"><label class="form-label">Bobot *</label><input type="number" min="0.5" step="0.5" class="form-control" id="edBobot" value="' + esc(ED.Bobot) + '" required></div></div></form>',
    '<button class="btn btn-soft" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnSoal">Simpan Soal</button>', 'lg');
  edGbr(); edOps(); $('btnSoal').onclick = simpanSoal;
}
function edGanti(j) { ED.Jenis = j; ED.kunci = j === 'BS' ? ['B'] : []; ED.pil = j === 'BS' ? [] : ['', '', '', '']; edOps(); }
function edFile(inp) { const f = inp.files[0]; if (!f) return; if (f.size > 2 * 1024 * 1024) { toast('Peringatan', 'Ukuran gambar maksimal 2 MB.', 'warning'); inp.value = ''; return; } ED.file = f; const rd = new FileReader(); rd.onload = () => { $('edGbr').innerHTML = '<img src="' + rd.result + '" style="max-height:140px;border-radius:12px" alt="Pratinjau">'; }; rd.readAsDataURL(f); }
function edGbr() { $('edGbr').innerHTML = ED.GambarID ? '<img src="' + gambarUrl(ED.GambarID, 400) + '" style="max-height:140px;border-radius:12px" alt="Gambar soal"> <button type="button" class="btn btn-soft btn-sm ms-2" onclick="ED.GambarID=\'\';edGbr()">Hapus gambar</button>' : ''; }
const HUR = ['A', 'B', 'C', 'D', 'E'];
function edOps() {
  const j = ED.Jenis; let h = '';
  if (j === 'PG' || j === 'PGK') {
    h = '<label class="form-label">Pilihan Jawaban & Kunci * <span class="text-muted fw-normal">(' + (j === 'PG' ? 'pilih satu jawaban benar' : 'centang semua jawaban benar') + ')</span></label>' +
      ED.pil.map((p, i) => '<div class="d-flex align-items-center gap-2 mb-2"><span class="avatar m-0">' + HUR[i] + '</span><input class="form-control" value="' + esc(p) + '" oninput="ED.pil[' + i + ']=this.value" placeholder="Pilihan ' + HUR[i] + '"><input type="' + (j === 'PG' ? 'radio' : 'checkbox') + '" name="kk" class="form-check-input flex-none" style="width:26px;height:26px" ' + (ED.kunci.includes(HUR[i]) ? 'checked' : '') + ' onchange="edKunci(\'' + HUR[i] + '\',this.checked)" aria-label="Kunci ' + HUR[i] + '"></div>').join('') +
      '<div class="d-flex gap-2"><button type="button" class="btn btn-soft btn-sm" ' + (ED.pil.length >= 5 ? 'disabled' : '') + ' onclick="ED.pil.push(\'\');edOps()">+ Pilihan</button><button type="button" class="btn btn-soft btn-sm" ' + (ED.pil.length <= 2 ? 'disabled' : '') + ' onclick="ED.kunci=ED.kunci.filter(k=>k!==HUR[ED.pil.length-1]);ED.pil.pop();edOps()">− Pilihan</button></div>';
  } else if (!ED.pil.length) {
    h = '<label class="form-label">Kunci * <span class="text-muted fw-normal">(teks soal menjadi pernyataan)</span></label><div class="d-flex gap-2 align-items-center"><select class="form-select" style="max-width:200px" onchange="ED.kunci=[this.value]"><option value="B" ' + (ED.kunci[0] === 'B' ? 'selected' : '') + '>BENAR</option><option value="S" ' + (ED.kunci[0] === 'S' ? 'selected' : '') + '>SALAH</option></select><button type="button" class="btn btn-soft btn-sm" onclick="ED.pil=[\'\',\'\'];ED.kunci=[\'B\',\'B\'];edOps()">Gunakan beberapa pernyataan</button></div>';
  } else {
    h = '<label class="form-label">Daftar Pernyataan & Kunci * <span class="text-muted fw-normal">(teks soal menjadi petunjuk)</span></label>' + ED.pil.map((p, i) => '<div class="d-flex align-items-center gap-2 mb-2"><span class="avatar m-0">' + (i + 1) + '</span><input class="form-control" value="' + esc(p) + '" oninput="ED.pil[' + i + ']=this.value" placeholder="Pernyataan ' + (i + 1) + '"><select class="form-select" style="max-width:130px" onchange="ED.kunci[' + i + ']=this.value"><option value="B" ' + (ED.kunci[i] === 'B' ? 'selected' : '') + '>Benar</option><option value="S" ' + (ED.kunci[i] === 'S' ? 'selected' : '') + '>Salah</option></select></div>').join('') +
      '<div class="d-flex gap-2"><button type="button" class="btn btn-soft btn-sm" ' + (ED.pil.length >= 5 ? 'disabled' : '') + ' onclick="ED.pil.push(\'\');ED.kunci.push(\'B\');edOps()">+ Pernyataan</button><button type="button" class="btn btn-soft btn-sm" ' + (ED.pil.length <= 2 ? 'disabled' : '') + ' onclick="ED.pil.pop();ED.kunci.pop();edOps()">− Pernyataan</button><button type="button" class="btn btn-soft btn-sm" onclick="ED.pil=[];ED.kunci=[\'B\'];edOps()">Pakai satu pernyataan</button></div>';
  }
  $('edOps').innerHTML = h;
}
function edKunci(h, on) { if (ED.Jenis === 'PG') ED.kunci = [h]; else ED.kunci = on ? Array.from(new Set(ED.kunci.concat(h))).sort() : ED.kunci.filter(k => k !== h); }
async function simpanSoal() {
  const f = $('frmSoal'); if (!f.checkValidity()) { f.reportValidity(); return; }
  const btn = $('btnSoal'); setBtn(btn, true, 'Menyimpan...');
  try {
    if (ED.file) {
      const b64 = await new Promise((ok, no) => { const rd = new FileReader(); rd.onload = () => ok(rd.result.split(',')[1]); rd.onerror = no; rd.readAsDataURL(ED.file); });
      const g = await api('soalGambar', { base64: b64, nama: ED.file.name, mime: ED.file.type });
      if (!g.success) { toast('Gagal', g.message, 'danger'); return; } ED.GambarID = g.data.id;
    }
    const data = { ID: ED.id, MapelID: $('edMapel').value, Jenis: ED.Jenis, Teks: $('edTeks').value, GambarID: ED.GambarID, Pilihan: ED.pil, Kunci: (ED.Jenis === 'BS' && !ED.pil.length ? ED.kunci.slice(0, 1) : ED.kunci).join(','), Bobot: $('edBobot').value };
    const res = await api('soalSimpan', { data: data });
    if (!res.success) { toast('Gagal', res.message, 'danger'); return; }
    toast('Berhasil', res.message, 'success'); closeModal(); pgSoal();
  } catch (e) { toast('Error', e.message, 'danger'); } finally { setBtn(btn, false); }
}

// ── Impor Excel / Word ──
let IMP = { rows: [], hasil: [] };
function unduhTemplate() {
  const aoa = [['mapel', 'jenis', 'soal', 'a', 'b', 'c', 'd', 'e', 'kunci', 'bobot'],
    [(S.mapel[0] || {}).Nama || 'Matematika', 'PG', 'Hasil dari 125 + 75 adalah ...', '190', '200', '210', '220', '', 'B', 1],
    [(S.mapel[0] || {}).Nama || 'Matematika', 'PGK', 'Pilih semua bilangan genap.', '12', '15', '20', '27', '', 'A,C', 1],
    [(S.mapel[0] || {}).Nama || 'Matematika', 'BS', 'Tentukan benar/salah tiap pernyataan.', 'Persegi punya 4 sisi sama', 'Segitiga punya 4 sudut', '', '', '', 'B,S', 1],
    [(S.mapel[0] || {}).Nama || 'Matematika', 'BS', '5 + 5 = 10', '', '', '', '', '', 'B', 1]];
  const ws = XLSX.utils.aoa_to_sheet(aoa), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Soal');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Petunjuk'], ['jenis: PG / PGK / BS'], ['kunci PG: satu huruf (B). PGK: huruf dipisah koma (A,C).'], ['BS: kunci B atau S per pernyataan, dipisah koma; kolom a–e = pernyataan. Jika kosong, kolom soal = pernyataan.'], ['Untuk Word (.docx): salin tabel ini ke dokumen Word (satu tabel, baris pertama = judul kolom).'], ['Gambar ditambahkan lewat form Edit Soal setelah impor.']]), 'Petunjuk');
  XLSX.writeFile(wb, 'template_soal_ujian.xlsx');
}
function formImpor() {
  IMP = { rows: [], hasil: [] };
  modal('Impor Soal dari Excel / Word', '<div class="row g-2 mb-3"><div class="col-md-4"><div class="step"><span class="n">1</span><div><b>Unduh template</b><div class="small text-muted">Format baku</div></div></div></div><div class="col-md-4"><div class="step"><span class="n">2</span><div><b>Unggah berkas</b><div class="small text-muted">.xlsx / .csv / .docx</div></div></div></div><div class="col-md-4"><div class="step"><span class="n">3</span><div><b>Validasi & simpan</b><div class="small text-muted">Cek tiap baris</div></div></div></div></div>' +
    '<button class="btn btn-soft mb-3" onclick="unduhTemplate()"><i class="bi bi-download"></i> Unduh Template Excel</button>' +
    '<label class="dropzone d-block" id="dz" for="impFile"><i class="bi bi-cloud-arrow-up fs-1 text-primary"></i><div class="fw-bold">Tarik & lepas berkas, atau klik untuk memilih</div><div class="small text-muted">Maks 5 MB · maks 500 baris</div><input type="file" id="impFile" class="hidden" accept=".xlsx,.xls,.csv,.docx" onchange="impBaca(this.files[0])"></label><div id="impHasil" class="mt-3"></div>', '<button class="btn btn-soft" data-bs-dismiss="modal">Tutup</button><button class="btn btn-primary hidden" id="btnImpSimpan">Simpan</button>', 'xl');
  const dz = $('dz'); ['dragover', 'dragenter'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('drag'); })); ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('drag'); })); dz.addEventListener('drop', ev => impBaca(ev.dataTransfer.files[0]));
}
function aoaKeRows(aoa) {
  if (!aoa.length) throw new Error('Berkas kosong.');
  const head = aoa[0].map(h => String(h).trim().toLowerCase());
  ['mapel', 'jenis', 'soal', 'kunci'].forEach(k => { if (head.indexOf(k) < 0) throw new Error('Kolom "' + k + '" tidak ditemukan. Gunakan template resmi.'); });
  return aoa.slice(1).map((r, i) => ({ r: r, i: i })).filter(x => x.r.some(c => String(c).trim() !== '')).map(x => { const o = { _baris: x.i + 2 }; head.forEach((h, j) => o[h] = x.r[j] === undefined ? '' : String(x.r[j]).trim()); return o; });
}
async function impBaca(file) {
  if (!file) return; const box = $('impHasil');
  if (file.size > 5 * 1024 * 1024) { box.innerHTML = '<div class="alert-x">Ukuran berkas melebihi 5 MB.</div>'; return; }
  box.innerHTML = '<span class="spinner-inline"></span> Membaca berkas...';
  try {
    const buf = await file.arrayBuffer(), ext = file.name.split('.').pop().toLowerCase(); let aoa;
    if (ext === 'docx') {
      const r = await mammoth.convertToHtml({ arrayBuffer: buf }), doc = new DOMParser().parseFromString(r.value, 'text/html'), tr = [...doc.querySelectorAll('table tr')];
      if (!tr.length) throw new Error('Tabel tidak ditemukan di dokumen Word.'); aoa = tr.map(t => [...t.children].map(c => c.textContent.trim()));
    } else { const wb = XLSX.read(buf, { type: 'array' }); aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }); }
    IMP.rows = aoaKeRows(aoa); if (!IMP.rows.length) throw new Error('Tidak ada baris soal.'); if (IMP.rows.length > 500) throw new Error('Maksimal 500 baris per impor.');
    const res = await api('soalValidasi', { rows: IMP.rows }); if (!res.success) throw new Error(res.message);
    IMP.hasil = res.data; const ok = IMP.hasil.filter(h => h.valid).length, bad = IMP.hasil.length - ok;
    box.innerHTML = '<div class="d-flex gap-2 mb-2"><span class="badge-x ok">' + ok + ' valid</span><span class="badge-x bad">' + bad + ' perlu revisi</span></div><div class="tscroll" style="max-height:320px;overflow-y:auto"><table class="table-x"><thead><tr><th>Baris</th><th>Jenis</th><th>Ringkasan</th><th>Kunci</th><th>Status</th></tr></thead><tbody>' + IMP.hasil.map(h => '<tr class="' + (h.valid ? '' : 'row-bad') + '"><td>' + h.baris + '</td><td>' + esc(h.jenis) + '</td><td>' + esc(h.ringkas) + '</td><td>' + esc(h.kunci || '-') + '</td><td>' + (h.valid ? '<span class="badge-x ok">Valid</span>' : '<span class="text-danger small">' + esc(h.alasan) + '</span>') + '</td></tr>').join('') + '</tbody></table></div>' + (bad ? '<div class="small text-muted mt-2">Baris tidak valid akan dilewati. Perbaiki di berkas lalu unggah ulang bila perlu.</div>' : '');
    const b = $('btnImpSimpan'); b.classList.toggle('hidden', !ok); b.innerHTML = 'Simpan ' + ok + ' Soal Valid';
    b.onclick = async () => { const r = await call('soalImpor', { rows: IMP.rows }, b); if (r) { toast('Berhasil', r.message, 'success'); closeModal(); pgSoal(); } };
  } catch (e) { box.innerHTML = '<div class="alert-x">' + esc(e.message) + '</div>'; }
}

// ════════════════ HASIL NILAI ════════════════
let HS = { ujian: [], rows: [], uj: null, ringkas: null };
async function pgHasil() {
  const res = await call('crudList', { entitas: 'ujian' }); if (!res) return;
  HS.ujian = res.data.sort((a, b) => String(b.Mulai).localeCompare(String(a.Mulai)));
  $('pageContent').innerHTML = pageHead('Hasil Nilai', 'Lembar nilai individual, ekspor, dan cetak PDF A4') +
    '<div class="card-x mb-3"><label class="form-label">Pilih ujian</label><select class="form-select" id="hsUjian" onchange="muatHasil(this.value)"><option value="">— pilih ujian —</option>' + HS.ujian.map(u => '<option value="' + u.ID + '">' + esc(namaMapel(u.MapelID)) + ' · Kelas ' + esc(u.Kelas) + ' · TW ' + esc(u.Triwulan) + ' · ' + esc(u.TahunAjaran) + '</option>').join('') + '</select></div><div id="hsIsi"></div>';
  if (HS.ujian.length) { $('hsUjian').value = HS.ujian[0].ID; muatHasil(HS.ujian[0].ID); }
}
async function muatHasil(id) {
  if (!id) { $('hsIsi').innerHTML = ''; return; }
  loadingBox('hsIsi'); const res = await call('hasilList', { ujianId: id }); if (!res) { $('hsIsi').innerHTML = ''; return; }
  HS.uj = HS.ujian.find(u => u.ID === id); HS.rows = res.data.rows; HS.ringkas = res.data.ringkas; const r = HS.ringkas, admin = S.user.peran === 'admin';
  const pill = v => v === '' ? '<span class="text-muted">-</span>' : '<span class="nilai-pill ' + (Number(v) >= r.kkm ? '' : Number(v) >= r.kkm - 15 ? 'warn' : 'bad') + '">' + num(v) + '</span>';
  $('hsIsi').innerHTML = '<div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-soft" onclick="eksporHasil()"><i class="bi bi-file-earmark-excel"></i> Ekspor Spreadsheet (.xlsx)</button><button class="btn btn-primary" id="btnPdf" onclick="cetakPdf()"><i class="bi bi-printer"></i> Cetak PDF Resmi A4</button></div>' +
    '<div class="row g-3 mb-3"><div class="col-6 col-lg-3">' + statCard('bi-graph-up', 'Rata-rata Kelas', num(r.rata), r.sudah + ' dari ' + r.total + ' siswa') + '</div><div class="col-6 col-lg-3">' + statCard('bi-trophy', 'Nilai Tertinggi', num(r.tertinggi, 0)) + '</div><div class="col-6 col-lg-3">' + statCard('bi-check2-circle', 'Tuntas KKM (≥' + r.kkm + ')', r.sudah ? Math.round(r.tuntas / r.sudah * 100) + '%' : '-', r.tuntas + ' dari ' + r.sudah + ' siswa') + '</div><div class="col-6 col-lg-3">' + statCard('bi-envelope-check', 'Belum Mengerjakan', r.total - r.sudah, 'siswa') + '</div></div>' +
    '<div class="card-x"><h6>Lembar Nilai Individual Peserta Didik</h6><div class="tscroll"><table class="table-x"><thead><tr><th>No</th><th>Nama</th><th>NISN</th><th>Skor PG</th><th>Skor PGK</th><th>Skor B/S</th><th>Nilai Akhir</th><th>Email Ortu</th><th class="text-end">Aksi</th></tr></thead><tbody>' +
    HS.rows.map(x => '<tr><td>' + x.No + '</td><td><span class="avatar">' + inisial(x.Nama) + '</span>' + esc(x.Nama) + '</td><td>' + esc(x.NISN) + '</td><td>' + num(x.SkorPG) + '</td><td>' + num(x.SkorPGK) + '</td><td>' + num(x.SkorBS) + '</td><td>' + pill(x.NilaiAkhir) + '</td><td><span class="badge-x ' + (x.StatusEmail === 'Terkirim' ? 'ok' : x.StatusEmail === 'Gagal' ? 'bad' : 'warn') + '">' + esc(x.StatusEmail) + '</span></td><td class="text-end text-nowrap">' + (x.Sudah ? (admin ? '<button class="btn btn-soft btn-sm" onclick="koreksi(\'' + x.NilaiID + '\',\'' + esc(x.Nama) + '\',\'' + x.NilaiAkhir + '\')">Koreksi</button> ' : '') + '<button class="btn btn-soft btn-sm" onclick="emailUlang(\'' + x.NilaiID + '\')" title="Kirim ulang email"><i class="bi bi-envelope-arrow-up"></i></button>' : '') + '</td></tr>').join('') + '</tbody></table></div></div>';
}
function eksporHasil() {
  const u = HS.uj, aoa = [['No', 'Nama', 'NISN', 'Skor PG', 'Skor PGK', 'Skor B/S', 'Nilai Akhir', 'Status Email']].concat(HS.rows.map(x => [x.No, x.Nama, x.NISN, x.SkorPG, x.SkorPGK, x.SkorBS, x.NilaiAkhir, x.StatusEmail]));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Nilai'); XLSX.writeFile(wb, 'Nilai_' + namaMapel(u.MapelID) + '_' + u.Kelas + '_TW' + u.Triwulan + '.xlsx');
}
async function cetakPdf() {
  const res = await call('hasilPdf', { ujianId: HS.uj.ID }, $('btnPdf')); if (!res) return;
  pratinjau('Pratinjau PDF · ' + res.data.nama, '<iframe src="https://drive.google.com/file/d/' + res.data.id + '/preview" style="width:100%;height:70vh;border:0" title="Pratinjau PDF"></iframe>', 'https://drive.google.com/uc?export=download&id=' + res.data.id);
}
function koreksi(nilaiId, nama, lama) {
  modal('Koreksi Nilai', '<p>Siswa: <b>' + esc(nama) + '</b></p><label class="form-label">Nilai akhir baru (0–100)</label><input type="number" min="0" max="100" step="0.01" class="form-control" id="nilBaru" value="' + esc(lama) + '">', '<button class="btn btn-soft" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnKor">Simpan</button>');
  $('btnKor').onclick = async () => { const r = await call('hasilKoreksi', { nilaiId: nilaiId, nilai: $('nilBaru').value }, $('btnKor')); if (r) { toast('Berhasil', r.message, 'success'); closeModal(); muatHasil(HS.uj.ID); } };
}
async function emailUlang(id) { const r = await call('emailUlang', { nilaiId: id }); if (r) { toast('Berhasil', r.message, 'success'); muatHasil(HS.uj.ID); } }

// ════════════════ ASISTEN AI (admin) ════════════════
let AI = { mapelId: '', hist: [], drafts: [], busy: false, ada: false };
async function kartuAi() {
  const st = await call('aiStatus'); if (!st) return;
  const d = document.createElement('div'); d.className = 'card-x mt-3';
  d.innerHTML = '<h6><i class="bi bi-stars"></i> Asisten AI Pembuat Soal</h6><p class="small text-muted">Kunci API disimpan aman di server (Script Properties) dan tidak pernah tampil di browser. Status: <b>' + (st.data.adaKunci ? 'sudah terpasang' : 'belum diisi') + '</b></p><div class="row g-2"><div class="col-md-7"><input type="password" class="form-control" id="aiKey" autocomplete="off" placeholder="' + (st.data.adaKunci ? 'Isi hanya bila ingin mengganti kunci' : 'Tempel kunci API di sini') + '"></div><div class="col-md-5"><input class="form-control" id="aiModel" value="' + esc(st.data.model) + '" aria-label="Model"></div></div><div class="d-flex gap-2 mt-3"><button class="btn btn-primary" id="btnAiKey">Simpan</button>' + (st.data.adaKunci ? '<button class="btn btn-soft text-danger" id="btnAiDel">Hapus kunci</button>' : '') + '</div>';
  $('pageContent').appendChild(d);
  $('btnAiKey').onclick = async () => { const r = await call('aiSetKey', { key: $('aiKey').value, model: $('aiModel').value }, $('btnAiKey')); if (r) { toast('Berhasil', r.message, 'success'); pgPengaturan(); } };
  if ($('btnAiDel')) $('btnAiDel').onclick = async () => { const r = await call('aiSetKey', { hapus: true }); if (r) { toast('Berhasil', r.message, 'success'); pgPengaturan(); } };
}
async function pgAi() {
  const st = await call('aiStatus'); if (!st) return; AI.ada = st.data.adaKunci;
  if (!AI.mapelId) AI.mapelId = (S.mapel[0] || {}).ID || '';
  $('pageContent').innerHTML = pageHead('Buat Soal dengan AI', 'Berdiskusi dengan asisten, pilih soal yang cocok, ganti yang kurang pas, lalu simpan ke Bank Soal') +
    (AI.ada ? '' : '<div class="alert-x mb-3" style="background:var(--yellow-50);color:#7a5200">Kunci API AI belum diisi. Buka <a href="#" onclick="nav(\'pengaturan\');return false">Pengaturan</a> bagian Asisten AI.</div>') +
    '<div class="ai-grid"><div class="card-x"><label class="form-label" for="aiMapel">Mata pelajaran tujuan</label><select class="form-select" id="aiMapel" onchange="AI.mapelId=this.value">' + S.mapel.map(m => '<option value="' + m.ID + '" ' + (m.ID === AI.mapelId ? 'selected' : '') + '>' + esc(m.Nama) + '</option>').join('') + '</select>' +
    '<div class="chat" id="aiChat"></div><div class="d-flex flex-wrap gap-1 mb-2">' + ['10 soal PG pecahan kelas 4, tingkat sedang', '5 soal PG kompleks tentang bangun datar', '8 soal benar/salah tentang keliling'].map(t => '<button class="badge-x border-0" style="cursor:pointer" onclick="$(\'aiMsg\').value=this.textContent;$(\'aiMsg\').focus()">' + t + '</button>').join('') + '</div>' +
    '<div class="d-flex gap-2"><textarea class="form-control" id="aiMsg" rows="2" placeholder="Ceritakan soal yang dibutuhkan..." aria-label="Pesan"></textarea><button class="btn btn-primary" id="btnAi" onclick="kirimAi()" aria-label="Kirim"><i class="bi bi-send-fill"></i></button></div></div>' +
    '<div class="card-x"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="mb-0">Draf Soal <span class="badge-x" id="aiCnt">0</span></h6><div class="d-flex gap-2"><button class="btn btn-soft btn-sm" onclick="aiPilih(true)">Pilih semua</button><button class="btn btn-soft btn-sm" onclick="aiPilih(false)">Kosongkan</button></div></div><div id="aiDraf"></div><button class="btn btn-primary w-100 mt-2" id="btnAiSimpan" onclick="aiSimpan()"><i class="bi bi-save"></i> Simpan soal terpilih ke Bank Soal</button></div></div>';
  $('aiMsg').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirimAi(); } });
  drawChat(); drawDraf();
}
function drawChat() {
  const box = $('aiChat'); if (!box) return;
  const awal = '<div class="msg a">Halo! Sebutkan jenis, jumlah, topik, dan tingkat kesulitan soal yang kamu mau. Setelah draf muncul, centang yang cocok dan tekan "Ganti" pada soal yang kurang pas.</div>';
  box.innerHTML = awal + AI.hist.map(m => '<div class="msg ' + (m.role === 'user' ? 'u' : 'a') + '">' + esc(m.content) + '</div>').join('') + (AI.busy ? '<div class="msg a typing"><span></span><span></span><span></span></div>' : '');
  box.scrollTop = box.scrollHeight;
}
function drawDraf() {
  const box = $('aiDraf'); if (!box) return;
  $('aiCnt').textContent = AI.drafts.length;
  box.innerHTML = AI.drafts.length ? AI.drafts.map((d, i) => {
    const s = d.data, huruf = s.Jenis === 'BS' ? null : HUR, kunci = String(s.Kunci).split(',');
    const pil = s.Pilihan.length ? s.Pilihan.map((p, k) => '<div class="pl ' + ((s.Jenis === 'BS' ? '' : kunci.includes(HUR[k])) ? 'k' : '') + '">' + (s.Jenis === 'BS' ? (i2 => (k + 1) + '. ' + esc(p) + ' → <b>' + (kunci[k] === 'B' ? 'Benar' : 'Salah') + '</b>')() : HUR[k] + '. ' + esc(p)) + '</div>').join('') : '<div class="pl k">Kunci: <b>' + (kunci[0] === 'B' ? 'BENAR' : 'SALAH') + '</b></div>';
    return '<div class="draft ' + (d.sel ? 'sel' : '') + (d.ok ? '' : ' bad') + '"><div class="d-flex gap-2 align-items-start"><input type="checkbox" class="form-check-input mt-1" style="width:22px;height:22px;flex:none" ' + (d.sel ? 'checked' : '') + (d.ok ? '' : ' disabled') + ' onchange="AI.drafts[' + i + '].sel=this.checked;drawDraf()" aria-label="Pilih soal ' + (i + 1) + '"><div class="flex-grow-1"><div class="mb-1"><span class="badge-x">' + (i + 1) + '</span> <span class="badge-x ' + (s.Jenis === 'BS' ? 'warn' : '') + '">' + (JENIS[s.Jenis] || s.Jenis) + '</span></div><div>' + nl2br(s.Teks) + '</div>' + pil + (d.ok ? '' : '<div class="text-danger small mt-1"><i class="bi bi-exclamation-triangle"></i> ' + esc(d.err) + ' — gunakan Ganti.</div>') + '</div></div><div class="d-flex gap-2 justify-content-end mt-2"><button class="btn btn-soft btn-sm" onclick="aiGanti(' + i + ')"><i class="bi bi-arrow-repeat"></i> Ganti</button><button class="btn btn-soft btn-sm text-danger" onclick="AI.drafts.splice(' + i + ',1);drawDraf()" aria-label="Buang"><i class="bi bi-trash"></i></button></div></div>';
  }).join('') : '<div class="text-center text-muted py-5"><i class="bi bi-stars fs-1"></i><p class="mb-0">Draf soal dari asisten akan muncul di sini.</p></div>';
  const n = AI.drafts.filter(d => d.sel && d.ok).length; const b = $('btnAiSimpan'); if (b && !b.disabled) b.innerHTML = '<i class="bi bi-save"></i> Simpan ' + n + ' soal terpilih ke Bank Soal'; if (b) b.dataset.n = n;
}
function aiPilih(on) { AI.drafts.forEach(d => { if (d.ok) d.sel = on; }); drawDraf(); }
async function kirimAi() {
  if (AI.busy) return; const t = $('aiMsg').value.trim(); if (!t) return;
  if (!AI.mapelId) { toast('Peringatan', 'Pilih mata pelajaran dahulu.', 'warning'); return; }
  const riwayat = AI.hist.slice(); AI.hist.push({ role: 'user', content: t }); $('aiMsg').value = ''; AI.busy = true; $('btnAi').disabled = true; drawChat();
  try {
    const res = await api('aiChat', { mapelId: AI.mapelId, history: riwayat, pesan: t, drafts: AI.drafts.map(d => d.data) });
    if (!res.success) { AI.hist.push({ role: 'assistant', content: 'Maaf, terjadi kendala: ' + res.message }); }
    else { AI.hist.push({ role: 'assistant', content: res.data.balasan || (res.data.soal.length ? 'Ini draf soalnya.' : '...') }); res.data.soal.forEach(s => AI.drafts.push({ data: s.data, ok: s.ok, err: s.err, sel: s.ok })); }
  } catch (e) { AI.hist.push({ role: 'assistant', content: 'Maaf, koneksi bermasalah: ' + e.message }); }
  AI.busy = false; const b = $('btnAi'); if (b) b.disabled = false; drawChat(); drawDraf();
}
function aiGanti(i) {
  modal('Ganti soal nomor ' + (i + 1), '<div class="mb-2 small text-muted">' + esc(AI.drafts[i].data.Teks.slice(0, 140)) + '</div><label class="form-label">Apa yang ingin diubah? (opsional)</label><textarea class="form-control" id="aiInstr" rows="3" placeholder="mis. buat lebih mudah, ganti nama tokoh, atau ubah menjadi PG kompleks"></textarea>', '<button class="btn btn-soft" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="btnGanti">Ganti Soal</button>');
  $('btnGanti').onclick = async () => {
    const r = await call('aiChat', { mode: 'ganti', mapelId: AI.mapelId, draft: AI.drafts[i].data, instruksi: $('aiInstr').value }, $('btnGanti'));
    if (!r) return; const s = r.data.soal[0];
    if (!s) { toast('Gagal', 'AI tidak mengembalikan soal. Coba ubah instruksi.', 'danger'); return; }
    AI.drafts[i] = { data: s.data, ok: s.ok, err: s.err, sel: s.ok }; closeModal(); drawDraf(); toast('Berhasil', 'Soal nomor ' + (i + 1) + ' diganti.', 'success');
  };
}
async function aiSimpan() {
  const pilih = AI.drafts.filter(d => d.sel && d.ok); if (!pilih.length) { toast('Peringatan', 'Belum ada soal yang dipilih.', 'warning'); return; }
  const r = await call('soalBatch', { mapelId: AI.mapelId, data: pilih.map(d => d.data) }, $('btnAiSimpan')); if (!r) return;
  toast('Berhasil', r.message, 'success'); AI.drafts = AI.drafts.filter(d => !(d.sel && d.ok)); drawDraf();
}
