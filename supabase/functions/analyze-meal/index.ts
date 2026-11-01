// Supabase Edge Function: photo of a plate → items matched against the user's My Diet (Gemini).
// Deploy: npx supabase functions deploy analyze-meal --project-ref lxxksjhcgzpijptswwqe
// Secret: npx supabase secrets set GEMINI_API_KEY=... --project-ref lxxksjhcgzpijptswwqe
// JWT verification is on (the default), so only signed-in (allowlisted) users can call it.
// shortcut: no per-user daily cap (plan's ai_calls table); the free Gemini tier rate-limits itself. Add it when friends join.
import { buildPrompt, parseGemini, parseRequest, RESPONSE_SCHEMA } from './parse.ts';

// Tried in order; the next one is used when a model is rate-limited, overloaded, failing or too slow.
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  const body = JSON.stringify({
    contents: [{
      parts: [{ text: buildPrompt(parsed) }, { inline_data: { mime_type: 'image/jpeg', data: parsed.image } }],
    }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: RESPONSE_SCHEMA,
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: 'low' }, // portion estimates don't need long thinking; keeps us far under the gateway timeout
    },
  });

  let status = 0;
  for (const model of MODELS) {
    // A slow or failing model falls through to the next one instead of hitting the gateway timeout.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '' },
      body,
      signal: AbortSignal.timeout(25_000),
    }).catch(() => null);
    if (!res) {
      status = 504;
      continue;
    }
    status = res.status;
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) {
      console.error(model, res.status, await res.text());
      return json({ error: `AI error ${res.status}` }, 502);
    }
    const out = await res.json();
    const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    return json({ model, items: parseGemini(text, parsed) });
  }
  return json({ error: status === 429 ? 'Daily AI limit reached. Try again tomorrow or quick-add.' : 'AI is busy. Try again.' }, status === 429 ? 429 : 503);
});
