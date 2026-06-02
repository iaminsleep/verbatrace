import { useEffect, useRef, useState } from "react";
import { getNotes, saveNotes } from "../../api/transcript";
import { logError } from "../../local/diagnostics";
import { useT } from "../../i18n";
import { Textarea } from "../ui/input";

export function NotesPanel({ fileId }: { fileId: number }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saved" | "load-error" | "save-error">("loading");
  const current = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft = useRef<string | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    current.current = true;
    void getNotes(fileId).then(({ notes }) => {
      if (!active) return;
      setValue(notes);
      setState("ready");
    }, (error) => {
      logError("notes.load_error", error, { fileId });
      if (active) setState("load-error");
    });
    return () => {
      active = false;
      current.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (draft.current !== null) {
        const pending = draft.current;
        draft.current = null;
        void saveNotes(fileId, pending).catch((error) => logError("notes.save_error", error, { fileId }));
      }
    };
  }, [fileId]);

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = draft.current;
    const savedRevision = revision.current;
    draft.current = null;
    if (pending === null) return;
    void saveNotes(fileId, pending).then(() => {
      if (current.current && revision.current === savedRevision) setState("saved");
    }, (error) => {
      logError("notes.save_error", error, { fileId });
      if (!current.current || revision.current !== savedRevision) return;
      draft.current = pending;
      setState("save-error");
    });
  };

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <Textarea
        value={value}
        readOnly={state === "loading" || state === "load-error"}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setValue(next);
          setState("ready");
          revision.current += 1;
          draft.current = next;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(save, 600);
        }}
        onBlur={save}
        aria-label={t.editor.notes}
        placeholder={t.editor.notesPlaceholder}
        className="min-h-0 flex-1"
      />
      <p role="status" className="min-h-5 text-xs text-muted-foreground">
        {state === "saved" ? t.editor.notesSaved : state === "loading" ? t.workspace.loading
          : state === "load-error" ? t.workspace.noteLoadFailed : state === "save-error" ? t.workspace.noteFailed : ""}
      </p>
    </div>
  );
}
