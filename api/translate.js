// Función serverless de Vercel: /api/translate
// GET  -> diagnóstico (¿hay key? ¿qué modelo responde?)
// POST -> traducción real
// Prueba los modelos en orden y usa el primero disponible.

const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3-flash'];
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

async function callGemini(key, model, promptText) {
  const r = await fetch(BASE + model + ':generateContent?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
  });
  const data = await r.json();
  const text = ((data.candidates || [])[0]?.content?.parts || [])
    .map(p => p.text || '').join(' ').trim();
  return { ok: r.ok && !!text, status: r.status, text, error: data.error?.message || null };
}

async function tryModels(key, promptText) {
  let lastError = 'sin respuesta';
  for (const model of MODELS) {
    const out = await callGemini(key, model, promptText);
    if (out.ok) return { ...out, model };
    lastError = model + ': ' + (out.error || ('HTTP ' + out.status));
  }
  return { ok: false, error: lastError };
}

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;

  // --- Diagnóstico: abrir /api/translate en el navegador ---
  if (req.method === 'GET') {
    if (!key) return res.status(200).json({ keyConfigurada: false, mensaje: 'Falta GEMINI_API_KEY en Vercel' });
    const test = await tryModels(key, 'Reply with exactly: OK');
    return res.status(200).json({
      keyConfigurada: true,
      geminiResponde: test.ok,
      modeloUsado: test.model || null,
      detalle: test.ok ? 'Todo funcionando' : test.error
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada' });

  const { text, from } = req.body || {};
  if (!text || !['es', 'en'].includes(from)) return res.status(400).json({ error: 'Parámetros inválidos' });
  if (text.length > 1000) return res.status(400).json({ error: 'Texto demasiado largo' });

  const instr = from === 'es'
    ? 'Translate this Spanish phrase to natural, conversational American English.'
    : 'Traducí esta frase del inglés a español rioplatense natural (voseo, nada de "tú").';

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
