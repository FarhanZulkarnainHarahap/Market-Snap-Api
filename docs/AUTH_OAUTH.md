# Authentication dan OAuth

Session browser menggunakan cookie `market_snap_session` (15 menit) dan refresh credential `market_snap_refresh` (30 hari). Keduanya HttpOnly; production memakai Secure dan SameSite=None karena frontend/API berbeda origin. Refresh token disimpan sebagai SHA-256 digest dan dirotasi. Logout serta reset password mencabut refresh session terkait.

Daftarkan callback provider secara persis:

- Google: `<API_PUBLIC_URL>/api/auth/google/callback`
- Facebook: `<API_PUBLIC_URL>/api/auth/facebook/callback`

Isi client ID/secret hanya pada environment backend. `WEB_ORIGIN` merupakan allowlist comma-separated tanpa path. OAuth state disimpan dalam cookie HttpOnly 10 menit; callback selalu diarahkan ke `<WEB_ORIGIN>/auth/callback` dengan hasil yang dapat dilihat pengguna.

Untuk test tanpa credential, mock strategy/provider response; jangan merekam access token provider. Setelah deploy, uji success, cancel, email provider tidak tersedia, state salah/kedaluwarsa, akun nonaktif, dan role redirect.
