"use client";

import { useLocale } from "@/components/locale-provider";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { cartSubtotal, type CartItem } from "@/lib/customer/cart";
import { randomId } from "@/lib/random-id";
import { usePagination } from "@/lib/use-pagination";
import { Alert, Button, LoadingState, Input, Pagination } from "@/components/ui/controls";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  MinusIcon,
  XIcon,
  TrashIcon,
  ForkKnifeIcon,
  ShoppingCartIcon,
} from "@phosphor-icons/react";
import "./pos-manual-order-modal.css";
import { resolveMenuImage } from "@/lib/menu-images";

type Menu = {
  categories: {
    id: string;
    name: string;
    items: {
      id: string;
      name: string;
      description: string | null;
      imageUrl: string | null;
      priceIdr: string;
    }[];
  }[];
};

type Draft = {
  customerName: string;
  note: string;
  cart: CartItem[];
  key: string;
  uncertain?: boolean;
};

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
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const storageKey = `pos-manual:${tableId}`;
  const manualInFlight = useRef(false);

  const {
    page: menuPage,
    setPage: setMenuPage,
    pageSize: menuPageSize,
    setPageSize: setMenuPageSize,
  } = usePagination();

  const loadMenu = useCallback(async () => {
    setMenuError("");
    try {
      setMenu(await adminApi<Menu>("/api/staff/menus"));
    } catch {
      setMenuError("Menu belum dapat dimuat. Coba lagi.");
    }
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
          if (
            typeof parsed.customerName === "string" &&
            Array.isArray(parsed.cart) &&
            typeof parsed.key === "string"
          ) {
            setDraft(parsed);
          }
        }
      } catch {
        /* ignore invalid stored draft */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  function editDraft(changes: Partial<Draft>) {
    if (manualInFlight.current) return;
    const next = { ...draft, ...changes, uncertain: false, key: changes.key ?? (draft.key || randomId()) };
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  }

  // Filter items by category and search query
  const allCategoryItems =
    menu?.categories.flatMap((cat) =>
      selectedCategory === "ALL" || selectedCategory === cat.id ? cat.items : []
    ) ?? [];

  const searchQuery = search.trim().toLocaleLowerCase("id-ID");
  const filteredItems = searchQuery
    ? allCategoryItems.filter((item) =>
        item.name.toLocaleLowerCase("id-ID").includes(searchQuery)
      )
    : allCategoryItems;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / menuPageSize));
  const currentPage = Math.min(menuPage, totalPages);
  const displayedItems = filteredItems.slice(
    (currentPage - 1) * menuPageSize,
    currentPage * menuPageSize
  );

  const totalQuantity = draft.cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartSubtotal(draft.cart);

  async function submit(event?: FormEvent) {
    if (event) event.preventDefault();
    if (manualInFlight.current) return;
    if (!draft.cart.length) {
      setError("Pilih setidaknya satu menu untuk dipesan.");
      return;
    }
    if (!tableOccupied && !draft.customerName.trim()) {
      setError("Nama pelanggan wajib diisi untuk meja kosong.");
      return;
    }

    const key = draft.key || randomId();
    const payload = {
      clientRequestKey: key,
      ...(draft.customerName.trim() ? { customerName: draft.customerName.trim() } : {}),
      note: draft.note.trim() || undefined,
      items: draft.cart.map((item) => ({
        menuItemId: item.id,
        quantity: item.quantity,
        note: item.note.trim(),
      })),
    };

    manualInFlight.current = true;
    setDraft({ ...draft, key, uncertain: true });
    sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, key, uncertain: true }));
    setBusy(true);
    setError("");

    try {
      await adminApi(`/api/staff/tables/${tableId}/orders`, {
        ...jsonRequest("POST", payload),
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      });
      sessionStorage.removeItem(storageKey);
      onSuccess();
    } catch (cause) {
      let message = "Belum dapat memastikan pesanan tersimpan. Coba lagi.";
      let newKey = key;

      if (cause instanceof AdminApiError) {
        if (cause.code === "MENU_UNAVAILABLE") {
          message = "Menu berubah. Periksa ketersediaan sebelum mencoba lagi.";
        } else if (cause.code === "IDEMPOTENCY_KEY_REUSED") {
          message = "Kunci pesanan telah digunakan. Kunci baru telah disiapkan, silakan klik simpan kembali.";
          newKey = randomId();
        } else if (cause.code === "SESSION_NOT_ACTIVE") {
          message = "Sesi meja ini tidak aktif. Silakan segarkan halaman.";
        } else if (cause.code === "TABLE_RESERVED") {
          message = "Meja masih dalam status reservasi. Lakukan check-in terlebih dahulu.";
        } else if (cause.code === "VALIDATION_ERROR") {
          message = cause.message || "Data pesanan tidak valid. Periksa kembali isian.";
        } else if (cause.message) {
          message = cause.message;
        }
      }

      const editable = { ...draft, key: newKey, uncertain: false };
      setDraft(editable);
      sessionStorage.setItem(storageKey, JSON.stringify(editable));
      setError(message);
    } finally {
      manualInFlight.current = false;
      setBusy(false);
    }
  }

  function handleClose() {
    if (draft.uncertain) {
      const reset = { ...draft, uncertain: false };
      sessionStorage.setItem(storageKey, JSON.stringify(reset));
      setDraft(reset);
    }
    onClose();
  }

  return (
    <ConfirmationDialog
      titleId="manual-order-title"
      busy={busy}
      onClose={handleClose}
      className="pos-order-modal-dialog"
    >
      <div className="pos-order-modal">
        {/* Modal Header */}
        <header className="pos-order-modal-header">
          <div className="pos-order-modal-title-wrap">
            <span className="pos-order-table-pill">
              {t("Meja {0}", { "0": tableNumber })}
            </span>
            <h2 id="manual-order-title">{t("Order Manual")}</h2>
            <span
              className={`pos-order-session-tag ${
                tableOccupied ? "occupied" : "available"
              }`}
            >
              {tableOccupied ? t("Sesi Aktif") : t("Sesi Baru")}
            </span>
          </div>

          <div className="pos-order-header-actions">
            {totalQuantity > 0 && (
              <span className="pos-order-count-badge">
                <ShoppingCartIcon size={14} weight="bold" />
                {totalQuantity} {t("item")}
              </span>
            )}
            <Button
              type="button"
              className="text-button pos-order-close-btn"
              onClick={handleClose}
              aria-label={t("Tutup")}
            >
              <XIcon size={18} weight="bold" />
            </Button>
          </div>
        </header>

        {/* Modal Body: 2-Column Split */}
        <div className="pos-order-modal-body">
          {/* Left Column: Menu Catalog */}
          <section className="pos-order-catalog">
            {/* Search & Category Filter Toolbar */}
            <div className="pos-order-toolbar">
              <div className="pos-order-search-box">
                <MagnifyingGlassIcon size={16} className="pos-order-search-icon" />
                <Input
                  className="text-field pos-order-search-input"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setMenuPage(1);
                  }}
                  placeholder={t("Cari nama menu...")}
                />
                {search && (
                  <Button
                    type="button"
                    className="text-button pos-order-search-clear"
                    onClick={() => setSearch("")}
                    aria-label={t("Hapus pencarian")}
                  >
                    <XIcon size={14} />
                  </Button>
                )}
              </div>

              {menu && menu.categories.length > 0 && (
                <div
                  className="pos-order-category-pills"
                  role="tablist"
                  aria-label={t("Kategori menu")}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedCategory === "ALL"}
                    className={`pos-order-pill-btn ${
                      selectedCategory === "ALL" ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setSelectedCategory("ALL");
                      setMenuPage(1);
                    }}
                  >
                    {t("Semua")}
                  </button>
                  {menu.categories.map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      role="tab"
                      aria-selected={selectedCategory === cat.id}
                      className={`pos-order-pill-btn ${
                        selectedCategory === cat.id ? "is-active" : ""
                      }`}
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setMenuPage(1);
                      }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Menu Items Grid */}
            <div className="pos-order-catalog-content">
              {!menu ? (
                menuError ? (
                  <Alert className="inline-alert error">
                    {t(menuError)}{" "}
                    <Button
                      type="button"
                      className="text-button"
                      onClick={() => void loadMenu()}
                    >
                      {t("Coba lagi")}
                    </Button>
                  </Alert>
                ) : (
                  <LoadingState variant="menu">{t("Memuat menu…")}</LoadingState>
                )
              ) : filteredItems.length === 0 ? (
                <div className="pos-order-catalog-empty">
                  <ForkKnifeIcon size={32} weight="light" />
                  <p>
                    {search
                      ? t('Menu "{0}" tidak ditemukan', { "0": search })
                      : t("Tidak ada menu dalam kategori ini.")}
                  </p>
                </div>
              ) : (
                <div className="pos-order-grid">
                  {displayedItems.map((item) => {
                    const inCart = draft.cart.find((c) => c.id === item.id);
                    const quantity = inCart?.quantity ?? 0;
                    const imageSrc = resolveMenuImage(item.imageUrl, item.name);
                    return (
                      <div
                        key={item.id}
                        className={`pos-menu-tile ${quantity > 0 ? "in-cart" : ""}`}
                        onClick={() => {
                          if (quantity === 0) {
                            editDraft({
                              cart: updateCart(
                                draft.cart,
                                {
                                  id: item.id,
                                  name: item.name,
                                  priceIdr: item.priceIdr,
                                  quantity: 1,
                                  note: "",
                                },
                                1
                              ),
                            });
                          }
                        }}
                      >
                        {imageSrc && (
                          <div className="pos-menu-tile-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imageSrc} alt={item.name} loading="lazy" />
                          </div>
                        )}
                        <div className="pos-menu-tile-details">
                          <div className="pos-menu-tile-name" title={item.name}>
                            {item.name}
                          </div>
                          <div className="pos-menu-tile-price">{money(item.priceIdr)}</div>
                        </div>

                        {quantity > 0 ? (
                          <div
                            className="pos-menu-tile-stepper"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="pos-tile-stepper-btn"
                              aria-label={t("Kurangi {0}", { "0": item.name })}
                              onClick={() =>
                                editDraft({
                                  cart: updateCart(
                                    draft.cart,
                                    {
                                      id: item.id,
                                      name: item.name,
                                      priceIdr: item.priceIdr,
                                      quantity,
                                      note: inCart?.note ?? "",
                                    },
                                    quantity - 1
                                  ),
                                })
                              }
                            >
                              <MinusIcon size={12} weight="bold" />
                            </button>
                            <span className="pos-tile-stepper-val">{quantity}</span>
                            <button
                              type="button"
                              className="pos-tile-stepper-btn"
                              aria-label={t("Tambah {0}", { "0": item.name })}
                              onClick={() =>
                                editDraft({
                                  cart: updateCart(
                                    draft.cart,
                                    {
                                      id: item.id,
                                      name: item.name,
                                      priceIdr: item.priceIdr,
                                      quantity,
                                      note: inCart?.note ?? "",
                                    },
                                    quantity + 1
                                  ),
                                })
                              }
                            >
                              <PlusIcon size={12} weight="bold" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="pos-menu-tile-add"
                            aria-label={t("Tambah {0}", { "0": item.name })}
                          >
                            <PlusIcon size={14} weight="bold" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            {menu && filteredItems.length > menuPageSize && (
              <footer className="pos-order-catalog-footer">
                <Pagination
                  pageSize={menuPageSize}
                  onPageSizeChange={setMenuPageSize}
                  page={currentPage}
                  hasNext={currentPage * menuPageSize < filteredItems.length}
                  total={filteredItems.length}
                  onChange={setMenuPage}
                />
              </footer>
            )}
          </section>

          {/* Right Column: Order Drawer & Cart Summary */}
          <aside className="pos-order-drawer">
            <div className="pos-order-drawer-top">
              <div className="pos-order-drawer-title-row">
                <h3>{t("Keranjang Pesanan")}</h3>
                <span className="pos-order-drawer-badge">
                  {draft.cart.length} {t("menu")}
                </span>
              </div>

              {/* Form fields */}
              <div className="pos-order-drawer-fields">
                {!tableOccupied ? (
                  <label className="pos-drawer-field">
                    <span className="pos-drawer-field-label">
                      {t("Nama Pelanggan")} <span className="danger-text">*</span>
                    </span>
                    <Input
                      className="text-field pos-drawer-input"
                      required
                      maxLength={120}
                      placeholder={t("Contoh: Budi, Meja 1")}
                      value={draft.customerName}
                      onChange={(e) => editDraft({ customerName: e.target.value })}
                    />
                  </label>
                ) : (
                  <div className="pos-drawer-session-info">
                    <span className="pos-drawer-session-dot" />
                    <span>{t("Sesi Aktif · Pelanggan terhubung")}</span>
                  </div>
                )}

                <label className="pos-drawer-field">
                  <span className="pos-drawer-field-label">
                    {t("Catatan Order (opsional)")}
                  </span>
                  <Input
                    className="text-field pos-drawer-input"
                    maxLength={500}
                    placeholder={t("Catatan pesanan...")}
                    value={draft.note}
                    onChange={(e) => editDraft({ note: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {/* Scrollable Cart Item List */}
            <div className="pos-order-cart-scroll">
              {draft.cart.length === 0 ? (
                <div className="pos-order-cart-empty-state">
                  <ShoppingCartIcon size={28} weight="light" />
                  <p>{t("Keranjang masih kosong")}</p>
                  <small>
                    {t("Klik menu di katalog sebelah kiri untuk memilih item.")}
                  </small>
                </div>
              ) : (
                <div className="pos-order-cart-list">
                  {draft.cart.map((item) => (
                    <div key={item.id} className="pos-order-cart-card">
                      <div className="pos-cart-card-header">
                        <span className="pos-cart-card-name">{item.name}</span>
                        <span className="pos-cart-card-total">
                          {money(BigInt(item.priceIdr) * BigInt(item.quantity))}
                        </span>
                      </div>
                      <div className="pos-cart-card-middle">
                        <span className="pos-cart-card-price">
                          {money(item.priceIdr)}
                        </span>
                        <div className="pos-cart-card-stepper">
                          <button
                            type="button"
                            className="pos-cart-stepper-btn"
                            onClick={() =>
                              editDraft({
                                cart: updateCart(draft.cart, item, item.quantity - 1),
                              })
                            }
                            aria-label={t("Kurangi")}
                          >
                            <MinusIcon size={11} weight="bold" />
                          </button>
                          <span className="pos-cart-stepper-val">{item.quantity}</span>
                          <button
                            type="button"
                            className="pos-cart-stepper-btn"
                            onClick={() =>
                              editDraft({
                                cart: updateCart(draft.cart, item, item.quantity + 1),
                              })
                            }
                            aria-label={t("Tambah")}
                          >
                            <PlusIcon size={11} weight="bold" />
                          </button>
                          <button
                            type="button"
                            className="pos-cart-remove-btn"
                            onClick={() =>
                              editDraft({
                                cart: updateCart(draft.cart, item, 0),
                              })
                            }
                            title={t("Hapus")}
                            aria-label={t("Hapus {0}", { "0": item.name })}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      </div>
                      <Input
                        className="text-field pos-cart-card-note"
                        maxLength={200}
                        placeholder={t("Catatan (cth: jangan pedas)...")}
                        value={item.note}
                        onChange={(e) =>
                          editDraft({
                            cart: draft.cart.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, note: e.target.value }
                                : entry
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Bottom Actions */}
            <div className="pos-order-drawer-bottom">
              {error && <Alert className="inline-alert error">{t(error)}</Alert>}
              {draft.uncertain && (
                <Alert className="inline-alert info">
                  {t("Pengiriman sebelumnya belum pasti. Coba lagi.")}
                </Alert>
              )}

              <div className="pos-order-bill-summary">
                <div className="pos-bill-line">
                  <span>{t("Total Item")}</span>
                  <span>{totalQuantity}</span>
                </div>
                <div className="pos-bill-total-line">
                  <span>{t("Total")}</span>
                  <strong>{money(cartTotal)}</strong>
                </div>
              </div>

              <div className="pos-order-actions-row">
                <Button
                  type="button"
                  className="secondary-button pos-order-cancel-btn"
                  disabled={busy}
                  onClick={handleClose}
                >
                  {t("Batal")}
                </Button>
                <Button
                  type="button"
                  className="primary-button pos-order-submit-btn"
                  disabled={busy || draft.cart.length === 0}
                  onClick={(e) => void submit(e)}
                >
                  {busy
                    ? t("Menyimpan…")
                    : draft.uncertain
                    ? t("Coba Lagi")
                    : t("Simpan Pesanan")}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </ConfirmationDialog>
  );
}
