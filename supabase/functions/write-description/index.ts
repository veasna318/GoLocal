// GoLocal AI helper for product text.
// Two jobs: write a description from keywords, or translate text between English and Khmer.
// Runs on Supabase, not in the browser, so the Gemini key stays secret.
// Secrets needed: GEMINI_API_KEY (and optionally GEMINI_MODEL).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DAILY_LIMIT = 40;
const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash';
const BACKUP_MODEL = Deno.env.get('GEMINI_BACKUP_MODEL') ?? 'gemini-3.5-flash';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// busy means the model was too busy, so it is worth trying again.
type AiResult = { data?: Record<string, string>; error?: string; busy?: boolean };

function wait(ms: number) {
  return new Promise((done) => setTimeout(done, ms));
}

// Pulls the short reason out of a Google error body.
function shortReason(body: string) {
  try {
    const parsed = JSON.parse(body);
    return String(parsed?.error?.message ?? body).slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}

// One call to one model, asking for a JSON answer that matches the given shape.
async function callModel(
  model: string,
  apiKey: string,
  prompt: string,
  schema: unknown,
): Promise<AiResult> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    });
  } catch (networkError) {
    return { error: `Could not reach Gemini: ${networkError}` };
  }

  if (!response.ok) {
    const detail = await response.text();
    console.error('Gemini error', response.status, model, detail.slice(0, 500));
    return {
      error: `Gemini ${response.status} using model ${model}: ${shortReason(detail)}`,
      busy: response.status === 503 || response.status === 429,
    };
  }

  const result = await response.json();
  const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!raw) {
    const stopped = result?.candidates?.[0]?.finishReason ?? 'no reason given';
    return { error: `Gemini sent no text (${stopped})` };
  }

  try {
    return { data: JSON.parse(raw) as Record<string, string> };
  } catch {
    return { error: 'Gemini sent an answer that was not JSON' };
  }
}

// Gemini answers 503 when a model is busy, so try the main model twice
// with a short pause, then fall back to the backup model.
async function askGemini(apiKey: string, prompt: string, schema: unknown): Promise<AiResult> {
  const attempts = [MODEL, MODEL, BACKUP_MODEL];
  let last: AiResult = { error: 'AI request failed' };

  for (let i = 0; i < attempts.length; i++) {
    last = await callModel(attempts[i], apiKey, prompt, schema);
    if (!last.busy) return last;
    if (i < attempts.length - 1) await wait(1500);
  }

  return last;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return reply({ error: 'AI key is not set up' }, 500);

  // Who is asking? The browser sends the signed-in user's token.
  const token = (request.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return reply({ error: 'Please log in' }, 401);

  // Only verified producers, businesses and admins may use the AI helper.
  const { data: profile } = await admin
    .from('profiles')
    .select('platform_role, verification_status, is_active')
    .eq('id', user.id)
    .single();

  const allowed = profile && profile.is_active && (
    profile.platform_role === 'ADMIN' ||
    (['PRODUCER', 'BUSINESS'].includes(profile.platform_role) && profile.verification_status === 'VERIFIED')
  );
  if (!allowed) return reply({ error: 'Only verified sellers can use the AI helper' }, 403);

  // Daily cap per seller.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return reply({ error: 'Daily AI limit reached' }, 429);

  const body = await request.json().catch(() => ({}));
  const remaining = Math.max(0, DAILY_LIMIT - ((count ?? 0) + 1));

  // Job 1: translate one piece of text into the other language.
  if (body.mode === 'translate') {
    const text = String(body.text ?? '').slice(0, 2000).trim();
    const toKhmer = body.target === 'km';
    if (text.length < 2) return reply({ error: 'Nothing to translate' }, 400);

    const prompt = [
      'You translate product text for GoLocal, a Cambodian local products website.',
      toKhmer
        ? 'Translate the text below into natural Khmer that ordinary Cambodian buyers use.'
        : 'Translate the text below into natural, simple English.',
      'Keep the same meaning and about the same length. Do not add facts that are not there.',
      'Keep brand names, place names, numbers and units as they are.',
      'Return only the translation.',
      '',
      'Text:',
      text,
    ].join('\n');

    const written = await askGemini(apiKey, prompt, {
      type: 'OBJECT',
      properties: { text: { type: 'STRING' } },
      required: ['text'],
    });
    if (written.error) return reply({ error: written.error }, 502);

    await admin.from('ai_usage').insert({ user_id: user.id, feature: 'translate' });
    return reply({ text: written.data?.text ?? '', remainingToday: remaining });
  }

  // Job 2: write a description from a few keywords.
  const keywords = String(body.keywords ?? '').slice(0, 300).trim();
  if (keywords.length < 3) return reply({ error: 'Please send a few keywords' }, 400);

  const prompt = [
    'You write short product descriptions for GoLocal, a Cambodian local products website.',
    'Write in a simple, honest tone for ordinary buyers. Two to four sentences.',
    'Write the description in the same language the producer used in the keywords.',
    'If the keywords are in Khmer, answer in Khmer. If they are in English, answer in English.',
    'Only use the facts given. Do not invent certificates, awards, prices or health claims.',
    '',
    `Keywords from the producer: ${keywords}`,
    body.productName ? `Product name: ${String(body.productName).slice(0, 160)}` : '',
    body.category ? `Category: ${String(body.category).slice(0, 80)}` : '',
    body.province ? `Province: ${String(body.province).slice(0, 80)}` : '',
    body.unit ? `Sold by: ${String(body.unit).slice(0, 40)}` : '',
    '',
    'Also return a short product name in English and in Khmer.',
  ].filter(Boolean).join('\n');

  const written = await askGemini(apiKey, prompt, {
    type: 'OBJECT',
    properties: {
      text: { type: 'STRING' },
      name: { type: 'STRING' },
      nameKhmer: { type: 'STRING' },
    },
    required: ['text'],
  });
  if (written.error) return reply({ error: written.error }, 502);

  await admin.from('ai_usage').insert({ user_id: user.id, feature: 'description' });

  return reply({
    text: written.data?.text ?? '',
    name: written.data?.name ?? '',
    nameKhmer: written.data?.nameKhmer ?? '',
    remainingToday: remaining,
  });
});
