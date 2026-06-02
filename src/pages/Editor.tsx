import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Bookmark, FileX, Loader2, NotebookPen, Search, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPeaks } from "../local/player/peaks";
import { ExportMenu } from "../components/editor/ExportMenu";
import { ProcessingScreen } from "../components/editor/ProcessingScreen";
import { SearchOverlay } from "../components/editor/SearchOverlay";
import { BookmarksPanel } from "../components/panels/BookmarksPanel";
import { NotesPanel } from "../components/panels/NotesPanel";
import { SpeakersBar } from "../components/panels/SpeakersBar";
import { PlayerDock } from "../components/player/PlayerDock";
import { TranscriptView } from "../components/transcript/TranscriptView";
import { buildModel } from "../components/transcript/model";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Tooltip } from "../components/ui/tooltip";
import { useBookmarks } from "../hooks/useBookmarks";
import { usePipelineState } from "../hooks/usePipeline";
import {
  useAudioUrl,
  useFileStatus,
  useIdentifySpeakers,
  useReassignSegmentSpeaker,
  useRenameSpeaker,
  useTranscriptData,
} from "../hooks/useTranscript";
import { useT } from "../i18n";
import { NotFoundError } from "../local/db";
import { player } from "../local/player/audio";
import { logEvent } from "../local/diagnostics";
import { clock } from "../local/player/clock";
import type { Stage } from "../local/pipeline/run";

type Panel = "notes" | "bookmarks";

function processingError(message: string, t: ReturnType<typeof useT>): { title: string; advice?: string } {
  if (message.startsWith("media-lost:")) return { title: t.editor.mediaLost, advice: t.editor.retryImport };
  if (message.startsWith("undecodable:")) return { title: t.editor.undecodable, advice: t.editor.convertAudio };
  if (message === "no-audio" || message === "В записи нет звука") return { title: t.editor.noAudio };
  if (message === "model-failed") return { title: t.editor.modelFailed };
  return { title: t.editor.processingFailed, advice: t.editor.retryImport };
}

