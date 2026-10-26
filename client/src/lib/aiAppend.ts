/* 🤖 AI Assistant — APPEND-ONLY engine (StudyBull admin, Oct 27 2026; Aarav 11:30 PM Oct 26).
 * Aarav's rule: the AI may only ADD new data. Everything that already exists (ids, texts, options,
 * answers, order, settings) must stay byte-identical. This file is the code that enforces it:
 *  - applyAdditions(): builds the new tree by appending only (new questions after old ones, new
 *    children after old ones; the only "top" insert is a new day in the Current Affairs date lists).
 *  - checkAppendOnly(): diffs old vs new tree and rejects ANY change to an existing item.
 *  - validateMcq(), dedupe, per-tile size guard.
 * Pure functions, no React, no network. */

export type Q = { id: string; question: string; options: string[]; correctIndex: number; explanation?: string };
export type Passage = { id: string; title: string; lang: "hi" | "en"; duration: number; text: string; difficulty?: string; targetWpm?: number };
export type AnyNode = {
  id: string;
  title: string;
  kind: string;
  icon?: string;
  subtitle?: string;
  enabled?: boolean;
  children?: AnyNode[];
  questions?: Q[];
  passages?: Passage[];
  notesContent?: string;
  [k: string]: unknown;
};

export const TILE_LIMIT = 2_500_000; // bytes per tile row (Aarav's size guard)
export const TILE_WARN = 2_400_000;
export const BAD_TEXT = ["document.", "var ", "STORE_KEY", "moodmoji", "BATCH=", "elementById", "onclick="];
const HEAVY_KEYS = ["children", "passages"];

