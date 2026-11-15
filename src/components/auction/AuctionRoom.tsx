"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Radio, WifiOff } from "lucide-react";
import { useRoom, useServerNow, type RoomEventWithMeta } from "@/hooks/useRoom";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { ErrorState, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { AuctionStage } from "./AuctionStage";
import { LobbyView } from "./LobbyView";
import { MatchSummary } from "./MatchSummary";

function describe(
  e: RoomEventWithMeta,
  myId: string | null,
  t: ReturnType<typeof useLanguage>["t"],
): { text: string; tone: "info" | "good" | "warn" } | null {
  const who = (id: string, name: string) => (id === myId ? t.auction.you : name);
  switch (e.type) {
    case "player_joined":
      return { text: t.auction.room.joinedRoom(who(e.userId, e.username)), tone: "good" };
    case "player_left":
      return { text: t.auction.room.leftRoom(who(e.userId, e.username)), tone: "warn" };
    case "player_disconnected":
      return e.userId === myId ? null : { text: t.auction.room.disconnectedRoom(e.username), tone: "warn" };
    case "player_reconnected":
      return e.userId === myId ? null : { text: t.auction.room.reconnectedRoom(e.username), tone: "good" };
    case "bid":
      return e.overtime
        ? { text: t.auction.room.overtimeBid(who(e.bid.userId, e.bid.username), e.bid.amount), tone: "warn" }
        : null;
    case "match_paused":
      return { text: t.auction.room.pausedToast, tone: "warn" };
    case "match_resumed":
      return { text: t.auction.room.resumedToast, tone: "good" };
    default:
      return null;
  }
}

function Toasts({
  events,
  now,
  myId,
  t,
}: {
  events: RoomEventWithMeta[];
  now: number;
  myId: string | null;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const recent = events
    .filter((e) => Date.now() - e.at < 4500 || now - e.at < 4500)
    .map((e) => ({ e, d: describe(e, myId, t) }))
    .filter((x) => x.d)
    .slice(-3);
  if (recent.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {recent.map(({ e, d }) => (
        <div
          key={e.key}
          className={cn(
            "glass-strong rounded-xl px-4 py-3 text-sm animate-slide-up",
            d!.tone === "good" ? "text-emerald-200" : d!.tone === "warn" ? "text-amber-200" : "text-zinc-200",
          )}
        >
          {d!.text}
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  stayLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  stayLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="glass-strong w-full max-w-md rounded-3xl p-6 animate-pop-in">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 shrink-0 text-rose-300" />
          <h2 className="font-display text-xl font-bold text-white">{title}</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-300">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onCancel} autoFocus>
            {stayLabel}
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuctionRoom({ code }: { code: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const user = useCurrentUser();
  const room = useRoom(code);
  const now = useServerNow(100);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { snapshot, error, connection } = room;
  const myId = user?.id ?? null;
  const isPlayer = !!snapshot?.players.some((p) => p.userId === myId);
  const live = !!snapshot && ["COUNTDOWN", "BIDDING", "INTERMISSION", "PAUSED"].includes(snapshot.phase);

  // Warn before closing the tab mid-match (closing pauses the match and starts the forfeit clock).
  useEffect(() => {
    if (!live || !isPlayer) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [live, isPlayer]);

  async function leave() {
    setConfirmLeave(false);
    await room.leave();
    router.push("/play");
  }

  if (error) {
    const actions = {
      NOT_FOUND: (
        <>
          <Link href="/play/join" className="btn btn-primary">{t.auction.room.tryAnotherCode}</Link>
          <Link href="/play/create" className="btn btn-ghost">{t.auction.room.createRoom}</Link>
        </>
      ),
      MATCH_ENDED: (
        <>
          {error.data?.matchId && (
            <Link href={`/history/${error.data.matchId}`} className="btn btn-primary">{t.auction.room.viewResults}</Link>
          )}
          <Link href="/play" className="btn btn-ghost">{t.auction.room.findNewMatch}</Link>
        </>
      ),
      ACTIVE_MATCH: error.data?.code ? (
        <Link href={`/room/${error.data.code}`} className="btn btn-primary">{t.auction.room.returnMatch}</Link>
      ) : null,
    } as Record<string, React.ReactNode>;
    return (
      <ErrorState
        title={
          error.code === "NOT_FOUND"
            ? t.auction.room.notFoundTitle
            : error.code === "MATCH_ENDED"
              ? t.auction.room.endedTitle
              : error.code === "ACTIVE_MATCH"
                ? t.auction.room.activeMatchTitle
                : t.auction.room.cantJoinTitle
        }
        description={error.message}
        action={actions[error.code] ?? <Link href="/play" className="btn btn-primary">{t.auction.room.backToPlay}</Link>}
      />
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse-glow rounded-full bg-purple-600/50" />
          <Spinner className="relative h-10 w-10" />
        </div>
        <p className="font-display uppercase tracking-[0.3em] text-zinc-400">
          {connection === "connected" ? t.auction.room.joiningRoom(code) : t.auction.room.connectingServer}
        </p>
      </div>
    );
  }

  return (
    <div>
      {connection !== "connected" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <WifiOff className="h-4 w-4 shrink-0" /> {t.auction.room.connectionLost}
        </div>
      )}
      {!isPlayer && snapshot.phase !== "LOBBY" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
          <Radio className="h-4 w-4 shrink-0" /> {t.auction.room.spectatingBanner}
        </div>
      )}
      <Toasts events={room.events} now={now} myId={myId} t={t} />

      {snapshot.phase === "LOBBY" ? (
        <LobbyView snapshot={snapshot} myId={myId} now={now} onReady={room.setReady} onLeave={leave} />
      ) : snapshot.phase === "FINISHED" || snapshot.phase === "ABANDONED" ? (
        <MatchSummary snapshot={snapshot} myId={myId} onRematch={room.rematch} />
      ) : (
        <AuctionStage
          snapshot={snapshot}
          myId={myId}
          now={now}
          events={room.events}
          onBid={room.bid}
          onLeave={() => setConfirmLeave(true)}
        />
      )}

      {confirmLeave && (
        <ConfirmDialog
          title={t.auction.room.forfeitTitle}
          body={t.auction.room.forfeitBody}
          confirmLabel={t.auction.room.forfeitConfirm}
          stayLabel={t.auction.room.stayBtn}
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
