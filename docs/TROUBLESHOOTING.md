# Troubleshooting

- `JWT_SECRET production wajib...`: buat secret acak minimal 32 karakter dan simpan di secret manager.
- OAuth kembali error/state: pastikan callback provider persis, HTTPS, cookie tidak diblokir, dan API_PUBLIC_URL benar.
- Cookie tidak terkirim: pastikan frontend memakai `credentials: include`, CORS origin cocok, serta API/frontend HTTPS.
- Xendit tidak tersedia: lengkapi secret, callback token, return origin HTTPS, dan webhook sandbox.
- Payment return tidak paid: ini normal sampai webhook/rekonsiliasi backend mengonfirmasi pembayaran.
- Stok tidak konsisten: hentikan checkout produk terkait, periksa order/payment dan stock journal, lalu koreksi melalui migration/operasi admin yang diaudit—jangan mengedit total dari frontend.
- Prisma column missing: jalankan `npm run db:deploy`; jangan mengandalkan fallback legacy untuk production baru.
