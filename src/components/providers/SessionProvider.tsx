"use client";

import { createContext, useContext } from "react";

export interface ClientUser {
  id: string;
  username: string;
  avatarStyle: string;
  avatarImage: string | null;
}

const SessionContext = createContext<ClientUser | null>(null);

export function SessionProvider({ user, children }: { user: ClientUser | null; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useCurrentUser(): ClientUser | null {
  return useContext(SessionContext);
}
