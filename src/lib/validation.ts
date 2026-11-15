import { z } from "zod";
import { GAME_RULES } from "@/game/config";
import { ENABLED_ANIME_IDS } from "@/data/anime";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(20, "Username must be at most 20 characters.")
  .regex(/^[A-Za-z0-9_]+$/, "Use only letters, numbers and underscores.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.");

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(20),
  password: z.string().min(1, "Enter your password.").max(128),
});

export const createRoomSchema = z.object({
  isPrivate: z.boolean(),
  totalLots: z
    .number()
    .int()
    .refine((n) => (GAME_RULES.lotOptions as readonly number[]).includes(n), "Invalid number of lots."),
  bidSeconds: z
    .number()
    .int()
    .refine((n) => (GAME_RULES.timerOptions as readonly number[]).includes(n), "Invalid timer."),
  animeIds: z
    .array(z.string())
    .min(1, "Pick at least one anime.")
    .max(ENABLED_ANIME_IDS.length)
    .transform((ids) => [...new Set(ids)])
    .refine((ids) => ids.every((id) => ENABLED_ANIME_IDS.includes(id)), "Unsupported anime selected."),
});

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  bio: z.string().trim().max(280, "Bio must be at most 280 characters.").nullable().optional(),
  avatarStyle: z.string().max(20).optional(),
  avatarCharacterId: z.string().max(80).nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(128),
  newPassword: passwordSchema,
});

export const createDebateSchema = z.object({
  title: z.string().trim().min(6, "Title must be at least 6 characters.").max(140, "Title is too long."),
  content: z.string().trim().min(15, "Write at least 15 characters.").max(5000, "Content is too long."),
  category: z.enum(["GENERAL", "POWER_SCALING", "LORE", "HOT_TAKE"]),
  animeId: z
    .string()
    .max(50)
    .nullable()
    .optional()
    .refine((v) => !v || ENABLED_ANIME_IDS.includes(v), "Invalid anime selected."),
  characterId: z.string().max(80).nullable().optional(),
});

export const updateDebateSchema = z.object({
  title: z.string().trim().min(6).max(140).optional(),
  content: z.string().trim().min(15).max(5000).optional(),
  category: z.enum(["GENERAL", "POWER_SCALING", "LORE", "HOT_TAKE"]).optional(),
  status: z.enum(["OPEN", "LOCKED", "HIDDEN"]).optional(),
  isPinned: z.boolean().optional(),
});

export const createComparisonSchema = z
  .object({
    characterAId: z.string().trim().min(1, "Pick Character A.").max(80),
    characterBId: z.string().trim().min(1, "Pick Character B.").max(80),
    title: z.string().trim().min(6, "Title must be at least 6 characters.").max(140),
    description: z.string().trim().min(10, "Describe the matchup (10+ characters).").max(2000),
    criteria: z.enum(["OVERALL", "COMBAT", "WRITING", "INTELLIGENCE"]),
  })
  .refine((d) => d.characterAId !== d.characterBId, {
    message: "Choose two different characters to compare.",
    path: ["characterBId"],
  });

export const voteComparisonSchema = z.object({
  side: z.enum(["A", "B"]),
});

export const createCommentSchema = z.object({
  targetType: z.enum(["DEBATE", "COMPARISON", "CHARACTER"]),
  targetId: z.string().trim().min(1).max(80),
  parentId: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().min(2, "Comment is too short.").max(2000, "Comment is too long."),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(2, "Comment is too short.").max(2000, "Comment is too long."),
});

export const reactionSchema = z.object({
  targetType: z.enum(["DEBATE", "COMPARISON", "COMMENT"]),
  targetId: z.string().trim().min(1).max(80),
  value: z.union([z.literal(1), z.literal(-1)]),
});

export const favoriteSchema = z.object({
  targetType: z.enum(["CHARACTER", "DEBATE", "COMPARISON"]),
  targetId: z.string().trim().min(1).max(80),
});

export const adminUserUpdateSchema = z.object({
  role: z.enum(["USER", "MODERATOR", "ADMIN"]).optional(),
  isBanned: z.boolean().optional(),
  bannedReason: z.string().trim().max(300).nullable().optional(),
  xpDelta: z.number().int().min(-10000).max(10000).optional(),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
