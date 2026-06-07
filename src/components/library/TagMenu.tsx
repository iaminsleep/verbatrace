import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { assignTag, createTag, deleteTag, listTags, unassignTag } from "../../api/tags";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import type { Tag } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuContent, MenuLabel, MenuSeparator, MenuTrigger } from "../ui/menu";

export function TagMenu({ projectId, current }: { projectId: number; current: Tag[] }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data: all = [] } = useQuery({ queryKey: ["tags"], queryFn: listTags });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["library"] });
  };

  const create = useMutation({
    mutationKey: ["tag.create"],
    mutationFn: (value: string) => createTag({ name: value }),
    onSuccess: () => {
      setName("");
      refresh();
    },
  });
  const toggle = useMutation({
    mutationKey: ["tag.toggle"],
    mutationFn: ({ tagId, on }: { tagId: number; on: boolean }) =>
      on ? assignTag(projectId, tagId) : unassignTag(projectId, tagId),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationKey: ["tag.delete"],
    mutationFn: (tagId: number) => deleteTag(tagId),
    onSuccess: refresh,
  });

  const assigned = new Set(current.map((one) => one.id));

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.tags.label}>
          <TagIcon />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t.tags.label}</MenuLabel>

        {all.map((tag) => (
          <div key={tag.id} className="flex items-center gap-1 px-1">
            <button
              type="button"
              data-control=""
              aria-pressed={assigned.has(tag.id)}
              onClick={() => toggle.mutate({ tagId: tag.id, on: !assigned.has(tag.id) })}
              className={cn(
                "flex flex-1 items-center gap-2 rounded-sm px-1.5 py-1.5 text-left text-sm",
                "transition-colors hover:bg-accent-soft",
                assigned.has(tag.id) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full border",
                  assigned.has(tag.id) ? "border-accent bg-accent" : "border-muted-foreground",
                )}
              />
              <span className="truncate">{tag.name}</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${t.common.delete}: ${tag.name}`}
              className="hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t.workspace.deleteTag)) remove.mutate(tag.id);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}

        {all.length > 0 ? <MenuSeparator /> : null}

        <form
          className="flex items-center gap-1 p-1"
          onSubmit={(event) => {
            event.preventDefault();
            const value = name.trim();
            if (value) create.mutate(value);
          }}

          onKeyDown={(event) => event.stopPropagation()}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            aria-label={t.tags.namePlaceholder}
            placeholder={t.tags.namePlaceholder}
            className="h-8 text-[13px]"
          />
          <Button type="submit" variant="ghost" size="icon" aria-label={t.tags.add}>
            <Plus />
          </Button>
        </form>
      </MenuContent>
    </Menu>
  );
}
