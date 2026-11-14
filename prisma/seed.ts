/**
 * Seeds anime and characters from src/data. Idempotent: run it again after
 * editing the data files or adding a new anime.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { ANIME } from "../src/data/anime";
import { getCatalog } from "../src/data/characters";
import images from "../src/data/character-images.json";

const prisma = new PrismaClient();
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

  // Characters removed from the curated data are disabled (never deleted, so history stays intact).
  const ids = catalog.map((c) => c.id);
  const disabled = await prisma.character.updateMany({ where: { id: { notIn: ids } }, data: { enabled: false } });

  const counts = await prisma.character.groupBy({ by: ["animeId"], _count: { _all: true }, where: { enabled: true } });
  console.log(`Seeded ${ANIME.length} anime and ${catalog.length} characters (${disabled.count} disabled).`);
  for (const row of counts) console.log(`  ${row.animeId}: ${row._count._all}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
