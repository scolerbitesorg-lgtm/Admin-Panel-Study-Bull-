// 🤖 StudyBull admin AI Assistant — server side (Vercel Node function, no dependencies). Oct 27 2026.
// The browser never sees any AI key. Only the signed-in StudyBull admin can call this:
// the caller's Supabase session token must be able to read the private settings row ("main"),
// which Row Level Security allows ONLY for the admin email login.
// AI route: GROQ_API_KEY in this project's env (if set) → direct; otherwise Aarav's own Karya AI
// server (AI_PROXY_URL, default his karya-ai Vercel /api/chat, which holds his key in its own env).
// This function WRITES NOTHING: it only turns text into proposed NEW items; the admin page checks
// them (append-only) and saves through its normal save path after Aarav taps ✅ Add.

const SB_URL = process.env.SUPABASE_URL || "https://epsplspwdjjjjezxscer.supabase.co";
const SB_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_X8IsGDLwK9fUliHih60dlg_vqyOiePl";
const PROXY_URL = process.env.AI_PROXY_URL || "https://karya-ai-eight.vercel.app/api/chat";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

const authCache = new Map(); // token hash -> expiry ms

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body));
  }
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 400 * 1024) throw new Error("too_large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function hashToken(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String(h >>> 0) + ":" + t.length + ":" + t.slice(-12);
}

