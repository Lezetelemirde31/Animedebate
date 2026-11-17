import { Brain, Flame, Shield, Zap } from "lucide-react";
import type { TacticalRole } from "@/game/arena";

export function RoleIcon({ role, className }: { role: TacticalRole; className?: string }) {
  switch (role) {
    case "TACTICIAN":
      return <Brain className={className} />;
    case "VANGUARD":
      return <Flame className={className} />;
    case "BLITZ":
      return <Zap className={className} />;
    case "BREAKER":
      return <Shield className={className} />;
  }
}
