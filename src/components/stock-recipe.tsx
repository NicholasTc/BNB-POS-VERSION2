"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { ownerMessage } from "@/lib/owner-language";
import type { MenuProduct } from "@/lib/menu";
import {
  recipeLines,
  type StockItem,
  type StockRecipe,
} from "@/modules/stock/types";
import { useStockText, type StockCommands } from "./stock-shared";
export function StockRecipeEditor({
  products,
  items,
  commands,
}: {
  products: MenuProduct[];
  items: StockItem[];
  commands: StockCommands;
}) {
  const { t, language } = useStockText();
  const [menuId, setMenuId] = useState(""),
    [recipe, setRecipe] = useState<
      (StockRecipe & { operationId: string }) | null
    >(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function load(id: string) {
    const current = ++request.current;
    setMenuId(id);
    setRecipe(null);
    setNotice(false);
    setError("");
    if (!id) return;
    setLoading(true);
    try {
      const result = await api<StockRecipe>(
        `/api/owner/stock?view=recipe&menuItemId=${id}`,
      );
      if (current === request.current)
        setRecipe({ ...result, operationId: crypto.randomUUID() });
    } catch (e) {
      if (current === request.current) setError((e as Error).message);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!recipe) return;
    setError("");
    setNotice(false);
    if (!recipeLines.safeParse(recipe.lines).success) {
      setError(
        t(
          "Pilih barang berbeda dan isi pemakaian bilangan bulat mulai 1.",
          "Choose distinct items and enter whole usage quantities of at least 1.",
        ),
      );
      return;
    }
    try {
      await commands.run({
        id: recipe.operationId,
        action: "recipe",
        menuItemId: recipe.menuItemId,
        revision: recipe.revision,
        lines: recipe.lines,
      });
      await load(recipe.menuItemId);
      setNotice(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const locked = commands.busy || commands.pending.length > 0;
  return (
    <section className="card stack stock-recipe">
      <h3>{t("Pemakaian untuk satu porsi", "Usage for one serving")}</h3>
      <p className="muted">
        {t(
          "Atur sekali. Stok otomatis berkurang setelah pembayaran selesai. Perubahan berlaku untuk pesanan baru; pesanan tersimpan tetap memakai aturan sebelumnya.",
          "Set this once. Stock decreases when payment completes. Changes apply to new orders; saved orders retain their previous usage.",
        )}
      </p>
      <div>
        <label htmlFor="stock-menu">
          {t("Pilih menu", "Choose a product")}
        </label>
        <select
          id="stock-menu"
          value={menuId}
          disabled={locked}
          onChange={(e) => void load(e.target.value)}
        >
          <option value="">{t("Pilih menu…", "Choose a product…")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {loading && <p role="status">{t("Memuat…", "Loading…")}</p>}
      {error && (
        <div className="error" role="alert">
          {ownerMessage(error, language)}{" "}
          {menuId && (
            <button
              className="text-button"
              disabled={locked}
              onClick={() => void load(menuId)}
            >
              {t("Muat ulang pemakaian", "Reload usage")}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="success" role="status">
          {t("Pemakaian disimpan.", "Usage saved.")}
        </p>
      )}
      {recipe && (
        <form className="stack" onSubmit={save}>
          <fieldset className="stock-fields stack" disabled={locked}>
            {!recipe.lines.length && (
              <p>
                {t(
                  "Belum ada pemakaian. Menu ini tidak mengurangi stok sampai Anda menambahkan barang.",
                  "No usage configured. This product will not deduct stock until you add items.",
                )}
              </p>
            )}
            {recipe.lines.map((line, index) => (
              <div className="stock-recipe-line" key={index}>
                <div>
                  <label htmlFor={`stock-ingredient-${index}`}>
                    {t("Barang", "Item")} {index + 1}
                  </label>
                  <select
                    id={`stock-ingredient-${index}`}
                    value={line.stockItemId}
                    required
                    onChange={(e) =>
                      setRecipe({
                        ...recipe,
                        lines: recipe.lines.map((l, i) =>
                          i === index
                            ? { ...l, stockItemId: e.target.value }
                            : l,
                        ),
                      })
                    }
                  >
                    <option value="">
                      {t("Pilih barang…", "Choose an item…")}
                    </option>
                    {items
                      .filter(
                        (i) =>
                          i.id === line.stockItemId ||
                          !recipe.lines.some((l) => l.stockItemId === i.id),
                      )
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`stock-used-${index}`}>
                    {t("Per porsi", "Per serving")}
                  </label>
                  <input
                    id={`stock-used-${index}`}
                    type="number"
                    min={1}
                    max={1000000}
                    required
                    step={1}
                    value={line.quantity}
                    onChange={(e) =>
                      setRecipe({
                        ...recipe,
                        lines: recipe.lines.map((l, i) =>
                          i === index
                            ? { ...l, quantity: Number(e.target.value) }
                            : l,
                        ),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`${t("Hapus barang", "Remove item")} ${index + 1}`}
                  onClick={() =>
                    setRecipe({
                      ...recipe,
                      lines: recipe.lines.filter((_, i) => i !== index),
                    })
                  }
                >
                  {t("Hapus", "Remove")}
                </button>
              </div>
            ))}
            <div className="row">
              <button
                type="button"
                className="secondary"
                disabled={
                  recipe.lines.length >= 20 ||
                  recipe.lines.length >= items.length
                }
                onClick={() =>
                  setRecipe({
                    ...recipe,
                    lines: [
                      ...recipe.lines,
                      {
                        stockItemId: items.find(
                          (i) =>
                            !recipe.lines.some((l) => l.stockItemId === i.id),
                        )!.id,
                        quantity: 1,
                      },
                    ],
                  })
                }
              >
                {t("Tambah barang pemakaian", "Add usage item")}
              </button>
              <button type="submit">
                {commands.busy
                  ? t("Menyimpan…", "Saving…")
                  : t("Simpan pemakaian", "Save usage")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
