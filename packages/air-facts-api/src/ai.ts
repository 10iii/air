import type { Env, StoredFact, ExtractedFact } from './types';

const FACT_EXTRACTION_PROMPT = `Extract factual information from the following content.

Instructions:
1. Extract a clear, concise title (max 100 chars)
2. Write a 1-2 sentence summary
3. List 3-5 key facts as bullet points (each fact should be self-contained and verifiable)
4. Focus on: who, what, when, where, numbers, names, events
5. Ignore opinions, ads, navigation text

Respond in JSON format:
{
  "title": "...",
  "summary": "...",
  "facts": ["fact 1", "fact 2", ...]
}

Content:
`;

export async function extractFacts(
  env: Env,
  storedFact: StoredFact
): Promise<{ title: string; summary: string; facts: string[] } | null> {
  try {
    const content = storedFact.compressed_output.slice(0, 4000);
    
    const response = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
      messages: [
        {
          role: 'user',
          content: FACT_EXTRACTION_PROMPT + content,
        },
      ],
      max_tokens: 500,
    });

    if (!response.response) {
      return null;
    }

    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: parsed.title || 'Untitled',
      summary: parsed.summary || '',
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    };
  } catch (e) {
    console.error('Fact extraction failed:', e);
    return null;
  }
}

export async function generateEmbedding(
  env: Env,
  text: string
): Promise<number[] | null> {
  try {
    const response = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
      text: [text],
    });

    const output = response as { data?: number[][] };
    if (!output.data || !output.data[0]) {
      return null;
    }

    return output.data[0];
  } catch (e) {
    console.error('Embedding generation failed:', e);
    return null;
  }
}

export async function processAndIndexFact(
  env: Env,
  storedFact: StoredFact
): Promise<ExtractedFact | null> {
  const extracted = await extractFacts(env, storedFact);
  if (!extracted) {
    return null;
  }

  const textForEmbedding = `${extracted.title}. ${extracted.summary}. ${extracted.facts.join('. ')}`;
  const embedding = await generateEmbedding(env, textForEmbedding);

  const factId = `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const extractedFact: ExtractedFact = {
    id: factId,
    source_id: storedFact.id,
    url: storedFact.url,
    domain: storedFact.domain,
    title: extracted.title,
    summary: extracted.summary,
    facts: extracted.facts,
    extracted_at: Date.now(),
  };

  if (embedding) {
    await env.FACTS_INDEX.upsert([
      {
        id: factId,
        values: embedding,
        metadata: {
          url: storedFact.url || '',
          domain: storedFact.domain || '',
          title: extracted.title,
          summary: extracted.summary,
        },
      },
    ]);
    extractedFact.embedding = embedding;
  }

  const extractedKey = `extracted/${storedFact.type}/${factId}.json`;
  await env.FACTS_R2.put(extractedKey, JSON.stringify(extractedFact), {
    httpMetadata: { contentType: 'application/json' },
  });

  return extractedFact;
}

export async function searchFacts(
  env: Env,
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; score: number; metadata: Record<string, string> }>> {
  const queryEmbedding = await generateEmbedding(env, query);
  if (!queryEmbedding) {
    return [];
  }

  const results = await env.FACTS_INDEX.query(queryEmbedding, {
    topK: limit,
    returnMetadata: 'all',
  });

  return results.matches.map((match) => ({
    id: match.id,
    score: match.score,
    metadata: (match.metadata || {}) as Record<string, string>,
  }));
}
