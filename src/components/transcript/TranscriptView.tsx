import * as ContextMenu from "@radix-ui/react-context-menu";
import { Check, UserMinus, Users } from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { logEvent } from "../../local/diagnostics";
import { useT } from "../../i18n";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { clock, findWordAt } from "../../local/player/clock";
import { player } from "../../local/player/audio";
import type { Speaker } from "../../types";
import { reapplyActiveWord, setActiveWord, setContainer } from "./activeWord";
import { speakerVar } from "./SpeakerChip";
import { TurnBlock } from "./TurnBlock";
import type { TranscriptModel } from "./model";

const USER_SCROLL_PAUSE_MS = 3000;

const MeasuredColumn = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function MeasuredColumn({ children, ...rest }, ref) {
    return (
      <div {...rest} ref={ref} className="mx-auto w-full max-w-[var(--measure)] px-3 py-2 sm:px-6">
        {children}
      </div>
    );
  },
);

interface Props {
  model: TranscriptModel;
  speakers: Speaker[];
  found: Set<number> | null;

  goTo: { index: number } | null;
  clip: { startMs: number; endMs: number } | null;
  filterSpeakerId: number | null;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  onRenameSpeaker?: (speakerId: number, name: string) => void;
  onReassign?: (turnIndex: number, speakerId: number | null) => void;
  onPickedChange?: (range: { startMs: number; endMs: number } | null) => void;
}

