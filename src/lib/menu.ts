import { z } from "zod";

export const menuCategory = z.enum(["uncategorized", "drink", "food"]);
export const menuImage = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (value === "" || /^\/menu\/[a-z-]+\.webp$/.test(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Gunakan URL foto HTTPS atau foto contoh yang tersedia.");
export type MenuCategory = z.infer<typeof menuCategory>;
export type MenuProduct = {
  id: string;
  name: string;
  price: number;
  category: MenuCategory;
  imageUrl: string;
};
export const placeholderImage = (category: MenuCategory) =>
  category === "food" ? "/menu/pastry.webp" : "/menu/coffee.webp";
