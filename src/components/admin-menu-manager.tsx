"use client";

import { useLocale } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";

import { StatusBadge } from "@/components/ui/status-badge";
import { CircleNotchIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { DataTable } from "@/components/ui/data-table";
import { usePagination } from "@/lib/use-pagination";
import { Photo } from "@/components/ui/photo";
import { MenuCard } from "@/components/menu-card";
import { Section } from "@/components/ui/section";
import { Selection, Pagination, Alert, Button, Input, Textarea, EmptyState, LoadingState } from "@/components/ui/controls";
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
  const { page: categoryPage, setPage: setCategoryPage, pageSize: categoryPageSize, setPageSize: setCategoryPageSize } = usePagination();
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
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Menu>(`/api/admin/menus/${item.id}/availability`, jsonRequest("PATCH", { isAvailable: !item.isAvailable }));
      setNotice(statusNotice(item.name, item.isAvailable ? "Nonaktif" : "Aktif")); reload();
    } catch (cause) { setError((cause as Error).message); }
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
    if (!window.confirm(t("{0} kategori \"{1}\"? {2}", { "0": t(action), "1": category.name, "2": category.isActive ? t("Menu di kategori ini tidak akan tampil untuk pelanggan.") : "" }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Category>(`/api/admin/categories/${category.id}`, jsonRequest("PATCH", { isActive: !category.isActive }));
      setNotice(statusNotice(category.name, category.isActive ? "Nonaktif" : "Aktif")); reload();
    } catch (cause) { setError((cause as Error).message); }
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
  const currentCategoryPage = Math.min(categoryPage, Math.max(1, Math.ceil(visibleCategories.length / categoryPageSize)));
  return <div className="admin-stack">
    <p className="section-intro">{t("Kelola menu yang tampil di QR meja dan susun kategori katalog.")}</p>

    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}

    <Section id="menu-filters" title={t("Temukan menu")} description={t("Filter menu berdasarkan nama, kategori, dan ketersediaan.")}>
      <div className="admin-filters menu-filters">
        <label>{t("Cari menu")}<Input className="text-field" type="search" maxLength={160} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("Nama menu")} /></label>
        <Selection label={t("Kategori")} kind="dropdown" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setPage(1); }} options={[{ value: "", label: t("Semua kategori") }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
        <Selection label={t("Ketersediaan")} value={availability} onChange={(value) => { setAvailability(value); setPage(1); }} options={[{ value: "", label: t("Semua") }, { value: "true", label: t("Tersedia") }, { value: "false", label: t("Tidak tersedia") }]} />
      </div>
    </Section>
    <Section id="menu-items" title={t("Daftar menu")} description={t("Kelola harga, foto, dan ketersediaan setiap menu.")} actions={<Button className="primary-button" disabled={busy || !categories.some((category) => category.isActive)} onClick={() => beginMenu()}>{t("Tambah Menu")}</Button>}>
      {!loading && !categories.some((category) => category.isActive) && <p className="muted">{t("Buat kategori aktif sebelum menambah menu.")}</p>}
      {editing && <DetailPane><form className="admin-form" onSubmit={saveMenu}>
        <div className="admin-section-head"><h3>{editing === "new" ? t("Menu baru") : t("Edit menu")}</h3><Button className="text-button" type="button" disabled={busy} onClick={() => { setEditing(null); setPhoto(null); }}>{t("Tutup")}</Button></div>
        {editing !== "new" && !draft.categoryId && <p className="muted">{t("Kategori sebelumnya telah dihapus. Pilih kategori aktif agar menu ini tampil lagi untuk pelanggan.")}</p>}
        <fieldset className="admin-form-grid menu-form-fields" disabled={busy} aria-label={t("Detail menu")}>
          <label>{t("Nama menu *")}<Input className="text-field" maxLength={160} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />{fields.name && <small className="field-error">{fields.name.join(", ")}</small>}</label>
          <div><Selection label={t("Kategori *")} kind="dropdown" required value={draft.categoryId} onChange={(value) => setDraft({ ...draft, categoryId: value })} options={[{ value: "", label: t("Pilih kategori"), disabled: true }, ...categories.filter((category) => category.isActive || category.id === draft.categoryId).map((category) => ({ value: category.id, label: category.name }))]} />{fields.categoryId && <small className="field-error">{fields.categoryId.join(", ")}</small>}</div>
          <label>{t("Harga (Rp) *")}<Input className="text-field" inputMode="numeric" pattern="(0|[1-9][0-9]*)" maxLength={16} required value={draft.priceIdr} onChange={(event) => setDraft({ ...draft, priceIdr: event.target.value })} />{fields.priceIdr && <small className="field-error">{fields.priceIdr.join(", ")}</small>}</label>
          <div className="admin-form-wide menu-photo-upload">
            <span id="menu-photo-label">{t("Unggah foto menu")}</span>
            <label className={`menu-photo-dropzone${draggingPhoto ? " is-dragging" : ""}`} aria-disabled={busy} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; if (!busy) setDraggingPhoto(true); }} onDragLeave={() => setDraggingPhoto(false)} onDrop={(event) => { event.preventDefault(); setDraggingPhoto(false); if (!busy && event.dataTransfer.files.length) choosePhoto(event.dataTransfer.files[0]); }}>
              <UploadSimpleIcon size={24} aria-hidden="true" />
              <span><strong>{t("Pilih foto")}</strong><small>{t("atau tarik dan lepas di sini")}</small></span>
              <Input ref={photoInput} id="menu-photo" type="file" accept={MENU_IMAGE_TYPES.join(",")} aria-labelledby="menu-photo-label" aria-describedby="menu-photo-hint menu-photo-error" aria-invalid={!!photoError} onChange={(event) => choosePhoto(event.target.files?.[0])} />
            </label>
            <small id="menu-photo-hint" className="muted">{t("JPG, PNG, atau WebP. Maksimal 3 MB. Foto diunggah saat menu disimpan.")}</small>
            <div className={`photo-upload-status${uploadingPhoto ? "" : " loading-label"}`} role="status" aria-atomic="true">{uploadingPhoto && <><CircleNotchIcon className="processing-spinner" size={18} weight="bold" aria-hidden="true" /><span>{t("Mengunggah foto…")}</span></>}</div>
            {photo && <small className="menu-photo-filename">{photo.file.name}</small>}
            <small id="menu-photo-error" className="field-error" role={photoError ? "alert" : undefined}>{t(photoError)}</small>
            {fields.imageUrl && <small className="field-error">{fields.imageUrl.join(", ")}</small>}
            {(photo || photoError) && <Button type="button" className="text-button" onClick={() => { setPhoto(null); setPhotoError(""); if (photoInput.current) photoInput.current.value = ""; }}>{t("Batalkan pilihan foto")}</Button>}
          </div>
          <label className="admin-form-wide">{t("Deskripsi")}<Textarea className="text-field" rows={3} maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />{fields.description && <small className="field-error">{fields.description.join(", ")}</small>}</label>
          <label className="check-row admin-form-wide"><Input type="checkbox" checked={draft.isAvailable} onChange={(event) => setDraft({ ...draft, isAvailable: event.target.checked })} />{t("Tersedia untuk pelanggan")}</label>
        </fieldset>
        {(photo || draft.imageUrl) && <div className="menu-photo-preview"><Photo src={photo?.url ?? draft.imageUrl} alt={t("Pratinjau foto menu")} className="image-preview" /><Button type="button" className="text-button" disabled={busy} onClick={() => { setPhoto(null); setPhotoError(""); setDraft({ ...draft, imageUrl: "" }); if (photoInput.current) photoInput.current.value = ""; }}>{t("Hapus foto")}</Button></div>}
        <div className="admin-actions"><Button className="primary-button" disabled={busy || !!photoError} aria-busy={busy}>{busy ? t("Menyimpan…") : t("Simpan Menu")}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => { setEditing(null); setPhoto(null); }}>{t("Batal")}</Button></div>
      </form></DetailPane>}
      {loading ? <LoadingState variant="menu">{t("Memuat menu…")}</LoadingState> : !list?.items.length ? <EmptyState className="empty-state"><h2>{t("Menu tidak ditemukan")}</h2><p>{t("Ubah pencarian atau tambahkan menu baru.")}</p></EmptyState> : <>
        <div className="admin-menu-grid">{list.items.map((item) => <MenuCard menu={item} category={categoryName.get(item.categoryId) ?? t("Kategori dihapus")} className="admin-list-row admin-menu-card" key={item.id} badge={<StatusBadge status={categoryName.has(item.categoryId) && item.isAvailable ? "AVAILABLE" : "INACTIVE"}>{!categoryName.has(item.categoryId) ? t("Pilih kategori") : item.isAvailable ? t("Tersedia") : t("Tidak tersedia")}</StatusBadge>}>
          <div className="admin-row-actions"><Button className="text-button" disabled={busy} onClick={() => beginMenu(item)}>{t("Edit")}</Button><Button className="text-button" disabled={busy} onClick={() => void toggleMenu(item)}>{item.isAvailable ? t("Nonaktifkan") : t("Aktifkan")}</Button><Button className="text-button danger-text" disabled={busy} onClick={() => setDeleting({ kind: "menu", item })}>{t("Hapus")}</Button></div>
        </MenuCard>)}</div>
        <Pagination label="Navigasi menu" pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={page * list.pageSize < list.total} total={list.total} onChange={setPage} disabled={busy || loading} />
      </>}
    </Section>

    <Section id="menu-categories" title={t("Kategori")} description={t("Susun kategori untuk memudahkan pelanggan menemukan menu.")} actions={<Button className="secondary-button" disabled={busy} onClick={() => beginCategory()}>{t("Tambah Kategori")}</Button>}>
      <label className="category-search">{t("Cari kategori")}<Input className="text-field" type="search" maxLength={120} value={categorySearch} onChange={(event) => { setCategorySearch(event.target.value); setCategoryPage(1); }} placeholder={t("Nama kategori")} /></label>
      {categoryEditing && <form className="admin-form" onSubmit={saveCategory}>
        <div className="admin-section-head"><h3>{categoryEditing === "new" ? t("Kategori baru") : t("Edit kategori")}</h3><Button className="text-button" type="button" onClick={() => setCategoryEditing(null)}>{t("Tutup")}</Button></div>
        <div className="admin-form-grid">
          <label>{t("Nama kategori *")}<Input className="text-field" required maxLength={120} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />{fields.name && <small className="field-error">{fields.name.join(", ")}</small>}</label>
          <label>{t("Urutan")}<Input className="text-field" type="number" min={-2147483648} max={2147483647} required value={categoryDraft.sortOrder} onChange={(event) => setCategoryDraft({ ...categoryDraft, sortOrder: Number(event.target.value) })} /></label>
          <label className="check-row"><Input type="checkbox" checked={categoryDraft.isActive} onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })} />{t("Kategori aktif")}</label>
        </div>
        <div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan Kategori")}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => setCategoryEditing(null)}>{t("Batal")}</Button></div>
      </form>}
      {loading && !list ? <LoadingState variant="table">{t("Memuat menu…")}</LoadingState> : !visibleCategories.length ? <EmptyState className="empty-state"><h2>{categories.length ? t("Kategori tidak ditemukan") : t("Belum ada kategori")}</h2><p>{categories.length ? t("Coba nama kategori lain.") : t("Tambahkan kategori untuk menyusun menu.")}</p></EmptyState> : <DataTable caption={t("Kategori")} columns={[t("Nama kategori"), t("Urutan"), t("Jumlah menu"), t("Status"), t("Tindakan")]}>{visibleCategories.slice((currentCategoryPage - 1) * categoryPageSize, currentCategoryPage * categoryPageSize).map((category) => <tr key={category.id}>
        <th scope="row">{category.name}</th><td>{category.sortOrder}</td><td>{category.menuCount}</td><td><StatusBadge status={category.isActive ? "ACTIVE" : "INACTIVE"} /></td>
        <td><div className="admin-row-actions"><Button className="text-button" disabled={busy} onClick={() => beginCategory(category)}>{t("Edit")}</Button><Button className="text-button" disabled={busy} onClick={() => void changeCategory(category)}>{category.isActive ? t("Nonaktifkan") : t("Aktifkan")}</Button><Button className="text-button danger-text" disabled={busy} onClick={() => setDeleting({ kind: "category", item: category })}>{t("Hapus")}</Button></div></td>
      </tr>)}</DataTable>}
      <Pagination label="Navigasi kategori" pageSize={categoryPageSize} onPageSizeChange={setCategoryPageSize} page={currentCategoryPage} hasNext={currentCategoryPage * categoryPageSize < visibleCategories.length} total={visibleCategories.length} onChange={setCategoryPage} disabled={busy || loading} />
    </Section>
    {deleting && <ConfirmDelete name={deleting.item.name} description={t(deleting.kind === "menu" ? "Menu ini dihapus dari katalog. Riwayat pesanan dan penjualan tetap tersimpan." : "Kategori ini dihapus dari daftar. Menu di dalamnya tetap tersimpan dan perlu dipindahkan ke kategori aktif agar tampil lagi untuk pelanggan. Riwayat pesanan tetap tersimpan.")} onClose={() => setDeleting(null)} onConfirm={() => deleting.kind === "menu" ? deleteMenu(deleting.item) : deleteCategory(deleting.item)} />}
  </div>;
}
