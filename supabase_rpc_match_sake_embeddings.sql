-- Supabase RPC関数: match_sake_embeddings
-- 既存の関数を置き換えるために使用してください
-- Supabase Dashboard > SQL Editor で実行してください

CREATE OR REPLACE FUNCTION match_sake_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5,
  region_tag_input text DEFAULT 'base'
)
RETURNS TABLE (
  id uuid,
  brand_name text,
  product_name text,
  type text,
  region text,
  region_tag text,
  flavor_notes jsonb,
  taste_score numeric,
  aroma_score numeric,
  similarity double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    se.id,
    se.brand_name,
    se.product_name,
    se.type,
    se.region,
    se.region_tag,
    se.flavor_notes,
    se.taste_score,
    se.aroma_score,
    1 - (se.embedding <=> query_embedding) as similarity
  FROM sake_embeddings se
  WHERE 
    (se.embedding <=> query_embedding) < 1 - match_threshold
    AND (region_tag_input = 'base' OR se.region_tag = region_tag_input)
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 関数の説明を追加
COMMENT ON FUNCTION match_sake_embeddings IS 
'日本酒のembeddingベクトル検索関数。クエリのembeddingと類似度が高い銘柄を返します。';

