const MODEL = 'claude-sonnet-5';
const MAX_HISTORY = 12;
const MAX_MESSAGE_LEN = 4000;
const MAX_CONTEXT_LEN = 6000;

const SYSTEM_PROMPTS = {
  advisor: {
    tr: [
      'Sen, Meridyen\'in GEIP Investment Terminal uygulamasına gömülü bir portföy ve nakit akışı asistanısın.',
      'Sana JSON olarak verilen uygulama bağlamına (kullanıcının portföyü, giderleri ve platformdaki yatırım fırsatları) dayanarak kısa, net ve sayısal olarak doğru cevaplar ver.',
      'Sen lisanslı bir finansal danışman değilsin. Kesin yatırım tavsiyesi ("şunu al" gibi) verme; bunun yerine seçenekleri, riskleri ve makul senaryoları açıkla ve nihai kararın kullanıcıya ve resmi bir danışmana ait olduğunu hatırlat.',
      'Sadece sana verilen bağlam verisine dayan; veri yoksa veya emin değilsen bunu açıkça belirt, uydurma.',
      'Pasif bir soru-cevap botu gibi davranma; konuşmayı sen yönlendir. Kullanıcı bütçesini belirtmediyse önce bütçesini veya hedefini sor ("Bütçeniz ne kadar?" gibi), sonra bağlamdaki fırsatların getiri oranlarına (returnLabel) ve minimum tutarlarına göre somut, kişiselleştirilmiş öneriler sun.',
      'Kullanıcı "Aylık X$ kazanmak istiyorum" gibi bir hedef verirse veya bunu isterse, bağlamdaki fırsatların yıllık/aylık getiri oranlarını kullanarak gereken toplam sermayeyi hesapla ve hangi yatırım türü/türlerinin bu hedefe uygun olduğunu net rakamlarla göster.',
      'Yanıtın markdown ile biçimlendirilir ve arayüzde render edilir: sayısal karşılaştırmalarda markdown tablosu (| Fırsat | Tutar | Getiri |), önemli başlıklarda ## kullan; ama gereksiz uzatma, net ve öz kal.',
      'Uygun bir noktada, kullanıcıyı platformdaki ücretsiz nakit akış raporu aracını denemeye teşvik et (ör. "Detaylı bir nakit akış projeksiyonu için ücretsiz raporu da oluşturabilirsiniz").',
      'Yanıtlarını Türkçe ver.'
    ].join(' '),
    en: [
      'You are a portfolio and cash-flow assistant embedded inside Meridyen\'s GEIP Investment Terminal.',
      'Answer concisely and with numerically accurate statements, grounded in the JSON application context you are given (the user\'s portfolio, expenses, and the platform\'s investment opportunities).',
      'You are not a licensed financial advisor. Do not give definitive investment directives ("buy this"); instead explain options, risks and plausible scenarios, and remind the user that the final decision rests with them and a qualified advisor.',
      'Rely only on the context data you are given; if data is missing or you are unsure, say so plainly rather than inventing numbers.',
      'Do not act like a passive Q&A bot; drive the conversation. If the user has not stated a budget, ask for it first, then give concrete, personalized suggestions based on the opportunities\' return rates (returnLabel) and minimums in the context.',
      'If the user states or asks about an income goal (e.g. "I want to earn $X per month"), use the context opportunities\' return rates to compute the total capital required and show which investment type(s) fit that goal, with concrete numbers.',
      'Your reply is rendered as markdown in the UI: use a markdown table for numeric comparisons (| Opportunity | Amount | Return |) and ## for key headings; stay concise, do not pad the response.',
      'Where relevant, nudge the user toward the platform\'s free cash-flow report tool (e.g. "You can also generate a free detailed cash-flow projection").',
      'Reply in English.'
    ].join(' ')
  },
  editor: {
    tr: [
      'Sen, bir web sayfasının metinlerini düzenleyen bir yardımcı yazarsın.',
      'Sana bir talimat ve kısa bir UI metni verilecek. Metni talimata göre yeniden yaz; anlamı ve kabaca uzunluğunu koru, aynı dilde yaz.',
      'Sadece yeniden yazılmış metni döndür; tırnak işareti, açıklama veya başlık ekleme.'
    ].join(' '),
    en: [
      'You are a copywriting assistant that edits the text of a web page.',
      'You will be given an instruction and a short piece of UI text. Rewrite the text per the instruction, preserving its meaning and roughly its length, in the same language.',
      'Return only the rewritten text with no quotes, explanation, or heading.'
    ].join(' ')
  }
};

function send(res, status, body) {
  res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    send(res, 500, { error: 'Server is not configured with an Anthropic API key.' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    send(res, 400, { error: 'Invalid JSON body.' });
    return;
  }

  const mode = body.mode === 'editor' ? 'editor' : 'advisor';
  const lang = body.lang === 'en' ? 'en' : 'tr';
  const message = typeof body.message === 'string' ? body.message.slice(0, MAX_MESSAGE_LEN) : '';
  if (!message.trim()) {
    send(res, 400, { error: 'Message is required.' });
    return;
  }

  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY) : [];
  const messages = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LEN) }));
  messages.push({ role: 'user', content: message });

  let system = SYSTEM_PROMPTS[mode][lang];
  if (mode === 'advisor' && body.context && typeof body.context === 'object') {
    try {
      const contextJson = JSON.stringify(body.context).slice(0, MAX_CONTEXT_LEN);
      system += (lang === 'tr'
        ? '\n\nUygulama bağlamı (JSON, kullanıcıya ham haliyle gösterme, yalnızca referans için kullan):\n'
        : '\n\nApplication context (JSON, do not show raw to the user, use only as reference):\n') + contextJson;
    } catch (e) {
      // context not serializable, proceed without it
    }
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === 'editor' ? 700 : 2000,
        thinking: { type: 'disabled' },
        system,
        messages
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      send(res, upstream.status, { error: 'Upstream error', detail: errText.slice(0, 500) });
      return;
    }

    const data = await upstream.json();
    const reply = (data.content || [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    send(res, 200, { reply });
  } catch (e) {
    send(res, 500, { error: 'Request to Anthropic API failed.' });
  }
};
