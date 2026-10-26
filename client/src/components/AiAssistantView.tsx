import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, SUPABASE_TABLE, isStudyBullDataReady } from "@/lib/supabase";
import { parseBulkMcqText } from "@/lib/mcqParser";
import {
  AnyNode,
  Addition,
  Passage,
  Q,
  applyAdditions,
  buildCatalog,
  caPrependParents,
  checkAppendOnly,
  collectQuestionNorms,
  dedupeQuestions,
  findExistingLeaf,
  findPath,
  isContainer,
  makeFolder,
  makeMock,
  makeNotes,
  makePassage,
  makeQuiz,
  newId,
  normQ,
  normTitle,
  pathText,
  quizSubtitle,
  toQuestion,
  validateMcq,
  TILE_LIMIT,
  TILE_WARN,
} from "@/lib/aiAppend";

/* 🤖 AI ASSISTANT (Aarav, 11:30 PM Oct 26 2026): "us AI ko bolke data add karva lu — purana data change/delete nahi
 * kar payega, bas new data upload kar payega (History 73 → 80)". Chat in Hinglish/Hindi or paste a big text →
 * the AI proposes NEW items → PREVIEW → only after ✅ Add they are saved through the admin's normal save path.
 * The append-only rule is enforced in code (lib/aiAppend.ts → checkAppendOnly) right before every save. */

type Props = { nodes: AnyNode[]; onCommit: (next: AnyNode[], message: string) => void };

type ItemKind = "mcq" | "notes" | "mock" | "typing" | "ca_day" | "folder";
type Item = {
  kind: ItemKind;
  parentId: string;
  newFolders: { title: string; icon: string }[];
  targetId?: string; // append into an existing item
  position: "end" | "start";
  title: string;
  icon: string;
  questions?: Q[];
  notesText?: string;
  passage?: Passage;
  mock?: { duration: number; pos: number; neg: number; pattern: string };
  caNotes?: string;
  pyq?: string;
  needHindi?: boolean;
};
type Proposal = {
  id: string;
  items: Item[];
  warnings: string[];
  errors: string[];
  status: "pending" | "saving" | "added" | "cancelled" | "failed";
  result?: string;
  sizeLine?: string;
  prompt: string;
};
type Msg = { id: string; role: "user" | "ai" | "proposal" | "error" | "key"; text?: string; proposal?: Proposal };
type LogEntry = { at: string; where: string; what: string; count: number; prompt: string };

const LOG_ROW = "admin_ai_log";
const OLD_TS = "2000-01-01T00:00:00.000Z"; // keep the row out of "newest row" readers (same rule as split rows)
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const EXAMPLES = [
  "History PYQ me 7 naye questions add karo (Mughal pe) — 73 se 80",
  "Quiz → Polity me naya topic 'प्रस्तावना (Preamble)' banao aur usme 10 MCQ daalo",
  "Notes → Science me 'प्रकाश (Light)' ke notes ka naya page banao",
  "Typing me ek naya Hindi passage add karo (अनुशासन पर)",
  "Ye MCQ Quiz → Geography → भारत का भूगोल me naye quiz 'नदियाँ अभ्यास' me add karo:\nquestion 1. गंगा नदी का उद्गम कहाँ से होता है?\nA.. गंगोत्री\nB.. यमुनोत्री\nC.. अमरकंटक\nD.. मानसरोवर\nAnd. A\nExplane. गंगा गंगोत्री (गोमुख) से निकलती है।",
];

// Hard words that mean edit/delete → refused in code before any AI call (only the instruction part is checked)
const EDIT_RE =
  /\b(delete|del|remove|hata|hatao|hatado|hta|htao|htado|mita|mitao|mitado|edit|rename|replace|reorder|passcode|password|theme|maintenance|badlo|badal\s*do|change\s*(karo|kro|kar\s*do|kardo)|sudharo|sudhar\s*do|move\s*(karo|kro|kar\s*do)|shift\s*(karo|kro)|hide|chupao)\b|हटा|मिटा|डिलीट|बदलो|बदल\s*दो|सुधारो|पासकोड|थीम/i;

function splitMessage(text: string): { instruction: string; paste: string } {
  const t = text.replace(/\r\n?/g, "\n").trim();
  const lines = t.split("\n");
  if (t.length < 350 && lines.length < 4) return { instruction: t, paste: "" };
  const looksContent = (l: string) => /^\s*(q(uestion)?\s*\d|प्रश्न|\d+\s*[.)]|[A-Dअ-द]\s*[.)]|#|▸|•|-)/i.test(l);
  const looksAsk = (l: string) => /(add|jod|daal|dal|bana|upload|karo|kro|kar\s*do|me\s*(daalo|dalo|add))/i.test(l);
  const first = lines[0].trim();
  const last = lines[lines.length - 1].trim();
  if (first.length <= 240 && !looksContent(first) && (looksAsk(first) || /[:：]$/.test(first)))
    return { instruction: first.replace(/[:：]\s*$/, ""), paste: lines.slice(1).join("\n").trim() };
  if (last.length <= 240 && !looksContent(last) && looksAsk(last)) return { instruction: last, paste: lines.slice(0, -1).join("\n").trim() };
  return { instruction: "", paste: t };
}

function splitIcon(raw: string, fallback: string): { title: string; icon: string } {
  const t = String(raw || "").trim();
  const m = t.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.*)$/u);
  if (m && m[2]) return { icon: m[1], title: m[2].trim() };
  return { icon: fallback, title: t };
}

async function token(): Promise<string> {
  const { data } = (await supabase?.auth.getSession()) || { data: { session: null } };
  return data?.session?.access_token || "";
}

class AiError extends Error {
  code: string;
  constructor(code: string, msg?: string) {
    super(msg || code);
    this.code = code;
  }
}

