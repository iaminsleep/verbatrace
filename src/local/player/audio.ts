import { logError, logEvent } from "../diagnostics";
import { clock } from "./clock";

type PlayerState = {
  playing: boolean;
  durationMs: number;
  rate: number;
  volume: number;
};

type Listener = (state: PlayerState) => void;

class AudioPlayer {
  private element: HTMLAudioElement | null = null;
  private frame = 0;
  private listeners = new Set<Listener>();
  private state: PlayerState = { playing: false, durationMs: 0, rate: 1, volume: 0.9 };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get snapshot(): PlayerState {
    return this.state;
  }

  private emit(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  attach(element: HTMLAudioElement): () => void {
    this.element = element;
    clock.set(0);
    this.emit({ durationMs: 0, playing: false });
    element.volume = this.state.volume;
    element.playbackRate = this.state.rate;

    const onLoaded = () => {
      const ms = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0;
      this.emit({ durationMs: ms });
    };
    const onPlay = () => {
      logEvent("player.play", { timeMs: Math.round(element.currentTime * 1000) });
      this.emit({ playing: true });
      this.tick();
    };
    const onPause = () => {
      logEvent("player.pause", { timeMs: Math.round(element.currentTime * 1000) });
      this.emit({ playing: false });
      this.stopTicking();
      this.pushTime();
    };
    const onEnded = () => {
      logEvent("player.ended");
      this.emit({ playing: false });
      this.stopTicking();
    };

    const onSeeked = () => this.pushTime();
    const onError = () => logEvent("player.media_error", { code: element.error?.code ?? null });

    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) onLoaded();

    element.addEventListener("loadedmetadata", onLoaded);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnded);
    element.addEventListener("seeked", onSeeked);
    element.addEventListener("error", onError);

    return () => {
      this.stopTicking();
      element.removeEventListener("loadedmetadata", onLoaded);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("seeked", onSeeked);
      element.removeEventListener("error", onError);
      if (this.element === element) this.element = null;
    };
  }

  private pushTime(): void {
    if (this.element) clock.set(Math.round(this.element.currentTime * 1000));
  }

  private tick = (): void => {
    this.pushTime();
    this.frame = requestAnimationFrame(this.tick);
  };

  private stopTicking(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  toggle(): void {
    if (!this.element) return;
    if (this.element.paused) void this.element.play().catch((error) => logError("player.play_error", error));
    else this.element.pause();
  }

  seek(ms: number): void {
    if (!this.element) return;
    const duration = Number.isFinite(this.element.duration) ? this.element.duration : Infinity;
    const seconds = Math.min(duration, Math.max(0, ms / 1000));
    this.element.currentTime = seconds;

    clock.set(Math.round(seconds * 1000));
  }

  skip(deltaMs: number): void {
    this.seek(clock.now + deltaMs);
    logEvent("player.skip", { deltaMs, timeMs: clock.now });
  }

  setRate(rate: number): void {
    if (this.element) this.element.playbackRate = rate;
    this.emit({ rate });
    logEvent("player.rate", { rate });
  }

  setVolume(volume: number): void {
    if (this.element) this.element.volume = volume;
    this.emit({ volume });
  }
}

export const player = new AudioPlayer();