async function isAdmin(token) {
  if (!token || token.length < 40) return false;
  const k = hashToken(token);
  const exp = authCache.get(k);
  if (exp && exp > Date.now()) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/studybull_app_state?id=eq.main&select=id`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const j = await r.json();
    const ok = Array.isArray(j) && j.length === 1 && j[0] && j[0].id === "main";
    if (ok) {
      authCache.set(k, Date.now() + 4 * 60 * 1000);
      if (authCache.size > 200) authCache.clear();
    }
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------ prompts ------------------------------ */
const RULES_COMMON = `You work for the StudyBull exam-prep site (SSC GD, Agniveer, Police, Railway, SSC level, 12th pass students). Owner: Aarav.
Hindi must be in Devanagari script (never romanized Hindi). Keep facts exam-correct and standard (NCERT/Lucent level). Never invent current affairs, dates or real past-paper (PYQ) claims.
Reply with ONE JSON object only. No markdown, no code fences, no text outside the JSON.`;

const PLAN_SYSTEM = `${RULES_COMMON}
You are the planner of the admin "AI Assistant". It can ONLY ADD NEW content. It can NEVER edit, change, rename, move, reorder, hide or delete anything that already exists, and never touch passcodes, theme, colours, maintenance mode, settings, or the home screen tiles (no new home tiles).
Aarav writes in Hinglish/Hindi/English. Decide what NEW items to add and exactly where, using the CATALOG of existing folders (each line: ref, title; leaves show kind letter Q=MCQ quiz, M=mock test, N=notes page, H=web page, T=typing, with question count).
Item types:
- "mcq": MCQ questions. Either append to an EXISTING quiz (set "existing" to its exact title from the catalog; e.g. History PYQ 73 → 80) or create a NEW quiz (set "title").
- "notes": a study notes page (new page with "title", or append text at the end of an existing notes page via "existing").
- "mock": a NEW full mock test inside an exam folder of the Mock Test tile (title like "<Exam> Mock Test <n>", with "count", "duration" minutes, "pos" marks, "neg" negative marks, "sections" [{"name","count"}]). Or "existing" to append questions to an existing mock.
- "typing": a new typing passage in the Typing tile ("lang" "hi" or "en", "title").
- "ca_day": a new Current Affairs day (only from text Aarav pasted; "date" like "27 अक्टूबर 2026").
- "folder": only a new empty folder/topic.
Placement: "parent" = the ref (like F12) of the folder the item goes into. "new_folders" = titles of NEW folders to create (in order, nested) under parent before the item, only if Aarav asks for a new folder/topic/section or no fitting folder exists. Prefer the right subject → part → topic. Quiz content goes in the Quiz tile, notes in the Notes tile, mocks in Mock Test.
"source": "paste" when Aarav gave the content text himself (use it, do not rewrite), "generate" when you must write new content (then set "count" and "topic" with clear instructions in English, e.g. "Mughal empire: Babur to Aurangzeb, battles, buildings").
"pyq": ONLY if Aarav explicitly says these are REAL previous-year questions and names the exam/year (e.g. "SSC GD 2023"); otherwise "".
"lang": "hi" (Hindi-first Devanagari, default) or "en" (only for English-language subjects/passages).
If Aarav asks to delete, edit, change, correct, rename, move, reorder, hide, or to change passcode/theme/maintenance/settings/home tiles → action "refuse" and explain in short Hinglish that you can only add new things. If he asks for a Job Alert entry → "refuse" with: Job Alert admin me nahi hai, use Tab update karta hai. If it's just a question/greeting → action "chat". If something essential is unclear (e.g. no subject) → action "ask" with one short question.
Output schema:
{"action":"add"|"refuse"|"chat"|"ask","reply":"<short Hinglish, 1-2 lines>","tasks":[{"type":"mcq|notes|mock|typing|ca_day|folder","parent":"F12","existing":"","new_folders":[],"title":"","icon":"","source":"generate|paste","count":0,"topic":"","lang":"hi","pyq":"","date":"","duration":0,"pos":0,"neg":0,"sections":[]}]}
Do not add a separate "folder" task for a folder that another task already creates through "new_folders". Put any emoji in "icon", not in "title". Keep at most 6 tasks. Counts: max 50 MCQs per task unless pasted.`;

const MCQ_SYSTEM = `${RULES_COMMON}
Write NEW original exam MCQs for StudyBull. Each MCQ: question, exactly 4 distinct options, exactly one correct answer (index 0-3), and a one-line explanation in Hindi.
Language: if lang is "hi" write the question, options and explanation in Hindi (Devanagari); you may add a short English term in brackets. If lang is "en" write question/options in English and the explanation in Hindi (Devanagari).
Do not repeat any question from the AVOID list. Vary the correct option position. Facts must be standard and certain; skip doubtful facts.
Never write the text "var " anywhere. Do not add any [PYQ: ...] tag.
Output: {"questions":[{"q":"...","o":["...","...","...","..."],"a":0,"e":"..."}]}`;

const CONVERT_SYSTEM = `${RULES_COMMON}
Aarav pasted TEXT. Turn it into MCQs.
1) If the text already contains MCQs (question + options + answer), extract them EXACTLY as written (same wording, same options, same answer). If an answer is missing and you are not sure, skip that question.
2) Otherwise, write MCQs that test ONLY facts stated in the text (no outside facts), in the language of the text (Hindi in Devanagari).
Each MCQ: exactly 4 options, one correct index 0-3, one-line explanation (Hindi). Never write "var ". Do not add [PYQ] tags.
Output: {"questions":[{"q":"...","o":["...","...","...","..."],"a":0,"e":"..."}]}`;

const VERIFY_SYSTEM = `${RULES_COMMON}
You are a strict fact-checker for exam MCQs (Indian competitive exams, NCERT/Lucent standard).
For EACH MCQ check: the marked answer (index "a", 0-3) is definitely correct; exactly one option is correct; the question and explanation contain no false fact; it is not ambiguous. If you are not sure, mark it not ok.
Output: {"results":[{"i":0,"ok":true,"why":""}]} with one entry per MCQ, in order; "why" = at most 8 English words, only when not ok.`;

const NOTES_SYSTEM = `${RULES_COMMON}
Write clean exam study notes for StudyBull in Hindi (Devanagari), in your own words.
Format (plain text, no markdown tables): headings as lines starting with "# ", points as lines starting with "▸ ", a section "⭐ परीक्षा तथ्य" with key exam facts, and a section "📌 याद रखो" with 3-5 memory points. English terms may follow in brackets.
Write ONLY the part asked for (PART), compact, about 1200-1800 characters.
Output: {"title":"<short Hindi title>","content":"<notes text with \\n line breaks>"}`;

const TYPING_SYSTEM = `${RULES_COMMON}
Write ONE original typing-practice passage for SSC/CPCT/police typing tests: one continuous paragraph (no line breaks, no bullet points), plain punctuation, about the requested number of words, on the requested topic, useful general-awareness content. If lang is "hi" write in Hindi Devanagari (Unicode/Mangal style); if "en" write in English with proper capitals and punctuation.
Output: {"title":"<short title>","text":"<the passage>"}`;

function userMsg(obj) {
  return JSON.stringify(obj);
}

function buildMessages(mode, input) {
  const s = (v, n) => String(v == null ? "" : v).slice(0, n);
  switch (mode) {
    case "plan":
      return [
        { role: "system", content: PLAN_SYSTEM },
        {
          role: "user",
          content:
            `CATALOG (existing folders):\n${s(input.catalog, 14000)}\n\n` +
            (input.history ? `RECENT CHAT:\n${s(input.history, 1500)}\n\n` : "") +
            (input.paste ? `PASTED TEXT INFO: ${s(input.paste, 2600)}\n\n` : "") +
            `AARAV'S MESSAGE: ${s(input.message, 2500)}`,
        },
      ];
    case "mcq":
      return [
        { role: "system", content: MCQ_SYSTEM },
        {
          role: "user",
          content: userMsg({
            count: Math.max(1, Math.min(10, Number(input.count) || 3)),
            topic: s(input.topic, 600),
            where: s(input.where, 300),
            lang: input.lang === "en" ? "en" : "hi",
            section: s(input.section, 120),
            AVOID: Array.isArray(input.avoid) ? input.avoid.slice(0, 60).map((x) => s(x, 90)) : [],
          }),
        },
      ];
    case "convert":
      return [
        { role: "system", content: CONVERT_SYSTEM },
        {
          role: "user",
          content: userMsg({ want: Number(input.want) || 0, lang: input.lang === "en" ? "en" : "hi", TEXT: s(input.text, 6000) }),
        },
      ];
    case "verify":
      return [
        { role: "system", content: VERIFY_SYSTEM },
        {
          role: "user",
          content: userMsg({
            MCQS: (Array.isArray(input.questions) ? input.questions.slice(0, 10) : []).map((q, i) => ({
              i,
              q: s(q && q.q, 700),
              o: Array.isArray(q && q.o) ? q.o.slice(0, 4).map((x) => s(x, 200)) : [],
              a: Number(q && q.a),
              e: s(q && q.e, 400),
            })),
          }),
        },
      ];
    case "notes":
      return [
        { role: "system", content: NOTES_SYSTEM },
        { role: "user", content: userMsg({ topic: s(input.topic, 600), where: s(input.where, 300), PART: s(input.part, 300) }) },
      ];
    case "typing":
      return [
        { role: "system", content: TYPING_SYSTEM },
        {
          role: "user",
          content: userMsg({ topic: s(input.topic, 300), lang: input.lang === "en" ? "en" : "hi", words: Math.max(80, Math.min(400, Number(input.words) || 200)) }),
        },
      ];
    default:
      return null;
  }
}

