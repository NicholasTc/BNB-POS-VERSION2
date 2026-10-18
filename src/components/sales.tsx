"use client";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  type Ref,
} from "react";
import { z } from "zod";
import { api, ApiError } from "@/lib/client";
import { compactRupiah as rupiah, priceLines } from "@/lib/money";
import type { PosState } from "./pos";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import type { MenuProduct } from "@/lib/menu";
import { ProductPhoto } from "./product-photo";
import { PaymentSheet } from "./payment-sheet";
import { PosIcon } from "./pos-icons";
type Item = Pick<MenuProduct, "id" | "name" | "price"> &
  Partial<Pick<MenuProduct, "category" | "imageUrl">>;
type Cart = { cashierId: string; items: (Item & { quantity: number })[] };
type Quote = {
  id: string;
  reference: string;
  status: "pending" | "paid" | "completed" | "cancelled";
  cashierId: string;
  cashierName: string;
  total: number;
  paymentMethod: "cash" | "qris";
  completedAt: string | null;
  lines: {
    id: string;
    name: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[];
};
const recoverySchema = z.object({
  id: z.uuid(),
  stage: z.enum(["prepare", "prepared", "attest", "paid", "complete"]),
  prepare: z
    .object({
      id: z.uuid(),
      generation: z.number().int(),
      paymentMethod: z.enum(["cash", "qris"]),
      items: z.array(
        z.object({
          id: z.uuid(),
          quantity: z.number().int().min(1).max(99),
          unitPrice: z.number().int().positive(),
        }),
      ),
    })
    .optional(),
});
type Recovery = z.infer<typeof recoverySchema>;
const cartSchema = z.object({
  cashierId: z.uuid(),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        price: z.number().int().positive(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .max(50),
});
const RECOVERY_KEY = "lisi.transaction",
  CART_KEY = "lisi.cart";
export type SalesHandle = {
  hasCart: boolean;
  pending: boolean;
  clearCart: () => void;
  check: () => Promise<void>;
};
export function Sales({
  state,
  ref,
}: {
  state: PosState;
  ref: Ref<SalesHandle>;
}) {
  const [menu, setMenu] = useState<Item[]>([]),
    [cart, setCart] = useState<Cart | null>(null),
    [quote, setQuote] = useState<Quote | null>(null),
    [recovery, setRecovery] = useState<Recovery | null>(null),
    [category, setCategory] = useState<"all" | "drink" | "food">("all"),
    [editing, setEditing] = useState(false),
    [sheetOpen, setSheetOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [menuStale, setMenuStale] = useState(false),
    [missing, setMissing] = useState(false);
  const pending =
    !!recovery || (!!quote && ["pending", "paid"].includes(quote.status));
  const clearCart = useCallback(() => {
    setCart(null);
    setEditing(false);
    try {
      localStorage.removeItem(CART_KEY);
    } catch {
      /* Recovery key is independent and never removed here. */
    }
  }, []);
  const writeRecovery = useCallback((record: Recovery | null) => {
    try {
      if (record) localStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
      else localStorage.removeItem(RECOVERY_KEY);
      setRecovery(record);
      setMissing(false);
    } catch {
      throw new Error(
        "Penyimpanan perangkat tidak tersedia. Jangan menerima pembayaran; hubungi pemilik.",
      );
    }
  }, []);
  const acceptQuote = useCallback(
    (q: Quote | null) => {
      setQuote(q);
      setSheetOpen(!!q && ["pending", "paid"].includes(q.status));
      setMissing(false);
      if (q?.status === "completed" || q?.status === "cancelled") {
        writeRecovery(null);
        clearCart();
      }
    },
    [clearCart, writeRecovery],
  );
  const recover = useCallback(async () => {
    const raw = localStorage.getItem(RECOVERY_KEY);
    const r = raw ? recoverySchema.parse(JSON.parse(raw)) : null;
    setRecovery(r);
    try {
      const q = await api<Quote | null>(
        "/api/sales" + (r ? "?id=" + r.id : ""),
      );
      if (q && ["pending", "paid"].includes(q.status) && !r)
        writeRecovery({
          id: q.id,
          stage: q.status === "paid" ? "paid" : "prepared",
        });
      acceptQuote(q);
      setBlocked(false);
      if (
        q?.status === "pending" &&
        r &&
        ["attest", "complete"].includes(r.stage)
      )
        setError(
          "Jawaban pembayaran belum pasti. Periksa atau ulangi pencatatan dengan referensi yang sama. Jangan meminta pembayaran lagi.",
        );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && r) {
        setMissing(true);
        setQuote(null);
        setError(
          "Transaksi belum ditemukan. Gunakan referensi yang sama untuk mencoba kembali.",
        );
      } else throw e;
    }
  }, [acceptQuote, writeRecovery]);
  useEffect(() => {
    let live = true;
    api<Item[]>("/api/menu")
      .then(async (items) => {
        if (!live) return;
        setMenu(items);
        const saved = localStorage.getItem(CART_KEY);
        if (saved) setCart(cartSchema.parse(JSON.parse(saved)));
        await recover();
      })
      .catch((e) => {
        if (live) {
          setError((e as Error).message);
          setBlocked(true);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [recover]);
  const refreshMenu = useCallback(async (signal: AbortSignal) => {
    try {
      const items = await api<Item[]>("/api/menu", undefined, { signal });
      if (signal.aborted) return;
      // Only the listing changes. Cart prices, quotes and recovery are never
      // rewritten by background activity; checkout still validates prices.
      setMenu(items);
      setMenuStale(false);
    } catch {
      if (!signal.aborted) setMenuStale(true);
    }
  }, []);
  useAutoRefresh(refreshMenu, !loading && !busy && !pending);
  useEffect(() => {
    if (loading) return;
    try {
      if (cart?.items.length)
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
      else localStorage.removeItem(CART_KEY);
    } catch {
      /* Financial steps explicitly require recovery storage before requests. */
    }
  }, [cart, loading]);
  const belongs =
    !!state.cashier && (!cart || cart.cashierId === state.cashier.employeeId);
  function add(item: Item) {
    if (!state.cashier || !belongs || pending) return;
    setError("");
    setCart((c) => {
      const items = c?.items ?? [];
      const existing = items.find((x) => x.id === item.id);
      if (existing?.quantity === 99 || (!existing && items.length === 50))
        return c;
      return {
        cashierId: state.cashier!.employeeId,
        items: existing
          ? items.map((x) =>
              x.id === item.id ? { ...x, quantity: x.quantity + 1 } : x,
            )
          : [...items, { ...item, quantity: 1 }],
      };
    });
  }
  function quantity(id: string, delta: number) {
    setCart((c) =>
      c
        ? {
            ...c,
            items: c.items
              .map((i) =>
                i.id === id ? { ...i, quantity: i.quantity + delta } : i,
              )
              .filter((i) => i.quantity > 0),
          }
        : null,
    );
  }
  async function prepare(payment: "cash" | "qris") {
    if (!state.cashier || !cart?.items.length || pending) return;
    setBusy(true);
    setError("");
    try {
      priceLines(
        cart.items.map((i) => ({ unitPrice: i.price, quantity: i.quantity })),
      );
      const id = crypto.randomUUID();
      const input = {
        id,
        generation: state.generation,
        paymentMethod: payment,
        items: cart.items.map((i) => ({
          id: i.id,
          unitPrice: i.price,
          quantity: i.quantity,
        })),
      };
      const r: Recovery = { id, stage: "prepare", prepare: input };
      writeRecovery(r);
      const q = await api<Quote>("/api/sales", { action: "prepare", ...input });
      writeRecovery({ ...r, stage: "prepared" });
      acceptQuote(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelQuote() {
    if (
      !quote ||
      busy ||
      !window.confirm(
        "Pastikan belum menerima pembayaran. Batalkan pesanan ini?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      acceptQuote(
        await api<Quote>("/api/sales", {
          id: quote.id,
          action: "cancel",
          paymentNotReceived: true,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePayment() {
    if (
      !quote ||
      busy ||
      blocked ||
      state.cashier?.employeeId !== quote.cashierId
    )
      return;
    setBusy(true);
    setError("");
    try {
      let current = quote;
      if (current.status === "pending") {
        writeRecovery({ ...(recovery ?? { id: current.id }), stage: "attest" });
        current = await api<Quote>("/api/sales", {
          id: current.id,
          action: "attest",
          paymentReceived: true,
        });
        if (current.status === "paid") {
          writeRecovery({ ...(recovery ?? { id: current.id }), stage: "paid" });
          setQuote(current);
        }
      }
      if (current.status === "paid") {
        writeRecovery({
          ...(recovery ?? { id: current.id }),
          stage: "complete",
        });
        current = await api<Quote>("/api/sales", {
          id: current.id,
          action: "complete",
        });
      }
      acceptQuote(current);
    } catch (e) {
      setError(
        "Belum terkonfirmasi. Jangan meminta pembayaran lagi. " +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const check = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setMenu(await api<Item[]>("/api/menu"));
      setMenuStale(false);
      await recover();
    } catch (e) {
      setError((e as Error).message);
      setBlocked(true);
    } finally {
      setBusy(false);
    }
  }, [recover]);
  useImperativeHandle(
    ref,
    () => ({ hasCart: !!cart?.items.length, pending, clearCart, check }),
    [cart, pending, clearCart, check],
  );
  async function retryPreparation() {
    if (!recovery?.prepare) return;
    setBusy(true);
    setError("");
    try {
      const q = await api<Quote>("/api/sales", {
        action: "prepare",
        ...recovery.prepare,
      });
      writeRecovery({ ...recovery, stage: "prepared" });
      acceptQuote(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const total =
    cart?.items.reduce((sum, i) => sum + i.price * i.quantity, 0) ?? 0;
  const canPay =
    !busy && !blocked && state.cashier?.employeeId === quote?.cashierId;
  const count = cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return (
    <section className="sales-layout" aria-label="Penjualan">
      <div className="catalog">
        <h1 className="sr-only">Menu kafe</h1>
        <div className="catalog-tabs" role="group" aria-label="Kategori menu">
          {(
            [
              ["all", "Semua"],
              ["drink", "Minuman"],
              ["food", "Makanan"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={category === value}
              className={category === value ? "active" : ""}
              onClick={() => setCategory(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {menuStale && (
          <p className="sync-note" role="status">
            Pembaruan menu tertunda. Pesanan Anda tetap tersimpan.
          </p>
        )}
        {error && !sheetOpen && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Memuat menu…</p>
        ) : menu.length ? (
          <>
            <div className="product-grid">
              {menu
                .filter(
                  (item) => category === "all" || item.category === category,
                )
                .map((item) => {
                  const selected =
                    cart?.items.find((i) => i.id === item.id)?.quantity ?? 0;
                  return (
                    <button
                      key={item.id}
                      className={`product ${selected ? "in-cart" : ""}`}
                      disabled={
                        !state.cashier || !belongs || pending || busy || blocked
                      }
                      onClick={() => add(item)}
                      aria-label={`Tambah ${item.name}`}
                    >
                      <ProductPhoto
                        imageUrl={item.imageUrl ?? ""}
                        category={item.category ?? "uncategorized"}
                      />
                      <span className="product-copy">
                        <span className="product-name">{item.name}</span>
                        <span className="product-price">
                          {rupiah(item.price)}
                        </span>
                      </span>
                      {selected > 0 && (
                        <span
                          className="product-quantity"
                          aria-label={`${selected} dalam pesanan`}
                        >
                          {selected}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
            {category !== "all" &&
              !menu.some((item) => item.category === category) && (
                <p className="catalog-empty">
                  Belum ada menu dalam kategori ini.
                </p>
              )}
            <p className="catalog-hint">Ketuk menu untuk menambah</p>
          </>
        ) : (
          <div className="card">
            <h3>Menu belum tersedia.</h3>
            <p className="muted">
              Pemilik dapat menambahkan menu di ruang pemilik.
            </p>
          </div>
        )}
      </div>
      <aside className="cart" aria-label="Pesanan">
        {quote?.status === "completed" ? (
          <div className="receipt stack">
            <span className="receipt-mark" aria-hidden="true">
              ✓
            </span>
            <div role="status">
              <h2>Penjualan tersimpan!</h2>
            </div>
            <p>Terima kasih. Pesanan berikutnya?</p>
            <strong className="cart-total">{rupiah(quote.total)}</strong>
            <p>
              {quote.paymentMethod === "qris" ? "QRIS" : "Tunai"} · Kasir{" "}
              {quote.cashierName}
            </p>
            <p className="reference">{quote.reference}</p>
            <button
              onClick={() => {
                setQuote(null);
                setEditing(false);
              }}
            >
              Pesanan baru
            </button>
          </div>
        ) : quote && ["pending", "paid"].includes(quote.status) ? (
          <div className="saved-order stack">
            <h2>
              {quote.status === "paid"
                ? "Pembayaran dicatat"
                : "Pesanan tersimpan"}
            </h2>
            <div className="cart-lines">
              {quote.lines.map((l) => (
                <div className="compact-line" key={l.id}>
                  <span>{l.quantity}×</span>
                  <strong>{l.name}</strong>
                  <span>{rupiah(l.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="cart-total-row">
              <strong>Total</strong>
              <strong className="cart-total">{rupiah(quote.total)}</strong>
            </div>
            <button onClick={() => setSheetOpen(true)}>
              Lanjutkan pembayaran
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void check()}
            >
              Periksa status transaksi
            </button>
            <p className="reference">{quote.reference}</p>
          </div>
        ) : recovery ? (
          <div className="stack">
            <h2>Periksa transaksi dahulu.</h2>
            <p className="muted">
              Jangan meminta pembayaran lagi atau membuat transaksi pengganti
              sebelum status diketahui.
            </p>
            <p className="reference">LS-{recovery.id.toUpperCase()}</p>
            <button disabled={busy} onClick={() => void check()}>
              Periksa status transaksi
            </button>
            {missing && recovery.stage === "prepare" && recovery.prepare && (
              <>
                <button
                  className="secondary"
                  disabled={busy || blocked}
                  onClick={() => void retryPreparation()}
                >
                  Coba simpan pesanan yang sama
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Belum menerima pembayaran dan ingin mengubah pesanan?",
                      )
                    ) {
                      try {
                        writeRecovery(null);
                        setError("");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }
                  }}
                >
                  Ubah pesanan, belum dibayar
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="order-heading">
              <h2>Pesanan · {count} item</h2>
              <button
                className="text-button"
                aria-expanded={editing}
                disabled={!cart?.items.length}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Selesai ubah" : "Ubah"}
              </button>
            </div>
            {cart?.items.length ? (
              <>
                <div className="cart-lines">
                  {cart.items.map((i) => (
                    <div className="cart-line" key={i.id}>
                      <div className="compact-line">
                        <span>{i.quantity}×</span>
                        <strong>{i.name}</strong>
                        <span>{rupiah(i.price * i.quantity)}</span>
                      </div>
                      {editing && (
                        <div className="row between cart-edit-controls">
                          <span className="quantity-controls">
                            <button
                              className="secondary"
                              aria-label={`Kurangi ${i.name}`}
                              disabled={busy || !belongs}
                              onClick={() => quantity(i.id, -1)}
                            >
                              −
                            </button>
                            <output aria-label={`Jumlah ${i.name}`}>
                              {i.quantity}
                            </output>
                            <button
                              className="secondary"
                              aria-label={`Tambah jumlah ${i.name}`}
                              disabled={busy || !belongs || i.quantity >= 99}
                              onClick={() => quantity(i.id, 1)}
                            >
                              +
                            </button>
                          </span>
                          <button
                            className="text-button"
                            disabled={busy || !belongs}
                            aria-label={`Hapus ${i.name}`}
                            onClick={() =>
                              setCart((c) =>
                                c
                                  ? {
                                      ...c,
                                      items: c.items.filter(
                                        (x) => x.id !== i.id,
                                      ),
                                    }
                                  : c,
                              )
                            }
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {!belongs && (
                  <p className="error">
                    Pesanan ini milik kasir sebelumnya. Masukkan PIN kasir
                    tersebut atau hapus pesanan sebelum melanjutkan.
                  </p>
                )}
                {editing && (
                  <button
                    className="text-button clear-order"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Hapus seluruh pesanan yang belum dibayar?",
                        )
                      )
                        clearCart();
                    }}
                  >
                    Hapus pesanan
                  </button>
                )}
              </>
            ) : (
              <div className="cart-empty">
                <h3>Mulai dari satu pilihan.</h3>
                <p className="muted">Menu yang diketuk akan muncul di sini.</p>
              </div>
            )}
            <div className="cart-total-row">
              <strong>Total</strong>
              <strong className="cart-total">{rupiah(total)}</strong>
            </div>
            <div className="checkout-buttons">
              <button
                disabled={!cart?.items.length || !belongs || busy || blocked}
                onClick={() => void prepare("cash")}
              >
                <PosIcon name="cash" />
                {busy ? "Memeriksa…" : "Tunai"}
              </button>
              <button
                className="secondary"
                disabled={!cart?.items.length || !belongs || busy || blocked}
                onClick={() => void prepare("qris")}
              >
                <PosIcon name="qris" />
                QRIS
              </button>
            </div>
            <small className="checkout-caption">
              Konfirmasi pembayaran di langkah berikutnya
            </small>
          </>
        )}
      </aside>
      {sheetOpen && quote && ["pending", "paid"].includes(quote.status) && (
        <PaymentSheet
          key={quote.id}
          quote={quote}
          busy={busy}
          canPay={canPay}
          uncertain={
            !!recovery && ["attest", "complete"].includes(recovery.stage)
          }
          error={error}
          onSave={() => void savePayment()}
          onCheck={() => void check()}
          onCancel={() => void cancelQuote()}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </section>
  );
}
