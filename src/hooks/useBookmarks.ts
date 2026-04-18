import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/bookmarks";

export function useBookmarks(fileId: number) {
  const qc = useQueryClient();
  const key = ["bookmarks", fileId];

  const listQuery = useQuery({
    queryKey: key,
    queryFn: () => api.listBookmarks(fileId),
    enabled: fileId > 0,
  });

  const createMutation = useMutation({
    mutationKey: ["bookmark.create"],
    mutationFn: (body: {
      start_ms: number;
      end_ms?: number | null;
      note?: string | null;
    }) => api.createBookmark(fileId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationKey: ["bookmark.delete"],
    mutationFn: (bookmarkId: number) => api.deleteBookmark(bookmarkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    bookmarks: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    create: createMutation.mutate,
    remove: deleteMutation.mutate,
  };
}
