import type { Locale } from "@/lib/i18n";
import { MESSAGES } from "@/lib/i18n";
import { gameInfo, gameName } from "@/game/platform";
import type { RecentMatch } from "@/server/platform/queries";
import { cn, timeAgo } from "@/lib/utils";

/** A player's latest matches across all games (shared match history). */
export function RecentMatches({ matches, locale }: { matches: RecentMatch[]; locale: Locale }) {
  const t = MESSAGES[locale].games;
  if (matches.length === 0) return <p className="text-sm text-zinc-500">{t.noRecent}</p>;
  return (
    <ul className="divide-y divide-white/5" data-testid="recent-matches">
      {matches.map((m) => {
        const info = gameInfo(m.game);
        const tone = m.result === "WIN" ? "text-emerald-300" : m.result === "LOSS" ? "text-rose-300" : "text-zinc-300";
        return (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: info?.color ?? "#a1a1aa" }} />
              <span className="font-semibold text-white">{gameName(m.game, locale)}</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">{t.modes[m.mode] ?? m.mode}</span>
              {m.opponents.length > 0 && <span className="truncate text-xs text-zinc-500">{t.vs(m.opponents.map((o) => o.username).join(", "))}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={cn("font-display font-bold", tone)}>{t.result[m.result] ?? m.result}</span>
              {m.ratingDelta !== null && m.ranked && (
                <span className={cn("font-display text-xs font-bold", m.ratingDelta >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {m.ratingDelta >= 0 ? "+" : ""}
                  {m.ratingDelta}
                </span>
              )}
              {m.xp > 0 && (
                <span className="text-xs text-zinc-400">
                  +{m.xp} XP · +{m.coins} AC
                </span>
              )}
              <span className="text-xs text-zinc-500">{timeAgo(m.endedAt, locale)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