/* ---------------- basics ---------------- */
export function canon(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(x => (x === undefined ? "null" : canon(x))).join(",") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter(k => o[k] !== undefined).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

export function byteLen(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}

export function tileBytes(tile: AnyNode): number {
  const heavy: Record<string, unknown> = { id: tile?.id };
  for (const k of Object.keys(tile || {})) if (HEAVY_KEYS.includes(k)) heavy[k] = (tile as any)[k];
  return byteLen(JSON.stringify(heavy));
}

export function isContainer(n: AnyNode | undefined | null): boolean {
  if (!n) return false;
  if (n.kind === "button" || n.kind === "folder") return true;
  return Array.isArray(n.children) && n.children.length > 0 && !["mcq", "mock", "notes", "html", "typing", "calc"].includes(n.kind);
}

export function normTitle(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

export function normQ(s: string): string {
  return String(s || "")
    .replace(/\[\s*PYQ\s*:[^\]]*\]/gi, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

export function hasDevanagari(s: string): boolean {
  return /[\u0900-\u097F]/.test(String(s || ""));
}

export function findPath(nodes: AnyNode[], id: string): AnyNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [n];
    if (Array.isArray(n.children) && n.children.length) {
      const p = findPath(n.children, id);
      if (p) return [n, ...p];
    }
  }
  return null;
}

export function walk(nodes: AnyNode[], fn: (n: AnyNode, path: AnyNode[]) => void, path: AnyNode[] = []) {
  for (const n of nodes || []) {
    fn(n, path);
    if (Array.isArray(n.children)) walk(n.children, fn, [...path, n]);
  }
}

export function collectQuestionNorms(nodes: AnyNode[]): Set<string> {
  const s = new Set<string>();
  walk(nodes, n => {
    for (const q of n.questions || []) s.add(normQ(q?.question || ""));
  });
  s.delete("");
  return s;
}

function stats(n: AnyNode) {
  let tq = 0;
  let leaves = 0;
  walk([n], x => {
    tq += (x.questions || []).length;
    if (x !== n && !isContainer(x) && x.kind !== "section") leaves++;
  });
  return { q: (n.questions || []).length, tq, ch: (n.children || []).length, leaves, pas: (n.passages || []).length };
}

/* ---------------- catalog for the planner ---------------- */
const STOP = new Set(
  "add karo kar karna krna kro karde kardo jodo jod dal daal dalo daalo upload me mein main pe par ka ki ke ko se aur or and the for this that ye yeh wo woh hai hain naya naye nayi new questions question prashn mcq mcqs quiz notes note mock test tests folder topic page bana banao banado likho likh text copy paste please plz bhai sir ek do teen char panch saat aath das sabhi sab just only bas"
    .split(" ")
);
const SYN: Record<string, string[]> = {
  history: ["इतिहास"], itihas: ["इतिहास"], mughal: ["मुगल", "मध्यकालीन"], mugal: ["मुगल", "मध्यकालीन"],
  ancient: ["प्राचीन"], prachin: ["प्राचीन"], medieval: ["मध्यकालीन"], modern: ["आधुनिक"], adhunik: ["आधुनिक"],
  geography: ["भूगोल"], bhugol: ["भूगोल"], polity: ["राजव्यवस्था"], rajniti: ["राजव्यवस्था"], samvidhan: ["संविधान", "राजव्यवस्था"],
  constitution: ["संविधान"], economy: ["अर्थव्यवस्था"], arthvyavastha: ["अर्थव्यवस्था"], science: ["विज्ञान"], vigyan: ["विज्ञान"],
  physics: ["भौतिक"], chemistry: ["रसायन"], biology: ["जीव"], reasoning: ["रीजनिंग"], maths: ["गणित"], math: ["गणित"], ganit: ["गणित"],
  hindi: ["हिंदी"], computer: ["कंप्यूटर"], gk: ["स्थैतिक", "सामान्य"], static: ["स्थैतिक"], english: ["english"], grammar: ["grammar"],
  agniveer: ["अग्निवीर"], railway: ["रेलवे"], groupd: ["रेलवे"], bihar: ["बिहार"], delhi: ["दिल्ली"], up: ["up police"], mp: ["mp police"],
  typing: ["typing"], ca: ["करंट"], current: ["करंट"], affairs: ["करंट"], ssc: ["ssc"], gd: ["ssc gd"], ntpc: ["ntpc"], chsl: ["chsl"],
  pyq: ["pyq"], river: ["नदियाँ"], nadi: ["नदियाँ"],
};

function relevanceTokens(message: string): string[] {
  const words = String(message || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    if (STOP.has(w)) continue;
    if (SYN[w]) SYN[w].forEach(x => out.add(x.toLowerCase()));
    if (/^[a-z0-9]+$/.test(w)) {
      if (w.length >= 3) out.add(w);
    } else if (w.length >= 2) out.add(w);
  }
  return Array.from(out);
}

export type Catalog = { text: string; refs: Record<string, string> };

export function buildCatalog(nodes: AnyNode[], message: string): Catalog {
  const tokens = relevanceTokens(message);
  const refs: Record<string, string> = {};
  const lines: string[] = [];
  let k = 0;
  const tag: Record<string, string> = { mcq: "Q", mock: "M", notes: "N", html: "H", typing: "T", calc: "C" };
  const rel = (t: string) => {
    const lt = String(t || "").toLowerCase();
    return tokens.some(x => lt.includes(x));
  };
  const rec = (ns: AnyNode[], depth: number, parentRel: boolean) => {
    for (const n of ns) {
      const pad = "  ".repeat(depth);
      if (isContainer(n)) {
        const ref = "F" + k++;
        refs[ref] = n.id;
        const r = parentRel || rel(n.title);
        lines.push(`${pad}${ref} ${n.title}`);
        const kids = n.children || [];
        const leaves = kids.filter(c => !isContainer(c) && c.kind !== "section");
        if (leaves.length) {
          if (r || leaves.length <= 3) {
            for (const l of leaves.slice(0, 40)) {
              const q = (l.questions || []).length;
              lines.push(`${pad}  ${tag[l.kind] || "?"}: ${l.title}${q ? ` (${q})` : ""}`);
            }
            if (leaves.length > 40) lines.push(`${pad}  (+${leaves.length - 40} more)`);
          } else lines.push(`${pad}  (+${leaves.length} pages)`);
        }
        rec(kids.filter(c => isContainer(c)), depth + 1, r);
      } else if (depth === 0 && n.kind === "typing") {
        lines.push(`T: ${n.title} (${(n.passages || []).length} passages)`);
      }
    }
  };
  rec(nodes, 0, false);
  return { text: lines.join("\n"), refs };
}

/* find an existing leaf by (approximate) title inside a folder subtree */
export function findExistingLeaf(root: AnyNode, title: string, kinds?: string[]): { node: AnyNode | null; candidates: AnyNode[] } {
  const want = normTitle(title);
  if (!want) return { node: null, candidates: [] };
  const all: { n: AnyNode; score: number }[] = [];
  walk([root], n => {
    if (n === root || isContainer(n)) return;
    if (kinds && !kinds.includes(n.kind)) return;
    const t = normTitle(n.title);
    let score = 0;
    if (t === want) score = 100;
    else if (t.includes(want) || want.includes(t)) score = 60 - Math.abs(t.length - want.length) / 10;
    else {
      const a = new Set(want.split(" ").filter(w => w.length > 1));
      const b = t.split(" ").filter(w => w.length > 1);
      const common = b.filter(w => a.has(w)).length;
      if (common) score = (20 * common) / Math.max(a.size, b.length);
    }
    if (score > 0) all.push({ n, score });
  });
  all.sort((x, y) => y.score - x.score);
  if (!all.length) return { node: null, candidates: [] };
  if (all.length > 1 && all[0].score < 100 && all[1].score >= all[0].score - 1) return { node: null, candidates: all.slice(0, 4).map(x => x.n) };
  if (all[0].score < 15) return { node: null, candidates: all.slice(0, 4).map(x => x.n) };
  return { node: all[0].n, candidates: [] };
}

/* ---------------- validation of new content ---------------- */
export function validateMcq(q: Q, needHindi: boolean): string | null {
  if (!q || typeof q !== "object") return "खाली प्रश्न";
  const qt = String(q.question || "").trim();
  if (qt.length < 5) return "प्रश्न बहुत छोटा/खाली";
  if (qt.length > 900) return "प्रश्न बहुत लंबा";
  if (!Array.isArray(q.options) || q.options.length !== 4) return "4 विकल्प नहीं";
  const opts = q.options.map(o => String(o ?? "").trim());
  if (opts.some(o => !o)) return "कोई विकल्प खाली";
  if (opts.some(o => o.length > 400)) return "विकल्प बहुत लंबा";
  if (new Set(opts.map(o => normQ(o) || o)).size !== 4) return "विकल्प दोहराए गए";
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) return "सही उत्तर (0-3) नहीं";
  const all = [qt, ...opts, String(q.explanation || "")].join("\n");
  const bad = BAD_TEXT.find(b => all.includes(b));
  if (bad) return `"${bad.trim()}" वाला text साइट पर छिप जाता है`;
  if (needHindi && !hasDevanagari(qt)) return "हिंदी (देवनागरी) में नहीं";
  return null;
}

