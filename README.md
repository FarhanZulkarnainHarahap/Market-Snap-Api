<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:14532d,100:22c55e&height=180&section=header&text=Market%20Snap%20API&fontColor=ffffff&fontSize=42&animation=fadeIn&fontAlignY=36" alt="Market Snap API banner" />

  <p>
    <img src="https://img.shields.io/badge/Express-5.1-111827?style=for-the-badge&logo=express" alt="Express" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Prisma-6-2d3748?style=for-the-badge&logo=prisma" alt="Prisma" />
    <img src="https://img.shields.io/badge/PostgreSQL-ready-4169e1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  </p>
</div>

## About

Market Snap API adalah backend TypeScript untuk grocery web app. API ini menangani katalog produk, pemilihan toko terdekat, stok per cabang, alamat customer, order, voucher, admin dashboard, upload file, dan role-based access.

Frontend terpisah ada di repo `market-snap-web` dan membaca API melalui `NEXT_PUBLIC_API_URL`.

## Main Features

- Location-based nearest store selection dari latitude dan longitude.
- Product catalog dengan stok yang mengikuti cabang terdekat.
- CRUD product, address, order, user, store, dan discount.
- Role middleware untuk `user`, `store_admin`, dan `super_admin`.
- Zod validation untuk request body.
- Multer upload untuk avatar, foto produk, dan bukti pembayaran.
- Prisma config untuk PostgreSQL.
- Config integrasi Cloudinary, RajaOngkir, Resend, dan Xendit.
- Checkout order terhubung ke RajaOngkir untuk ongkir dan Xendit untuk invoice pembayaran.
- Vercel serverless entrypoint untuk deploy API sebagai repo terpisah.

## Tech Stack

| Area | Stack |
| --- | --- |
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Validation | Zod |
| Upload | Multer |
| Integrations | Cloudinary, RajaOngkir, Resend, Xendit |

## Folder Structure

```txt
api
├── api
│   └── index.ts              # Vercel serverless entry
├── prisma
│   └── schema.prisma
├── src
│   ├── app.ts                # Local server entry
│   ├── server.ts             # Express app export
│   ├── config                # Prisma, Cloudinary, RajaOngkir, Resend, Xendit
│   ├── controllers           # Request handlers
│   ├── middleware            # Auth role, multer, zod, error handler
│   ├── routers               # REST route modules
│   ├── types
│   └── utils
├── .env.example
├── package.json
└── vercel.json
```

## Getting Started

```bash
npm install
npm run prisma:generate
npm run dev
```

Default API URL:

```txt
http://127.0.0.1:4100/api
```

## Environment

Buat file `.env` dari `.env.example`.

```env
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
DIRECT_URL="postgres://USER:PASSWORD@HOST:5432/postgres?sslmode=require"
PORT=4100
HOST=127.0.0.1
WEB_ORIGIN=http://localhost:3200
JWT_SECRET=""
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
RAJAONGKIR_BASE_URL=https://rajaongkir.komerce.id/api/v1
RAJAONGKIR_API_KEY=""
RAJAONGKIR_ORIGIN_ID=""
RAJAONGKIR_DEFAULT_COURIER=jne:jnt:sicepat
RAJAONGKIR_DEFAULT_WEIGHT_GRAM=1000
RESEND_API_KEY=""
XENDIT_SECRET_KEY=""
XENDIT_CALLBACK_TOKEN=""
XENDIT_BASE_URL=https://api.xendit.co
```

Jangan commit `.env` ke GitHub.

## Scripts

```bash
npm run dev              # start development server
npm start                # start API without watch
npm run build            # TypeScript build
npm run vercel-build     # Prisma generate + TypeScript build
npm run prisma:generate  # generate Prisma client
npm run prisma:migrate   # run Prisma migration
```

## Authorization

Endpoint protected memakai JWT dari response login.

```bash
curl -X POST https://your-market-snap-api.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@email.com","password":"password"}'
```

Gunakan token dari response pada request berikutnya:

```txt
Authorization: Bearer YOUR_JWT_TOKEN
```

Role API yang didukung: `user`, `admin`, `super_admin`, dan `store_admin`.

