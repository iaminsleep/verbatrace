import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function resolveInside(directory, request) {
  let decoded;
  try {
    decoded = decodeURIComponent(request);
  } catch {
    return null;
  }

  const root = resolve(directory);
  const file = resolve(root, decoded);
  const child = relative(root, file);

  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) return null;

  try {
    const realRoot = realpathSync(root);
    const realFile = realpathSync(file);
    const realChild = relative(realRoot, realFile);
    if (realChild === ".." || realChild.startsWith(`..${sep}`) || isAbsolute(realChild)) {
      return null;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return null;

  }
  return file;
}
