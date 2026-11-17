import { execSync } from "node:child_process";

// Migrations need a direct (unpooled) connection: through a connection pooler
// `prisma migrate deploy` can hang on its advisory lock. The Neon integration
// adds DATABASE_URL_UNPOOLED next to DATABASE_URL (with the "DATABASE" prefix).
const dbUrl =
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.DATABASE_POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  "";

if (!dbUrl) {
  console.log("[vercel-prepare] No database URL configured — skipping automatic migrate & seed.");
  process.exit(0);
}

const env = { ...process.env, DATABASE_URL: dbUrl };

console.log("[vercel-prepare] Database URL detected — running Prisma migrate deploy & seed...");
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
console.log("[vercel-prepare] Database schema and seed completed.");
