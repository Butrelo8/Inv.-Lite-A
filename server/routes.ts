import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get(api.inventory.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const items = await storage.getItems(search, category);
    res.json(items);
  });

  app.get(api.inventory.get.path, async (req, res) => {
    const item = await storage.getItem(Number(req.params.id));
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  });

  app.post(api.inventory.create.path, async (req, res) => {
    try {
      const input = api.inventory.create.input.parse(req.body);
      const item = await storage.createItem(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.inventory.update.path, async (req, res) => {
    try {
      const input = api.inventory.update.input.parse(req.body);
      const item = await storage.updateItem(Number(req.params.id), input);
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.inventory.delete.path, async (req, res) => {
    await storage.deleteItem(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}

// Seed function to add some initial data
async function seedDatabase() {
  const existingItems = await storage.getItems();
  if (existingItems.length === 0) {
    await storage.createItem({
      code: "LAP-001",
      name: "Laptop Dell XPS 15",
      serialNumber: "DL123456789",
      size: "15 inch",
      units: 5,
      condition: "Nuevo",
      purchaseDate: "2023-01-15",
      responsible: "Juan Perez",
      usefulLife: "3 years",
      category: "Electronics"
    });
    await storage.createItem({
      code: "MON-202",
      name: "Monitor Samsung 27\"",
      serialNumber: "SN987654321",
      size: "27 inch",
      units: 10,
      condition: "Bueno",
      purchaseDate: "2023-03-20",
      responsible: "Ana Garcia",
      usefulLife: "5 years",
      category: "Electronics"
    });
    await storage.createItem({
      code: "CHR-101",
      name: "Silla Ergonómica",
      serialNumber: "N/A",
      size: "Standard",
      units: 20,
      condition: "Excelente",
      purchaseDate: "2023-06-10",
      responsible: "Oficina Central",
      usefulLife: "10 years",
      category: "Furniture"
    });
  }
}

// Invoke seed on startup (a bit hacky but works for this scale)
setTimeout(() => {
  seedDatabase().catch(err => console.error("Error seeding database:", err));
}, 1000);
