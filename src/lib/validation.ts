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
  avatarStyle: z.string().max(20).optional(),
  avatarCharacterId: z.string().max(80).nullable().optional(),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
