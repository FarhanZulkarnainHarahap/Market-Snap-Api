# Authentication dan OAuth

Session browser menggunakan satu cookie JWT `market_snap_session` yang stateless dan berlaku 24 jam. Cookie bersifat HttpOnly, memakai SameSite=Lax, dan memakai Secure pada production. Logout menghapus cookie browser; perubahan password tidak dapat mencabut salinan token lama sebelum masa berlakunya habis.

Daftarkan callback provider secara persis:

- Google: `<API_PUBLIC_URL>/api/auth/google/callback`
- Facebook: `<API_PUBLIC_URL>/api/auth/facebook/callback`

Isi client ID/secret hanya pada environment backend. `WEB_ORIGIN` merupakan allowlist comma-separated tanpa path. OAuth state disimpan dalam cookie HttpOnly 10 menit; callback selalu diarahkan ke `<WEB_ORIGIN>/auth/callback` dengan hasil yang dapat dilihat pengguna.

Untuk test tanpa credential, mock strategy/provider response; jangan merekam access token provider. Setelah deploy, uji success, cancel, email provider tidak tersedia, state salah/kedaluwarsa, akun nonaktif, dan role redirect.
