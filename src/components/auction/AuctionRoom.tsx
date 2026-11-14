"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Radio, WifiOff } from "lucide-react";
import { useRoom, useServerNow, type RoomEventWithMeta } from "@/hooks/useRoom";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { ErrorState, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { AuctionStage } from "./AuctionStage";
import { LobbyView } from "./LobbyView";
import { MatchSummary } from "./MatchSummary";

function describe(e: RoomEventWithMeta, myId: string | null): { text: string; tone: "info" | "good" | "warn" } | null {
  const who = (id: string, name: string) => (id === myId ? "You" : name);
  switch (e.type) {
    case "player_joined":
      return { text: `${who(e.userId, e.username)} joined the room`, tone: "good" };
    case "player_left":
      return { text: `${who(e.userId, e.username)} left the room`, tone: "warn" };
    case "player_disconnected":
      return e.userId === myId ? null : { text: `${e.username} disconnected`, tone: "warn" };
    case "player_reconnected":
      return e.userId === myId ? null : { text: `${e.username} reconnected`, tone: "good" };
    case "bid":
      return e.overtime ? { text: `Overtime! ${who(e.bid.userId, e.bid.username)} bid $${e.bid.amount}`, tone: "warn" } : null;
    case "match_paused":
      return { text: "Match paused — waiting for reconnection", tone: "warn" };
    case "match_resumed":
      return { text: "Match resumed", tone: "good" };
    default:
      return null;
  }
}

function Toasts({ events, now, myId }: { events: RoomEventWithMeta[]; now: number; myId: string | null }) {
  const recent = events
    .filter((e) => Date.now() - e.at < 4500 || now - e.at < 4500)
    .map((e) => ({ e, d: describe(e, myId) }))
    .filter((x) => x.d)
    .slice(-3);
  if (recent.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-4 z-50 flex w-72 flex-col gap-2" aria-live="polite">
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
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="glass-strong w-full max-w-md rounded-3xl p-6 animate-pop-in">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-rose-300" />
          <h2 className="font-display text-xl font-bold text-white">{title}</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-300">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onCancel} autoFocus>
            Stay
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
          <Link href="/play/join" className="btn btn-primary">Try another code</Link>
          <Link href="/play/create" className="btn btn-ghost">Create a room</Link>
        </>
      ),
      MATCH_ENDED: (
        <>
          {error.data?.matchId && (
            <Link href={`/history/${error.data.matchId}`} className="btn btn-primary">View results</Link>
          )}
          <Link href="/play" className="btn btn-ghost">Find a new match</Link>
        </>
      ),
      ACTIVE_MATCH: error.data?.code ? (
        <Link href={`/room/${error.data.code}`} className="btn btn-primary">Return to your match</Link>
      ) : null,
    } as Record<string, React.ReactNode>;
    return (
      <ErrorState
        title={
          error.code === "NOT_FOUND"
            ? "Room not found"
            : error.code === "MATCH_ENDED"
              ? "This auction has ended"
              : error.code === "ACTIVE_MATCH"
                ? "You're in another match"
                : "Couldn't join the room"
        }
        description={error.message}
        action={actions[error.code] ?? <Link href="/play" className="btn btn-primary">Back to Play</Link>}
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
          {connection === "connected" ? `Joining room ${code}…` : "Connecting to the auction server…"}
        </p>
      </div>
    );
  }

  return (
    <div>
      {connection !== "connected" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <WifiOff className="h-4 w-4" /> Connection lost — reconnecting. Your seat is safe for a little while.
        </div>
      )}
      {!isPlayer && snapshot.phase !== "LOBBY" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-200">
          <Radio className="h-4 w-4" /> Spectating — you see exactly what the players see.
        </div>
      )}
      <Toasts events={room.events} now={now} myId={myId} />

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
          title="Forfeit the match?"
          body="Leaving now ends the match and your opponent wins by forfeit. Characters you've already won stay in your collection."
          confirmLabel="Forfeit & leave"
          onConfirm={leave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
