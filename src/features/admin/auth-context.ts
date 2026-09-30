import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

export type AuthValue = {
  session: Session | null;
  ready: boolean;
};

export const AuthContext = createContext<AuthValue>({ session: null, ready: false });

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
