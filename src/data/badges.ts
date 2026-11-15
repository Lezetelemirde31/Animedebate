import type { BadgeRuleType } from "@prisma/client";

export interface BadgeSeed {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  ruleType: BadgeRuleType;
  threshold: number;
}

export const BADGES: BadgeSeed[] = [
  {
    id: "badge-first-debate",
    slug: "first-debate",
    name: "Debate Starter",
    description: "Started your very first community anime debate.",
    icon: "Flame",
    color: "#f43f5e",
    ruleType: "DEBATES_COUNT",
    threshold: 1,
  },
  {
    id: "badge-debate-master",
    slug: "debate-master",
    name: "Forum Architect",
    description: "Created 5 or more community debates.",
    icon: "MessagesSquare",
    color: "#a855f7",
    ruleType: "DEBATES_COUNT",
    threshold: 5,
  },
  {
    id: "badge-vs-challenger",
    slug: "vs-challenger",
    name: "VS Challenger",
    description: "Created your first character comparison matchup.",
    icon: "Swords",
    color: "#38bdf8",
    ruleType: "COMPARISONS_COUNT",
    threshold: 1,
  },
  {
    id: "badge-active-voice",
    slug: "active-voice",
    name: "Active Voice",
    description: "Posted 5 comments across debates, comparisons, or characters.",
    icon: "MessageCircle",
    color: "#34d399",
    ruleType: "COMMENTS_COUNT",
    threshold: 5,
  },
  {
    id: "badge-fan-favorite",
    slug: "fan-favorite",
    name: "Community Favorite",
    description: "Received 10 likes from fellow anime fans.",
    icon: "Heart",
    color: "#fb7185",
    ruleType: "LIKES_RECEIVED",
    threshold: 10,
  },
  {
    id: "badge-rising-star",
    slug: "rising-star",
    name: "Rising Shinobi",
    description: "Reached Level 3 through community participation.",
    icon: "Zap",
    color: "#facc15",
    ruleType: "LEVEL_REACHED",
    threshold: 3,
  },
  {
    id: "badge-legendary-rank",
    slug: "legendary-rank",
    name: "Grandmaster",
    description: "Reached Level 5 in Anime Debate.",
    icon: "Crown",
    color: "#f59e0b",
    ruleType: "LEVEL_REACHED",
    threshold: 5,
  },
  {
    id: "badge-auction-victor",
    slug: "auction-victor",
    name: "Gavel Winner",
    description: "Won at least 1 character in a live auction.",
    icon: "Gavel",
    color: "#c084fc",
    ruleType: "AUCTION_WINS",
    threshold: 1,
  },
];
