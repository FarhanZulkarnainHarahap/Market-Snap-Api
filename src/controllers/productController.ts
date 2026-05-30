import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { handleControllerError } from "../utils/controllerHelpers.js";

export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    const exists = await prisma.product.findUnique({ where: { name: req.body.name } });
    if (exists) {
      res.status(409).json({ message: "Nama produk sudah digunakan" });
      return;
    }
    const category = await prisma.productCategory.upsert({ where: { name: req.body.category }, update: {}, create: { name: req.body.category } });
    const product = await prisma.product.create({ data: { name: req.body.name, description: req.body.description, price: Number(req.body.price), unit: req.body.unit, categoryId: category.id, images: { create: [{ url: req.body.image ?? fallbackImage }] } }, include: { category: true, images: true } });
    await createInitialStocks(product.id);
    res.status(201).json({ data: product });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  try {
    const category = req.body.category ? await prisma.productCategory.upsert({ where: { name: req.body.category }, update: {}, create: { name: req.body.category } }) : null;
    const product = await prisma.product.update({ where: { id: String(req.params.id) }, data: { name: req.body.name, description: req.body.description, price: req.body.price === undefined ? undefined : Number(req.body.price), unit: req.body.unit, categoryId: category?.id }, include: { category: true, images: true } });
    res.json({ data: product });
  } catch (error) {
    handleControllerError(res, error);
  }
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  try {
    await prisma.inventory.deleteMany({ where: { productId: String(req.params.id) } });
    await prisma.productImage.deleteMany({ where: { productId: String(req.params.id) } });
    const product = await prisma.product.delete({ where: { id: String(req.params.id) } });
    res.json({ message: "Produk berhasil dihapus", data: product });
  } catch (error) {
    handleControllerError(res, error);
  }
}

async function createInitialStocks(productId: string) {
  const stores = await prisma.store.findMany({ select: { id: true } });
  await Promise.all(stores.map((store) => prisma.inventory.upsert({ where: { storeId_productId: { storeId: store.id, productId } }, update: {}, create: { storeId: store.id, productId, quantity: 0 } })));
}

const fallbackImage = "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80";
