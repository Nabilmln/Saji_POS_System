import "server-only";
import { createDatabase } from "./connection";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const globalDb = globalThis as unknown as {
  __db?: ReturnType<typeof createDatabase>;
};

export const { db } = (globalDb.__db ??= createDatabase(
  process.env.DATABASE_URL,
));
