// Función serverless de Vercel: /api/translate
// GET  -> diagnóstico (¿hay key? ¿responde Gemini?)
// POST -> traducción real

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=';

async function callGemini(key, promptText) {
  const r = await fetch(GEMINI_URL + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
    })
  });
  const data = await r.json();
  const text = ((data.candidates || [])[0]?.content?.parts || [])
    .map(p => p.text || '').join(' ').trim();
  return { ok: r.ok && !!text, status: r.status, text, error: data.error?.message || null };
}

export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY;

  // --- Diagnóstico: abrir /api/translate en el navegador ---
  if (req.method === 'GET') {
    if (!key) return res.status(200).json({ keyConfigurada: false, mensaje: 'Falta GEMINI_API_KEY en Vercel → Settings → Environment Variables' });
    const test = await callGemini(key, 'Reply with exactly: OK');
    return res.status(200).json({
      keyConfigurada: true,
      geminiResponde: test.ok,
      detalle: test.ok ? 'Todo funcionando' : (test.error || ('HTTP ' + test.status))
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
    const out = await callGemini(key, instr +
      ' It is part of a live spoken conversation between travelers.' +
      ' Reply ONLY with the translation, no quotes, no explanations.\n\n' + text);
    if (!out.ok) return res.status(502).json({ error: out.error || 'Gemini no devolvió traducción' });
    return res.status(200).json({ translation: out.text });
  } catch (err) {
    return res.status(502).json({ error: 'Error llamando a Gemini' });
  }
}
