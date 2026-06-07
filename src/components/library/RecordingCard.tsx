import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AudioLines, Clock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { memo } from "react";
import { Link } from "react-router-dom";
import { deleteAudioFile } from "../../api/projects";
import { RecordingBusyError } from "../../local/db";
import { logEvent } from "../../local/diagnostics";
import { useT } from "../../i18n";
import type { Strings } from "../../i18n/ru";
import type { AudioFile, ProjectDetail } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { TagMenu } from "./TagMenu";

function formatDuration(ms: number | null, t: Strings): string {
  if (ms == null) return "";
  const total = Math.round(ms / 1000);
  if (total < 60) return t.units.seconds(total);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? t.units.hoursMinutes(h, m) : t.units.minutes(m);
}

function formatSize(bytes: number | null, t: Strings): string {
  if (!bytes) return "";
  return bytes >= 1_048_576
    ? t.units.megabytes(Math.round(bytes / 1_048_576))
    : t.units.kilobytes(Math.round(bytes / 1024));
}

function StatusMark({ file }: { file: AudioFile }) {
  const t = useT();
  if (file.status === "ready") {
    return file.duration_ms == null ? null : (
      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
        <Clock aria-hidden className="size-3.5" />{formatDuration(file.duration_ms, t)}
      </span>
    );
  }
  if (file.status === "error") {
    return (
      <Badge variant="danger">
        <AlertCircle className="size-3" />
        {t.editor.processingFailed}
      </Badge>
    );
  }
  return (
    <Badge variant="accent">
      <Loader2 className="size-3 animate-spin" />
      {file.status === "pending" ? t.processing.queued : t.workspace.working}
    </Badge>
  );
}

interface Props {
  project: ProjectDetail;
  totalFiles: number;
}

export const RecordingCard = memo(function RecordingCard({ project, totalFiles }: Props) {
  const t = useT();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationKey: ["recording.delete"],
    mutationFn: (fileId: number) => deleteAudioFile(fileId),
    onSuccess: ({ projectDeleted }, fileId) => {
      logEvent("recording.deleted", { fileId, projectDeleted });
      return queryClient.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (error) => {
      toast.error(error instanceof RecordingBusyError ? t.workspace.deleteBusy : t.workspace.deleteFailed);
      void queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });

  return (
    <article className="border-b border-border last:border-b-0">
      <header className="flex min-w-0 items-center gap-2 bg-elevated/55 px-3 py-1 sm:px-5">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
          {project.name}
        </h2>
        <TagMenu projectId={project.id} current={project.tags} />
      </header>

      {project.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-4 py-2 sm:px-5">
          {project.tags.map((tag) => (
            <Badge key={tag.id}>{tag.name}</Badge>
          ))}
        </div>
      ) : null}

      <ul className="divide-y divide-border/65">
        {project.audio_files.map((file) => (
          <li key={file.id} className="flex items-center gap-2 px-2 py-1 hover:bg-elevated sm:px-4">
            <Link
              to={`/editor/${file.id}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 sm:gap-4"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                <AudioLines aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.filename}</span>
                <span className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
                  <StatusMark file={file} />
                  <span className="text-xs tabular-nums text-muted-foreground">{formatSize(file.size_bytes, t)}</span>
                </span>
              </span>
            </Link>

            <Tooltip label={file.status === "processing" ? t.workspace.deleteBusy : t.common.delete}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.common.delete}
                className="hover:text-destructive"
                disabled={remove.isPending || file.status === "processing"}
                onClick={() => {
                  const confirmed = window.confirm(totalFiles === 1 ? t.workspace.deleteLastRecording : t.workspace.deleteRecording);
                  logEvent("recording.delete", { fileId: file.id, confirmed });
                  if (confirmed) remove.mutate(file.id);
                }}
              >
                <Trash2 />
              </Button>
            </Tooltip>
          </li>
        ))}
      </ul>

    </article>
  );
});
