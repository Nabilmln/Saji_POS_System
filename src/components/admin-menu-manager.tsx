"use client";

import { useLocale } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";
import { useConfirmation } from "@/components/ui/confirmation";

import { StatusBadge } from "@/components/ui/status-badge";
import { CircleNotchIcon, MagnifyingGlassIcon, PlusIcon, TagIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { TableAction, TableActions } from "@/components/ui/data-table";
import { usePagination } from "@/lib/use-pagination";
import { Photo } from "@/components/ui/photo";
import { MenuCard } from "@/components/menu-card";
import { Section } from "@/components/ui/section";
import { Selection, Pagination, Alert, Button, Input, Textarea, EmptyState, LoadingState, Switch } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { MAX_MENU_IMAGE_BYTES, MENU_IMAGE_TYPES } from "@/lib/menu-images";


type Category = { id: string; name: string; sortOrder: number; isActive: boolean; menuCount: number };
type Menu = { id: string; categoryId: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string; isAvailable: boolean };
type MenuList = { items: Menu[]; total: number; page: number; pageSize: number };
type MenuDraft = { categoryId: string; name: string; description: string; imageUrl: string; priceIdr: string; isAvailable: boolean };
const emptyMenu: MenuDraft = { categoryId: "", name: "", description: "", imageUrl: "", priceIdr: "", isAvailable: true };
const emptyCategory = { name: "", sortOrder: 0, isActive: true };

export function MenuManager() {
  const { t } = useLocale();
  const [deleting, setDeleting] = useState<{ kind: "menu"; item: Menu } | { kind: "category"; item: Category } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [list, setList] = useState<MenuList | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availability, setAvailability] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<MenuDraft>(emptyMenu);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [draggingPhoto, setDraggingPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [categoryEditing, setCategoryEditing] = useState<string | "new" | null>(null);
  const [categoryDraft, setCategoryDraft] = useState(emptyCategory);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const setNotice = useNotice();
  const confirm = useConfirmation();
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const reload = () => setRevision((value) => value + 1);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("q", search.trim());
    if (categoryFilter) query.set("categoryId", categoryFilter);
    if (availability) query.set("available", availability);
    const [nextCategories, nextList] = await Promise.all([
      adminApi<Category[]>("/api/admin/categories"),
      adminApi<MenuList>(`/api/admin/menus?${query}`),
    ]);
    return { nextCategories, nextList };
  }, [page, pageSize, search, categoryFilter, availability]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      load().then(({ nextCategories, nextList }) => {
        if (!active) return;
        setCategories(nextCategories); setList(nextList); setLoading(false); setError("");
      }).catch((cause: Error) => { if (active) { setError(cause.message); setLoading(false); } });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load, revision, search]);

  function beginMenu(item?: Menu) {
    setCategoryEditing(null);
    setPhoto(null); setPhotoError(""); setDraggingPhoto(false);
    if (photoInput.current) photoInput.current.value = "";
    setEditing(item?.id ?? "new");
    setDraft(item ? {
      categoryId: categories.some((category) => category.id === item.categoryId) ? item.categoryId : "", name: item.name, description: item.description ?? "",
      imageUrl: item.imageUrl ?? "", priceIdr: item.priceIdr, isAvailable: item.isAvailable,
    } : { ...emptyMenu, categoryId: categories.find((category) => category.isActive)?.id ?? "" });
    setError(""); setNotice(""); setFields({});
  }

  function choosePhoto(file?: File) {
    setPhoto(null); setPhotoError("");
    if (photoInput.current) photoInput.current.value = "";
    if (!file) return;
    if (!MENU_IMAGE_TYPES.includes(file.type) || file.size === 0) { setPhotoError("Pilih foto JPG, PNG, atau WebP yang valid."); return; }
    if (file.size > MAX_MENU_IMAGE_BYTES) { setPhotoError("Ukuran foto maksimal 3 MB."); return; }
    setPhoto({ file, url: URL.createObjectURL(file) });
  }

  async function saveMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setUploadingPhoto(Boolean(photo)); setError(""); setNotice(""); setFields({});
    const body = {
      categoryId: draft.categoryId, name: draft.name.trim(), description: draft.description.trim() || null,
      imageUrl: draft.imageUrl.trim() || null, priceIdr: draft.priceIdr.trim(), isAvailable: draft.isAvailable,
    };
    try {
      if (photo) {
        const form = new FormData(); form.set("file", photo.file);
        const uploaded = await adminApi<{ imageUrl: string }>("/api/admin/menu-images", { method: "POST", body: form });
        setUploadingPhoto(false);
        body.imageUrl = uploaded.imageUrl;
        setDraft((current) => ({ ...current, imageUrl: uploaded.imageUrl }));
        setPhoto(null);
        if (photoInput.current) photoInput.current.value = "";
      }
      await adminApi<Menu>(editing === "new" ? "/api/admin/menus" : `/api/admin/menus/${editing}`,
        jsonRequest(editing === "new" ? "POST" : "PATCH", body));
      setEditing(null); setNotice({ text: "Menu berhasil disimpan.", subject: body.name }); reload();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError) setFields(cause.fields ?? {});
    } finally { setBusy(false); setUploadingPhoto(false); }
  }

  async function toggleMenu(item: Menu) {
    const nextAvailable = !item.isAvailable;
    setList((current) => current ? { ...current, items: current.items.map((m) => m.id === item.id ? { ...m, isAvailable: nextAvailable } : m) } : null);
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Menu>(`/api/admin/menus/${item.id}/availability`, jsonRequest("PATCH", { isAvailable: nextAvailable }));
      setNotice(statusNotice(item.name, nextAvailable ? "Tersedia" : "Tidak tersedia")); reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
    finally { setBusy(false); }
  }

  async function deleteMenu(item: Menu) {
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<unknown>(`/api/admin/menus/${item.id}`, { method: "DELETE" });
      setNotice({ text: "Menu {0} dihapus.", values: { 0: item.name } }); setEditing(null); if (list?.items.length === 1 && page > 1) setPage(page - 1); else reload();
    } catch (cause) { setError((cause as Error).message); throw cause; }
    finally { setBusy(false); }
  }

  function beginCategory(category?: Category) {
    setEditing(null);
    setCategoryEditing(category?.id ?? "new");
    setCategoryDraft(category ? { name: category.name, sortOrder: category.sortOrder, isActive: category.isActive } : emptyCategory);
    setError(""); setNotice(""); setFields({});
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setFields({});
    try {
      await adminApi<Category>(categoryEditing === "new" ? "/api/admin/categories" : `/api/admin/categories/${categoryEditing}`,
        jsonRequest(categoryEditing === "new" ? "POST" : "PATCH", categoryDraft));
      setCategoryEditing(null); setNotice({ text: "Kategori berhasil disimpan.", subject: categoryDraft.name }); reload();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError) setFields(cause.fields ?? {});
    } finally { setBusy(false); }
  }

  async function changeCategory(category: Category) {
    const action = category.isActive ? "Nonaktifkan" : "Aktifkan";
    if (!await confirm({ title: category.isActive ? "Nonaktifkan kategori?" : "Aktifkan kategori?", subject: category.name, description: category.isActive ? "Menu di kategori ini tidak akan tampil untuk pelanggan." : "Menu yang tersedia di kategori ini akan tampil untuk pelanggan.", confirmLabel: action })) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Category>(`/api/admin/categories/${category.id}`, jsonRequest("PATCH", { isActive: !category.isActive }));
      setNotice(statusNotice(category.name, category.isActive ? "Nonaktif" : "Aktif")); reload();
    } catch (cause) {
      setError((cause as Error).message);
    }
    finally { setBusy(false); }
  }

  async function deleteCategory(category: Category) {
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<unknown>(`/api/admin/categories/${category.id}`, { method: "DELETE" });
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setCategoryFilter((current) => current === category.id ? "" : current);
      setDraft((current) => current.categoryId === category.id ? { ...current, categoryId: "" } : current);
      if (categoryEditing === category.id) setCategoryEditing(null);
      setNotice({ text: "Kategori dihapus.", subject: category.name }); reload();
    } catch (cause) { setError((cause as Error).message); throw cause; }
    finally { setBusy(false); }
  }

  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const visibleCategories = categories.filter((category) => category.name.toLocaleLowerCase("id-ID").includes(categorySearch.toLocaleLowerCase("id-ID")));

  return <div className="admin-stack menu-manager">
    {/* <p className="section-intro">{t("Kelola menu yang tampil di QR meja dan susun kategori katalog.")}</p> */}

    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}

    <Section id="menu-categories" title={t("Kategori")} description={t("Susun kategori untuk memudahkan pelanggan menemukan menu.")} actions={<Button className="secondary-button" disabled={busy} onClick={() => beginCategory()}>{t("Tambah Kategori")}</Button>}>
      {categoryEditing && (
        <DetailPane revision={categoryEditing}>
          <form className="admin-form" onSubmit={saveCategory}>
            <div className="admin-section-head">
              <h3>{categoryEditing === "new" ? t("Kategori baru") : t("Edit kategori")}</h3>
              <Button className="text-button" type="button" onClick={() => setCategoryEditing(null)}>{t("Tutup")}</Button>
            </div>
            <fieldset className="admin-form-grid" disabled={busy} aria-label={t("Detail kategori")}>
              <label>
                {t("Nama kategori *")}
                <Input className="text-field" required maxLength={120} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />
                {fields.name && <small className="field-error">{fields.name.join(", ")}</small>}
              </label>
              <label>
                {t("Urutan")}
                <Input className="text-field" type="number" min={-2147483648} max={2147483647} required value={categoryDraft.sortOrder} onChange={(event) => setCategoryDraft({ ...categoryDraft, sortOrder: Number(event.target.value) })} />
              </label>
              <label className="check-row admin-form-wide">
                <Input type="checkbox" checked={categoryDraft.isActive} onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })} />
                {t("Kategori aktif")}
              </label>
            </fieldset>
            <div className="admin-actions">
              <Button className="primary-button" disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan Kategori")}</Button>
              <Button className="secondary-button" type="button" disabled={busy} onClick={() => setCategoryEditing(null)}>{t("Batal")}</Button>
            </div>
          </form>
        </DetailPane>
      )}

      {categories.length > 4 && (
        <div className="category-toolbar">
          <label className="category-search">
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <Input className="text-field" type="search" maxLength={120} value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder={t("Cari kategori…")} />
          </label>
        </div>
      )}

      {loading && !categories.length ? (
        <LoadingState variant="cards">{t("Memuat kategori…")}</LoadingState>
      ) : (
        <div className="category-grid" role="list" aria-label={t("Daftar kategori")}>
          {!visibleCategories.length && categories.length > 0 && (
            <p className="category-empty-msg">{t("Kategori tidak ditemukan")}</p>
          )}
          {visibleCategories.map((category) => (
            <article className={`category-card ${category.isActive ? "" : "is-inactive"}`.trim()} key={category.id} role="listitem">
              <div className="category-card-top">
                <span className="category-card-badge-wrap">
                  <TagIcon size={14} weight="fill" aria-hidden="true" />
                  <span className="category-card-order">#{category.sortOrder}</span>
                </span>
                <StatusBadge status={category.isActive ? "ACTIVE" : "INACTIVE"} />
              </div>
              <div className="category-card-center">
                <strong className="category-card-name" title={category.name}>{category.name}</strong>
                <span className="category-card-count">{t("{0} menu", { "0": category.menuCount })}</span>
              </div>
              <div className="category-card-divider" aria-hidden="true" />
              <div className="category-card-footer">
                <TableActions>
                  <TableAction action="edit" disabled={busy} onClick={() => beginCategory(category)} />
                  <TableAction action={category.isActive ? "deactivate" : "activate"} disabled={busy} onClick={() => void changeCategory(category)} />
                  <TableAction action="delete" disabled={busy} onClick={() => setDeleting({ kind: "category", item: category })} />
                </TableActions>
              </div>
            </article>
          ))}
          <button
            type="button"
            className="category-card category-add-card"
            disabled={busy}
            onClick={() => beginCategory()}
            aria-label={t("Tambah Kategori")}
          >
            <span className="category-add-icon"><PlusIcon size={20} weight="bold" aria-hidden="true" /></span>
            <strong>{t("Tambah Kategori")}</strong>
            <small>{t("Buat kategori baru")}</small>
          </button>
        </div>
      )}
    </Section>

    <div id="menu-filters" className="menu-filters" role="search">
      <label className="menu-search"><MagnifyingGlassIcon size={18} aria-hidden="true" /><Input className="text-field" type="search" maxLength={160} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("Cari menu")} /></label>
      <Selection label={t("Kategori")} kind="dropdown" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setPage(1); }} options={[{ value: "", label: t("Semua kategori") }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
      <Selection label={t("Ketersediaan")} value={availability} onChange={(value) => { setAvailability(value); setPage(1); }} options={[{ value: "", label: t("Semua") }, { value: "true", label: t("Tersedia") }, { value: "false", label: t("Tidak tersedia") }]} />
    </div>

    <Section id="menu-items" title={t("Daftar menu")} description={t("Kelola harga, foto, dan ketersediaan setiap menu.")} actions={<Button className="primary-button" disabled={busy || !categories.some((category) => category.isActive)} onClick={() => beginMenu()}>{t("Tambah Menu")}</Button>}>
      {!loading && !categories.some((category) => category.isActive) && <p className="muted">{t("Buat kategori aktif sebelum menambah menu.")}</p>}
      {editing && <DetailPane revision={editing}><form className="admin-form" onSubmit={saveMenu}>
        <div className="admin-section-head"><h3>{editing === "new" ? t("Menu baru") : t("Edit menu")}</h3><Button className="text-button" type="button" disabled={busy} onClick={() => { setEditing(null); setPhoto(null); }}>{t("Tutup")}</Button></div>
        {editing !== "new" && !draft.categoryId && <p className="muted">{t("Kategori sebelumnya telah dihapus. Pilih kategori aktif agar menu ini tampil lagi untuk pelanggan.")}</p>}
        <fieldset className="admin-form-grid menu-form-fields" disabled={busy} aria-label={t("Detail menu")}>
          <div className="admin-form-wide menu-photo-top-section">
            <span id="menu-photo-label" className="field-label-text">{t("Foto menu")}</span>
            {(photo || draft.imageUrl) ? (
              <div className="menu-photo-preview-card">
                <Photo src={photo?.url ?? draft.imageUrl} alt={t("Pratinjau foto menu")} className="menu-photo-preview-thumb" />
                <div className="menu-photo-preview-details">
                  {photo ? <strong className="menu-photo-filename">{photo.file.name}</strong> : <span className="muted">{t("Foto saat ini")}</span>}
                  <small className="muted">{t("JPG, PNG, atau WebP. Maksimal 3 MB.")}</small>
                  <div className="menu-photo-preview-actions">
                    <label className="secondary-button photo-replace-btn" aria-disabled={busy}>
                      {t("Ganti foto")}
                      <Input ref={photoInput} type="file" accept={MENU_IMAGE_TYPES.join(",")} className="visually-hidden" disabled={busy} onChange={(event) => choosePhoto(event.target.files?.[0])} />
                    </label>
                    <Button type="button" className="text-button danger-text" disabled={busy} onClick={() => { setPhoto(null); setPhotoError(""); setDraft({ ...draft, imageUrl: "" }); if (photoInput.current) photoInput.current.value = ""; }}>{t("Hapus foto")}</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="menu-photo-dropzone-wrap">
                <label className={`menu-photo-dropzone${draggingPhoto ? " is-dragging" : ""}`} aria-disabled={busy} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; if (!busy) setDraggingPhoto(true); }} onDragLeave={() => setDraggingPhoto(false)} onDrop={(event) => { event.preventDefault(); setDraggingPhoto(false); if (!busy && event.dataTransfer.files.length) choosePhoto(event.dataTransfer.files[0]); }}>
                  <UploadSimpleIcon size={24} weight="fill" aria-hidden="true" />
                  <span><strong>{t("Pilih foto")}</strong><small>{t("atau tarik dan lepas di sini")}</small></span>
                  <Input ref={photoInput} id="menu-photo" type="file" accept={MENU_IMAGE_TYPES.join(",")} aria-labelledby="menu-photo-label" aria-describedby="menu-photo-hint menu-photo-error" aria-invalid={!!photoError} onChange={(event) => choosePhoto(event.target.files?.[0])} />
                </label>
                <small id="menu-photo-hint" className="muted">{t("JPG, PNG, atau WebP. Maksimal 3 MB. Foto diunggah saat menu disimpan.")}</small>
              </div>
            )}
            <div className={`photo-upload-status${uploadingPhoto ? "" : " loading-label"}`} role="status" aria-atomic="true">{uploadingPhoto && <><CircleNotchIcon className="processing-spinner" size={18} weight="bold" aria-hidden="true" /><span>{t("Mengunggah foto…")}</span></>}</div>
            {photoError && <small id="menu-photo-error" className="field-error" role="alert">{t(photoError)}</small>}
            {fields.imageUrl && <small className="field-error">{fields.imageUrl.join(", ")}</small>}
          </div>
          <label>{t("Nama menu *")}<Input className="text-field" maxLength={160} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />{fields.name && <small className="field-error">{fields.name.join(", ")}</small>}</label>
          <div><Selection label={t("Kategori *")} kind="dropdown" required value={draft.categoryId} onChange={(value) => setDraft({ ...draft, categoryId: value })} options={[{ value: "", label: t("Pilih kategori"), disabled: true }, ...categories.filter((category) => category.isActive || category.id === draft.categoryId).map((category) => ({ value: category.id, label: category.name }))]} />{fields.categoryId && <small className="field-error">{fields.categoryId.join(", ")}</small>}</div>
          <label>{t("Harga (Rp) *")}<Input className="text-field" inputMode="numeric" pattern="(0|[1-9][0-9]*)" maxLength={16} required value={draft.priceIdr} onChange={(event) => setDraft({ ...draft, priceIdr: event.target.value })} />{fields.priceIdr && <small className="field-error">{fields.priceIdr.join(", ")}</small>}</label>
          <label className="admin-form-wide">{t("Deskripsi")}<Textarea className="text-field" rows={3} maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />{fields.description && <small className="field-error">{fields.description.join(", ")}</small>}</label>
          <label className="check-row admin-form-wide"><Input type="checkbox" checked={draft.isAvailable} onChange={(event) => setDraft({ ...draft, isAvailable: event.target.checked })} />{t("Tersedia untuk pelanggan")}</label>
        </fieldset>

        <div className="admin-actions"><Button className="primary-button" disabled={busy || !!photoError} aria-busy={busy}>{busy ? t("Menyimpan…") : t("Simpan Menu")}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => { setEditing(null); setPhoto(null); }}>{t("Batal")}</Button></div>
      </form></DetailPane>}
      {loading ? <LoadingState variant="menu">{t("Memuat menu…")}</LoadingState> : !list?.items.length ? <EmptyState className="empty-state"><h2>{t("Menu tidak ditemukan")}</h2><p>{t("Ubah pencarian atau tambahkan menu baru.")}</p></EmptyState> : <>
        <div className="admin-menu-grid">{list.items.map((item) => <MenuCard menu={item} category={categoryName.get(item.categoryId) ?? t("Kategori dihapus")} className="admin-list-row admin-menu-card" key={item.id} badge={<StatusBadge status={categoryName.has(item.categoryId) && item.isAvailable ? "AVAILABLE" : "INACTIVE"}>{!categoryName.has(item.categoryId) ? t("Pilih kategori") : item.isAvailable ? t("Tersedia") : t("Tidak tersedia")}</StatusBadge>}>
          <div className="admin-menu-card-actions">
            <TableActions><TableAction action="edit" disabled={busy} onClick={() => beginMenu(item)} /><TableAction action="delete" disabled={busy} onClick={() => setDeleting({ kind: "menu", item })} /></TableActions>
            <Switch label={t("Ketersediaan {0}", { "0": item.name })} checked={categoryName.has(item.categoryId) && item.isAvailable} showStateLabel={false} disabled={busy || !categoryName.has(item.categoryId)} onChange={() => void toggleMenu(item)} />
          </div>
        </MenuCard>)}</div>
        <Pagination label="Navigasi menu" pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={page * list.pageSize < list.total} total={list.total} onChange={setPage} disabled={busy || loading} />
      </>}
    </Section>
    {deleting && <ConfirmDelete name={deleting.item.name} description={t(deleting.kind === "menu" ? "Menu ini dihapus dari katalog. Riwayat pesanan dan penjualan tetap tersimpan." : "Kategori ini dihapus dari daftar. Menu di dalamnya tetap tersimpan dan perlu dipindahkan ke kategori aktif agar tampil lagi untuk pelanggan. Riwayat pesanan tetap tersimpan.")} onClose={() => setDeleting(null)} onConfirm={() => deleting.kind === "menu" ? deleteMenu(deleting.item) : deleteCategory(deleting.item)} />}
  </div>;
}
