import { faker } from "@faker-js/faker";
import { DiscountType, VoucherScope } from "./generated/prisma/client.js";
import { hashPassword } from "../src/config/auth.js";
import { prisma } from "../src/config/prisma.js";

faker.seed(20260609);

const stores = [
  { id: "kemang", name: "Market Snap Kemang", city: "Jakarta Selatan", latitude: -6.2607, longitude: 106.8106, radiusKm: 12, isMain: true },
  { id: "bangka", name: "Market Snap Bangka", city: "Jakarta Selatan", latitude: -6.2552, longitude: 106.8217, radiusKm: 10, isMain: false },
  { id: "prapatan", name: "Market Snap Prapatan", city: "Jakarta Selatan", latitude: -6.2482, longitude: 106.832, radiusKm: 9, isMain: false },
  { id: "rawamangun", name: "Market Snap Rawamangun", city: "Jakarta Timur", latitude: -6.1931, longitude: 106.8876, radiusKm: 11, isMain: false }
];

const categories = ["Buah", "Sayur", "Dairy & Telur", "Roti & Bakery", "Minuman", "Sembako", "Kebersihan"];

const imagePools: Record<string, string[]> = {
  Buah: [
    "https://images.unsplash.com/photo-1570913149827-d2ac84ab3f9a?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1587213811864-46e59f6873b1?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1596363505729-4190a9506133?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1601039641847-7857b994d704?auto=format&fit=crop&w=700&q=80"
  ],
  Sayur: [
    "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1445282768818-728615cc910a?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1584559582128-b8be739912e1?auto=format&fit=crop&w=700&q=80"
  ],
  "Dairy & Telur": [
    "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=700&q=80"
  ],
  "Roti & Bakery": ["/bread.png"],
  Minuman: ["/juice.png"],
  Sembako: [
    "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=700&q=80",
    "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=80"
  ],
  Kebersihan: ["/product.png"]
};

const baseProducts = [
  ["Apel Fuji Premium", "Buah", 38900, "1 kg"],
  ["Jeruk Manis Lokal", "Buah", 19900, "1 kg"],
  ["Anggur Red Globe", "Buah", 32500, "500 g"],
  ["Alpukat Mentega", "Buah", 6900, "1 buah"],
  ["Bayam Segar", "Sayur", 6900, "250 g"],
  ["Wortel Berastagi", "Sayur", 7900, "500 g"],
  ["Brokoli Segar", "Sayur", 9900, "250 g"],
  ["Telur Ayam Negeri", "Dairy & Telur", 25900, "10 pcs"],
  ["Susu UHT Full Cream", "Dairy & Telur", 18900, "1 L"],
  ["Roti Tawar Premium", "Roti & Bakery", 15900, "1 pack"],
  ["Minyak Goreng SunCo", "Sembako", 34900, "2 L"],
  ["Beras Premium", "Sembako", 64900, "5 kg"]
] as const;

async function main() {
  await seedStores();
  const categoryByName = await seedCategories();
  const products = await seedProducts(categoryByName);
  await seedUsers();
  await seedPromos(products);
  await seedOrders(products);
}

async function seedStores() {
  for (const store of stores) {
    await prisma.store.upsert({ where: { id: store.id }, update: store, create: store });
  }
}

async function seedCategories() {
  const result = new Map<string, string>();
  for (const name of categories) {
    const category = await prisma.productCategory.upsert({ where: { name }, update: {}, create: { name } });
    result.set(name, category.id);
  }
  return result;
}

async function seedProducts(categoryByName: Map<string, string>) {
  const records = [
    ...baseProducts.map(([name, category, price, unit], index) => ({ name, category, price, unit, image: imageFor(category, index) })),
    ...Array.from({ length: 28 }, (_, index) => {
      const category = faker.helpers.arrayElement(categories);
      return {
        name: `${faker.commerce.productAdjective()} ${groceryName(category)} ${index + 1}`,
        category,
        price: faker.number.int({ min: 6500, max: 119000 }),
        unit: faker.helpers.arrayElement(["250 g", "500 g", "1 kg", "1 L", "1 pack", "10 pcs"]),
        image: imageFor(category, index)
      };
    })
  ];

  const created = [];
  for (const record of records) {
    const categoryId = categoryByName.get(record.category);
    if (!categoryId) continue;
    const product = await prisma.product.upsert({
      where: { name: record.name },
      update: { description: descriptionFor(record.name, record.category), price: record.price, unit: record.unit, categoryId },
      create: { name: record.name, description: descriptionFor(record.name, record.category), price: record.price, unit: record.unit, categoryId }
    });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: record.image } });
    await seedStocks(product.id);
    created.push(product);
  }
  return created;
}

async function seedStocks(productId: string) {
  for (const store of stores) {
    const quantity = faker.number.int({ min: store.id === "kemang" ? 14 : 0, max: store.id === "kemang" ? 64 : 48 });
    await prisma.inventory.upsert({
      where: { storeId_productId: { storeId: store.id, productId } },
      update: { quantity },
      create: { storeId: store.id, productId, quantity }
    });
    await prisma.stockJournal.create({ data: { storeId: store.id, productId, change: quantity, note: "Seed stok awal produk dummy" } });
  }
}