export default function Editor() {
  const t = useT();
  const { fileId: raw } = useParams<{ fileId: string }>();
  const parsed = raw ? Number(raw) : Number.NaN;
  const fileId = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const [panel, setPanel] = useState<Panel | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [found, setFound] = useState<Set<number> | null>(null);
  const [goTo, setGoTo] = useState<{ index: number } | null>(null);
  const [filterSpeakerId, setFilterSpeakerId] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const [clip, setClip] = useState<{ startMs: number; endMs: number } | null>(null);

  const searchButton = useRef<HTMLButtonElement>(null);
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 960px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setPanel(null);
    setSearchOpen(false);
    setFound(null);
    setGoTo(null);
    setFilterSpeakerId(null);
    setFollow(true);
    setClip(null);
  }, [fileId]);

  const { data: status, isError, error } = useFileStatus(fileId);
  const ready = status?.status === "ready";
  const failed = status?.status === "error";

  const { data: transcript, isError: isTranscriptError } = useTranscriptData(fileId, ready);
  const { data: audio } = useAudioUrl(fileId, ready);
  const { data: peaks } = useQuery({
    queryKey: ["peaks", fileId],
    queryFn: () => getPeaks(fileId),
    enabled: ready,
    staleTime: Infinity,
  });

  const pipeline = usePipelineState();
  const live = pipeline.fileId === fileId;

  const model = useMemo(() => buildModel(transcript), [transcript]);
  const speakers = transcript?.speakers ?? [];

  const { bookmarks, create, remove } = useBookmarks(fileId);
  const identifySpeakers = useIdentifySpeakers(fileId);
  const rename = useRenameSpeaker(fileId);
  const reassign = useReassignSegmentSpeaker(fileId);

  const handleReassign = useCallback(
    (turnFrom: number, speakerId: number | null) => {
      const turn = model.turns.find((one) => one.from === turnFrom);
      if (turn?.id != null) reassign.mutate({ segmentId: turn.id, speakerId });
    },
    [model.turns, reassign],
  );

  const goToWord = useCallback(
    (index: number, startMs: number) => {
      setFilterSpeakerId(null);
      setGoTo({ index });
      player.seek(startMs);
      setSearchOpen(false);
    },
    [],
  );

  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        logEvent("transcript.search_open", { fileId, via: "keyboard" });
        setSearchOpen(true);
        return;
      }
      if (typing || target?.closest("button, a, select, [role=slider]") || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.code === "Space") {
        event.preventDefault();
        player.toggle();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        player.skip(-5000);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        player.skip(5000);
      } else if (event.key === "b" || event.key === "и") {

        create({ start_ms: Math.round(clock.now) });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [create, fileId, ready]);

  if (!fileId || (isError && error instanceof NotFoundError)) {
    return (
      <Centered icon={<FileX className="size-6" />} title={t.editor.notFound} />
    );
  }
  if (isError) {
    return (
      <Centered icon={<AlertTriangle className="size-6" />} title={t.editor.loadFailed} />
    );
  }
  if (failed) {
    const { title, advice } = processingError(status?.error_message ?? "", t);
    return (
      <Centered icon={<AlertTriangle className="size-6" />} title={title}>
        {advice}
      </Centered>
    );
  }
  if (!ready) {
    return (
      <ProcessingScreen
        status={status?.status ?? "pending"}
        stage={live ? pipeline.stage : ((status?.stage as Stage | null) ?? null)}
        percent={live ? pipeline.percent : (status?.progress_percent ?? null)}
        filename={status?.filename}
        queued={pipeline.queued}
      />
    );
  }

  const panelBody = panel === "notes"
    ? <NotesPanel fileId={fileId} />
    : <BookmarksPanel bookmarks={bookmarks} onCreate={create} onDelete={remove} />;

  const panelTitle = panel === "notes" ? t.editor.notes : t.editor.bookmarks;

  const closePanel = () => {
    logEvent("editor.panel_close", { fileId });
    setPanel(null);
    panelTrigger.current?.focus();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-surface px-3 py-2 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full">
          <Button asChild size="icon" variant="ghost" aria-label={t.workspace.backToLibrary}>
            <Link to="/"><ArrowLeft /></Link>
          </Button>
          <div className="min-w-0">
            <h1 title={status?.project_name || status?.filename || undefined} className="truncate text-base font-semibold sm:text-lg">
              {status?.project_name || status?.filename}
            </h1>
            {status?.project_name && status.filename ? (
              <p title={status.filename} className="truncate text-xs text-muted-foreground">{status.filename}</p>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Tooltip label={t.editor.search}>
            <Button ref={searchButton} variant="ghost" size="icon" aria-label={t.editor.search} onClick={() => { logEvent("transcript.search_open", { fileId, via: "button" }); setSearchOpen(true); }}>
              <Search />
            </Button>
          </Tooltip>
          {(["notes", "bookmarks"] as const).map((item) => (
            <Tooltip key={item} label={t.editor[item]}>
              <Button
                variant={panel === item ? "secondary" : "ghost"}
                size="icon"
                aria-label={t.editor[item]}
                aria-expanded={panel === item}
                onClick={(event) => {
                  logEvent("editor.panel", { fileId, panel: item, open: panel !== item });
                  panelTrigger.current = event.currentTarget;
                  setPanel(panel === item ? null : item);
                }}
              >
                {item === "notes" ? <NotebookPen /> : <Bookmark />}
              </Button>
            </Tooltip>
          ))}
          <ExportMenu key={fileId} fileId={fileId} clip={clip} onClipChange={setClip} durationMs={model.durationMs} />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-2 sm:p-4">
        <section className="transcript-paper" aria-label={t.workspace.transcript}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 sm:px-5">
            <h2 className="text-sm font-semibold">{t.workspace.transcript}</h2>
            {speakers.length > 0 ? (
              <SpeakersBar speakers={speakers} activeId={filterSpeakerId} onChange={(speakerId) => { logEvent("transcript.filter_speaker", { fileId, speakerId }); setFilterSpeakerId(speakerId); }} />
            ) : model.words.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => { logEvent("speaker.identify", { fileId }); identifySpeakers.mutate(); }} disabled={pipeline.fileId != null || identifySpeakers.isPending}
                aria-busy={identifySpeakers.isPending}>
                {identifySpeakers.isPending ? <Loader2 className="animate-spin" /> : <Users />}
                {identifySpeakers.isPending ? t.processing.identifyingSpeakers : t.editor.findSpeakers}
              </Button>
            ) : null}
          </div>
          {status.error_message ? (
            <p className="mx-3 mt-2 max-h-24 shrink-0 overflow-y-auto rounded-md bg-warning/10 px-3 py-2 text-sm text-warning" role="status">
              {status.error_message === "speakers-failed: no-voices" ? t.editor.speakersNone : t.editor.speakersFailed}
            </p>
          ) : null}

          {model.words.length ? (
            <div className="min-h-0 flex-1">
              <TranscriptView
                key={fileId}
                model={model}
                speakers={speakers}
                found={found}
                goTo={goTo}
                clip={clip}
                filterSpeakerId={filterSpeakerId}
                follow={follow}
                onFollowChange={setFollow}
                onRenameSpeaker={(speakerId, displayName) => rename.mutate({ speakerId, displayName })}
                onReassign={handleReassign}
                onPickedChange={setClip}
              />
            </div>
          ) : (
            <p role="status" className="grid min-h-0 flex-1 place-items-center p-4 text-center text-sm text-muted-foreground">
              {transcript ? t.workspace.noSpeech : isTranscriptError ? t.editor.loadFailed : t.workspace.loading}
            </p>
          )}
        </section>

        {wide && panel ? (
          <aside className="flex w-[19rem] min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface" aria-label={panelTitle}>
            <div className="flex items-center justify-between border-b border-border px-3 py-1">
              <h2 className="text-sm font-semibold">{panelTitle}</h2>
              <Button variant="ghost" size="icon" aria-label={t.common.close} onClick={closePanel}><X /></Button>
            </div>
            <div key={panel} className="min-h-0 flex-1">{panelBody}</div>
          </aside>
        ) : null}
      </div>

      {audio?.url ? <PlayerDock key={fileId} src={audio.url} peaks={peaks ?? null} fallbackDurationMs={model.durationMs} /> : null}

      {!wide && panel ? (
        <Dialog open onOpenChange={(open) => { if (!open) setPanel(null); }}>
          <DialogContent title={panelTitle} closeLabel={t.common.close} className="max-sm:top-auto max-sm:bottom-2 max-sm:translate-y-0"
            onCloseAutoFocus={(event) => { event.preventDefault(); panelTrigger.current?.focus(); }}>
            <div className="h-[min(26rem,55dvh)]">{panelBody}</div>
          </DialogContent>
        </Dialog>
      ) : null}

      <SearchOverlay
        key={fileId}
        fileId={fileId}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onFound={setFound}
        onGo={goToWord}
        triggerRef={searchButton}
      />
    </div>
  );
}

function Centered({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center">
        <span className="text-muted-foreground">{icon}</span>
        <h1 className="text-lg font-semibold">{title}</h1>
        {children ? <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p> : null}
        <Button asChild><Link to="/"><ArrowLeft />{t.workspace.backToLibrary}</Link></Button>
      </div>
    </div>
  );
}
