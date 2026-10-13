"use client";

import { Brand } from "./brand";
import { LanguageSwitch } from "./language-switch";

export function EntryHeader() {
  return <header className="entry-header"><Brand /><LanguageSwitch /></header>;
}