async function seedUsers() {
  const passwordHash = hashPassword("password123");
  await prisma.user.upsert({
    where: { email: "superadmin@marketsnap.id" },
    update: { authProvider: "credentials", passwordHash, role: "SUPER_ADMIN", verifiedAt: new Date(), isActive: true },
    create: { name: "Super Admin", email: "superadmin@marketsnap.id", authProvider: "credentials", passwordHash, role: "SUPER_ADMIN", verifiedAt: new Date(), isActive: true, referralCode: "SUPERGREEN" }
  });
  await prisma.user.upsert({
    where: { email: "admin.kemang@marketsnap.id" },
    update: { authProvider: "credentials", passwordHash, role: "STORE_ADMIN", storeId: "kemang", verifiedAt: new Date(), isActive: true },
    create: { name: "Admin Kemang", email: "admin.kemang@marketsnap.id", authProvider: "credentials", passwordHash, role: "STORE_ADMIN", storeId: "kemang", verifiedAt: new Date(), isActive: true, referralCode: "KEMANGADMIN" }
  });
  const customer = await prisma.user.upsert({
    where: { email: "customer@marketsnap.id" },
    update: { authProvider: "credentials", passwordHash, role: "USER", verifiedAt: new Date(), isActive: true },
    create: { name: "Andi Pratama", email: "customer@marketsnap.id", authProvider: "credentials", passwordHash, role: "USER", verifiedAt: new Date(), isActive: true, referralCode: "ANDISNAP" }
  });
  await prisma.address.upsert({
    where: { id: "seed-address-kemang" },
    update: { userId: customer.id, label: "Rumah", detail: "Jl. Kemang Raya No. 72, Bangka, Mampang Prapatan, Jakarta Selatan", latitude: -6.2608, longitude: 106.8107, isPrimary: true },
    create: { id: "seed-address-kemang", userId: customer.id, label: "Rumah", detail: "Jl. Kemang Raya No. 72, Bangka, Mampang Prapatan, Jakarta Selatan", latitude: -6.2608, longitude: 106.8107, isPrimary: true }
  });
}

async function seedPromos(products: { id: string; name: string }[]) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60);
  const featured = products.slice(0, 6);
  await prisma.discount.deleteMany({ where: { title: { startsWith: "Seed Promo" } } });
  for (const product of featured) {
    await prisma.discount.create({
      data: { storeId: "kemang", productId: product.id, title: `Seed Promo ${product.name}`, type: DiscountType.PERCENTAGE, value: faker.helpers.arrayElement([5, 10, 15, 20]), startsAt: now, expiresAt }
    });
  }

  const vouchers = [
    { code: "SNAPWELCOME", title: "Diskon pengguna baru", scope: VoucherScope.CART, type: DiscountType.PERCENTAGE, value: 20, minSpend: 50000, maxDiscount: 20000, expiresAt },
    { code: "SNAPSHIP", title: "Gratis ongkir pelanggan aktif", scope: VoucherScope.SHIPPING, type: DiscountType.NOMINAL, value: 10000, minSpend: 75000, maxDiscount: 10000, expiresAt },
    { code: "BOGOGREEN", title: "Beli satu gratis satu sayur", scope: VoucherScope.PRODUCT, type: DiscountType.BOGO, value: 1, minSpend: 0, maxDiscount: 0, productId: featured[0]?.id, expiresAt }
  ];

  for (const voucher of vouchers) {
    await prisma.voucher.upsert({ where: { code: voucher.code }, update: voucher, create: voucher });
  }
}

async function seedOrders(products: { id: string; price: number }[]) {
  const user = await prisma.user.findUnique({ where: { email: "customer@marketsnap.id" } });
  if (!user || products.length < 3) return;
  for (const index of [1, 2, 3, 4, 5]) {
    const picked = faker.helpers.arrayElements(products, 3);
    const subtotal = picked.reduce((sum, product) => sum + product.price, 0);
    const order = await prisma.order.upsert({
      where: { orderNumber: `MS-250526-00${index}` },
      update: { total: subtotal + 10000, shippingCost: 10000 },
      create: { orderNumber: `MS-250526-00${index}`, userId: user.id, storeId: faker.helpers.arrayElement(stores).id, status: faker.helpers.arrayElement(["WAITING_PAYMENT", "PROCESSING", "SHIPPED", "CONFIRMED"]), total: subtotal + 10000, shippingCost: 10000, paymentDeadline: new Date(Date.now() + 1000 * 60 * 60) }
    });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await Promise.all(picked.map((product) => prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 1, price: product.price } })));
  }
}

function groceryName(category: string) {
  const names: Record<string, string[]> = {
    Buah: ["Apel", "Jeruk", "Pir", "Melon", "Strawberry", "Blueberry"],
    Sayur: ["Kangkung", "Selada", "Pakcoy", "Tomat", "Mentimun", "Kentang"],
    "Dairy & Telur": ["Susu", "Yogurt", "Keju", "Telur Omega"],
    "Roti & Bakery": ["Roti Gandum", "Croissant", "Bagel", "Roti Sobek"],
    Minuman: ["Jus", "Teh Botol", "Air Mineral", "Smoothie"],
    Sembako: ["Beras", "Minyak", "Gula", "Tepung"],
    Kebersihan: ["Sabun", "Tisu", "Deterjen", "Pembersih"]
  };
  return faker.helpers.arrayElement(names[category] ?? [faker.commerce.product()]);
}

function imageFor(category: string, index: number) {
  const pool = imagePools[category] ?? ["/product.png"];
  return pool[index % pool.length];
}

function descriptionFor(name: string, category: string) {
  return `${name} dari kategori ${category} dipilih untuk kebutuhan harian Market Snap. Stok mengikuti cabang terdekat dan diperbarui melalui inventory toko.`;
}

main()
  .then(async () => {
    console.log("Seed Market Snap selesai. Login: superadmin@marketsnap.id / password123, customer@marketsnap.id / password123");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
