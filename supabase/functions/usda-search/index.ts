// Supabase Edge Function: searches USDA FoodData Central without shipping the API key in the app.
// Deploy: npx supabase functions deploy usda-search --project-ref lxxksjhcgzpijptswwqe
// Secret: npx supabase secrets set USDA_API_KEY=... --project-ref lxxksjhcgzpijptswwqe
// JWT verification is on (the default), so only signed-in (allowlisted) users can call it.
import { mapUsdaFoods } from './map.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== 'string' || !query.trim() || query.length > 100) return json({ error: 'Bad query' }, 400);

  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${Deno.env.get('USDA_API_KEY')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), pageSize: 25, dataType: ['Foundation', 'SR Legacy', 'Branded'] }),
    },
  );
  if (!res.ok) return json({ error: `USDA error ${res.status}` }, 502);
  return json(mapUsdaFoods(await res.json()));
});
