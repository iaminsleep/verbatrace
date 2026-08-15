import type { Page } from "@playwright/test";

const publicPaths = new Set([
  "/", "/favicon.svg", "/favicon.ico", "/apple-touch-icon.png", "/site.webmanifest",
]);

export function watchLocalRequests(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("A Playwright baseURL is required");
  const origin = new URL(baseURL).origin;
  const unexpected: string[] = [];
  page.context().on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "blob:" || url.protocol === "data:") return;
    if (
      url.origin === origin && !url.search && ["GET", "HEAD"].includes(request.method()) &&
      (publicPaths.has(url.pathname) || /^\/(assets|icons|editor|speech-model)\//.test(url.pathname))
    ) return;
    unexpected.push(`${request.method()} ${url.href}`);
  });
  return unexpected;
}