/* ------------------------------ AI call ------------------------------ */
function extractJson(text) {
  let t = String(text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const body = t.slice(a, b + 1);
  try {
    return JSON.parse(body);
  } catch {
    try {
      return JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

async function callAI(messages, wantTokens, effort = "low") {
  const key = process.env.GROQ_API_KEY;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55000);
  try {
    if (key) {
      let last = null;
      for (const model of MODELS) {
        const r = await fetch(GROQ_URL, {
          method: "POST",
          signal: ctl.signal,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, "User-Agent": "studybull-admin/1.0" },
          body: JSON.stringify({
            model,
            messages,
            max_completion_tokens: Math.min(8000, wantTokens * 3),
            temperature: 0.4,
            reasoning_effort: effort,
            include_reasoning: false,
            stream: false,
          }),
        });
        if (r.ok) return { ok: true, j: await r.json(), via: "direct" };
        last = r.status;
        await r.text().catch(() => "");
        if (![429, 503, 404, 413].includes(r.status)) break;
      }
      return { ok: false, status: last || 502, via: "direct" };
    }
    const r = await fetch(PROXY_URL, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", "User-Agent": "studybull-admin/1.0" },
      body: JSON.stringify({
        model: MODELS[0],
        messages,
        stream: false,
        max_completion_tokens: 1024,
        temperature: 0.4,
        reasoning_effort: effort,
        include_reasoning: false,
      }),
    });
    if (!r.ok) {
      let retry = r.headers.get("retry-after");
      await r.text().catch(() => "");
      return { ok: false, status: r.status, retryAfter: retry, via: "karya" };
    }
    return { ok: true, j: await r.json(), via: "karya" };
  } catch (e) {
    return { ok: false, status: e && e.name === "AbortError" ? 504 : 502, via: key ? "direct" : "karya" };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return send(res, 200, { ok: true, route: process.env.GROQ_API_KEY ? "direct" : "karya", chunk: process.env.GROQ_API_KEY ? 8 : 4 });
  }
  if (req.method !== "POST") return send(res, 405, { ok: false, code: "method" });
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await isAdmin(token))) return send(res, 401, { ok: false, code: "not_admin", message: "Sirf admin email login wala hi AI use kar sakta hai." });
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return send(res, e && e.message === "too_large" ? 413 : 400, { ok: false, code: "bad_body" });
  }
  const mode = String((body && body.mode) || "");
  const messages = buildMessages(mode, (body && body.input) || {});
  if (!messages) return send(res, 400, { ok: false, code: "bad_mode" });
  const want = mode === "plan" ? 900 : mode === "notes" ? 1000 : mode === "typing" ? 900 : 1000;
  const effort = mode === "mcq" || mode === "verify" || mode === "notes" ? "medium" : "low";
  const r = await callAI(messages, want, effort);
  if (!r.ok) {
    const st = r.status || 502;
    const code = st === 429 ? "busy" : st === 401 || st === 403 || st === 500 ? "nokey" : st === 504 ? "timeout" : "ai_error";
    return send(res, 200, { ok: false, code, status: st, retryAfter: r.retryAfter || null, via: r.via });
  }
  const choice = r.j && r.j.choices && r.j.choices[0];
  const content = choice && choice.message && choice.message.content;
  const data = extractJson(content);
  if (!data) return send(res, 200, { ok: false, code: "bad_json", finish: choice && choice.finish_reason, via: r.via });
  return send(res, 200, { ok: true, data, finish: choice.finish_reason, model: r.j.model, via: r.via });
}

// exported for local tests only
export { buildMessages, extractJson, callAI };
