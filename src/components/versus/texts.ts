import type { Locale } from "@/lib/i18n";
import type { AbilityDef, AbilityKind, Archetype } from "@/game/versus/kit";
import type { Move, TurnEvent } from "@/game/versus/engine";
import { CHARACTER_TEXT_TR } from "@/data/characters/tr";

const pct = (n: number) => `%${Math.round(n * 100)}`;

export const VERSUS_TEXT = {
  tr: {
    title: "Anime 1v1",
    eyebrow: "Stratejik düello",
    headingStart: "Anime",
    headingAccent: "1v1",
    description: "Karakterini seç, her turda rakibinle aynı anda gizli hamle yap. Zar yok, şans yok — kazananı kararların belirler.",
    ranked: "Dereceli",
    rankedDesc: "Reytingine yakın bir rakiple eşleş. Kazandıkça ligin yükselir.",
    findMatch: "Rakip ara",
    searching: "Rakip aranıyor…",
    cancel: "Vazgeç",
    friendly: "Dostluk maçı",
    friendlyDesc: "Arkadaşına davet bağlantısı gönder ya da kodla bir odaya katıl. Reytingi etkilemez.",
    createRoom: "Oda oluştur",
    joinCode: "Oda kodu",
    join: "Katıl",
    practice: "Antrenman",
    practiceDesc: "Bota karşı oyna, karakterleri ve yetenekleri öğren. Günde ilk 15 maç ödül verir.",
    levels: { EASY: "Kolay", NORMAL: "Normal", HARD: "Zor" } as Record<string, string>,
    yourRating: "Reytingin",
    activeMatch: (code: string) => `Devam eden bir maçın var (${code}).`,
    backToMatch: "Maça dön",
    howTo: "Nasıl oynanır?",
    rules: [
      "Her oyuncu bir karakter seçer. Dereceli maçta seçimler gizlidir; ikiniz de seçince açılır.",
      "Her tur iki oyuncu aynı anda gizlice hamle seçer; süre 25 saniyedir.",
      "Saldırı: temel vuruş, +1 enerji. Savunma: hasarın yalnızca %35'ini alırsın, engellenen vuruşun %20'sini geri yansıtırsın, +1 enerji.",
      "Odaklan: +3 enerji kazanırsın ama o tur %25 fazla hasar alırsın.",
      "Yetenekler enerji harcar ve bekleme süresine girer. Savunma kırıcı yetenekler savunanı sersemletir.",
      "Hızlı olan önce vurur: rakibini nakavt ederse rakip vuramaz. Sersemletici vuruşu daha hızlı yaparsan rakibin hamlesini kesersin.",
      "Her tur herkes +1 enerji kazanır (en fazla 10). 20 tur sonunda canı (oransal) fazla olan kazanır.",
      "Üst üste 3 tur hamle seçmeyen oyuncu maçı kaybeder.",
    ],
    // draft
    pickTitle: "Karakterini seç",
    pickHint: "Bir karakter seç, niteliklerine ve yeteneklerine bak, sonra onayla.",
    search: "Karakter ara…",
    all: "Tümü",
    confirmPick: "Bu karakterle savaş",
    picked: "Seçildi",
    youPicked: "Seçimin kilitlendi. Rakip bekleniyor…",
    opponentPicking: "Rakip seçiyor…",
    opponentPicked: "Rakip seçimini yaptı",
    timeLeft: (s: number) => `${s} sn`,
    archetypes: { TANK: "Tank", BLITZ: "Hız", POWER: "Güç", TACTIC: "Taktik" } as Record<Archetype, string>,
    archetypeDesc: {
      TANK: "Yüksek can ve savunma; kalkan ve savunma kırıcı.",
      BLITZ: "En hızlı tip; kaçınma ve öncelikli vuruş.",
      POWER: "En yüksek saldırı; güçlenme ve yıkıcı final.",
      TACTIC: "Kontrol: sersemletme, enerji çalma, iyileşme.",
    } as Record<Archetype, string>,
    stats: { hp: "Can", atk: "Saldırı", def: "Savunma", spd: "Hız", energy: "Enerji" },
    cost: (n: number) => `${n} enerji`,
    cooldown: (n: number) => `${n} tur bekleme`,
    ultimate: "Final",
    // battle
    turn: (n: number, max: number) => `Tur ${n} / ${max}`,
    chooseMove: "Hamleni seç",
    waitingOpponent: "Hamlen kilitlendi. Rakip bekleniyor…",
    opponentReady: "Rakip hamlesini seçti",
    stunnedNow: "Sersemledin — bu tur hamle yapamazsın.",
    moves: { ATTACK: "Saldırı", DEFEND: "Savunma", FOCUS: "Odaklan" } as Record<string, string>,
    moveDesc: {
      ATTACK: "Temel vuruş · +1 enerji",
      DEFEND: "Hasarın %35'i · %20 yansıtma · +1 enerji",
      FOCUS: "+3 enerji · %25 fazla hasar alırsın",
    } as Record<string, string>,
    noEnergy: "Enerji yetersiz",
    onCooldown: (n: number) => `${n} tur sonra hazır`,
    lastTurn: "Son tur",
    log: "Maç kaydı",
    you: "Sen",
    status: {
      shield: (n: number) => `Kalkan ${n}`,
      empowered: "Güçlendi",
      counter: "Karşı saldırı hazır",
      stunned: "Sersem",
      immune: "Sersemlemeye bağışık",
    },
    // result
    victory: "Zafer",
    defeat: "Yenilgi",
    draw: "Berabere",
    reasons: {
      ko: "Nakavt",
      turns: "Tur sınırı",
      double_ko: "Çifte nakavt",
      forfeit: "Rakip maçtan çekildi",
      timeout: "Süre aşımı",
    } as Record<string, string>,
    youForfeited: "Maçtan çekildin",
    ratingChange: "Reyting",
    playAgain: "Tekrar oyna",
    rematch: "Rövanş",
    rematchWaiting: "Rakibin onayı bekleniyor…",
    opponentWantsRematch: "Rakibin rövanş istiyor",
    backToHub: "1v1 ana sayfası",
    forfeit: "Maçtan çekil",
    forfeitConfirm: "Maçtan çekilirsen kaybedersin (dereceli maçta reyting kaybedersin). Emin misin?",
    lobbyTitle: "Rakip bekleniyor",
    lobbyHint: "Bu bağlantıyı arkadaşına gönder; açınca odaya katılır.",
    copyLink: "Bağlantıyı kopyala",
    copied: "Kopyalandı",
    share: "Paylaş",
    shareText: (code: string) => `Anime 1v1'de benimle düello yap! Oda kodu: ${code}`,
    abandoned: "Bu oda kapandı.",
    spectating: "Bu maçı izliyorsun.",
    notFound: "Maç bulunamadı.",
    connectionLost: "Bağlantı sorunu — yeniden deneniyor…",
    bot: "Bot",
    closeRoom: "Odayı kapat",
    opponentThinking: "Düşünüyor…",
    moveChosen: "Hamle seçti",
    lockedMove: (name: string) => `Seçimin: ${name}`,
    waitingShort: "Rakip bekleniyor…",
    myTechniques: "Yeteneklerim",
    opponentTechniques: "Rakibin yetenekleri",
    kindShort: {
      STRIKE: "Vuruş",
      GUARD_BREAK: "Savunma kırıcı",
      SHIELD: "Kalkan",
      EVADE: "Kaçınma",
      EMPOWER: "Güçlenme",
      DRAIN: "Enerji çalma",
      STUN_STRIKE: "Sersemletme",
      HEAL: "İyileşme",
    } as Record<AbilityKind, string>,
    damage: (n: number) => `${n} hasar`,
    noLog: "Henüz tur oynanmadı.",
    finalHp: "Kalan can",
    searchingFor: (s: number) => `${s} sn`,
    ladder: "Sezon sıralaması",
    ladderEmpty: "Bu sezon henüz dereceli maç oynanmadı.",
    recent: "Son 1v1 maçların",
    fullLadder: "Tüm sıralama",
    loginToPlay: "Oynamak için giriş yap",
    noRating: "Henüz dereceli maç yok",
    vs: "VS",
    rosterCount: (n: number) => `${n} karakter`,
    noResults: "Bu filtreye uyan karakter yok.",
    xpEarned: (n: number) => `+${n} XP`,
  },
  en: {
    title: "Anime 1v1",
    eyebrow: "Strategic duel",
    headingStart: "Anime",
    headingAccent: "1v1",
    description: "Pick your fighter and choose a hidden move each turn, at the same time as your opponent. No dice, no luck — your decisions decide.",
    ranked: "Ranked",
    rankedDesc: "Get matched with an opponent near your rating. Win to climb the leagues.",
    findMatch: "Find opponent",
    searching: "Searching…",
    cancel: "Cancel",
    friendly: "Friendly match",
    friendlyDesc: "Send a friend an invite link or join a room with a code. Doesn't affect rating.",
    createRoom: "Create room",
    joinCode: "Room code",
    join: "Join",
    practice: "Practice",
    practiceDesc: "Play a bot and learn the fighters and techniques. The first 15 matches a day are rewarded.",
    levels: { EASY: "Easy", NORMAL: "Normal", HARD: "Hard" } as Record<string, string>,
    yourRating: "Your rating",
    activeMatch: (code: string) => `You have a match in progress (${code}).`,
    backToMatch: "Back to match",
    howTo: "How to play",
    rules: [
      "Each player picks one fighter. In ranked, picks are hidden until both have chosen.",
      "Every turn both players secretly choose a move at the same time; you have 25 seconds.",
      "Attack: basic hit, +1 energy. Defend: take only 35% damage and reflect 20% of a blocked hit, +1 energy.",
      "Focus: gain +3 energy but take 25% more damage that turn.",
      "Techniques cost energy and go on cooldown. Guard breakers stun a defender.",
      "The faster fighter hits first: a knock-out stops the slower move. A faster stun-strike interrupts the opponent.",
      "Everyone gains +1 energy per turn (max 10). After 20 turns the healthier fighter (by %) wins.",
      "Miss 3 turns in a row and you lose the match.",
    ],
    pickTitle: "Pick your fighter",
    pickHint: "Select a character, check stats and techniques, then confirm.",
    search: "Search characters…",
    all: "All",
    confirmPick: "Fight with this character",
    picked: "Picked",
    youPicked: "Your pick is locked in. Waiting for the opponent…",
    opponentPicking: "Opponent is picking…",
    opponentPicked: "Opponent has picked",
    timeLeft: (s: number) => `${s}s`,
    archetypes: { TANK: "Tank", BLITZ: "Speed", POWER: "Power", TACTIC: "Tactics" } as Record<Archetype, string>,
    archetypeDesc: {
      TANK: "High health and defense; shield and guard break.",
      BLITZ: "Fastest style; evasion and priority strikes.",
      POWER: "Highest attack; power-up and a devastating finisher.",
      TACTIC: "Control: stuns, energy drain, healing.",
    } as Record<Archetype, string>,
    stats: { hp: "Health", atk: "Attack", def: "Defense", spd: "Speed", energy: "Energy" },
    cost: (n: number) => `${n} energy`,
    cooldown: (n: number) => `${n}-turn cooldown`,
    ultimate: "Ultimate",
    turn: (n: number, max: number) => `Turn ${n} / ${max}`,
    chooseMove: "Choose your move",
    waitingOpponent: "Move locked in. Waiting for the opponent…",
    opponentReady: "Opponent has chosen",
    stunnedNow: "You are stunned — you can't act this turn.",
    moves: { ATTACK: "Attack", DEFEND: "Defend", FOCUS: "Focus" } as Record<string, string>,
    moveDesc: {
      ATTACK: "Basic hit · +1 energy",
      DEFEND: "35% damage · 20% reflect · +1 energy",
      FOCUS: "+3 energy · take 25% more damage",
    } as Record<string, string>,
    noEnergy: "Not enough energy",
    onCooldown: (n: number) => `Ready in ${n}`,
    lastTurn: "Last turn",
    log: "Match log",
    you: "You",
    status: {
      shield: (n: number) => `Shield ${n}`,
      empowered: "Empowered",
      counter: "Counter ready",
      stunned: "Stunned",
      immune: "Stun immune",
    },
    victory: "Victory",
    defeat: "Defeat",
    draw: "Draw",
    reasons: {
      ko: "Knock-out",
      turns: "Turn limit",
      double_ko: "Double knock-out",
      forfeit: "Opponent left",
      timeout: "Timed out",
    } as Record<string, string>,
    youForfeited: "You left the match",
    ratingChange: "Rating",
    playAgain: "Play again",
    rematch: "Rematch",
    rematchWaiting: "Waiting for your opponent…",
    opponentWantsRematch: "Your opponent wants a rematch",
    backToHub: "1v1 home",
    forfeit: "Forfeit",
    forfeitConfirm: "Leaving loses the match (and rating in ranked). Are you sure?",
    lobbyTitle: "Waiting for an opponent",
    lobbyHint: "Send this link to a friend; opening it joins the room.",
    copyLink: "Copy link",
    copied: "Copied",
    share: "Share",
    shareText: (code: string) => `Duel me in Anime 1v1! Room code: ${code}`,
    abandoned: "This room was closed.",
    spectating: "You are watching this match.",
    notFound: "Match not found.",
    connectionLost: "Connection problem — retrying…",
    bot: "Bot",
    closeRoom: "Close room",
    opponentThinking: "Thinking…",
    moveChosen: "Move chosen",
    lockedMove: (name: string) => `Your move: ${name}`,
    waitingShort: "Waiting for the opponent…",
    myTechniques: "My techniques",
    opponentTechniques: "Opponent's techniques",
    kindShort: {
      STRIKE: "Strike",
      GUARD_BREAK: "Guard break",
      SHIELD: "Shield",
      EVADE: "Evade",
      EMPOWER: "Power-up",
      DRAIN: "Energy drain",
      STUN_STRIKE: "Stun",
      HEAL: "Heal",
    } as Record<AbilityKind, string>,
    damage: (n: number) => `${n} damage`,
    noLog: "No turns played yet.",
    finalHp: "Health left",
    searchingFor: (s: number) => `${s}s`,
    ladder: "Season ladder",
    ladderEmpty: "No ranked matches this season yet.",
    recent: "Your recent 1v1 matches",
    fullLadder: "Full ladder",
    loginToPlay: "Log in to play",
    noRating: "No ranked matches yet",
    vs: "VS",
    rosterCount: (n: number) => `${n} characters`,
    noResults: "No characters match this filter.",
    xpEarned: (n: number) => `+${n} XP`,
  },
};

