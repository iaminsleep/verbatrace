import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AudioLines, Download, FileText, HardDrive, Loader2, Plus, Search, SlidersHorizontal, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { listLibrary } from "../api/projects";
import { downloadBackup, exportBackup, importBackup } from "../local/backup";
import { storageState } from "../local/storage";
import { DiagnosticLogsDialog } from "../components/library/DiagnosticLogsDialog";
import { diagnosticsAvailable, diagnosticsEnabled, logError, logEvent, setDiagnosticsEnabled, subscribeDiagnostics } from "../local/diagnostics";
import { NewRecordingDialog } from "../components/library/NewRecordingDialog";
import { RecordingCard } from "../components/library/RecordingCard";
import { Button } from "../components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuToggle, MenuTrigger } from "../components/ui/menu";
import { useLocale, useT } from "../i18n";
import type { Strings } from "../i18n/ru";
import { cn } from "../lib/cn";

function usePageDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;

    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setOver(true);
    };

    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) onFile(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFile]);

  return over;
}

function bytes(value: number, t: Strings): string {
  const mb = value / 1024 / 1024;
  return mb >= 1024 ? t.units.gigabytes((mb / 1024).toFixed(1)) : t.units.megabytes(Math.round(mb));
}

export default function Library() {
  const t = useT();
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [sort, setSort] = useState("newest");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dropped, setDropped] = useState<File | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const logsEnabled = useSyncExternalStore(subscribeDiagnostics, diagnosticsEnabled);
  const logsAvailable = useSyncExternalStore(subscribeDiagnostics, diagnosticsAvailable);
  const [backupBusy, setBackupBusy] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);

  const { data: projects, isLoading, isError, refetch } = useQuery({
    queryKey: ["library"],
    queryFn: listLibrary,
    refetchInterval: ({ state }) => state.data?.some((project) => project.audio_files.some((file) => file.status === "processing" || file.status === "pending")) ? 3000 : false,
  });

  const { data: storage } = useQuery({
    queryKey: ["storage", projects?.length ?? 0],
    queryFn: storageState,
    staleTime: 10_000,
  });

  const handleFile = useCallback((file: File) => {
    logEvent("recording.drop", { sizeBytes: file.size });
    setDropped(file);
    setDialogOpen(true);
  }, []);

  const dragging = usePageDrop(handleFile);
  const tags = useMemo(() => {
    const unique = new Map(projects?.flatMap((project) => project.tags.map((tag) => [tag.id, tag] as const)));
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [projects, locale]);
  const activeTag = tags.some((tag) => String(tag.id) === tagId) ? tagId : "";
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    return (projects ?? []).filter((project) =>
      !activeTag || project.tags.some((tag) => String(tag.id) === activeTag)
    ).flatMap((project) => {
      if (!term || project.name.toLocaleLowerCase(locale).includes(term)) return [project];
      const files = project.audio_files.filter((file) => file.filename.toLocaleLowerCase(locale).includes(term));
      return files.length ? [{ ...project, audio_files: files }] : [];
    }).sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, locale);
      const order = a.created_at.localeCompare(b.created_at);
      return sort === "oldest" ? order : -order;
    });
  }, [activeTag, locale, projects, query, sort]);
  const fileCounts = useMemo(() => new Map(projects?.map((project) => [project.id, project.audio_files.length])), [projects]);
  const total = projects?.reduce((count, project) => count + project.audio_files.length, 0) ?? 0;
  const newRecordingButton = useRef<HTMLButtonElement>(null);
  const openNew = () => {
    logEvent("recording.open_import");
    setDropped(null);
    setDialogOpen(true);
  };

  const saveBackup = async () => {
    logEvent("backup.save");
    setBackupBusy(true);
    try {
      downloadBackup(await exportBackup());
    } catch (error) {
      logError("backup.save_error", error);
      toast.error(t.library.backupFailed);
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreBackup = async (file: File) => {
    const confirmed = window.confirm(t.library.restoreConfirm);
    logEvent("backup.restore", { confirmed });
    if (!confirmed) return;
    setBackupBusy(true);
    try {
      await importBackup(file);
      window.location.reload();
    } catch (error) {
      logError("backup.restore_error", error);
      toast.error(t.library.restoreFailed);
      setBackupBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.library.title}</h1>
            {total > 0 ? <p className="mt-1 text-sm text-muted-foreground">{t.library.files(total)}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={backupInput}
              className="hidden"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void restoreBackup(file);
              }}
            />
            <Menu onOpenChange={(open) => { if (open) logEvent("settings.open"); }}>
              <MenuTrigger asChild>
                <Button ref={settingsTrigger} size="icon" aria-label={t.diagnostics.settings}><SlidersHorizontal /></Button>
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>{t.diagnostics.library}</MenuLabel>
                <MenuItem disabled={backupBusy} onSelect={() => void saveBackup()}><Download />{t.library.backup}</MenuItem>
                <MenuItem disabled={backupBusy} onSelect={() => backupInput.current?.click()}><Upload />{t.library.restore}</MenuItem>
                {storage ? (
                  <>
                    <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                      <HardDrive className="size-4" />
                      {t.library.storageUsed(bytes(storage.usage, t), bytes(storage.quota, t))}
                    </p>
                  </>
                ) : null}
                <MenuSeparator />
                <MenuToggle checked={logsEnabled} onCheckedChange={(next) => {
                  if (!setDiagnosticsEnabled(next)) toast.error(t.diagnostics.notSaved);
                }}>{t.diagnostics.enable}</MenuToggle>
                <MenuItem onSelect={() => { logEvent("diagnostics.open"); setLogsOpen(true); }}>
                  <FileText />{t.diagnostics.title}
                </MenuItem>
                {!logsAvailable ? <p className="max-w-64 px-2 py-1 text-xs text-destructive">{t.diagnostics.unavailable}</p> : null}
              </MenuContent>
            </Menu>
            <Button ref={newRecordingButton} variant="primary" disabled={backupBusy} onClick={openNew}>
              <Plus />{t.library.newRecording}
            </Button>
          </div>
        </header>

        {total > 0 && storage && !storage.persisted ? (
          <p className="storage-notice mb-4 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />{t.library.storageFragile}
          </p>
        ) : null}

        {isLoading ? (
          <div role="status" className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin text-accent" /></div>
        ) : isError ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="mb-3">{t.library.loadFailed}</p>
            <Button onClick={() => void refetch()}>{t.common.retry}</Button>
          </div>
        ) : !projects?.length ? (
          <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border bg-surface px-5 py-10 text-center">
            <div className="flex max-w-sm flex-col items-center gap-4">
              <span className="grid size-14 place-items-center rounded-lg bg-accent-soft text-accent"><AudioLines /></span>
              <Button onClick={openNew}><Upload />{t.library.chooseFile}</Button>
              <p className="text-sm text-muted-foreground">{t.library.empty}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,10rem)]">
              <label className="workspace-field col-span-2 flex items-center gap-2 sm:col-span-1">
                <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <input type="search" className="min-w-0 flex-1" aria-label={t.workspace.librarySearch}
                  placeholder={t.workspace.librarySearch} value={query} onChange={(event) => setQuery(event.currentTarget.value)}
                  onBlur={(event) => { if (event.currentTarget.value.trim()) logEvent("library.search"); }} />
              </label>
              <select className="workspace-field" aria-label={t.tags.label} value={activeTag} onChange={(event) => { const value = event.currentTarget.value; logEvent("library.filter_tag", { tagId: value ? Number(value) : null }); setTagId(value); }}>
                <option value="">{t.workspace.allTags}</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
              <select className="workspace-field" aria-label={t.workspace.sort} value={sort} onChange={(event) => { const value = event.currentTarget.value; logEvent("library.sort", { order: value }); setSort(value); }}>
                <option value="newest">{t.workspace.newest}</option>
                <option value="oldest">{t.workspace.oldest}</option>
                <option value="name">{t.workspace.byName}</option>
              </select>
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {visible.length ? visible.map((project) => <RecordingCard key={project.id} project={project} totalFiles={fileCounts.get(project.id) ?? 0} />) : (
                <p role="status" className="p-8 text-center text-sm text-muted-foreground">{t.workspace.noMatches}</p>
              )}
            </div>
          </>
        )}
      </div>

      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-3 z-40 rounded-lg border-2 border-dashed",
          "flex items-center justify-center text-sm font-medium transition-opacity duration-150",
          dragging
            ? "border-accent bg-background/80 text-accent opacity-100"
            : "border-transparent opacity-0",
        )}
      >
        {t.library.dropHere}
      </div>

      <DiagnosticLogsDialog open={logsOpen} onOpenChange={setLogsOpen} onCloseAutoFocus={(event) => {
        event.preventDefault();
        settingsTrigger.current?.focus();
      }} />
      <NewRecordingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialFile={dropped}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          newRecordingButton.current?.focus();
        }}
      />
    </div>
  );
}
