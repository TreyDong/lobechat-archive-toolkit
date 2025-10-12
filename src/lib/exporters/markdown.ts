import JSZip from 'jszip';
import type { ParsedData } from '../parser';
import { buildMarkdownExport } from '../parser';

export interface MarkdownArchiveResult {
  blob: Blob;
  fileName: string;
  fileCount: number;
}

export const createMarkdownArchive = async (parsed: ParsedData): Promise<MarkdownArchiveResult> => {
  const zip = new JSZip();
  const { files } = buildMarkdownExport(parsed);

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const label = parsed.sourceFileName?.replace(/\.[^.]+$/, '') ?? 'lobechat-export';
  const fileName = `${label}-markdown.zip`;

  return {
    blob,
    fileName,
    fileCount: files.length,
  };
};
