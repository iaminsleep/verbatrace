import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { resolveInside } from "./safe-path.mjs";

test("resolveInside accepts a normal child", async () => {
  const root = await mkdtemp(join(tmpdir(), "verbatrace-path-"));
  try {
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "file.txt"), "ok");
    assert.equal(resolveInside(root, "nested/file.txt"), join(root, "nested", "file.txt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveInside rejects encoded traversal and prefix collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "verbatrace-path-"));
  try {
    assert.equal(resolveInside(root, "%2e%2e/secret.txt"), null);
    assert.equal(resolveInside(root, "../secret.txt"), null);
    assert.equal(resolveInside(root, "../" + root.split("/").pop() + "-private/secret.txt"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveInside rejects malformed percent encoding", () => {
  assert.equal(resolveInside("/tmp/verbatrace", "%E0%A4%A"), null);
});

test("resolveInside rejects a symlink that points outside", async () => {
  const { symlink } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "verbatrace-path-"));
  const outside = await mkdtemp(join(tmpdir(), "verbatrace-outside-"));
  try {
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "linked"), "dir");
    assert.equal(resolveInside(root, "linked/secret.txt"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
