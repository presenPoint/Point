/**
 * scriptChunker.ts — Splits a presentation script into semantic chunks
 * suitable for vector embedding and RAG retrieval.
 *
 * Strategy:
 *   1. Split on paragraph breaks (double newlines)
 *   2. Merge tiny fragments (< MIN_CHARS) with the next paragraph
 *   3. Split oversized paragraphs (> MAX_CHARS) at sentence boundaries
 *   4. Add trailing overlap so adjacent chunks share ~OVERLAP_CHARS context
 */

const MAX_CHARS   = 480;   // ~100–130 words — fits comfortably in one embedding
const MIN_CHARS   = 60;    // ignore fragments shorter than this
const OVERLAP_CHARS = 80;  // chars copied from the end of the previous chunk

export interface ScriptChunk {
  /** 0-based position in the original script */
  index: number;
  /** Raw text of this chunk (may include overlap from the previous chunk) */
  text: string;
  /** Character offset in the original document (start, without overlap) */
  charStart: number;
  /** Character offset in the original document (end) */
  charEnd: number;
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Split a string into sentences using punctuation as a guide. */
function splitSentences(text: string): string[] {
  // Split after ., !, ? followed by whitespace or end-of-string
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

/** Append a finished chunk to the list (with optional leading overlap). */
function pushChunk(
  chunks: ScriptChunk[],
  text: string,
  charStart: number,
  charEnd: number,
  prevChunkText: string,
): void {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARS) return;

  const overlap =
    prevChunkText.length > 0
      ? prevChunkText.slice(-OVERLAP_CHARS).trim()
      : '';
  const fullText = overlap ? `${overlap} ${trimmed}` : trimmed;

  chunks.push({ index: chunks.length, text: fullText, charStart, charEnd });
}

// ── main export ────────────────────────────────────────────────────────────

/**
 * Chunk a presentation script string into retrievable segments.
 *
 * @param script  The raw script text (txt, md, or extracted from PDF/DOCX).
 * @returns       Array of ScriptChunk objects, ready for embedding.
 */
export function chunkScript(script: string): ScriptChunk[] {
  const chunks: ScriptChunk[] = [];

  // Split on blank lines (paragraph breaks)
  const paragraphs: Array<{ text: string; start: number }> = [];
  let cursor = 0;
  for (const para of script.split(/\n\s*\n/)) {
    const trimmed = para.trim();
    const start = script.indexOf(trimmed, cursor);
    if (trimmed.length >= MIN_CHARS) {
      paragraphs.push({ text: trimmed, start });
    }
    cursor = start + trimmed.length;
  }

  let accumulator = '';
  let accumStart  = 0;
  let prevText    = '';

  const flush = (end: number) => {
    if (accumulator.trim().length >= MIN_CHARS) {
      pushChunk(chunks, accumulator, accumStart, end, prevText);
      prevText = accumulator.trim();
    }
    accumulator = '';
  };

  for (const { text: para, start } of paragraphs) {
    // Case 1: paragraph fits in the current accumulator
    if (accumulator.length === 0) {
      accumStart = start;
    }
    if (accumulator.length + para.length + 2 <= MAX_CHARS) {
      accumulator = accumulator ? `${accumulator}\n\n${para}` : para;
      continue;
    }

    // Flush what we have before processing this paragraph
    flush(start);

    // Case 2: paragraph itself is short enough
    if (para.length <= MAX_CHARS) {
      accumStart  = start;
      accumulator = para;
      continue;
    }

    // Case 3: paragraph is too long — split by sentences
    const sentences = splitSentences(para);
    let sentAcc   = '';
    let sentStart = start;

    for (const sent of sentences) {
      if (sentAcc.length + sent.length + 1 <= MAX_CHARS) {
        sentAcc = sentAcc ? `${sentAcc} ${sent}` : sent;
      } else {
        // flush sentence accumulator
        if (sentAcc.trim().length >= MIN_CHARS) {
          pushChunk(chunks, sentAcc, sentStart, sentStart + sentAcc.length, prevText);
          prevText  = sentAcc.trim();
          sentStart = sentStart + sentAcc.length;
        }
        sentAcc = sent;
      }
    }
    // leftover sentences become the new accumulator
    accumStart  = sentStart;
    accumulator = sentAcc;
  }

  // Flush final accumulator
  flush(script.length);

  // Re-index to guarantee sequential 0-based indices
  return chunks.map((c, i) => ({ ...c, index: i }));
}

/**
 * Returns a brief plaintext summary showing chunk count and average length.
 * Useful for debugging / UI feedback.
 */
export function describeChunks(chunks: ScriptChunk[]): string {
  if (chunks.length === 0) return '0 chunks';
  const avg = Math.round(chunks.reduce((s, c) => s + c.text.length, 0) / chunks.length);
  return `${chunks.length} chunks · avg ${avg} chars`;
}
