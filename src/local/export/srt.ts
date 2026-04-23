
const MAX_SRT_LINE_CHARS = 42;

export function wrapSrtText(text: string): string {
  const lines: string[] = [];
  let line: string[] = [];
  let length = 0;

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const addition = word.length + (line.length > 0 ? 1 : 0);
    if (length + addition > MAX_SRT_LINE_CHARS && line.length > 0) {
      lines.push(line.join(" "));
      line = [word];
      length = word.length;
    } else {
      line.push(word);
      length += addition;
    }
  }

  if (line.length > 0) lines.push(line.join(" "));
  return lines.join("\n");
}
