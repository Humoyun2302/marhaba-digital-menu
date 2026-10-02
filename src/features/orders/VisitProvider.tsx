import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { openGuestVisit } from "./api";
import {
  clearCompletionNotice,
  clearScopedCart,
  discardLegacyCart,
  readActiveVisit,
  readCompletionNotice,
  releaseVisitHolder,
  touchVisitHolder,
  writeActiveVisit,
  writeCompletionNotice,
  type ActiveVisit,
  type CompletionNotice,
} from "./storage";
import { VisitContext, type VisitValue } from "./visit-context";

export function VisitProvider({ children }: { children: ReactNode }) {
  const [visit, setVisit] = useState<ActiveVisit | null>(() => readActiveVisit());
  const [notice, setNotice] = useState<CompletionNotice | null>(() => readCompletionNotice());

  useEffect(() => {
    discardLegacyCart();
  }, []);

  useEffect(() => {
    if (!visit) return;
    const beat = () => touchVisitHolder(visit.token, visit.sessionId);
    beat();
    const timer = window.setInterval(beat, 8000);
    const release = () => releaseVisitHolder(visit.token);
    window.addEventListener("pagehide", release);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", release);
    };
  }, [visit]);

  const adopt = useCallback((next: ActiveVisit) => {
    writeActiveVisit(next);
    setVisit(next);
  }, []);

  const replaceVisit = useCallback(async (current: ActiveVisit) => {
    const next = await openGuestVisit(current.token, { forceNew: true });
    if (next.sessionId !== current.sessionId) clearScopedCart(current.token, current.sessionId);
    adopt({
      token: current.token,
      tableNumber: next.tableNumber,
      sessionId: next.sessionId,
      secret: next.secret,
      resumed: next.resumed,
      boundAt: Date.now(),
    });
  }, [adopt]);

  const startNewVisit = useCallback(async () => {
    if (!visit) return;
    await replaceVisit(visit);
  }, [replaceVisit, visit]);

  const finishVisit = useCallback(async (nextNotice: CompletionNotice) => {
    writeCompletionNotice(nextNotice);
    setNotice(nextNotice);
    if (!visit) return;
    await replaceVisit(visit);
  }, [replaceVisit, visit]);

  const dismissNotice = useCallback(() => {
    clearCompletionNotice();
    setNotice(null);
  }, []);

  const value = useMemo<VisitValue>(() => ({
    visit,
    notice,
    adopt,
    startNewVisit,
    finishVisit,
    dismissNotice,
  }), [adopt, dismissNotice, finishVisit, notice, startNewVisit, visit]);

  return <VisitContext.Provider value={value}>{children}</VisitContext.Provider>;
}
