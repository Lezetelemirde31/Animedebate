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

// Same rule as src/lib/db.ts: APP_DATABASE_NAME selects this app's own database
// on a shared Postgres server, leaving any other database on it untouched.
function withAppDatabaseName(url) {
  const name = process.env.APP_DATABASE_NAME?.trim();
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return url;
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const env = { ...process.env, DATABASE_URL: withAppDatabaseName(dbUrl) };
if (process.env.APP_DATABASE_NAME) console.log(`[vercel-prepare] Using database "${process.env.APP_DATABASE_NAME}".`);

console.log("[vercel-prepare] Database URL detected — running Prisma migrate deploy & seed...");
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
console.log("[vercel-prepare] Database schema and seed completed.");
