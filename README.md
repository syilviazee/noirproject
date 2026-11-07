# nocturnote's

Situs statis (index.html) + Netlify Edge Function (netlify/edge-functions/og.js)
untuk preview tautan Facebook/WhatsApp/X per-profil (?p=nama).

Struktur (harus persis begini, semua di root repo):

    index.html
    og-default.png
    netlify.toml
    netlify/edge-functions/og.js
    README.md

Cek edge function setelah deploy:
https://DOMAIN-ANDA.netlify.app/?p=NAMA-PROFIL&og_debug=1
(muncul JSON = edge function aktif)
