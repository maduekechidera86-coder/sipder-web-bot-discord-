import { prexzy } from './prexzy.js';
import { truncate } from '../utils/format.js';

/**
 * The AI layer. EVERY endpoint below was verified live against
 * https://prexzyapis.com before it was written down — nothing is guessed or
 * invented, and no command file ever contains a URL.
 *
 * Verified on 2026-10-08:
 *   GET /ai/ch?q=                          → { response }              (chat)
 *   GET /ai/gemini?prompt=                 → { response }              (chat)
 *   GET /ai/mistral?prompt=                → { response }              (chat)
 *   GET /ai/qwen?prompt=&model=            → { response }              (chat)
 *   GET /ai/prompttocode?prompt=&language= → { title, code, explanation }
 *   GET /ai/detectbugs?code=               → { title, code, explanation }
 *   GET /ai/explaincode?code=&lang=        → { title, explanation }
 *   GET /ai/genimage?prompt=&width=&height=&steps= → { image_url }
 *   GET /imagecreator/meme?topText=&bottomText=    → image/png
 *   GET /imagecreator/image?text=&background=&color=&emojiStyle= → image/png
 *   GET /tts/<voice>?text=                 → audio/mpeg
 *
 * No vision/describe endpoint exists in the catalogue, so /describe works on
 * text and links only — it says so instead of pretending to see an image.
 */
export const AI_ENDPOINTS = Object.freeze({
  chatWeb: '/ai/ch',
  chatGemini: '/ai/gemini',
  chatMistral: '/ai/mistral',
  chatQwen: '/ai/qwen',
  promptToCode: '/ai/prompttocode',
  detectBugs: '/ai/detectbugs',
  explainCode: '/ai/explaincode',
  genImage: '/ai/genimage',
  meme: '/imagecreator/meme',
  textImage: '/imagecreator/image',
  tts: (voice) => `/tts/${encodeURIComponent(voice)}`,
});

/** Chat models that answered HTTP 200 with a real reply. */
export const MODELS = Object.freeze({
  web: { label: 'Web Core', path: AI_ENDPOINTS.chatWeb, param: 'q' },
  gemini: { label: 'Gemini', path: AI_ENDPOINTS.chatGemini, param: 'prompt' },
  mistral: { label: 'Mistral', path: AI_ENDPOINTS.chatMistral, param: 'prompt' },
  qwen: { label: 'Qwen', path: AI_ENDPOINTS.chatQwen, param: 'prompt' },
});

export const LIMITS = Object.freeze({ prompt: 1500, code: 3500, reply: 3800 });
export const IMAGE = Object.freeze({ width: 1024, height: 1024, steps: 6 });

function clamp(text, max = LIMITS.prompt) {
  return truncate(String(text ?? '').replace(/\s+/g, ' ').trim(), max).trim();
}

export function clampPrompt(text) {
  return clamp(text, LIMITS.prompt);
}

export function clampCode(text) {
  return String(text ?? '').trim().slice(0, LIMITS.code);
}

/** Different endpoints wrap their text differently — this reads all of them. */
export function readText(payload, depth = 0) {
  if (payload === null || payload === undefined || depth > 4) return null;
  if (typeof payload === 'string') return payload.trim() || null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = readText(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload !== 'object') return null;

  for (const key of ['response', 'result', 'answer', 'reply', 'text', 'message', 'content', 'output', 'explanation']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const key of ['data', 'result', 'message', 'choices', 'response']) {
    const found = readText(payload[key], depth + 1);
    if (found) return found;
  }
  if (payload.choices?.[0]?.message?.content) return String(payload.choices[0].message.content).trim();
  return null;
}

async function ask(path, query) {
  const payload = await prexzy.get(path, { query });
  const text = readText(payload);
  if (!text) {
    throw new Error('The AI endpoint answered, but the reply was empty. Try rephrasing or try again in a moment.');
  }
  return text;
}

