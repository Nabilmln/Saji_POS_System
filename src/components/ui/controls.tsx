"use client";

import { useLocale } from "@/components/locale-provider";
import { Toast } from "./toast";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

import { useId, useState, type ButtonHTMLAttributes, type ComponentProps, type InputHTMLAttributes, type TextareaHTMLAttributes, type HTMLAttributes } from "react";
import * as Select from "@radix-ui/react-select";
import { CaretDownIcon, CaretUpIcon, CheckIcon, EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";

export function Button({ className, type, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`button ${className ?? "primary-button"}`} {...props} />;
}

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} className={className ?? (type === "checkbox" || type === "radio" ? undefined : "text-field")} {...props} />;
}

export function Textarea({ className = "text-field", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={className} {...props} />;
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  return <div className="password-field"><Input {...props} type={visible ? "text" : "password"} /><Button type="button" className="icon-button password-reveal" aria-label={visible ? t("Sembunyikan kata sandi") : t("Tampilkan kata sandi")} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}</Button></div>;
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectionProps = { label: string; options: SelectOption[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; name?: string; required?: boolean; disabled?: boolean; kind?: "dropdown" | "segments"; className?: string };

export function Selection({ label, options, value, defaultValue = "", onChange, name, required, disabled, kind, className = "" }: SelectionProps) {
  const { t } = useLocale();
  const id = useId();
  const [internal, setInternal] = useState(defaultValue);
  const active = value ?? internal;
  const change = (next: string) => { setInternal(next); onChange?.(next); };
  const segmented = kind === "segments" || (!kind && options.length <= 4 && options.every((option) => option.label.length <= 24));
  if (segmented) return <fieldset className={`selection ${className}`} disabled={disabled}><legend>{t(label)}</legend><div className="segmented-control">{options.map((option) => <label className="segment-option" key={option.value}><Input type="radio" name={name ?? id} value={option.value} checked={active === option.value} onChange={() => change(option.value)} disabled={option.disabled} required={required} /><span>{option.label}</span></label>)}</div></fieldset>;
  const empty = options.find((option) => option.value === "");
  const encode = (option: string) => option === "" && empty && !empty.disabled ? "__empty__" : option;
  return <div className={`selection ${className}`}><label htmlFor={id}>{t(label)}</label><Select.Root name={name} value={encode(active)} onValueChange={(next) => change(next === "__empty__" ? "" : next)} required={required} disabled={disabled}>
    <Select.Trigger id={id} className="select-trigger"><Select.Value placeholder={t(empty?.label ?? "Pilih opsi")} /><Select.Icon><CaretDownIcon size={16} /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content className="select-content" position="popper" sideOffset={6}><Select.ScrollUpButton className="select-scroll"><CaretUpIcon size={14} /></Select.ScrollUpButton><Select.Viewport>{options.filter((option) => option.value || !option.disabled).map((option) => <Select.Item className="select-option" key={option.value} value={encode(option.value)} disabled={option.disabled}><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><CheckIcon size={15} /></Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="select-scroll"><CaretDownIcon size={14} /></Select.ScrollDownButton></Select.Content></Select.Portal>
  </Select.Root></div>;
}

export function Panel({ className = "admin-panel", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={className} {...props} />;
}

export function Alert({ className = "inline-alert", role, toast = false, ...props }: HTMLAttributes<HTMLDivElement> & { toast?: boolean }) {
  if (toast) return <Toast>{props.children}</Toast>;
  return <div className={className} role={role ?? (className.includes("info") ? "status" : "alert")} {...props} />;
}

export function EmptyState({ className = "empty-state", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}

export { LoadingState } from "./loading-state";

export function Pagination({ page, pageSize, onPageSizeChange, hasNext, onChange, disabled, total, label = "Navigasi halaman" }: { page: number; pageSize: number; onPageSizeChange: (size: number) => void; hasNext: boolean; onChange: (page: number) => void; disabled?: boolean; total?: number; label?: string }) {
  const { t } = useLocale();
  return <nav className="pagination-panel" aria-label={t(label)}><div><span>{t("Halaman")}{" "}{page}{total !== undefined && ` / ${Math.max(1, Math.ceil(total / pageSize))}`}</span><small>{t("{0} data per halaman", { "0": pageSize })}</small></div><Selection className="pagination-size" label="Data per halaman" kind="segments" value={String(pageSize)} onChange={(value) => onPageSizeChange(Number(value))} options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))} disabled={disabled} /><div className="pagination-actions"><Button type="button" className="secondary-button" disabled={page === 1 || disabled} onClick={() => onChange(page - 1)}>{t("Sebelumnya")}</Button><Button type="button" className="secondary-button" disabled={!hasNext || disabled} onClick={() => onChange(page + 1)}>{t("Berikutnya")}</Button></div></nav>;
}
