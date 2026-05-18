import { useEffect, useRef } from "react";
import { useTheme } from "../../app/theme";
import { useT } from "../../i18n";
import { logEvent } from "../../local/diagnostics";
import { clock } from "../../local/player/clock";
import { player } from "../../local/player/audio";

interface Props {
  peaks: Uint8Array | null;
  durationMs: number;
}

export function Waveform({ peaks, durationMs }: Props) {
  const t = useT();
  const { theme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const styles = getComputedStyle(canvas);
    const played = styles.getPropertyValue("--wave-played").trim();
    const ahead = styles.getPropertyValue("--wave-ahead").trim();

    let width = 0;
    let height = 0;
    let lastColumn = -1;

    const draw = (ms: number) => {
      if (!peaks || width === 0) return;
      const columns = Math.min(peaks.length, Math.max(1, Math.floor(width / 3)));
      const progress = durationMs > 0 ? Math.min(1, ms / durationMs) : 0;
      const column = Math.floor(progress * columns);
      if (column === lastColumn) return;
      lastColumn = column;

      context.clearRect(0, 0, width, height);
      const step = width / columns;
      const middle = height / 2;
      const barWidth = Math.max(1, step - 1);

      for (let at = 0; at < columns; at += 1) {
        const peak = peaks[Math.floor((at * peaks.length) / columns)];
        const amplitude = (peak / 255) * (height / 2) * 0.92;
        context.fillStyle = at <= column ? played : ahead;
        context.fillRect(
          at * step,
          middle - Math.max(1, amplitude),
          barWidth,
          Math.max(2, amplitude * 2),
        );
      }
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      lastColumn = -1;
      draw(clock.now);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const unsubscribe = clock.subscribe(draw);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [peaks, durationMs, theme]);

  useEffect(() => clock.subscribe((ms) => {
    if (inputRef.current) inputRef.current.value = String(Math.round(ms / 1000));
  }), [durationMs]);

  return (
    <div className={peaks ? "relative flex min-h-10 items-center rounded-sm focus-within:outline-2 focus-within:outline-ring" : "flex min-h-10 items-center"}>
      {peaks ? <canvas ref={canvasRef} aria-hidden className="pointer-events-none h-8 w-full [--wave-ahead:var(--color-muted-foreground)] [--wave-played:var(--color-accent)]" /> : null}
      <input
        data-control=""
        ref={inputRef}
        type="range"
        min={0}
        max={Math.ceil(durationMs / 1000)}
        step={1}
        defaultValue={0}
        disabled={durationMs <= 0}
        aria-label={t.workspace.playhead}
        onChange={(event) => player.seek(Number(event.currentTarget.value) * 1000)}
        onPointerUp={() => logEvent("player.seek", { timeMs: clock.now, via: "waveform" })}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
            logEvent("player.seek", { timeMs: clock.now, via: "keyboard" });
          }
        }}
        className={peaks ? "absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" : "w-full cursor-pointer accent-accent"}
      />
    </div>
  );
}
