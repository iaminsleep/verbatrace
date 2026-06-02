import { Check, Clipboard, Download, FileText, Flag, Scissors, Subtitles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { exportClip } from "../../api/transcript";
import { logEvent, logError } from "../../local/diagnostics";
import { clock } from "../../local/player/clock";
import { useT } from "../../i18n";
import { download, exportDocx, exportSrt, exportTxt } from "../../local/export";
import { Button } from "../ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/menu";

interface Props {
  fileId: number;
  clip: { startMs: number; endMs: number } | null;
  onClipChange: (clip: Props["clip"]) => void;
  durationMs: number;
}

export function ExportMenu({ fileId, clip, onClipChange, durationMs }: Props) {
  const t = useT();
  const [start, setStart] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (format: string, action: () => Promise<void>) => {
    logEvent("transcript.export", { fileId, format });
    const id = toast.loading(t.exportMenu.started);
    try {
      await action();
      toast.dismiss(id);
    } catch (error) {
      logError("transcript.export_error", error, { fileId, format });
      toast.error(t.exportMenu.failed, { id });
    }
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={t.exportMenu.label}>
          <Download />{t.exportMenu.label}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => void run("docx", async () => download(await exportDocx(fileId)))}>
          <FileText />
          {t.exportMenu.docx}
        </MenuItem>

        <MenuItem onSelect={() => void run("srt", async () => download(await exportSrt(fileId)))}>
          <Subtitles />
          {t.exportMenu.srt}
        </MenuItem>

        <MenuItem
          onSelect={() =>
            void run("clipboard", async () => {
              await navigator.clipboard.writeText(await exportTxt(fileId));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? <Check /> : <Clipboard />}
          {copied ? t.exportMenu.copied : t.exportMenu.copy}
        </MenuItem>

        <MenuSeparator />
        <MenuLabel>{t.exportMenu.clipHeading}</MenuLabel>
        <MenuItem disabled={durationMs <= 0} onSelect={() => {
          logEvent("clip.start", { fileId, timeMs: Math.round(clock.now) });
          setStart(Math.round(clock.now));
          onClipChange(null);
        }}><Flag />{t.workspace.clipStart}</MenuItem>
        <MenuItem disabled={start == null} onSelect={() => {
          if (start == null) return;
          const end = Math.round(clock.now);
          if (end === start) return;
          logEvent("clip.end", { fileId, timeMs: end });
          onClipChange({ startMs: Math.min(start, end), endMs: Math.max(start, end) });
          setStart(null);
        }}><Flag />{t.workspace.clipEnd}</MenuItem>
        <MenuItem disabled={start == null && !clip} onSelect={() => {
          setStart(null);
          onClipChange(null);
        }}><X />{t.workspace.clipClear}</MenuItem>
        <MenuItem
          disabled={!clip}
          onSelect={() => {
            if (!clip) return;
            void run("wav", async () => {
              const blob = await exportClip(fileId, clip.startMs, clip.endMs);

              download({ blob, filename: "clip.wav" });
            });
          }}
        >
          <Scissors />
          {t.exportMenu.clip}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
