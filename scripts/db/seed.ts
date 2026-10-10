import { randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { createDatabase } from "../../src/db/connection";
import {
  categories,
  diningTables,
  menuItems,
  staffProfiles,
  storeSettings,
} from "../../src/db/schema";

loadEnvConfig(process.cwd());

const adminId = process.env.SEED_ADMIN_USER_ID;
const cashierId = process.env.SEED_CASHIER_USER_ID;
if (Boolean(adminId) !== Boolean(cashierId)) {
  throw new Error("Set both SEED_ADMIN_USER_ID and SEED_CASHIER_USER_ID, or neither");
}
if (adminId && cashierId && adminId === cashierId) {
  throw new Error("Admin and cashier IDs must differ");
}

async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is required");
  const { db, pool } = createDatabase(connectionString);
  try {
  await db.transaction(async (tx) => {
    await tx.insert(storeSettings).values({ id: 1 }).onConflictDoNothing();

    const categoryRows = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Makanan", sortOrder: 1 },
      { id: "22222222-2222-4222-8222-222222222222", name: "Minuman", sortOrder: 2 },
    ];
    await tx.insert(categories).values(categoryRows).onConflictDoNothing();

    await tx.insert(menuItems).values([
      { id: "33333333-3333-4333-8333-333333333331", categoryId: categoryRows[0].id, name: "Nasi Goreng", priceIdr: 30000n, description: "Nasi goreng demo" },
      { id: "33333333-3333-4333-8333-333333333332", categoryId: categoryRows[0].id, name: "Mie Goreng", priceIdr: 28000n, description: "Mie goreng demo" },
      { id: "33333333-3333-4333-8333-333333333333", categoryId: categoryRows[1].id, name: "Es Teh", priceIdr: 10000n, description: "Teh dingin demo" },
      { id: "33333333-3333-4333-8333-333333333334", categoryId: categoryRows[1].id, name: "Air Mineral", priceIdr: 8000n, description: "Air mineral demo" },
    ]).onConflictDoNothing();

    await tx.insert(diningTables).values(
      Array.from({ length: 8 }, (_, index) => ({
        tableNumber: String(index + 1).padStart(2, "0"),
        qrToken: randomBytes(24).toString("base64url"),
      })),
    ).onConflictDoNothing();

    if (adminId && cashierId) {
      await tx.insert(staffProfiles).values([
        { userId: z.uuid().parse(adminId), displayName: "Admin Demo", role: "ADMIN" },
        { userId: z.uuid().parse(cashierId), displayName: "Kasir Demo", role: "CASHIER" },
      ]).onConflictDoNothing();
    }
  });
  console.log(adminId ? "Demo catalog, tables, settings, and staff seeded" : "Demo catalog, tables, and settings seeded; staff awaits Auth users");
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
