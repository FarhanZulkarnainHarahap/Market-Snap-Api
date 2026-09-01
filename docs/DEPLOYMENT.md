# Deployment API

Target membutuhkan Node.js 20+, PostgreSQL, HTTPS, dan environment dari `.env.example`. Jalankan `npm ci`, `npm run prisma:generate`, `npm run test`, `npm run build`, lalu `npm run db:deploy` sebagai release step terkontrol sebelum mengalihkan traffic.

Set `NODE_ENV=production`, `API_PUBLIC_URL`, `WEB_ORIGIN`, `JWT_SECRET`, database URL, OAuth callback, email, upload, ongkir, dan Xendit melalui secret manager. Production akan berhenti saat JWT/origin/URL publik tidak aman. Setelah deploy verifikasi `/health`, `/health/db`, CORS origin resmi, cookie attributes, OAuth callback, contact submit, checkout sandbox, webhook, dan log redaction.

Rollback aplikasi ke artifact sebelumnya; jangan rollback migration destruktif. Untuk perubahan schema yang bermasalah gunakan migration perbaikan forward dan restore backup hanya bila disetujui pemilik data.
