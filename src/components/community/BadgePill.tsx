import { Award, Crown, Flame, Gavel, Gem, Heart, Library, MessageCircle, MessagesSquare, Shield, Star, Swords, Trophy, Zap } from "lucide-react";

const ICON_MAP = {
  Flame,
  MessagesSquare,
  Swords,
  MessageCircle,
  Heart,
  Zap,
  Crown,
  Gavel,
  Library,
  Gem,
  Shield,
  Trophy,
  Star,
} as const;

export function BadgePill({
  name,
  description,
  icon,
  color,
}: {
  name: string;
  description: string;
  icon: string;
  color: string;
}) {
  const Icon = ICON_MAP[icon as keyof typeof ICON_MAP] ?? Award;
  return (
    <div
      title={description}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:scale-[1.02]"
      style={{
        borderColor: `${color}55`,
        background: `${color}18`,
        color: "#f4f4f5",
      }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span>{name}</span>
    </div>
  );
}
