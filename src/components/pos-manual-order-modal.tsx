"use client";

import { useLocale } from "@/components/locale-provider";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { cartSubtotal, type CartItem } from "@/lib/customer/cart";
import { randomId } from "@/lib/random-id";
import { usePagination } from "@/lib/use-pagination";
import { MenuCard } from "@/components/menu-card";
import { Alert, Button, LoadingState, Input, Pagination } from "@/components/ui/controls";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

type Menu = { categories: { id: string; name: string; items: { id: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string }[] }[] };
type Draft = { customerName: string; note: string; cart: CartItem[]; key: string; uncertain?: boolean };

function updateCart(cart: CartItem[], item: CartItem, quantity: number): CartItem[] {
  if (quantity <= 0) return cart.filter((entry) => entry.id !== item.id);
  if (quantity > 99) return cart;
  const exists = cart.some((entry) => entry.id === item.id);
  if (exists) {
    return cart.map((entry) => (entry.id === item.id ? { ...entry, quantity } : entry));
  }
  return [...cart, { ...item, quantity }];
}

export function PosManualOrderModal({
  tableId,
  tableNumber,
  tableOccupied,
  onClose,
  onSuccess,
}: {
  tableId: string;
  tableNumber: string;
  tableOccupied: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t, money } = useLocale();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuError, setMenuError] = useState("");
  const [draft, setDraft] = useState<Draft>({ customerName: "", note: "", cart: [], key: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const storageKey = `pos-manual:${tableId}`;
  const manualInFlight = useRef(false);
  const { page: menuPage, setPage: setMenuPage, pageSize: menuPageSize, setPageSize: setMenuPageSize } = usePagination();
  const [search, setSearch] = useState("");

  const filteredItems = menu?.categories.flatMap((c) => c.items).filter((item) =>
    item.name.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID"))
  ) ?? [];
  const currentPage = Math.min(menuPage, Math.max(1, Math.ceil(filteredItems.length / menuPageSize)));
  const visibleIds = new Set(filteredItems.slice((currentPage - 1) * menuPageSize, currentPage * menuPageSize).map((i) => i.id));

  const loadMenu = useCallback(async () => {
    setMenuError("");
    try { setMenu(await adminApi<Menu>("/api/staff/menus")); }
    catch { setMenuError("Menu belum dapat dimuat. Coba lagi."); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMenu(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMenu]);

  // Restore draft from sessionStorage
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Draft;
          if (typeof parsed.customerName === "string" && Array.isArray(parsed.cart) && typeof parsed.key === "string") {
            setDraft(parsed);
          }
        }
      } catch { /* ignore */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  function editDraft(changes: Partial<Draft>) {
    if (manualInFlight.current || draft.uncertain) return;
    const next = { ...draft, ...changes, key: changes.key ?? (draft.key || randomId()) };
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualInFlight.current) return;
    if (!draft.cart.length) { setError("Pilih setidaknya satu menu."); return; }
    if (!tableOccupied && !draft.customerName.trim()) {
      setError("Nama pelanggan wajib diisi untuk meja kosong.");
      return;
    }
    const key = draft.key || randomId();
    // For occupied tables, customerName is optional (backend defaults to previous customer name or "Kasir")
    const payload = {
      clientRequestKey: key,
      ...(draft.customerName.trim() ? { customerName: draft.customerName.trim() } : {}),
      note: draft.note.trim() || undefined,
      items: draft.cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity, note: item.note.trim() })),
    };
    manualInFlight.current = true;
    setDraft({ ...draft, key, uncertain: true });
    sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, key, uncertain: true }));
    setBusy(true); setError("");
    try {
      await adminApi(`/api/staff/tables/${tableId}/orders`, {
        ...jsonRequest("POST", payload),
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      });
      sessionStorage.removeItem(storageKey);
      onSuccess();
    } catch (cause) {
      if (cause instanceof AdminApiError && ["MENU_UNAVAILABLE", "VALIDATION_ERROR", "TABLE_RESERVED", "TABLE_NOT_FOUND"].includes(cause.code)) {
        const editable = { ...draft, key, uncertain: false };
        setDraft(editable); sessionStorage.setItem(storageKey, JSON.stringify(editable));
      }
      setError(cause instanceof AdminApiError && cause.code === "MENU_UNAVAILABLE"
        ? "Menu berubah. Periksa ketersediaan sebelum mencoba lagi."
        : "Belum dapat memastikan pesanan tersimpan. Coba lagi tanpa mengubah isian.");
    } finally { manualInFlight.current = false; setBusy(false); }
  }

  const cartTotal = cartSubtotal(draft.cart);

  return (
    <ConfirmationDialog titleId="manual-order-title" busy={busy} onClose={onClose} className="pos-manual-order-dialog">
      <div className="pos-manual-order-head">
        <h2 id="manual-order-title">{t("Tambah order")} · {t("Meja {0}", { "0": tableNumber })}</h2>
        <Button type="button" className="text-button" onClick={onClose}>{t("Batal")}</Button>
      </div>
      <p className="muted pos-manual-order-hint">
        {tableOccupied
          ? t("Tambah pesanan baru ke sesi aktif meja ini.")
          : t("Meja kosong — sesi baru akan dibuat. Masukkan nama pelanggan.")}
      </p>
      <form className="pos-manual-order-form" onSubmit={(e) => void submit(e)}>
        {draft.uncertain && (
          <Alert className="inline-alert info">{t("Pengiriman pesanan sebelumnya belum pasti. Coba lagi sebelum mengubah pesanan.")}</Alert>
        )}
        <fieldset disabled={busy || draft.uncertain}>
          {/* Customer name: only shown/required for empty (unoccupied) tables */}
          {!tableOccupied && (
            <label className="field-label">
              {t("Nama pelanggan")}
              <Input
                className="text-field"
                required
                maxLength={120}
                placeholder={t("Nama pelanggan")}
                value={draft.customerName}
                onChange={(e) => editDraft({ customerName: e.target.value })}
              />
            </label>
          )}
          <label className="field-label">
            {t("Catatan order (opsional)")}
            <Input
              className="text-field"
              maxLength={500}
              value={draft.note}
              onChange={(e) => editDraft({ note: e.target.value })}
            />
          </label>

          <div className="pos-manual-order-search">
            <label className="field-label">
              {t("Cari menu")}
              <Input
                className="text-field"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setMenuPage(1); }}
                placeholder={t("Nama menu")}
              />
            </label>
          </div>

          {!menu
            ? menuError
              ? <Alert>{t(menuError)} <Button type="button" className="text-button" onClick={() => void loadMenu()}>{t("Coba lagi")}</Button></Alert>
              : <LoadingState variant="menu">{t("Memuat menu…")}</LoadingState>
            : menu.categories.map((category) => {
              const listed = category.items.filter((item) => visibleIds.has(item.id));
              if (!listed.length) return null;
              return (
                <div key={category.id} className="pos-menu-group">
                  <h3>{category.name}</h3>
                  <div className="menu-grid">
                    {listed.map((item) => {
                      const sel = draft.cart.find((e) => e.id === item.id);
                      const cartItem: CartItem = { id: item.id, name: item.name, priceIdr: item.priceIdr, quantity: sel?.quantity ?? 0, note: sel?.note ?? "" };
                      return (
                        <MenuCard key={item.id} menu={item} category={category.name} className="pos-menu-card">
                          <div className="pos-card-actions">
                            <div className="stepper" role="group" aria-label={t("Jumlah {0}", { "0": item.name })}>
                              <Button type="button" aria-label={t("Kurangi {0}", { "0": item.name })} disabled={!sel || cartItem.quantity <= 0} onClick={() => editDraft({ cart: updateCart(draft.cart, cartItem, cartItem.quantity - 1) })}>−</Button>
                              <span className="stepper-value">{cartItem.quantity}</span>
                              <Button type="button" aria-label={t("Tambah {0}", { "0": item.name })} disabled={cartItem.quantity >= 99} onClick={() => editDraft({ cart: updateCart(draft.cart, cartItem, cartItem.quantity + 1) })}>+</Button>
                            </div>
                            <Button type="button" className="primary-button pos-add-cart-btn" disabled={cartItem.quantity >= 99} onClick={() => editDraft({ cart: updateCart(draft.cart, cartItem, cartItem.quantity + 1) })}>
                              {t("Tambah")}
                            </Button>
                          </div>
                        </MenuCard>
                      );
                    })}
                  </div>
                </div>
              );
            })
          }
          {menu && (
            <Pagination
              pageSize={menuPageSize}
              onPageSizeChange={setMenuPageSize}
              page={currentPage}
              hasNext={currentPage * menuPageSize < filteredItems.length}
              total={filteredItems.length}
              onChange={setMenuPage}
            />
          )}

          {draft.cart.length > 0 && (
            <div className="pos-manual-order-summary">
              <h3>{t("Keranjang")}</h3>
              {draft.cart.map((item) => (
                <div className="pos-manual-order-row" key={item.id}>
                  <div className="pos-manual-order-row-head">
                    <strong>{item.quantity}× {item.name}</strong>
                    <span>{money(BigInt(item.priceIdr) * BigInt(item.quantity))}</span>
                  </div>
                  <Input
                    className="text-field cart-note"
                    aria-label={t("Catatan {0}", { "0": item.name })}
                    maxLength={500}
                    placeholder={t("Catatan item (opsional)")}
                    value={item.note}
                    onChange={(e) => editDraft({ cart: draft.cart.map((entry) => entry.id === item.id ? { ...entry, note: e.target.value } : entry) })}
                  />
                </div>
              ))}
              <div className="pos-manual-order-total">
                <span>{t("Subtotal")}</span>
                <strong>{money(cartTotal)}</strong>
              </div>
            </div>
          )}

          {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
        </fieldset>

        <div className="pos-manual-order-footer">
          <Button type="button" className="secondary-button" onClick={onClose}>{t("Batal")}</Button>
          <Button className="primary-button" disabled={busy || !draft.cart.length || !menu}>
            {busy ? t("Menyimpan…") : draft.uncertain ? t("Coba Lagi dengan Aman") : t("Simpan Pesanan")}
          </Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}
