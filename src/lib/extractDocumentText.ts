/**
 * Browser-side raw text extraction for TXT/MD/PDF/PPTX (Agent 1 → material.raw_text).
 * Legacy .ppt (binary) is not supported.
 * PDF: only selectable text layers are extracted (no OCR for scan-only PDFs).
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DRAWINGML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function collectAText(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = doc.getElementsByTagNameNS(DRAWINGML_NS, 't');
  const out: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const t = nodes[i].textContent?.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

function slideSortKey(path: string): number {
  const m = path.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Extract slide and speaker notes text from PPTX */
export async function extractTextFromPptx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((p) => !zip.files[p].dir);

  const slidePaths = names
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => slideSortKey(a) - slideSortKey(b));

  const notePaths = names
    .filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(p))
    .sort((a, b) => slideSortKey(a) - slideSortKey(b));

  const chunks: string[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const path = slidePaths[i];
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const lines = collectAText(xml);
    if (lines.length) {
      chunks.push(`[Slide ${i + 1}]\n${lines.join('\n')}`);
    }
  }

  for (let i = 0; i < notePaths.length; i++) {
    const path = notePaths[i];
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const lines = collectAText(xml);
    if (lines.length) {
      chunks.push(`[Notes ${i + 1}]\n${lines.join('\n')}`);
    }
  }

  return chunks.join('\n\n').trim();
}

function textFromPdfItem(item: unknown): string {
  if (item && typeof item === 'object' && 'str' in item && typeof (item as { str: string }).str === 'string') {
    return (item as { str: string }).str;
  }
  return '';
}

/** Extract text per page from PDF */
export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    const parts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const line = content.items
        .map(textFromPdfItem)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) parts.push(`[Page ${p}]\n${line}`);
    }
    return parts.join('\n\n').trim();
  } finally {
    await pdf.destroy();
  }
}

export function isLegacyPpt(filename: string): boolean {
  return /\.ppt$/i.test(filename) && !/\.pptx$/i.test(filename);
}

/**
 * Extract plain text from a .docx file using mammoth.
 */
export async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}
