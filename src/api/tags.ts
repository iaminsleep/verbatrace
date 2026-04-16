import type { Tag } from "../types";
import { logEvent } from "../local/diagnostics";
import { db, NotFoundError } from "../local/db";

export async function listTags(): Promise<Tag[]> {
  const rows = await db.tags.orderBy("name").toArray();
  return rows.map((row) => ({ id: row.id!, name: row.name, color: row.color }));
}

export async function createTag(body: { name: string }): Promise<Tag> {
  const id = await db.tags.add({ name: body.name, color: "" });
  logEvent("tag.create", { tagId: id });
  return { id, name: body.name, color: "" };
}

export async function deleteTag(tagId: number): Promise<void> {
  await db.transaction("rw", [db.tags, db.projects], async () => {
    const carrying = await db.projects.where("tag_ids").equals(tagId).toArray();
    for (const project of carrying) {
      await db.projects.update(project.id!, {
        tag_ids: project.tag_ids.filter((id) => id !== tagId),
      });
    }
    await db.tags.delete(tagId);
  });
  logEvent("tag.delete", { tagId });
}

export async function assignTag(projectId: number, tagId: number): Promise<void> {
  await db.transaction("rw", db.projects, async () => {
    const project = await db.projects.get(projectId);
    if (!project) throw new NotFoundError("Project");
    if (project.tag_ids.includes(tagId)) return;
    await db.projects.update(projectId, { tag_ids: [...project.tag_ids, tagId] });
  });
  logEvent("tag.assign", { projectId, tagId });
}

export async function unassignTag(projectId: number, tagId: number): Promise<void> {
  await db.transaction("rw", db.projects, async () => {
    const project = await db.projects.get(projectId);
    if (!project) throw new NotFoundError("Project");
    await db.projects.update(projectId, {
      tag_ids: project.tag_ids.filter((id) => id !== tagId),
    });
  });
  logEvent("tag.unassign", { projectId, tagId });
}
