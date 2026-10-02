import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/toast-context";
import { AdminPageHeader, Button, DialogActions } from "../../components/ui";
import { fetchTableBoard, releaseTable, type TableBoardRow } from "../../features/orders/api";
import { formatTableNumber } from "../../features/qr/url";
import { useLanguage } from "../../i18n/language";

export function TablesPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<TableBoardRow | null>(null);
  const board = useQuery({ queryKey: ["admin-tables"], queryFn: fetchTableBoard });

  const release = useMutation({
    mutationFn: async (action: "cancel" | "serve") => {
      if (!target) throw new Error("MISSING");
      return releaseTable(target.tableNumber, action);
    },
    onSuccess: async () => {
      setTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-tables"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.push("success", t.releaseDone);
    },
    onError: () => toast.push("error", t.orderFailed),
  });

  return (
    <div>
      <AdminPageHeader title={t.tables} description={t.tablesSubtitle} />
      {board.isLoading ? <p className="mt-6 text-sm text-muted">{t.loading}</p> : null}
      {board.isError ? <p className="mt-6 text-sm text-burgundy">{t.migrationOrders}</p> : null}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {(board.data ?? []).map((row) => (
          <article key={row.tableNumber} className="rounded-[22px] border border-line bg-paper p-4">
            <p className="font-serif text-3xl text-ink">№{formatTableNumber(row.tableNumber)}</p>
            <p className="mt-2 text-sm text-muted">{t.activeOrdersShort.replace("{n}", String(row.activeOrders))}</p>
            <Button className="mt-4 w-full" variant="secondary" onClick={() => setTarget(row)}>
              {t.releaseTable}
            </Button>
          </article>
        ))}
      </div>
      <Dialog
        open={Boolean(target)}
        title={t.releaseTitle.replace("{n}", formatTableNumber(target?.tableNumber ?? 0))}
        closeLabel={t.close}
        onClose={() => {
          if (!release.isPending) setTarget(null);
        }}
        footer={
          <DialogActions>
            <Button variant="secondary" disabled={release.isPending} onClick={() => setTarget(null)}>{t.cancel}</Button>
            {(target?.activeOrders ?? 0) > 0 ? (
              <>
                <Button variant="secondary" loading={release.isPending} onClick={() => release.mutate("cancel")}>{t.releaseCancelOrders}</Button>
                <Button loading={release.isPending} onClick={() => release.mutate("serve")}>{t.releaseServeOrders}</Button>
              </>
            ) : (
              <Button loading={release.isPending} onClick={() => release.mutate("cancel")}>{t.releaseTable}</Button>
            )}
          </DialogActions>
        }
      >
        <p className="text-sm leading-relaxed text-ink">{(target?.activeOrders ?? 0) > 0 ? t.releaseChoose : t.releaseIdle}</p>
      </Dialog>
    </div>
  );
}
