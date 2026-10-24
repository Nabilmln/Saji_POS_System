export const LIST_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 15, 20] as const;
export const DEFAULT_PAGE_SIZE = 10;
export type PageInfo = { page: number; pageSize: number; hasNext: boolean };
