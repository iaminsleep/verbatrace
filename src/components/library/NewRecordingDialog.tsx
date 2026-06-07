import { useQueryClient } from "@tanstack/react-query";
import { FileAudio, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { createRecording, FileGoneError, readRecording } from "../../api/projects";
import { logEvent, logError } from "../../local/diagnostics";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { diarizationIsAvailable } from "../../local/diar/speakers";
import { pipeline } from "../../local/pipeline/run";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent } from "../ui/dialog";
import { Input } from "../ui/input";

const ACCEPT = {
  "audio/*": [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".opus", ".aac"],
  "video/*": [".mp4", ".mkv", ".mov", ".webm"],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  initialFile?: File | null;
  onCloseAutoFocus?: (event: Event) => void;
}

export function NewRecordingDialog({ open, onOpenChange, initialFile, onCloseAutoFocus }: Props) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [diarize, setDiarize] = useState(false);

  const [diarizeReady, setDiarizeReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = useRef(0);

  useEffect(() => {
    if (open) return;
    selection.current += 1;
    setName("");
    setFile(null);
    setDiarize(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!diarize || diarizeReady !== null) return;
    let alive = true;
    void diarizationIsAvailable().then((ready) => {
      if (alive) setDiarizeReady(ready);
    });
    return () => {
      alive = false;
    };
  }, [diarize, diarizeReady]);

  const accept = useCallback(
    async (picked: File) => {
      const request = ++selection.current;
      try {
        await picked.slice(0, 1024).arrayBuffer();
      } catch (error) {
        logError("recording.read_error", error);
        if (request !== selection.current) return;
        setFile(null);
        setError(t.upload.fileGone(picked.name));
        return;
      }
      if (request !== selection.current) return;
      setError(null);
      logEvent("recording.select_file", { sizeBytes: picked.size });
      setFile(picked);

      setName((current) => current || picked.name.replace(/\.[^.]+$/, ""));
    },
    [t],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (accepted[0]) void accept(accepted[0]);
      else if (rejected.length) {
        selection.current += 1;
        setFile(null);
        setError(t.upload.unsupportedFile);
      }
    },
    [accept, t],
  );

  useEffect(() => {
    if (open && initialFile) void accept(initialFile);
  }, [open, initialFile, accept]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
  });

  const submit = async () => {
    if (!file || !name.trim() || busy) return;
    logEvent("recording.import", { sizeBytes: file.size, diarization: diarize });
    setBusy(true);
    setError(null);
    try {

      const bytes = await readRecording(file);
      const audioFile = await createRecording(name.trim(), diarize, file, bytes);
      logEvent("recording.created", { fileId: audioFile.id });
      pipeline.enqueue(audioFile.id);
      await queryClient.invalidateQueries({ queryKey: ["library"] });
      onOpenChange(false);
      navigate(`/editor/${audioFile.id}`);
    } catch (err) {
      logError("recording.import_error", err);
      if (err instanceof FileGoneError) setError(t.upload.fileGone(err.filename));
      else setError(t.upload.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy || next) onOpenChange(next); }}>
      <DialogContent
        title={t.library.newRecording}
        closeLabel={t.common.close}
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" disabled={!file || !name.trim() || busy} onClick={submit}>
              {t.upload.submit}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div
            {...getRootProps({ role: "button", "aria-label": file ? t.upload.filePrompt : t.library.chooseFile })}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed",
              "bg-elevated/60 px-4 py-7 text-center transition-colors",
              isDragActive ? "border-accent bg-accent-soft" : "border-border hover:border-muted-foreground",
            )}
          >
            <input {...getInputProps({ "aria-label": t.upload.file })} />
            {file ? (
              <>
                <FileAudio className="size-6 text-accent" />
                <span className="max-w-full break-all text-sm text-foreground">{file.name}</span>
                <span className="text-xs text-muted-foreground">{t.upload.filePrompt}</span>
              </>
            ) : (
              <>
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-[13px] text-foreground">{t.library.chooseFile}</span>
                <span className="text-[12px] leading-relaxed text-muted-foreground">
                  {t.library.empty}
                </span>
              </>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-foreground">{t.upload.name}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </label>

          <div className="flex items-start gap-3">
            <Checkbox
              id="diarize"
              checked={diarize}
              onCheckedChange={setDiarize}
              className="mt-0.5"
            />
            <label htmlFor="diarize" className="cursor-pointer text-[13px] font-medium text-foreground">
              {t.upload.diarization}
            </label>
          </div>

          {diarize && diarizeReady === false ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12px] leading-relaxed text-warning">
              {t.upload.diarizationMissing}
            </p>
          ) : null}

          <p className="rounded-md bg-elevated px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            {t.upload.beforeStart}
          </p>

          {error ? <p role="alert" className="text-[13px] text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
