import { expect, test, type Page } from "@playwright/test";
import { watchLocalRequests } from "./local-requests";

async function openLibrary(page: Page, locale = "en", theme = "light", turns = 32, withSpeakers = true) {
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem("verbatrace-locale", locale);
    localStorage.setItem("verbatrace-theme", theme);
  }, { locale, theme });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async ({ turns, withSpeakers }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("verbatrace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tables = ["projects", "tags", "files", "media", "pcm", "speakers", "words", "segments"];
    const transaction = database.transaction(tables, "readwrite");
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    const put = (table: string, record: object) => transaction.objectStore(table).put(record);
    const old = "2026-06-01T00:00:00Z";
    const recent = "2026-06-02T00:00:00Z";
    put("tags", { id: 1, name: "Interview", color: "#117180" });
    for (const [id, name, date, tags] of [
      [1, "Интервью: длинное название проекта для проверки адаптивной вёрстки", old, [1]],
      [2, "Studio session", recent, []],
    ] as const) {
      put("projects", { id, name, created_at: date, tag_ids: tags, language: "auto", enable_diarization: false });
      put("files", { id, project_id: id, filename: id === 1 ? "conversation.wav" : "studio.wav",
        size_bytes: 320044, duration_ms: turns * 1000, status: "ready", progress_percent: 100,
        created_at: date, notes: "", done_seconds: turns, peaks: new Uint8Array([45, 105, 250, 185, 70, 100, 160, 58]) });
    }

    const samples = 16_000 * turns;
    const wav = new Uint8Array(44 + samples * 2);
    const stamp = new DataView(wav.buffer);
    wav.set(new TextEncoder().encode("RIFF"));
    stamp.setUint32(4, wav.length - 8, true);
    wav.set(new TextEncoder().encode("WAVEfmt "), 8);
    stamp.setUint32(16, 16, true);
    stamp.setUint16(20, 1, true);
    stamp.setUint16(22, 1, true);
    stamp.setUint32(24, 16_000, true);
    stamp.setUint32(28, 32_000, true);
    stamp.setUint16(32, 2, true);
    stamp.setUint16(34, 16, true);
    wav.set(new TextEncoder().encode("data"), 36);
    stamp.setUint32(40, samples * 2, true);
    put("media", { file_id: 1, blob: new Blob([wav], { type: "audio/wav" }), mime: "audio/wav" });
    const pcm = new Int16Array(16_000 * (withSpeakers ? Math.min(turns, 8) : turns));
    if (!withSpeakers) {
      for (let index = 0; index < pcm.length; index += 1) {
        const time = index / 16_000;
        const phase = 2 * Math.PI * (138 * time + 0.2 * Math.sin(2 * Math.PI * time));
        const envelope = 0.55 + 0.35 * Math.sin(2 * Math.PI * 3 * time);
        pcm[index] = Math.round(11_000 * envelope * (Math.sin(phase) + 0.4 * Math.sin(phase * 3) + 0.2 * Math.sin(phase * 7)));
      }
    }
    put("pcm", { file_id: 1, index: 0, samples: pcm });
    if (withSpeakers) {
      put("speakers", { id: 1, file_id: 1, speaker_code: "A", display_name: "Ada", color: null });
      put("speakers", { id: 2, file_id: 1, speaker_code: "B", display_name: "Lin", color: null });
    }

    const initialWords = ["Welcome", "We", "may", "proceed", "We", "can"];
    for (let index = 0; index < turns; index += 1) {
      const text = index === turns - 1 ? "Needle" : initialWords[index] ?? "Conversation";
      const speaker = withSpeakers ? (index === turns - 1 ? 2 : 1) : null;
      const timing = { file_id: 1, text, start_ms: index * 1000, end_ms: index * 1000 + 900, speaker_id: speaker };
      put("segments", { ...timing, id: index + 1, segment_index: index, flagged: false });
      put("words", { ...timing, confidence: 1, sequence_index: index, segment_id: index + 1 });
    }
    await done;
    database.close();
  }, { turns, withSpeakers });
  await page.reload();
  await expect(page.getByRole("link", { name: /conversation\.wav/ })).toBeVisible();
}

