"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@prisma/client";

export interface ClientUser {
  id: string;
  username: string;
  role: UserRole;
  bio: string | null;
  xp: number;
  level: number;
  avatarStyle: string;
  avatarImage: string | null;
  unreadNotifications: number;
}

const SessionContext = createContext<ClientUser | null>(null);

export function SessionProvider({ user, children }: { user: ClientUser | null; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useCurrentUser(): ClientUser | null {
  return useContext(SessionContext);
}
