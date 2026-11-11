// Supabase Edge Function: a meal's exact foods and grams → a short recipe (name + steps), from Gemini.
// Deploy: npx supabase functions deploy make-recipe --project-ref lxxksjhcgzpijptswwqe
// Uses the GEMINI_API_KEY secret that analyze-meal already has.
// The gateway lets the app's public key through too, so the user's session is checked here (sign-ups are allowlisted).
import { buildPrompt, parseRecipe, parseRequest, RESPONSE_SCHEMA } from './parse.ts';

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

  const user = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: req.headers.get('apikey') ?? '', Authorization: req.headers.get('Authorization') ?? '' },
  });
  if (!user.ok) return json({ error: 'Sign in to make recipes.' }, 401);

  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === 'string') return json({ error: parsed }, 400);

  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(parsed) }] }],
    generationConfig: { response_mime_type: 'application/json', response_schema: RESPONSE_SCHEMA, temperature: 0.6, thinkingConfig: { thinkingLevel: 'low' } },
  });

  let status = 0;
  for (const model of MODELS) {
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
    const recipe = parseRecipe(text);
    return recipe ? json({ model, recipe }) : json({ error: "Couldn't write a recipe. Try again." }, 502);
  }
  return json({ error: status === 429 ? 'Daily AI limit reached. Try again tomorrow.' : 'AI is busy. Try again.' }, status === 429 ? 429 : 503);
});
