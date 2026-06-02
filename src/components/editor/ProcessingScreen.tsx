import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { useT } from "../../i18n";
import type { Stage } from "../../local/pipeline/run";

interface Props {
  status: string;
  stage: Stage | null;
  percent: number | null;
  filename?: string | null;
  queued?: number;
}

export function ProcessingScreen({ status, stage, percent, filename, queued = 0 }: Props) {
  const t = useT();
  const key: Stage = stage ?? (status === "pending" ? "queued" : "transcribing");

  const titles: Record<Stage, string> = {
    queued: t.processing.queued,
    decoding: t.processing.decoding,
    "downloading-model": t.processing.downloadingModel,
    transcribing: t.processing.transcribing,
    "identifying-speakers": t.processing.identifyingSpeakers,
    segmenting: t.processing.segmenting,
  };

  const title = titles[key];

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border border-border bg-surface p-6 text-center sm:p-8">
        <Loader2 className="size-7 animate-spin text-accent" />

        {filename ? (
          <span className="font-mono text-[12px] break-all text-muted-foreground">{filename}</span>
        ) : null}

        <h1 className="text-lg font-semibold text-foreground">
          {title}
          {percent != null ? <span className="ml-1 tabular-nums text-accent">{percent} %</span> : null}
        </h1>

        {percent != null ? (
          <div role="progressbar" aria-label={title} aria-valuenow={percent} className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}

        <p className="text-[12px] leading-relaxed text-muted-foreground">{t.processing.keepOpen}</p>

        {queued > 0 ? (
          <p className="text-[11px] text-muted-foreground">{t.processing.inQueue(queued)}</p>
        ) : null}
        <Button asChild><Link to="/"><ArrowLeft />{t.workspace.backToLibrary}</Link></Button>
      </div>
    </div>
  );
}
