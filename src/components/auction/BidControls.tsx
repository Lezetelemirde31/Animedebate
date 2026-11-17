"use client";

import { useEffect, useState } from "react";
import { Ban, Gavel, Flame, SkipForward } from "lucide-react";
import type { Ack, LotState, PlayerState } from "@/game/types";
import { minimumNextBid } from "@/game/rules";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Bid buttons. The server is authoritative — these checks only disable
 * actions that would certainly be rejected and explain why.
 */
export function BidControls({
  lot,
  me,
  minIncrement,
  biddingOpen,
  isSpectator,
  teamFull,
  onBid,
  skip,
}: {
  lot: LotState;
  me: PlayerState | null;
  minIncrement: number;
  biddingOpen: boolean;
  isSpectator: boolean;
  /** This player's team already has every character it needs. */
  teamFull?: boolean;
  onBid: (lotId: string, amount: number) => Promise<Ack<unknown>>;
  skip?: { available: boolean; voted: boolean; opponentWants: boolean; onSkip: () => Promise<Ack<unknown>> };
}) {
  const { t } = useLanguage();
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  const minBid = minimumNextBid(lot, minIncrement);
  const balance = me?.balance ?? 0;
  const leading = !!me && lot.highestBidderId === me.userId;

  let blocked: string | null = null;
  if (isSpectator) blocked = t.auction.spectatorMsg;
  else if (teamFull) blocked = t.auction.teamFull;
  else if (!biddingOpen) blocked = t.auction.biddingClosed;
  else if (leading) blocked = t.auction.alreadyLeading;
  else if (balance < minBid) blocked = t.auction.insufficientBalance(balance, minBid);

  useEffect(() => {
    setError(null);
    setCustom("");
  }, [lot.id]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(timer);
  }, [error]);

  async function place(amount: number) {
    if (blocked || pending !== null) return;
    setPending(amount);
    setError(null);
    const res = await onBid(lot.id, amount);
    setPending(null);
    if (!res.ok) setError(res.message);
    else setCustom("");
  }

  async function voteSkip() {
    if (!skip || skipping) return;
    setSkipping(true);
    setError(null);
    const res = await skip.onSkip();
    setSkipping(false);
    if (!res.ok) setError(res.message);
  }

  const base = lot.highestBid ?? lot.startingPrice - minIncrement;
  const quick = [
    { label: t.auction.bidMin(minBid), amount: minBid, primary: true },
    { label: `+$2 → $${base + 2}`, amount: Math.max(minBid, base + 2) },
    { label: `+$5 → $${base + 5}`, amount: Math.max(minBid, base + 5) },
  ].filter((q, i, arr) => arr.findIndex((x) => x.amount === q.amount) === i);

  const customValue = Number(custom);
  const customValid = custom !== "" && Number.isInteger(customValue) && customValue >= minBid && customValue <= balance;

  return (
    <div className="space-y-3" data-testid="bid-controls">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {quick.map((q) => (
          <button
            key={q.amount}
            className={cn("btn", q.primary ? "btn-primary col-span-2 sm:col-span-1 !text-base" : "btn-ghost")}
            disabled={!!blocked || pending !== null || q.amount > balance}
            onClick={() => place(q.amount)}
            data-testid={q.primary ? "bid-min" : undefined}
          >
            {pending === q.amount ? <Spinner className="h-4 w-4 text-white" /> : q.primary ? <Gavel className="h-4 w-4" /> : null}
            {q.label}
          </button>
        ))}
        <button
          className="btn btn-danger"
          disabled={!!blocked || pending !== null || balance < minBid}
          onClick={() => place(balance)}
          title={t.auction.allInTitle}
        >
          <Flame className="h-4 w-4" /> {t.auction.allIn(balance)}
        </button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (customValid) void place(customValue);
        }}
      >
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-display text-zinc-400">$</span>
          <input
            className="input !pl-7 font-display tabular-nums"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={t.auction.customPlaceholder(minBid, balance)}
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            disabled={!!blocked}
            aria-label={t.auction.customAria}
            data-testid="bid-custom"
          />
        </div>
        <button type="submit" className="btn btn-ghost shrink-0" disabled={!!blocked || !customValid || pending !== null}>
          {t.auction.placeBid}
        </button>
      </form>
      {skip && (skip.available || skip.voted) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost !py-2"
            onClick={voteSkip}
            disabled={!skip.available || skip.voted || skipping}
            title={t.auction.skipTitle}
            data-testid="skip-button"
          >
            {skipping ? <Spinner className="h-4 w-4 text-white" /> : <SkipForward className="h-4 w-4" />}
            {t.auction.skip}
          </button>
          <span className="text-xs text-zinc-400" role="status">
            {skip.voted ? t.auction.skipVoted : skip.opponentWants ? t.auction.opponentWantsSkip : t.auction.skipTitle}
          </span>
        </div>
      )}
      {(blocked || error) && (
        <p className={cn("flex items-center gap-2 text-sm", error ? "text-rose-300" : "text-zinc-400")} role="status">
          <Ban className="h-4 w-4 shrink-0" />
          {error ?? blocked}
        </p>
      )}
    </div>
  );
}
