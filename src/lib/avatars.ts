/** Preset gradient avatars. Users can also pick an owned character as their picture. */
export const AVATAR_STYLES = {
  violet: { label: "Violet Haze", from: "#7c3aed", to: "#c026d3" },
  crimson: { label: "Crimson Moon", from: "#be123c", to: "#f43f5e" },
  ember: { label: "Ember", from: "#ea580c", to: "#facc15" },
  ocean: { label: "Abyss", from: "#1d4ed8", to: "#22d3ee" },
  jade: { label: "Jade", from: "#047857", to: "#4ade80" },
  shadow: { label: "Shadow", from: "#18181b", to: "#6d28d9" },
} as const;

export type AvatarStyleId = keyof typeof AVATAR_STYLES;

export function isAvatarStyle(id: unknown): id is AvatarStyleId {
  return typeof id === "string" && id in AVATAR_STYLES;
}

export function avatarGradient(style: string): string {
  const s = isAvatarStyle(style) ? AVATAR_STYLES[style] : AVATAR_STYLES.violet;
  return `linear-gradient(135deg, ${s.from}, ${s.to})`;
}