async function callAi(mode: string, input: unknown, tries = 3): Promise<any> {
  let last: AiError | null = null;
  for (let i = 0; i < tries; i++) {
    let r: Response;
    try {
      r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ mode, input }),
      });
    } catch {
      last = new AiError("network", "नेटवर्क एरर");
      await sleep(2000);
      continue;
    }
    if (r.status === 401) throw new AiError("not_admin", "एडमिन ईमेल लॉगिन ज़रूरी है — दोबारा साइन-इन करें");
    const j = await r.json().catch(() => null);
    if (!j) {
      last = new AiError("server", "AI सर्वर से जवाब नहीं आया");
      await sleep(1500);
      continue;
    }
    if (j.ok) return j.data;
    if (j.code === "nokey") throw new AiError("nokey");
    last = new AiError(j.code || "ai_error");
    const wait = j.code === "busy" ? Math.min(20, Number(j.retryAfter) || 6) * 1000 : 1500;
    await sleep(wait);
  }
  throw last || new AiError("ai_error");
}

function mcqFromParsed(paste: string): { qs: Q[]; answersSeen: number } {
  const parsed = parseBulkMcqText(paste);
  const answersSeen = (paste.match(/^\s*(?:ans(?:wer)?|and|correct|उत्तर|सही\s*उत्तर)\s*[-.:=)]/gim) || []).length;
  return {
    qs: parsed.map(p => ({ id: newId("q"), question: p.question, options: [...p.options], correctIndex: p.correctIndex, explanation: p.explanation || "" })),
    answersSeen,
  };
}

function fmtMB(b: number) {
  return (b / 1e6).toFixed(2) + " MB";
}

/* Turns the reviewed items into append-only additions on the CURRENT tree. */
function buildAdditions(nodes: AnyNode[], items: Item[]): { additions: Addition[]; skipped: number; notes: string[] } {
  const additions: Addition[] = [];
  const pendingFolders = new Map<string, AnyNode>(); // parentId|normTitle → new folder (still mutable)
  const norms = collectQuestionNorms(nodes);
  let skipped = 0;
  const notes: string[] = [];

  const getParent = (it: Item): { parentId: string; holder: AnyNode | null } => {
    let parentId = it.parentId;
    let holder: AnyNode | null = null; // a NEW folder the item goes into
    for (const f of it.newFolders) {
      const key = parentId + "|" + normTitle(f.title);
      if (pendingFolders.has(key)) {
        holder = pendingFolders.get(key)!;
        parentId = holder.id;
        continue;
      }
      const parentNode = holder || (findPath(nodes, parentId) || []).slice(-1)[0];
      const existing = (parentNode?.children || []).find(c => isContainer(c) && normTitle(c.title) === normTitle(f.title));
      if (existing && !holder) {
        parentId = existing.id;
        continue;
      }
      const folder = makeFolder(f.title, f.icon || "📁");
      pendingFolders.set(key, folder);
      if (holder) holder.children = [...(holder.children || []), folder];
      else additions.push({ op: "add_child", parentId, node: folder, position: "end" });
      holder = folder;
      parentId = folder.id;
    }
    return { parentId, holder };
  };
  const place = (it: Item, node: AnyNode) => {
    const { parentId, holder } = getParent(it);
    if (holder) holder.children = [...(holder.children || []), node];
    else additions.push({ op: "add_child", parentId, node, position: it.position });
  };
  const fresh = (qs: Q[]) => {
    const d = dedupeQuestions(qs, norms);
    d.kept.forEach(q => norms.add(normQ(q.question)));
    skipped += d.skipped.length;
    return d.kept;
  };

  for (const it of items) {
    if (it.kind === "folder") {
      getParent(it);
      continue;
    }
    if (it.kind === "typing") {
      if (it.passage) additions.push({ op: "append_passages", targetId: it.parentId, passages: [it.passage] });
      continue;
    }
    if (it.kind === "notes") {
      if (it.targetId) additions.push({ op: "append_notes", targetId: it.targetId, text: it.notesText || "" });
      else place(it, makeNotes(it.title, it.notesText || "", it.icon));
      continue;
    }
    if (it.kind === "ca_day") {
      const qs = fresh(it.questions || []);
      const day = makeFolder(it.title, "🗞️");
      const facts = (it.caNotes || "").split("\n").filter(l => l.trim()).length;
      day.subtitle = `${facts} तथ्य${qs.length ? ` • ${qs.length} प्रश्न क्विज़` : ""}`;
      day.children = [makeNotes("वन-लाइनर नोट्स", it.caNotes || "", "📝")];
      if (qs.length) day.children.push({ ...makeQuiz(`क्विज़ (${qs.length} प्रश्न)`, qs, "🎯"), subtitle: "व्याख्या सहित" });
      additions.push({ op: "add_child", parentId: it.parentId, node: day, position: "start" });
      continue;
    }
    const qs = fresh(it.questions || []);
    if (!qs.length) {
      notes.push(`"${it.title}": सभी प्रश्न पहले से मौजूद थे`);
      continue;
    }
    if (it.targetId) additions.push({ op: "append_questions", targetId: it.targetId, questions: qs });
    else if (it.kind === "mock" && it.mock) place(it, makeMock(it.title, qs, it.mock.duration, it.mock.pos, it.mock.neg, it.mock.pattern));
    else place(it, makeQuiz(it.title, qs, it.icon, it.pyq));
  }
  // new folders: show what's inside
  pendingFolders.forEach(f => {
    let tq = 0;
    let leaves = 0;
    const rec = (n: AnyNode) => {
      tq += (n.questions || []).length;
      for (const c of n.children || []) {
        if (!isContainer(c)) leaves++;
        rec(c);
      }
    };
    rec(f);
    f.subtitle = tq ? `${tq} प्रश्न` : leaves ? `${leaves} टॉपिक` : "नया फ़ोल्डर";
  });
  return { additions, skipped, notes };
}