export function dedupeQuestions(qs: Q[], existing: Set<string>): { kept: Q[]; skipped: Q[] } {
  const seen = new Set(existing);
  const kept: Q[] = [];
  const skipped: Q[] = [];
  for (const q of qs) {
    const k = normQ(q.question);
    if (!k || seen.has(k)) skipped.push(q);
    else {
      seen.add(k);
      kept.push(q);
    }
  }
  return { kept, skipped };
}

/* ---------------- building new items ---------------- */
let seq = 0;
export function newId(kind: string): string {
  seq = (seq + 1) % 100000;
  return `ai-${kind}-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

export function toQuestion(raw: any, pyq?: string): Q | null {
  if (!raw) return null;
  const opts = Array.isArray(raw.o) ? raw.o : Array.isArray(raw.options) ? raw.options : null;
  const qt = String(raw.q ?? raw.question ?? "").trim();
  let a = raw.a ?? raw.answer ?? raw.correctIndex;
  if (typeof a === "string") {
    const t = a.trim().toUpperCase();
    a = "ABCD".indexOf(t.charAt(0)) >= 0 && t.length <= 3 ? "ABCD".indexOf(t.charAt(0)) : opts ? opts.findIndex((o: string) => String(o).trim() === a.trim()) : -1;
  }
  if (!opts || !qt) return null;
  const tag = pyq ? `[PYQ: ${pyq}] ` : "";
  return {
    id: newId("q"),
    question: tag + qt.replace(/^\s*(?:प्रश्न|question|q)\s*\d*\s*[.:)-]\s*/i, ""),
    options: opts.slice(0, 4).map((o: unknown) => String(o ?? "").trim().replace(/^\(?[A-Dअ-द]\)?[.):]\s+/, "")),
    correctIndex: Number(a),
    explanation: String(raw.e ?? raw.explanation ?? "").trim(),
  };
}

export function quizSubtitle(n: number, pyq?: string): string {
  return pyq ? `${n} प्रश्न • 📜 असली PYQ (${pyq})` : `${n} प्रश्न • PYQ स्टाइल • हिंदी व्याख्या सहित`;
}

export function makeFolder(title: string, icon?: string): AnyNode {
  return { id: newId("folder"), title: title.trim().slice(0, 120), kind: "button", icon: icon || "📁", subtitle: "", enabled: true, children: [] };
}
export function makeQuiz(title: string, questions: Q[], icon?: string, pyq?: string): AnyNode {
  return { id: newId("mcq"), title: title.trim().slice(0, 120), kind: "mcq", icon: icon || "🎯", subtitle: quizSubtitle(questions.length, pyq), enabled: true, children: [], questions };
}
export function makeMock(title: string, questions: Q[], duration: number, pos: number, neg: number, pattern: string): AnyNode {
  const negTxt = neg > 0 ? `−${neg}` : "कोई ऋणात्मक नहीं";
  return {
    id: newId("mock"),
    title: title.trim().slice(0, 120),
    kind: "mock",
    icon: "📝",
    subtitle: `${questions.length} प्रश्न • ${duration} मिनट • +${pos} / ${negTxt}${pattern ? ` • पूर्ण पैटर्न (${pattern})` : ""}`,
    enabled: true,
    children: [],
    durationMinutes: duration,
    positiveMarks: pos,
    negativeMarks: neg,
    questions,
  };
}
export function makeNotes(title: string, content: string, icon?: string): AnyNode {
  return { id: newId("notes"), title: title.trim().slice(0, 120), kind: "notes", icon: icon || "📖", subtitle: "मुख्य बातें • ⭐ परीक्षा तथ्य • 📌 याद रखो", enabled: true, children: [], notesContent: content };
}
export function makePassage(title: string, text: string, lang: "hi" | "en"): Passage {
  return { id: newId("passage"), title: title.trim().slice(0, 120), lang, duration: 10, text: text.trim(), difficulty: "medium", targetWpm: lang === "hi" ? 25 : 35 };
}

/* ---------------- additions → new tree ---------------- */
export type Addition =
  | { op: "append_questions"; targetId: string; questions: Q[] }
  | { op: "append_notes"; targetId: string; text: string }
  | { op: "append_passages"; targetId: string; passages: Passage[] }
  | { op: "add_child"; parentId: string; node: AnyNode; position: "end" | "start" };

const UNIT_Q = "(?:प्रश्न|सवाल|questions?|qs?|mcqs?)";
const UNIT_L = "(?:टॉपिक|lessons?|पेज|आइटम|सेक्शन|टेस्ट|tests?|topics?|मॉक)";
const UNIT_P = "(?:passages?|पैसेज)";

export function bumpSubtitle(sub: string, o: ReturnType<typeof stats>, n: ReturnType<typeof stats>): string {
  if (!sub) return sub;
  const rep = (s: string, unit: string, pairs: [number, number][]) =>
    s.replace(new RegExp(`(\\d+)(\\s*)(${unit})`, "giu"), (m, num, sp, u) => {
      const v = Number(num);
      for (const [a, b] of pairs) if (v === a && b !== a) return `${b}${sp}${u}`;
      return m;
    });
  let s = rep(sub, UNIT_Q, [
    [o.tq, n.tq],
    [o.q, n.q],
  ]);
  s = rep(s, UNIT_L, [
    [o.leaves, n.leaves],
    [o.ch, n.ch],
  ]);
  s = rep(s, UNIT_P, [[o.pas, n.pas]]);
  return s;
}

function mapPath(nodes: AnyNode[], id: string, fn: (n: AnyNode) => AnyNode): { nodes: AnyNode[]; hit: boolean } {
  let hit = false;
  const out = nodes.map(n => {
    if (hit) return n;
    if (n.id === id) {
      hit = true;
      return fn(n);
    }
    if (Array.isArray(n.children) && n.children.length) {
      const r = mapPath(n.children, id, fn);
      if (r.hit) {
        hit = true;
        return { ...n, children: r.nodes };
      }
    }
    return n;
  });
  return { nodes: hit ? out : nodes, hit };
}

export function applyAdditions(nodes: AnyNode[], additions: Addition[]): { nodes: AnyNode[]; errors: string[] } {
  let cur = nodes;
  const errors: string[] = [];
  const touched = new Set<string>();
  for (const a of additions) {
    const id = a.op === "add_child" ? a.parentId : a.targetId;
    const r = mapPath(cur, id, n => {
      if (a.op === "append_questions") return { ...n, questions: [...(n.questions || []), ...a.questions] };
      if (a.op === "append_passages") return { ...n, passages: [...(n.passages || []), ...a.passages] };
      if (a.op === "append_notes") {
        const old = String(n.notesContent || "");
        return { ...n, notesContent: old + (old && !old.endsWith("\n") ? "\n" : "") + (old ? "\n" : "") + a.text };
      }
      const kids = n.children || [];
      return { ...n, children: a.position === "start" ? [a.node, ...kids] : [...kids, a.node] };
    });
    if (!r.hit) errors.push(`जगह नहीं मिली (${id})`);
    else {
      cur = r.nodes;
      touched.add(id);
    }
  }
  // bump the "N प्रश्न / N टॉपिक" counts in the subtitles of the touched items and their parents
  const bumpIds = new Set<string>();
  touched.forEach(id => (findPath(nodes, id) || []).forEach(p => bumpIds.add(p.id)));
  bumpIds.forEach(id => {
    const oldPath = findPath(nodes, id);
    const newPath = findPath(cur, id);
    if (!oldPath || !newPath) return;
    const o = oldPath[oldPath.length - 1];
    const nn = newPath[newPath.length - 1];
    const sub = bumpSubtitle(String(o.subtitle || ""), stats(o), stats(nn));
    if (sub !== String(o.subtitle || "")) cur = mapPath(cur, id, x => ({ ...x, subtitle: sub })).nodes;
  });
  return { nodes: cur, errors };
}

/* ---------------- THE GUARD: old tree vs new tree ---------------- */
export type GuardResult = {
  ok: boolean;
  errors: string[];
  added: { nodes: number; questions: number; passages: number; notesAppends: number };
  tileBytes: Record<string, { before: number; after: number; title: string }>;
};

function subtitleBumpOk(o: AnyNode, n: AnyNode, ns: AnyNode): boolean {
  const a = String(o.subtitle ?? "");
  const b = String(ns.subtitle ?? "");
  if (a.replace(/\d+/g, "#") !== b.replace(/\d+/g, "#")) return false;
  return bumpSubtitle(a, stats(o), stats(n)) === b;
}

export function checkAppendOnly(
  oldNodes: AnyNode[],
  newNodes: AnyNode[],
  opts: { prependParents?: Set<string> } = {}
): GuardResult {
  const errors: string[] = [];
  const added = { nodes: 0, questions: 0, passages: 0, notesAppends: 0 };
  const oldIds = new Set<string>();
  const oldQIds = new Set<string>();
  walk(oldNodes, n => {
    oldIds.add(n.id);
    for (const q of n.questions || []) oldQIds.add(String(q?.id));
    for (const p of n.passages || []) oldQIds.add(String(p?.id));
  });
  const newSeen = new Set<string>();
  const err = (s: string) => {
    if (errors.length < 30) errors.push(s);
  };

  const checkNewNode = (n: AnyNode, where: string) => {
    if (!n || typeof n !== "object" || !n.id) return err(`${where}: नया item अधूरा`);
    if (oldIds.has(n.id) || newSeen.has(n.id)) return err(`${where}: id "${n.id}" पहले से है (move/copy मना है)`);
    newSeen.add(n.id);
    added.nodes++;
    if (!["button", "folder", "mcq", "mock", "notes"].includes(n.kind)) err(`${where}: "${n.kind}" टाइप AI नहीं बना सकता`);
    for (const q of n.questions || []) {
      if (oldQIds.has(String(q.id)) || newSeen.has(String(q.id))) err(`${where}: प्रश्न id दोहराया`);
      newSeen.add(String(q.id));
      added.questions++;
    }
    for (const c of n.children || []) checkNewNode(c, `${where} › ${c?.title}`);
  };

  const cmpArray = (o: any[] | undefined, nn: any[] | undefined, where: string, what: string, count: "questions" | "passages") => {
    const a = o || [];
    const b = nn || [];
    if (b.length < a.length) return err(`${where}: ${a.length - b.length} पुराने ${what} हटे — मना है`);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (canon(a[i]) !== canon(b[i])) return err(`${where}: पुराना ${what} #${i + 1} बदला/हिला — मना है`);
    }
    for (let i = a.length; i < b.length; i++) {
      const id = String(b[i]?.id || "");
      if (!id || oldQIds.has(id) || newSeen.has(id)) err(`${where}: नए ${what} #${i + 1} की id गलत/दोहराई`);
      newSeen.add(id);
      added[count]++;
    }
  };

  const cmpNode = (o: AnyNode, n: AnyNode, where: string) => {
    if (o === n) return;
    if (!n || n.id !== o.id) return err(`${where}: item बदला/हटा — मना है`);
    const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
    keys.forEach(k => {
      const a = (o as any)[k];
      const b = (n as any)[k];
      if (a === b) return;
      if (k === "children") return cmpChildren(o, n, where);
      if (k === "questions") return cmpArray(a, b, where, "प्रश्न", "questions");
      if (k === "passages") return cmpArray(a, b, where, "passage", "passages");
      if (k === "notesContent" && typeof a === "string" && typeof b === "string" && a.length > 0 && b.length > a.length && b.startsWith(a)) {
        added.notesAppends++;
        return;
      }
      if (k === "subtitle" && subtitleBumpOk(o, n, n)) return;
      if (canon(a) !== canon(b)) err(`${where}: "${k}" बदला — मना है`);
    });
  };

  const cmpChildren = (o: AnyNode, n: AnyNode, where: string) => {
    const oc = o.children || [];
    const nc = n.children || [];
    if (!Array.isArray(nc)) return err(`${where}: children गायब`);
    if (oc.length === 0) {
      nc.forEach(c => checkNewNode(c, `${where} › ${c?.title}`));
      return;
    }
    const start = nc.findIndex(c => c && c.id === oc[0].id);
    if (start < 0) return err(`${where}: पहला पुराना item "${oc[0].title}" हटा/हिला — मना है`);
    if (start > 0 && !(opts.prependParents && opts.prependParents.has(o.id))) return err(`${where}: नया item पुराने items के ऊपर — सिर्फ़ अंत में जोड़ सकते हैं`);
    for (let i = 0; i < oc.length; i++) {
      const c = nc[start + i];
      if (!c || c.id !== oc[i].id) return err(`${where}: पुराना item "${oc[i].title}" हटा या क्रम बदला — मना है`);
      cmpNode(oc[i], c, `${where} › ${oc[i].title}`);
    }
    nc.slice(0, start).forEach(c => checkNewNode(c, `${where} › ${c?.title}`));
    nc.slice(start + oc.length).forEach(c => checkNewNode(c, `${where} › ${c?.title}`));
  };

  if (!Array.isArray(newNodes) || newNodes.length !== oldNodes.length) err(`होम टाइल्स की गिनती बदली (${oldNodes.length} → ${newNodes?.length}) — नई home tile मना है`);
  else
    oldNodes.forEach((o, i) => {
      const n = newNodes[i];
      if (!n || n.id !== o.id) err(`होम टाइल "${o.title}" बदली/हिली — मना है`);
      else cmpNode(o, n, o.title);
    });

  const tb: GuardResult["tileBytes"] = {};
  if (Array.isArray(newNodes))
    newNodes.forEach((n, i) => {
      const o = oldNodes[i];
      if (!o || o === n) return;
      const before = tileBytes(o);
      const after = tileBytes(n);
      tb[n.id] = { before, after, title: n.title };
      if (after > TILE_LIMIT && after > before) err(`"${n.title}" टाइल ${(after / 1e6).toFixed(2)} MB हो जाएगी — 2.5 MB सीमा से ज़्यादा`);
    });

  if (!errors.length && added.nodes + added.questions + added.passages + added.notesAppends === 0) err("कुछ नया जोड़ने को नहीं मिला");
  return { ok: errors.length === 0, errors, added, tileBytes: tb };
}

/* Current Affairs date lists (दैनिक/मासिक) are the only places where a new item goes on TOP (newest first). */
export function caPrependParents(nodes: AnyNode[]): Set<string> {
  const s = new Set<string>();
  const ca = nodes.find(n => /करंट|current affairs/i.test(n.title));
  for (const c of ca?.children || []) if (isContainer(c)) s.add(c.id);
  return s;
}

export function pathText(path: AnyNode[]): string {
  return path.map(p => `${p.icon ? p.icon + " " : ""}${p.title}`).join(" › ");
}
