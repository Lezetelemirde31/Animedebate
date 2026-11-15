/**
 * Seeds anime, characters, and community badges from src/data.
 * Idempotent: safe to run repeatedly (`npm run db:seed`).
 */
import { PrismaClient } from "@prisma/client";
import { ANIME } from "../src/data/anime";
import { BADGES } from "../src/data/badges";
import { getCatalog } from "../src/data/characters";
import images from "../src/data/character-images.json";

const seedDbUrl =
  process.env.DIRECT_URL?.trim() ||
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim() ||
  process.env.POSTGRES_URL?.trim();

const prisma = new PrismaClient(seedDbUrl ? { datasources: { db: { url: seedDbUrl } } } : undefined);
const imageMap = images as Record<string, { url: string }>;

async function main() {
  for (const a of ANIME) {
    await prisma.anime.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        name: a.name,
        shortName: a.shortName,
        color: a.color,
        description: a.description,
        enabled: a.enabled,
        sortOrder: a.sortOrder,
      },
      update: {
        name: a.name,
        shortName: a.shortName,
        color: a.color,
        description: a.description,
        enabled: a.enabled,
        sortOrder: a.sortOrder,
      },
    });
  }

  const catalog = getCatalog();
  for (const c of catalog) {
    const data = {
      name: c.name,
      title: c.title,
      animeId: c.animeId,
      imageUrl: imageMap[c.id]?.url ?? null,
      description: c.description,
      abilities: c.abilities,
      rarity: c.rarity,
      powerLevel: c.powerLevel ?? null,
      enabled: true,
    };
    await prisma.character.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }

  for (const b of BADGES) {
    await prisma.badge.upsert({
      where: { id: b.id },
      create: b,
      update: {
        slug: b.slug,
        name: b.name,
        description: b.description,
        icon: b.icon,
        color: b.color,
        ruleType: b.ruleType,
        threshold: b.threshold,
      },
    });
  }

  // Characters removed from curated data are disabled rather than deleted, preserving match & debate history.
  const ids = catalog.map((c) => c.id);
  const disabled = await prisma.character.updateMany({ where: { id: { notIn: ids } }, data: { enabled: false } });

  const counts = await prisma.character.groupBy({ by: ["animeId"], _count: { _all: true }, where: { enabled: true } });
  console.log(`Seeded ${ANIME.length} anime, ${catalog.length} characters (${disabled.count} disabled), and ${BADGES.length} badges.`);
  for (const row of counts) console.log(`  ${row.animeId}: ${row._count._all}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
