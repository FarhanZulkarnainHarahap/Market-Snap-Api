# Changelog

## 2026-09-01

- Menambahkan baseline migration yang dapat membangun database kosong.
- Memindahkan checkout hosted Xendit ke Payment Session API sebagai default, dengan mode legacy eksplisit untuk transisi.
- Menambahkan verifikasi OAuth state, payment reconciliation idempotent, reservasi stok, invoice snapshot, contact storage, hardening upload, CORS, rate limit, dan security headers.
- Menambahkan perlindungan penggunaan voucher satu kali per akun dan migration contact message.
