"use client";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { CheckCircleIcon, EyeIcon, KeyIcon, PencilSimpleIcon, PowerIcon, ReceiptIcon, SignInIcon, SquaresFourIcon, TrashSimpleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";
import { Button } from "./controls";

const actions = {
  edit: { icon: PencilSimpleIcon, label: "Edit" },
  rename: { icon: PencilSimpleIcon, label: "Ubah nama" },
  renumber: { icon: PencilSimpleIcon, label: "Ubah nomor" },
  password: { icon: KeyIcon, label: "Atur kata sandi" },
  activate: { icon: PowerIcon, label: "Aktifkan" },
  deactivate: { icon: PowerIcon, label: "Nonaktifkan" },
  delete: { icon: TrashSimpleIcon, label: "Hapus" },
  confirm: { icon: CheckCircleIcon, label: "Konfirmasi" },
  detail: { icon: EyeIcon, label: "Detail" },
  checkIn: { icon: SignInIcon, label: "Check-in" },
  cancel: { icon: XCircleIcon, label: "Batalkan reservasi" },
  table: { icon: SquaresFourIcon, label: "Lihat meja" },
  receipt: { icon: ReceiptIcon, label: "Lihat struk" },
};

type ActionProps = { action: keyof typeof actions } & (
  | ({ href: string } & Omit<ComponentProps<typeof Link>, "href" | "children" | "className" | "title" | "aria-label">)
  | ({ href?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "title" | "aria-label">)
);

export function TableAction({ action, ...props }: ActionProps) {
  const { t } = useLocale();
  const { icon: Icon, label } = actions[action];
  const shared = { className: "table-action", "data-action": action, title: t(label), "aria-label": t(label), children: <Icon size={18} weight="fill" aria-hidden="true" /> };
  if (props.href !== undefined) return <Link {...props} {...shared} />;
  return <Button type="button" {...props} {...shared} />;
}

export function TableActions({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return children ? <div className="table-actions" role="group" aria-label={t("Tindakan")}>{children}</div> : null;
}
