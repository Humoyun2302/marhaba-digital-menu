import { createContext, useContext } from "react";
import type { ActiveVisit, CompletionNotice } from "./storage";

export type VisitValue = {
  visit: ActiveVisit | null;
  notice: CompletionNotice | null;
  adopt: (visit: ActiveVisit) => void;
  startNewVisit: () => Promise<void>;
  finishVisit: (notice: CompletionNotice) => Promise<void>;
  dismissNotice: () => void;
};

export const VisitContext = createContext<VisitValue | null>(null);

export function useVisit(): VisitValue {
  const value = useContext(VisitContext);
  if (!value) throw new Error("VisitProvider is missing");
  return value;
}
