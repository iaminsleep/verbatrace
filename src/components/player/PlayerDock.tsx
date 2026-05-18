import { Pause, Play, Rewind, FastForward, Volume2 } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useT } from "../../i18n";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";
import { logEvent } from "../../local/diagnostics";
import { clock } from "../../local/player/clock";
import { player } from "../../local/player/audio";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { Waveform } from "./Waveform";

const RATES = [0.75, 1, 1.25, 1.5, 2];

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function Clock({ durationMs }: { durationMs: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let shown = -1;
    return clock.subscribe((ms) => {
      const second = Math.floor(ms / 1000);
      if (second === shown) return;
      shown = second;
      if (ref.current) ref.current.textContent = format(ms);
    });
  }, []);

  return (
    <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">
      <span ref={ref}>0:00</span>
      <span className="opacity-50"> / {format(durationMs)}</span>
    </span>
  );
}

interface Props {
  src: string;
  peaks: Uint8Array | null;

  fallbackDurationMs: number;
}

export function PlayerDock({ src, peaks, fallbackDurationMs }: Props) {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement>(null);

  const state = useSyncExternalStore(
    (listener) => player.subscribe(() => listener()),
    () => player.snapshot,
  );

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    return player.attach(element);
  }, []);

  const durationMs = state.durationMs || fallbackDurationMs;

  return (
    <div
      data-surface
      className="player-dock shrink-0 border-t border-border bg-surface px-3 pt-2 sm:px-6"
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4">
        <div className="row-start-2 flex shrink-0 items-center gap-0.5 sm:row-start-1">
          <Tooltip label={t.player.back5}>
            <Button variant="ghost" size="icon" aria-label={t.player.back5} onClick={() => player.skip(-5000)}>
              <Rewind />
            </Button>
          </Tooltip>

          <Tooltip label={state.playing ? t.player.pause : t.player.play}>
            <Button
              variant="primary"
              size="icon"
              data-play
              aria-label={state.playing ? t.player.pause : t.player.play}
              className="rounded-full"
              onClick={() => player.toggle()}
            >
              {state.playing ? <Pause /> : <Play />}
            </Button>
          </Tooltip>

          <Tooltip label={t.player.forward5}>
            <Button variant="ghost" size="icon" aria-label={t.player.forward5} onClick={() => player.skip(5000)}>
              <FastForward />
            </Button>
          </Tooltip>
        </div>

        <div className="col-start-2 row-start-1 text-right">
          <Clock durationMs={durationMs} />
        </div>
        <div className="col-start-1 row-start-1 min-w-0 sm:col-start-3">
          <Waveform peaks={peaks} durationMs={durationMs} />
        </div>
        <div className="col-start-2 row-start-2 flex items-center justify-end gap-2 sm:col-start-4 sm:row-start-1">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" size="sm" aria-label={t.player.speed} className="font-mono tabular-nums">
                {state.rate}×
              </Button>
            </MenuTrigger>
            <MenuContent>
              {RATES.map((rate) => (
                <MenuItem key={rate} checked={rate === state.rate} onSelect={() => player.setRate(rate)}>{rate}×</MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Tooltip label={t.player.volume}>
            <span className="hidden items-center gap-2 md:flex">
              <Volume2 className="size-4 text-muted-foreground" />
              <input type="range" min={0} max={1} step={0.05} value={state.volume} aria-label={t.player.volume}
                onChange={(event) => player.setVolume(Number(event.currentTarget.value))}
                onPointerUp={() => logEvent("player.volume", { level: player.snapshot.volume })}
                onKeyUp={() => logEvent("player.volume", { level: player.snapshot.volume })}
                className="w-20 cursor-pointer accent-accent" />
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
