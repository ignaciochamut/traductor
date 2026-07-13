// Función serverless de Vercel: /api/translate
// GET  -> diagnóstico | POST -> traducción
// flash-lite primero (más rápido) y razonamiento en mínimo para bajar latencia.

const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3-flash'];
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

async function callGemini(key, model, promptText, withThinking) {
  const body = { contents: [{ parts: [{ text: promptText }] }] };
  if (withThinking) body.generationConfig = { thinkingConfig: { thinkingLevel: 'low' } };
  const r = await fetch(BASE + model + ':generateContent?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  const text = ((data.candidates || [])[0]?.content?.parts || [])
    .map(p => p.text || '').join(' ').trim();
  return { ok: r.ok && !!text, status: r.status, text, error: data.error?.message || null };
}

async function tryModels(key, promptText) {
  let lastError = 'sin respuesta';
  for (const model of MODELS) {
    // Primero con razonamiento mínimo (rápido); si el modelo rechaza el parámetro, sin él.
    let out = await callGemini(key, model, promptText, true);
    if (!out.ok && out.status === 400) out = await callGemini(key, model, promptText, false);
    if (out.ok) return { ...out, model };
    lastError = model + ': ' + (out.error || ('HTTP ' + out.status));
  }
  return { ok: false, error: lastError };
}

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') {
    if (!key) return res.status(200).json({ keyConfigurada: false, mensaje: 'Falta GEMINI_API_KEY en Vercel' });
    const t0 = Date.now();
    const test = await tryModels(key, 'Reply with exactly: OK');
    return res.status(200).json({
      keyConfigurada: true,
      geminiResponde: test.ok,
      modeloUsado: test.model || null,
      milisegundos: Date.now() - t0,
      detalle: test.ok ? 'Todo funcionando' : test.error
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

  const { text, from } = req.body || {};
  if (!text || !['es', 'en'].includes(from)) return res.status(400).json({ error: 'Parámetros inválidos' });
  if (text.length > 5000) return res.status(400).json({ error: 'Texto demasiado largo' });

  const instr = from === 'es'
    ? 'Translate this Spanish text to natural, conversational American English.'
    : 'Traducí este texto del inglés a español rioplatense natural (voseo, nada de "tú").';

  try {
    const out = await tryModels(key, instr +
      ' It is part of a live spoken conversation between travelers.' +
      ' Reply ONLY with the translation, no quotes, no explanations.\n\n' + text);
    if (!out.ok) return res.status(502).json({ error: out.error });
    return res.status(200).json({ translation: out.text });
  } catch (err) {
    return res.status(502).json({ error: 'Error llamando a Gemini' });
  }
}
