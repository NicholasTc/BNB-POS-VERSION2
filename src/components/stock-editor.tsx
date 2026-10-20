"use client";
import { useState } from "react";
import { Modal } from "./modal";
import {
  stockCommand,
  type StockItem,
  type StockCommand,
} from "@/modules/stock/types";
import { ownerMessage } from "@/lib/owner-language";
import {
  StockRecovery,
  useStockText,
  type StockCommands,
} from "./stock-shared";
export type StockEditorState = {
  action: "create" | "edit" | "restock" | "adjust";
  operationId: string;
  item?: StockItem;
};
export function StockEditor({
  editor,
  commands,
  onClose,
  onSaved,
  onRefresh,
}: {
  editor: StockEditorState;
  commands: StockCommands;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRefresh: () => void;
}) {
  const { t, language, number } = useStockText();
  const [error, setError] = useState("");
  const title =
    editor.action === "create"
      ? t("Tambah barang", "Add stock item")
      : editor.action === "edit"
        ? t("Ubah barang", "Edit item")
        : editor.action === "restock"
          ? t("Tambah stok", "Add stock")
          : t("Sesuaikan stok", "Adjust stock");
  const locked = commands.busy || commands.pending.length > 0;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget),
      action = editor.action,
      id = editor.operationId;
    const draft =
      action === "create"
        ? {
            id,
            action,
            name: form.get("name"),
            unit: form.get("unit"),
            openingQuantity: Number(form.get("quantity")),
            lowThreshold: Number(form.get("threshold")),
          }
        : action === "edit"
          ? {
              id,
              action,
              stockItemId: editor.item!.id,
              revision: editor.item!.revision,
              name: form.get("name"),
              lowThreshold: Number(form.get("threshold")),
            }
          : {
              id,
              action,
              stockItemId: editor.item!.id,
              ...(action === "adjust"
                ? { revision: editor.item!.revision }
                : {}),
              quantity: Number(form.get("quantity")),
              reason: form.get("reason"),
            };
    const parsed = stockCommand.safeParse(draft);
    if (!parsed.success) {
      setError(
        t(
          "Periksa nama, jumlah bulat dan alasan penyesuaian.",
          "Check the name, whole quantities and adjustment reason.",
        ),
      );
      return;
    }
    try {
      await commands.run(parsed.data as StockCommand);
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={title}
      className="stock-dialog"
      busy={commands.busy}
      closeLabel={t("Tutup", "Close")}
      onClose={onClose}
    >
      {editor.item && (
        <div className="stock-current">
          <strong>{editor.item.name}</strong>
          <span>
            {t("Stok saat dibuka", "Stock when opened")}:{" "}
            {number(editor.item.balance)} {editor.item.unit}
          </span>
        </div>
      )}
      {(error || commands.error) && (
        <p className="error" role="alert">
          {ownerMessage(error || commands.error, language)}
        </p>
      )}
      <StockRecovery
        commands={commands}
        onResolved={() => {
          onRefresh();
          onClose();
        }}
      />
      <form className="stack" onSubmit={save}>
        <fieldset disabled={locked} className="stock-fields stack">
          {["create", "edit"].includes(editor.action) && (
            <div>
              <label htmlFor="stock-name">
                {t("Nama barang", "Item name")}
              </label>
              <input
                id="stock-name"
                name="name"
                required
                maxLength={80}
                defaultValue={editor.item?.name ?? ""}
                placeholder={t(
                  "Contoh: Gelas smoothie",
                  "Example: Smoothie cup",
                )}
              />
            </div>
          )}
          {editor.action === "create" && (
            <div>
              <label htmlFor="stock-unit">{t("Satuan", "Unit")}</label>
              <select id="stock-unit" name="unit">
                <option value="pcs">pcs</option>
                <option value="pack">pack</option>
              </select>
              <small>
                {t(
                  "Gunakan satuan yang sama saat belanja dan mengatur pemakaian menu. Satuan tidak diubah setelah barang dibuat.",
                  "Use the same unit for deliveries and menu usage. The unit stays fixed after creating an item.",
                )}
              </small>
            </div>
          )}
          {editor.action !== "edit" && (
            <div>
              <label htmlFor="stock-quantity">
                {editor.action === "create"
                  ? t("Stok awal", "Opening quantity")
                  : editor.action === "restock"
                    ? t("Jumlah yang datang", "Quantity received")
                    : t("Jumlah fisik sekarang", "Actual quantity now")}
                {editor.item ? ` (${editor.item.unit})` : ""}
              </label>
              <input
                id="stock-quantity"
                name="quantity"
                type="number"
                required
                min={editor.action === "restock" ? 1 : 0}
                max={1000000000}
                step={1}
                defaultValue={editor.action === "create" ? 0 : ""}
                autoComplete="off"
              />
              {editor.action === "adjust" && (
                <small>
                  {t(
                    "Isi jumlah fisik yang benar, bukan jumlah yang ingin dikurangi. Jika ada penjualan baru, periksa ulang sebelum menyimpan.",
                    "Enter the actual counted quantity, not the amount to subtract. If a new sale arrives, review the count before saving.",
                  )}
                </small>
              )}
            </div>
          )}
          {["create", "edit"].includes(editor.action) && (
            <div>
              <label htmlFor="stock-threshold">
                {t("Ingatkan saat stok mencapai", "Warn when stock reaches")}
              </label>
              <input
                id="stock-threshold"
                name="threshold"
                type="number"
                min={0}
                max={1000000000}
                step={1}
                required
                defaultValue={editor.item?.lowThreshold ?? 0}
              />
            </div>
          )}
          {["restock", "adjust"].includes(editor.action) && (
            <div>
              <label htmlFor="stock-reason">
                {editor.action === "adjust"
                  ? t("Alasan (wajib)", "Reason (required)")
                  : t("Catatan (opsional)", "Note (optional)")}
              </label>
              <input
                id="stock-reason"
                name="reason"
                maxLength={200}
                required={editor.action === "adjust"}
                placeholder={t(
                  "Contoh: Barang rusak / hitung fisik",
                  "Example: Spoilage / physical count",
                )}
              />
            </div>
          )}
          <button type="submit">
            {commands.busy
              ? t("Menyimpan…", "Saving…")
              : t("Simpan stok", "Save stock")}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