export type VersusTexts = (typeof VERSUS_TEXT)["tr"];

/** A technique's name in the reader's language. */
export function abilityName(characterId: string, ab: AbilityDef, locale: Locale): string {
  if (locale === "tr") return CHARACTER_TEXT_TR[characterId]?.abilities[ab.nameIndex] ?? ab.name;
  return ab.name;
}

const KIND_TEXT: Record<Locale, Record<AbilityKind, (ab: AbilityDef) => string>> = {
  tr: {
    STRIKE: (a) => `${a.power}× güçlü vuruş${a.priority ? " · öncelikli (önce vurur)" : ""}.`,
    GUARD_BREAK: (a) => `${a.power}× vuruş; savunmayı deler ve savunan rakibi bir tur sersemletir.`,
    SHIELD: () => `Bu tur ve sonraki tur, canının %25'i kadar hasarı emen kalkan.`,
    EVADE: () => `Bu tur gelen tüm hasardan kaçar; başarılı olursa sonraki vuruşun +%50.`,
    EMPOWER: () => `Bu veya sonraki turdaki hasarlı hamlen +%60 güçlenir.`,
    DRAIN: (a) => `${a.power}× vuruş ve rakipten 2 enerji çalar.`,
    STUN_STRIKE: (a) => `${a.power}× vuruş. Rakipten hızlıysan hamlesini keser; değilsen onu sonraki tur sersemletir.`,
    HEAL: () => `Canının %18'ini yeniler.`,
  },
  en: {
    STRIKE: (a) => `${a.power}× strike${a.priority ? " · priority (hits first)" : ""}.`,
    GUARD_BREAK: (a) => `${a.power}× hit that pierces Defend and stuns a defender for a turn.`,
    SHIELD: () => `A shield that absorbs 25% of your health in damage this turn and next.`,
    EVADE: () => `Dodge all damage this turn; a successful dodge gives your next hit +50%.`,
    EMPOWER: () => `Your damaging move this or next turn deals +60%.`,
    DRAIN: (a) => `${a.power}× hit that steals 2 energy.`,
    STUN_STRIKE: (a) => `${a.power}× hit. If you are faster it interrupts the opponent; otherwise it stuns them next turn.`,
    HEAL: () => `Restore 18% of your health.`,
  },
};

