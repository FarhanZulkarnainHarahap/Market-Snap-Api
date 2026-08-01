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

const categories = [
  "Sayur", "Buah", "Daging", "Ayam", "Seafood", "Susu dan Dairy", "Roti", "Telur", "Frozen Food", "Minuman",
  "Snack", "Bumbu Dapur", "Beras dan Bahan Pokok", "Makanan Instan", "Produk Organik", "Kebutuhan Bayi",
  "Personal Care", "Home Care", "Pet Supplies", "Promo Hari Ini"
];

type ProductSeed = {
  brand: string;
  category: string;
  image: string;
  maxPrice: number;
  minPrice: number;
  name: string;
  sku: string;
  storageInfo: string;
  unit: string;
  weightGram: number;
};

const productCatalog = [
  p("Apel Fuji Premium", "Buah", "1 kg", 36000, 46000, 1000, "Orchard Snap", "Simpan di kulkas agar tetap renyah."),
  p("Pisang Cavendish", "Buah", "1 sisir", 22000, 34000, 1200, "Tropic Fresh", "Simpan di suhu ruang dan jauhkan dari panas."),
  p("Jeruk Manis Lokal", "Buah", "1 kg", 18000, 32000, 1000, "Nusantara Fruit", "Simpan di tempat sejuk atau kulkas."),
  p("Anggur Red Globe", "Buah", "500 g", 28000, 45000, 500, "Orchard Snap", "Simpan tertutup di chiller."),
  p("Alpukat Mentega", "Buah", "1 buah", 9000, 18000, 280, "Tropic Fresh", "Matangkan di suhu ruang lalu simpan dingin."),
  p("Strawberry Fresh Pack", "Buah", "250 g", 26000, 42000, 250, "Berry Lane", "Simpan di chiller dan konsumsi 2 hari."),
  p("Lemon California", "Buah", "500 g", 19000, 35000, 500, "Citrus Co", "Simpan di kulkas untuk aroma maksimal."),
  p("Nanas Madu", "Buah", "1 buah", 17000, 29000, 900, "Tropic Fresh", "Simpan di suhu ruang sebelum dipotong."),
  p("Mangga Harum Manis", "Buah", "1 kg", 24000, 42000, 1000, "Nusantara Fruit", "Simpan matang di chiller."),
  p("Semangka Merah Potong", "Buah", "1 pack", 18000, 32000, 700, "Fresh Cut", "Wajib simpan dingin."),
  p("Bayam Hijau Segar", "Sayur", "250 g", 6000, 12000, 250, "Green Basket", "Simpan dengan tisu lembap di chiller."),
  p("Wortel Berastagi", "Sayur", "500 g", 8000, 16000, 500, "Green Basket", "Simpan di laci sayur kulkas."),
  p("Brokoli Hijau", "Sayur", "500 g", 15000, 28000, 500, "Green Basket", "Simpan dingin dan gunakan dalam 3 hari."),
  p("Tomat Merah", "Sayur", "500 g", 9000, 18000, 500, "Nusantara Farm", "Simpan suhu ruang sampai matang."),
  p("Kentang Dieng", "Sayur", "1 kg", 16000, 28000, 1000, "Nusantara Farm", "Simpan kering, gelap, dan berventilasi."),
  p("Selada Romaine", "Sayur", "250 g", 10000, 22000, 250, "Green Basket", "Simpan dingin dalam wadah tertutup."),
  p("Timun Jepang", "Sayur", "500 g", 9000, 18000, 500, "Green Basket", "Simpan di chiller."),
  p("Paprika Mix", "Sayur", "3 pcs", 21000, 38000, 450, "Color Farm", "Simpan di laci sayur kulkas."),
  p("Kangkung Hidroponik", "Sayur", "250 g", 7000, 13000, 250, "Urban Farm", "Simpan dingin dengan akar tetap lembap."),
  p("Pakcoy Organik", "Produk Organik", "300 g", 13000, 25000, 300, "Urban Farm", "Simpan dingin dalam pouch berlubang."),
  p("Daging Sapi Slice", "Daging", "250 g", 42000, 62000, 250, "Butcher Select", "Simpan beku bila tidak langsung dimasak."),
  p("Daging Sapi Giling", "Daging", "500 g", 52000, 78000, 500, "Butcher Select", "Simpan di freezer setelah diterima."),
  p("Rendang Beef Cubes", "Daging", "500 g", 56000, 84000, 500, "Butcher Select", "Simpan beku dan thawing di chiller."),
  p("Sosis Sapi Premium", "Daging", "500 g", 35000, 52000, 500, "Deli Snap", "Simpan dingin 0-4C."),
  p("Ayam Broiler Utuh", "Ayam", "1 ekor", 38000, 56000, 1200, "Poultry Fresh", "Simpan beku untuk stok lebih lama."),
  p("Dada Ayam Fillet", "Ayam", "500 g", 36000, 52000, 500, "Poultry Fresh", "Simpan dingin dan masak hari yang sama."),
  p("Paha Ayam Boneless", "Ayam", "500 g", 33000, 49000, 500, "Poultry Fresh", "Simpan beku bila belum dipakai."),
  p("Sayap Ayam Marinasi", "Ayam", "500 g", 31000, 45000, 500, "Poultry Fresh", "Simpan dingin dan masak maksimal besok."),
  p("Udang Vaname Kupas", "Seafood", "250 g", 39000, 62000, 250, "Ocean Snap", "Simpan beku setelah diterima."),
  p("Ikan Salmon Fillet", "Seafood", "200 g", 68000, 98000, 200, "Ocean Snap", "Simpan beku atau chiller 0-2C."),
  p("Cumi Ring Frozen", "Seafood", "500 g", 47000, 69000, 500, "Ocean Snap", "Simpan beku."),
  p("Ikan Dori Fillet", "Seafood", "500 g", 41000, 61000, 500, "Ocean Snap", "Simpan beku."),
  p("Susu UHT Full Cream", "Susu dan Dairy", "1 L", 17000, 26000, 1030, "Dairy Valley", "Simpan suhu ruang, dinginkan setelah dibuka."),
  p("Greek Yogurt Plain", "Susu dan Dairy", "500 g", 30000, 52000, 500, "Dairy Valley", "Simpan chiller 0-4C."),
  p("Keju Cheddar Slice", "Susu dan Dairy", "170 g", 25000, 42000, 170, "Dairy Valley", "Simpan dingin setelah dibuka."),
  p("Mentega Tawar", "Susu dan Dairy", "200 g", 24000, 39000, 200, "Dairy Valley", "Simpan di kulkas."),
  p("Roti Tawar Gandum", "Roti", "1 pack", 14000, 24000, 450, "Bakehouse", "Simpan tertutup, habiskan 3 hari."),
  p("Croissant Butter", "Roti", "2 pcs", 22000, 38000, 180, "Bakehouse", "Hangatkan sebelum disajikan."),
  p("Donat Gula Halus", "Roti", "4 pcs", 18000, 32000, 300, "Bakehouse", "Simpan tertutup di suhu ruang."),
  p("Bagel Wijen", "Roti", "3 pcs", 22000, 36000, 360, "Bakehouse", "Simpan tertutup dan panggang sebentar."),
  p("Telur Ayam Negeri", "Telur", "10 pcs", 23000, 33000, 650, "Eggcellent", "Simpan di rak telur kulkas."),
  p("Telur Omega", "Telur", "10 pcs", 32000, 47000, 650, "Eggcellent", "Simpan dingin agar kualitas stabil."),
  p("Telur Bebek", "Telur", "6 pcs", 26000, 39000, 480, "Eggcellent", "Simpan dingin."),
  p("Telur Puyuh", "Telur", "24 pcs", 13000, 22000, 300, "Eggcellent", "Simpan di chiller."),
  p("Nugget Ayam", "Frozen Food", "500 g", 34000, 52000, 500, "Freezer Lane", "Simpan beku -18C."),
  p("Kentang Goreng Shoestring", "Frozen Food", "1 kg", 36000, 56000, 1000, "Freezer Lane", "Simpan beku."),
  p("Dimsum Ayam Frozen", "Frozen Food", "12 pcs", 42000, 65000, 480, "Freezer Lane", "Simpan beku dan kukus saat saji."),
  p("Bakso Sapi Frozen", "Frozen Food", "500 g", 32000, 49000, 500, "Freezer Lane", "Simpan beku."),
  p("Air Mineral Botol", "Minuman", "600 ml", 3000, 7000, 600, "Clear Spring", "Simpan di suhu ruang."),
  p("Jus Jeruk Fresh", "Minuman", "1 L", 22000, 38000, 1030, "Fresh Sip", "Simpan dingin dan habiskan 2 hari."),
  p("Teh Hijau Botol", "Minuman", "500 ml", 7000, 14000, 500, "Fresh Sip", "Simpan dingin untuk rasa terbaik."),
  p("Kopi Susu Dingin", "Minuman", "250 ml", 12000, 24000, 250, "Fresh Sip", "Wajib simpan chiller."),
  p("Keripik Kentang Original", "Snack", "120 g", 14000, 26000, 120, "Snacky", "Simpan kering dan tertutup."),
  p("Granola Bar Madu", "Snack", "6 pcs", 28000, 45000, 240, "Healthy Bite", "Simpan di tempat kering."),
  p("Kacang Almond Panggang", "Snack", "200 g", 36000, 58000, 200, "Healthy Bite", "Simpan kedap udara."),
  p("Biskuit Gandum", "Snack", "300 g", 18000, 32000, 300, "Snacky", "Simpan tertutup."),
  p("Bawang Merah Kupas", "Bumbu Dapur", "250 g", 17000, 30000, 250, "Dapur Snap", "Simpan dingin dalam wadah tertutup."),
  p("Bawang Putih Kating", "Bumbu Dapur", "250 g", 15000, 27000, 250, "Dapur Snap", "Simpan kering dan berventilasi."),
  p("Cabai Rawit Merah", "Bumbu Dapur", "100 g", 9000, 18000, 100, "Dapur Snap", "Simpan di chiller."),
  p("Jahe Merah", "Bumbu Dapur", "250 g", 12000, 24000, 250, "Dapur Snap", "Simpan kering."),
  p("Beras Pulen Premium", "Beras dan Bahan Pokok", "5 kg", 62000, 88000, 5000, "Staple House", "Simpan dalam wadah tertutup."),
  p("Minyak Goreng Sunflower", "Beras dan Bahan Pokok", "2 L", 33000, 52000, 2000, "Staple House", "Simpan jauh dari sinar matahari."),
  p("Gula Pasir Kristal", "Beras dan Bahan Pokok", "1 kg", 15000, 23000, 1000, "Staple House", "Simpan kering."),
  p("Tepung Terigu Serbaguna", "Beras dan Bahan Pokok", "1 kg", 11000, 19000, 1000, "Staple House", "Simpan tertutup setelah dibuka."),
  p("Mie Instan Goreng", "Makanan Instan", "5 pack", 15000, 26000, 425, "Cepat Saji", "Simpan di tempat kering."),
  p("Bubur Instan Ayam", "Makanan Instan", "4 sachet", 18000, 30000, 320, "Cepat Saji", "Simpan kering."),
  p("Sup Krim Jagung Instan", "Makanan Instan", "3 sachet", 16000, 28000, 210, "Cepat Saji", "Simpan kering."),
  p("Pasta Saus Bolognese", "Makanan Instan", "1 pack", 29000, 45000, 380, "Cepat Saji", "Simpan suhu ruang."),
  p("Beras Merah Organik", "Produk Organik", "1 kg", 33000, 52000, 1000, "Organic Field", "Simpan dalam wadah kedap."),
  p("Madu Hutan Organik", "Produk Organik", "350 ml", 58000, 89000, 520, "Organic Field", "Simpan suhu ruang."),
  p("Tofu Sutra Organik", "Produk Organik", "300 g", 19000, 32000, 300, "Organic Field", "Simpan chiller."),
  p("Puree Bayi Wortel", "Kebutuhan Bayi", "120 g", 18000, 32000, 120, "Baby Bowl", "Simpan dingin setelah dibuka."),
  p("Biskuit Bayi Beras", "Kebutuhan Bayi", "150 g", 22000, 36000, 150, "Baby Bowl", "Simpan tertutup."),
  p("Popok Bayi M", "Kebutuhan Bayi", "24 pcs", 56000, 88000, 900, "Baby Bowl", "Simpan di tempat kering."),
  p("Sabun Mandi Cair", "Personal Care", "450 ml", 24000, 39000, 450, "Care Daily", "Simpan tertutup."),
  p("Sampo Aloe Vera", "Personal Care", "330 ml", 26000, 44000, 330, "Care Daily", "Simpan suhu ruang."),
  p("Pasta Gigi Herbal", "Personal Care", "160 g", 18000, 31000, 160, "Care Daily", "Simpan kering."),
  p("Tisu Dapur Roll", "Home Care", "2 roll", 14000, 26000, 380, "Home Spark", "Simpan kering."),
  p("Sabun Cuci Piring Lemon", "Home Care", "750 ml", 13000, 24000, 750, "Home Spark", "Simpan tertutup."),
  p("Deterjen Cair", "Home Care", "1 L", 24000, 42000, 1000, "Home Spark", "Simpan jauh dari anak-anak."),
  p("Pembersih Lantai", "Home Care", "800 ml", 16000, 29000, 800, "Home Spark", "Simpan tertutup."),
  p("Makanan Kucing Tuna", "Pet Supplies", "1 kg", 48000, 72000, 1000, "Pet Pantry", "Simpan kering dan tertutup."),
  p("Pasir Kucing Wangi", "Pet Supplies", "5 L", 39000, 62000, 2500, "Pet Pantry", "Simpan kering."),
  p("Snack Anjing Dental", "Pet Supplies", "180 g", 28000, 44000, 180, "Pet Pantry", "Simpan tertutup."),
  p("Paket Hemat Sayur Sop", "Promo Hari Ini", "1 paket", 26000, 42000, 900, "Market Snap", "Simpan sayuran di chiller."),
  p("Paket Sarapan Keluarga", "Promo Hari Ini", "1 paket", 52000, 78000, 1600, "Market Snap", "Simpan sesuai item di dalam paket."),
  p("Bundle Buah Bekal Anak", "Promo Hari Ini", "1 paket", 42000, 68000, 1200, "Market Snap", "Simpan buah di chiller.")
];

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
      update: {
        brand: record.brand,
        description: descriptionFor(record),
        isActive: true,
        price: record.price,
        shortInfo: shortInfoFor(record),
        sku: record.sku,
        storageInfo: record.storageInfo,
        unit: record.unit,
        weightGram: record.weightGram,
        categoryId
      },
      create: {
        brand: record.brand,
        categoryId,
        description: descriptionFor(record),
        isActive: true,
        name: record.name,
        price: record.price,
        shortInfo: shortInfoFor(record),
        sku: record.sku,
        storageInfo: record.storageInfo,
        unit: record.unit,
        weightGram: record.weightGram
      }
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
  await prisma.product.updateMany({
    where: {
      description: { contains: "Market Snap" },
      name: { notIn: Array.from(activeNames) }
    },
    data: { isActive: false }
  });
}

async function normalizeSeedProductImages() {
  const products = await prisma.product.findMany({
    where: { description: { contains: "Market Snap" }, isActive: true },
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

function p(name: string, category: string, unit: string, minPrice: number, maxPrice: number, weightGram: number, brand: string, storageInfo: string): ProductSeed {
  const slug = slugify(name);
  return {
    brand,
    category,
    image: `/products/${slug}.svg`,
    maxPrice,
    minPrice,
    name,
    sku: `MS-${slug.toUpperCase().slice(0, 42)}`,
    storageInfo,
    unit,
    weightGram
  };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

function descriptionFor(product: ProductSeed) {
  const freshness = faker.helpers.arrayElement(["segar", "berkualitas", "terkurasi", "siap pakai"]);
  return `${product.name} ${freshness} dari kategori ${product.category} untuk kebutuhan harian Market Snap. Brand ${product.brand}, berat ${product.weightGram} gram, dan stok mengikuti cabang terdekat. ${product.storageInfo}`;
}

function shortInfoFor(product: ProductSeed) {
  return `${product.brand} - ${product.unit} - ${product.weightGram} g`;
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
