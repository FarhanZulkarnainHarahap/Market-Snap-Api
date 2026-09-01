# Xendit Payment Session

Default `XENDIT_API_MODE=payment_session` memakai hosted checkout `POST /sessions` (`session_type=PAY`, `mode=PAYMENT_LINK`). Mode `legacy_invoice` hanya disediakan untuk transisi instalasi lama. Dokumentasi resmi Xendit per Agustus 2026 merekomendasikan migrasi dari `/v2/invoices` ke Payment Sessions.

## Sandbox

1. Gunakan `xnd_development_...`, bukan live key.
2. Isi `XENDIT_CALLBACK_TOKEN` dari dashboard webhook.
3. `XENDIT_RETURN_ORIGIN` harus URL HTTPS frontend (gunakan tunnel HTTPS untuk local sandbox).
4. Daftarkan webhook Payment Session ke `<API_PUBLIC_URL>/api/payment/xendit/callback`.
5. Jangan menjalankan simulasi live atau memakai kartu/dana riil.

Order tidak pernah menjadi paid dari return URL. Backend memverifikasi callback token, reference/order ID, session ID, amount, payment reference, dan urutan status; duplicate webhook aman karena order dikunci dalam transaction. Endpoint status juga melakukan rekonsiliasi langsung dengan Xendit. Invoice final hanya tersedia setelah status backend paid.

Sebelum live: ganti test key dengan live key melalui secret manager, konfigurasikan live webhook terpisah, lakukan transaksi nominal terkendali atas izin pemilik, cocokkan dashboard Xendit, payment/order/inventory, lalu uji expired, cancelled, duplicate, dan webhook out-of-order.
