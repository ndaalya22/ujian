// ============================================
// API — komunikasi dengan Google Apps Script (REST/JSON)
// ============================================
const gasSiap = () => /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(GAS_URL);

/**
 * POST JSON ke GAS. WAJIB Content-Type text/plain agar tidak memicu CORS preflight
 * (GAS tidak menjawab preflight). Token sesi dikirim di body, bukan di URL.
 */
async function gasPost(body, timeoutMs) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs || 60000);
  try {
    const res = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error('Server menjawab HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Server terlalu lama menjawab. Coba lagi.' : (e.message === 'Failed to fetch' ? 'Koneksi internet bermasalah.' : e.message));
  } finally { clearTimeout(t); }
}