## Checkout, Ongkir, and Payment

`POST /api/orders` dipakai customer untuk membuat order. Endpoint ini sudah:

- Memilih store terdekat dari `location`.
- Menghitung ongkir RajaOngkir jika `destinationId` dikirim.
- Membuat invoice Xendit jika `paymentMethod` bernilai `xendit`, atau otomatis memakai Xendit saat `XENDIT_SECRET_KEY` tersedia.
- Menyimpan `shippingCost`, `total`, `paymentDeadline`, dan order items.

Contoh request:

```bash
curl -X POST https://your-market-snap-api.vercel.app/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "total": 150000,
    "destinationId": "41068",
    "courier": "jne",
    "weightGram": 1000,
    "paymentMethod": "xendit",
    "location": { "lat": -6.2608, "lng": 106.8107 },
    "items": [
      { "productId": "PRODUCT_ID", "quantity": 2, "price": 50000 }
    ]
  }'
```

Response akan membawa data order, detail shipping, dan `payment.invoiceUrl` jika invoice Xendit berhasil dibuat.

## Main Endpoints

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | API health check |
| GET | `/api/health/db` | Public | Prisma database check |
| GET | `/api/stores/nearest` | Public | Nearest store by coordinate |
| GET | `/api/categories` | Public | Product categories |
| GET | `/api/products` | Public | Product list by selected store |
| GET | `/api/products/:id` | Public | Product detail |
| GET | `/api/users/me` | Auth | Current user profile |
| PATCH | `/api/users/me` | Auth | Update profile |
| GET | `/api/addresses` | Auth | User addresses |
| POST | `/api/addresses` | Auth | Create address |
| PATCH | `/api/addresses/:id` | Auth | Update address |
| DELETE | `/api/addresses/:id` | Auth | Delete address |
| GET | `/api/orders` | Auth | Order list |
| POST | `/api/orders` | Customer | Create order, calculate shipping, create Xendit invoice |
| PATCH | `/api/orders/:id` | Auth | Update order |
| DELETE | `/api/orders/:id` | Auth | Delete order |
| POST | `/api/orders/:id/payment-proof` | Customer | Upload payment proof |
| PATCH | `/api/orders/:id/status` | Admin | Update order status |
| GET | `/api/admin/stores` | Super admin | Store list |
| POST | `/api/admin/stores` | Super admin | Create store |
| GET | `/api/admin/users` | Super admin | User list |
| POST | `/api/admin/users` | Super admin | Create store admin |
| PATCH | `/api/admin/users/:id` | Super admin | Update user |
| DELETE | `/api/admin/users/:id` | Super admin | Delete user |
| POST | `/api/admin/products` | Super admin | Create product |
| PATCH | `/api/admin/products/:id` | Super admin | Update product |
| DELETE | `/api/admin/products/:id` | Super admin | Delete product |
| GET | `/api/admin/discounts` | Admin | Discount list |
| POST | `/api/admin/discounts` | Admin | Create discount |
| GET | `/api/admin/reports/sales` | Admin | Sales report |

## Deploy to Vercel

Folder `api` bisa dijadikan repository GitHub terpisah.

1. Push isi folder `api` ke repo, misalnya `market-snap-api`.
2. Import repo API di Vercel.
3. Framework preset: `Other`.
4. Install command: `npm install`.
5. Build command: `npm run vercel-build`.
6. Output directory: kosongkan.
7. Tambahkan semua environment variable dari `.env.example`.
8. Isi `WEB_ORIGIN` dengan domain web Vercel supaya CORS mengizinkan frontend.
9. Setelah deploy, gunakan domain API di web:

```env
NEXT_PUBLIC_API_URL=https://your-market-snap-api.vercel.app/api
```

## Grocery Flow

```txt
Customer location
      ↓
Nearest store selection
      ↓
Branch inventory check
      ↓
Cart and checkout
      ↓
RajaOngkir shipping quote
      ↓
Manual payment proof / Xendit invoice
      ↓
Store admin order processing
      ↓
Customer confirms order
```

<div align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:22c55e,100:14532d&height=110&section=footer" alt="footer wave" />
</div>