/** One-shot chat. model: 'web' | 'gemini' | 'mistral' | 'qwen'. */
export async function chat(prompt, { model = 'web' } = {}) {
  const chosen = MODELS[model] ?? MODELS.web;
  const text = await ask(chosen.path, { [chosen.param]: clampPrompt(prompt) });
  return { text, model: chosen.label };
}

/** Instruction wrappers so /translate, /summarize, /rewrite and /explain are real tasks. */
export function taskPrompt(task, input, option = null) {
  const body = clampPrompt(input);
  switch (task) {
    case 'translate':
      return `Translate the text below into ${option ?? 'English'}. Reply with the translation alone — no notes, no quotes, no explanations.\n\nText:\n${body}`;
    case 'summarize':
      return `Summarize the text below in ${option ?? '3'} sentences or fewer. Reply with the summary alone.\n\nText:\n${body}`;
    case 'rewrite':
      return `Rewrite the text below in a ${option ?? 'clear, confident'} style. Keep the meaning. Reply with the rewritten text alone.\n\nText:\n${body}`;
    case 'explain':
      return `Explain ${body} clearly for a Discord member. Plain language, at most 7 sentences, no preamble and no markdown headings.`;
    case 'describe':
      return `Describe ${body} precisely and vividly, at most 5 sentences. Do not invent facts you cannot support.`;
    case 'ask':
      return `Answer this question directly, accurately and concisely. If you are unsure, say so.\n\nQuestion: ${body}`;
    default:
      return body;
  }
}

/** Prompt → working code + an explanation. Text only: nothing is ever executed. */
export async function promptToCode(prompt, language = 'javascript') {
  const payload = await prexzy.get(AI_ENDPOINTS.promptToCode, { query: { prompt: clampPrompt(prompt), language } });
  return {
    title: payload.title ?? null,
    language: payload.language ?? language,
    code: payload.code ?? readText(payload),
    explanation: payload.explanation ?? null,
  };
}

/** Code → bugs found and a corrected version. */
export async function detectBugs(code) {
  const payload = await prexzy.get(AI_ENDPOINTS.detectBugs, { query: { code: clampCode(code) } });
  return {
    title: payload.title ?? null,
    language: payload.language ?? null,
    code: payload.code ?? null,
    explanation: payload.explanation ?? readText(payload),
  };
}

export async function explainCode(code, lang = 'auto') {
  const payload = await prexzy.get(AI_ENDPOINTS.explainCode, { query: { code: clampCode(code), lang } });
  return {
    title: payload.title ?? null,
    language: payload.language ?? lang,
    explanation: payload.explanation ?? readText(payload),
  };
}

/** Real image generation — returns a hosted image URL. */
export async function generateImage(prompt, { width = IMAGE.width, height = IMAGE.height, steps = IMAGE.steps } = {}) {
  const payload = await prexzy.get(AI_ENDPOINTS.genImage, {
    query: { prompt: clampPrompt(prompt), width, height, steps },
  });
  const url = payload.image_url ?? payload.imageUrl ?? prexzy.findMediaUrl(payload);
  if (!url) throw new Error('The image service answered without an image. Try a different prompt.');
  return { url, prompt: clampPrompt(prompt) };
}

/** Rendered images come back as binary — these return an attachment-ready buffer. */
export async function renderMeme({ topText, bottomText }) {
  const media = await prexzy.fetchMedia(AI_ENDPOINTS.meme, {
    query: { topText: truncate(topText, 120, ''), bottomText: truncate(bottomText, 120, '') },
  });
  return { ...media, name: `meme.${media.extension === 'bin' ? 'png' : media.extension}` };
}

export async function renderTextImage(text) {
  const media = await prexzy.fetchMedia(AI_ENDPOINTS.textImage, {
    query: { text: truncate(text, 90, ''), background: '#05050a', color: '#ffffff', emojiStyle: 'apple' },
  });
  return { ...media, name: `web-text.${media.extension === 'bin' ? 'png' : media.extension}` };
}

export default chat;
