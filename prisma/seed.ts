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

const productCatalog = [
  { name: "Apel Fuji Premium", category: "Buah", unit: "1 kg", minPrice: 36000, maxPrice: 46000, image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=700&q=80" },
  { name: "Pisang Cavendish", category: "Buah", unit: "1 sisir", minPrice: 22000, maxPrice: 34000, image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=700&q=80" },
  { name: "Jeruk Manis Lokal", category: "Buah", unit: "1 kg", minPrice: 18000, maxPrice: 32000, image: "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=700&q=80" },
  { name: "Anggur Red Globe", category: "Buah", unit: "500 g", minPrice: 28000, maxPrice: 45000, image: "https://images.unsplash.com/photo-1537640538966-79f369143f8f?auto=format&fit=crop&w=700&q=80" },
  { name: "Alpukat Mentega", category: "Buah", unit: "1 buah", minPrice: 9000, maxPrice: 18000, image: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=700&q=80" },
  { name: "Strawberry Fresh Pack", category: "Buah", unit: "250 g", minPrice: 26000, maxPrice: 42000, image: "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=700&q=80" },
  { name: "Lemon California", category: "Buah", unit: "500 g", minPrice: 19000, maxPrice: 35000, image: "https://images.unsplash.com/photo-1590502593747-42a996133562?auto=format&fit=crop&w=700&q=80" },
  { name: "Nanas Madu", category: "Buah", unit: "1 buah", minPrice: 17000, maxPrice: 29000, image: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?auto=format&fit=crop&w=700&q=80" },
  { name: "Bayam Hijau Segar", category: "Sayur", unit: "250 g", minPrice: 6000, maxPrice: 12000, image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=700&q=80" },
  { name: "Wortel Berastagi", category: "Sayur", unit: "500 g", minPrice: 8000, maxPrice: 16000, image: "https://images.unsplash.com/photo-1445282768818-728615cc910a?auto=format&fit=crop&w=700&q=80" },
  { name: "Brokoli Hijau", category: "Sayur", unit: "500 g", minPrice: 15000, maxPrice: 28000, image: "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=700&q=80" },
  { name: "Tomat Merah", category: "Sayur", unit: "500 g", minPrice: 9000, maxPrice: 18000, image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=700&q=80" },
  { name: "Kentang Dieng", category: "Sayur", unit: "1 kg", minPrice: 16000, maxPrice: 28000, image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=700&q=80" },
  { name: "Selada Romaine", category: "Sayur", unit: "250 g", minPrice: 10000, maxPrice: 22000, image: "https://images.unsplash.com/photo-1622205313162-be1d5712a43f?auto=format&fit=crop&w=700&q=80" },
  { name: "Timun Jepang", category: "Sayur", unit: "500 g", minPrice: 9000, maxPrice: 18000, image: "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?auto=format&fit=crop&w=700&q=80" },
  { name: "Paprika Mix", category: "Sayur", unit: "3 pcs", minPrice: 21000, maxPrice: 38000, image: "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=700&q=80" },
  { name: "Telur Ayam Negeri", category: "Dairy & Telur", unit: "10 pcs", minPrice: 23000, maxPrice: 33000, image: "https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=700&q=80" },
  { name: "Telur Omega", category: "Dairy & Telur", unit: "10 pcs", minPrice: 32000, maxPrice: 47000, image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=700&q=80" },
  { name: "Susu UHT Full Cream", category: "Dairy & Telur", unit: "1 L", minPrice: 17000, maxPrice: 26000, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=700&q=80" },
  { name: "Greek Yogurt Plain", category: "Dairy & Telur", unit: "500 g", minPrice: 30000, maxPrice: 52000, image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=700&q=80" },
  { name: "Keju Cheddar Slice", category: "Dairy & Telur", unit: "170 g", minPrice: 25000, maxPrice: 42000, image: "https://images.unsplash.com/photo-1452195100486-9cc805987862?auto=format&fit=crop&w=700&q=80" },
  { name: "Mentega Tawar", category: "Dairy & Telur", unit: "200 g", minPrice: 24000, maxPrice: 39000, image: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=700&q=80" },
  { name: "Roti Tawar Gandum", category: "Roti & Bakery", unit: "1 pack", minPrice: 14000, maxPrice: 24000, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80" },
  { name: "Croissant Butter", category: "Roti & Bakery", unit: "2 pcs", minPrice: 22000, maxPrice: 38000, image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=80" },
  { name: "Donat Gula Halus", category: "Roti & Bakery", unit: "4 pcs", minPrice: 18000, maxPrice: 32000, image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=700&q=80" },
  { name: "Bagel Wijen", category: "Roti & Bakery", unit: "3 pcs", minPrice: 22000, maxPrice: 36000, image: "https://images.unsplash.com/photo-1585478259715-876acc5be8eb?auto=format&fit=crop&w=700&q=80" },
  { name: "Air Mineral Botol", category: "Minuman", unit: "600 ml", minPrice: 3000, maxPrice: 7000, image: "https://images.unsplash.com/photo-1564419320461-6870880221ad?auto=format&fit=crop&w=700&q=80" },
  { name: "Jus Jeruk Fresh", category: "Minuman", unit: "1 L", minPrice: 22000, maxPrice: 38000, image: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=700&q=80" },
  { name: "Teh Hijau Botol", category: "Minuman", unit: "500 ml", minPrice: 7000, maxPrice: 14000, image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=700&q=80" },
  { name: "Kopi Susu Dingin", category: "Minuman", unit: "250 ml", minPrice: 12000, maxPrice: 24000, image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=80" },
  { name: "Beras Pulen Premium", category: "Sembako", unit: "5 kg", minPrice: 62000, maxPrice: 88000, image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=700&q=80" },
  { name: "Minyak Goreng Sunflower", category: "Sembako", unit: "2 L", minPrice: 33000, maxPrice: 52000, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=700&q=80" },
  { name: "Gula Pasir Kristal", category: "Sembako", unit: "1 kg", minPrice: 15000, maxPrice: 23000, image: "https://images.unsplash.com/photo-1581268497089-7a975fb491a3?auto=format&fit=crop&w=700&q=80" },
  { name: "Tepung Terigu Serbaguna", category: "Sembako", unit: "1 kg", minPrice: 11000, maxPrice: 19000, image: "https://images.unsplash.com/photo-1627485937980-221c88ac04f9?auto=format&fit=crop&w=700&q=80" },
  { name: "Tisu Dapur Roll", category: "Kebersihan", unit: "2 roll", minPrice: 14000, maxPrice: 26000, image: "https://images.unsplash.com/photo-1583947581924-860bda6a26df?auto=format&fit=crop&w=700&q=80" },
  { name: "Sabun Cuci Piring Lemon", category: "Kebersihan", unit: "750 ml", minPrice: 13000, maxPrice: 24000, image: "https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=700&q=80" },
  { name: "Deterjen Cair", category: "Kebersihan", unit: "1 L", minPrice: 24000, maxPrice: 42000, image: "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=700&q=80" },
  { name: "Pembersih Lantai", category: "Kebersihan", unit: "800 ml", minPrice: 16000, maxPrice: 29000, image: "https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=700&q=80" }
] as const;

async function main() {
  await seedStores();
  await clearSeedOrderItems();
  const categoryByName = await seedCategories();
  const products = await seedProducts(categoryByName);
  await seedUsers();
  await seedPromos(products);
  await seedOrders(products).catch((error) => {
    if (!isMissingColumnError(error)) throw error;
    console.warn("Seed order histori dilewati karena schema checkout production belum dimigrasi.");
  });
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
  const records = productCatalog.map((product) => ({ ...product, price: faker.number.int({ min: product.minPrice, max: product.maxPrice }) }));

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
    await prisma.productImage.createMany({
      data: galleryForSeedProduct(record).map((url) => ({ productId: product.id, url })),
      skipDuplicates: true
    });
    await seedStocks(product.id);
    created.push(product);
  }
  await retireOldSeedProducts(new Set(records.map((record) => record.name)));
  await normalizeSeedProductImages();
  return created;
}

async function clearSeedOrderItems() {
  const seedOrders = await prisma.order.findMany({ where: { orderNumber: { startsWith: "MS-250526" } }, select: { id: true } });
  if (seedOrders.length) await prisma.orderItem.deleteMany({ where: { orderId: { in: seedOrders.map((order) => order.id) } } });
}

async function retireOldSeedProducts(activeNames: Set<string>) {
  const staleProducts = await prisma.product.findMany({
    where: {
      carts: { none: {} },
      description: { contains: "Market Snap" },
      name: { notIn: Array.from(activeNames) },
      orderItems: { none: {} }
    },
    select: { id: true }
  });
  for (const product of staleProducts) {
    await prisma.discount.deleteMany({ where: { productId: product.id } });
    await prisma.inventory.deleteMany({ where: { productId: product.id } });
    await prisma.stockJournal.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  }
}

async function normalizeSeedProductImages() {
  const products = await prisma.product.findMany({
    where: { description: { contains: "Market Snap" } },
    include: { category: true, images: true }
  });
  for (const product of products) {
    const image = imageForProductName(product.name, product.category.name);
    if (!image || (product.images[0]?.url === image && product.images.length >= 3)) continue;
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.createMany({
      data: galleryForExistingProduct(product.name, product.category.name, image).map((url) => ({ productId: product.id, url })),
      skipDuplicates: true
    });
  }
}

function galleryForSeedProduct(record: (typeof productCatalog)[number]) {
  return galleryForExistingProduct(record.name, record.category, record.image);
}

function galleryForExistingProduct(name: string, category: string, primaryImage: string) {
  const related = productCatalog
    .filter((product) => product.category === category && product.name !== name)
    .map((product) => product.image);
  return Array.from(new Set([primaryImage, ...related])).slice(0, 4);
}

function imageForProductName(name: string, category: string) {
  const lower = name.toLowerCase();
  const match = productVisualKeywords.find((visual) => lower.includes(visual.keyword));
  if (match) return match.image;
  return productCatalog.find((product) => product.category === category)?.image ?? "/product.png";
}

const productVisualKeywords = [
  visual("apel", "Apel Fuji Premium"),
  visual("pisang", "Pisang Cavendish"),
  visual("jeruk", "Jeruk Manis Lokal"),
  visual("anggur", "Anggur Red Globe"),
  visual("alpukat", "Alpukat Mentega"),
  visual("strawberry", "Strawberry Fresh Pack"),
  visual("lemon", "Lemon California"),
  visual("nanas", "Nanas Madu"),
  visual("pir", "Apel Fuji Premium"),
  visual("melon", "Nanas Madu"),
  visual("blueberry", "Strawberry Fresh Pack"),
  visual("bayam", "Bayam Hijau Segar"),
  visual("wortel", "Wortel Berastagi"),
  visual("brokoli", "Brokoli Hijau"),
  visual("tomat", "Tomat Merah"),
  visual("kentang", "Kentang Dieng"),
  visual("selada", "Selada Romaine"),
  visual("timun", "Timun Jepang"),
  visual("mentimun", "Timun Jepang"),
  visual("paprika", "Paprika Mix"),
  visual("kangkung", "Bayam Hijau Segar"),
  visual("pakcoy", "Selada Romaine"),
  visual("telur", "Telur Ayam Negeri"),
  visual("susu", "Susu UHT Full Cream"),
  visual("yogurt", "Greek Yogurt Plain"),
  visual("keju", "Keju Cheddar Slice"),
  visual("mentega", "Mentega Tawar"),
  visual("roti", "Roti Tawar Gandum"),
  visual("croissant", "Croissant Butter"),
  visual("donat", "Donat Gula Halus"),
  visual("bagel", "Bagel Wijen"),
  visual("air mineral", "Air Mineral Botol"),
  visual("jus", "Jus Jeruk Fresh"),
  visual("teh", "Teh Hijau Botol"),
  visual("kopi", "Kopi Susu Dingin"),
  visual("smoothie", "Jus Jeruk Fresh"),
  visual("beras", "Beras Pulen Premium"),
  visual("minyak", "Minyak Goreng Sunflower"),
  visual("gula", "Gula Pasir Kristal"),
  visual("tepung", "Tepung Terigu Serbaguna"),
  visual("tisu", "Tisu Dapur Roll"),
  visual("sabun", "Sabun Cuci Piring Lemon"),
  visual("deterjen", "Deterjen Cair"),
  visual("pembersih", "Pembersih Lantai")
];

function visual(keyword: string, productName: (typeof productCatalog)[number]["name"]) {
  const product = productCatalog.find((item) => item.name === productName);
  if (!product) throw new Error(`Visual produk tidak ditemukan: ${productName}`);
  return { keyword, image: product.image };
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
    update: { authProvider: "credentials", passwordHash, role: "CUSTOMER", verifiedAt: new Date(), isActive: true },
    create: { name: "Andi Pratama", email: "customer@marketsnap.id", authProvider: "credentials", passwordHash, role: "CUSTOMER", verifiedAt: new Date(), isActive: true, referralCode: "ANDISNAP" }
  });
  await upsertSeedAddress(customer.id);
}

async function upsertSeedAddress(userId: string) {
  const address = { id: "seed-address-kemang", userId, label: "Rumah", detail: "Jl. Kemang Raya No. 72, Bangka, Mampang Prapatan, Jakarta Selatan", latitude: -6.2608, longitude: 106.8107, isPrimary: true };
  try {
    await prisma.address.upsert({
      where: { id: address.id },
      update: address,
      create: address
    });
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    await prisma.$executeRaw`
      INSERT INTO "Address" ("id", "userId", "label", "detail", "latitude", "longitude", "isPrimary", "createdAt", "updatedAt")
      VALUES (${address.id}, ${address.userId}, ${address.label}, ${address.detail}, ${address.latitude}, ${address.longitude}, ${address.isPrimary}, NOW(), NOW())
      ON CONFLICT ("id") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "label" = EXCLUDED."label",
        "detail" = EXCLUDED."detail",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "isPrimary" = EXCLUDED."isPrimary",
        "updatedAt" = NOW()
    `;
  }
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

function descriptionFor(name: string, category: string) {
  const freshness = faker.helpers.arrayElement(["segar", "berkualitas", "terkurasi", "siap pakai"]);
  return `${name} ${freshness} dari kategori ${category} untuk kebutuhan harian Market Snap. Stok mengikuti cabang terdekat dan diperbarui melalui inventory toko.`;
}

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("does not exist in the current database") || message.includes("column") || message.includes("P2022");
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
