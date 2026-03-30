/**
 * 발표 자료 파일 → 원문 텍스트 (업로드 UI에서 단일/다중 처리 시 공통 사용).
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

/** 단일 파일에서 텍스트 추출 */
export async function extractMaterialFromFile(file: File): Promise<MaterialExtractResult> {
  if (isLegacyPpt(file.name)) {
    return {
      ok: false,
      message:
        '구형 .ppt는 지원하지 않습니다. PPTX로 저장한 뒤 업로드하세요.',
    };
  }

  const kind = getMaterialFileKind(file.name);
  if (!kind) {
    return {
      ok: false,
      message: '지원 형식: TXT, MD, PDF, PPTX',
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
            'PDF에서 텍스트를 거의 찾지 못했습니다. 텍스트 PDF 또는 TXT를 사용하세요.',
        };
      }
      return { ok: true, text, kind };
    }

    const text = await extractTextFromPptx(buf);
    if (text.length < 20) {
      return {
        ok: false,
        message:
          'PPT에서 텍스트를 거의 찾지 못했습니다. 슬라이드에 텍스트가 있는지 확인하세요.',
      };
    }
    return { ok: true, text, kind };
  } catch {
    return {
      ok: false,
      message: '파일을 읽는 중 오류가 났습니다.',
    };
  }
}

export function filterSupportedFiles(files: FileList | File[]): File[] {
  const list = Array.from(files);
  return list.filter((f) => getMaterialFileKind(f.name) != null);
}