test("library filters and sorts recordings and restores dialog focus", async ({ page }) => {
  await openLibrary(page);
  const titles = page.getByRole("heading", { level: 2 });
  await expect(titles.first()).toHaveText("Studio session");
  await page.getByLabel("Sort recordings").selectOption("oldest");
  await expect(titles.first()).toHaveText(/Интервью/);
  await page.getByRole("combobox", { name: "Tags", exact: true }).selectOption("1");
  await expect(page.getByRole("link", { name: /studio\.wav/ })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search recordings" }).fill("missing");
  await expect(page.getByText("No recordings found.")).toBeVisible();

  const trigger = page.getByRole("button", { name: "Add recording" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("editor searches a virtualized transcript, seeks with the keyboard and saves notes", async ({ page }) => {
  await openLibrary(page, "en", "dark", 2100);
  await page.getByRole("link", { name: /conversation\.wav/ }).click();
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();
  expect(await page.locator("[data-turn]").count()).toBeLessThan(60);
  await page.getByRole("button", { name: "Ada", exact: true }).first().click();

  const search = page.getByRole("button", { name: "Find in transcript" });
  await search.click();
  const input = page.getByRole("searchbox", { name: "Find in transcript" });
  await input.fill("Needle");
  await expect(page.getByText("1 match")).toBeVisible();
  await input.press("Enter");
  await expect(search).toBeFocused();
  await expect(page.locator(".word[data-active]")).toHaveText("Needle");
  const seek = page.getByRole("slider", { name: "Playback position" });
  await seek.press("Home");
  await expect(seek).toHaveValue("0");

  const notesTrigger = page.getByRole("button", { name: "Notes" });
  await notesTrigger.click();
  const notes = page.getByRole("textbox", { name: "Notes" });
  await expect(notes).toBeEditable();
  await notes.pressSequentially("A quick note", { delay: 5 });
  await expect(notes).toHaveValue("A quick note");
  await notesTrigger.click();
  await notesTrigger.click();
  await expect(notes).toHaveValue("A quick note");
  await page.getByRole("button", { name: "Play", exact: true }).press("Space");
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(seek).not.toHaveValue("0");
  await page.getByRole("button", { name: "Pause", exact: true }).press("Space");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test.describe("touch workspace", () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test("reassigns speakers, exports a clip and opens a notes sheet", async ({ page }) => {
    await openLibrary(page);
    await page.getByRole("link", { name: /conversation\.wav/ }).tap();
    const firstTurn = page.locator("[data-turn]").first();
    await firstTurn.getByRole("button", { name: "Set speaker" }).tap();
    await page.getByRole("menuitem", { name: "Lin" }).tap();
    await expect(firstTurn.getByRole("button", { name: "Lin" })).toBeVisible();

    const notes = page.getByRole("button", { name: "Notes" });
    await notes.tap();
    await expect(page.getByRole("dialog", { name: "Notes" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notes).toBeFocused();

    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await exportButton.tap();
    await page.getByRole("menuitem", { name: "Start here" }).tap();
    await page.getByRole("slider", { name: "Playback position" }).press("ArrowRight");
    await exportButton.tap();
    await page.getByRole("menuitem", { name: "End here" }).tap();
    await exportButton.tap();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download WAV" }).tap();
    expect((await download).suggestedFilename()).toBe("clip.wav");
  });
});

test("Russian workspace fits 360, 768 and 1440 pixels", async ({ page }) => {
  await openLibrary(page, "ru");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole("heading", { name: "Записи", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole("link", { name: /conversation\.wav/ }).click();
    await expect(page.getByRole("heading", { name: /Интервью/ })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Позиция воспроизведения" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole("link", { name: "Назад к записям" }).click();
  }
});

test("deleting the last recording removes its project and related data", async ({ page }) => {
  await openLibrary(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("verbatrace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["files", "projects", "bookmarks"], "readwrite");
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    transaction.objectStore("files").put({
      id: 3, project_id: 1, filename: "other.wav", status: "ready", created_at: "2026-06-03T00:00:00Z",
    });
    transaction.objectStore("projects").put({
      id: 3, name: "Legacy empty project", tag_ids: [], created_at: "2026-06-03T00:00:00Z",
    });
    transaction.objectStore("bookmarks").put({ file_id: 1, start_ms: 0, note: "A note" });
    await done;
    database.close();
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Legacy empty project" })).toHaveCount(0);
  const project = page.getByRole("article").filter({ hasText: /Интервью/ });
  await page.getByRole("searchbox").fill("conversation.wav");
  const confirmFirst = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    expect(message).not.toContain("last recording");
  });
  await project.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmFirst;
  await expect(page.getByText("No recordings found.")).toBeVisible();
  await page.getByRole("searchbox").clear();
  await expect(project.getByRole("link", { name: /other\.wav/ })).toBeVisible();

  const confirmLast = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.accept();
    expect(message).toContain("project and its last recording");
  });
  await project.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmLast;
  await expect(project).toHaveCount(0);
  await expect(page.getByRole("link", { name: /studio\.wav/ })).toBeVisible();

  const remaining = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("verbatrace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = ["files", "projects", "words", "segments", "speakers", "bookmarks", "media", "pcm"];
    const transaction = database.transaction(names, "readonly");
    const rows = await Promise.all(names.map((name) => new Promise<unknown[]>((resolve, reject) => {
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })));
    database.close();
    return rows.map((table) => table.length);
  });
  expect(remaining).toEqual([1, 2, 0, 0, 0, 0, 0, 0]);
});

test("session logs export ordered events and sanitized stacks, then stop when disabled", async ({ page }) => {
  await openLibrary(page);
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const toggle = page.getByRole("menuitemcheckbox", { name: "Log actions and errors" });
  await settings.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /conversation\.wav/ }).click();
  await page.getByRole("button", { name: "Find in transcript" }).click();
  const search = page.getByRole("searchbox");
  await expect(search).toBeFocused();
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(search).toHaveCSS("border-top-width", "0px");
  await search.fill("private-search-query");
  await expect(page.getByText("Not found in the transcript.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    function errorFrame() { return new TypeError("private-error-message"); }
    window.dispatchEvent(new ErrorEvent("error", { error: errorFrame() }));
    void Promise.reject(new Error("private-rejection"));
  });
  await page.getByRole("link", { name: "Back to recordings" }).click();
  await settings.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add recording" }).click();
  await page.keyboard.press("Escape");

  await page.reload();
  await settings.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("menuitem", { name: "Session logs" }).click();
  const logDialog = page.getByRole("dialog", { name: "Session logs" });
  await expect(logDialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await logDialog.getByRole("button", { name: /Download log/ }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^logs_session_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC_/);
  const { readFile } = await import("node:fs/promises");
  const contents = await readFile((await download.path())!, "utf8");
  expect(contents).not.toMatch(/private-|conversation\.wav|Welcome|Интервью/);
  const { session, events } = JSON.parse(contents);
  expect(session.endedAt).toBeTruthy();
  expect(events.map((row: { sequence: number }) => row.sequence)).toEqual(events.map((_: unknown, index: number) => index));
  expect(events.every((row: { time: string }) => Number.isFinite(Date.parse(row.time)))).toBe(true);
  expect(events.map((row: { event: string }) => row.event)).toEqual(expect.arrayContaining([
    "session.start", "navigation", "transcript.search", "window.error", "window.unhandled_rejection", "session.end",
  ]));
  expect(events.find((row: { event: string }) => row.event === "window.error").error.stack).toContain("errorFrame");
  expect(events.some((row: { event: string }) => row.event === "recording.open_import")).toBe(false);

  await page.keyboard.press("Escape");
  await settings.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitem", { name: "Session logs" }).click();
  await expect(logDialog.getByRole("button", { name: /Download log/ })).toHaveCount(3);
});

test("transcript search matches adjacent words and highlights the whole phrase", async ({ page }) => {
  await openLibrary(page);
  await page.getByRole("link", { name: /conversation\.wav/ }).click();
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Find in transcript" }).click();
  const search = page.getByRole("searchbox", { name: "Find in transcript" });
  const dialog = page.getByRole("dialog", { name: "Find in transcript" });

  await search.fill("we proceed");
  await expect(dialog.getByText("Not found in the transcript.")).toBeVisible();
  await search.fill("WE   MAY");
  await expect(dialog.getByText("1 match")).toBeVisible();
  await expect(dialog.locator("mark")).toHaveText("We may");
  await search.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".word[data-found=true]")).toHaveText(["We", "may"]);
  await expect.poll(() => page.locator("audio").evaluate((audio) => audio.currentTime)).toBe(1);
});

test("local speaker identification refreshes an open transcript without reloading", async ({ page, baseURL }) => {
  const unexpected = watchLocalRequests(page, baseURL);
  await openLibrary(page, "en", "light", 12, false);
  await page.getByRole("link", { name: /conversation\.wav/ }).click();
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests += 1;
  });
  const weights = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/speech-model/preload.data" && response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Label speakers", exact: true }).click();
  expect((await weights).ok()).toBe(true);
  await expect(page.getByText("1 speaker", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-turn]").first().getByRole("button", { name: "SPEAKER_01" })).toBeVisible();
  expect(documentRequests).toBe(0);
  expect(unexpected).toEqual([]);
});
