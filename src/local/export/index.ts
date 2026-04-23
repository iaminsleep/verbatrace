

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  baseName,
  formatSrtTime,
  formatTimecode,
  loadExportSource,
} from "./blocks";
import { wrapSrtText } from "./srt";

export interface ExportFile {
  blob: Blob;
  filename: string;
}

export async function exportTxt(fileId: number): Promise<string> {
  const { blocks } = await loadExportSource(fileId);
  return blocks
    .map((block) => (block.speakerName ? `${block.speakerName}: ${block.text}` : block.text))
    .join("\n\n");
}

export async function exportSrt(fileId: number): Promise<ExportFile> {
  const { blocks, filename } = await loadExportSource(fileId);
  const lines: string[] = [];
  for (const [at, block] of blocks.entries()) {
    lines.push(String(at + 1));
    lines.push(`${formatSrtTime(block.startMs)} --> ${formatSrtTime(block.endMs)}`);
    lines.push(wrapSrtText(block.text));
    lines.push("");
  }
  return {
    blob: new Blob([lines.join("\n")], { type: "text/srt;charset=utf-8" }),
    filename: `${baseName(filename)}.srt`,
  };
}

export async function exportDocx(fileId: number): Promise<ExportFile> {
  const { blocks, filename, projectName, createdAt } = await loadExportSource(fileId);
  const date = createdAt.slice(0, 10);

  const paragraphs: Paragraph[] = [
    new Paragraph({ text: projectName, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: `Date: ${date}  |  File: ${filename}`, size: 20 })],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const block of blocks) {
    const children: TextRun[] = [

      new TextRun({ text: `[${formatTimecode(block.startMs)}] `, size: 18, color: "999999" }),
    ];
    if (block.speakerName) {
      children.push(new TextRun({ text: `${block.speakerName}: `, bold: true, size: 20 }));
    }
    children.push(new TextRun({ text: block.text, size: 20 }));
    paragraphs.push(new Paragraph({ children }));
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return {
    blob: await Packer.toBlob(doc),
    filename: `${baseName(filename)}.docx`,
  };
}

export function download(file: ExportFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}
