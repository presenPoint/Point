/**
 * Presentation material file → raw text extraction.
 */
import { extractTextFromPdf, extractTextFromPptx, isLegacyPpt } from './extractDocumentText';

export type MaterialFileKind = 'pdf' | 'pptx' | 'txt' | 'md';

export type MaterialExtractResult =
  | { ok: true; text: string; kind: MaterialFileKind }
  | { ok: false; message: string };

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(new Error('read'));
    r.readAsText(file, 'UTF-8');
  });
}

export function getMaterialFileKind(filename: string): MaterialFileKind | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'pptx') return 'pptx';
  return null;
}

/** Extract text from a single file */
export async function extractMaterialFromFile(file: File): Promise<MaterialExtractResult> {
  if (isLegacyPpt(file.name)) {
    return {
      ok: false,
      message:
        'Legacy .ppt is not supported. Please save as PPTX and re-upload.',
    };
  }

  const kind = getMaterialFileKind(file.name);
  if (!kind) {
    return {
      ok: false,
      message: 'Supported formats: TXT, MD, PDF, PPTX',
    };
  }

  try {
    if (kind === 'txt' || kind === 'md') {
      const text = await readFileAsText(file);
      return { ok: true, text, kind };
    }

    const buf = await file.arrayBuffer();

    if (kind === 'pdf') {
      const text = await extractTextFromPdf(buf);
      if (text.length < 20) {
        return {
          ok: false,
          message:
            'Almost no text found in this PDF. Please use a text-based PDF or TXT file.',
        };
      }
      return { ok: true, text, kind };
    }

    const text = await extractTextFromPptx(buf);
    if (text.length < 20) {
      return {
        ok: false,
        message:
          'Almost no text found in this PPTX. Make sure your slides contain text.',
      };
    }
    return { ok: true, text, kind };
  } catch {
    return {
      ok: false,
      message: 'An error occurred while reading the file.',
    };
  }
}

export function filterSupportedFiles(files: FileList | File[]): File[] {
  const list = Array.from(files);
  return list.filter((f) => getMaterialFileKind(f.name) != null);
}
