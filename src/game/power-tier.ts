import type { Locale } from "@/lib/i18n";

export type PowerTierCode =
  | "2-C"
  | "3-A"
  | "4-A"
  | "4-C"
  | "5-A"
  | "5-B"
  | "5-C"
  | "High 6-A"
  | "6-A"
  | "High 6-B"
  | "6-B"
  | "6-C"
  | "High 7-A"
  | "7-A"
  | "7-B"
  | "7-C"
  | "8-A"
  | "8-B"
  | "8-C"
  | "9-A"
  | "9-B"
  | "9-C"
  | "10-A"
  | "10-B";

export interface PowerTierMeta {
  code: PowerTierCode;
  min: number;
  max: number;
  color: string;
  label: Record<Locale, string>;
}

export const POWER_TIER_INFO: Record<PowerTierCode, PowerTierMeta> = {
  "2-C": {
    code: "2-C",
    min: 97,
    max: 99,
    color: "#f43f5e",
    label: { tr: "Düşük Çoklu Evren", en: "Low Multiversal" },
  },
  "3-A": {
    code: "3-A",
    min: 94,
    max: 96,
    color: "#fb7185",
    label: { tr: "Evrensel", en: "Universal" },
  },
  "4-A": {
    code: "4-A",
    min: 92,
    max: 93,
    color: "#e879f9",
    label: { tr: "Çoklu Yıldız Sistemi", en: "Multi-Solar System" },
  },
  "4-C": {
    code: "4-C",
    min: 90,
    max: 91,
    color: "#c084fc",
    label: { tr: "Yıldız Seviyesi", en: "Star Level" },
  },
  "5-A": {
    code: "5-A",
    min: 88,
    max: 89,
    color: "#a855f7",
    label: { tr: "Büyük Gezegen", en: "Large Planet" },
  },
  "5-B": {
    code: "5-B",
    min: 86,
    max: 87,
    color: "#8b5cf6",
    label: { tr: "Gezegen Seviyesi", en: "Planet Level" },
  },
  "5-C": {
    code: "5-C",
    min: 84,
    max: 85,
    color: "#6366f1",
    label: { tr: "Ay Seviyesi", en: "Moon Level" },
  },
  "High 6-A": {
    code: "High 6-A",
    min: 80,
    max: 83,
    color: "#38bdf8",
    label: { tr: "Çoklu Kıta", en: "Multi-Continental" },
  },
  "6-A": {
    code: "6-A",
    min: 77,
    max: 79,
    color: "#22d3ee",
    label: { tr: "Kıta Seviyesi", en: "Continental" },
  },
  "High 6-B": {
    code: "High 6-B",
    min: 75,
    max: 76,
    color: "#2dd4bf",
    label: { tr: "Büyük Ülke", en: "Large Country" },
  },
  "6-B": {
    code: "6-B",
    min: 72,
    max: 74,
    color: "#34d399",
    label: { tr: "Ülke Seviyesi", en: "Country Level" },
  },
  "6-C": {
    code: "6-C",
    min: 69,
    max: 71,
    color: "#4ade80",
    label: { tr: "Ada Seviyesi", en: "Island Level" },
  },
  "High 7-A": {
    code: "High 7-A",
    min: 66,
    max: 68,
    color: "#a3e635",
    label: { tr: "Büyük Dağ", en: "Large Mountain" },
  },
  "7-A": {
    code: "7-A",
    min: 63,
    max: 65,
    color: "#facc15",
    label: { tr: "Dağ Seviyesi", en: "Mountain Level" },
  },
  "7-B": {
    code: "7-B",
    min: 59,
    max: 62,
    color: "#fbbf24",
    label: { tr: "Şehir Seviyesi", en: "City Level" },
  },
  "7-C": {
    code: "7-C",
    min: 54,
    max: 58,
    color: "#fb923c",
    label: { tr: "Kasaba Seviyesi", en: "Town Level" },
  },
  "8-A": {
    code: "8-A",
    min: 49,
    max: 53,
    color: "#f97316",
    label: { tr: "Çoklu Şehir Bloğu", en: "Multi-City Block" },
  },
  "8-B": {
    code: "8-B",
    min: 45,
    max: 48,
    color: "#ef4444",
    label: { tr: "Şehir Bloğu", en: "City Block" },
  },
  "8-C": {
    code: "8-C",
    min: 40,
    max: 44,
    color: "#f87171",
    label: { tr: "Bina Seviyesi", en: "Building Level" },
  },
  "9-A": {
    code: "9-A",
    min: 35,
    max: 39,
    color: "#d4d4d8",
    label: { tr: "Küçük Bina", en: "Small Building" },
  },
  "9-B": {
    code: "9-B",
    min: 21,
    max: 34,
    color: "#a1a1aa",
    label: { tr: "Duvar Seviyesi", en: "Wall Level" },
  },
  "9-C": {
    code: "9-C",
    min: 15,
    max: 20,
    color: "#71717a",
    label: { tr: "Sokak Seviyesi", en: "Street Level" },
  },
  "10-A": {
    code: "10-A",
    min: 11,
    max: 14,
    color: "#52525b",
    label: { tr: "Atlet Seviyesi", en: "Athlete Level" },
  },
  "10-B": {
    code: "10-B",
    min: 5,
    max: 10,
    color: "#3f3f46",
    label: { tr: "İnsan Seviyesi", en: "Human Level" },
  },
};

export function formatPowerTier(code: PowerTierCode, locale: Locale = "tr"): string {
  const meta = POWER_TIER_INFO[code];
  return `${meta.code} · ${meta.label[locale]}`;
}

export function isValidTierScore(code: PowerTierCode, score: number): boolean {
  const meta = POWER_TIER_INFO[code];
  return Number.isInteger(score) && score >= meta.min && score <= meta.max;
}
