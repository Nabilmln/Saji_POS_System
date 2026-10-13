"use client";

import { StatusBadge } from "@/components/ui/status-badge";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { Photo } from "@/components/ui/photo";
import { Selection, Pagination, Alert, Panel, Button, Input, Textarea, EmptyState } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { formatIdr } from "@/lib/customer/cart";

type Category = { id: string; name: string; sortOrder: number; isActive: boolean; menuCount: number };
type Menu = { id: string; categoryId: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string; isAvailable: boolean };
type MenuList = { items: Menu[]; total: number; page: number; pageSize: number };
type MenuDraft = { categoryId: string; name: string; description: string; imageUrl: string; priceIdr: string; isAvailable: boolean };
const emptyMenu: MenuDraft = { categoryId: "", name: "", description: "", imageUrl: "", priceIdr: "", isAvailable: true };
const emptyCategory = { name: "", sortOrder: 0, isActive: true };

export function MenuManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [list, setList] = useState<MenuList | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availability, setAvailability] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<MenuDraft>(emptyMenu);
  const [categoryEditing, setCategoryEditing] = useState<string | "new" | null>(null);
  const [categoryDraft, setCategoryDraft] = useState(emptyCategory);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const reload = () => setRevision((value) => value + 1);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search.trim()) query.set("q", search.trim());
    if (categoryFilter) query.set("categoryId", categoryFilter);
    if (availability) query.set("available", availability);
    const [nextCategories, nextList] = await Promise.all([
      adminApi<Category[]>("/api/admin/categories"),
      adminApi<MenuList>(`/api/admin/menus?${query}`),
    ]);
    return { nextCategories, nextList };
  }, [page, search, categoryFilter, availability]);

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
    setEditing(item?.id ?? "new");
    setDraft(item ? {
      categoryId: item.categoryId, name: item.name, description: item.description ?? "",
      imageUrl: item.imageUrl ?? "", priceIdr: item.priceIdr, isAvailable: item.isAvailable,
    } : { ...emptyMenu, categoryId: categories.find((category) => category.isActive)?.id ?? "" });
    setError(""); setNotice(""); setFields({});
  }

  async function saveMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setFields({});
    const body = {
      categoryId: draft.categoryId, name: draft.name.trim(), description: draft.description.trim() || null,
      imageUrl: draft.imageUrl.trim() || null, priceIdr: draft.priceIdr.trim(), isAvailable: draft.isAvailable,
    };
    try {
      await adminApi<Menu>(editing === "new" ? "/api/admin/menus" : `/api/admin/menus/${editing}`,
        jsonRequest(editing === "new" ? "POST" : "PATCH", body));
      setEditing(null); setNotice("Menu berhasil disimpan."); reload();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError) setFields(cause.fields ?? {});
    } finally { setBusy(false); }
  }

  async function toggleMenu(item: Menu) {
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Menu>(`/api/admin/menus/${item.id}/availability`, jsonRequest("PATCH", { isAvailable: !item.isAvailable }));
      setNotice(`Menu ${item.name} ${item.isAvailable ? "dinonaktifkan" : "diaktifkan"}.`); reload();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function archiveMenu(item: Menu) {
    if (!window.confirm(`Arsipkan menu "${item.name}"? Menu akan hilang dari katalog pelanggan, tetapi riwayat pesanan tetap tersimpan.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<unknown>(`/api/admin/menus/${item.id}`, { method: "DELETE" });
      setNotice(`Menu ${item.name} diarsipkan.`); reload();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function beginCategory(category?: Category) {
    setCategoryEditing(category?.id ?? "new");
    setCategoryDraft(category ? { name: category.name, sortOrder: category.sortOrder, isActive: category.isActive } : emptyCategory);
    setError(""); setNotice(""); setFields({});
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setFields({});
    try {
      await adminApi<Category>(categoryEditing === "new" ? "/api/admin/categories" : `/api/admin/categories/${categoryEditing}`,
        jsonRequest(categoryEditing === "new" ? "POST" : "PATCH", categoryDraft));
      setCategoryEditing(null); setNotice("Kategori berhasil disimpan."); reload();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError) setFields(cause.fields ?? {});
    } finally { setBusy(false); }
  }

  async function changeCategory(category: Category) {
    const action = category.isActive ? "Nonaktifkan" : "Aktifkan";
    if (!window.confirm(`${action} kategori "${category.name}"? ${category.isActive ? "Menu di kategori ini tidak akan tampil untuk pelanggan." : ""}`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Category>(`/api/admin/categories/${category.id}`, jsonRequest("PATCH", { isActive: !category.isActive }));
      setNotice(`Kategori ${category.name} ${category.isActive ? "dinonaktifkan" : "diaktifkan"}.`); reload();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Hapus kategori kosong "${category.name}" secara permanen?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<unknown>(`/api/admin/categories/${category.id}`, { method: "DELETE" });
      setNotice("Kategori dihapus."); reload();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const visibleCategories = categories.filter((category) => category.name.toLocaleLowerCase("id-ID").includes(categorySearch.toLocaleLowerCase("id-ID")));
  return <div className="admin-stack">
    <p className="section-intro">Kelola menu yang tampil di QR meja dan susun kategori katalog.</p>
    {notice && <Alert className="inline-alert info" role="status">{notice}</Alert>}
    {error && <Alert className="inline-alert" role="alert">{error}</Alert>}

    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>Daftar menu</h2></div><Button className="primary-button" disabled={busy || !categories.some((category) => category.isActive)} onClick={() => beginMenu()}>Tambah Menu</Button></div>
      {!categories.some((category) => category.isActive) && <p className="muted">Buat kategori aktif sebelum menambah menu.</p>}
      <div className="admin-filters">
        <label>Cari menu<Input className="text-field" type="search" maxLength={160} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nama menu" /></label>
        <Selection label="Kategori" kind="dropdown" value={categoryFilter} onChange={(value) => { setCategoryFilter(value); setPage(1); }} options={[{ value: "", label: "Semua kategori" }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
        <Selection label="Ketersediaan" value={availability} onChange={(value) => { setAvailability(value); setPage(1); }} options={[{ value: "", label: "Semua" }, { value: "true", label: "Tersedia" }, { value: "false", label: "Tidak tersedia" }]} />
      </div>
      {editing && <DetailPane><form className="admin-form" onSubmit={saveMenu}>
        <div className="admin-section-head"><h3>{editing === "new" ? "Menu baru" : "Edit menu"}</h3><Button className="text-button" type="button" onClick={() => setEditing(null)}>Tutup</Button></div>
        <div className="admin-form-grid">
          <label>Nama menu *<Input className="text-field" maxLength={160} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />{fields.name && <small className="field-error">{fields.name.join(", ")}</small>}</label>
          <div><Selection label="Kategori *" kind="dropdown" required value={draft.categoryId} onChange={(value) => setDraft({ ...draft, categoryId: value })} options={[{ value: "", label: "Pilih kategori", disabled: true }, ...categories.filter((category) => category.isActive || category.id === draft.categoryId).map((category) => ({ value: category.id, label: category.name }))]} />{fields.categoryId && <small className="field-error">{fields.categoryId.join(", ")}</small>}</div>
          <label>Harga (Rp) *<Input className="text-field" inputMode="numeric" pattern="(0|[1-9][0-9]*)" maxLength={16} required value={draft.priceIdr} onChange={(event) => setDraft({ ...draft, priceIdr: event.target.value })} />{fields.priceIdr && <small className="field-error">{fields.priceIdr.join(", ")}</small>}</label>
          <label>URL foto HTTPS<Input className="text-field" type="url" placeholder="https://..." value={draft.imageUrl} onChange={(event) => { setDraft({ ...draft, imageUrl: event.target.value }); }} />{fields.imageUrl && <small className="field-error">{fields.imageUrl.join(", ")}</small>}</label>
          <label className="admin-form-wide">Deskripsi<Textarea className="text-field" rows={3} maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />{fields.description && <small className="field-error">{fields.description.join(", ")}</small>}</label>
          <label className="check-row admin-form-wide"><Input type="checkbox" checked={draft.isAvailable} onChange={(event) => setDraft({ ...draft, isAvailable: event.target.checked })} />Tersedia untuk pelanggan</label>
        </div>
        {draft.imageUrl && <Photo src={draft.imageUrl} alt="Pratinjau foto menu" className="image-preview" />}
        <div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Menu"}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Batal</Button></div>
      </form></DetailPane>}
      {loading ? <p className="loading-block" role="status">Memuat menu…</p> : !list?.items.length ? <EmptyState className="empty-state"><h2>Menu tidak ditemukan</h2><p>Ubah pencarian atau tambahkan menu baru.</p></EmptyState> : <>
        <div className="admin-list">{list.items.map((item) => <article className="admin-list-row" key={item.id}>
          <Photo src={item.imageUrl} className="admin-menu-thumb" />
          <div className="admin-list-main"><strong>{item.name}</strong><p>{categoryName.get(item.categoryId) ?? "Kategori tidak aktif"} · {formatIdr(item.priceIdr)}</p></div>
          <StatusBadge status={item.isAvailable ? "AVAILABLE" : "INACTIVE"}>{item.isAvailable ? "Tersedia" : "Tidak tersedia"}</StatusBadge>
          <div className="admin-row-actions"><Button className="text-button" disabled={busy} onClick={() => beginMenu(item)}>Edit</Button><Button className="text-button" disabled={busy} onClick={() => void toggleMenu(item)}>{item.isAvailable ? "Nonaktifkan" : "Aktifkan"}</Button><Button className="text-button danger-text" disabled={busy} onClick={() => void archiveMenu(item)}>Arsipkan</Button></div>
        </article>)}</div>
        <Pagination page={page} hasNext={page * list.pageSize < list.total} onChange={setPage} />
      </>}
    </Panel>

    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>Kategori</h2></div><Button className="secondary-button" disabled={busy} onClick={() => beginCategory()}>Tambah Kategori</Button></div>
      <label className="category-search">Cari kategori<Input className="text-field" type="search" maxLength={120} value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Nama kategori" /></label>
      {categoryEditing && <form className="admin-form" onSubmit={saveCategory}>
        <div className="admin-section-head"><h3>{categoryEditing === "new" ? "Kategori baru" : "Edit kategori"}</h3><Button className="text-button" type="button" onClick={() => setCategoryEditing(null)}>Tutup</Button></div>
        <div className="admin-form-grid">
          <label>Nama kategori *<Input className="text-field" required maxLength={120} value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />{fields.name && <small className="field-error">{fields.name.join(", ")}</small>}</label>
          <label>Urutan<Input className="text-field" type="number" min={-2147483648} max={2147483647} required value={categoryDraft.sortOrder} onChange={(event) => setCategoryDraft({ ...categoryDraft, sortOrder: Number(event.target.value) })} /></label>
          <label className="check-row"><Input type="checkbox" checked={categoryDraft.isActive} onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })} />Kategori aktif</label>
        </div>
        <div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Kategori"}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => setCategoryEditing(null)}>Batal</Button></div>
      </form>}
      {!visibleCategories.length && !loading ? <EmptyState className="empty-state"><h2>{categories.length ? "Kategori tidak ditemukan" : "Belum ada kategori"}</h2><p>{categories.length ? "Coba nama kategori lain." : "Tambahkan kategori untuk menyusun menu."}</p></EmptyState> : <div className="admin-list">{visibleCategories.map((category) => <div className="admin-list-row" key={category.id}>
        <div className="admin-list-main"><strong>{category.name}</strong><p>Urutan {category.sortOrder} · {category.menuCount} menu</p></div>
        <StatusBadge status={category.isActive ? "ACTIVE" : "INACTIVE"} />
        <div className="admin-row-actions"><Button className="text-button" disabled={busy} onClick={() => beginCategory(category)}>Edit</Button><Button className="text-button" disabled={busy} onClick={() => void changeCategory(category)}>{category.isActive ? "Nonaktifkan" : "Aktifkan"}</Button>{category.menuCount === 0 && <Button className="text-button danger-text" disabled={busy} onClick={() => void deleteCategory(category)}>Hapus</Button>}</div>
      </div>)}</div>}
    </Panel>
  </div>;
}
