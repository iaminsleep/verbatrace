import { Search } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { searchTranscript } from "../../api/transcript";
import { logError, logEvent } from "../../local/diagnostics";
import { useT } from "../../i18n";
import type { SearchResult } from "../../types";
import { Dialog, DialogContent } from "../ui/dialog";

function stamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

interface Props {
  fileId: number;
  open: boolean;
  onClose: () => void;
  onFound: (indices: Set<number> | null) => void;
  onGo: (wordIndex: number, startMs: number) => void;
  triggerRef: RefObject<HTMLButtonElement>;
}

export function SearchOverlay({ fileId, open, onClose, onFound, onGo, triggerRef }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectedResult = useRef(false);

  useEffect(() => {
    if (!open || !query.trim()) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchTranscript(fileId, query.trim());
        if (!current) return;
        logEvent("transcript.search", { fileId, results: found.length });
        setResults(found);
        onFound(new Set(found.flatMap((result) => result.word_indices)));
      } catch (error) {
        logError("transcript.search_error", error, { fileId });
        if (current) setFailed(true);
      } finally {
        if (current) setWaiting(false);
      }
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, fileId, open, onFound]);

  function go(result: SearchResult) {
    logEvent("transcript.search_select", { fileId, wordIndex: result.sequence_index, timeMs: result.start_ms });
    selectedResult.current = true;
    onGo(result.sequence_index, result.start_ms);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        title={t.editor.search}
        closeLabel={t.common.close}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!selectedResult.current) onFound(null);
          setQuery("");
          setResults([]);
          setWaiting(false);
          setFailed(false);
          selectedResult.current = false;
          triggerRef.current?.focus();
        }}
      >
        <label className="transcript-search-field workspace-field flex items-center gap-2 focus-within:ring-1 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-accent" aria-hidden />
          <input
            type="search"
            aria-label={t.editor.search}
            placeholder={t.editor.searchPlaceholder}
            className="min-h-10 min-w-0 flex-1 appearance-none bg-transparent placeholder:text-muted-foreground"
            value={query}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              setWaiting(Boolean(value.trim()));
              setFailed(false);
              setResults([]);
              onFound(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) go(results[0]);
            }}
          />
        </label>

        {query.trim() ? (
          <div className="mt-3">
            <p role="status" className="mb-2 text-sm text-muted-foreground">
              {failed ? t.workspace.searchFailed : waiting ? t.workspace.loading : results.length ? t.editor.searchResults(results.length) : t.editor.searchEmpty}
            </p>
            <ul className="max-h-[min(22rem,50dvh)] overflow-y-auto">
              {results.map((result) => (
                <li key={result.word_id}>
                  <button type="button" data-control="" onClick={() => go(result)}
                    className="flex min-h-9 w-full min-w-0 items-baseline gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-elevated">
                    <span className="shrink-0 font-mono text-xs text-accent">{stamp(result.start_ms)}</span>
                    <span className="min-w-0 break-words text-muted-foreground">
                      {result.context_before} <mark className="rounded-sm bg-accent-soft font-semibold text-foreground">{result.text}</mark> {result.context_after}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
