// Supabase Edge Function: searches USDA FoodData Central without shipping the API key in the app.
// Deploy: npx supabase functions deploy usda-search --project-ref lxxksjhcgzpijptswwqe
// Secret: npx supabase secrets set USDA_API_KEY=... --project-ref lxxksjhcgzpijptswwqe
// The gateway lets the app's public key through too, so the user's session is checked here (sign-ups are allowlisted).
import { mapUsdaFoods } from './map.ts';

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
  if (!user.ok) return json({ error: 'Sign in to search foods.' }, 401);

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
