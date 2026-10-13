"use client";

import { useLocale } from "@/components/locale-provider";

import { Alert, Button, LoadingState, Input } from "@/components/ui/controls";

import { Section } from "@/components/ui/section";
import { DetailPane } from "@/components/app-shells";

import { useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { bpsToPercent, percentToBps } from "@/lib/admin/billing-preview";
import { calculateBill } from "@/lib/billing";


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
  const { t, locale, money } = useLocale();
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
    if (!window.confirm(t("Simpan pengaturan? Perubahan akan memengaruhi tagihan meja yang belum lunas."))) return;
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
    <p className="section-intro">{t("Atur diskon nominal dan pajak. Nilai baru berlaku pada tagihan yang belum lunas saat dihitung ulang.")}</p>
    {notice && <Alert className="inline-alert info" role="status">{t(notice)}</Alert>}
    {error && <Alert className="inline-alert" role="alert">{t(error)} {conflict && <Button className="text-button" onClick={() => { setRevision((value) => value + 1); setConflict(false); }}>{t("Muat pengaturan terbaru")}</Button>}</Alert>}
    {!draft || !applied ? <LoadingState className="loading-block" role="status">{t("Memuat pengaturan…")}</LoadingState> : <form onSubmit={save} className="admin-settings-grid">
      <div className="admin-stack"><Section id="discount-settings" title={t("Diskon nominal")}>
        <div className="settings-block"><label className="check-row"><Input type="checkbox" checked={draft.discountEnabled} onChange={(event) => setDraft({ ...draft, discountEnabled: event.target.checked })} />{t("Gunakan diskon")}</label>
          <p className="muted">{t("Diskon tetap dalam rupiah, maksimal sebesar subtotal.")}</p>
          <label className="field-label" htmlFor="discount-amount">{t("Jumlah diskon (Rp)")}</label>
          <Input className="text-field" id="discount-amount" inputMode="numeric" pattern="(0|[1-9][0-9]*)" maxLength={16} required value={draft.discountAmountIdr} onChange={(event) => setDraft({ ...draft, discountAmountIdr: event.target.value })} />
        </div>
        </Section><Section id="tax-settings" title={t("Pajak penjualan")}><div className="settings-block"><label className="check-row"><Input type="checkbox" checked={draft.taxEnabled} onChange={(event) => setDraft({ ...draft, taxEnabled: event.target.checked })} />{t("Gunakan pajak")}</label>
          <p className="muted">{t("Pajak dihitung dari subtotal sebelum diskon.")}</p>
          <label className="field-label" htmlFor="tax-percent">{t("Tarif pajak (%)")}</label>
          <Input className="text-field" id="tax-percent" inputMode="decimal" pattern="(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)" required value={draft.taxPercent} onChange={(event) => setDraft({ ...draft, taxPercent: event.target.value })} />
        </div>
        </Section><Section id="save-settings" title={t("Tinjau dan simpan")}><p className="muted">{t("Versi aktif:")}{" "}{applied.version} {" "}{t("· Terakhir diperbarui")}{" "}{new Date(applied.updatedAt).toLocaleString(locale === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })} {" "}{t("WIB")}</p>
        <p className="muted">{t("Perubahan akan memengaruhi tagihan meja yang belum lunas.")}</p>
        <Button className="primary-button" disabled={busy || conflict || !changed}>{busy ? t("Menyimpan…") : t("Simpan Perubahan")}</Button>
      </Section></div>
      <DetailPane><aside className="admin-panel">
        <h2>{t("Contoh tagihan")}</h2><p className="muted">{t("Simulasi dari subtotal")}{" "}{money("100000")}{t(". Nilai ini belum diterapkan sampai disimpan.")}</p>
        {preview ? <div className="summary-card">
          <div className="money-row"><span>{t("Subtotal")}</span><strong>{money(preview.subtotalIdr)}</strong></div>
          <div className="money-row"><span>{t("Diskon")}</span><strong>− {money(preview.discountIdr)}</strong></div>
          <div className="money-row"><span>{t("Pajak")}{" "}{draft.taxEnabled ? `(${draft.taxPercent}%)` : t("(nonaktif)")}</span><strong>{money(preview.taxIdr)}</strong></div>
          <hr /><div className="money-row"><strong>{t("Total")}</strong><strong>{money(preview.grandTotalIdr)}</strong></div>
        </div> : <Alert className="inline-alert">{t("Isi diskon dan pajak dengan angka yang valid untuk melihat pratinjau.")}</Alert>}
        <p className="muted">{t("Tagihan lunas sebelumnya tetap memakai nilai historisnya.")}</p>
      </aside></DetailPane>
    </form>}
  </div>;
}
