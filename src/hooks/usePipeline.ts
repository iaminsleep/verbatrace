import { useEffect, useState, useSyncExternalStore } from "react";
import { pipeline, type PipelineState } from "../local/pipeline/run";

export function usePipelineState(): PipelineState {
  return useSyncExternalStore(
    (onChange) => pipeline.subscribe(() => onChange()),
    () => pipeline.snapshot(),
  );
}

export function useResumeInterrupted(): void {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (started) return;
    setStarted(true);
    void pipeline.resumeInterrupted();
  }, [started]);
}
