"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Text, useLocale } from "@/components/locale-provider";
import { Toast, type ToastTone } from "./toast";

export type NoticeMessage = string | { text: string; subject?: ReactNode; values?: Record<string, ReactNode>; tone?: ToastTone };
const NoticeContext = createContext<((message: NoticeMessage) => void) | null>(null);

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<{ message: NoticeMessage } | null>(null);
  const notify = useCallback((message: NoticeMessage) => setNotification(message ? { message } : null), []);
  return <NoticeContext value={notify}>{children}{notification && <Notice notification={notification} />}</NoticeContext>;
}

export function useNotice() {
  const notify = useContext(NoticeContext);
  if (!notify) throw new Error("NoticeProvider is required");
  return notify;
}

export function statusNotice(subject: ReactNode, status: string): NoticeMessage {
  return { text: "{0} sekarang {1}.", values: { 0: subject, 1: <Text value={status} /> } };
}

function Notice({ notification }: { notification: { message: NoticeMessage } }) {
  const { t } = useLocale();
  const data: Exclude<NoticeMessage, string> = typeof notification.message === "string" ? { text: notification.message } : notification.message;
  return <Toast messageKey={notification} tone={data.tone}>
    {data.subject && <strong className="toast-subject">{data.subject}</strong>}
    <span>{t(data.text).split(/(\{\d+\})/).map((part, index) => {
      const key = /^\{(\d+)\}$/.exec(part)?.[1];
      return key !== undefined && data.values?.[key] !== undefined ? <strong key={index}>{data.values[key]}</strong> : part;
    })}</span>
  </Toast>;
}