function dryRun(nodes: AnyNode[], items: Item[]) {
  const { additions, skipped, notes } = buildAdditions(nodes, items);
  const applied = applyAdditions(nodes, additions);
  const guard = checkAppendOnly(nodes, applied.nodes, { prependParents: caPrependParents(nodes) });
  return { additions, skipped, notes, applied, guard };
}

export default function AiAssistantView({ nodes, onCommit }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"" | "thinking" | "making" | "saving">("");
  const [progress, setProgress] = useState("");
  const [health, setHealth] = useState<{ route: string; chunk: number } | null | "error">(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const endRef = useRef<HTMLDivElement | null>(null);

  const push = (m: Omit<Msg, "id">) => setMsgs(prev => [...prev, { id: uid(), ...m }]);
  const patchProposal = (pid: string, patch: Partial<Proposal>) =>
    setMsgs(prev => prev.map(m => (m.proposal && m.proposal.id === pid ? { ...m, proposal: { ...m.proposal, ...patch } } : m)));

  useEffect(() => {
    fetch("/api/ai")
      .then(r => r.json())
      .then(j => setHealth(j && j.ok ? { route: j.route, chunk: Number(j.chunk) || 4 } : "error"))
      .catch(() => setHealth("error"));
    (async () => {
      try {
        const { data } = (await supabase?.from(SUPABASE_TABLE).select("settings").eq("id", LOG_ROW).maybeSingle()) || ({} as any);
        const arr = data?.settings?.log;
        if (Array.isArray(arr)) setLog(arr);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length, busy]);

  const historyText = useMemo(
    () =>
      msgs
        .filter(m => m.role === "user" || m.role === "ai")
        .slice(-4)
        .map(m => `${m.role === "user" ? "Aarav" : "AI"}: ${String(m.text || "").slice(0, 300)}`)
        .join("\n"),
    [msgs]
  );

  async function genMcqs(n: number, topic: string, where: string, lang: "hi" | "en", avoid: string[], section = ""): Promise<{ qs: Q[]; dropped: number }> {
    const chunk = health && health !== "error" && health.route === "direct" ? 6 : 3;
    const out: Q[] = [];
    const seen = new Set(avoid.map(normQ));
    let dropped = 0;
    let calls = 0;
    const maxCalls = Math.ceil(n / chunk) * 2 + 2;
    while (out.length < n && calls < maxCalls) {
      const want = Math.min(chunk, n - out.length);
      const jobs = [want];
      if (n - out.length - want > 0 && calls + 1 < maxCalls) jobs.push(Math.min(chunk, n - out.length - want));
      calls += jobs.length;
      const results = await Promise.all(
        jobs.map(async w => {
          try {
            const d = await callAi("mcq", { count: w, topic, where, lang, section, avoid: [...avoid.slice(-40), ...out.map(q => q.question).slice(-20)] });
            const raw: any[] = Array.isArray(d?.questions) ? d.questions : [];
            const qs = raw.map(x => toQuestion(x)).filter((q): q is Q => !!q && !validateMcq(q, lang === "hi"));
            dropped += raw.length - qs.length;
            if (!qs.length) return [];
            // second pass: a strict fact-check; anything doubtful is dropped (never auto-"fixed")
            try {
              const v = await callAi("verify", { questions: qs.map(q => ({ q: q.question, o: q.options, a: q.correctIndex, e: q.explanation })) }, 2);
              const res: any[] = Array.isArray(v?.results) ? v.results : [];
              const okIdx = new Set(res.filter(x => x && x.ok === true).map(x => Number(x.i)));
              const kept = qs.filter((_, i) => okIdx.has(i));
              dropped += qs.length - kept.length;
              return kept;
            } catch (e: any) {
              if (e?.code === "nokey" || e?.code === "not_admin") throw e;
              dropped += qs.length;
              return [];
            }
          } catch (e: any) {
            if (e?.code === "nokey" || e?.code === "not_admin") throw e;
            return [];
          }
        })
      );
      for (const qs of results)
        for (const q of qs) {
          const k = normQ(q.question);
          if (out.length < n && k && !seen.has(k)) {
            seen.add(k);
            out.push(q);
          }
        }
      setProgress(`✍️ MCQ बन रहे हैं + जाँच… ${out.length}/${n}`);
    }
    return { qs: out, dropped };
  }

  async function convertPaste(paste: string, want: number, lang: "hi" | "en"): Promise<Q[]> {
    const parts: string[] = [];
    const blocks = paste.split(/\n\s*\n/);
    let cur = "";
    for (const b of blocks) {
      if ((cur + "\n\n" + b).length > 2200 && cur) {
        parts.push(cur);
        cur = b;
      } else cur = cur ? cur + "\n\n" + b : b;
    }
    if (cur) parts.push(cur);
    const out: Q[] = [];
    for (let i = 0; i < parts.length; i++) {
      setProgress(`📋 पेस्ट किया text पढ़ रहा हूँ… ${i + 1}/${parts.length}`);
      const d = await callAi("convert", { text: parts[i], want: want ? Math.ceil(want / parts.length) : 0, lang });
      const raw: any[] = Array.isArray(d?.questions) ? d.questions : [];
      raw.forEach(x => {
        const q = toQuestion(x);
        if (q) out.push(q);
      });
    }
    return out;
  }

  async function handleSend(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput("");
    push({ role: "user", text });
    const { instruction, paste } = splitMessage(text);

    if (instruction && EDIT_RE.test(instruction)) {
      push({
        role: "ai",
        text: "⛔ माफ़ कीजिए — मैं पुराना data बदल, हटा, छिपा या हिला नहीं सकता, और passcode/theme/maintenance/settings भी नहीं छू सकता। मैं सिर्फ़ नया data जोड़ सकता हूँ (जैसे 73 → 80 प्रश्न)। सिर्फ़ जोड़ने वाली बात दोबारा लिखें।",
      });
      return;
    }
    if (!isStudyBullDataReady() || !Array.isArray(nodesRef.current) || nodesRef.current.length < 6) {
      push({ role: "error", text: "⚠️ एडमिन का पूरा data अभी लोड नहीं हुआ — पेज रीफ़्रेश करके दोबारा भेजें।" });
      return;
    }

    setBusy("thinking");
    setProgress("🧠 समझ रहा हूँ…");
    try {
      const tree = nodesRef.current;
      const parsed = paste ? mcqFromParsed(paste) : { qs: [] as Q[], answersSeen: 0 };
      const pasteInfo = paste
        ? `${paste.length} chars, ${paste.split("\n").length} lines.` +
          (parsed.qs.length ? ` Contains ${parsed.qs.length} MCQs in the standard format (already parsed by the app; answers seen: ${parsed.answersSeen}).` : "") +
          `\nSTART OF TEXT:\n${paste.slice(0, 1400)}`
        : "";
      const cat = buildCatalog(tree, `${instruction} ${paste.slice(0, 400)}`);
      const plan = await callAi("plan", { catalog: cat.text, message: instruction || "(only pasted text — add it where it fits)", paste: pasteInfo, history: historyText });
      const action = String(plan?.action || "");
      const reply = String(plan?.reply || "").trim();
      if (action !== "add") {
        push({ role: "ai", text: (action === "refuse" ? "⛔ " : "") + (reply || "मैं सिर्फ़ नया data जोड़ सकता हूँ।") });
        return;
      }
      const tasks: any[] = Array.isArray(plan?.tasks) ? plan.tasks.slice(0, 6) : [];
      if (!tasks.length) {
        push({ role: "ai", text: reply || "क्या जोड़ना है, थोड़ा साफ़ बताएँ (विषय + कितने प्रश्न)।" });
        return;
      }
      setBusy("making");
      const items: Item[] = [];
      const warnings: string[] = [];
      const errors: string[] = [];
      const allowPyq = /pyq|previous\s*year|पिछले\s*वर्ष/i.test(instruction);
      const typingNode = tree.find(n => n.kind === "typing");
      const caTile = tree.find(n => /करंट|current affairs/i.test(n.title));
      const caDaily = (caTile?.children || []).find(c => /दैनिक|daily/i.test(c.title)) || (caTile?.children || [])[0];
      let pasteUsed = false;

      for (const t of tasks) {
        const type = String(t.type || "") as ItemKind;
        const lang: "hi" | "en" = t.lang === "en" ? "en" : "hi";
        const fromPaste = t.source === "paste" && !!paste;
        let pyq = String(t.pyq || "").trim();
        if (pyq && !(allowPyq && /\d{4}|ssc|rrb|upsc|police|gd|ntpc|cgl|chsl|agniveer/i.test(pyq))) {
          warnings.push(`PYQ टैग "${pyq}" नहीं लगाया — आपने असली PYQ (exam + साल) नहीं बताया, इसलिए "PYQ स्टाइल"।`);
          pyq = "";
        }
        const newFolders = (Array.isArray(t.new_folders) ? t.new_folders : [])
          .map((f: any) => splitIcon(String(f || ""), "📁"))
          .filter((f: any) => f.title)
          .slice(0, 3);

        if (type === "typing") {
          if (!typingNode) {
            errors.push("Typing टाइल नहीं मिली");
            continue;
          }
          let title = String(t.title || "").trim();
          let text = "";
          if (fromPaste) {
            text = paste.replace(/\s*\n\s*/g, " ").trim();
            pasteUsed = true;
          } else {
            setProgress("⌨️ टाइपिंग passage लिख रहा हूँ…");
            const d = await callAi("typing", { topic: t.topic || title || "अनुशासन", lang, words: 220 });
            text = String(d?.text || "").replace(/\s*\n\s*/g, " ").trim();
            title = title || String(d?.title || "");
          }
          if (text.split(/\s+/).length < 40) {
            errors.push("Typing passage बहुत छोटा बना — दोबारा कोशिश करें");
            continue;
          }
          const plang: "hi" | "en" = /[\u0900-\u097F]/.test(text) ? "hi" : "en";
          const n = (typingNode.passages || []).length + 1;
          items.push({
            kind: "typing",
            parentId: typingNode.id,
            newFolders: [],
            position: "end",
            title: title || `${plang === "hi" ? "हिंदी" : "English"} Typing Test #${n}`,
            icon: "⌨️",
            passage: makePassage(title || `${plang === "hi" ? "हिंदी" : "English"} Typing Test #${n}`, text, plang),
          });
          continue;
        }

        if (type === "ca_day") {
          if (!caDaily) {
            errors.push("Current Affairs का दैनिक फ़ोल्डर नहीं मिला");
            continue;
          }
          if (!paste) {
            errors.push("Current Affairs सिर्फ़ आपके पेस्ट किए text से जुड़ते हैं (AI खबरें नहीं बनाता) — खबरें पेस्ट करें।");
            continue;
          }
          const date = String(t.date || t.title || "").trim() || new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
          setProgress("📰 करंट अफेयर्स क्विज़ बना रहा हूँ (सिर्फ़ आपके text से)…");
          const qs = parsed.qs.length ? parsed.qs : await convertPaste(paste, 5, "hi");
          pasteUsed = true;
          const good = qs.filter(q => !validateMcq(q, true));
          items.push({ kind: "ca_day", parentId: caDaily.id, newFolders: [], position: "start", title: date, icon: "🗞️", caNotes: paste, questions: good });
          continue;
        }

        const parentId = cat.refs[String(t.parent || "").trim()];
        if (!parentId) {
          errors.push(`जगह (${t.parent || "?"}) समझ नहीं आई — फ़ोल्डर का नाम साफ़ लिखें`);
          continue;
        }
        const ppath = findPath(tree, parentId) || [];
        const parentNode = ppath[ppath.length - 1];
        const tile = ppath[0];
        if (tile && (tile.kind === "typing" || tile.kind === "calc")) {
          errors.push("Speed Math/Typing में ये नहीं जुड़ सकता");
          continue;
        }
        if (type === "mock" && tile && !/mock/i.test(tile.title)) {
          errors.push("Mock Test सिर्फ़ Mock Test टाइल में जुड़ता है");
          continue;
        }
        const whereText = pathText(ppath) + newFolders.map((f: any) => ` › 🆕 ${f.icon} ${f.title}`).join("");
        const base: Item = { kind: type, parentId, newFolders, position: "end", title: "", icon: "", pyq };
        const tl = splitIcon(String(t.title || ""), String(t.icon || ""));

        if (type === "folder") {
          const all = [...newFolders];
          if (tl.title) all.push({ title: tl.title, icon: tl.icon || "📁" });
          if (!all.length) continue;
          items.push({ ...base, newFolders: all, title: all[all.length - 1].title, icon: all[all.length - 1].icon });
          continue;
        }

        let existing: AnyNode | null = null;
        if (t.existing && !newFolders.length) {
          const kinds = type === "notes" ? ["notes"] : type === "mock" ? ["mock"] : ["mcq"];
          const f = findExistingLeaf(parentNode, String(t.existing), kinds);
          if (f.node) existing = f.node;
          else if (f.candidates.length) {
            errors.push(`"${t.existing}" साफ़ नहीं — इनमें से कौन सा? ${f.candidates.map(c => c.title).join(" / ")}`);
            continue;
          } else warnings.push(`"${t.existing}" नहीं मिला, इसलिए नया बनेगा`);
        }
        const title = existing ? existing.title : tl.title || String(t.existing || "").trim() || (type === "notes" ? "नए नोट्स" : "नया अभ्यास");
        const icon = tl.icon || (type === "notes" ? "📖" : type === "mock" ? "📝" : "🎯");

        if (type === "notes") {
          let text = "";
          if (fromPaste) {
            text = paste;
            pasteUsed = true;
          } else {
            setProgress("📖 नोट्स लिख रहा हूँ… (1/2)");
            const topic = String(t.topic || title);
            const a = await callAi("notes", { topic, where: whereText, part: "भाग 1: परिचय और मुख्य बातें (# headings, ▸ points)" });
            setProgress("📖 नोट्स लिख रहा हूँ… (2/2)");
            const b = await callAi("notes", { topic, where: whereText, part: "भाग 2: ⭐ परीक्षा तथ्य (8-10 points) और 📌 याद रखो (3-5 points) — भाग 1 दोहराएँ नहीं" });
            text = [String(a?.content || "").trim(), String(b?.content || "").trim()].filter(Boolean).join("\n\n");
          }
          const bad = ["document.", "var ", "onclick="].find(x => text.includes(x));
          if (!text.trim() || bad) {
            errors.push(bad ? `नोट्स में "${bad}" है — साइट पर छिप सकता है` : "नोट्स खाली बने");
            continue;
          }
          items.push({ ...base, title, icon, targetId: existing?.id, notesText: text });
          continue;
        }

        // mcq / mock
        const isEnglishSection = ppath.some(p => /english/i.test(p.title)) || lang === "en";
        const needHindi = !isEnglishSection;
        let qs: Q[] = [];
        let dropped = 0;
        if (fromPaste) {
          if (parsed.qs.length && parsed.answersSeen >= parsed.qs.length) qs = parsed.qs.map(q => ({ ...q, id: newId("q") }));
          else qs = await convertPaste(paste, Number(t.count) || 0, lang);
          pasteUsed = true;
          if (pyq) qs = qs.map(q => ({ ...q, question: `[PYQ: ${pyq}] ${q.question}` }));
        } else {
          const want = Math.max(1, Math.min(type === "mock" ? 100 : 50, Number(t.count) || 5));
          const avoid = (existing?.questions || []).map(q => q.question).slice(-60);
          const where = whereText + (existing ? ` › ${existing.title}` : "");
          const sections: { name: string; count: number }[] =
            type === "mock" && Array.isArray(t.sections) && t.sections.length
              ? t.sections.map((s: any) => ({ name: String(s?.name || ""), count: Math.max(1, Number(s?.count) || 1) })).slice(0, 6)
              : [{ name: "", count: want }];
          for (const sec of sections) {
            const r = await genMcqs(sec.count, `${t.topic || title}${sec.name ? ` — section: ${sec.name}` : ""}`, where, /english/i.test(sec.name) ? "en" : lang, avoid, sec.name);
            qs.push(...r.qs);
            dropped += r.dropped;
          }
          if (dropped) warnings.push(`${dropped} AI प्रश्न जाँच में शक होने पर हटाए गए`);
        }
        // generated questions were already checked per section language inside genMcqs; pasted ones get the Hindi rule here
        const hindiRule = fromPaste ? needHindi : false;
        const invalid = qs.filter(q => validateMcq(q, hindiRule));
        const valid = qs.filter(q => !validateMcq(q, hindiRule));
        if (invalid.length) warnings.push(`${invalid.length} प्रश्न गलत format में थे, छोड़े गए (जैसे: ${validateMcq(invalid[0], hindiRule) || ""})`);
        if (!valid.length) {
          errors.push(`"${title}": कोई सही प्रश्न नहीं बना`);
          continue;
        }
        const mockCfg =
          type === "mock"
            ? {
                duration: Math.max(5, Math.min(240, Number(t.duration) || 60)),
                pos: Number(t.pos) > 0 ? Number(t.pos) : 1,
                neg: Number(t.neg) >= 0 ? Number(t.neg) : 0,
                pattern: (Array.isArray(t.sections) ? t.sections : []).map((s: any) => `${s?.name} ${s?.count}`).join(", "),
              }
            : undefined;
        items.push({ ...base, kind: type === "mock" ? "mock" : "mcq", title, icon, targetId: existing?.id, questions: valid, mock: mockCfg, needHindi });
      }
      if (paste && !pasteUsed && items.length) warnings.push("पेस्ट किया text किसी item में नहीं लगा — देख लें");

      if (!items.length) {
        push({ role: "error", text: "❌ " + (errors.join("\n") || "कुछ जोड़ने लायक नहीं बना") });
        return;
      }
      const dr = dryRun(nodesRef.current, items);
      if (dr.skipped) warnings.push(`${dr.skipped} प्रश्न पहले से मौजूद थे (duplicate) — छोड़ दिए`);
      warnings.push(...dr.notes);
      const sizeParts: string[] = [];
      Object.values(dr.guard.tileBytes).forEach(t => {
        sizeParts.push(`${t.title}: ${fmtMB(t.before)} → ${fmtMB(t.after)}`);
        if (t.after > TILE_WARN && t.after <= TILE_LIMIT) warnings.push(`⚠️ "${t.title}" टाइल 2.5 MB सीमा के पास (${fmtMB(t.after)}) — Quiz में अब छोटे-छोटे add ही करें`);
      });
      const proposal: Proposal = {
        id: uid(),
        items,
        warnings,
        errors: [...errors, ...(dr.guard.ok ? [] : dr.guard.errors)],
        status: "pending",
        sizeLine: sizeParts.join(" • "),
        prompt: text.slice(0, 160),
      };
      push({ role: "ai", text: reply || "ये रहा preview 👇" });
      push({ role: "proposal", proposal });
    } catch (e: any) {
      if (e?.code === "nokey") push({ role: "key" });
      else push({ role: "error", text: `❌ ${e?.message && e.message !== e?.code ? e.message : "AI अभी जवाब नहीं दे रहा"} — थोड़ी देर बाद दोबारा भेजें।` });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function handleAdd(p: Proposal) {
    if (busy) return;
    const tree = nodesRef.current;
    if (!isStudyBullDataReady()) {
      patchProposal(p.id, { status: "failed", result: "⚠️ data पूरा लोड नहीं — पेज रीफ़्रेश करें" });
      return;
    }
    const dr = dryRun(tree, p.items);
    if (!dr.guard.ok || dr.applied.errors.length) {
      patchProposal(p.id, { status: "failed", result: "⛔ रोका गया: " + [...dr.applied.errors, ...dr.guard.errors].join(" | ") });
      return;
    }
    setBusy("saving");
    patchProposal(p.id, { status: "saving" });
    const t0 = new Date().toISOString();
    const a = dr.guard.added;
    const what = [a.questions ? `${a.questions} प्रश्न` : "", a.passages ? `${a.passages} passage` : "", a.notesAppends ? `${a.notesAppends} नोट्स जोड़` : "", dr.guard.added.nodes ? `${dr.guard.added.nodes} नए item` : ""]
      .filter(Boolean)
      .join(", ");
    onCommit(dr.applied.nodes, `🤖 AI ने जोड़ा: ${what}`);
    // wait for the admin's own save status (window.__sbLastSave)
    let state = "saving";
    let err = "";
    for (let i = 0; i < 240; i++) {
      await sleep(500);
      const s = (window as any).__sbLastSave;
      if (s && s.at && s.at > t0 && (s.state === "saved" || s.state === "error")) {
        state = s.state;
        err = s.error || "";
        break;
      }
    }
    setBusy("");
    const where = p.items
      .map(it => {
        const path = findPath(dr.applied.nodes, it.targetId || it.parentId) || [];
        return pathText(path) + it.newFolders.map(f => ` › ${f.title}`).join("") + (it.targetId ? "" : it.kind === "folder" ? "" : ` › ${it.title}`);
      })
      .join(" ; ");
    if (state === "saved") {
      patchProposal(p.id, { status: "added", result: `✅ सेव हो गया: ${what}` });
      const entry: LogEntry = { at: new Date().toISOString(), where: where.slice(0, 300), what, count: a.questions + a.passages + a.nodes, prompt: p.prompt };
      const next = [entry, ...log].slice(0, 100);
      setLog(next);
      try {
        await supabase?.from(SUPABASE_TABLE).upsert({ id: LOG_ROW, nodes: [], settings: { log: next }, updated_at: OLD_TS }, { onConflict: "id" });
      } catch {
        /* history is best-effort */
      }
    } else {
      patchProposal(p.id, { status: "failed", result: `❌ सेव नहीं हुआ ${err ? "(" + err + ")" : ""} — नीचे बाएँ लाल बॉक्स में Retry दबाएँ` });
    }
  }

  const st = busy ? busy : msgs.length && msgs[msgs.length - 1].proposal?.status === "pending" ? "preview" : "idle";

  return (
    <div className="panel" data-sb-ai="1" data-sb-ai-state={st} style={{ padding: 0, overflow: "visible", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid #e5eaf2", background: "linear-gradient(135deg,#eef4ff,#f7f3ff)", borderRadius: "16px 16px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 30 }}>🤖</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#1e293b" }}>AI Assistant</div>
            <div style={{ fontSize: 12.5, color: "#475569" }}>बोलकर या text पेस्ट करके नया data जोड़ें — पुराना data सुरक्षित, कभी नहीं बदलेगा</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          <span style={chip("#dcfce7", "#166534")}>✅ MCQ • नोट्स • मॉक • टाइपिंग • करंट अफेयर्स • नया फ़ोल्डर</span>
          <span style={chip("#fee2e2", "#991b1b")}>⛔ Edit / Delete / Settings नहीं</span>
          <span style={chip(health && health !== "error" ? "#e0f2fe" : "#fef3c7", health && health !== "error" ? "#075985" : "#92400e")} data-sb-ai-health={health === null ? "loading" : health === "error" ? "error" : health.route}>
            {health === null ? "AI जाँच…" : health === "error" ? "AI सर्वर नहीं मिला" : "🟢 AI तैयार"}
          </span>
        </div>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.length === 0 && (
          <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: "#334155", marginBottom: 8 }}>उदाहरण (टैप करें):</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {EXAMPLES.map(ex => (
                <button key={ex} onClick={() => setInput(ex)} style={{ textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", fontSize: 13, color: "#1e293b", whiteSpace: "pre-wrap", maxHeight: 64, overflow: "hidden" }}>
                  {ex}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
              पहली line में बताएँ कहाँ जोड़ना है, नीचे पूरा text पेस्ट करें। हर बार पहले preview आएगा, ✅ Add दबाने पर ही सेव होगा।
            </div>
          </div>
        )}

        {msgs.map(m => (
          <div key={m.id}>
            {m.role === "user" && <div style={bubble(true)}>{m.text}</div>}
            {m.role === "ai" && <div style={bubble(false)}>{m.text}</div>}
            {m.role === "error" && <div style={{ ...bubble(false), background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }} data-sb-ai-error="1">{m.text}</div>}
            {m.role === "key" && (
              <div style={{ ...bubble(false), background: "#fffbeb", borderColor: "#fde68a", color: "#78350f" }} data-sb-ai-nokey="1">
                <b>🔑 AI key चाहिए</b>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  1) vercel.com → studybulladmin project → Settings → Environment Variables
                  <br />
                  2) Name: <b>GROQ_API_KEY</b>, Value: अपनी Groq key → Save
                  <br />
                  3) Deployments → सबसे ऊपर वाला → ⋯ → Redeploy
                  <br />
                  (key कभी chat में न भेजें)
                </div>
              </div>
            )}
            {m.role === "proposal" && m.proposal && (
              <ProposalCard p={m.proposal} nodes={nodes} onAdd={() => handleAdd(m.proposal!)} onCancel={() => patchProposal(m.proposal!.id, { status: "cancelled", result: "❌ रद्द किया — कुछ सेव नहीं हुआ" })} disabled={!!busy} />
            )}
          </div>
        ))}

        {busy && (
          <div style={{ ...bubble(false), background: "#f1f5f9", color: "#334155" }} data-sb-ai-progress="1">
            <span className="pulse" style={{ display: "inline-block", marginRight: 6 }} />
            {progress || (busy === "saving" ? "💾 सेव हो रहा है…" : "…")}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid #e5eaf2", padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", borderRadius: "0 0 16px 16px", zIndex: 5 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            data-sb-ai-input="1"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="जैसे: History me 7 questions add karo Mughal pe — या पूरा text पेस्ट करें"
            rows={input.length > 120 || input.includes("\n") ? 5 : 2}
            style={{ flex: 1, minWidth: 0, resize: "vertical", border: "1px solid #cbd5e1", borderRadius: 12, padding: "9px 11px", fontSize: 14.5, lineHeight: 1.4, fontFamily: "inherit", maxHeight: 260 }}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            data-sb-ai-send="1"
            className="primary-btn"
            disabled={!!busy || !input.trim()}
            onClick={() => void handleSend()}
            style={{ padding: "10px 14px", borderRadius: 12, fontWeight: 800, opacity: busy || !input.trim() ? 0.55 : 1 }}
          >
            भेजें ➤
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <button onClick={() => setShowLog(v => !v)} data-sb-ai-history-btn="1" style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12.5, fontWeight: 700, padding: 0 }}>
            🕘 AI history ({log.length})
          </button>
          {msgs.length > 0 && (
            <button onClick={() => setMsgs([])} disabled={!!busy} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12.5, padding: 0 }}>
              🧹 chat साफ़ करें
            </button>
          )}
        </div>
        {showLog && (
          <div data-sb-ai-history="1" style={{ marginTop: 8, maxHeight: 240, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8, background: "#f8fafc" }}>
            {log.length === 0 && <div style={{ fontSize: 12.5, color: "#64748b" }}>अभी तक AI से कुछ नहीं जोड़ा गया।</div>}
            {log.map((l, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: "6px 2px", borderBottom: i < log.length - 1 ? "1px solid #e2e8f0" : "none" }}>
                <div style={{ color: "#0f172a", fontWeight: 700 }}>
                  {new Date(l.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} • {l.what}
                </div>
                <div style={{ color: "#475569" }}>{l.where}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function chip(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: "4px 9px" };
}
function bubble(mine: boolean): React.CSSProperties {
  return {
    alignSelf: mine ? "flex-end" : "flex-start",
    marginLeft: mine ? "auto" : 0,
    maxWidth: "88%",
    width: "fit-content",
    background: mine ? "#2563eb" : "#fff",
    color: mine ? "#fff" : "#0f172a",
    border: mine ? "none" : "1px solid #e2e8f0",
    borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
    padding: "9px 12px",
    fontSize: 14,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: mine ? 220 : undefined,
    overflow: mine ? "hidden" : undefined,
  };
}

function ProposalCard({ p, nodes, onAdd, onCancel, disabled }: { p: Proposal; nodes: AnyNode[]; onAdd: () => void; onCancel: () => void; disabled: boolean }) {
  const total = p.items.reduce((n, it) => n + (it.questions?.length || 0), 0);
  const blocked = p.errors.length > 0 && p.items.length === 0;
  return (
    <div data-sb-ai-preview="1" data-sb-ai-preview-status={p.status} style={{ border: "2px solid #c7d2fe", borderRadius: 16, background: "#fff", overflow: "hidden" }}>
      <div style={{ background: "#eef2ff", padding: "9px 12px", fontWeight: 900, color: "#3730a3", fontSize: 14 }}>👀 Preview — अभी कुछ सेव नहीं हुआ</div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {p.items.map((it, i) => (
          <ItemPreview key={i} it={it} nodes={nodes} />
        ))}
        {p.sizeLine && <div style={{ fontSize: 12, color: "#475569" }}>📦 साइज़: {p.sizeLine} (सीमा 2.5 MB/टाइल)</div>}
        {p.warnings.length > 0 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 8, fontSize: 12.5, color: "#78350f" }}>
            {p.warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}
        {p.errors.length > 0 && (
          <div data-sb-ai-guard-error="1" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 8, fontSize: 12.5, color: "#991b1b" }}>
            {p.errors.map((w, i) => (
              <div key={i}>⛔ {w}</div>
            ))}
          </div>
        )}
        {p.status === "pending" && !blocked && (
          <div style={{ display: "flex", gap: 8 }}>
            <button data-sb-ai-add="1" className="emerald-btn" disabled={disabled || p.errors.length > 0} onClick={onAdd} style={{ flex: 1, padding: "11px 12px", borderRadius: 12, fontWeight: 900, fontSize: 15, opacity: disabled || p.errors.length ? 0.5 : 1 }}>
              ✅ Add{total ? ` (${total})` : ""}
            </button>
            <button data-sb-ai-cancel="1" className="outline-btn" disabled={disabled} onClick={onCancel} style={{ padding: "11px 14px", borderRadius: 12, fontWeight: 800 }}>
              ❌ Cancel
            </button>
          </div>
        )}
        {p.status === "saving" && <div style={{ fontWeight: 800, color: "#1d4ed8" }}>💾 सेव हो रहा है…</div>}
        {p.result && (
          <div data-sb-ai-result={p.status} style={{ fontWeight: 800, color: p.status === "added" ? "#15803d" : p.status === "cancelled" ? "#475569" : "#b91c1c" }}>
            {p.result}
          </div>
        )}
      </div>
    </div>
  );
}

function ItemPreview({ it, nodes }: { it: Item; nodes: AnyNode[] }) {
  const path = findPath(nodes, it.targetId || it.parentId) || [];
  const target = it.targetId ? path[path.length - 1] : null;
  const where = pathText(it.targetId ? path : path) + it.newFolders.map(f => ` › 🆕 ${f.icon} ${f.title}`).join("");
  const label =
    it.kind === "folder"
      ? "🆕 नया फ़ोल्डर"
      : it.kind === "typing"
      ? `⌨️ नया टाइपिंग passage (${it.passage?.text.split(/\s+/).length || 0} शब्द)`
      : it.kind === "notes"
      ? it.targetId
        ? "📖 मौजूदा नोट्स पेज के अंत में नया भाग"
        : `📖 नया नोट्स पेज: ${it.icon} ${it.title}`
      : it.kind === "ca_day"
      ? `🗞️ नया करंट अफेयर्स दिन: ${it.title} (सबसे ऊपर)`
      : it.targetId
      ? `➕ ${it.questions?.length} नए प्रश्न → "${target?.title}" (${target?.questions?.length || 0} → ${(target?.questions?.length || 0) + (it.questions?.length || 0)})`
      : it.kind === "mock"
      ? `🏆 नया मॉक: ${it.title} — ${it.questions?.length} प्रश्न • ${it.mock?.duration} मिनट • +${it.mock?.pos}/−${it.mock?.neg}`
      : `🎯 नया क्विज़: ${it.icon} ${it.title} — ${it.questions?.length} प्रश्न (${quizSubtitle(it.questions?.length || 0, it.pyq).split(" • ").slice(1).join(" • ")})`;
  const qs = (it.questions || []).slice(0, 3);
  return (
    <div style={{ borderBottom: "1px dashed #e2e8f0", paddingBottom: 10 }}>
      <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2 }}>📍 {where}</div>
      {qs.map((q, i) => (
        <div key={q.id} style={{ marginTop: 8, background: "#f8fafc", borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: "#1e293b" }}>
            {i + 1}. {q.question}
          </div>
          {q.options.map((o, j) => (
            <div key={j} style={{ fontSize: 13, color: j === q.correctIndex ? "#15803d" : "#334155", fontWeight: j === q.correctIndex ? 800 : 500 }}>
              {String.fromCharCode(65 + j)}. {o} {j === q.correctIndex ? "✅" : ""}
            </div>
          ))}
          {q.explanation && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>💡 {q.explanation}</div>}
        </div>
      ))}
      {(it.questions?.length || 0) > 3 && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>…और {(it.questions?.length || 0) - 3} प्रश्न</div>}
      {(it.notesText || it.passage?.text || it.caNotes) && (
        <div style={{ marginTop: 8, background: "#f8fafc", borderRadius: 10, padding: "8px 10px", fontSize: 13, whiteSpace: "pre-wrap", color: "#334155", maxHeight: 160, overflow: "hidden" }}>
          {(it.notesText || it.passage?.text || it.caNotes || "").slice(0, 600)}
          {(it.notesText || it.passage?.text || it.caNotes || "").length > 600 ? " …" : ""}
        </div>
      )}
    </div>
  );
}
