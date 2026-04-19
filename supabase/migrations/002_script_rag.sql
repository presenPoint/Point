-- ============================================================
-- Point — Script RAG feature (pgvector)
-- Run this in Supabase SQL Editor after enabling the extension.
-- ============================================================

-- 1. Enable pgvector extension (requires Supabase Pro or custom setup)
create extension if not exists vector;

-- 2. Script chunks table
create table if not exists script_chunks (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references sessions(session_id) on delete cascade,
  user_id      uuid references users(id)           on delete cascade,
  chunk_index  integer not null,
  text         text    not null,
  char_start   integer,
  char_end     integer,
  embedding    vector(1536),            -- text-embedding-3-small dimension
  created_at   timestamptz default now()
);

create index if not exists script_chunks_session_idx
  on script_chunks(session_id);

-- IVFFlat index for fast approximate nearest-neighbour search
-- (requires at least a few hundred rows to be useful; safe to omit in dev)
create index if not exists script_chunks_embedding_idx
  on script_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- 3. RLS
alter table script_chunks enable row level security;

create policy "Users manage own script chunks"
  on script_chunks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. RPC: cosine similarity search within a session
create or replace function match_script_chunks(
  query_embedding  vector(1536),
  p_session_id     uuid,
  match_count      int  default 3,
  min_similarity   float default 0.25
)
returns table(
  id           uuid,
  chunk_index  int,
  text         text,
  similarity   float
)
language sql stable
as $$
  select
    sc.id,
    sc.chunk_index,
    sc.text,
    1 - (sc.embedding <=> query_embedding) as similarity
  from script_chunks sc
  where sc.session_id = p_session_id
    and 1 - (sc.embedding <=> query_embedding) >= min_similarity
  order by sc.embedding <=> query_embedding
  limit match_count;
$$;
