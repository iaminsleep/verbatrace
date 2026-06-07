import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "../../i18n";
import { exportDiagnosticSession, listDiagnosticSessions, logEvent, type DiagnosticSession } from "../../local/diagnostics";
import { download } from "../../local/export";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";

export function DiagnosticLogsDialog({ open, onOpenChange, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [sessions, setSessions] = useState<DiagnosticSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSessions(null);
    setFailed(false);
    let current = true;
    void listDiagnosticSessions().then((rows) => {
      if (current) setSessions(rows);
    }, () => {
      if (current) setFailed(true);
    });
    return () => { current = false; };
  }, [open]);

  async function save(id: string) {
    setDownloading(id);
    try {
      logEvent("diagnostics.download");
      download(await exportDiagnosticSession(id));
    } catch {
      toast.error(t.diagnostics.failed);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.diagnostics.title} description={t.diagnostics.description}
        closeLabel={t.common.close} onCloseAutoFocus={onCloseAutoFocus}>
        {failed || !sessions?.length ? (
          <p role="status" className="rounded-md bg-elevated p-3 text-sm text-muted-foreground">
            {failed ? t.diagnostics.failed : sessions ? t.diagnostics.empty : t.workspace.loading}
          </p>
        ) : (
          <ul className="max-h-[min(24rem,50dvh)] divide-y divide-border overflow-y-auto rounded-md border border-border">
            {sessions.map((session) => {
              const date = new Date(session.startedAt).toLocaleString(locale);
              return (
                <li key={session.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
                  <time dateTime={session.startedAt} className="min-w-0 break-words text-sm tabular-nums">{date}</time>
                  <Button size="icon" variant="ghost" disabled={downloading !== null}
                    aria-label={`${t.diagnostics.download}: ${date}`} onClick={() => void save(session.id)}>
                    <Download />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
