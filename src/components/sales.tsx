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
import { rupiah, priceLines } from "@/lib/money";
import type { PosState } from "./pos";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
type Item = { id: string; name: string; price: number };
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
    [payment, setPayment] = useState<"cash" | "qris">("qris"),
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
    try {
      localStorage.removeItem(CART_KEY);
    } catch {
      /* Recovery key is independent and never removed here. */
    }
  }, []);
  useImperativeHandle(
    ref,
    () => ({ hasCart: !!cart?.items.length, pending, clearCart }),
    [cart, pending, clearCart],
  );
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
  async function prepare() {
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
  async function change(action: "attest" | "complete" | "cancel") {
    if (!quote) return;
    if (
      action === "cancel" &&
      !window.confirm(
        "Pastikan belum menerima pembayaran. Batalkan pesanan ini?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (action !== "cancel")
        writeRecovery({
          ...(recovery ?? { id: quote.id }),
          stage: action === "attest" ? "attest" : "complete",
        });
      const q = await api<Quote>("/api/sales", {
        id: quote.id,
        action,
        ...(action === "attest"
          ? { paymentReceived: true }
          : action === "cancel"
            ? { paymentNotReceived: true }
            : {}),
      });
      if (q.status === "paid")
        writeRecovery({ ...(recovery ?? { id: quote.id }), stage: "paid" });
      acceptQuote(q);
    } catch (e) {
      setError(
        "Belum terkonfirmasi. Jangan meminta pembayaran lagi. " +
          (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function check() {
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
  }
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
  return (
    <section className="sales-layout" aria-label="Penjualan">
      <div className="stack">
        <div className="row between">
          <div>
            <h2>Yang enak hari ini</h2>
            <p className="muted">Ketuk menu untuk menambah pesanan.</p>
          </div>
          {menuStale && (
            <small role="status">
              Pembaruan menu tertunda. Pesanan Anda tetap tersimpan.
            </small>
          )}
          <button
            className="secondary"
            onClick={() => void check()}
            disabled={busy}
          >
            {busy ? "Memeriksa…" : "Perbarui & periksa"}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Memuat menu…</p>
        ) : menu.length ? (
          <div className="product-grid">
            {menu.map((item, i) => (
              <button
                key={item.id}
                className={`product product-${i % 4}`}
                disabled={
                  !state.cashier || !belongs || pending || busy || blocked
                }
                onClick={() => add(item)}
                aria-label={`Tambah ${item.name}`}
              >
                <span className="product-mark" aria-hidden="true">
                  {item.name
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")}
                </span>
                <span className="product-name">{item.name}</span>
                <span className="product-price">{rupiah(item.price)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="card">
            <h3>Menu belum tersedia.</h3>
            <p className="muted">
              Pemilik dapat menambahkan menu di ruang pemilik.
            </p>
          </div>
        )}
      </div>
      <aside className="cart card stack" aria-label="Pesanan">
        {quote?.status === "completed" ? (
          <>
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
            <button onClick={() => setQuote(null)}>Pesanan baru</button>
          </>
        ) : quote && ["pending", "paid"].includes(quote.status) ? (
          <>
            <span className="badge">
              {quote.status === "paid"
                ? "Pembayaran dicatat"
                : "Periksa pembayaran"}
            </span>
            <h2>
              {quote.status === "paid"
                ? "Siap diselesaikan."
                : "Pesanan sudah tepat?"}
            </h2>
            <p className="muted">
              Kasir {quote.cashierName}. Harga ini telah disimpan.
            </p>
            <div className="cart-lines">
              {quote.lines.map((l) => (
                <div className="row between" key={l.id}>
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <strong>{rupiah(l.subtotal)}</strong>
                </div>
              ))}
            </div>
            <div className="row between">
              <span>
                Total {quote.paymentMethod === "qris" ? "QRIS" : "tunai"}
              </span>
              <strong className="cart-total">{rupiah(quote.total)}</strong>
            </div>
            <p className="reference">{quote.reference}</p>
            {!canPay && (
              <p className="muted">
                Masukkan PIN {quote.cashierName} melalui Ganti kasir jika kasir
                terkunci.
              </p>
            )}
            {quote.status === "pending" ? (
              <>
                <p className="payment-note">
                  Periksa pembayaran pelanggan secara langsung. QRIS tidak
                  diverifikasi otomatis.
                </p>
                {recovery && ["attest", "complete"].includes(recovery.stage) ? (
                  <button
                    disabled={!canPay}
                    onClick={() => void change("attest")}
                  >
                    Ulangi pencatatan pembayaran
                  </button>
                ) : (
                  <label className="payment-confirm">
                    <input
                      type="checkbox"
                      checked={
                        !!recovery &&
                        ["attest", "paid", "complete"].includes(recovery.stage)
                      }
                      disabled={!canPay}
                      onChange={() => void change("attest")}
                    />
                    Pembayaran sudah diterima
                  </label>
                )}
                {(!recovery ||
                  ["prepared", "prepare"].includes(recovery.stage)) && (
                  <button
                    className="secondary"
                    disabled={!canPay}
                    onClick={() => void change("cancel")}
                  >
                    Kembali, belum dibayar
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="success">
                  Penerimaan pembayaran telah dicatat oleh kasir.
                </p>
                <button
                  disabled={!canPay}
                  onClick={() => void change("complete")}
                >
                  {busy ? "Menyimpan…" : "Selesai"}
                </button>
              </>
            )}
          </>
        ) : recovery ? (
          <>
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
          </>
        ) : (
          <>
            <div className="row between">
              <h2>Pesanan</h2>
              <span className="badge">
                {cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0} item
              </span>
            </div>
            {cart?.items.length ? (
              <>
                <div className="cart-lines">
                  {cart.items.map((i) => (
                    <div className="cart-line" key={i.id}>
                      <div className="row between">
                        <strong>{i.name}</strong>
                        <span>{rupiah(i.price * i.quantity)}</span>
                      </div>
                      <div className="row between">
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
                          onClick={() =>
                            setCart((c) =>
                              c
                                ? {
                                    ...c,
                                    items: c.items.filter((x) => x.id !== i.id),
                                  }
                                : c,
                            )
                          }
                          aria-label={`Hapus ${i.name}`}
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!belongs && (
                  <p className="error">
                    Pesanan ini milik kasir sebelumnya. Masukkan PIN kasir
                    tersebut atau hapus pesanan sebelum melanjutkan.
                  </p>
                )}
                <button
                  className="text-button"
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
              </>
            ) : (
              <div className="cart-empty">
                <span aria-hidden="true">☕</span>
                <h3>Mulai dari satu pilihan.</h3>
                <p className="muted">Menu yang diketuk akan muncul di sini.</p>
              </div>
            )}
            <div className="row between">
              <span>Total</span>
              <strong className="cart-total">{rupiah(total)}</strong>
            </div>
            <fieldset disabled={busy || !belongs}>
              <legend>Metode pembayaran</legend>
              <div className="payment-options">
                {(["qris", "cash"] as const).map((p) => (
                  <label key={p} className={payment === p ? "selected" : ""}>
                    <input
                      type="radio"
                      name="payment"
                      value={p}
                      checked={payment === p}
                      onChange={() => setPayment(p)}
                    />
                    {p === "qris" ? "QRIS" : "Tunai"}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              disabled={!cart?.items.length || !belongs || busy || blocked}
              onClick={() => void prepare()}
            >
              {busy ? "Memeriksa…" : "Lanjut pembayaran"}
            </button>
            <small>Periksa total sebelum menerima pembayaran.</small>
          </>
        )}
      </aside>
    </section>
  );
}