export function abilityDescription(ab: AbilityDef, locale: Locale): string {
  return KIND_TEXT[locale][ab.kind](ab);
}

export function moveName(move: Move, characterId: string, abilities: AbilityDef[], locale: Locale): string {
  const t = VERSUS_TEXT[locale];
  if (move.type !== "ABILITY") return t.moves[move.type];
  const ab = abilities.find((a) => a.id === move.abilityId);
  return ab ? abilityName(characterId, ab, locale) : "?";
}

/** Short labels for what happened to a fighter in a turn. */
export function eventText(e: TurnEvent, locale: Locale): string {
  const tr = locale === "tr";
  switch (e.kind) {
    case "stunned":
      return tr ? "sersem, hamle yapamadı" : "stunned, couldn't act";
    case "timeout":
      return tr ? "süre doldu (otomatik savunma)" : "time ran out (auto defend)";
    case "blocked":
      return tr ? "savundu" : "blocked";
    case "reflected":
      return tr ? `${e.amount} hasar yansıttı` : `reflected ${e.amount}`;
    case "guard_broken":
      return tr ? "savunması kırıldı" : "guard broken";
    case "evaded":
      return tr ? "kaçtı" : "evaded";
    case "counter":
      return tr ? "karşı saldırı" : "counter-attack";
    case "shield_up":
      return tr ? `${e.amount} kalkan` : `${e.amount} shield`;
    case "shield_absorbed":
      return tr ? `kalkan ${e.amount} emdi` : `shield absorbed ${e.amount}`;
    case "empower_up":
      return tr ? "güçlendi" : "powered up";
    case "empowered_hit":
      return tr ? "güçlü vuruş" : "empowered hit";
    case "vulnerable":
      return tr ? "odaklanırken açık verdi" : "caught focusing";
    case "interrupted":
      return tr ? "hamlesi kesildi" : "interrupted";
    case "stun_applied":
      return tr ? "sersemledi" : "stunned";
    case "drained":
      return tr ? `${e.amount} enerji çaldı` : `stole ${e.amount} energy`;
    case "healed":
      return tr ? `${e.amount} can yeniledi` : `healed ${e.amount}`;
    case "ko":
      return tr ? "nakavt!" : "knocked out!";
  }
}

export { pct };
