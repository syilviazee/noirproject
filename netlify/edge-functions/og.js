// Netlify Edge Function: menyuntikkan meta Open Graph per-situs untuk /?p=<slug>
// Crawler Facebook/WhatsApp/Telegram/X/Discord tidak menjalankan JavaScript, jadi meta tag
// harus sudah ada di HTML. Env vars (Site settings > Environment variables):
// SUPABASE_URL, SUPABASE_ANON_KEY

const DEFDESC = 'nocturnee — a note of midnight.';
// Cadangan jika Environment Variables di Netlify belum diisi. Kunci "publishable" memang publik
// (sama dengan CFG di index.html) dan hanya bisa membaca baris yang diizinkan oleh RLS.
const FALLBACK_SB = 'https://drldderupwysgnvmmwaw.supabase.co';
const FALLBACK_KEY = 'sb_publishable_LFM7hMerwBCUc1BsslWN0w_b4YGOuVF';

// Teks murni: buang tag HTML, isi <script>/<style>, komentar, potongan kode & karakter kontrol.
const CODEBITS = /\b(?:let|const|var)\s+[\w$]+\s*=\s*[^;\n]*;?|new\s+DOMParser\(\)[^;\n]*;?|[\w.]*parseFromString\([^)]*\)|\btext\/html\b|\bdocument\.(?:write|querySelector|getElementById|createElement)\b[^;\n]*;?/gi;
const plain = (v, max) => {
  let t = String(v == null ? '' : v);
  t = t.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
       .replace(/<(script|style|template|noscript)\b[\s\S]*$/i, ' ')
       .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
       .replace(/<\/?[a-z!?][^>]*>?/gi, ' ')
       .replace(CODEBITS, ' ');
  t = t.replace(new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f]+', 'g'), ' ').replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isHttps = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '').trim());

const tag = (res, status) => {
  const h = new Headers(res.headers);
  h.set('x-og-status', status);
  return new Response(res.body, { status: res.status, headers: h });
};

export default async (request, context) => {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('p') || '').toLowerCase();
  const debug = url.searchParams.get('og_debug') === '1';
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return context.next();
  const res = await context.next();
  const SB = Netlify.env.get('SUPABASE_URL') || FALLBACK_SB;
  const KEY = Netlify.env.get('SUPABASE_ANON_KEY') || FALLBACK_KEY;

  // og_image = gambar gabungan banner + foto profil (dibuat saat Publikasi / saat banner berubah).
  // cover & profile diambil dari kolom data (jsonb) sebagai cadangan jika og_image belum ada.
  let site = null, status = 'ok', httpStatus = null, rows = null;
  try {
    const q = `${SB}/rest/v1/sites?slug=eq.${slug}&published=eq.true&select=title,description,og_image,cover:data->cover,profile:data->profile`;
    const r = await fetch(q, { headers: { apikey: KEY } });
    httpStatus = r.status;
    if (r.ok) { const j = await r.json(); rows = j.length; site = j[0] || null; if (!site) status = 'no-published-row'; }
    else status = 'supabase-error-' + r.status;
  } catch (_) { status = 'fetch-error'; }

  const isImg = u => isHttps(u);
  const DEFIMG = url.origin + '/og-default.png';

  if (debug) {
    const info = {
      edge_function: 'running', slug, status, supabase_http: httpStatus, rows,
      og_image: site && site.og_image || null,
      cover: site && site.cover || null,
      profile_img_is_https: !!(site && site.profile && isImg(site.profile.img)),
      title: site && site.title || null, description: site && site.description || null,
    };
    if (info.cover && info.cover.img && String(info.cover.img).startsWith('data:')) info.cover = { ...info.cover, img: '(data: URL — tidak bisa dipakai crawler)' };
    return new Response(JSON.stringify(info, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (!site) return tag(res, status);

  const title = plain(site.title, 70) || "nocturnote's";
  // Deskripsi tidak boleh kosong: crawler akan mengambil teks kode <script> sebagai gantinya.
  const desc = plain(site.description, 200) || DEFDESC;
  const cover = site.cover && site.cover.mode === 'image' && isImg(site.cover.img) ? site.cover.img : '';
  const pfp = site.profile && isImg(site.profile.img) ? site.profile.img : '';
  const img = ([site.og_image, cover, pfp].find(isImg) || DEFIMG).trim();
  // Ukuran 1200x630 hanya pasti untuk gambar gabungan (og_image) dan gambar default.
  const knownSize = img === DEFIMG || img === String(site.og_image || '').trim();
  let html = await res.text();

  // PENTING: pakai fungsi sebagai pengganti. String pengganti biasa menafsirkan pola `$'`, `$&`
  // dan `$\`` — jika bio memuat "$'", sisa HTML (termasuk kode <script>) ikut tersisip ke meta.
  const setMeta = (attr, name, val) => {
    html = html.replace(new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`), (_, a, b) => a + esc(val) + b);
  };
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`);
  setMeta('name', 'description', desc);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:image', img);
  setMeta('property', 'og:url', request.url);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', desc);
  setMeta('name', 'twitter:image', img);
  if (!knownSize) html = html.replace(/<meta property="og:image:(width|height)" content="\d+">\n?/g, '');

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=60');
  headers.set('x-og-status', 'injected');
  return new Response(html, { status: 200, headers });
};
