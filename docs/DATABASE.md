# Database, Migration, Seed, Backup

## Database baru

1. Buat PostgreSQL kosong dan isi `DATABASE_URL` serta `DIRECT_URL`.
2. Jalankan `npm ci`, `npm run prisma:generate`, lalu `npm run db:deploy`.
3. Jalankan `npm run db:seed` hanya pada development/demo. Seed tidak boleh dipakai untuk membuat credential production.
4. Verifikasi `npm run build` dan endpoint `/health/db`.

Migration `20260701000000_init` adalah baseline; migration berikutnya harus dijalankan berurutan. Jangan memakai `prisma db push` di production karena tidak memberi riwayat deployment yang dapat diaudit.

## Backup dan restore

Gunakan backup terenkripsi dari provider PostgreSQL atau `pg_dump --format=custom`. Simpan di bucket terpisah dengan retensi dan kontrol akses. Uji restore berkala ke database non-production: buat database kosong, restore, jalankan `npm run db:deploy`, kemudian smoke-test health, login, katalog, order, dan rekonsiliasi payment. Jangan menyalin data pelanggan production ke development tanpa anonimisasi.