export function TranscriptView({
  model,
  speakers,
  found,
  goTo,
  clip,
  filterSpeakerId,
  follow,
  onFollowChange,
  onRenameSpeaker,
  onReassign,
  onPickedChange,
}: Props) {
  const t = useT();
  const listRef = useRef<VirtuosoHandle>(null);

  const anchorRef = useRef<number | null>(null);
  const [menuTurn, setMenuTurn] = useState<number | null>(null);

  const turns = useMemo(
    () =>
      filterSpeakerId == null
        ? model.turns
        : model.turns.filter((turn) => turn.speakerId === filterSpeakerId),
    [model.turns, filterSpeakerId],
  );

  const lastTurn = useRef(-1);
  const lastJump = useRef<Props["goTo"]>(null);
  const lastManualScroll = useRef(-Infinity);
  const followRef = useRef(follow);
  followRef.current = follow;

  const visibleIndices = useMemo(
    () => filterSpeakerId == null ? null : new Map(turns.map((turn, index) => [turn.from, index])),
    [turns, filterSpeakerId],
  );

  const scrollToWord = useCallback((word: number, force: boolean) => {
    const turn = model.turnOfWord[word] ?? -1;
    if (turn < 0) return;
    const index = visibleIndices ? visibleIndices.get(model.turns[turn].from) : turn;
    if (index === undefined || (!force && index === lastTurn.current)) return;
    lastTurn.current = index;
    listRef.current?.scrollToIndex({ index, align: "center", behavior: "auto" });
  }, [model, visibleIndices]);

  useEffect(() => {
    lastTurn.current = -1;
    let held = -1;
    return clock.subscribe((ms) => {
      const word = findWordAt(model.starts, model.ends, ms);
      if (word >= 0) held = word;
      else if (held >= 0 && (ms < model.starts[held] || ms >= (model.starts[held + 1] ?? Infinity))) held = -1;
      setActiveWord(held);
      if (held >= 0 && followRef.current && performance.now() - lastManualScroll.current > USER_SCROLL_PAUSE_MS) {
        scrollToWord(held, false);
      }
    });
  }, [model, scrollToWord]);

  useEffect(() => {
    if (!goTo || goTo === lastJump.current || visibleIndices) return;
    lastJump.current = goTo;
    scrollToWord(goTo.index, true);
  }, [goTo, visibleIndices, scrollToWord]);

  useEffect(() => () => {
    setActiveWord(-1);
    setContainer(null);
  }, []);

  const pauseFollowing = () => {
    lastManualScroll.current = performance.now();
    lastTurn.current = -1;
  };

  const toggleFollowing = () => {
    if (!follow) {
      lastManualScroll.current = -Infinity;
      scrollToWord(findWordAt(model.starts, model.ends, clock.now), true);
    }
    onFollowChange(!follow);
    logEvent("transcript.follow", { enabled: !follow });
  };

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-i], [data-seek]");
      if (!target) return;
      const index = Number(target.dataset.i ?? target.dataset.seek);
      if (!Number.isFinite(index)) return;

      if (event.shiftKey && anchorRef.current != null) {
        const from = Math.min(anchorRef.current, index);
        const to = Math.max(anchorRef.current, index);
        const clip = { startMs: model.starts[from], endMs: model.ends[to] };
        onPickedChange?.(clip);
        logEvent("clip.select_words", clip);
        return;
      }

      anchorRef.current = index;
      player.seek(model.starts[index]);
      logEvent("player.seek", { via: "transcript", timeMs: model.starts[index], wordIndex: index });
    },
    [model, onPickedChange],
  );

  if (model.words.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex justify-end px-3 py-1 sm:px-5">
        <Button variant="ghost" size="sm" aria-pressed={follow} onClick={toggleFollowing} className={follow ? "text-accent" : undefined}>
          {t.editor.autoScroll}
        </Button>
      </div>
      <ContextMenu.Root onOpenChange={(open) => !open && setMenuTurn(null)}>
        <ContextMenu.Trigger asChild>
          <div
            className="min-h-0 flex-1"
            onWheel={pauseFollowing}
            onTouchMove={pauseFollowing}
            onClick={handleClick}
            onContextMenu={(event) => {
              const target = (event.target as HTMLElement).closest<HTMLElement>("[data-turn]");
              setMenuTurn(target ? Number(target.dataset.turn) : null);
            }}
          >
            <Virtuoso
              ref={listRef}
              style={{ height: "100%" }}
              totalCount={turns.length}

              itemsRendered={reapplyActiveWord}
              scrollerRef={(element) => {
                setContainer(element as HTMLElement);
              }}
              components={{ List: MeasuredColumn }}
              itemContent={(index) => {
                const turn = turns[index];
                return (
                  <TurnBlock
                    turn={turn}
                    words={model.words}
                    speaker={turn.speakerId ? model.speakers.get(turn.speakerId) : undefined}
                    found={found}
                    clip={clip}
                    speakers={speakers}
                    onReassign={onReassign}
                    onRename={onRenameSpeaker}
                  />
                );
              }}
            />
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content
            className={cn(
              "z-50 min-w-[13rem] overflow-hidden rounded-md border border-border",
              "bg-elevated p-1 shadow-xl",
            )}
          >
            <ContextMenu.Label className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" />
              {t.editor.reassignSpeaker}
            </ContextMenu.Label>

            {speakers.map((speaker, index) => {
              const turn = menuTurn != null ? model.turns.find((one) => one.from === menuTurn) : null;
              const active = turn?.speakerId === speaker.id;
              return (
                <ContextMenu.Item
                  key={speaker.id}
                  onSelect={() => {
                    if (menuTurn != null) onReassign?.(menuTurn, speaker.id);
                  }}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5",
                    "text-sm text-foreground outline-none transition-colors",
                    "data-[highlighted]:bg-accent-soft",
                  )}
                >
                  <span
                    aria-hidden
                    style={{ backgroundColor: speakerVar(index) }}
                    className="size-2.5 shrink-0 rounded-full"
                  />
                  <span className="truncate">{speaker.display_name || speaker.speaker_code}</span>
                  <Check className={cn("ml-auto size-4", !active && "invisible")} />
                </ContextMenu.Item>
              );
            })}

            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item
              onSelect={() => {
                if (menuTurn != null) onReassign?.(menuTurn, null);
              }}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5",
                "text-sm text-muted-foreground outline-none transition-colors",
                "data-[highlighted]:bg-accent-soft",
              )}
            >
              <UserMinus className="size-4" />
              {t.editor.removeSpeaker}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  );
}
