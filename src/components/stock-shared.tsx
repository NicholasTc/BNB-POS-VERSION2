"use client";
import { useOwnerLanguage } from "./owner-language";
import type { useStockCommands } from "@/modules/stock/use-commands";
export type StockCommands = ReturnType<typeof useStockCommands>;
export function useStockText() {
  const { language } = useOwnerLanguage();
  return {
    language,
    t: (id: string, en: string) => (language === "en" ? en : id),
    number: (n: number) =>
      n.toLocaleString(language === "en" ? "en-US" : "id-ID"),
  };
}
export function StockRecovery({
  commands,
  onResolved,
}: {
  commands: StockCommands;
  onResolved: () => void;
}) {
  const { t } = useStockText();
  if (!commands.pending.length) return null;
  return (
    <div className="stock-recovery" role="status">
      <strong>
        {t(
          "Perubahan stok belum terkonfirmasi.",
          "Stock change is not confirmed.",
        )}
      </strong>
      <p>
        {t(
          "Jangan tambah stok lagi untuk percobaan yang sama. Periksa status; jika belum tercatat, batalkan percobaan sebelum mengisi ulang.",
          "Do not enter the same delivery again. Check its status; if not recorded, cancel this attempt before entering it again.",
        )}
      </p>
      <div className="row">
        <button
          className="secondary"
          disabled={commands.busy}
          onClick={async () => {
            await commands.check();
            onResolved();
          }}
        >
          {t("Periksa status stok", "Check stock status")}
        </button>
        <button
          className="text-button"
          disabled={commands.busy}
          onClick={async () => {
            await commands.abandon();
            onResolved();
          }}
        >
          {t("Batalkan percobaan", "Cancel attempt")}
        </button>
      </div>
    </div>
  );
}
