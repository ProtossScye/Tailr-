"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface CurrentUser {
  /** Profile display name, or the part of the email before the @. */
  name: string;
  email: string;
  /** True when `name` came from the profile rather than the email. */
  hasDisplayName: boolean;
}

const UserContext = createContext<CurrentUser>({ name: "there", email: "", hasDisplayName: false });

export function UserProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  return useContext(UserContext);
}
