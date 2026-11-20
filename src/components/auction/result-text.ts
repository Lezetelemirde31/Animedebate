import type { MatchResultDetail } from "@/game/types";

/** Turns the structured match result into a short localized sentence. */
export function describeResult(detail: MatchResultDetail | null | undefined, locale: string): string {
  if (!detail) return "";
  const tr = locale !== "en";
  const names = (detail.names ?? []).join(", ");
  const parts: string[] = [];

  switch (detail.note) {
    case "left":
      parts.push(tr ? `${names} maçtan ayrıldı.` : `${names} left the match.`);
      break;
    case "no_reconnect":
      parts.push(tr ? `${names} zamanında geri bağlanmadı.` : `${names} did not reconnect in time.`);
      break;
    case "all_spent":
      parts.push(tr ? "Tüm bütçeler harcandı." : "Every budget was spent.");
      break;
    case "pool_empty":
      parts.push(tr ? "Karakter havuzu tükendi." : "The character pool ran out.");
      break;
    case "everyone_left":
      parts.push(tr ? "Herkes odadan ayrıldı." : "Everyone left the room.");
      break;
    case "both_disconnected":
      parts.push(tr ? "İki oyuncunun da bağlantısı koptu." : "Both players disconnected.");
      break;
  }

  const d = detail.decision;
  if (d) {
    if (d.kind === "score") parts.push(tr ? `Skor ${d.high} – ${d.low}.` : `Score ${d.high} – ${d.low}.`);
    else if (d.kind === "balance")
      parts.push(
        tr
          ? `Skorlar ${d.score} ile eşit; kalan bakiye ($${d.balance}) kararı verdi.`
          : `Scores tied at ${d.score}; remaining balance ($${d.balance}) decided it.`,
      );
    else if (d.kind === "tie")
      parts.push(
        tr ? `Skor (${d.score}) ve bakiye ($${d.balance}) eşit — berabere.` : `Score (${d.score}) and balance ($${d.balance}) tied — a draw.`,
      );
  }
  return parts.join(" ");
}
