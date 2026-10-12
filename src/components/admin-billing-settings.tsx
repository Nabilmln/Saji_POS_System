"use client";

import { useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { bpsToPercent, percentToBps } from "@/lib/admin/billing-preview";
import { calculateBill } from "@/lib/billing";
import { formatIdr } from "@/lib/customer/cart";

type Billing = {
  discountEnabled: boolean; discountAmountIdr: string; taxEnabled: boolean;
  taxRateBps: number; version: string; updatedAt: string;
};
type Draft = { discountEnabled: boolean; discountAmountIdr: string; taxEnabled: boolean; taxPercent: string };
function fromBilling(value: Billing): Draft {
  return { discountEnabled: value.discountEnabled, discountAmountIdr: value.discountAmountIdr,
    taxEnabled: value.taxEnabled, taxPercent: bpsToPercent(value.taxRateBps) };
}

export function BillingSettings() {
  const [applied, setApplied] = useState<Billing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    adminApi<Billing>("/api/admin/settings/billing")
      .then((value) => { if (active) { setApplied(value); setDraft(fromBilling(value)); setError(""); setConflict(false); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !applied || conflict) return;
    const rate = percentToBps(draft.taxPercent);
    if (!/^(0|[1-9]\d*)$/.test(draft.discountAmountIdr) || rate === null) {
      setError("Isi diskon dengan rupiah bulat dan pajak dengan persentase 0–100 (maksimal dua desimal)."); return;
    }
    if (!window.confirm("Simpan pengaturan? Perubahan akan memengaruhi tagihan meja yang belum lunas.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await adminApi<Billing>("/api/admin/settings/billing", jsonRequest("PUT", {
        expectedVersion: applied.version, discountEnabled: draft.discountEnabled,
        discountAmountIdr: draft.discountAmountIdr, taxEnabled: draft.taxEnabled, taxRateBps: rate,
      }));
      setApplied(value); setDraft(fromBilling(value)); setNotice("Pengaturan berhasil diterapkan pada tagihan yang belum lunas.");
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError && cause.code === "SETTINGS_CHANGED") setConflict(true);
    } finally { setBusy(false); }
  }

  const rate = draft ? percentToBps(draft.taxPercent) : null;
  const discountValid = Boolean(draft && /^(0|[1-9]\d*)$/.test(draft.discountAmountIdr));
  const preview = draft && rate !== null && discountValid ? calculateBill(100_000n, {
    discountEnabled: draft.discountEnabled, discountAmountIdr: BigInt(draft.discountAmountIdr),
    taxEnabled: draft.taxEnabled, taxRateBps: rate,
  }) : null;
  const changed = Boolean(draft && applied && (draft.discountEnabled !== applied.discountEnabled ||
    draft.discountAmountIdr !== applied.discountAmountIdr || draft.taxEnabled !== applied.taxEnabled ||
    rate !== applied.taxRateBps));

  return <div className="admin-stack">
    <p className="section-intro">Atur diskon nominal dan pajak. Nilai baru berlaku pada tagihan yang belum lunas saat dihitung ulang.</p>
    {notice && <div className="inline-alert info" role="status">{notice}</div>}
    {error && <div className="inline-alert" role="alert">{error} {conflict && <button className="text-button" onClick={() => { setRevision((value) => value + 1); setConflict(false); }}>Muat pengaturan terbaru</button>}</div>}
    {!draft || !applied ? <div className="loading-block" role="status">Memuat pengaturan…</div> : <form onSubmit={save} className="admin-settings-grid">
      <section className="admin-panel">
        <p className="eyebrow">A07 · TAGIHAN</p><h2>Pengaturan aktif</h2>
        <div className="settings-block"><label className="check-row"><input type="checkbox" checked={draft.discountEnabled} onChange={(event) => setDraft({ ...draft, discountEnabled: event.target.checked })} />Gunakan diskon</label>
          <p className="muted">Diskon tetap dalam rupiah, maksimal sebesar subtotal.</p>
          <label className="field-label" htmlFor="discount-amount">Jumlah diskon (Rp)</label>
          <input className="text-field" id="discount-amount" inputMode="numeric" pattern="(0|[1-9][0-9]*)" maxLength={16} required value={draft.discountAmountIdr} onChange={(event) => setDraft({ ...draft, discountAmountIdr: event.target.value })} />
        </div>
        <div className="settings-block"><label className="check-row"><input type="checkbox" checked={draft.taxEnabled} onChange={(event) => setDraft({ ...draft, taxEnabled: event.target.checked })} />Gunakan pajak</label>
          <p className="muted">Pajak dihitung dari subtotal sebelum diskon.</p>
          <label className="field-label" htmlFor="tax-percent">Tarif pajak (%)</label>
          <input className="text-field" id="tax-percent" inputMode="decimal" pattern="(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)" required value={draft.taxPercent} onChange={(event) => setDraft({ ...draft, taxPercent: event.target.value })} />
        </div>
        <p className="muted">Versi aktif: {applied.version} · Terakhir diperbarui {new Date(applied.updatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} WIB</p>
        <p className="muted">Perubahan akan memengaruhi tagihan meja yang belum lunas.</p>
        <button className="primary-button" disabled={busy || conflict || !changed}>{busy ? "Menyimpan…" : "Simpan Perubahan"}</button>
      </section>
      <aside className="admin-panel">
        <p className="eyebrow">PRATINJAU</p><h2>Contoh tagihan</h2><p className="muted">Simulasi dari subtotal {formatIdr("100000")}. Nilai ini belum diterapkan sampai disimpan.</p>
        {preview ? <div className="summary-card">
          <div className="money-row"><span>Subtotal</span><strong>{formatIdr(preview.subtotalIdr)}</strong></div>
          <div className="money-row"><span>Diskon</span><strong>− {formatIdr(preview.discountIdr)}</strong></div>
          <div className="money-row"><span>Pajak {draft.taxEnabled ? `(${draft.taxPercent}%)` : "(nonaktif)"}</span><strong>{formatIdr(preview.taxIdr)}</strong></div>
          <hr /><div className="money-row"><strong>Total</strong><strong>{formatIdr(preview.grandTotalIdr)}</strong></div>
        </div> : <div className="inline-alert">Isi diskon dan pajak dengan angka yang valid untuk melihat pratinjau.</div>}
        <p className="muted">Tagihan lunas sebelumnya tetap memakai nilai historisnya.</p>
      </aside>
    </form>}
  </div>;
}
