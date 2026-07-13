// Función serverless de Vercel: /api/translate
// La API key vive en la variable de entorno GEMINI_API_KEY (nunca llega al navegador).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en Vercel' });
  }

  const { text, from } = req.body || {};
  if (!text || !['es', 'en'].includes(from)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  if (text.length > 1000) {
    return res.status(400).json({ error: 'Texto demasiado largo' });
  }

  const instr = from === 'es'
    ? 'Translate this Spanish phrase to natural, conversational American English.'
    : 'Traducí esta frase del inglés a español rioplatense natural (voseo, nada de "tú").';

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: instr +
                ' It is part of a live spoken conversation between travelers.' +
                ' Reply ONLY with the translation, no quotes, no explanations.\n\n' + text
            }]
          }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
        })
      }
    );
    const data = await r.json();
    const translation = ((data.candidates || [])[0]?.content?.parts || [])
      .map(p => p.text || '').join(' ').trim();

    if (!translation) {
      return res.status(502).json({ error: 'Gemini no devolvió traducción' });
    }
    return res.status(200).json({ translation });
  } catch (err) {
    return res.status(502).json({ error: 'Error llamando a Gemini' });
  }
}
