"use client";

import { useState } from "react";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./pagination";

export function usePagination() {
  const [page, setPage] = useState(1);
  const [pageSize, updatePageSize] = useState(DEFAULT_PAGE_SIZE);
  function setPageSize(size: number) {
    if (!PAGE_SIZE_OPTIONS.some((option) => option === size)) return;
    updatePageSize(size);
    setPage(1);
  }
  return { page, setPage, pageSize, setPageSize };
}
