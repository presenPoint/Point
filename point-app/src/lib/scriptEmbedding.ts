/**
 * scriptEmbedding.ts — Embed, store, and retrieve script chunks.
 *
 * Two modes:
 *   • Supabase mode  — embeddings stored in script_chunks table (pgvector)
 *   • In-memory mode — embeddings kept in module-level cache (demo / no Supabase)
 *
 * RAG search always returns at most `topK` chunks ranked by cosine similarity.
 */

import { embedText, chatJson, hasOpenAI } from './openai';
import { supabase } from './supabase';
import type { ScriptChunk } from './scriptChunker';

// ── In-memory fallback store ────────────────────────────────────────────────
interface MemChunk extends ScriptChunk {
  embedding: number[];
}
/** sessionId → list of embedded chunks */
const memStore = new Map<string, MemChunk[]>();

// ── Cosine similarity ───────────────────────────────────────────────────────
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ── Public result type ──────────────────────────────────────────────────────
export interface ChunkMatch {
  chunkIndex: number;
  text: string;
  similarity: number;
}

// ── Embed + store ───────────────────────────────────────────────────────────

/**
 * Embed all chunks and persist them.
 *
 * @param sessionId   Current session UUID
 * @param userId      Current user UUID
 * @param chunks      Output of `chunkScript()`
 * @returns           Number of chunks successfully embedded & stored
 */
export async function embedAndStoreChunks(
  sessionId: string,
  userId: string,
  chunks: ScriptChunk[],
): Promise<{ stored: number; error?: string }> {
  if (chunks.length === 0) return { stored: 0 };

  const embedded: MemChunk[] = [];

  for (const chunk of chunks) {
    const vec = await embedText(chunk.text);
    if (!vec) {
      // No API key — store without embedding (similarity search will be skipped)
      embedded.push({ ...chunk, embedding: [] });
    } else {
      embedded.push({ ...chunk, embedding: vec });
    }
  }

  // Always populate in-memory store (works in demo mode too)
  memStore.set(sessionId, embedded);

  // Persist to Supabase if available
  if (supabase && embedded.some((c) => c.embedding.length > 0)) {
    // Delete stale chunks for this session first
    await supabase.from('script_chunks').delete().eq('session_id', sessionId);

    const rows = embedded
      .filter((c) => c.embedding.length > 0)
      .map((c) => ({
        session_id:  sessionId,
        user_id:     userId,
        chunk_index: c.index,
        text:        c.text,
        char_start:  c.charStart,
        char_end:    c.charEnd,
        embedding:   `[${c.embedding.join(',')}]`, // Supabase expects string for vector
      }));

    const { error } = await supabase.from('script_chunks').insert(rows);
    if (error) {
      console.warn('Supabase script_chunks insert failed', error);
      return { stored: embedded.length, error: error.message };
    }
  }

  return { stored: embedded.length };
}

// ── Similarity search ───────────────────────────────────────────────────────

/**
 * Find the `topK` most relevant script chunks for a given query string.
 *
 * Uses Supabase RPC when available; falls back to in-memory cosine search.
 *
 * @param sessionId  Session to search within
 * @param queryText  The text to match against (e.g. last 30 s of transcript)
 * @param topK       Number of chunks to return (default 3)
 */
export async function searchSimilarChunks(
  sessionId: string,
  queryText: string,
  topK = 3,
): Promise<ChunkMatch[]> {
  const queryVec = await embedText(queryText);

  // ── Supabase path ──────────────────────────────────────────────────────────
  if (supabase && queryVec) {
    const { data, error } = await supabase.rpc('match_script_chunks', {
      query_embedding: `[${queryVec.join(',')}]`,
      p_session_id:    sessionId,
      match_count:     topK,
      min_similarity:  0.25,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return (data as Array<{ chunk_index: number; text: string; similarity: number }>).map(
        (row) => ({
          chunkIndex: row.chunk_index,
          text:       row.text,
          similarity: row.similarity,
        }),
      );
    }
    // Fall through to in-memory if RPC returned nothing
  }

  // ── In-memory path ─────────────────────────────────────────────────────────
  const cached = memStore.get(sessionId) ?? [];
  if (cached.length === 0 || !queryVec) return [];

  return cached
    .filter((c) => c.embedding.length > 0)
    .map((c) => ({
      chunkIndex: c.index,
      text:       c.text,
      similarity: cosine(queryVec, c.embedding),
    }))
    .filter((m) => m.similarity >= 0.25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/** Remove all stored chunks for a session (call on reset). */
export function clearChunks(sessionId: string): void {
  memStore.delete(sessionId);
  if (supabase) {
    void supabase.from('script_chunks').delete().eq('session_id', sessionId);
  }
}

// ── Script style analysis (§4 feature expansion) ───────────────────────────

export interface ScriptStyleAnalysis {
  /** e.g. "formal", "conversational", "technical", "narrative" */
  tone: string;
  /** e.g. "high", "medium", "low" */
  complexity: string;
  /** Key phrases the presenter should use verbatim or near-verbatim */
  keyPhrases: string[];
  /** Estimated reading / delivery duration in minutes */
  estimatedMinutes: number;
  /** Concise suggestions for delivery style */
  deliverySuggestions: string[];
}

/**
 * Analyse the writing style of the script using GPT-4o-mini.
 * Returns a structured ScriptStyleAnalysis or null in demo mode.
 */
export async function analyzeScriptStyle(
  scriptText: string,
): Promise<ScriptStyleAnalysis | null> {
  if (!hasOpenAI()) return null;

  const SYSTEM = `You are a presentation writing coach. Analyze the style of the script below and respond with JSON only.

Response format:
{
  "tone": "formal | conversational | technical | narrative | persuasive",
  "complexity": "high | medium | low",
  "keyPhrases": ["phrase1", "phrase2", "phrase3"],
  "estimatedMinutes": <number, assuming 130 wpm delivery>,
  "deliverySuggestions": ["suggestion1", "suggestion2", "suggestion3"]
}

Rules:
- keyPhrases: pick 3–6 domain-specific or rhetorical phrases that define this script's voice
- deliverySuggestions: practical delivery tips derived from the script's structure and style
- estimatedMinutes: word count / 130, rounded to nearest 0.5`;

  return chatJson<ScriptStyleAnalysis>('gpt-4o-mini', SYSTEM, scriptText.slice(0, 4_000));
}

// ── Script coverage (§4 — used in reportAgent) ──────────────────────────────

/**
 * Estimate what fraction of the script's chunks were actually covered
 * during the presentation, based on semantic similarity of the transcript
 * against each stored chunk.
 *
 * @param sessionId   Session UUID
 * @param transcript  Full presentation transcript text
 * @returns           Coverage ratio 0–1, or null if no chunks available
 */
export async function calcScriptCoverage(
  sessionId: string,
  transcript: string,
): Promise<number | null> {
  const cached = memStore.get(sessionId);
  if (!cached || cached.length === 0) return null;

  const transcriptVec = await embedText(transcript.slice(0, 6_000));
  if (!transcriptVec) return null;

  // A chunk is "covered" if cosine similarity with transcript ≥ 0.40
  const covered = cached.filter(
    (c) => c.embedding.length > 0 && cosine(transcriptVec, c.embedding) >= 0.40,
  ).length;

  return covered / cached.length;
}
