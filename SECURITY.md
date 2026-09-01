# Security Policy

Jangan kirim vulnerability, credential, data pelanggan, atau bukti pembayaran melalui issue publik. Laporkan secara privat ke alamat `SECURITY_CONTACT_EMAIL` milik operator deployment.

Versi production wajib memakai Node.js 20+, HTTPS, PostgreSQL terkelola, `JWT_SECRET` acak minimal 32 karakter, origin CORS eksplisit, key Xendit test/live yang sesuai environment, dan rotasi secret setelah pergantian operator. Secret hanya disimpan di secret manager platform, tidak di Git.

Respons insiden minimum: cabut session aktif, rotasi key terdampak, periksa `AuditLog` dan log bisnis yang sudah di-redact, rekonsiliasi payment langsung dengan Xendit, beri tahu pihak terdampak sesuai hukum, lalu dokumentasikan akar masalah.
