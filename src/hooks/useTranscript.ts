import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAudioUrl,
  getFileStatus,
  getTranscript,
  reassignSegmentSpeaker,
  updateSpeaker,
} from "../api/transcript";
import { NotFoundError } from "../local/db";
import { pipeline } from "../local/pipeline/run";
import type { TranscriptResponse } from "../types";

export function useFileStatus(fileId: number) {
  return useQuery({
    queryKey: ["fileStatus", fileId],
    queryFn: () => getFileStatus(fileId),
    refetchInterval: (query) => {

      if (query.state.status === "error") return false;
      const status = query.state.data?.status;
      if (status === "ready" || status === "error") return false;
      return 3000;
    },
    enabled: fileId > 0,
    retry: (failureCount, error) => {

      if (error instanceof NotFoundError) return false;
      return failureCount < 2;
    },
  });
}

export function useTranscriptData(fileId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["transcript", fileId],
    queryFn: () => getTranscript(fileId),
    enabled,
    staleTime: Infinity,
  });
}

export function useIdentifySpeakers(fileId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["speaker.identify", fileId],
    mutationFn: () => pipeline.identifySpeakersOnly(fileId),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fileStatus", fileId], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["transcript", fileId], exact: true }),
      ]);
    },
  });
}

export function useAudioUrl(fileId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["audioUrl", fileId],
    queryFn: () => getAudioUrl(fileId),
    enabled,
    staleTime: 50 * 60 * 1000,
  });
}

export function useRenameSpeaker(fileId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["speaker.rename"],
    mutationFn: ({ speakerId, displayName }: { speakerId: number; displayName: string }) =>
      updateSpeaker(speakerId, displayName),
    onSuccess: (updated) => {
      queryClient.setQueryData<TranscriptResponse>(
        ["transcript", fileId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            speakers: old.speakers.map((s) =>
              s.id === updated.id ? { ...s, display_name: updated.display_name } : s,
            ),
          };
        },
      );
    },
  });
}

export function useReassignSegmentSpeaker(fileId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["speaker.reassign_segment"],
    mutationFn: ({ segmentId, speakerId }: { segmentId: number; speakerId: number | null }) =>
      reassignSegmentSpeaker(segmentId, speakerId),
    onSuccess: (updated) => {
      queryClient.setQueryData<TranscriptResponse>(
        ["transcript", fileId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            segments: old.segments.map((seg) =>
              seg.id === updated.id
                ? { ...seg, speaker_id: updated.speaker_id, words: updated.words }
                : seg,
            ),
          };
        },
      );
    },
  });
}
