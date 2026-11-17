"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ARENA_MAX_ROUNDS,
  ARENA_WINS_TO_WIN,
  DECK_SIZE,
  buildAutoDeck,
  chooseBotCard,
  resolveArenaRound,
  type ArenaCard,
} from "@/game/arena";
import type { ArenaRoomSnapshot, AvatarDTO, OpenArenaRoomDTO } from "@/game/types";
import { api } from "@/lib/client-api";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { ArenaBattleBoard } from "./ArenaBattleBoard";
import { DeckBuilderPanel } from "./DeckBuilderPanel";

const DECK_STORAGE_KEY = "anime_arena_deck_ids";

interface ArenaHubClientProps {
  user: {
    id: string;
    username: string;
    avatar: AvatarDTO;
  };
  playableCards: ArenaCard[];
  allCatalogCards: ArenaCard[];
  ownedIds: string[];
}

export function ArenaHubClient({
  user,
  playableCards,
  allCatalogCards,
  ownedIds,
}: ArenaHubClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const ownedIdSet = useMemo(() => new Set(ownedIds), [ownedIds]);
  const playableById = useMemo(() => new Map(playableCards.map((c) => [c.id, c])), [playableCards]);

  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>(() =>
    buildAutoDeck(playableCards).map((c) => c.id),
  );
  const [openRooms, setOpenRooms] = useState<OpenArenaRoomDTO[]>([]);
  const [pvpPending, setPvpPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo Bot match state
  const [botMatch, setBotMatch] = useState<ArenaRoomSnapshot | null>(null);
  const botHandRef = useRef<ArenaCard[]>([]);
  const botPowerDiffRef = useRef<{ p0: number; p1: number }>({ p0: 0, p1: 0 });
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autostartTriggeredRef = useRef(false);

  // Load saved deck selection from sessionStorage if valid
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DECK_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === DECK_SIZE && parsed.every((id) => playableById.has(id))) {
        setSelectedDeckIds(parsed);
      }
    } catch {
      // ignore invalid session storage
    }
  }, [playableById]);

  const handleChangeDeck = useCallback((ids: string[]) => {
    setSelectedDeckIds(ids);
    setError(null);
    try {
      sessionStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // ignore storage failure
    }
  }, []);

  // Poll open 1v1 PvP arena rooms via HTTP
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const res = await api<OpenArenaRoomDTO[]>("/api/arena/rooms");
      if (!stopped && res.ok) setOpenRooms(res.data);
    };
    void load();
    const id = setInterval(() => void load(), 4_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, []);

  const awardBotXp = useCallback(async (won: boolean, roundsPlayed: number) => {
    try {
      const res = await fetch("/api/arena/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ won, roundsPlayed }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.xpAwarded === "number") {
        setBotMatch((prev) => (prev ? { ...prev, xpAwarded: data.xpAwarded } : prev));
      }
    } catch {
      // ignore transient reward errors
    }
  }, []);

  const startBotMatchWithIds = useCallback(
    (deckIds: string[]) => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
      const myDeck = deckIds.map((id) => playableById.get(id)).filter((c): c is ArenaCard => Boolean(c));
      if (myDeck.length !== DECK_SIZE) return;

      const botDeck = buildAutoDeck(allCatalogCards, Math.random);
      botHandRef.current = [...botDeck];
      botPowerDiffRef.current = { p0: 0, p1: 0 };

      const botTotal = botDeck.reduce((s, c) => s + c.powerLevel, 0);
      const myTotal = myDeck.reduce((s, c) => s + c.powerLevel, 0);

      setBotMatch({
        code: "BOT",
        phase: "ATTACK",
        roundNumber: 1,
        attackerSeat: 0,
        players: [
          {
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            seat: 0,
            score: 0,
            cardsRemaining: DECK_SIZE,
            totalPower: myTotal,
            connected: true,
          },
          {
            userId: "tactical-bot",
            username: t.arena.botLabel,
            avatar: { style: "crimson", imageUrl: null },
            seat: 1,
            score: 0,
            cardsRemaining: DECK_SIZE,
            totalPower: botTotal,
            connected: true,
          },
        ],
        mySeat: 0,
        myHand: myDeck,
        attackerCard: null,
        lastResolution: null,
        history: [],
        winnerId: null,
        xpAwarded: null,
        createdAt: Date.now(),
      });
    },
    [allCatalogCards, playableById, t.arena.botLabel, user],
  );

  // Instant ?autostart=1 support
  useEffect(() => {
    if (autostartTriggeredRef.current) return;
    if (searchParams.get("autostart") === "1" && playableCards.length >= DECK_SIZE) {
      autostartTriggeredRef.current = true;
      const auto = buildAutoDeck(playableCards).map((c) => c.id);
      handleChangeDeck(auto);
      startBotMatchWithIds(auto);
    }
  }, [searchParams, playableCards, handleChangeDeck, startBotMatchWithIds]);

  const scheduleBotTurn = useCallback(
    (snapshot: ArenaRoomSnapshot) => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);

      const botIsAttacker = snapshot.phase === "ATTACK" && snapshot.attackerSeat === 1;
      const botIsDefender = snapshot.phase === "DEFEND" && snapshot.attackerSeat === 0;
      if (!botIsAttacker && !botIsDefender) return;

      botTimerRef.current = setTimeout(() => {
        botTimerRef.current = null;
        const botHand = botHandRef.current;
        if (botHand.length === 0) return;

        if (botIsAttacker) {
          const picked = chooseBotCard("ATTACK", botHand, null);
          botHandRef.current = botHand.filter((c) => c.id !== picked.id);
          setBotMatch((prev) => {
            if (!prev || prev.phase !== "ATTACK") return prev;
            const nextPlayers = prev.players.map((p) =>
              p.seat === 1 ? { ...p, cardsRemaining: botHandRef.current.length } : p,
            );
            return {
              ...prev,
              players: nextPlayers,
              attackerCard: picked,
              phase: "DEFEND",
            };
          });
          return;
        }

        // Bot defends against player's attackerCard
        if (!snapshot.attackerCard) return;
        const picked = chooseBotCard("DEFEND", botHand, snapshot.attackerCard);
        botHandRef.current = botHand.filter((c) => c.id !== picked.id);

        const resolution = resolveArenaRound(snapshot.roundNumber, 0, snapshot.attackerCard, picked);
        botPowerDiffRef.current.p0 += resolution.attackerTotal - resolution.defenderTotal;
        botPowerDiffRef.current.p1 += resolution.defenderTotal - resolution.attackerTotal;

        const nextHistory = [...snapshot.history, resolution];
        const nextPlayers = snapshot.players.map((p) => {
          const added = resolution.winnerSeat === p.seat ? 1 : 0;
          return p.seat === 1
            ? { ...p, score: p.score + added, cardsRemaining: botHandRef.current.length }
            : { ...p, score: p.score + added };
        });

        const p0 = nextPlayers[0];
        const p1 = nextPlayers[1];
        const finished =
          p0.score >= ARENA_WINS_TO_WIN ||
          p1.score >= ARENA_WINS_TO_WIN ||
          snapshot.roundNumber >= ARENA_MAX_ROUNDS ||
          (snapshot.myHand.length === 0 && botHandRef.current.length === 0);

        if (finished) {
          let winnerId: string | null = null;
          if (p0.score !== p1.score) winnerId = p0.score > p1.score ? p0.userId : p1.userId;
          else if (botPowerDiffRef.current.p0 !== botPowerDiffRef.current.p1) {
            winnerId = botPowerDiffRef.current.p0 > botPowerDiffRef.current.p1 ? p0.userId : p1.userId;
          }
          setBotMatch({
            ...snapshot,
            phase: "FINISHED",
            players: nextPlayers,
            attackerCard: null,
            lastResolution: resolution,
            history: nextHistory,
            winnerId,
          });
          void awardBotXp(winnerId === p0.userId, nextHistory.length);
          return;
        }

        // Briefly reveal clash then move to next round
        setBotMatch({
          ...snapshot,
          phase: "ROUND_REVEAL",
          players: nextPlayers,
          lastResolution: resolution,
          history: nextHistory,
        });

        const nextAttackerSeat: 0 | 1 =
          resolution.winnerSeat !== null ? resolution.winnerSeat : snapshot.attackerSeat === 0 ? 1 : 0;

        botTimerRef.current = setTimeout(() => {
          botTimerRef.current = null;
          setBotMatch((curr) => {
            if (!curr || curr.phase !== "ROUND_REVEAL") return curr;
            const nextState: ArenaRoomSnapshot = {
              ...curr,
              phase: "ATTACK",
              roundNumber: curr.roundNumber + 1,
              attackerSeat: nextAttackerSeat,
              attackerCard: null,
            };
            if (nextAttackerSeat === 1) {
              scheduleBotTurn(nextState);
            }
            return nextState;
          });
        }, 1250);
      }, 550);
    },
    [awardBotXp],
  );

  // Player picks a card in Solo Bot match
  const handleBotPlayCard = useCallback(
    (cardId: string) => {
      if (!botMatch) return;
      const card = botMatch.myHand.find((c) => c.id === cardId);
      if (!card) return;
      const remainingHand = botMatch.myHand.filter((c) => c.id !== cardId);

      if (botMatch.phase === "ATTACK" && botMatch.attackerSeat === 0) {
        const nextPlayers = botMatch.players.map((p) =>
          p.seat === 0 ? { ...p, cardsRemaining: remainingHand.length } : p,
        );
        const nextSnap: ArenaRoomSnapshot = {
          ...botMatch,
          phase: "DEFEND",
          players: nextPlayers,
          myHand: remainingHand,
          attackerCard: card,
        };
        setBotMatch(nextSnap);
        scheduleBotTurn(nextSnap);
        return;
      }

      if (botMatch.phase === "DEFEND" && botMatch.attackerSeat === 1 && botMatch.attackerCard) {
        const resolution = resolveArenaRound(botMatch.roundNumber, 1, botMatch.attackerCard, card);
        botPowerDiffRef.current.p1 += resolution.attackerTotal - resolution.defenderTotal;
        botPowerDiffRef.current.p0 += resolution.defenderTotal - resolution.attackerTotal;

        const nextHistory = [...botMatch.history, resolution];
        const nextPlayers = botMatch.players.map((p) => {
          const added = resolution.winnerSeat === p.seat ? 1 : 0;
          return p.seat === 0
            ? { ...p, score: p.score + added, cardsRemaining: remainingHand.length }
            : { ...p, score: p.score + added };
        });

        const p0 = nextPlayers[0];
        const p1 = nextPlayers[1];
        const finished =
          p0.score >= ARENA_WINS_TO_WIN ||
          p1.score >= ARENA_WINS_TO_WIN ||
          botMatch.roundNumber >= ARENA_MAX_ROUNDS ||
          (remainingHand.length === 0 && botHandRef.current.length === 0);

        if (finished) {
          let winnerId: string | null = null;
          if (p0.score !== p1.score) winnerId = p0.score > p1.score ? p0.userId : p1.userId;
          else if (botPowerDiffRef.current.p0 !== botPowerDiffRef.current.p1) {
            winnerId = botPowerDiffRef.current.p0 > botPowerDiffRef.current.p1 ? p0.userId : p1.userId;
          }
          setBotMatch({
            ...botMatch,
            phase: "FINISHED",
            players: nextPlayers,
            myHand: remainingHand,
            attackerCard: null,
            lastResolution: resolution,
            history: nextHistory,
            winnerId,
          });
          void awardBotXp(winnerId === p0.userId, nextHistory.length);
          return;
        }

        setBotMatch({
          ...botMatch,
          phase: "ROUND_REVEAL",
          players: nextPlayers,
          myHand: remainingHand,
          lastResolution: resolution,
          history: nextHistory,
        });

        const nextAttackerSeat: 0 | 1 =
          resolution.winnerSeat !== null ? resolution.winnerSeat : 0;

        if (botTimerRef.current) clearTimeout(botTimerRef.current);
        botTimerRef.current = setTimeout(() => {
          botTimerRef.current = null;
          setBotMatch((curr) => {
            if (!curr || curr.phase !== "ROUND_REVEAL") return curr;
            const nextState: ArenaRoomSnapshot = {
              ...curr,
              phase: "ATTACK",
              roundNumber: curr.roundNumber + 1,
              attackerSeat: nextAttackerSeat,
              attackerCard: null,
            };
            if (nextAttackerSeat === 1) {
              scheduleBotTurn(nextState);
            }
            return nextState;
          });
        }, 1250);
      }
    },
    [awardBotXp, botMatch, scheduleBotTurn],
  );

  async function handleCreatePvpRoom() {
    setPvpPending(true);
    setError(null);
    try {
      const res = await api<{ code: string }>("/api/arena/rooms", {
        body: { deckIds: selectedDeckIds },
      });
      if (!res.ok) {
        setError(res.message || t.errors.wrongDesc);
      } else {
        try {
          sessionStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(selectedDeckIds));
        } catch {
          // ignore
        }
        router.push(`/arena/${res.data.code}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errors.wrongDesc);
    } finally {
      setPvpPending(false);
    }
  }

  async function handleJoinPvpRoom(code: string) {
    setPvpPending(true);
    setError(null);
    try {
      sessionStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(selectedDeckIds));
    } catch {
      // ignore
    }
    router.push(`/arena/${code.toUpperCase()}`);
    setPvpPending(false);
  }

  if (botMatch) {
    return (
      <ArenaBattleBoard
        snapshot={botMatch}
        isBotMatch
        onPlayCard={handleBotPlayCard}
        onLeave={() => {
          if (botTimerRef.current) clearTimeout(botTimerRef.current);
          setBotMatch(null);
        }}
        onPlayAgain={() => startBotMatchWithIds(selectedDeckIds)}
      />
    );
  }

  return (
    <DeckBuilderPanel
      playableCards={playableCards}
      ownedIdSet={ownedIdSet}
      selectedDeckIds={selectedDeckIds}
      onChangeDeck={handleChangeDeck}
      onStartBotMatch={() => startBotMatchWithIds(selectedDeckIds)}
      onCreatePvpRoom={handleCreatePvpRoom}
      onJoinPvpRoom={handleJoinPvpRoom}
      openRooms={openRooms}
      socketConnected={true}
      pvpPending={pvpPending}
      error={error}
    />
  );
}
