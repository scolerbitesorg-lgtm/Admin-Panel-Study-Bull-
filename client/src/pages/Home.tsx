import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  CirclePlus,
  Clock,
  Code2,
  Copy,
  Database,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  Home as HomeIcon,
  Image as ImageIcon,
  LayoutGrid,
  Menu,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Key,
  EyeOff,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  Wrench,
  X,
  Zap,
  Calculator,
  Keyboard,
  Flame,
  Target,
} from "lucide-react";
import {
  McqQuestion,
  parseBulkMcqText,
  SAMPLE_BULK_MCQ_FORMAT,
} from "@/lib/mcqParser";
import {
  fetchStudyBullStateFromSupabase,
  saveStudyBullStateToSupabase,
  subscribeToStudyBullState,
  SUPABASE_SQL_SCHEMA,
  getStoredSupabaseConfig,
  setSupabaseCredentials,
  clearSupabaseCredentials,
  testSupabaseConnection,
  signOutAdmin,
  getAdminEmail,
} from "@/lib/supabase";
import {
  TypingPracticeView,
  DEFAULT_TYPING_PASSAGES,
} from "@/components/TypingPracticeView";
import {
  SpeedCalculationView,
  CalcMode,
} from "@/components/SpeedCalculationView";
import SandboxedHtmlView from "@/components/SandboxedHtmlView";

type Kind =
  | "button"
  | "folder"
  | "section"
  | "mcq"
  | "mock"
  | "notes"
  | "html"
  | "typing"
  | "calc";

export type TypingPassageItem = {
  id: string;
  title: string;
  lang: "hi" | "en";
  duration: number; // in minutes (1, 2, 5, 10, 15)
  text: string;
  difficulty?: "easy" | "medium" | "hard";
  targetWpm?: number;
};

type Node = {
  id: string;
  title: string;
  kind: Kind;
  icon: string;
  subtitle?: string;
  enabled: boolean;
  durationMinutes?: number;
  positiveMarks?: number;
  negativeMarks?: number;
  notesContent?: string;
  htmlContent?: string;
  questions?: McqQuestion[];
  // Typing drill configuration & multi-passage manager
  passages?: TypingPassageItem[];
  typingPassage?: string;
  typingLanguage?: "en" | "hi";
  targetWpm?: number;
  // Calculation drill configuration
  calcMode?: CalcMode;
  calcDurationSeconds?: number;
  children: Node[];
};

export type AdminRole = "developer" | "admin";

export interface AdminPasscode {
  id: string;
  label: string;
  code: string;
  role: AdminRole;
  createdAt: string;
}

export const PERMANENT_DEVELOPER_PASSCODE = "Developer@Aarav";

export const DEFAULT_PASSCODES: AdminPasscode[] = [
  {
    id: "pass-dev-main",
    label: "Main Developer",
    code: PERMANENT_DEVELOPER_PASSCODE,
    role: "developer",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "pass-admin-1",
    label: "Admin 1",
    code: "Admin@123",
    role: "admin",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function mergePasscodes(existing?: AdminPasscode[], incoming?: AdminPasscode[]): AdminPasscode[] {
  const map = new Map<string, AdminPasscode>();
  for (const p of DEFAULT_PASSCODES) map.set(p.id, p);
  if (existing) {
    for (const p of existing) map.set(p.id, p);
  }
  if (incoming) {
    for (const p of incoming) map.set(p.id, p);
  }
  return Array.from(map.values());
}


type UserAppSettings = {
  appName: string;
  appSubtitle: string;
  welcomeHeading: string;
  logoEmoji: string;
  logoImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  appBgColor: string;
  darkMode: boolean;
  gridColumns: 1 | 2;
  announcementEnabled: boolean;
  announcementText: string;
  maintenanceMode: boolean;
  maintenanceTitle: string;
  maintenanceMessage: string;
  maintenanceEta: string;
  maintenanceContact: string;
  passcodes?: AdminPasscode[];
};

const defaultAppSettings: UserAppSettings = {
  appName: "Study Bull",
  appSubtitle: "परीक्षा तैयारी पोर्टल",
  welcomeHeading: "आपके लिए तैयार लर्निंग डैशबोर्ड",
  logoEmoji: "🐂",
  logoImageUrl: "",
  primaryColor: "#1546b5",
  secondaryColor: "#3d2db3",
  appBgColor: "#f1f5ff",
  darkMode: false,
  gridColumns: 2,
  announcementEnabled: true,
  announcementText: "🔥 नए SSC CGL व Railway मॉक टेस्ट और नोट्स अपडेट कर दिए गए हैं!",
  maintenanceMode: false,
  maintenanceTitle: "🚧 ऐप मेंटेनेंस कार्य चल रहा है",
  maintenanceMessage:
    "प्रिय छात्रों, हम आपके लिए नए 500+ MCQs, मॉक टेस्ट और सर्वर स्पीड अपडेट कर रहे हैं। ऐप बहुत जल्द वापस चालू हो जाएगा।",
  maintenanceEta: "अनुमानित समय: 30 मिनट में चालू होगा",
  maintenanceContact: "अपडेट के लिए जुड़े रहें: @StudyBullOfficial",
  passcodes: DEFAULT_PASSCODES,
};

const THEME_PRESETS = [
  {
    name: "Royal Blue",
    primary: "#1546b5",
    secondary: "#3d2db3",
    bg: "#f1f5ff",
    dark: false,
  },
  {
    name: "Emerald Study",
    primary: "#0f766e",
    secondary: "#047857",
    bg: "#ecfdf5",
    dark: false,
  },
  {
    name: "Royal Violet",
    primary: "#6d28d9",
    secondary: "#4338ca",
    bg: "#f5f3ff",
    dark: false,
  },
  {
    name: "Crimson Exam",
    primary: "#b91c1c",
    secondary: "#9f1239",
    bg: "#fff1f2",
    dark: false,
  },
  {
    name: "Amber Gold",
    primary: "#b45309",
    secondary: "#92400e",
    bg: "#fffbeb",
    dark: false,
  },
  {
    name: "Midnight Dark",
    primary: "#1e293b",
    secondary: "#0f172a",
    bg: "#0f172a",
    dark: true,
  },
];

// Zero-data start: No pre-populated questions or buttons.
// Everything is added from scratch by the Admin and synced to Supabase & User App.
const defaultQuestions: McqQuestion[] = [];

const MOODMOJI_PRISTINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MoodMoji - Emoji Search & Copy</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 16px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    .container { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 14px; }
    header { text-align: center; margin-bottom: 4px; }
    h1 { font-size: 22px; font-weight: 800; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .search-box { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #334155; background: #1e293b; color: #fff; font-size: 15px; outline: none; transition: border 0.2s; }
    .search-box:focus { border-color: #38bdf8; }
    .categories { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
    .categories::-webkit-scrollbar { display: none; }
    .cat-btn { background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
    .cat-btn.active, .cat-btn:hover { background: #38bdf8; color: #0f172a; border-color: #38bdf8; }
    .emoji-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; background: #1e293b; padding: 14px; border-radius: 14px; border: 1px solid #334155; max-height: 360px; overflow-y: auto; }
    .emoji-item { background: #0f172a; border: 1px solid #334155; border-radius: 10px; font-size: 26px; height: 50px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s, background 0.2s; user-select: none; }
    .emoji-item:active { transform: scale(0.92); background: #334155; }
    .toast { position: fixed; bottom: 24px; background: #22c55e; color: #fff; padding: 10px 20px; border-radius: 30px; font-size: 13px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.3); opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>MoodMoji 😊</h1>
      <p>Tap any emoji to copy to clipboard instantly!</p>
    </header>
    <input type="text" id="search" class="search-box" placeholder="Search emojis (e.g. smile, fire, heart)...">
    <div class="categories" id="categories">
      <button class="cat-btn active" data-cat="all">All</button>
      <button class="cat-btn" data-cat="smileys">Smileys</button>
      <button class="cat-btn" data-cat="animals">Animals</button>
      <button class="cat-btn" data-cat="food">Food</button>
      <button class="cat-btn" data-cat="activities">Activities</button>
      <button class="cat-btn" data-cat="travel">Travel</button>
      <button class="cat-btn" data-cat="objects">Objects</button>
      <button class="cat-btn" data-cat="symbols">Symbols</button>
    </div>
    <div class="emoji-grid" id="grid"></div>
  </div>
  <div class="toast" id="toast">Copied to clipboard! ✨</div>

  <script>
    const emojis = [
      {e: "😀", c: "smileys", n: "grinning face"}, {e: "😃", c: "smileys", n: "smiley"}, {e: "😄", c: "smileys", n: "smile"},
      {e: "😁", c: "smileys", n: "grin"}, {e: "😆", c: "smileys", n: "laughing"}, {e: "😅", c: "smileys", n: "sweat smile"},
      {e: "🤣", c: "smileys", n: "rofl"}, {e: "😂", c: "smileys", n: "joy"}, {e: "🙂", c: "smileys", n: "slightly smiling"},
      {e: "😉", c: "smileys", n: "wink"}, {e: "😊", c: "smileys", n: "blush"}, {e: "😇", c: "smileys", n: "innocent"},
      {e: "😍", c: "smileys", n: "heart eyes"}, {e: "🤩", c: "smileys", n: "star struck"}, {e: "😘", c: "smileys", n: "kissing"},
      {e: "😋", c: "smileys", n: "yum"}, {e: "😎", c: "smileys", n: "sunglasses"}, {e: "🥳", c: "smileys", n: "party"},
      {e: "🐶", c: "animals", n: "dog"}, {e: "🐱", c: "animals", n: "cat"}, {e: "🐭", c: "animals", n: "mouse"},
      {e: "🐹", c: "animals", n: "hamster"}, {e: "🐰", c: "animals", n: "rabbit"}, {e: "🦊", c: "animals", n: "fox"},
      {e: "🐻", c: "animals", n: "bear"}, {e: "🐼", c: "animals", n: "panda"}, {e: "🐨", c: "animals", n: "koala"},
      {e: "🐯", c: "animals", n: "tiger"}, {e: "🦁", c: "animals", n: "lion"}, {e: "🐮", c: "animals", n: "cow"},
      {e: "🍎", c: "food", n: "apple"}, {e: "🍐", c: "food", n: "pear"}, {e: "🍊", c: "food", n: "tangerine"},
      {e: "🍋", c: "food", n: "lemon"}, {e: "🍌", c: "food", n: "banana"}, {e: "🍉", c: "food", n: "watermelon"},
      {e: "🍇", c: "food", n: "grapes"}, {e: "🍓", c: "food", n: "strawberry"}, {e: "🍒", c: "food", n: "cherries"},
      {e: "🍕", c: "food", n: "pizza"}, {e: "🍔", c: "food", n: "burger"}, {e: "🍟", c: "food", n: "fries"},
      {e: "⚽", c: "activities", n: "soccer"}, {e: "🏀", c: "activities", n: "basketball"}, {e: "🏈", c: "activities", n: "football"},
      {e: "⚾", c: "activities", n: "baseball"}, {e: "🎾", c: "activities", n: "tennis"}, {e: "🏐", c: "activities", n: "volleyball"},
      {e: "🚗", c: "travel", n: "car"}, {e: "🚕", c: "travel", n: "taxi"}, {e: "🚙", c: "travel", n: "suv"},
      {e: "🚌", c: "travel", n: "bus"}, {e: "🚀", c: "travel", n: "rocket"}, {e: "✈️", c: "travel", n: "airplane"},
      {e: "💡", c: "objects", n: "bulb"}, {e: "💻", c: "objects", n: "laptop"}, {e: "📱", c: "objects", n: "phone"},
      {e: "⌚", c: "objects", n: "watch"}, {e: "📷", c: "objects", n: "camera"}, {e: "📚", c: "objects", n: "books"},
      {e: "❤️", c: "symbols", n: "heart"}, {e: "🔥", c: "symbols", n: "fire"}, {e: "⭐", c: "symbols", n: "star"},
      {e: "✨", c: "symbols", n: "sparkles"}, {e: "💯", c: "symbols", n: "100"}, {e: "🚀", c: "symbols", n: "space"}
    ];

    let currentCat = "all";
    let searchQuery = "";

    const grid = document.getElementById("grid");
    const searchInput = document.getElementById("search");
    const toast = document.getElementById("toast");

    function render() {
      const filtered = emojis.filter(item => {
        const matchesCat = currentCat === "all" || item.c === currentCat;
        const matchesQuery = item.n.toLowerCase().includes(searchQuery.toLowerCase()) || item.e.includes(searchQuery);
        return matchesCat && matchesQuery;
      });

      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: span 5; text-align: center; color: #94a3b8; font-size: 13px; padding: 20px;">No emojis found</div>';
        return;
      }

      grid.innerHTML = filtered.map(item => \`
        <div class="emoji-item" onclick="copyEmoji('\${item.e}')" title="\${item.n}">\${item.e}</div>
      \`).join("");
    }

    function copyEmoji(emoji) {
      navigator.clipboard.writeText(emoji).catch(() => {});
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1500);
    }

    searchInput.addEventListener("input", e => {
      searchQuery = e.target.value.trim();
      render();
    });

    document.querySelectorAll(".cat-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCat = btn.getAttribute("data-cat");
        render();
      });
    });

    render();
  </script>
</body>
</html>`;

function sanitizeMoodMojiNodes(items: Node[]): Node[] {
  return items.map(node => {
    let updatedHtml = node.htmlContent;
    if (node.title && node.title.toLowerCase().includes("moodmoji")) {
      if (!updatedHtml || updatedHtml.trim().startsWith("var ") || !updatedHtml.includes("<!DOCTYPE html>")) {
        updatedHtml = MOODMOJI_PRISTINE_HTML;
      }
    }
    return {
      ...node,
      htmlContent: updatedHtml,
      children: node.children && node.children.length > 0 ? sanitizeMoodMojiNodes(node.children) : node.children,
    };
  });
}

const seed: Node[] = [];

const kindLabel: Record<Kind, string> = {
  button: "Button Page",
  folder: "Folder",
  section: "Section",
  mcq: "MCQ Quiz",
  mock: "Mock Test",
  notes: "Study Notes",
  html: "Custom Web",
  typing: "Typing Skill Test",
  calc: "Speed Calculation Drill",
};

const kindColor: Record<Kind, string> = {
  button: "blue",
  folder: "violet",
  section: "amber",
  mcq: "rose",
  mock: "indigo",
  notes: "emerald",
  html: "cyan",
  typing: "teal",
  calc: "orange",
};

function findNode(nodes: Node[], id: string): Node | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
}

function findNodePath(
  nodes: Node[],
  targetId: string,
  trail: Node[] = []
): Node[] | null {
  for (const n of nodes) {
    const nextTrail = [...trail, n];
    if (n.id === targetId) return nextTrail;
    const found = findNodePath(n.children, targetId, nextTrail);
    if (found) return found;
  }
  return null;
}

function updateNodes(nodes: Node[], id: string, fn: (n: Node) => Node): Node[] {
  return nodes.map(n =>
    n.id === id ? fn(n) : { ...n, children: updateNodes(n.children, id, fn) }
  );
}

function removeNode(nodes: Node[], id: string): Node[] {
  return nodes
    .filter(n => n.id !== id)
    .map(n => ({ ...n, children: removeNode(n.children, id) }));
}

function addChild(nodes: Node[], parentId: string | null, child: Node): Node[] {
  if (!parentId) return [...nodes, child];
  return nodes.map(n =>
    n.id === parentId
      ? { ...n, children: [...n.children, child] }
      : { ...n, children: addChild(n.children, parentId, child) }
  );
}

function moveNodeInTree(nodes: Node[], id: string, dir: -1 | 1): Node[] {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) {
    const target = idx + dir;
    if (target < 0 || target >= nodes.length) return nodes;
    const copy = [...nodes];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    return copy;
  }
  return nodes.map(n => ({
    ...n,
    children: moveNodeInTree(n.children, id, dir),
  }));
}

function countTotalMcqsInside(node: Node): number {
  const own =
    node.kind === "mcq" || node.kind === "mock"
      ? (node.questions || defaultQuestions).length
      : 0;
  return (
    own + node.children.reduce((acc, c) => acc + countTotalMcqsInside(c), 0)
  );
}

function updateNodeHtmlRecursive(list: Node[], targetId: string, newHtml: string): Node[] {
  return list.map(n => {
    if (n.id === targetId) {
      return { ...n, htmlContent: newHtml };
    }
    if (n.children && n.children.length > 0) {
      return { ...n, children: updateNodeHtmlRecursive(n.children, targetId, newHtml) };
    }
    return n;
  });
}


// ============================================================================
// BULK 500+ MCQ AUTO-DETECTOR MODAL (WITH CLEAR DETECTED QUESTIONS COUNTER)
// ============================================================================
function BulkMcqModal({
  targetNode,
  onClose,
  onImport,
}: {
  targetNode: Node;
  onClose: () => void;
  onImport: (questions: McqQuestion[], mode: "append" | "replace") => void;
}) {
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");

  const parsedQuestions = useMemo(() => parseBulkMcqText(rawText), [rawText]);
  const withExplanationCount = useMemo(
    () => parsedQuestions.filter(q => Boolean(q.explanation)).length,
    [parsedQuestions]
  );

  const generate100DemoMcqs = () => {
    const blocks: string[] = [];
    for (let i = 1; i <= 100; i++) {
      const ansLetters = ["A", "B", "C", "D"];
      const ans = ansLetters[i % 4];
      blocks.push(
        `question ${i}. सामान्य ज्ञान एवं प्रतियोगी परीक्षा प्रैक्टिस प्रश्न संख्या #${i} क्या है?\nA.. विकल्प अल्फा (${i})\nB.. विकल्प बीटा (${i})\nC.. विकल्प गामा (${i})\nD.. विकल्प डेल्टा (${i})\nAnd. ${ans}\nExplane. प्रश्न संख्या #${i} का सही उत्तर ${ans} है क्योंकि यह परीक्षा मानकों के अनुसार सही तथ्य दर्शाता है।`
      );
    }
    setRawText(blocks.join("\n\n"));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bulk-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="section-kicker">
              AUTO-DETECTOR • BULK ADD 500+ MCQs
            </span>
            <h2>Bulk Add to "{targetNode.title}"</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-copy">
          Paste 10, 100, or 500+ questions at once in the format:{" "}
          <code>question 1. ... A.. B.. C.. D.. And. C Explane. ...</code>
        </p>

        <div
          style={{
            padding: "0 20px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* CLEAR DETECTED QUESTIONS COUNTER BANNER */}
          <div className="detector-counter-banner">
            <div className="detector-stat-box">
              <small>कुल डिटेक्टेड प्रश्न (Detected Questions)</small>
              <b style={{ color: parsedQuestions.length > 0 ? "#1546b5" : "#64748b" }}>
                {parsedQuestions.length} Questions
              </b>
            </div>
            <div className="detector-stat-box">
              <small>सही उत्तर डिटेक्टेड (With Answer)</small>
              <b style={{ color: parsedQuestions.length > 0 ? "#12805c" : "#64748b" }}>
                {parsedQuestions.length} / {parsedQuestions.length}
              </b>
            </div>
            <div className="detector-stat-box">
              <small>व्याख्या सहित (With Explane)</small>
              <b style={{ color: "#7c3aed" }}>
                {withExplanationCount} Questions
              </b>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className="outline-btn small"
                onClick={() => setRawText(SAMPLE_BULK_MCQ_FORMAT)}
              >
                <FileText size={13} /> Load Sample Format
              </button>
              <button
                className="outline-btn small"
                onClick={generate100DemoMcqs}
              >
                <Sparkles size={13} /> Generate 100 Demo MCQs
              </button>
              {rawText && (
                <button
                  className="outline-btn small"
                  onClick={() => setRawText("")}
                >
                  Clear Text
                </button>
              )}
            </div>

            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                padding: "6px 12px",
                borderRadius: 99,
                background: parsedQuestions.length > 0 ? "#e4faf2" : "#f1f5f9",
                color: parsedQuestions.length > 0 ? "#12805c" : "#64748b",
                border:
                  parsedQuestions.length > 0
                    ? "1px solid #a7f3d0"
                    : "1px solid #e2e8f0",
              }}
            >
              {parsedQuestions.length > 0
                ? `🎯 ${parsedQuestions.length} Questions Auto-Detected!`
                : "0 Questions Detected — Paste text below"}
            </div>
          </div>

          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder={`question 1. भारत की राजधानी क्या है?\nA.. मुंबई\nB.. नई दिल्ली\nC.. कोलकाता\nD.. चेन्नई\nAnd. B\nExplane. नई दिल्ली भारत की राजधानी है।\n\nquestion 2. ...`}
            style={{
              width: "100%",
              minHeight: 190,
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 12,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              lineHeight: 1.55,
              outline: "none",
              resize: "vertical",
            }}
          />

          {parsedQuestions.length > 0 && (
            <div
              style={{
                background: "#f8faff",
                border: "1px solid #dbe4f3",
                borderRadius: 10,
                padding: 12,
                maxHeight: 175,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#1546b5",
                  marginBottom: 8,
                }}
              >
                ✓ टोटल {parsedQuestions.length} प्रश्न डिटेक्ट हुए हैं (Showing
                first {Math.min(5, parsedQuestions.length)} preview):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {parsedQuestions.slice(0, 5).map((q, idx) => (
                  <div
                    key={q.id}
                    style={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 11,
                    }}
                  >
                    <b>
                      Q{idx + 1}. {q.question}
                    </b>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 4,
                        marginTop: 5,
                        color: "#475569",
                      }}
                    >
                      {q.options.map((o, oIdx) => (
                        <span
                          key={oIdx}
                          style={{
                            color:
                              q.correctIndex === oIdx ? "#12805c" : "#475569",
                            fontWeight: q.correctIndex === oIdx ? 700 : 400,
                          }}
                        >
                          {String.fromCharCode(65 + oIdx)}. {o}{" "}
                          {q.correctIndex === oIdx ? "✓" : ""}
                        </span>
                      ))}
                    </div>
                    {q.explanation && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: "#3769e8",
                        }}
                      >
                        <b>Explane:</b> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              paddingTop: 8,
              borderTop: "1px solid #f0f1f5",
            }}
          >
            <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "append"}
                  onChange={() => setMode("append")}
                />
                Add to existing (
                {(targetNode.questions || defaultQuestions).length} +{" "}
                {parsedQuestions.length} ={" "}
                {(targetNode.questions || defaultQuestions).length +
                  parsedQuestions.length}
                )
              </label>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                Replace all ({parsedQuestions.length} total)
              </label>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="outline-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary-btn"
                disabled={parsedQuestions.length === 0}
                onClick={() => onImport(parsedQuestions, mode)}
                style={{
                  opacity: parsedQuestions.length === 0 ? 0.5 : 1,
                }}
              >
                <Upload size={15} /> Import {parsedQuestions.length} Detected
                Questions
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// (+) DIRECT CONTENT TOOL MODAL WITH AUTO-DETECTOR (FOR ANY CONTAINER)
// ============================================================================
function PlusContentToolModal({
  targetNode,
  onClose,
  onSaveNotes,
  onSaveMcqs,
  onSaveMock,
  onSaveHtml,
}: {
  targetNode: Node;
  onClose: () => void;
  onSaveNotes: (targetId: string, notesText: string) => void;
  onSaveMcqs: (
    targetId: string,
    questions: McqQuestion[],
    mode: "append" | "replace"
  ) => void;
  onSaveMock: (
    targetId: string,
    duration: number,
    posMarks: number,
    negMarks: number,
    questions: McqQuestion[],
    mode: "append" | "replace"
  ) => void;
  onSaveHtml: (targetId: string, htmlCode: string) => void;
}) {
  const [rawText, setRawText] = useState(() => {
    if (targetNode.notesContent) return targetNode.notesContent;
    if (targetNode.htmlContent) return targetNode.htmlContent;
    if (targetNode.questions && targetNode.questions.length > 0) {
      return targetNode.questions.map((q, i) => {
        const opts = q.options.map((o, idx) => `${String.fromCharCode(65 + idx)}.. ${o}`).join("\n");
        const correctLetter = String.fromCharCode(65 + q.correctIndex);
        return `question ${i + 1}. ${q.question}\n${opts}\nAnd. ${correctLetter}${q.explanation ? `\nExplane. ${q.explanation}` : ""}`;
      }).join("\n\n");
    }
    return "";
  });
  const [activeTab, setActiveTab] = useState<"auto" | "mcq" | "notes" | "mock" | "html">("auto");
  const [mockDuration, setMockDuration] = useState(60);
  const [mockPosMarks, setMockPosMarks] = useState(2);
  const [mockNegMarks, setMockNegMarks] = useState(0.5);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  const parsedQuestions = useMemo(() => parseBulkMcqText(rawText), [rawText]);
  const isHtmlCode = useMemo(
    () => /<[a-z][\s\S]*>/i.test(rawText.trim()),
    [rawText]
  );

  const detectedKind = useMemo(() => {
    if (!rawText.trim()) return "none";
    if (parsedQuestions.length > 0) return "mcq";
    if (isHtmlCode) return "html";
    return "notes";
  }, [rawText, parsedQuestions, isHtmlCode]);

  const handleApplyContent = () => {
    const text = rawText.trim();
    if (!text) return;

    if (activeTab === "auto") {
      if (detectedKind === "mcq") {
        onSaveMcqs(targetNode.id, parsedQuestions, importMode);
      } else if (detectedKind === "html") {
        onSaveHtml(targetNode.id, text);
      } else {
        onSaveNotes(targetNode.id, text);
      }
    } else if (activeTab === "mcq") {
      onSaveMcqs(targetNode.id, parsedQuestions, importMode);
    } else if (activeTab === "mock") {
      onSaveMock(
        targetNode.id,
        mockDuration,
        mockPosMarks,
        mockNegMarks,
        parsedQuestions,
        importMode
      );
    } else if (activeTab === "notes") {
      onSaveNotes(targetNode.id, text);
    } else if (activeTab === "html") {
      onSaveHtml(targetNode.id, text);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="bulk-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="section-kicker">
              (+) DIRECT CONTENT TOOL • AUTO-DETECTOR
            </span>
            <h2>Add Content inside "{targetNode.title}"</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-copy">
          Paste MCQs, Study Notes, Mock Test questions, or Custom Web Code below. The <b>Auto-Detector</b> will parse and save directly into <b>"{targetNode.title}"</b>!
        </p>

        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* DETECTOR STATUS BANNER */}
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background:
                detectedKind === "mcq"
                  ? "#f0fdf4"
                  : detectedKind === "html"
                  ? "#ecfeff"
                  : detectedKind === "notes"
                  ? "#f0f9ff"
                  : "#f8fafc",
              border:
                detectedKind === "mcq"
                  ? "1px solid #bbf7d0"
                  : detectedKind === "html"
                  ? "1px solid #a5f3fc"
                  : detectedKind === "notes"
                  ? "1px solid #bae6fd"
                  : "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>
                {detectedKind === "mcq"
                  ? "📝"
                  : detectedKind === "html"
                  ? "💻"
                  : detectedKind === "notes"
                  ? "📖"
                  : "✨"}
              </span>
              <div>
                <b style={{ fontSize: 13, color: "#0f172a", display: "block" }}>
                  {detectedKind === "mcq"
                    ? `🎯 ${parsedQuestions.length} MCQ Questions Auto-Detected!`
                    : detectedKind === "html"
                    ? "💻 Custom HTML Web Code Detected!"
                    : detectedKind === "notes"
                    ? `📖 Study Notes Text Detected (${rawText.trim().length} Chars)`
                    : "Paste text below to auto-detect content type"}
                </b>
                <small style={{ fontSize: 11, color: "#64748b" }}>
                  Target Container: <b>{targetNode.title}</b> ({kindLabel[targetNode.kind]})
                </small>
              </div>
            </div>

            {detectedKind !== "none" && (
              <button
                className="emerald-btn small"
                onClick={handleApplyContent}
              >
                <Check size={14} /> Auto-Add to {targetNode.title}
              </button>
            )}
          </div>

          {/* TAB CHOOSER */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", paddingBottom: 10 }}>
            <button
              className={`crumb-btn ${activeTab === "auto" ? "current" : ""}`}
              onClick={() => setActiveTab("auto")}
            >
              ⚡ Auto-Detector
            </button>
            <button
              className={`crumb-btn ${activeTab === "mcq" ? "current" : ""}`}
              onClick={() => setActiveTab("mcq")}
            >
              📝 MCQs Bank ({parsedQuestions.length})
            </button>
            <button
              className={`crumb-btn ${activeTab === "notes" ? "current" : ""}`}
              onClick={() => setActiveTab("notes")}
            >
              📖 Study Notes
            </button>
            <button
              className={`crumb-btn ${activeTab === "mock" ? "current" : ""}`}
              onClick={() => setActiveTab("mock")}
            >
              ⏱️ Mock Test
            </button>
            <button
              className={`crumb-btn ${activeTab === "html" ? "current" : ""}`}
              onClick={() => setActiveTab("html")}
            >
              &lt;/&gt; Custom Web Code
            </button>
          </div>

          {/* MOCK CONFIG (IF MOCK TAB SELECTED) */}
          {activeTab === "mock" && (
            <div className="three-col" style={{ background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
              <label style={{ fontSize: 11, fontWeight: 700 }}>
                Test Duration (Min)
                <input
                  type="number"
                  value={mockDuration}
                  onChange={e => setMockDuration(Number(e.target.value) || 60)}
                />
              </label>
              <label style={{ fontSize: 11, fontWeight: 700 }}>
                Correct Marks (+)
                <input
                  type="number"
                  step="0.25"
                  value={mockPosMarks}
                  onChange={e => setMockPosMarks(Number(e.target.value) || 2)}
                />
              </label>
              <label style={{ fontSize: 11, fontWeight: 700 }}>
                Negative Marks (-)
                <input
                  type="number"
                  step="0.25"
                  value={mockNegMarks}
                  onChange={e => setMockNegMarks(Number(e.target.value) || 0.5)}
                />
              </label>
            </div>
          )}

          {/* TEXTAREA FOR PASTE */}
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            placeholder={
              activeTab === "mcq" || activeTab === "mock"
                ? "question 1. भारत की राजधानी क्या है?\nA.. मुंबई\nB.. नई दिल्ली\nC.. कोलकाता\nD.. चेन्नई\nAnd. B\nExplane. नई दिल्ली सही उत्तर है।"
                : activeTab === "html"
                ? "<div style='padding:16px'>\n  <h3>Custom Title</h3>\n</div>"
                : "• Paste your study notes, headings, or bulk text content here..."
            }
            style={{
              width: "100%",
              minHeight: 180,
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 12,
              fontFamily: activeTab === "mcq" || activeTab === "html" ? "ui-monospace, monospace" : "inherit",
              fontSize: 12.5,
              lineHeight: 1.6,
              outline: "none",
            }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(activeTab === "mcq" || activeTab === "mock") && (
                <select
                  value={importMode}
                  onChange={e => setImportMode(e.target.value as "append" | "replace")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <option value="append">Add to Existing Questions</option>
                  <option value="replace">Replace Existing Questions</option>
                </select>
              )}
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {rawText.length} characters
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="outline-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="emerald-btn"
                disabled={!rawText.trim()}
                onClick={handleApplyContent}
              >
                <Check size={15} /> Save Content to "{targetNode.title}"
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STUDENT APP LIVE PREVIEW (WITH THEME, BRANDING & MAINTENANCE MODE)
// ============================================================================
function Preview({
  nodes,
  settings,
  initialNodeId,
  onClose,
  onUpdateNodes,
  onNotify,
  isStandalone,
}: {
  nodes: Node[];
  settings: UserAppSettings;
  initialNodeId?: string | null;
  onClose: () => void;
  onUpdateNodes?: (updated: Node[], msg?: string) => void;
  onNotify?: (msg: string) => void;
  isStandalone?: boolean;
}) {
  const [currentStack, setCurrentStack] = useState<Node[]>(() => {
    if (initialNodeId) {
      const trail = findNodePath(nodes, initialNodeId);
      if (trail) return trail;
    }
    return [];
  });

  const currentNode =
    currentStack.length > 0
      ? findNode(nodes, currentStack[currentStack.length - 1].id) ||
        currentStack[currentStack.length - 1]
      : null;

  const questions =
    currentNode?.questions && currentNode.questions.length > 0
      ? currentNode.questions
      : defaultQuestions;

  const [activePassageId, setActivePassageId] = useState<string | null>(null);
  const [lang, setLang] = useState<"EN" | "HI">("HI");
  const [activeTab, setActiveTab] = useState<"home" | "saved" | "profile">(
    "home"
  );
  const [appSearch, setAppSearch] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [fontScale, setFontScale] = useState<number>(12);
  const [bypassMaintenance, setBypassMaintenance] = useState(false);

  // Interactive Quiz & Mock Test State
  const [qIndex, setQIndex] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [mockAnswers, setMockAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [completedQuizzes, setCompletedQuizzes] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(3600);
  // Student App Node Tab state (for viewing direct Notes, MCQs, or Sub-Buttons inside any folder/button)
  const [studentTab, setStudentTab] = useState<"auto" | "topics" | "notes" | "html" | "mcq" | "mock">("auto");

  const openNodeInPreview = (n: Node) => {
    setQIndex(0);
    setSelectedOpt(null);
    setScore(0);
    setQuizFinished(false);
    setCurrentStack(prev => [...prev, n]);
  };

  const resetQuiz = () => {
    setQIndex(0);
    setSelectedOpt(null);
    setScore(0);
    setQuizFinished(false);
  };

  const toggleSaveItem = (id: string) => {
    setSavedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const allEnabledItems = useMemo(() => {
    const res: Node[] = [];
    const walk = (list: Node[]) => {
      for (const item of list) {
        if (!item.enabled) continue;
        res.push(item);
        walk(item.children);
      }
    };
    walk(nodes);
    return res;
  }, [nodes]);

  const visibleNodes = useMemo(() => {
    if (currentNode) {
      return currentNode.children.filter(n => n.enabled);
    }
    const base = nodes.filter(n => n.enabled);
    if (!appSearch.trim()) return base;
    const q = appSearch.toLowerCase();
    return allEnabledItems.filter(
      n =>
        n.title.toLowerCase().includes(q) ||
        (n.subtitle && n.subtitle.toLowerCase().includes(q))
    );
  }, [currentNode, nodes, appSearch, allEnabledItems]);

  const activeStudentTab = useMemo(() => {
    if (studentTab !== "auto") return studentTab;
    if (currentNode) {
      if (currentNode.kind === "notes" || currentNode.notesContent) return "notes";
      if (currentNode.kind === "html" || currentNode.htmlContent) return "html";
      if (currentNode.kind === "mcq" || (currentNode.questions && currentNode.questions.length > 0)) return "mcq";
      if (currentNode.kind === "mock") return "mock";
    }
    return visibleNodes.length > 0 ? "topics" : "notes";
  }, [studentTab, currentNode, visibleNodes, questions]);

  const renderUserContainerCard = (n: Node, idx: number) => {
    if (n.kind === "folder") {
      // 2. FOLDER (Big Horizontal Card - matching reference UI guide)
      return (
        <div
          className="user-card folder-card"
          key={n.id}
          onClick={() => openNodeInPreview(n)}
          style={{
            cursor: "pointer",
            background: cardBg,
            borderColor: cardBorder,
            color: textColor,
          }}
        >
          <div className="folder-left">
            <div className="card-emoji-box">{n.icon || "🏛️"}</div>
            <div className="folder-info">
              <b>{n.title}</b>
              <small style={{ color: subTextColor }}>
                {n.subtitle ||
                  (n.children.length
                    ? `${n.children.length} Topics / Sections`
                    : "Folder Container")}
              </small>
            </div>
          </div>
          <div className="folder-chevron">
            <ChevronRight size={18} />
          </div>
        </div>
      );
    }

    if (n.kind === "section") {
      // 3. SECTION (Slimmer Horizontal Card - matching reference UI guide)
      return (
        <div
          className="user-card section-card"
          key={n.id}
          onClick={() => openNodeInPreview(n)}
          style={{
            cursor: "pointer",
            background: cardBg,
            borderColor: cardBorder,
            color: textColor,
          }}
        >
          <span className="section-badge">{idx + 1}. प्रश्न</span>
          <b>{n.title}</b>
          <div className="section-arrow">
            <ChevronRight size={14} />
          </div>
        </div>
      );
    }

    // 1. BUTTON (Cube Grid Card) - Default for interactive practice tools & buttons
    return (
      <div
        className="user-card cube-card"
        key={n.id}
        onClick={() => openNodeInPreview(n)}
        style={{
          cursor: "pointer",
          background: cardBg,
          borderColor: cardBorder,
          color: textColor,
        }}
      >
        <span className="live-dot" />
        <div className="card-emoji-box">{n.icon || "⚡"}</div>
        <b>{n.title}</b>
        <small style={{ color: subTextColor }}>
          {n.subtitle ||
            (n.kind === "mcq" || n.kind === "mock"
              ? `${(n.questions || defaultQuestions).length} MCQs`
              : kindLabel[n.kind])}
        </small>
      </div>
    );
  };
  const activeQuestion = questions[qIndex] || questions[0];

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const mockResult = useMemo(() => {
    const pos = currentNode?.positiveMarks ?? 2;
    const neg = currentNode?.negativeMarks ?? 0.5;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    questions.forEach((q, idx) => {
      const picked = mockAnswers[idx];
      if (picked === undefined) skipped++;
      else if (picked === q.correctIndex) correct++;
      else wrong++;
    });
    const totalMarks = +(correct * pos - wrong * neg).toFixed(2);
    const maxMarks = questions.length * pos;
    return { correct, wrong, skipped, totalMarks, maxMarks, pos, neg };
  }, [questions, mockAnswers, currentNode]);

  const showMaintenanceScreen = settings.maintenanceMode && !bypassMaintenance;
  const cardBg = settings.darkMode ? "#1e293b" : "#ffffff";
  const cardBorder = settings.darkMode ? "#334155" : "#e3e8f3";
  const textColor = settings.darkMode ? "#f8fafc" : "#19233d";
  const subTextColor = settings.darkMode ? "#94a3b8" : "#8d96a5";

  const phoneFrame = (
    <div
      className="phone-frame"
      style={{
        background: settings.darkMode ? "#0f172a" : settings.appBgColor,
        color: textColor,
        ...(isStandalone
          ? {
              width: "100%",
              maxWidth: 480,
              minHeight: "100vh",
              borderRadius: 0,
              border: "none",
              boxShadow: "0 0 25px rgba(0,0,0,0.08)",
            }
          : {}),
      }}
    >
          <div className="phone-status">
            <span>9:41 AM</span>
            <span>5G • 100%</span>
          </div>

          <div
            className="user-header"
            style={{
              background: `linear-gradient(105deg, ${settings.primaryColor}, ${settings.secondaryColor})`,
            }}
          >
            <div className="bull-mark">
              {settings.logoImageUrl ? (
                <img src={settings.logoImageUrl} alt={settings.appName} />
              ) : (
                settings.logoEmoji || "🐂"
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <b>{settings.appName}</b>
              <small>{settings.appSubtitle}</small>
            </div>
            <div className="header-spacer" />
            <button
              className="lang-pill"
              onClick={() => setLang(l => (l === "HI" ? "EN" : "HI"))}
            >
              {lang === "HI" ? "हिंदी" : "EN"}
            </button>
          </div>

          {/* MAINTENANCE MODE SCREEN IN USER APP */}
          {showMaintenanceScreen ? (
            <div
              className="user-body"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                padding: 24,
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  background: `${settings.primaryColor}18`,
                  color: settings.primaryColor,
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 16,
                  border: `2px solid ${settings.primaryColor}40`,
                }}
              >
                <Wrench size={32} />
              </div>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  padding: "4px 10px",
                  borderRadius: 99,
                  background: "#fef3c7",
                  color: "#b45309",
                  marginBottom: 10,
                }}
              >
                MAINTENANCE MODE ACTIVE
              </span>

              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  margin: "0 0 10px",
                  color: textColor,
                }}
              >
                {settings.maintenanceTitle}
              </h3>

              <div
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 14,
                  padding: 16,
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  color: settings.darkMode ? "#cbd5e1" : "#334155",
                  width: "100%",
                  whiteSpace: "pre-wrap",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
                }}
              >
                {settings.maintenanceMessage}
              </div>

              {settings.maintenanceEta && (
                <div
                  style={{
                    marginTop: 14,
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: `${settings.primaryColor}15`,
                    color: settings.darkMode ? "#93c5fd" : settings.primaryColor,
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Clock size={14} /> {settings.maintenanceEta}
                </div>
              )}

              {settings.maintenanceContact && (
                <p
                  style={{
                    marginTop: 16,
                    fontSize: 11,
                    color: subTextColor,
                    fontWeight: 600,
                  }}
                >
                  {settings.maintenanceContact}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="user-body">
                {currentNode ? (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                      }}
                    >
                      <button
                        onClick={() => {
                          resetQuiz();
                          setCurrentStack(prev =>
                            prev.slice(0, prev.length - 1)
                          );
                        }}
                        style={{
                          fontSize: 12,
                          color: settings.primaryColor,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        &larr; {lang === "HI" ? "वापस जाएं" : "Back"}
                      </button>
                      <button
                        onClick={() => toggleSaveItem(currentNode.id)}
                        style={{
                          fontSize: 11,
                          color: savedIds.includes(currentNode.id)
                            ? settings.primaryColor
                            : "#64748b",
                          background: savedIds.includes(currentNode.id)
                            ? "#edf3ff"
                            : "#fff",
                          border: "1px solid #dbe4f3",
                          borderRadius: 6,
                          padding: "4px 8px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontWeight: 600,
                        }}
                      >
                        <Bookmark size={12} />
                        {savedIds.includes(currentNode.id)
                          ? lang === "HI"
                            ? "सेव्ड"
                            : "Saved"
                          : lang === "HI"
                          ? "सेव करें"
                          : "Save"}
                      </button>
                    </div>

                    {/* MOCK TEST EXAM MODE */}
                    {currentNode.kind === "mock" ? (
                      <div
                        style={{
                          background: "#fff",
                          color: "#19233d",
                          padding: 14,
                          borderRadius: 14,
                          border: "1px solid #e3e8f3",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 10,
                          }}
                        >
                          <span className="type-chip indigo">
                            🏆 {lang === "HI" ? "मॉक टेस्ट" : "Mock Test"}
                          </span>
                          {!quizFinished && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color:
                                  secondsLeft < 300 ? "#d55b60" : "#1e293b",
                                background: "#f1f5f9",
                                padding: "3px 8px",
                                borderRadius: 6,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Clock size={12} /> {formatTimer(secondsLeft)}
                            </span>
                          )}
                        </div>

                        <h3 style={{ fontSize: 13, margin: "2px 0 10px" }}>
                          {currentNode.title}
                        </h3>

                        {questions.length === 0 ? (
                          <div
                            style={{
                              padding: "18px 10px",
                              textAlign: "center",
                              color: "#64748b",
                              fontSize: 12,
                            }}
                          >
                            अभी इस मॉक टेस्ट में कोई प्रश्न (MCQs) नहीं जोड़े गए हैं।
                            <br />
                            <small>
                              Admin Manager में जाकर 500+ Bulk Auto-Detector से प्रश्न जोड़ें।
                            </small>
                          </div>
                        ) : quizFinished ? (
                          <div
                            style={{ textAlign: "center", padding: "10px 4px" }}
                          >
                            <Trophy
                              size={32}
                              style={{ color: "#e2b44f", margin: "0 auto 6px" }}
                            />
                            <b style={{ fontSize: 15, display: "block" }}>
                              {lang === "HI"
                                ? "मॉक टेस्ट रिजल्ट"
                                : "Mock Test Result"}
                            </b>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                                margin: "12px 0",
                                textAlign: "left",
                                fontSize: 11,
                              }}
                            >
                              <div
                                style={{
                                  background: "#eff6ff",
                                  padding: 9,
                                  borderRadius: 8,
                                }}
                              >
                                <small
                                  style={{ color: "#64748b", display: "block" }}
                                >
                                  Total Score
                                </small>
                                <b style={{ fontSize: 14, color: "#1d4ed8" }}>
                                  {mockResult.totalMarks} /{" "}
                                  {mockResult.maxMarks}
                                </b>
                              </div>
                              <div
                                style={{
                                  background: "#e7faf2",
                                  padding: 9,
                                  borderRadius: 8,
                                }}
                              >
                                <small
                                  style={{ color: "#64748b", display: "block" }}
                                >
                                  Correct (+{mockResult.pos})
                                </small>
                                <b style={{ fontSize: 14, color: "#15803d" }}>
                                  {mockResult.correct} Qs
                                </b>
                              </div>
                              <div
                                style={{
                                  background: "#ffebeb",
                                  padding: 9,
                                  borderRadius: 8,
                                }}
                              >
                                <small
                                  style={{ color: "#64748b", display: "block" }}
                                >
                                  Wrong (-{mockResult.neg})
                                </small>
                                <b style={{ fontSize: 14, color: "#b91c1c" }}>
                                  {mockResult.wrong} Qs
                                </b>
                              </div>
                              <div
                                style={{
                                  background: "#f8fafc",
                                  padding: 9,
                                  borderRadius: 8,
                                }}
                              >
                                <small
                                  style={{ color: "#64748b", display: "block" }}
                                >
                                  Unattempted
                                </small>
                                <b style={{ fontSize: 14, color: "#475569" }}>
                                  {mockResult.skipped} Qs
                                </b>
                              </div>
                            </div>
                            <button
                              className="primary-btn"
                              onClick={() => resetQuiz()}
                              style={{ width: "100%", height: 36 }}
                            >
                              <RotateCcw size={14} />{" "}
                              {lang === "HI"
                                ? "दोबारा टेस्ट दें"
                                : "Re-attempt Mock Test"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                display: "flex",
                                gap: 5,
                                overflowX: "auto",
                                paddingBottom: 8,
                                marginBottom: 10,
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              {questions.slice(0, 50).map((_, idx) => {
                                const answered = mockAnswers[idx] !== undefined;
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => setQIndex(idx)}
                                    style={{
                                      minWidth: 26,
                                      height: 26,
                                      borderRadius: 6,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background:
                                        qIndex === idx
                                          ? settings.primaryColor
                                          : answered
                                          ? "#1bc58b"
                                          : "#f1f5f9",
                                      color:
                                        qIndex === idx || answered
                                          ? "#fff"
                                          : "#475569",
                                    }}
                                  >
                                    {idx + 1}
                                  </button>
                                );
                              })}
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                marginBottom: 6,
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <span>
                                Question {qIndex + 1} of {questions.length}
                              </span>
                              <span>
                                +{currentNode.positiveMarks ?? 2} / -
                                {currentNode.negativeMarks ?? 0.5}
                              </span>
                            </div>

                            <p
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: "#1e293b",
                                lineHeight: 1.5,
                                marginBottom: 12,
                              }}
                            >
                              {activeQuestion.question}
                            </p>

                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                              }}
                            >
                              {activeQuestion.options.map((opt, idx) => {
                                const isPicked = mockAnswers[qIndex] === idx;
                                return (
                                  <button
                                    key={idx}
                                    onClick={() =>
                                      setMockAnswers(prev => ({
                                        ...prev,
                                        [qIndex]: idx,
                                      }))
                                    }
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: 9,
                                      border: `1px solid ${
                                        isPicked
                                          ? settings.primaryColor
                                          : "#dce2ef"
                                      }`,
                                      fontSize: 12,
                                      textAlign: "left",
                                      background: isPicked ? "#edf3ff" : "#fff",
                                      color: isPicked ? "#1d4ed8" : "#19233d",
                                      fontWeight: isPicked ? 650 : 500,
                                    }}
                                  >
                                    <b>{String.fromCharCode(65 + idx)}.</b>{" "}
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 8,
                                marginTop: 14,
                              }}
                            >
                              <button
                                className="outline-btn small"
                                disabled={qIndex === 0}
                                onClick={() =>
                                  setQIndex(i => Math.max(0, i - 1))
                                }
                              >
                                ← Prev
                              </button>
                              {qIndex + 1 < questions.length ? (
                                <button
                                  className="outline-btn small"
                                  onClick={() => setQIndex(i => i + 1)}
                                >
                                  Save & Next →
                                </button>
                              ) : null}
                              <button
                                className="emerald-btn"
                                style={{ height: 30, fontSize: 11 }}
                                onClick={() => {
                                  setQuizFinished(true);
                                  setCompletedQuizzes(c => c + 1);
                                }}
                              >
                                Submit Test
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : currentNode.kind === "mcq" ? (
                      /* PRACTICE QUIZ MODE */
                      <div
                        style={{
                          background: "#fff",
                          color: "#19233d",
                          padding: 15,
                          borderRadius: 14,
                          border: "1px solid #e3e8f3",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 10,
                          }}
                        >
                          <span className="type-chip rose">
                            ⚡{" "}
                            {lang === "HI" ? "प्रैक्टिस क्विज़" : "Practice Quiz"}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              fontWeight: 600,
                            }}
                          >
                            {quizFinished
                              ? lang === "HI"
                                ? "परिणाम"
                                : "Result"
                              : `Q ${qIndex + 1} / ${questions.length}`}
                          </span>
                        </div>

                        <h3 style={{ fontSize: 13.5, margin: "4px 0 12px" }}>
                          {currentNode.title}
                        </h3>

                        {questions.length === 0 ? (
                          <div
                            style={{
                              padding: "18px 10px",
                              textAlign: "center",
                              color: "#64748b",
                              fontSize: 12,
                            }}
                          >
                            अभी इस क्विज़ में कोई प्रश्न (MCQs) नहीं जोड़े गए हैं।
                            <br />
                            <small>
                              Admin Manager में जाकर Bulk Auto-Detector से प्रश्न जोड़ें।
                            </small>
                          </div>
                        ) : quizFinished ? (
                          <div
                            style={{ textAlign: "center", padding: "14px 6px" }}
                          >
                            <div style={{ fontSize: 32, marginBottom: 6 }}>
                              🎉
                            </div>
                            <b style={{ fontSize: 16, display: "block" }}>
                              {lang === "HI"
                                ? "क्विज़ पूरा हुआ!"
                                : "Quiz Completed!"}
                            </b>
                            <p
                              style={{
                                fontSize: 12,
                                color: "#506078",
                                margin: "6px 0 14px",
                              }}
                            >
                              Score: {score} / {questions.length} (
                              {Math.round((score / questions.length) * 100)}%)
                            </p>
                            <button
                              className="primary-btn"
                              onClick={() => resetQuiz()}
                              style={{ width: "100%", height: 36 }}
                            >
                              <RotateCcw size={14} />{" "}
                              {lang === "HI"
                                ? "फिर से प्रयास करें"
                                : "Retry Quiz"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <p
                              style={{
                                fontSize: 12.5,
                                color: "#1e293b",
                                fontWeight: 600,
                                lineHeight: 1.5,
                                marginBottom: 12,
                              }}
                            >
                              {activeQuestion.question}
                            </p>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                              }}
                            >
                              {activeQuestion.options.map((opt, idx) => {
                                const isPicked = selectedOpt === idx;
                                const isCorrect =
                                  idx === activeQuestion.correctIndex;
                                let bg = "#fff";
                                let border = "#dce2ef";
                                if (selectedOpt !== null) {
                                  if (isCorrect) {
                                    bg = "#e4faf2";
                                    border = "#1bc58b";
                                  } else if (isPicked) {
                                    bg = "#ffebeb";
                                    border = "#e06666";
                                  }
                                }
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      if (selectedOpt !== null) return;
                                      setSelectedOpt(idx);
                                      if (idx === activeQuestion.correctIndex) {
                                        setScore(s => s + 1);
                                      }
                                    }}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: 9,
                                      border: `1px solid ${border}`,
                                      fontSize: 12,
                                      textAlign: "left",
                                      background: bg,
                                      color: "#19233d",
                                      fontWeight: 500,
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span>
                                      <b>{String.fromCharCode(65 + idx)}.</b>{" "}
                                      {opt}
                                    </span>
                                    {selectedOpt !== null && isCorrect && (
                                      <span
                                        style={{
                                          color: "#12805c",
                                          fontWeight: 700,
                                        }}
                                      >
                                        ✓
                                      </span>
                                    )}
                                    {selectedOpt !== null &&
                                      isPicked &&
                                      !isCorrect && (
                                        <span
                                          style={{
                                            color: "#c93b3b",
                                            fontWeight: 700,
                                          }}
                                        >
                                          ✕
                                        </span>
                                      )}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedOpt !== null &&
                              activeQuestion.explanation && (
                                <div
                                  style={{
                                    marginTop: 12,
                                    padding: 10,
                                    borderRadius: 8,
                                    background: "#f3f7ff",
                                    border: "1px solid #d6e3ff",
                                    fontSize: 11,
                                    color: "#2c4375",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  <b>💡 Explain:</b>{" "}
                                  {activeQuestion.explanation}
                                </div>
                              )}

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: 14,
                              }}
                            >
                              <button
                                className="outline-btn small"
                                disabled={qIndex === 0}
                                onClick={() => {
                                  setQIndex(i => Math.max(0, i - 1));
                                  setSelectedOpt(null);
                                }}
                              >
                                ← Prev
                              </button>
                              <button
                                className="primary-btn small"
                                onClick={() => {
                                  if (qIndex + 1 < questions.length) {
                                    setQIndex(i => i + 1);
                                    setSelectedOpt(null);
                                  } else {
                                    setQuizFinished(true);
                                    setCompletedQuizzes(c => c + 1);
                                  }
                                }}
                              >
                                {qIndex + 1 < questions.length
                                  ? "Next →"
                                  : "Finish →"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : currentNode.kind === "notes" ? (
                      <div
                        style={{
                          background: "#fff",
                          color: "#19233d",
                          padding: 15,
                          borderRadius: 14,
                          border: "1px solid #e3e8f3",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 10,
                          }}
                        >
                          <span className="type-chip emerald">
                            📖 Study Notes
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              className="icon-button"
                              style={{ height: 24, fontSize: 10 }}
                              onClick={() =>
                                setFontScale(f => Math.max(10, f - 1))
                              }
                            >
                              A-
                            </button>
                            <button
                              className="icon-button"
                              style={{ height: 24, fontSize: 10 }}
                              onClick={() =>
                                setFontScale(f => Math.min(16, f + 1))
                              }
                            >
                              A+
                            </button>
                          </div>
                        </div>
                        <h3 style={{ fontSize: 14, margin: "4px 0 6px" }}>
                          {currentNode.title}
                        </h3>
                        <div
                          style={{
                            background: "#f8f9fc",
                            padding: 12,
                            borderRadius: 10,
                            fontSize: fontScale,
                            lineHeight: 1.7,
                            color: "#1e293b",
                            border: "1px solid #e7eaf1",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {currentNode.notesContent ||
                            "• महत्वपूर्ण परीक्षा उपयोगी नोट्स यहाँ उपलब्ध हैं।"}
                        </div>
                      </div>
                    ) : currentNode.kind === "html" ? (
                      <div
                        style={{
                          background: "#fff",
                          color: "#19233d",
                          padding: 14,
                          borderRadius: 14,
                          border: "1px solid #e3e8f3",
                        }}
                      >
                        <span
                          className="type-chip cyan"
                          style={{ marginBottom: 10, display: "inline-flex" }}
                        >
                          {"</>"} Custom Web View
                        </span>
                        <h3 style={{ fontSize: 14, margin: "2px 0 10px" }}>
                          {currentNode.title}
                        </h3>
                        <SandboxedHtmlView
                          htmlContent={currentNode.htmlContent}
                          title={currentNode.title}
                          minHeight={450}
                        />
                      </div>
                    ) : currentNode.kind === "typing" ? (
                      (() => {
                        const passagesList = (currentNode.passages && currentNode.passages.length > 0)
                          ? currentNode.passages
                          : [
                              {
                                id: "default-p1",
                                title: currentNode.title || "Typing Practice Test",
                                lang: (currentNode.typingLanguage || "en") as "hi" | "en",
                                duration: currentNode.durationMinutes || 5,
                                difficulty: "medium" as const,
                                targetWpm: currentNode.targetWpm || 35,
                                text: currentNode.typingPassage || DEFAULT_TYPING_PASSAGES.ssc_en,
                              },
                            ];

                        const activePassage =
                          passagesList.find(p => p.id === activePassageId) ||
                          (passagesList.length === 1 ? passagesList[0] : null);

                        if (activePassage) {
                          return (
                            <div>
                              {passagesList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setActivePassageId(null)}
                                  style={{
                                    border: 0,
                                    background: "transparent",
                                    color: settings.primaryColor,
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    padding: "4px 0",
                                    marginBottom: 10,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  ← Back to All Tests ({passagesList.length})
                                </button>
                              )}
                              <TypingPracticeView
                                key={activePassage.id}
                                title={activePassage.title}
                                passage={activePassage.text}
                                language={activePassage.lang}
                                durationMinutes={activePassage.duration}
                                targetWpm={activePassage.targetWpm || 35}
                                primaryColor={settings.primaryColor}
                              />
                            </div>
                          );
                        }

                        // Multiple passages selection list
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div
                              style={{
                                background: cardBg,
                                padding: "12px 14px",
                                borderRadius: 10,
                                border: `1px solid ${cardBorder}`,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <b style={{ fontSize: 13, color: textColor, display: "block" }}>
                                  {currentNode.title}
                                </b>
                                <small style={{ fontSize: 11, color: subTextColor }}>
                                  Select a typing test to begin examination practice:
                                </small>
                              </div>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "3px 8px",
                                  borderRadius: 6,
                                  background: "#ccfbf1",
                                  color: "#0f766e",
                                }}
                              >
                                {passagesList.length} Tests
                              </span>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {passagesList.map((p, idx) => (
                                <div
                                  key={p.id}
                                  onClick={() => setActivePassageId(p.id)}
                                  style={{
                                    background: cardBg,
                                    border: `1px solid ${cardBorder}`,
                                    borderRadius: 10,
                                    padding: 12,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    transition: "transform 0.1s",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div
                                      style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: 8,
                                        background: "#e6fffa",
                                        color: "#0d9488",
                                        display: "grid",
                                        placeItems: "center",
                                        fontSize: 16,
                                        flexShrink: 0,
                                      }}
                                    >
                                      ⌨️
                                    </div>
                                    <div>
                                      <b style={{ fontSize: 12.5, color: textColor, display: "block" }}>
                                        {p.title}
                                      </b>
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          marginTop: 3,
                                          fontSize: 10.5,
                                          color: subTextColor,
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontWeight: 700,
                                            padding: "1px 5px",
                                            borderRadius: 4,
                                            background: p.lang === "hi" ? "#fef3c7" : "#dbeafe",
                                            color: p.lang === "hi" ? "#92400e" : "#1e40af",
                                          }}
                                        >
                                          {p.lang === "hi" ? "हिंदी" : "English"}
                                        </span>
                                        <span>• {p.duration} Min</span>
                                        {p.difficulty && (
                                          <span>
                                            •{" "}
                                            {p.difficulty.charAt(0).toUpperCase() +
                                              p.difficulty.slice(1)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    style={{
                                      border: 0,
                                      background: settings.primaryColor,
                                      color: "#fff",
                                      padding: "6px 12px",
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      flexShrink: 0,
                                    }}
                                  >
                                    Start Test →
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()
                    ) : currentNode.kind === "calc" ? (
                      <SpeedCalculationView
                        title={currentNode.title}
                        mode={currentNode.calcMode || "mix"}
                        durationSeconds={currentNode.calcDurationSeconds || 60}
                        primaryColor={settings.primaryColor}
                      />
                    ) : (
                      <div>
                        <div className="preview-note">
                          <span>{kindLabel[currentNode.kind].toUpperCase()}</span>
                          <b style={{ color: textColor }}>{currentNode.title}</b>
                        </div>

                        {/* Interactive Content Tabs inside Folder/Button if notes, html, questions, or sub-buttons exist */}
                        {(Boolean(currentNode.notesContent) || Boolean(currentNode.htmlContent) || questions.length > 0) && (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              marginBottom: 12,
                              overflowX: "auto",
                              paddingBottom: 4,
                            }}
                          >
                            {visibleNodes.length > 0 && (
                              <button
                                className={`crumb-btn ${
                                  activeStudentTab === "topics" ? "current" : ""
                                }`}
                                onClick={() => setStudentTab("topics")}
                              >
                                📁 Topics ({visibleNodes.length})
                              </button>
                            )}
                            {Boolean(currentNode.notesContent) && (
                              <button
                                className={`crumb-btn ${
                                  activeStudentTab === "notes" ? "current" : ""
                                }`}
                                onClick={() => setStudentTab("notes")}
                              >
                                📖 Study Notes ✓
                              </button>
                            )}
                            {Boolean(currentNode.htmlContent) && (
                              <button
                                className={`crumb-btn ${
                                  activeStudentTab === "html" ? "current" : ""
                                }`}
                                onClick={() => setStudentTab("html")}
                              >
                                {"</>"} Custom Code ✓
                              </button>
                            )}
                            {questions.length > 0 && (
                              <button
                                className={`crumb-btn ${
                                  activeStudentTab === "mcq" ? "current" : ""
                                }`}
                                onClick={() => setStudentTab("mcq")}
                              >
                                📝 Practice Quiz ({questions.length})
                              </button>
                            )}
                          </div>
                        )}

                        {activeStudentTab === "notes" && currentNode.notesContent ? (
                          <div
                            style={{
                              background: cardBg,
                              color: textColor,
                              padding: 15,
                              borderRadius: 14,
                              border: `1px solid ${cardBorder}`,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 10,
                              }}
                            >
                              <span className="type-chip emerald">📖 Study Notes</span>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  className="icon-button"
                                  style={{ height: 24, fontSize: 10 }}
                                  onClick={() => setFontScale(f => Math.max(10, f - 1))}
                                >
                                  A-
                                </button>
                                <button
                                  className="icon-button"
                                  style={{ height: 24, fontSize: 10 }}
                                  onClick={() => setFontScale(f => Math.min(16, f + 1))}
                                >
                                  A+
                                </button>
                              </div>
                            </div>
                            <div
                              style={{
                                background: settings.darkMode ? "#0f172a" : "#f8f9fc",
                                padding: 12,
                                borderRadius: 10,
                                fontSize: fontScale,
                                lineHeight: 1.7,
                                color: textColor,
                                border: `1px solid ${cardBorder}`,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {currentNode.notesContent}
                            </div>
                          </div>
                        ) : (activeStudentTab === "html" || currentNode.kind === "html") ? (
                          <div
                            style={{
                              background: cardBg,
                              color: textColor,
                              padding: 15,
                              borderRadius: 14,
                              border: `1px solid ${cardBorder}`,
                            }}
                          >
                            <span className="type-chip cyan" style={{ marginBottom: 10, display: "inline-flex" }}>
                              {"</>"} Custom Code & Web View
                            </span>
                            <h3 style={{ fontSize: 14, margin: "2px 0 10px" }}>
                              {currentNode.title}
                            </h3>
                            <SandboxedHtmlView
                              htmlContent={currentNode.htmlContent}
                              title={currentNode.title}
                              minHeight={480}
                            />
                          </div>
                        ) : activeStudentTab === "mcq" && questions.length > 0 ? (
                          <div
                            style={{
                              background: cardBg,
                              color: textColor,
                              padding: 14,
                              borderRadius: 14,
                              border: `1px solid ${cardBorder}`,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 8,
                              }}
                            >
                              <span className="type-chip rose">
                                📝 Question {qIndex + 1} of {questions.length}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: settings.primaryColor }}>
                                Score: {score} / {questions.length}
                              </span>
                            </div>

                            <p style={{ fontSize: 12.5, fontWeight: 600, margin: "6px 0 10px" }}>
                              {activeQuestion.question}
                            </p>

                            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                              {activeQuestion.options.map((opt, idx) => {
                                const isCorrect = idx === activeQuestion.correctIndex;
                                const isPicked = selectedOpt === idx;
                                let bg = settings.darkMode ? "#1e293b" : "#fff";
                                let border = cardBorder;
                                if (selectedOpt !== null) {
                                  if (isCorrect) {
                                    bg = "#e7faf2";
                                    border = "#12805c";
                                  } else if (isPicked) {
                                    bg = "#ffebeb";
                                    border = "#c93b3b";
                                  }
                                }
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      if (selectedOpt !== null) return;
                                      setSelectedOpt(idx);
                                      if (idx === activeQuestion.correctIndex) {
                                        setScore(s => s + 1);
                                      }
                                    }}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: 9,
                                      border: `1px solid ${border}`,
                                      fontSize: 12,
                                      textAlign: "left",
                                      background: bg,
                                      color: textColor,
                                      fontWeight: 500,
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    }}
                                  >
                                    <span>
                                      <b>{String.fromCharCode(65 + idx)}.</b> {opt}
                                    </span>
                                    {selectedOpt !== null && isCorrect && (
                                      <span style={{ color: "#12805c", fontWeight: 700 }}>✓</span>
                                    )}
                                    {selectedOpt !== null && isPicked && !isCorrect && (
                                      <span style={{ color: "#c93b3b", fontWeight: 700 }}>✕</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedOpt !== null && activeQuestion.explanation && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: 10,
                                  borderRadius: 8,
                                  background: settings.darkMode ? "#1e293b" : "#f3f7ff",
                                  border: `1px solid ${settings.darkMode ? "#334155" : "#d6e3ff"}`,
                                  fontSize: 11,
                                  color: settings.darkMode ? "#93c5fd" : "#2c4375",
                                }}
                              >
                                <b>💡 Explain:</b> {activeQuestion.explanation}
                              </div>
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                              <button
                                className="outline-btn small"
                                disabled={qIndex === 0}
                                onClick={() => {
                                  setQIndex(i => Math.max(0, i - 1));
                                  setSelectedOpt(null);
                                }}
                              >
                                ← Prev
                              </button>
                              <button
                                className="primary-btn small"
                                onClick={() => {
                                  if (qIndex + 1 < questions.length) {
                                    setQIndex(i => i + 1);
                                    setSelectedOpt(null);
                                  } else {
                                    setQuizFinished(true);
                                  }
                                }}
                              >
                                {qIndex + 1 < questions.length ? "Next →" : "Finish →"}
                              </button>
                            </div>
                          </div>
                        ) : visibleNodes.length > 0 ? (
                          <div
                            className={`user-grid ${
                              settings.gridColumns === 1 ? "single-col" : ""
                            }`}
                          >
                            {visibleNodes.map((n, idx) => renderUserContainerCard(n, idx))}
                          </div>
                        ) : (
                          <div
                            style={{
                              background: cardBg,
                              borderRadius: 12,
                              padding: 22,
                              textAlign: "center",
                              color: subTextColor,
                              fontSize: 12,
                              border: `1px solid ${cardBorder}`,
                            }}
                          >
                            <p style={{ margin: "0 0 10px" }}>
                              No sub-items added inside "{currentNode.title}" yet.
                            </p>
                            {/typing|type|टंकण/i.test(currentNode.title) && (
                              <div style={{ marginTop: 8 }}>
                                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
                                  💡 This button appears to be for Typing Practice.
                                </p>
                                <button
                                  className="primary-btn small"
                                  onClick={() => {
                                    const next = updateNodes(nodes, currentNode.id, n => ({
                                      ...n,
                                      kind: "typing",
                                      typingPassage: n.typingPassage || DEFAULT_TYPING_PASSAGES.ssc_en,
                                      targetWpm: 35,
                                      durationMinutes: 5,
                                    }));
                                    onUpdateNodes?.(next, "Converted to Typing Practice");
                                    onNotify?.("Converted to Typing Practice");
                                  }}
                                  style={{ margin: "0 auto" }}
                                >
                                  <Keyboard size={13} /> Open Typing Test Practice View
                                </button>
                              </div>
                            )}
                            {/calc|math|speed|गणना/i.test(currentNode.title) && (
                              <div style={{ marginTop: 8 }}>
                                <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 8px" }}>
                                  💡 This button appears to be for Fast Math Calculation.
                                </p>
                                <button
                                  className="primary-btn small"
                                  onClick={() => {
                                    const next = updateNodes(nodes, currentNode.id, n => ({
                                      ...n,
                                      kind: "calc",
                                      calcMode: "mix",
                                      calcDurationSeconds: 60,
                                    }));
                                    onUpdateNodes?.(next, "Converted to Speed Calculation Drill");
                                    onNotify?.("Converted to Speed Calculation Drill");
                                  }}
                                  style={{ margin: "0 auto" }}
                                >
                                  <Calculator size={13} /> Open Speed Calculation Drill View
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {activeTab === "home" && (
                      <>
                        {settings.announcementEnabled &&
                          settings.announcementText && (
                            <div
                              style={{
                                background: `${settings.primaryColor}15`,
                                border: `1px solid ${settings.primaryColor}35`,
                                color: settings.darkMode
                                  ? "#93c5fd"
                                  : settings.primaryColor,
                                padding: "7px 10px",
                                borderRadius: 9,
                                fontSize: 11,
                                fontWeight: 650,
                                marginBottom: 10,
                              }}
                            >
                              {settings.announcementText}
                            </div>
                          )}

                        <div className="preview-note">
                          <span>
                            {lang === "HI" ? "नमस्ते, छात्र!" : "WELCOME"}
                          </span>
                          <b style={{ color: textColor }}>
                            {settings.welcomeHeading}
                          </b>
                        </div>

                        <div
                          className="search-box"
                          style={{
                            background: cardBg,
                            borderColor: cardBorder,
                            marginBottom: 12,
                            height: 34,
                          }}
                        >
                          <Search size={14} />
                          <input
                            style={{ color: textColor }}
                            value={appSearch}
                            onChange={e => setAppSearch(e.target.value)}
                            placeholder={
                              lang === "HI"
                                ? "क्विज़, मॉक या नोट्स खोजें..."
                                : "Search quizzes, mocks, notes..."
                            }
                          />
                        </div>

                        {visibleNodes.length > 0 ? (
                          <div
                            className={`user-grid ${
                              settings.gridColumns === 1 ? "single-col" : ""
                            }`}
                          >
                            {visibleNodes.map((n, idx) => renderUserContainerCard(n, idx))}
                          </div>
                        ) : (
                          <div
                            style={{
                              background: cardBg,
                              borderRadius: 14,
                              padding: "28px 16px",
                              textAlign: "center",
                              color: subTextColor,
                              fontSize: 12,
                              border: `1px solid ${cardBorder}`,
                            }}
                          >
                            <div style={{ fontSize: 28, marginBottom: 8 }}>
                              📂
                            </div>
                            <b
                              style={{
                                display: "block",
                                color: textColor,
                                fontSize: 13,
                                marginBottom: 4,
                              }}
                            >
                              {lang === "HI"
                                ? "अभी कोई बटन या कोर्स नहीं जोड़ा गया है"
                                : "No buttons added yet"}
                            </b>
                            <span>
                              {lang === "HI"
                                ? "Home Page Manager से जब आप नया बटन या फोल्डर जोड़ेंगे, तो वह तुरंत यहाँ यूजर ऐप में दिखेगा।"
                                : "Add buttons, folders, or quizzes from Home Page Manager to see them live here."}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {activeTab === "saved" && (
                      <div>
                        <div className="preview-note">
                          <span>BOOKMARKS</span>
                          <b style={{ color: textColor }}>Saved Study Items</b>
                        </div>
                        <div
                          className={`user-grid ${
                            settings.gridColumns === 1 ? "single-col" : ""
                          }`}
                        >
                          {allEnabledItems
                            .filter(i => savedIds.includes(i.id))
                            .map(n => (
                              <div
                                className="user-card"
                                key={n.id}
                                onClick={() => openNodeInPreview(n)}
                                style={{
                                  cursor: "pointer",
                                  background: cardBg,
                                  borderColor: cardBorder,
                                  color: textColor,
                                }}
                              >
                                <span className="live-dot" />
                                <div className="card-emoji">{n.icon}</div>
                                <b>{n.title}</b>
                                <small style={{ color: subTextColor }}>
                                  {n.subtitle || kindLabel[n.kind]}
                                </small>
                                <em>Open</em>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {activeTab === "profile" && (
                      <div
                        style={{
                          background: cardBg,
                          color: textColor,
                          padding: 18,
                          borderRadius: 14,
                          textAlign: "center",
                          border: `1px solid ${cardBorder}`,
                        }}
                      >
                        <b style={{ fontSize: 14 }}>{settings.appName} Aspirant</b>
                        <p style={{ fontSize: 11, color: subTextColor }}>
                          Completed Tests: {completedQuizzes} • Saved:{" "}
                          {savedIds.length}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div
                className="phone-bottom-nav"
                style={{
                  background: cardBg,
                  borderTopColor: cardBorder,
                }}
              >
                <button
                  onClick={() => {
                    setActiveTab("home");
                    setCurrentStack([]);
                  }}
                  style={{
                    fontSize: 10,
                    color:
                      activeTab === "home" && !currentNode
                        ? settings.primaryColor
                        : "#8a96aa",
                    fontWeight: 700,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <LayoutGrid size={15} /> होम
                </button>
                <button
                  onClick={() => {
                    setActiveTab("saved");
                    setCurrentStack([]);
                  }}
                  style={{
                    fontSize: 10,
                    color:
                      activeTab === "saved" && !currentNode
                        ? settings.primaryColor
                        : "#8a96aa",
                    fontWeight: 700,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Archive size={15} /> सेव्ड
                </button>
                <button
                  onClick={() => {
                    setActiveTab("profile");
                    setCurrentStack([]);
                  }}
                  style={{
                    fontSize: 10,
                    color:
                      activeTab === "profile" && !currentNode
                        ? settings.primaryColor
                        : "#8a96aa",
                    fontWeight: 700,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Users size={15} /> प्रोफाइल
                </button>
              </div>
            </>
          )}
        </div>
  );

  if (isStandalone) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: settings.darkMode ? "#090d16" : "#f1f5f9",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          margin: 0,
          padding: 0,
        }}
      >
        {phoneFrame}
      </div>
    );
  }

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-shell" onClick={e => e.stopPropagation()}>
        <div className="preview-top">
          <div>
            <span className="section-kicker">LIVE STUDENT APP PREVIEW</span>
            <h2>{settings.appName} Mobile App</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {settings.maintenanceMode && (
              <button
                className="outline-btn small"
                onClick={() => setBypassMaintenance(b => !b)}
                title="Toggle between Maintenance Screen and Admin Bypass"
              >
                {bypassMaintenance
                  ? "Show Maintenance Screen"
                  : "Admin Bypass App"}
              </button>
            )}
            <button
              className="close-button"
              onClick={onClose}
              title="Close preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {phoneFrame}
      </div>
    </div>
  );
}

export function PreviewStandalone() {
  const [nodes, setNodes] = useState<Node[]>(seed);
  const [appSettings, setAppSettings] = useState<UserAppSettings>(defaultAppSettings);

  useEffect(() => {
    let active = true;
    try {
      const savedNodes = localStorage.getItem("studybull_zero_nodes_v1");
      if (savedNodes) {
        const parsed = JSON.parse(savedNodes);
        if (Array.isArray(parsed)) setNodes(sanitizeMoodMojiNodes(parsed));
      }
      const savedSettings = localStorage.getItem("studybull_zero_settings_v1");
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        setAppSettings(prev => ({ ...prev, ...parsedSettings }));
      }
    } catch {}

    void fetchStudyBullStateFromSupabase<Node, UserAppSettings>().then(remote => {
      if (!active || !remote) return;
      if (Array.isArray(remote.nodes) && remote.nodes.length > 0) {
        setNodes(sanitizeMoodMojiNodes(remote.nodes));
      }
      if (remote.settings && Object.keys(remote.settings).length > 0) {
        setAppSettings(prev => ({ ...prev, ...remote.settings }));
      }
    });

    const unsubscribe = subscribeToStudyBullState<Node, UserAppSettings>(payload => {
      if (!active) return;
      if (Array.isArray(payload.nodes) && payload.nodes.length > 0) {
        setNodes(sanitizeMoodMojiNodes(payload.nodes));
      }
      if (payload.settings && Object.keys(payload.settings).length > 0) {
        setAppSettings(prev => ({ ...prev, ...payload.settings }));
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <Preview
      nodes={nodes}
      settings={appSettings}
      onClose={() => {}}
      isStandalone={true}
    />
  );
}

// ============================================================================
// MAIN APPLICATION (HOME PAGE MANAGER + MENU SETTINGS ADMIN CONTROL)
// ============================================================================
export default function Home() {
  const [nodes, setNodes] = useState<Node[]>(seed);
  const [appSettings, setAppSettings] =
    useState<UserAppSettings>(defaultAppSettings);

  // Navigation: "manager" vs "settings" vs "create_passcode" vs "active_passcodes" (opened from Menu Button)
  const [activeView, setActiveView] = useState<
    "manager" | "settings" | "create_passcode" | "active_passcodes"
  >("manager");
  const [menuOpen, setMenuOpen] = useState(false);

  // HTML Code Viewer & Live Preview Modal State
  const [htmlCodeViewerNode, setHtmlCodeViewerNode] = useState<Node | null>(null);
  const [editableHtml, setEditableHtml] = useState("");

  // Separate Page Navigation Stack inside Home Manager
  const [pageId, setPageId] = useState<string | null>(null);
  const [editingMetaNodeId, setEditingMetaNodeId] = useState<string | null>(
    null
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkMcq, setShowBulkMcq] = useState(false);
  const [showPlusTool, setShowPlusTool] = useState(false);
  const [plusTargetNodeId, setPlusTargetNodeId] = useState<string | null>(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commitHistory, setCommitHistory] = useState<
    Array<{ id: string; msg: string; timestamp: string }>
  >(() => {
    try {
      const saved = localStorage.getItem("studybull_commit_logs");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [previewTargetId, setPreviewTargetId] = useState<
    string | null | undefined
  >(undefined);

  // Database Connection Manager State
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbStatusMsg, setDbStatusMsg] = useState<string | null>(null);
  const [dbConfigState, setDbConfigState] = useState(() => getStoredSupabaseConfig());
  const [dbUrlInput, setDbUrlInput] = useState(() => getStoredSupabaseConfig().url);
  const [dbKeyInput, setDbKeyInput] = useState(() => getStoredSupabaseConfig().key);
  const [dbTesting, setDbTesting] = useState(false);
  // Security Passcode Lock & Roles State
  const [authSession, setAuthSession] = useState<{
    isAuthenticated: boolean;
    role: AdminRole;
    label: string;
    code: string;
  } | null>(() => {
    try {
      const saved = sessionStorage.getItem("studybull_admin_session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.isAuthenticated && parsed.role) return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [authPasscodeAttempt, setAuthPasscodeAttempt] = useState("");
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);
  const [showAuthPasswordToggle, setShowAuthPasswordToggle] = useState(false);

  // Passcode Manager Modal State
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [newPasscodeLabel, setNewPasscodeLabel] = useState("");
  const [newPasscodeCode, setNewPasscodeCode] = useState("");
  const [newPasscodeRole, setNewPasscodeRole] = useState<AdminRole>("admin");
  const [passcodeVisibilityMap, setPasscodeVisibilityMap] = useState<Record<string, boolean>>({});

  // Dedicated Typing Passages Manager State
  const [showPassageForm, setShowPassageForm] = useState(false);
  const [editingPassageId, setEditingPassageId] = useState<string | null>(null);
  const [passageFormTitle, setPassageFormTitle] = useState("");
  const [passageFormLang, setPassageFormLang] = useState<"hi" | "en">("en");
  const [passageFormDuration, setPassageFormDuration] = useState<number>(5);
  const [passageFormText, setPassageFormText] = useState("");
  const [passageFormDifficulty, setPassageFormDifficulty] = useState<
    "easy" | "medium" | "hard"
  >("medium");
  const [passageFormTargetWpm, setPassageFormTargetWpm] = useState<number>(35);

  // Filters & Pagination inside any Page
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [activeContentTab, setActiveContentTab] = useState<
    "children" | "notes" | "mcq" | "mock"
  >("children");
  const [questionSearch, setQuestionSearch] = useState("");
  const [qPage, setQPage] = useState(1);
  const [toast, setToast] = useState("Auto-saved");

  const QUESTIONS_PER_PAGE = 25;

  type ConfirmModalState = {
    title: string;
    description: string;
    itemTitle?: string;
    itemKind?: string;
    badge?: string;
    confirmText: string;
    cancelText?: string;
    variant: "danger" | "primary" | "emerald";
    onConfirm: () => void;
  } | null;

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [importJsonText, setImportJsonText] = useState("");

  type ToastItem = {
    id: string;
    type: "success" | "error" | "info" | "warning";
    title: string;
    message?: string;
  };

  const [toastList, setToastList] = useState<ToastItem[]>([]);

  const showToast = (
    type: "success" | "error" | "info" | "warning",
    title: string,
    message?: string
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const item: ToastItem = { id, type, title, message };
    setToastList(prev => [...prev.slice(-3), item]);
    setToast(title);
    setTimeout(() => {
      setToastList(prev => prev.filter(t => t.id !== id));
    }, 4200);
  };

  const notify = (
    message: string,
    type: "success" | "error" | "info" | "warning" = "success"
  ) => {
    const title =
      type === "error"
        ? "✕ Action Failed"
        : type === "warning"
        ? "⚠️ Warning Notice"
        : type === "info"
        ? "ℹ️ Notice"
        : "✓ Action Completed";
    showToast(type, title, message);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as any;
      if (!w.setOp) w.setOp = (...args: any[]) => { console.log("setOp fallback", args); };
      if (!w.setTime) w.setTime = (...args: any[]) => { console.log("setTime fallback", args); };
      if (!w.startGame) w.startGame = (...args: any[]) => { console.log("startGame fallback", args); };
      if (!w.calculate) w.calculate = (...args: any[]) => { console.log("calculate fallback", args); };
    }
  }, []);

  const handleExportJson = () => {
    const payload = JSON.stringify({ nodes, settings: appSettings }, null, 2);
    void navigator.clipboard.writeText(payload);
    notify("Current database JSON copied to clipboard!");
  };

  const handleImportJson = (mode: "merge" | "replace") => {
    try {
      if (!importJsonText.trim()) {
        notify("Please paste JSON first");
        return;
      }
      const parsed = JSON.parse(importJsonText.trim());
      let incomingNodes: Node[] = [];
      let incomingSettings: Partial<UserAppSettings> | undefined;

      if (Array.isArray(parsed)) {
        incomingNodes = parsed as Node[];
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.nodes)) {
          incomingNodes = parsed.nodes as Node[];
        }
        if (parsed.settings && typeof parsed.settings === "object") {
          incomingSettings = parsed.settings as Partial<UserAppSettings>;
        }
      }

      if (!Array.isArray(incomingNodes) || incomingNodes.length === 0) {
        notify("No valid buttons/items found in JSON");
        return;
      }

      let finalNodes: Node[] = [];
      if (mode === "replace") {
        finalNodes = incomingNodes;
      } else {
        const existingIds = new Set(nodes.map(n => n.id));
        const newOnes = incomingNodes.filter(n => !existingIds.has(n.id));
        finalNodes = [...nodes, ...newOnes];
      }

      setConfirmModal({
        title: `Confirm Data ${mode === "replace" ? "Replacement" : "Merge"}?`,
        description: `Kya aap ${incomingNodes.length} items ko ${
          mode === "replace" ? "Replace All" : "Merge"
        } mode me apply karna chahte hain? Update se pehle confirmation:`,
        badge: "DATA IMPORT CONFIRMATION",
        confirmText: "Haan, Update Karein",
        cancelText: "Cancel",
        variant: mode === "replace" ? "danger" : "primary",
        onConfirm: () => {
          saveStructure(
            finalNodes,
            mode === "replace"
              ? "Replaced all with User App data!"
              : `Merged ${incomingNodes.length} items from User App!`
          );
          if (incomingSettings) {
            updateAppSettings(incomingSettings);
          }
          setImportJsonText("");
          setConfirmModal(null);
        },
      });
    } catch {
      notify("Invalid JSON format. Check syntax.");
    }
  };

  useEffect(() => {
    let active = true;
    try {
      // Remove old pre-seeded localStorage keys so app starts cleanly from zero
      localStorage.removeItem("studybull_home_nodes_v2");
      localStorage.removeItem("studybull_home_nodes_v1");

      const savedNodes = localStorage.getItem("studybull_zero_nodes_v1");
      if (savedNodes) {
        const parsed = JSON.parse(savedNodes) as Node[];
        if (Array.isArray(parsed)) {
          setNodes(sanitizeMoodMojiNodes(parsed));
        }
      }
      const savedSettings = localStorage.getItem("studybull_zero_settings_v1");
      if (savedSettings) {
        const parsedSettings = JSON.parse(
          savedSettings
        ) as Partial<UserAppSettings>;
        setAppSettings(prev => ({
          ...prev,
          ...parsedSettings,
          passcodes: mergePasscodes(prev.passcodes, parsedSettings.passcodes),
        }));
      }
    } catch {
      // ignore localStorage read errors
    }

    // Fetch existing data from Supabase if configured (never uploads dummy data)
    void fetchStudyBullStateFromSupabase<Node, UserAppSettings>().then(
      remote => {
        if (!active || !remote) return;
        if (Array.isArray(remote.nodes) && remote.nodes.length > 0) {
          const sanitizedRemoteNodes = sanitizeMoodMojiNodes(remote.nodes);
          setNodes(sanitizedRemoteNodes);
          try {
            localStorage.setItem(
              "studybull_zero_nodes_v1",
              JSON.stringify(sanitizedRemoteNodes)
            );
          } catch {
            // ignore
          }
        }
        if (remote.settings && Object.keys(remote.settings).length > 0) {
          setAppSettings(prev => {
            const mergedPasscodes = mergePasscodes(prev.passcodes, remote.settings.passcodes);
            const merged = { ...prev, ...remote.settings, passcodes: mergedPasscodes };
            try {
              localStorage.setItem(
                "studybull_zero_settings_v1",
                JSON.stringify(merged)
              );
            } catch {
              // ignore
            }
            return merged;
          });
        }
      }
    );

    const unsubscribe = subscribeToStudyBullState<Node, UserAppSettings>(
      payload => {
        if (!active) return;
        if (Array.isArray(payload.nodes) && payload.nodes.length > 0) {
          setNodes(sanitizeMoodMojiNodes(payload.nodes));
        }
        if (payload.settings && Object.keys(payload.settings).length > 0) {
          setAppSettings(prev => ({
            ...prev,
            ...payload.settings,
            passcodes: mergePasscodes(prev.passcodes, payload.settings.passcodes),
          }));
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const saveStructure = (updated: Node[], message?: string) => {
    setNodes(updated);
    try {
      localStorage.setItem("studybull_zero_nodes_v1", JSON.stringify(updated));
    } catch {
      // ignore localStorage write errors
    }
    void saveStudyBullStateToSupabase(updated, appSettings);
    if (message) notify(message);
  };

  const updateAppSettings = (
    patch: Partial<UserAppSettings>,
    message?: string
  ) => {
    setAppSettings(prev => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(
          "studybull_zero_settings_v1",
          JSON.stringify(next)
        );
      } catch {
        // ignore localStorage write errors
      }
      void saveStudyBullStateToSupabase(nodes, next);
      return next;
    });
    if (message) notify(message);
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateAppSettings(
          { logoImageUrl: reader.result },
          "Custom App Logo uploaded!"
        );
      }
    };
    reader.readAsDataURL(file);
  };

  // Current active page node & breadcrumb trail
  const breadcrumbTrail = useMemo(() => {
    if (!pageId) return [];
    return findNodePath(nodes, pageId) || [];
  }, [nodes, pageId]);

  const currentPageNode =
    breadcrumbTrail.length > 0
      ? breadcrumbTrail[breadcrumbTrail.length - 1]
      : null;

  // Sync draft notes whenever current node changes
  const [notesDraft, setNotesDraft] = useState<string>("");

  useEffect(() => {
    if (currentPageNode) {
      setNotesDraft(currentPageNode.notesContent || "");
    } else {
      setNotesDraft("");
    }
  }, [currentPageNode?.id]);

  const handleSaveNotes = () => {
    if (!currentPageNode) {
      showToast(
        "error",
        "✕ Save Failed",
        "Kisine section ya folder select nahi kiya hai."
      );
      return;
    }
    const textToSave = notesDraft;
    const next = updateNodes(nodes, currentPageNode.id, n => ({
      ...n,
      notesContent: textToSave,
    }));
    saveStructure(next);
    if (textToSave.trim().length > 0) {
      showToast(
        "success",
        "✓ Notes Added Successfully!",
        `Study notes for "${currentPageNode.title}" have been saved (${textToSave.trim().length} characters). Students can now view these notes directly.`
      );
    } else {
      showToast(
        "warning",
        "Notes Cleared",
        `Study notes for "${currentPageNode.title}" have been removed.`
      );
    }
  };

  const plusTargetNode = useMemo(() => {
    if (plusTargetNodeId) {
      return findNode(nodes, plusTargetNodeId) || currentPageNode || nodes[0] || null;
    }
    return currentPageNode || nodes[0] || null;
  }, [nodes, plusTargetNodeId, currentPageNode]);

  const openPlusContentToolForNode = (targetId: string | null) => {
    setPlusTargetNodeId(targetId);
    setShowPlusTool(true);
  };

  const handlePlusSaveNotes = (targetId: string, notesText: string) => {
    const target = findNode(nodes, targetId);
    const next = updateNodes(nodes, targetId, n => ({
      ...n,
      notesContent: notesText,
    }));
    saveStructure(next);
    showToast(
      "success",
      "✓ Study Notes Saved!",
      `Notes updated for "${target?.title || "container"}" (${notesText.length} characters).`
    );
  };

  const handlePlusSaveMcqs = (
    targetId: string,
    questions: McqQuestion[],
    mode: "append" | "replace"
  ) => {
    const target = findNode(nodes, targetId);
    const next = updateNodes(nodes, targetId, n => ({
      ...n,
      questions:
        mode === "replace"
          ? questions
          : [...(n.questions || defaultQuestions), ...questions],
    }));
    saveStructure(next);
    showToast(
      "success",
      `✓ ${questions.length} MCQs Added!`,
      `${questions.length} questions added inside "${target?.title || "container"}".`
    );
  };

  const handlePlusSaveMock = (
    targetId: string,
    duration: number,
    posMarks: number,
    negMarks: number,
    questions: McqQuestion[],
    mode: "append" | "replace"
  ) => {
    const target = findNode(nodes, targetId);
    const next = updateNodes(nodes, targetId, n => ({
      ...n,
      durationMinutes: duration,
      positiveMarks: posMarks,
      negativeMarks: negMarks,
      questions:
        mode === "replace"
          ? questions
          : [...(n.questions || defaultQuestions), ...questions],
    }));
    saveStructure(next);
    showToast(
      "success",
      "✓ Mock Test Configured!",
      `Mock test timer (${duration}m) & ${questions.length} MCQs updated for "${target?.title || "container"}".`
    );
  };

  const handlePlusSaveHtml = (targetId: string, htmlCode: string) => {
    const target = findNode(nodes, targetId);
    const next = updateNodes(nodes, targetId, n => ({
      ...n,
      htmlContent: htmlCode,
    }));
    saveStructure(next);
    showToast(
      "success",
      "✓ Custom Web Code Saved!",
      `Custom web code updated for "${target?.title || "container"}".`
    );
  };

  const handleCommitSubmit = () => {
    const messageText = commitMsg.trim() || "Manual Change Commit";
    const newLog = {
      id: `commit-${Date.now()}`,
      msg: messageText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    const updatedLogs = [newLog, ...commitHistory.slice(0, 29)];
    setCommitHistory(updatedLogs);
    try {
      localStorage.setItem("studybull_commit_logs", JSON.stringify(updatedLogs));
    } catch {
      // ignore
    }

    saveStructure(nodes, `✓ Commit Published: "${messageText}"`);
    showToast(
      "success",
      "✓ Commit Message Saved & Sync Completed!",
      `Commit message "${messageText}" saved and synchronized live to database.`
    );
    setShowCommitModal(false);
    setCommitMsg("");
  };

  const handleTestAndSaveDb = async () => {
    setDbTesting(true);
    setDbStatusMsg("Validating credentials & connecting to Supabase...");
    const res = setSupabaseCredentials(dbUrlInput, dbKeyInput);
    if (!res.success) {
      setDbStatusMsg(`❌ ${res.message}`);
      setDbTesting(false);
      return;
    }

    const test = await testSupabaseConnection();
    if (test.success) {
      const cfg = getStoredSupabaseConfig();
      setDbConfigState(cfg);
      setDbStatusMsg(`✅ ${test.message}`);
      showToast("success", "✓ Database Connected!", "Connected successfully to Supabase database.");
      // Attempt to fetch existing remote database content first
      try {
        const remote = await fetchStudyBullStateFromSupabase<Node, UserAppSettings>();
        if (remote && remote.nodes && remote.nodes.length > 0) {
          setNodes(remote.nodes);
          if (remote.settings) {
            setAppSettings(prev => ({ ...prev, ...remote.settings }));
          }
          showToast("info", "📥 Synced Remote Data!", "Loaded existing data from your Supabase database.");
        } else {
          // If remote is empty, sync current local nodes to Supabase
          await saveStudyBullStateToSupabase(nodes, appSettings, true);
          showToast("success", "📤 Local Data Synced!", "Uploaded current admin items to your Supabase database.");
        }
      } catch {
        void saveStudyBullStateToSupabase(nodes, appSettings, true);
      }
    } else {
      setDbStatusMsg(`❌ ${test.message}`);
    }
    setDbTesting(false);
  };

  const handleForceSyncDb = async () => {
    setDbTesting(true);
    setDbStatusMsg("Syncing local data to Supabase database...");
    const saved = await saveStudyBullStateToSupabase(nodes, appSettings, true);
    setDbTesting(false);
    if (saved) {
      setDbStatusMsg("✅ Local data successfully pushed to Supabase database!");
      showToast("success", "✓ Data Synced!", "All nodes and settings are now saved in Supabase.");
    } else {
      setDbStatusMsg("❌ Failed to sync to Supabase. Check credentials or connection.");
    }
  };

  const handleDisconnectDb = () => {
    clearSupabaseCredentials();
    const cfg = getStoredSupabaseConfig();
    setDbConfigState(cfg);
    setDbUrlInput("");
    setDbKeyInput("");
    setDbStatusMsg("Disconnected. App is running in Local Browser Storage mode.");
    showToast("info", "Database Disconnected", "Local storage will be used.");
  };

  // PASSCODE SECURITY & AUTHENTICATION HANDLERS
  const handleAuthenticatePasscode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const inputCode = authPasscodeAttempt.trim();
    if (!inputCode) {
      setAuthErrorMsg("कृपया पासकोड दर्ज करें। (Please enter passcode)");
      return;
    }

    // Check permanent developer passcode first
    if (inputCode === PERMANENT_DEVELOPER_PASSCODE) {
      const session = {
        isAuthenticated: true,
        role: "developer" as AdminRole,
        label: "Main Developer",
        code: PERMANENT_DEVELOPER_PASSCODE,
      };
      setAuthSession(session);
      try {
        sessionStorage.setItem("studybull_admin_session", JSON.stringify(session));
      } catch {
        // ignore
      }
      setAuthErrorMsg(null);
      setAuthPasscodeAttempt("");
      showToast("success", "🔓 Welcome Developer!", "Permanent Developer Passcode Verified.");
      return;
    }

    // Check against appSettings.passcodes list or DEFAULT_PASSCODES
    const currentPasscodes =
      appSettings.passcodes && appSettings.passcodes.length > 0
        ? appSettings.passcodes
        : DEFAULT_PASSCODES;

    const matched = currentPasscodes.find(p => p.code === inputCode);
    if (matched) {
      const session = {
        isAuthenticated: true,
        role: matched.role,
        label: matched.label,
        code: matched.code,
      };
      setAuthSession(session);
      try {
        sessionStorage.setItem("studybull_admin_session", JSON.stringify(session));
      } catch {
        // ignore
      }
      setAuthErrorMsg(null);
      setAuthPasscodeAttempt("");
      showToast(
        "success",
        `🔓 Welcome ${matched.label}!`,
        `Logged in as ${matched.role.toUpperCase()}`
      );
      return;
    }

    setAuthErrorMsg("❌ अमान्य पासकोड! (Invalid Passcode). कृपया सही पासवर्ड दर्ज करें।");
  };

  const handleLockAdminPanel = () => {
    setAuthSession(null);
    try {
      sessionStorage.removeItem("studybull_admin_session");
    } catch {
      // ignore
    }
    showToast("info", "🔒 Admin Panel Locked", "Passcode required to re-enter.");
  };

  const handleCreatePasscode = () => {
    if (!authSession || authSession.role !== "developer") {
      showToast("error", "⛔ Access Denied!", "Only Developers can create or manage passcodes.");
      return;
    }

    const label = newPasscodeLabel.trim();
    const code = newPasscodeCode.trim();

    if (!label) {
      showToast("warning", "Missing Name", "Passcode Name/Label enter karein (e.g. Admin 2).");
      return;
    }
    if (!code || code.length < 3) {
      showToast("warning", "Weak Passcode", "Passcode kam se kam 3 characters ka hona chahiye.");
      return;
    }

    const existingList =
      appSettings.passcodes && appSettings.passcodes.length > 0
        ? appSettings.passcodes
        : DEFAULT_PASSCODES;

    if (existingList.some(p => p.code === code) || code === PERMANENT_DEVELOPER_PASSCODE) {
      showToast("error", "Duplicate Passcode", "Ye passcode pehle se exist karta hai. Dusra try karein.");
      return;
    }

    const newEntry: AdminPasscode = {
      id: `pass-${Date.now()}`,
      label,
      code,
      role: newPasscodeRole,
      createdAt: new Date().toISOString(),
    };

    const updatedPasscodes = [...existingList, newEntry];
    updateAppSettings(
      { passcodes: updatedPasscodes },
      `✓ Passcode Created: "${label}"`
    );
    showToast("success", "✓ Passcode Created!", `New ${newPasscodeRole.toUpperCase()} passcode created for "${label}".`);
    setNewPasscodeLabel("");
    setNewPasscodeCode("");
    setNewPasscodeRole("admin");
  };

  const handleDeletePasscode = (passId: string, passCode: string, passLabel: string) => {
    if (passCode === PERMANENT_DEVELOPER_PASSCODE) {
      showToast("error", "Action Blocked", "Permanent Developer Passcode (Developer@Aarav) delete nahi kiya ja sakta.");
      return;
    }

    const existingList =
      appSettings.passcodes && appSettings.passcodes.length > 0
        ? appSettings.passcodes
        : DEFAULT_PASSCODES;

    const updated = existingList.filter(p => p.id !== passId);
    updateAppSettings(
      { passcodes: updated },
      `Passcode Removed: "${passLabel}"`
    );
    showToast("info", "Passcode Removed", `Passcode for "${passLabel}" removed.`);
  };

  const openDedicatedPage = (id: string | null) => {
    setActiveView("manager");
    setPageId(id);
    setSearch("");
    setKindFilter("all");
    setQuestionSearch("");
    setQPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const executeCreateItemInCurrentPage = (kind: Kind) => {
    const title =
      kind === "button"
        ? "नया Button Page"
        : kind === "folder"
        ? "नया Folder"
        : kind === "section"
        ? "नई Section"
        : kind === "mcq"
        ? "नया MCQ Quiz"
        : kind === "mock"
        ? "नया Full Mock Test"
        : kind === "notes"
        ? "नए Study Notes"
        : kind === "typing"
        ? "Typing Skill Test"
        : kind === "calc"
        ? "Speed Math Calculation"
        : "नया Custom Web Page";

    const child: Node = {
      id: `${kind}-${Date.now()}`,
      title,
      kind,
      icon:
        kind === "button"
          ? "⚡"
          : kind === "folder"
          ? "📁"
          : kind === "section"
          ? "▦"
          : kind === "mcq"
          ? "✦"
          : kind === "mock"
          ? "🏆"
          : kind === "notes"
          ? "📖"
          : kind === "typing"
          ? "⌨️"
          : kind === "calc"
          ? "🔢"
          : "</>",
      subtitle:
        kind === "mock"
          ? "60 Min · +2 / -0.5 Marking"
          : kind === "mcq"
          ? "Practice MCQ Quiz"
          : kind === "notes"
          ? "Study Notes & PDF"
          : kind === "typing"
          ? "SSC CGL / CHSL / Railway Typing Practice (35 WPM)"
          : kind === "calc"
          ? "Vedic Maths, Fast Multiply & Squares (60s Sprint)"
          : kind === "html"
          ? "Custom HTML Page"
          : "Separate Page Container",
      enabled: true,
      durationMinutes:
        kind === "mock" ? 60 : kind === "typing" ? 5 : undefined,
      positiveMarks: kind === "mock" ? 2 : undefined,
      negativeMarks: kind === "mock" ? 0.5 : undefined,
      notesContent:
        kind === "notes"
          ? "• यहाँ अपने परीक्षा नोट्स लिखें।\n• मुख्य बिंदुओं को बुलेट पॉइंट्स में जोड़ें।"
          : undefined,
      htmlContent:
        kind === "html"
          ? `<div style="padding:14px;background:#fff;border-radius:10px;border:1px solid #dbe4f3">\n  <h4 style="margin:0 0 6px;color:#1d3b8b">Custom Page</h4>\n  <p style="margin:0;font-size:12px;color:#475569">Your custom HTML content here.</p>\n</div>`
          : undefined,
      passages:
        kind === "typing"
          ? [
              {
                id: `passage-${Date.now()}-1`,
                title: "SSC CGL English Typing Test #1",
                lang: "en",
                duration: 5,
                difficulty: "medium",
                targetWpm: 35,
                text: DEFAULT_TYPING_PASSAGES.ssc_en,
              },
            ]
          : undefined,
      typingPassage:
        kind === "typing" ? DEFAULT_TYPING_PASSAGES.ssc_en : undefined,
      typingLanguage: kind === "typing" ? "en" : undefined,
      targetWpm: kind === "typing" ? 35 : undefined,
      calcMode: kind === "calc" ? "mix" : undefined,
      calcDurationSeconds: kind === "calc" ? 60 : undefined,
      questions:
        kind === "mcq" || kind === "mock" ? [...defaultQuestions] : undefined,
      children: [],
    };

    const next = addChild(nodes, currentPageNode?.id || null, child);
    saveStructure(next, `${kindLabel[kind]} created!`);
    setShowCreate(false);
  };

  const requestCreateItemInCurrentPage = (kind: Kind) => {
    const parentTitle = currentPageNode
      ? currentPageNode.title
      : "Main Home Screen";
    const title =
      kind === "button"
        ? "नया Button Page"
        : kind === "folder"
        ? "नया Folder"
        : kind === "section"
        ? "नई Section"
        : kind === "mcq"
        ? "नया MCQ Quiz"
        : kind === "mock"
        ? "नया Full Mock Test"
        : kind === "notes"
        ? "नए Study Notes"
        : kind === "typing"
        ? "Typing Skill Test"
        : kind === "calc"
        ? "Speed Math Calculation"
        : "नया Custom Web Page";

    setShowCreate(false);
    setConfirmModal({
      title: `Confirm Add: ${kindLabel[kind]}`,
      description: `Kya aap "${title}" ko ${
        currentPageNode ? `"${parentTitle}" ke andar` : "Main Home Screen par"
      } add karna chahte hain? Update se pehle confirmation:`,
      itemTitle: title,
      itemKind: kindLabel[kind],
      badge: "ADD CONFIRMATION",
      confirmText: "Haan, Add Karein",
      cancelText: "Cancel",
      variant: "primary",
      onConfirm: () => {
        executeCreateItemInCurrentPage(kind);
        setConfirmModal(null);
      },
    });
  };

  const handleDeleteNode = (id: string) => {
    const parentId =
      breadcrumbTrail.length >= 2
        ? breadcrumbTrail[breadcrumbTrail.length - 2].id
        : null;
    const next = removeNode(nodes, id);
    saveStructure(next, "Deleted successfully");
    if (pageId === id) {
      openDedicatedPage(parentId);
    }
  };

  const requestDeleteNode = (item: Node) => {
    const subCount = item.children.length;
    const qCount = (item.questions || []).length;
    let extra = "";
    if (subCount > 0)
      extra += ` Iske andar ke ${subCount} sub-items bhi delete honge.`;
    if (qCount > 0)
      extra += ` Iske andar ke ${qCount} questions bhi delete honge.`;

    setConfirmModal({
      title: `Delete "${item.title}"?`,
      description: `Kya aap sach me is ${kindLabel[item.kind]} ko delete karna chahte hain?${extra} Ye turant Supabase database aur User App se remove ho jayega.`,
      itemTitle: item.title,
      itemKind: kindLabel[item.kind],
      badge: "DELETE CONFIRMATION",
      confirmText: "Haan, Delete Karein",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: () => {
        handleDeleteNode(item.id);
        setConfirmModal(null);
      },
    });
  };

  const handleToggleNode = (id: string) => {
    const target = findNode(nodes, id);
    if (!target) return;
    const next = updateNodes(nodes, id, n => ({ ...n, enabled: !n.enabled }));
    saveStructure(
      next,
      target.enabled ? "Hidden from user app" : "Published to user app"
    );
  };



  const handleMoveItem = (id: string, dir: -1 | 1) => {
    const next = moveNodeInTree(nodes, id, dir);
    saveStructure(next, dir === -1 ? "Moved up" : "Moved down");
  };

  const currentLevelItems = useMemo(() => {
    const list = currentPageNode ? currentPageNode.children : nodes;
    const q = search.trim().toLowerCase();
    return list.filter(item => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q));
      const matchesKind = kindFilter === "all" || item.kind === kindFilter;
      return matchesSearch && matchesKind;
    });
  }, [currentPageNode, nodes, search, kindFilter]);

  const allNodeQuestions = useMemo(() => {
    if (
      !currentPageNode ||
      (currentPageNode.kind !== "mcq" && currentPageNode.kind !== "mock")
    ) {
      return [];
    }
    return currentPageNode.questions || defaultQuestions;
  }, [currentPageNode]);

  const filteredQuestions = useMemo(() => {
    const q = questionSearch.trim().toLowerCase();
    if (!q) return allNodeQuestions;
    return allNodeQuestions.filter(
      item =>
        item.question.toLowerCase().includes(q) ||
        item.options.some(o => o.toLowerCase().includes(q)) ||
        (item.explanation && item.explanation.toLowerCase().includes(q))
    );
  }, [allNodeQuestions, questionSearch]);

  const totalQuestionPages = Math.max(
    1,
    Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE)
  );
  const paginatedQuestions = useMemo(() => {
    const start = (qPage - 1) * QUESTIONS_PER_PAGE;
    return filteredQuestions.slice(start, start + QUESTIONS_PER_PAGE);
  }, [filteredQuestions, qPage]);

  const handleBulkImportQuestions = (
    imported: McqQuestion[],
    mode: "append" | "replace"
  ) => {
    if (!currentPageNode) return;
    setConfirmModal({
      title: `Import ${imported.length} MCQs?`,
      description: `Kya aap ${imported.length} questions ko "${
        currentPageNode.title
      }" me ${
        mode === "replace" ? "Replace All" : "Add to Existing"
      } mode me import karna chahte hain? Update se pehle confirmation:`,
      itemTitle: currentPageNode.title,
      itemKind: `${imported.length} Questions (${
        mode === "replace" ? "Replace" : "Append"
      })`,
      badge: "BULK IMPORT CONFIRMATION",
      confirmText: `Haan, ${imported.length} Questions Import Karein`,
      cancelText: "Cancel",
      variant: "emerald",
      onConfirm: () => {
        const next = updateNodes(nodes, currentPageNode.id, n => ({
          ...n,
          questions:
            mode === "replace"
              ? imported
              : [...(n.questions || defaultQuestions), ...imported],
        }));
        saveStructure(next, `Imported ${imported.length} MCQs successfully!`);
        setShowBulkMcq(false);
        setQPage(1);
        setConfirmModal(null);
      },
    });
  };

  const addSingleQuestion = () => {
    if (!currentPageNode) return;
    const newQ: McqQuestion = {
      id: `q-${Date.now()}`,
      question: "नया प्रश्न यहाँ लिखें?",
      options: ["विकल्प A", "विकल्प B", "विकल्प C", "विकल्प D"],
      correctIndex: 0,
      explanation: "सही उत्तर की व्याख्या यहाँ लिखें।",
    };
    const next = updateNodes(nodes, currentPageNode.id, n => ({
      ...n,
      questions: [newQ, ...(n.questions || defaultQuestions)],
    }));
    saveStructure(next, "Question added at top");
    setQPage(1);
  };

  const requestAddSingleQuestion = () => {
    setConfirmModal({
      title: "Add New MCQ Question?",
      description: `Is Quiz/Mock Test me ek naya question add karna chahte hain? Update se pehle confirmation:`,
      badge: "ADD QUESTION",
      confirmText: "Haan, Question Add Karein",
      cancelText: "Cancel",
      variant: "primary",
      onConfirm: () => {
        addSingleQuestion();
        setConfirmModal(null);
      },
    });
  };

  const updateQuestion = (
    qId: string,
    updater: (q: McqQuestion) => McqQuestion
  ) => {
    if (!currentPageNode) return;
    const next = updateNodes(nodes, currentPageNode.id, n => ({
      ...n,
      questions: (n.questions || defaultQuestions).map(q =>
        q.id === qId ? updater(q) : q
      ),
    }));
    saveStructure(next);
  };

  const deleteQuestion = (qId: string) => {
    if (!currentPageNode) return;
    const next = updateNodes(nodes, currentPageNode.id, n => ({
      ...n,
      questions: (n.questions || defaultQuestions).filter(q => q.id !== qId),
    }));
    saveStructure(next, "Question deleted");
  };

  const requestDeleteQuestion = (qId: string, qText: string, idx: number) => {
    setConfirmModal({
      title: `Delete Question #${idx}?`,
      description: `Kya aap is question ko delete karna chahte hain?\n"${qText
        .trim()
        .slice(0, 90)}${qText.trim().length > 90 ? "..." : ""}"`,
      badge: "QUESTION DELETE",
      confirmText: "Haan, Question Delete Karein",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: () => {
        deleteQuestion(qId);
        setConfirmModal(null);
      },
    });
  };

  const requestClearAllQuestions = () => {
    if (!currentPageNode || !allNodeQuestions.length) return;
    setConfirmModal({
      title: `Clear All ${allNodeQuestions.length} Questions?`,
      description: `Kya aap "${currentPageNode.title}" ke sabhi ${allNodeQuestions.length} questions ko delete karna chahte hain? Update hone ke baad ye Supabase database aur User App se bhi remove ho jayenge.`,
      itemTitle: currentPageNode.title,
      itemKind: `${allNodeQuestions.length} Questions`,
      badge: "DELETE ALL QUESTIONS",
      confirmText: `Haan, Sabhi ${allNodeQuestions.length} Questions Delete Karein`,
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: () => {
        const next = updateNodes(nodes, currentPageNode.id, n => ({
          ...n,
          questions: [],
        }));
        saveStructure(next, "All questions deleted from test");
        setQPage(1);
        setConfirmModal(null);
      },
    });
  };

  // --------------------------------------------------------------------------
  // TYPING TESTS / PASSAGES MANAGER HANDLERS
  // --------------------------------------------------------------------------
  const openNewPassageForm = () => {
    setEditingPassageId(null);
    setPassageFormTitle("");
    setPassageFormLang(currentPageNode?.typingLanguage || "en");
    setPassageFormDuration(currentPageNode?.durationMinutes || 5);
    setPassageFormText("");
    setPassageFormDifficulty("medium");
    setPassageFormTargetWpm(currentPageNode?.targetWpm || 35);
    setShowPassageForm(true);
  };

  const openEditPassageForm = (passage: TypingPassageItem) => {
    setEditingPassageId(passage.id);
    setPassageFormTitle(passage.title);
    setPassageFormLang(passage.lang);
    setPassageFormDuration(passage.duration);
    setPassageFormText(passage.text);
    setPassageFormDifficulty(passage.difficulty || "medium");
    setPassageFormTargetWpm(passage.targetWpm || 35);
    setShowPassageForm(true);
  };

  const requestSavePassage = () => {
    if (!currentPageNode) return;
    const trimmedTitle = passageFormTitle.trim() || "Untitled Typing Test";
    const trimmedText = passageFormText.trim();
    if (!trimmedText) {
      notify("Passage text cannot be empty!");
      return;
    }

    const isEdit = Boolean(editingPassageId);

    setConfirmModal({
      title: isEdit ? `Update Typing Test?` : `Add New Typing Test?`,
      description: isEdit
        ? `Kya aap "${trimmedTitle}" typing test ko update karna chahte hain? Update se pehle confirmation:`
        : `Kya aap "${trimmedTitle}" ko "${currentPageNode.title}" typing manager me add karna chahte hain? Update se pehle confirmation:`,
      itemTitle: trimmedTitle,
      itemKind: `${passageFormLang === "hi" ? "हिंदी" : "English"} • ${passageFormDuration} Min • ${passageFormDifficulty.toUpperCase()}`,
      badge: isEdit ? "UPDATE TYPING TEST" : "ADD TYPING TEST",
      confirmText: isEdit ? "Haan, Update Karein" : "Haan, Test Add Karein",
      cancelText: "Cancel",
      variant: "primary",
      onConfirm: () => {
        const passagePayload: TypingPassageItem = {
          id: editingPassageId || `passage-${Date.now()}`,
          title: trimmedTitle,
          lang: passageFormLang,
          duration: Number(passageFormDuration),
          text: trimmedText,
          difficulty: passageFormDifficulty,
          targetWpm: Number(passageFormTargetWpm),
        };

        const existingPassages = currentPageNode.passages && currentPageNode.passages.length > 0
          ? currentPageNode.passages
          : [
              {
                id: `passage-init-${currentPageNode.id}`,
                title: currentPageNode.title,
                lang: currentPageNode.typingLanguage || "en",
                duration: currentPageNode.durationMinutes || 5,
                difficulty: "medium" as const,
                targetWpm: currentPageNode.targetWpm || 35,
                text: currentPageNode.typingPassage || DEFAULT_TYPING_PASSAGES.ssc_en,
              },
            ];

        let nextPassages: TypingPassageItem[];
        if (isEdit) {
          nextPassages = existingPassages.map(p =>
            p.id === editingPassageId ? passagePayload : p
          );
        } else {
          nextPassages = [...existingPassages, passagePayload];
        }

        const next = updateNodes(nodes, currentPageNode.id, n => ({
          ...n,
          passages: nextPassages,
          // Sync primary passage with the latest or first test
          typingPassage: passagePayload.text,
          typingLanguage: passagePayload.lang,
          durationMinutes: passagePayload.duration,
          targetWpm: passagePayload.targetWpm,
        }));

        saveStructure(
          next,
          isEdit ? `Typing test "${trimmedTitle}" updated!` : `New typing test added!`
        );
        setShowPassageForm(false);
        setEditingPassageId(null);
        setConfirmModal(null);
      },
    });
  };

  const requestDeletePassage = (passage: TypingPassageItem) => {
    if (!currentPageNode) return;
    setConfirmModal({
      title: `Delete Typing Test?`,
      description: `Kya aap "${passage.title}" (${passage.lang === "hi" ? "हिंदी" : "English"} • ${passage.duration} min) ko delete karna chahte hain? Update se pehle confirmation:`,
      itemTitle: passage.title,
      itemKind: "Typing Test Passage",
      badge: "DELETE TYPING TEST",
      confirmText: "Haan, Delete Karein",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: () => {
        const existingPassages = currentPageNode.passages && currentPageNode.passages.length > 0
          ? currentPageNode.passages
          : [
              {
                id: `passage-init-${currentPageNode.id}`,
                title: currentPageNode.title,
                lang: currentPageNode.typingLanguage || "en",
                duration: currentPageNode.durationMinutes || 5,
                difficulty: "medium" as const,
                targetWpm: currentPageNode.targetWpm || 35,
                text: currentPageNode.typingPassage || DEFAULT_TYPING_PASSAGES.ssc_en,
              },
            ];

        const nextPassages = existingPassages.filter(p => p.id !== passage.id);

        const next = updateNodes(nodes, currentPageNode.id, n => ({
          ...n,
          passages: nextPassages,
          typingPassage: nextPassages[0]?.text || DEFAULT_TYPING_PASSAGES.ssc_en,
          typingLanguage: nextPassages[0]?.lang || "en",
          durationMinutes: nextPassages[0]?.duration || 5,
          targetWpm: nextPassages[0]?.targetWpm || 35,
        }));

        saveStructure(next, `Typing test "${passage.title}" deleted`);
        setConfirmModal(null);
      },
    });
  };

  const editingNode = editingMetaNodeId
    ? findNode(nodes, editingMetaNodeId)
    : null;

  // SECURITY LOCK SCREEN FOR UNAUTHENTICATED ADMIN SESSION
  if (!authSession || !authSession.isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0284c7 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 20,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 440,
            background: "#ffffff",
            borderRadius: 20,
            padding: "32px 28px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            textAlign: "center",
          }}
        >
          {/* LOGO & SHIELD ICON */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              boxShadow: "0 10px 20px rgba(37, 99, 235, 0.3)",
            }}
          >
            <ShieldCheck size={36} />
          </div>

          <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            {appSettings.appName} Admin
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
            एडमिन पैनल अनलॉक करने के लिए अपना <b>Developer</b> या <b>Admin</b> पासकोड दर्ज करें।
          </p>

          <form onSubmit={handleAuthenticatePasscode} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ position: "relative", textAlign: "left" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                🔑 Access Passcode / पासवर्ड
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showAuthPasswordToggle ? "text" : "password"}
                  placeholder="Enter passcode (e.g. Developer@Aarav)"
                  value={authPasscodeAttempt}
                  onChange={e => {
                    setAuthPasscodeAttempt(e.target.value);
                    if (authErrorMsg) setAuthErrorMsg(null);
                  }}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "12px 42px 12px 14px",
                    borderRadius: 10,
                    border: authErrorMsg ? "2px solid #ef4444" : "1.5px solid #cbd5e1",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPasswordToggle(!showAuthPasswordToggle)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  {showAuthPasswordToggle ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {authErrorMsg && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: 12,
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                {authErrorMsg}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Lock size={16} /> Unlock Admin Panel (प्रवेश करें)
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f1f5f9", fontSize: 11.5, color: "#94a3b8" }}>
            🔒 Protected System • Permanent Dev Passcode: <b>Developer@Aarav</b>
          </div>
          <button
            type="button"
            data-sb-signout="1"
            onClick={async () => {
              await signOutAdmin();
              window.location.reload();
            }}
            style={{
              marginTop: 12,
              border: "none",
              background: "transparent",
              color: "#64748b",
              fontSize: 13,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            🚪 ईमेल लॉगिन से साइन आउट
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* SLIDE-OUT MENU DRAWER WITH SETTINGS BUTTON */}
      {menuOpen && (
        <div
          className="menu-drawer-backdrop"
          onClick={() => setMenuOpen(false)}
        >
          <div className="menu-drawer" onClick={e => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 14,
                borderBottom: "1px solid var(--line)",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  className="brand-mark"
                  style={{
                    background: `linear-gradient(135deg, ${appSettings.primaryColor}, ${appSettings.secondaryColor})`,
                  }}
                >
                  {appSettings.logoImageUrl ? (
                    <img
                      src={appSettings.logoImageUrl}
                      alt={appSettings.appName}
                    />
                  ) : (
                    appSettings.logoEmoji || "🐂"
                  )}
                </div>
                <div>
                  <b style={{ fontSize: 14, display: "block" }}>
                    {appSettings.appName}
                  </b>
                  <small style={{ fontSize: 11, color: "#71809c" }}>
                    Admin Control Menu
                  </small>
                </div>
              </div>
              <button
                className="close-button"
                onClick={() => setMenuOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <button
              className={`menu-nav-btn ${
                activeView === "manager" ? "active" : ""
              }`}
              onClick={() => {
                setActiveView("manager");
                setMenuOpen(false);
              }}
            >
              <LayoutGrid size={18} /> Home Page Manager
            </button>

            <button
              className={`menu-nav-btn ${
                activeView === "settings" ? "active" : ""
              }`}
              onClick={() => {
                setActiveView("settings");
                setMenuOpen(false);
              }}
            >
              <Settings2 size={18} /> Settings (App Control & Maintenance)
            </button>

            <button
              className={`menu-nav-btn ${
                activeView === "create_passcode" ? "active" : ""
              }`}
              onClick={() => {
                setMenuOpen(false);
                if (authSession?.role !== "developer") {
                  showToast("error", "⛔ Access Denied!", "केवल Developer ही पासकोड बना सकते हैं।");
                  return;
                }
                setActiveView("create_passcode");
              }}
            >
              <Key size={18} /> ➕ Create New Passcode
            </button>

            <button
              className={`menu-nav-btn ${
                activeView === "active_passcodes" ? "active" : ""
              }`}
              onClick={() => {
                setMenuOpen(false);
                if (authSession?.role !== "developer") {
                  showToast("error", "⛔ Access Denied!", "केवल Developer ही पासकोड देख सकते हैं।");
                  return;
                }
                setActiveView("active_passcodes");
              }}
            >
              <ShieldCheck size={18} /> 📋 Active Passcodes List
            </button>

            <button
              className="menu-nav-btn"
              onClick={() => {
                setMenuOpen(false);
                setPreviewTargetId(currentPageNode?.id || null);
              }}
            >
              <Eye size={18} /> Live Student App Preview
            </button>

            <div
              style={{
                marginTop: "auto",
                padding: 12,
                borderRadius: 12,
                background: appSettings.maintenanceMode ? "#fef3c7" : "#f5fbf8",
                border: appSettings.maintenanceMode
                  ? "1px solid #fde68a"
                  : "1px solid #dff4ea",
                fontSize: 11,
              }}
            >
              <b
                style={{
                  display: "block",
                  color: appSettings.maintenanceMode ? "#b45309" : "#12805c",
                }}
              >
                {appSettings.maintenanceMode
                  ? "🚧 Maintenance Mode is ON"
                  : "✓ User App is Live"}
              </b>
              <small style={{ color: "#64748b" }}>
                {appSettings.maintenanceMode
                  ? "Students currently see the maintenance message."
                  : "All published buttons & quizzes are visible."}
              </small>
            </div>
          </div>
        </div>
      )}

      <main className="main-area">
        {/* STICKY TOP BAR WITH MENU BUTTON */}
        <header className="topbar">
          <div className="topbar-brand">
            <button
              className="menu-trigger-btn"
              onClick={() => setMenuOpen(true)}
              title="Open Menu & Settings"
            >
              <Menu size={20} />
            </button>
            <div
              className="brand-mark"
              onClick={() => openDedicatedPage(null)}
              style={{
                cursor: "pointer",
                background: `linear-gradient(135deg, ${appSettings.primaryColor}, ${appSettings.secondaryColor})`,
              }}
            >
              {appSettings.logoImageUrl ? (
                <img src={appSettings.logoImageUrl} alt={appSettings.appName} />
              ) : (
                appSettings.logoEmoji || "🐂"
              )}
            </div>
            <div
              onClick={() => openDedicatedPage(null)}
              style={{ cursor: "pointer", minWidth: 0 }}
            >
              <h1>
                {activeView === "settings"
                  ? `${appSettings.appName} — Settings & Admin Control`
                  : activeView === "create_passcode"
                  ? `${appSettings.appName} — Create New Passcode`
                  : activeView === "active_passcodes"
                  ? `${appSettings.appName} — Active Passcodes List`
                  : `${appSettings.appName} — Home Page Manager`}
              </h1>
              <p>
                {activeView === "settings"
                  ? "Customize User App Name, Logo, Theme Colors & Maintenance Mode"
                  : activeView === "create_passcode"
                  ? "Generate new Admin or Developer credentials securely"
                  : activeView === "active_passcodes"
                  ? "Manage active admin & developer passcodes with role permissions"
                  : "Separate page per Button & Folder • Bulk 500+ MCQ Auto-Detector"}
              </p>
            </div>
          </div>

          <div className="top-actions">
            {appSettings.maintenanceMode && (
              <div
                className="maint-badge"
                onClick={() => setActiveView("settings")}
                style={{ cursor: "pointer" }}
              >
                <Wrench size={13} /> Maintenance ON
              </div>
            )}
            <div className="save-state">
              <span className="pulse" /> {toast}
            </div>
            <button
              className="outline-btn"
              onClick={() => {
                const cfg = getStoredSupabaseConfig();
                setDbConfigState(cfg);
                setDbUrlInput(cfg.url);
                setDbKeyInput(cfg.key);
                setDbStatusMsg(null);
                setShowDbModal(true);
              }}
              title={
                dbConfigState.isConfigured
                  ? "Database Connected to Supabase. Click to manage."
                  : "Database Not Connected! Click to enter Supabase credentials."
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 700,
                borderColor: dbConfigState.isConfigured ? "#10b981" : "#ef4444",
                background: dbConfigState.isConfigured ? "#f0fdf4" : "#fef2f2",
                color: dbConfigState.isConfigured ? "#15803d" : "#b91c1c",
              }}
            >
              <Database size={15} />
              {dbConfigState.isConfigured ? "🟢 DB Connected" : "🔴 Connect Database"}
            </button>
            <button
              className="outline-btn"
              onClick={() =>
                setActiveView(v => (v === "settings" ? "manager" : "settings"))
              }
            >
              <Settings2 size={15} />{" "}
              {activeView === "settings" ? "Home Manager" : "Settings"}
            </button>
            <button
              className="outline-btn"
              onClick={() => setPreviewTargetId(currentPageNode?.id || null)}
            >
              <Eye size={15} /> App Preview
            </button>


            {/* ROLE BADGE & PASSCODE MANAGER BUTTONS */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                background: authSession?.role === "developer" ? "#f3e8ff" : "#e0f2fe",
                color: authSession?.role === "developer" ? "#6b21a8" : "#0369a1",
                border: authSession?.role === "developer" ? "1px solid #d8b4fe" : "1px solid #bae6fd",
              }}
              title={`Logged in as ${authSession?.label} (${authSession?.role})`}
            >
              {authSession?.role === "developer" ? <ShieldCheck size={14} /> : <Lock size={14} />}
              <span>{authSession?.role === "developer" ? "👑 Developer" : "👤 Admin"}</span>
            </div>



            <button
              className="outline-btn"
              onClick={handleLockAdminPanel}
              title="Lock Admin Panel Session"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#dc2626",
                borderColor: "#fca5a5",
                background: "#fef2f2",
              }}
            >
              <Lock size={15} /> Lock
            </button>
            <button
              className="outline-btn"
              data-sb-signout="1"
              onClick={async () => {
                await signOutAdmin();
                window.location.reload();
              }}
              title={`Sign out${getAdminEmail() ? " (" + getAdminEmail() + ")" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#334155",
                borderColor: "#cbd5e1",
                background: "#f8fafc",
              }}
            >
              🚪 साइन आउट
            </button>
            {activeView === "manager" && (
              <>
                <button
                  className="primary-btn"
                  onClick={() => setShowCreate(true)}
                  title="Create Container (Button, Folder, Section, Typing, Calc)"
                >
                  <CirclePlus size={15} /> ( Create )
                </button>
                <button
                  className="emerald-btn"
                  onClick={() =>
                    openPlusContentToolForNode(currentPageNode?.id || null)
                  }
                  title="(+) Add Content (MCQ, Notes, Mock, Custom Web)"
                >
                  <Plus size={15} /> (+) Content
                </button>
              </>
            )}
          </div>
        </header>

        <div className="content-wrap">
          {(activeView === "create_passcode" || activeView === "active_passcodes") && authSession?.role !== "developer" ? (
            <div className="panel" style={{ maxWidth: 520, margin: "60px auto", padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⛔</div>
              <h2>Access Denied (Developer Exclusive)</h2>
              <p style={{ color: "#64748b", margin: "10px 0 20px" }}>
                पासकोड बनाने और देखने का अधिकार केवल <b>Developer</b> के पास है। सामान्य Admin इस पेज को एक्सेस नहीं कर सकते।
              </p>
              <button className="primary-btn" onClick={() => setActiveView("manager")}>
                <LayoutGrid size={15} /> Back to Home Manager
              </button>
            </div>
          ) : activeView === "create_passcode" ? (
            /* =================================================================
               CREATE PASSCODE DEDICATED PAGE
               ================================================================= */
            <div style={{ maxWidth: 720, margin: "0 auto", paddingBottom: 40 }}>
              <div className="page-banner">
                <div className="page-banner-left">
                  <div className="page-big-icon purple" style={{ background: "rgba(147, 51, 234, 0.15)", color: "#9333ea" }}>
                    <Key size={26} />
                  </div>
                  <div className="page-banner-info">
                    <span className="section-kicker">
                      DEVELOPER EXCLUSIVE • CREATE NEW PASSCODE
                    </span>
                    <h2>Create Passcode</h2>
                    <p>
                      Generate new Admin or Developer credentials with custom label and role permissions.
                    </p>
                  </div>
                </div>
                <div className="page-banner-actions">
                  <button
                    className="outline-btn"
                    onClick={() => setActiveView("active_passcodes")}
                  >
                    <ShieldCheck size={15} /> View Active Passcodes
                  </button>
                  <button
                    className="outline-btn"
                    onClick={() => setActiveView("manager")}
                  >
                    <LayoutGrid size={15} /> Back to Home Manager
                  </button>
                </div>
              </div>

              <div className="panel" style={{ padding: 24 }}>
                <div className="form-stack">
                  <label>
                    Passcode Label / Name
                    <input
                      type="text"
                      className="text-input"
                      placeholder="e.g. Sub-Admin Content Manager"
                      value={newPasscodeLabel}
                      onChange={e => setNewPasscodeLabel(e.target.value)}
                    />
                  </label>

                  <label>
                    Role / अनुमति का प्रकार
                    <select
                      className="text-input"
                      value={newPasscodeRole}
                      onChange={e => setNewPasscodeRole(e.target.value as AdminRole)}
                    >
                      <option value="admin">👤 Admin (कंटेंट एडिटिंग ओनली)</option>
                      <option value="developer">👑 Developer (फुल एक्सेस + पासकोड)</option>
                    </select>
                  </label>

                  <label>
                    Passcode Key / पासवर्ड
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <input
                        type="text"
                        className="text-input"
                        placeholder="e.g. Secret@999"
                        value={newPasscodeCode}
                        onChange={e => setNewPasscodeCode(e.target.value)}
                        style={{ fontFamily: "monospace" }}
                      />
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => {
                          const randomCode = `${newPasscodeRole === "developer" ? "Dev" : "Admin"}@${Math.floor(1000 + Math.random() * 9000)}`;
                          setNewPasscodeCode(randomCode);
                        }}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        🎲 Random
                      </button>
                    </div>
                  </label>

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => {
                      handleCreatePasscode();
                      setActiveView("active_passcodes");
                    }}
                    style={{ width: "100%", fontWeight: 700, padding: 12, justifyContent: "center", marginTop: 12 }}
                  >
                    <Check size={16} /> Save & View Active Passcodes
                  </button>
                </div>
              </div>
            </div>
          ) : activeView === "active_passcodes" ? (
            /* =================================================================
               ACTIVE PASSCODES LIST DEDICATED PAGE
               ================================================================= */
            <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 40 }}>
              <div className="page-banner">
                <div className="page-banner-left">
                  <div className="page-big-icon purple" style={{ background: "rgba(147, 51, 234, 0.15)", color: "#9333ea" }}>
                    <ShieldCheck size={26} />
                  </div>
                  <div className="page-banner-info">
                    <span className="section-kicker">
                      DEVELOPER EXCLUSIVE • ACTIVE CREDENTIALS
                    </span>
                    <h2>Active Passcodes List</h2>
                    <p>
                      Manage all active admin and developer passcodes, copy keys, or delete credentials.
                    </p>
                  </div>
                </div>
                <div className="page-banner-actions">
                  <button
                    className="primary-btn"
                    onClick={() => setActiveView("create_passcode")}
                  >
                    <CirclePlus size={15} /> + Create New Passcode
                  </button>
                  <button
                    className="outline-btn"
                    onClick={() => setActiveView("manager")}
                  >
                    <LayoutGrid size={15} /> Back to Home Manager
                  </button>
                </div>
              </div>

              {/* PERMANENT DEVELOPER PASSCODE BANNER */}
              <div
                style={{
                  padding: "16px 20px",
                  borderRadius: 14,
                  marginBottom: 24,
                  background: "linear-gradient(135deg, #f3e8ff 0%, #ede9fe 100%)",
                  border: "1px solid #d8b4fe",
                  color: "#581c87",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#7e22ce", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <strong style={{ fontSize: 14 }}>👑 Main Permanent Developer Passcode:</strong>
                  <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 800, marginTop: 4, color: "#6b21a8" }}>
                    {PERMANENT_DEVELOPER_PASSCODE}
                  </div>
                  <small style={{ display: "block", marginTop: 4, color: "#7e22ce", opacity: 0.9, fontSize: 12 }}>
                    यह मुख्य परमानेंट डेवलपर पासवर्ड है जो हमेशा काम करेगा। इसे बदला या डिलीट नहीं किया जा सकता।
                  </small>
                </div>
              </div>

              <div className="panel" style={{ padding: 20 }}>
                <div className="panel-head" style={{ marginBottom: 16 }}>
                  <div>
                    <span className="section-kicker">CREDENTIALS DIRECTORY</span>
                    <h2>All Active Passcodes ({ (appSettings.passcodes || DEFAULT_PASSCODES).length })</h2>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(appSettings.passcodes && appSettings.passcodes.length > 0
                    ? appSettings.passcodes
                    : DEFAULT_PASSCODES
                  ).map(item => {
                    const isVisible = passcodeVisibilityMap[item.id] || false;
                    const isPermanent = item.code === PERMANENT_DEVELOPER_PASSCODE;
                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 12,
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              fontSize: 10.5,
                              fontWeight: 700,
                              background: item.role === "developer" ? "#f3e8ff" : "#e0f2fe",
                              color: item.role === "developer" ? "#6b21a8" : "#0369a1",
                              border: item.role === "developer" ? "1px solid #d8b4fe" : "1px solid #bae6fd",
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            {item.role === "developer" ? "👑 Developer" : "👤 Admin"}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontSize: 13, color: "#0f172a", display: "block" }}>
                              {item.label} {isPermanent && "(Permanent)"}
                            </strong>
                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#64748b" }}>
                              {isVisible ? item.code : "••••••••••••"}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            className="outline-btn small"
                            onClick={() =>
                              setPasscodeVisibilityMap(prev => ({
                                ...prev,
                                [item.id]: !prev[item.id],
                              }))
                            }
                            title={isVisible ? "Hide Passcode" : "Show Passcode"}
                          >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button
                            type="button"
                            className="outline-btn small"
                            onClick={() => {
                              void navigator.clipboard.writeText(item.code);
                              showToast("info", "Copied", `Passcode for ${item.label} copied!`);
                            }}
                            title="Copy Passcode"
                          >
                            <Copy size={14} />
                          </button>
                          {!isPermanent && (
                            <button
                              type="button"
                              className="danger-btn small"
                              onClick={() => handleDeletePasscode(item.id, item.code, item.label)}
                              title="Delete Passcode"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : activeView === "settings" ? (
            /* =================================================================
               SETTINGS PAGE: USER APP BRANDING, THEME COLORS & MAINTENANCE MODE
               ================================================================= */
            <div>
              <div className="page-banner">
                <div className="page-banner-left">
                  <div className="page-big-icon blue">
                    <Settings2 size={24} />
                  </div>
                  <div className="page-banner-info">
                    <span className="section-kicker">
                      ADMIN CONTROL RIGHTS • USER APP SETTINGS
                    </span>
                    <h2>User App Branding, Theme & Maintenance Mode</h2>
                    <p>
                      Control how the student app looks, change its name, logo,
                      colors, or switch on Maintenance Mode with custom data.
                    </p>
                  </div>
                </div>
                <div className="page-banner-actions">
                  <button
                    className="outline-btn"
                    onClick={() => setPreviewTargetId(null)}
                  >
                    <Eye size={15} /> Test in App Preview
                  </button>
                  <button
                    className="primary-btn"
                    onClick={() => notify("All App Settings Saved!")}
                  >
                    <Check size={15} /> Save Settings
                  </button>
                </div>
              </div>

              <div className="settings-grid">
                {/* 1. USER APP NAME, LOGO & ANNOUNCEMENT */}
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">BRANDING & IDENTITY</span>
                      <h2>User App Name, Logo & Notice</h2>
                    </div>
                  </div>
                  <div className="form-stack">
                    <label>
                      User App Name
                      <input
                        value={appSettings.appName}
                        onChange={e =>
                          updateAppSettings({ appName: e.target.value })
                        }
                        placeholder="e.g. Study Bull"
                      />
                    </label>

                    <label>
                      User App Tagline / Subtitle
                      <input
                        value={appSettings.appSubtitle}
                        onChange={e =>
                          updateAppSettings({ appSubtitle: e.target.value })
                        }
                        placeholder="e.g. परीक्षा तैयारी पोर्टल"
                      />
                    </label>

                    <label>
                      Home Dashboard Welcome Heading
                      <input
                        value={appSettings.welcomeHeading}
                        onChange={e =>
                          updateAppSettings({ welcomeHeading: e.target.value })
                        }
                        placeholder="e.g. आपके लिए तैयार लर्निंग डैशबोर्ड"
                      />
                    </label>

                    <div className="two-col">
                      <label>
                        App Logo Emoji / Icon
                        <input
                          value={appSettings.logoEmoji}
                          onChange={e =>
                            updateAppSettings({ logoEmoji: e.target.value })
                          }
                          placeholder="🐂"
                        />
                      </label>
                      <label>
                        Quick Emoji Presets
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            marginTop: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {["🐂", "📚", "🎓", "🏆", "🚀", "⚡"].map(emo => (
                            <button
                              key={emo}
                              className="outline-btn small"
                              onClick={() =>
                                updateAppSettings(
                                  { logoEmoji: emo, logoImageUrl: "" },
                                  "Logo emoji updated"
                                )
                              }
                            >
                              {emo}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>

                    <label>
                      Custom App Logo Image (URL or Upload File)
                      <input
                        value={appSettings.logoImageUrl}
                        onChange={e =>
                          updateAppSettings({ logoImageUrl: e.target.value })
                        }
                        placeholder="Paste image URL or upload below..."
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <label
                          className="outline-btn small"
                          style={{ margin: 0, cursor: "pointer" }}
                        >
                          <ImageIcon size={13} /> Upload Logo Image
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoFileUpload}
                            style={{ display: "none" }}
                          />
                        </label>
                        {appSettings.logoImageUrl && (
                          <button
                            className="outline-btn small"
                            onClick={() =>
                              updateAppSettings(
                                { logoImageUrl: "" },
                                "Removed custom logo image"
                              )
                            }
                          >
                            Remove Image
                          </button>
                        )}
                      </div>
                    </label>

                    <div
                      style={{
                        borderTop: "1px solid #f0f1f5",
                        paddingTop: 14,
                        marginTop: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <b style={{ fontSize: 12 }}>
                          Home Notice / Announcement Bar
                        </b>
                        <button
                          className="outline-btn small"
                          onClick={() =>
                            updateAppSettings(
                              {
                                announcementEnabled:
                                  !appSettings.announcementEnabled,
                              },
                              appSettings.announcementEnabled
                                ? "Notice bar hidden"
                                : "Notice bar enabled"
                            )
                          }
                        >
                          <span
                            className={`status-dot ${
                              appSettings.announcementEnabled ? "on" : "off"
                            }`}
                          />
                          {appSettings.announcementEnabled ? "Shown" : "Hidden"}
                        </button>
                      </div>
                      <textarea
                        value={appSettings.announcementText}
                        onChange={e =>
                          updateAppSettings({
                            announcementText: e.target.value,
                          })
                        }
                        placeholder="Write an announcement for students on the home screen..."
                      />
                    </div>
                  </div>
                </section>

                {/* 2. USER APP THEME, COLORS & LAYOUT */}
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">APPEARANCE & THEME</span>
                      <h2>Theme Presets, Colors & Layout</h2>
                    </div>
                    <Palette size={18} style={{ color: "#3769e8" }} />
                  </div>
                  <div className="form-stack">
                    <label>
                      1-Click Theme Presets
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        {THEME_PRESETS.map(preset => (
                          <button
                            key={preset.name}
                            onClick={() =>
                              updateAppSettings(
                                {
                                  primaryColor: preset.primary,
                                  secondaryColor: preset.secondary,
                                  appBgColor: preset.bg,
                                  darkMode: preset.dark,
                                },
                                `Applied ${preset.name} theme`
                              )
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "9px 11px",
                              borderRadius: 10,
                              border:
                                appSettings.primaryColor === preset.primary &&
                                appSettings.darkMode === preset.dark
                                  ? "2px solid var(--primary)"
                                  : "1px solid var(--line)",
                              background: "#fff",
                              fontSize: 12,
                              fontWeight: 650,
                            }}
                          >
                            <span
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 6,
                                background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                                flexShrink: 0,
                              }}
                            />
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </label>

                    <div className="three-col" style={{ marginTop: 12 }}>
                      <label>
                        Primary Color
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                          }}
                        >
                          <input
                            type="color"
                            value={appSettings.primaryColor}
                            onChange={e =>
                              updateAppSettings({
                                primaryColor: e.target.value,
                              })
                            }
                            style={{
                              width: 42,
                              height: 36,
                              padding: 2,
                              marginTop: 0,
                            }}
                          />
                          <input
                            value={appSettings.primaryColor}
                            onChange={e =>
                              updateAppSettings({
                                primaryColor: e.target.value,
                              })
                            }
                            style={{ marginTop: 0 }}
                          />
                        </div>
                      </label>

                      <label>
                        Gradient Accent
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                          }}
                        >
                          <input
                            type="color"
                            value={appSettings.secondaryColor}
                            onChange={e =>
                              updateAppSettings({
                                secondaryColor: e.target.value,
                              })
                            }
                            style={{
                              width: 42,
                              height: 36,
                              padding: 2,
                              marginTop: 0,
                            }}
                          />
                          <input
                            value={appSettings.secondaryColor}
                            onChange={e =>
                              updateAppSettings({
                                secondaryColor: e.target.value,
                              })
                            }
                            style={{ marginTop: 0 }}
                          />
                        </div>
                      </label>

                      <label>
                        App Background
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 6,
                          }}
                        >
                          <input
                            type="color"
                            value={appSettings.appBgColor}
                            onChange={e =>
                              updateAppSettings({ appBgColor: e.target.value })
                            }
                            style={{
                              width: 42,
                              height: 36,
                              padding: 2,
                              marginTop: 0,
                            }}
                          />
                          <input
                            value={appSettings.appBgColor}
                            onChange={e =>
                              updateAppSettings({ appBgColor: e.target.value })
                            }
                            style={{ marginTop: 0 }}
                          />
                        </div>
                      </label>
                    </div>

                    <div className="two-col" style={{ marginTop: 6 }}>
                      <label>
                        User App Dark Mode
                        <button
                          className="outline-btn"
                          style={{ width: "100%", marginTop: 6 }}
                          onClick={() =>
                            updateAppSettings(
                              { darkMode: !appSettings.darkMode },
                              appSettings.darkMode
                                ? "Switched to Light Mode"
                                : "Switched to Dark Mode"
                            )
                          }
                        >
                          <span
                            className={`status-dot ${
                              appSettings.darkMode ? "on" : "off"
                            }`}
                          />
                          {appSettings.darkMode
                            ? "Dark Theme Active"
                            : "Light Theme Active"}
                        </button>
                      </label>

                      <label>
                        Home Card Layout
                        <select
                          value={appSettings.gridColumns}
                          onChange={e =>
                            updateAppSettings({
                              gridColumns: Number(e.target.value) as 1 | 2,
                            })
                          }
                        >
                          <option value={2}>2-Column Grid Cards</option>
                          <option value={1}>1-Column Full Width List</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </section>

                {/* 3. MAINTENANCE MODE & CUSTOM MAINTENANCE DATA */}
                <section className="panel">
                  <div
                    className="panel-head"
                    style={{
                      background: appSettings.maintenanceMode
                        ? "#fef3c7"
                        : "#f8fafc",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <div>
                      <span
                        className="section-kicker"
                        style={{
                          color: appSettings.maintenanceMode
                            ? "#b45309"
                            : "#64748b",
                        }}
                      >
                        SYSTEM LOCK & DOWNTIME NOTICE
                      </span>
                      <h2>Maintenance Mode & Custom Screen Data</h2>
                    </div>

                    <button
                      onClick={() =>
                        updateAppSettings(
                          { maintenanceMode: !appSettings.maintenanceMode },
                          !appSettings.maintenanceMode
                            ? "Maintenance Mode turned ON"
                            : "Maintenance Mode turned OFF"
                        )
                      }
                      style={{
                        height: 34,
                        padding: "0 14px",
                        borderRadius: 99,
                        fontWeight: 700,
                        fontSize: 12,
                        background: appSettings.maintenanceMode
                          ? "#d97706"
                          : "#e2e8f0",
                        color: appSettings.maintenanceMode ? "#fff" : "#334155",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <ShieldAlert size={14} />
                      {appSettings.maintenanceMode
                        ? "Maintenance ON (Active)"
                        : "Maintenance OFF"}
                    </button>
                  </div>

                  <div className="form-stack">
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: appSettings.maintenanceMode
                          ? "#fffbeb"
                          : "#f8fafc",
                        border: appSettings.maintenanceMode
                          ? "1px solid #fde68a"
                          : "1px solid #e2e8f0",
                        fontSize: 11.5,
                        color: "#475569",
                        marginBottom: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <AlertTriangle
                        size={16}
                        style={{
                          color: appSettings.maintenanceMode
                            ? "#d97706"
                            : "#64748b",
                          flexShrink: 0,
                        }}
                      />
                      <span>
                        When <b>Maintenance Mode</b> is turned ON, students
                        opening the User App will see the custom heading,
                        message, and time details configured below.
                      </span>
                    </div>

                    <label>
                      Maintenance Screen Heading / Title
                      <input
                        value={appSettings.maintenanceTitle}
                        onChange={e =>
                          updateAppSettings({
                            maintenanceTitle: e.target.value,
                          })
                        }
                        placeholder="e.g. 🚧 ऐप मेंटेनेंस कार्य चल रहा है"
                      />
                    </label>

                    <label>
                      Maintenance Message / Custom Data (Shown on Screen)
                      <textarea
                        style={{ minHeight: 95 }}
                        value={appSettings.maintenanceMessage}
                        onChange={e =>
                          updateAppSettings({
                            maintenanceMessage: e.target.value,
                          })
                        }
                        placeholder="Write the message or notice data you want students to read during maintenance..."
                      />
                    </label>

                    <label>
                      Estimated Completion Time / Badge Text
                      <input
                        value={appSettings.maintenanceEta}
                        onChange={e =>
                          updateAppSettings({ maintenanceEta: e.target.value })
                        }
                        placeholder="e.g. अनुमानित समय: शाम 6:00 बजे तक चालू होगा"
                      />
                    </label>

                    <label>
                      Support / Telegram / Helpline Text
                      <input
                        value={appSettings.maintenanceContact}
                        onChange={e =>
                          updateAppSettings({
                            maintenanceContact: e.target.value,
                          })
                        }
                        placeholder="e.g. अपडेट के लिए जुड़े रहें: @StudyBullOfficial"
                      />
                    </label>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 10,
                      }}
                    >
                      <button
                        className="outline-btn"
                        onClick={() => {
                          updateAppSettings({ maintenanceMode: true });
                          setPreviewTargetId(null);
                        }}
                      >
                        <Eye size={14} /> Turn ON & Preview Maintenance Screen
                      </button>
                    </div>
                  </div>
                </section>

                {/* 4. SUPABASE SQL SCHEMA & USER APP REALTIME SETUP */}
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">
                        SUPABASE TABLE & REALTIME SYNC
                      </span>
                      <h2>Supabase SQL Setup (Zero Pre-Uploaded Data)</h2>
                    </div>
                    <Database size={18} style={{ color: "#12805c" }} />
                  </div>
                  <div className="form-stack">
                    <p
                      style={{
                        margin: "0 0 10px",
                        fontSize: 12,
                        color: "#475569",
                        lineHeight: 1.55,
                      }}
                    >
                      Run the SQL below once in your{" "}
                      <b>Supabase SQL Editor</b>. No dummy data is uploaded—your
                      database starts completely empty, and every Button,
                      Folder, 500+ MCQ Quiz, Mock Test, Note, and Setting you
                      add will sync automatically to your User App.
                    </p>
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 10,
                        background: "#0f172a",
                        color: "#e2e8f0",
                        fontSize: 11,
                        lineHeight: 1.5,
                        overflowX: "auto",
                        maxHeight: 220,
                      }}
                    >
                      {SUPABASE_SQL_SCHEMA}
                    </pre>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: 10,
                      }}
                    >
                      <button
                        className="outline-btn small"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            SUPABASE_SQL_SCHEMA
                          );
                          notify("Supabase SQL Schema copied!");
                        }}
                      >
                        <Copy size={13} /> Copy Supabase SQL Schema
                      </button>
                    </div>
                  </div>
                </section>

                {/* USER APP CONTROL & ADMIN SETTINGS PROMPT */}
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">
                        USER APP PROMPT & INSTRUCTIONS • यूज़र ऐप प्रॉम्प्ट
                      </span>
                      <h2>User App Settings & Admin Control Prompt</h2>
                    </div>
                    <Sparkles size={18} style={{ color: "#1546b5" }} />
                  </div>
                  <div className="form-stack">
                    <p
                      style={{
                        margin: "0 0 10px",
                        fontSize: 12,
                        color: "#475569",
                        lineHeight: 1.55,
                      }}
                    >
                      यहाँ वह <b>Prompt</b> दिया गया है जिसका उपयोग करके आप यूजर ऐप (User App) में एडमिन पैनल से किए गए सभी सेटिंग्स (App Name, Logo, Theme, Maintenance, Typing Tests) के बदलावों को सिंक्रनाइज और कंट्रोल कर सकते हैं:
                    </p>
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 10,
                        background: "#0f172a",
                        color: "#e2e8f0",
                        fontSize: 11,
                        lineHeight: 1.5,
                        overflowX: "auto",
                        maxHeight: 200,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`"Create/Configure a React and TypeScript based Student/User Mobile App (PWA) for StudyBull that connects in real-time to Supabase / Admin state.
Requirements:
1. Instant Sync with Admin Panel: App Name, Subtitle, Logo (Emoji or Image URL), Primary & Secondary theme colors, Background color, and Dark Mode must instantly reflect when changed in the Admin Panel.
2. Live Maintenance Mode: When maintenance mode is toggled ON by the Admin, the User App must display the maintenance screen with custom Title, Message, ETA, and Contact details, with an Admin Bypass option.
3. Dynamic Navigation: Support folders, MCQ quizzes, mock tests with timer & negative marking, custom notes, interactive typing tests with passages manager, and fast calculation drills.
4. Real-time updates via Supabase tables (studybull_app_state) so that any changes made by the admin reflect instantly on student devices."`}
                    </pre>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: 10,
                      }}
                    >
                      <button
                        className="outline-btn small"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `"Create/Configure a React and TypeScript based Student/User Mobile App (PWA) for StudyBull that connects in real-time to Supabase / Admin state.
Requirements:
1. Instant Sync with Admin Panel: App Name, Subtitle, Logo (Emoji or Image URL), Primary & Secondary theme colors, Background color, and Dark Mode must instantly reflect when changed in the Admin Panel.
2. Live Maintenance Mode: When maintenance mode is toggled ON by the Admin, the User App must display the maintenance screen with custom Title, Message, ETA, and Contact details, with an Admin Bypass option.
3. Dynamic Navigation: Support folders, MCQ quizzes, mock tests with timer & negative marking, custom notes, interactive typing tests with passages manager, and fast calculation drills.
4. Real-time updates via Supabase tables (studybull_app_state) so that any changes made by the admin reflect instantly on student devices."`
                          );
                          notify("User App Control Prompt copied to clipboard!");
                        }}
                      >
                        <Copy size={13} /> Copy User App Prompt
                      </button>
                    </div>
                  </div>
                </section>

                {/* 5. BACKUP & IMPORT EXISTING USER APP DATA */}
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span className="section-kicker">
                        SYNC & MIGRATE EXISTING DATA
                      </span>
                      <h2>Import Existing User App Content (JSON)</h2>
                    </div>
                  </div>
                  <div className="form-stack">
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: "#475569",
                        lineHeight: 1.55,
                      }}
                    >
                      अगर आपके User App में पहले से buttons, courses, quizzes या
                      notes बने हुए हैं, तो उनका JSON array यहाँ पेस्ट करके{" "}
                      <b>Merge</b> या <b>Replace</b> कर सकते हैं। यह तुरंत
                      Supabase और Admin में सिंक हो जाएगा।
                    </p>
                    <textarea
                      value={importJsonText}
                      onChange={e => setImportJsonText(e.target.value)}
                      placeholder='Paste User App data JSON here: [{"id":"...","title":"...","kind":"button",...}] or {"nodes":[...]}'
                      style={{
                        minHeight: 120,
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11.5,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="primary-btn small"
                          onClick={() => handleImportJson("merge")}
                        >
                          Merge with Current Data
                        </button>
                        <button
                          className="outline-btn small"
                          onClick={() => handleImportJson("replace")}
                        >
                          Replace All with User App Data
                        </button>
                      </div>
                      <button
                        className="outline-btn small"
                        onClick={handleExportJson}
                      >
                        <Copy size={13} /> Copy Current Database JSON
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            /* =================================================================
               HOME PAGE MANAGER (SEPARATE PAGE PER BUTTON / FOLDER / QUIZ / MOCK)
               ================================================================= */
            <>
              {/* BREADCRUMB BAR FOR SEPARATE PAGES */}
              <div className="breadcrumb-bar">
                {currentPageNode && (
                  <button
                    className="outline-btn small"
                    onClick={() => {
                      const parentId =
                        breadcrumbTrail.length >= 2
                          ? breadcrumbTrail[breadcrumbTrail.length - 2].id
                          : null;
                      openDedicatedPage(parentId);
                    }}
                    style={{ marginRight: 4 }}
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                )}
                <button
                  className={`crumb-btn ${!currentPageNode ? "current" : ""}`}
                  onClick={() => openDedicatedPage(null)}
                >
                  <HomeIcon size={13} /> All Home Buttons ({nodes.length})
                </button>
                {breadcrumbTrail.map((crumb, idx) => {
                  const isLast = idx === breadcrumbTrail.length - 1;
                  return (
                    <div
                      key={crumb.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <ChevronRight size={13} style={{ color: "#94a3b8" }} />
                      <button
                        className={`crumb-btn ${isLast ? "current" : ""}`}
                        onClick={() => openDedicatedPage(crumb.id)}
                      >
                        <span>{crumb.icon}</span> {crumb.title}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* CURRENT PAGE BANNER */}
              {currentPageNode ? (
                <div className="page-banner">
                  <div className="page-banner-left">
                    <div
                      className={`page-big-icon ${
                        kindColor[currentPageNode.kind]
                      }`}
                    >
                      {currentPageNode.icon}
                    </div>
                    <div className="page-banner-info">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className={`type-chip ${
                            kindColor[currentPageNode.kind]
                          }`}
                        >
                          {kindLabel[currentPageNode.kind]}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: currentPageNode.enabled
                              ? "#12805c"
                              : "#64748b",
                          }}
                        >
                          • {currentPageNode.enabled ? "Published" : "Hidden"}
                        </span>
                      </div>
                      <h2>{currentPageNode.title}</h2>
                      <p>
                        {currentPageNode.subtitle ||
                          "Manage all items and content on this dedicated page."}
                      </p>
                    </div>
                  </div>

                  <div className="page-banner-actions">
                    <button
                      className="outline-btn small"
                      onClick={() => setEditingMetaNodeId(currentPageNode.id)}
                    >
                      <Pencil size={13} /> Edit Title / Icon
                    </button>
                    <button
                      className="outline-btn small"
                      onClick={() => handleToggleNode(currentPageNode.id)}
                    >
                      <span
                        className={`status-dot ${
                          currentPageNode.enabled ? "on" : "off"
                        }`}
                      />
                      {currentPageNode.enabled ? "Published" : "Hidden"}
                    </button>
                    <button
                      className="outline-btn small"
                      onClick={() => setPreviewTargetId(currentPageNode.id)}
                    >
                      <Eye size={13} /> Preview This Page
                    </button>
                    <button
                      className="outline-btn small danger"
                      onClick={() => requestDeleteNode(currentPageNode)}
                      title="Delete this page"
                    >
                      <Trash2 size={13} /> Delete Page
                    </button>
                    {["button", "folder", "section"].includes(
                      currentPageNode.kind
                    ) && (
                      <>
                        <button
                          className="primary-btn small"
                          onClick={() => setShowCreate(true)}
                          title="Create Container"
                        >
                          <CirclePlus size={14} /> ( Create )
                        </button>
                        <button
                          className="emerald-btn small"
                          onClick={() =>
                            openPlusContentToolForNode(currentPageNode.id)
                          }
                          title="Add or Edit Content in this container"
                        >
                          <Pencil size={14} /> {currentPageNode.notesContent || currentPageNode.htmlContent || (currentPageNode.questions && currentPageNode.questions.length > 0) ? "✏️ Edit Content" : "(+) Content"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="page-banner">
                  <div className="page-banner-left">
                    <div className="page-big-icon blue">🏠</div>
                    <div className="page-banner-info">
                      <span className="section-kicker">MAIN HOME SCREEN</span>
                      <h2>All Home Page Buttons ({nodes.length})</h2>
                      <p>
                        Every button below has its own separate page. Click
                        "Open Page →" on any button to manage its folders,
                        quizzes, mock tests & notes cleanly.
                      </p>
                    </div>
                  </div>
                  <div className="page-banner-actions">
                    <button
                      className="primary-btn"
                      onClick={() => setShowCreate(true)}
                      title="Create Container"
                    >
                      <CirclePlus size={15} /> ( Create )
                    </button>
                    <button
                      className="emerald-btn"
                      onClick={() => openPlusContentToolForNode(null)}
                      title="(+) Add Content"
                    >
                      <Plus size={15} /> (+) Content
                    </button>
                  </div>
                </div>
              )}

              {/* VIEW 1: CONTAINER PAGE (ROOT OR BUTTON / FOLDER / SECTION) */}
              {(!currentPageNode ||
                ["button", "folder", "section"].includes(
                  currentPageNode.kind
                )) && (
                <>
                  <div className="toolbar">
                    <div className="search-box">
                      <Search size={15} />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={
                          currentPageNode
                            ? `Search inside "${currentPageNode.title}"...`
                            : "Search home buttons..."
                        }
                      />
                      {search && (
                        <button onClick={() => setSearch("")}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <select
                      className="filter-select"
                      value={kindFilter}
                      onChange={e =>
                        setKindFilter(e.target.value as "all" | Kind)
                      }
                    >
                      <option value="all">All item types</option>
                      <option value="button">Buttons</option>
                      <option value="folder">Folders</option>
                      <option value="typing">Typing Tests</option>
                      <option value="calc">Speed Calculations</option>
                      <option value="section">Sections</option>
                      <option value="mcq">MCQ Quizzes</option>
                      <option value="mock">Mock Tests</option>
                      <option value="notes">Study Notes</option>
                      <option value="html">Custom Web</option>
                    </select>
                  </div>

                  {currentLevelItems.length > 0 ? (
                    <div className="items-grid">
                      {currentLevelItems.map(item => {
                        const totalMcqs = countTotalMcqsInside(item);
                        return (
                          <div
                            key={item.id}
                            className={`item-page-card ${
                              !item.enabled ? "disabled" : ""
                            }`}
                          >
                            <div className="item-card-top">
                              <div
                                className={`tree-icon ${kindColor[item.kind]}`}
                              >
                                {item.icon}
                              </div>
                              <div className="item-card-body">
                                <h3>{item.title}</h3>
                                <p>{item.subtitle || kindLabel[item.kind]}</p>
                              </div>
                              <button
                                className={`status-dot ${
                                  item.enabled ? "on" : "off"
                                }`}
                                title={
                                  item.enabled
                                    ? "Published (click to hide)"
                                    : "Hidden (click to publish)"
                                }
                                onClick={() => handleToggleNode(item.id)}
                              />
                            </div>

                            <div className="item-card-meta">
                              <span
                                className={`type-chip ${kindColor[item.kind]}`}
                              >
                                {kindLabel[item.kind]}
                              </span>
                              {["button", "folder", "section"].includes(
                                item.kind
                              ) && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#475569",
                                    background: "#f1f5f9",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontWeight: 600,
                                  }}
                                >
                                  {item.children.length} items inside
                                </span>
                              )}
                              {totalMcqs > 0 && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#12805c",
                                    background: "#e7faf2",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontWeight: 700,
                                  }}
                                >
                                  {totalMcqs} MCQs
                                </span>
                              )}
                              {item.kind === "mock" && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#4338ca",
                                    background: "#e8edff",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontWeight: 600,
                                  }}
                                >
                                  {item.durationMinutes || 60} Min
                                </span>
                              )}
                              {item.kind === "typing" && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#0d9488",
                                    background: "#e6fffa",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.targetWpm || 35} WPM Target
                                </span>
                              )}
                              {item.kind === "calc" && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#ea580c",
                                    background: "#fff7ed",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.calcDurationSeconds || 60}s Drill
                                </span>
                              )}
                            </div>

                             {/* CONTAINER DATA CONTENTS SUMMARY */}
                             {["button", "folder", "section"].includes(item.kind) && item.children.length > 0 && (
                               <div style={{ margin: "8px 0", padding: "8px 10px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11.5 }}>
                                 <strong style={{ display: "block", color: "#475569", marginBottom: 4 }}>📦 Container Contents ({item.children.length}):</strong>
                                 <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                   {item.children.slice(0, 5).map(c => (
                                     <span key={c.id} style={{ background: "#fff", padding: "2px 6px", borderRadius: 4, border: "1px solid #cbd5e1", color: "#334155", display: "inline-flex", alignItems: "center", gap: 4 }}>
                                       <span>{c.icon}</span> {c.title}
                                     </span>
                                   ))}
                                   {item.children.length > 5 && (
                                     <span style={{ color: "#64748b", padding: "2px 4px" }}>+{item.children.length - 5} more</span>
                                   )}
                                 </div>
                               </div>
                             )}

                             {item.htmlContent && (
                               <div style={{ margin: "8px 0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0fdf4", padding: "6px 10px", borderRadius: 8, border: "1px solid #bbf7d0", flexWrap: "wrap", gap: 6 }}>
                                 <span style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>{"</>"} Custom HTML Code Included</span>
                                 <button
                                   type="button"
                                   className="outline-btn small"
                                   onClick={() => {
                                     setHtmlCodeViewerNode(item);
                                     setEditableHtml(item.htmlContent || "");
                                   }}
                                   style={{ borderColor: "#166534", color: "#166534", background: "#fff" }}
                                 >
                                   <Eye size={12} /> View & Edit Code
                                 </button>
                               </div>
                             )}

                            <div className="item-card-footer">
                              <div style={{ display: "flex", gap: 3 }}>
                                <button
                                  className="row-icon"
                                  title="Move Up / Left"
                                  onClick={() => handleMoveItem(item.id, -1)}
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  className="row-icon"
                                  title="Move Down / Right"
                                  onClick={() => handleMoveItem(item.id, 1)}
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button
                                  className="row-icon"
                                  title="Edit title, subtitle & icon"
                                  onClick={() => setEditingMetaNodeId(item.id)}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="row-icon danger"
                                  title="Delete"
                                  onClick={() => requestDeleteNode(item)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button
                                  className="emerald-btn small"
                                  onClick={() => openPlusContentToolForNode(item.id)}
                                  title="Add or Edit MCQs, Notes, Mock Test or Web Code into this container"
                                >
                                  <Pencil size={13} /> {item.notesContent || item.htmlContent || (item.questions && item.questions.length > 0) ? "✏️ Edit Content" : "(+) Content"}
                                </button>
                                <button
                                  className="primary-btn small"
                                  onClick={() => openDedicatedPage(item.id)}
                                >
                                  Open Page &rarr;
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      className="panel"
                      style={{
                        padding: 40,
                        textAlign: "center",
                        color: "#64748b",
                      }}
                    >
                      <Folder
                        size={32}
                        style={{ margin: "0 auto 10px", color: "#94a3b8" }}
                      />
                      <b
                        style={{
                          display: "block",
                          fontSize: 14,
                          color: "#1e293b",
                        }}
                      >
                        This page is empty
                      </b>
                      <p style={{ fontSize: 12, margin: "4px 0 16px" }}>
                        Add Buttons, Folders, Sections or add Notes, MCQs and Mock Tests inside containers.
                      </p>
                      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                        <button
                          className="primary-btn"
                          onClick={() => setShowCreate(true)}
                        >
                          <CirclePlus size={15} /> ( Create ) Container
                        </button>
                        <button
                          className="emerald-btn"
                          onClick={() => openPlusContentToolForNode(currentPageNode?.id || null)}
                        >
                          <Plus size={15} /> (+) Add Content
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* VIEW 2: DEDICATED MCQ QUIZ OR MOCK TEST PAGE */}
              {currentPageNode &&
                (currentPageNode.kind === "mcq" ||
                  currentPageNode.kind === "mock") && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    {currentPageNode.kind === "mock" && (
                      <div className="panel" style={{ padding: 16 }}>
                        <span className="section-kicker">
                          MOCK TEST EXAM CONFIGURATION
                        </span>
                        <div className="three-col" style={{ marginTop: 10 }}>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#506078",
                            }}
                          >
                            Duration (Minutes)
                            <input
                              type="number"
                              value={currentPageNode.durationMinutes ?? 60}
                              onChange={e => {
                                const val = Math.max(
                                  1,
                                  Number(e.target.value) || 60
                                );
                                const next = updateNodes(
                                  nodes,
                                  currentPageNode.id,
                                  n => ({ ...n, durationMinutes: val })
                                );
                                saveStructure(next);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                marginTop: 5,
                                border: "1px solid var(--line)",
                                borderRadius: 8,
                                height: 36,
                                padding: "0 10px",
                              }}
                            />
                          </label>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#506078",
                            }}
                          >
                            Correct Answer Marks (+)
                            <input
                              type="number"
                              step="0.25"
                              value={currentPageNode.positiveMarks ?? 2}
                              onChange={e => {
                                const val = Number(e.target.value) || 1;
                                const next = updateNodes(
                                  nodes,
                                  currentPageNode.id,
                                  n => ({ ...n, positiveMarks: val })
                                );
                                saveStructure(next);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                marginTop: 5,
                                border: "1px solid var(--line)",
                                borderRadius: 8,
                                height: 36,
                                padding: "0 10px",
                              }}
                            />
                          </label>
                          <label
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#506078",
                            }}
                          >
                            Negative Marking (-)
                            <input
                              type="number"
                              step="0.25"
                              value={currentPageNode.negativeMarks ?? 0.5}
                              onChange={e => {
                                const val = Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                );
                                const next = updateNodes(
                                  nodes,
                                  currentPageNode.id,
                                  n => ({ ...n, negativeMarks: val })
                                );
                                saveStructure(next);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                marginTop: 5,
                                border: "1px solid var(--line)",
                                borderRadius: 8,
                                height: 36,
                                padding: "0 10px",
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="panel" style={{ padding: 18 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 12,
                          marginBottom: 16,
                        }}
                      >
                        <div>
                          <span className="section-kicker">QUESTION BANK</span>
                          <h2 style={{ fontSize: 16, margin: "3px 0 0" }}>
                            Total Questions: {allNodeQuestions.length} MCQs
                          </h2>
                        </div>

                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            className="emerald-btn"
                            onClick={() => setShowBulkMcq(true)}
                          >
                            <Upload size={15} /> Bulk Add 500+ MCQs
                            (Auto-Detector)
                          </button>
                          <button
                            className="primary-btn"
                            onClick={requestAddSingleQuestion}
                          >
                            <Plus size={15} /> Add Single MCQ
                          </button>
                          {allNodeQuestions.length > 0 && (
                            <button
                              className="outline-btn danger"
                              onClick={requestClearAllQuestions}
                              title="Delete all questions in this test"
                            >
                              <Trash2 size={14} /> Clear All ({allNodeQuestions.length})
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="toolbar" style={{ marginBottom: 12 }}>
                        <div className="search-box">
                          <Search size={15} />
                          <input
                            value={questionSearch}
                            onChange={e => {
                              setQuestionSearch(e.target.value);
                              setQPage(1);
                            }}
                            placeholder={`Search across ${allNodeQuestions.length} questions, options or explanations...`}
                          />
                          {questionSearch && (
                            <button onClick={() => setQuestionSearch("")}>
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {totalQuestionPages > 1 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <button
                              className="outline-btn small"
                              disabled={qPage <= 1}
                              onClick={() => setQPage(p => Math.max(1, p - 1))}
                            >
                              ← Prev
                            </button>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#475569",
                                padding: "0 6px",
                              }}
                            >
                              Page {qPage} / {totalQuestionPages}
                            </span>
                            <button
                              className="outline-btn small"
                              disabled={qPage >= totalQuestionPages}
                              onClick={() =>
                                setQPage(p =>
                                  Math.min(totalQuestionPages, p + 1)
                                )
                              }
                            >
                              Next →
                            </button>
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        {paginatedQuestions.map((q, idx) => {
                          const absoluteNumber =
                            (qPage - 1) * QUESTIONS_PER_PAGE + idx + 1;
                          return (
                            <div
                              key={q.id}
                              style={{
                                border: "1px solid var(--line)",
                                borderRadius: 12,
                                padding: 14,
                                background: "#fbfcfe",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: 8,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: "#3769e8",
                                    background: "#edf3ff",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                  }}
                                >
                                  Question #{absoluteNumber} • Correct Answer:{" "}
                                  {String.fromCharCode(65 + q.correctIndex)}
                                </span>
                                <button
                                  className="row-icon danger"
                                  onClick={() =>
                                    requestDeleteQuestion(
                                      q.id,
                                      q.question,
                                      absoluteNumber
                                    )
                                  }
                                  title="Delete question"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              <textarea
                                value={q.question}
                                onChange={e =>
                                  updateQuestion(q.id, item => ({
                                    ...item,
                                    question: e.target.value,
                                  }))
                                }
                                placeholder="Question text..."
                                style={{
                                  width: "100%",
                                  minHeight: 52,
                                  border: "1px solid var(--line)",
                                  borderRadius: 8,
                                  padding: "8px 10px",
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  background: "#fff",
                                  marginBottom: 8,
                                }}
                              />

                              <div className="two-col" style={{ gap: 8 }}>
                                {q.options.map((opt, oIdx) => (
                                  <div
                                    key={oIdx}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 7,
                                      background:
                                        q.correctIndex === oIdx
                                          ? "#e7faf2"
                                          : "#fff",
                                      border: `1px solid ${
                                        q.correctIndex === oIdx
                                          ? "#1bc58b"
                                          : "var(--line)"
                                      }`,
                                      borderRadius: 8,
                                      padding: "4px 8px",
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name={`correct-${q.id}`}
                                      checked={q.correctIndex === oIdx}
                                      onChange={() =>
                                        updateQuestion(q.id, item => ({
                                          ...item,
                                          correctIndex: oIdx,
                                        }))
                                      }
                                      title="Select as correct answer"
                                    />
                                    <b
                                      style={{ fontSize: 11, color: "#475569" }}
                                    >
                                      {String.fromCharCode(65 + oIdx)}.
                                    </b>
                                    <input
                                      value={opt}
                                      onChange={e => {
                                        const nextOpts = [...q.options] as [
                                          string,
                                          string,
                                          string,
                                          string,
                                        ];
                                        nextOpts[oIdx] = e.target.value;
                                        updateQuestion(q.id, item => ({
                                          ...item,
                                          options: nextOpts,
                                        }));
                                      }}
                                      style={{
                                        border: 0,
                                        outline: 0,
                                        width: "100%",
                                        fontSize: 12,
                                        background: "transparent",
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>

                              <div style={{ marginTop: 8 }}>
                                <input
                                  value={q.explanation || ""}
                                  onChange={e =>
                                    updateQuestion(q.id, item => ({
                                      ...item,
                                      explanation: e.target.value,
                                    }))
                                  }
                                  placeholder="Explane / Explanation (optional)..."
                                  style={{
                                    width: "100%",
                                    border: "1px solid var(--line)",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 11.5,
                                    background: "#fff",
                                    color: "#334155",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {allNodeQuestions.length === 0 && (
                          <div
                            style={{
                              padding: "32px 18px",
                              textAlign: "center",
                              border: "1px dashed #cbd5e1",
                              borderRadius: 12,
                              background: "#f8fafc",
                              color: "#475569",
                            }}
                          >
                            <b
                              style={{
                                display: "block",
                                fontSize: 14,
                                color: "#1e293b",
                                marginBottom: 6,
                              }}
                            >
                              0 Questions in "{currentPageNode.title}"
                            </b>
                            <p style={{ fontSize: 12, margin: "0 0 14px" }}>
                              Start from zero: Paste 500+ MCQs at once using the
                              Auto-Detector or add questions one by one.
                            </p>
                            <div
                              style={{
                                display: "inline-flex",
                                gap: 8,
                                flexWrap: "wrap",
                                justifyContent: "center",
                              }}
                            >
                              <button
                                className="emerald-btn"
                                onClick={() => setShowBulkMcq(true)}
                              >
                                <Upload size={15} /> Bulk Add 500+ MCQs
                                (Auto-Detector)
                              </button>
                              <button
                                className="primary-btn"
                                onClick={requestAddSingleQuestion}
                              >
                                <Plus size={15} /> Add Single MCQ
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              {/* VIEW 3: DEDICATED STUDY NOTES PAGE */}
              {currentPageNode && currentPageNode.kind === "notes" && (
                <div className="panel" style={{ padding: 20 }}>
                  <span className="section-kicker">STUDY NOTES EDITOR</span>
                  <h2 style={{ fontSize: 16, margin: "4px 0 12px" }}>
                    Edit Notes Content for "{currentPageNode.title}"
                  </h2>
                  <textarea
                    value={currentPageNode.notesContent || ""}
                    onChange={e => {
                      const next = updateNodes(
                        nodes,
                        currentPageNode.id,
                        n => ({
                          ...n,
                          notesContent: e.target.value,
                        })
                      );
                      saveStructure(next);
                    }}
                    placeholder="Write complete study notes, formulas, or exam revision points here..."
                    style={{
                      width: "100%",
                      minHeight: 340,
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      padding: 14,
                      fontSize: 13,
                      lineHeight: 1.7,
                      outline: "none",
                    }}
                  />
                </div>
              )}

              {/* VIEW 4: DEDICATED CUSTOM WEB HTML PAGE */}
              {currentPageNode && currentPageNode.kind === "html" && (
                <div className="panel" style={{ padding: 20 }}>
                  <span className="section-kicker">CUSTOM HTML EDITOR</span>
                  <h2 style={{ fontSize: 16, margin: "4px 0 12px" }}>
                    Custom Web Code for "{currentPageNode.title}"
                  </h2>
                  <textarea
                    value={currentPageNode.htmlContent || ""}
                    onChange={e => {
                      const next = updateNodes(
                        nodes,
                        currentPageNode.id,
                        n => ({
                          ...n,
                          htmlContent: e.target.value,
                        })
                      );
                      saveStructure(next);
                    }}
                    placeholder="<div>Custom HTML content...</div>"
                    style={{
                      width: "100%",
                      minHeight: 300,
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      padding: 14,
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 12,
                      lineHeight: 1.6,
                      outline: "none",
                    }}
                  />
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
                      Live Interactive Preview
                    </div>
                    <SandboxedHtmlView
                      htmlContent={currentPageNode.htmlContent}
                      title={currentPageNode.title}
                      minHeight={400}
                      style={{ border: "1px solid var(--line)" }}
                    />
                  </div>
                </div>
              )}

              {/* VIEW 5: DEDICATED TYPING PASSAGES / TESTS MANAGER */}
              {currentPageNode && currentPageNode.kind === "typing" && (() => {
                const passagesList = (currentPageNode.passages && currentPageNode.passages.length > 0)
                  ? currentPageNode.passages
                  : [
                      {
                        id: `passage-init-${currentPageNode.id}`,
                        title: currentPageNode.title || "SSC CGL English Typing Test #1",
                        lang: (currentPageNode.typingLanguage || "en") as "hi" | "en",
                        duration: currentPageNode.durationMinutes || 5,
                        difficulty: "medium" as const,
                        targetWpm: currentPageNode.targetWpm || 35,
                        text: currentPageNode.typingPassage || DEFAULT_TYPING_PASSAGES.ssc_en,
                      },
                    ];

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Header Panel */}
                    <div className="panel" style={{ padding: 20 }}>
                      <div className="panel-head" style={{ marginBottom: 12 }}>
                        <div>
                          <span className="section-kicker">TYPING PASSAGES / TESTS MANAGER</span>
                          <h2 style={{ fontSize: 16, margin: "2px 0" }}>
                            Manage Typing Tests for "{currentPageNode.title}" ({passagesList.length})
                          </h2>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                            Add exam passages in English or Hindi with specific duration, difficulty & targets. Saved in studybull_app_state passages array.
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="type-chip teal">⌨️ Typing Tests Manager</span>
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={openNewPassageForm}
                          >
                            <Plus size={15} /> Add New Typing Test
                          </button>
                        </div>
                      </div>

                      {/* ADD / EDIT TYPING TEST MODAL / INLINE FORM */}
                      {showPassageForm && (
                        <div
                          style={{
                            background: "#f8fafc",
                            border: "1.5px solid #0d9488",
                            borderRadius: 12,
                            padding: 18,
                            marginTop: 10,
                            marginBottom: 16,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 14,
                              borderBottom: "1px solid #e2e8f0",
                              paddingBottom: 10,
                            }}
                          >
                            <div>
                              <b style={{ fontSize: 14, color: "#0f766e" }}>
                                {editingPassageId ? "✏️ Edit Typing Test" : "➕ Add New Typing Test"}
                              </b>
                              <small style={{ display: "block", color: "#64748b", fontSize: 11 }}>
                                Fill all fields below and click Save. User confirmation will be requested before updating database.
                              </small>
                            </div>
                            <button
                              type="button"
                              className="outline-btn small"
                              onClick={() => {
                                setShowPassageForm(false);
                                setEditingPassageId(null);
                              }}
                            >
                              <X size={13} /> Close Form
                            </button>
                          </div>

                          <div className="form-stack" style={{ gap: 12 }}>
                            {/* Row 1: Test Title & Difficulty */}
                            <div className="two-col" style={{ gap: 12 }}>
                              <label>
                                Test Title *
                                <input
                                  type="text"
                                  value={passageFormTitle}
                                  onChange={e => setPassageFormTitle(e.target.value)}
                                  placeholder='उदा. "SSC CGL English Typing Test #1" या "Railway Hindi Skill Test"'
                                  style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--line)",
                                    fontSize: 12.5,
                                  }}
                                />
                              </label>

                              <label>
                                Difficulty Level
                                <select
                                  value={passageFormDifficulty}
                                  onChange={e =>
                                    setPassageFormDifficulty(
                                      e.target.value as "easy" | "medium" | "hard"
                                    )
                                  }
                                  style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--line)",
                                    fontSize: 12.5,
                                    background: "#fff",
                                  }}
                                >
                                  <option value="easy">🟢 Easy (Basic Vocabulary)</option>
                                  <option value="medium">🟡 Medium (Standard Exam Level)</option>
                                  <option value="hard">🔴 Hard (Complex Words & Numbers)</option>
                                </select>
                              </label>
                            </div>

                            {/* Row 2: Language, Duration, Target WPM */}
                            <div className="three-col" style={{ gap: 12 }}>
                              <label>
                                Language Selector *
                                <select
                                  value={passageFormLang}
                                  onChange={e =>
                                    setPassageFormLang(e.target.value as "en" | "hi")
                                  }
                                  style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--line)",
                                    fontSize: 12.5,
                                    background: "#fff",
                                  }}
                                >
                                  <option value="en">English (Roman Script)</option>
                                  <option value="hi">Hindi (Devanagari / Mangal)</option>
                                </select>
                              </label>

                              <label>
                                Duration *
                                <select
                                  value={passageFormDuration}
                                  onChange={e =>
                                    setPassageFormDuration(Number(e.target.value))
                                  }
                                  style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--line)",
                                    fontSize: 12.5,
                                    background: "#fff",
                                  }}
                                >
                                  <option value={1}>1 Minute (Speed Test)</option>
                                  <option value={2}>2 Minutes (Quick Drill)</option>
                                  <option value={5}>5 Minutes (Standard Practice)</option>
                                  <option value={10}>10 Minutes (SSC CHSL Exam)</option>
                                  <option value={15}>15 Minutes (SSC CGL Tier-2)</option>
                                </select>
                              </label>

                              <label>
                                Qualifying Speed (WPM)
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input
                                    type="number"
                                    min={15}
                                    max={100}
                                    value={passageFormTargetWpm}
                                    onChange={e =>
                                      setPassageFormTargetWpm(Number(e.target.value))
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "8px 10px",
                                      borderRadius: 8,
                                      border: "1px solid var(--line)",
                                      fontSize: 12.5,
                                    }}
                                  />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                                    WPM
                                  </span>
                                </div>
                              </label>
                            </div>

                            {/* Row 3: Passage Textarea with Sample Loaders */}
                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: 6,
                                  flexWrap: "wrap",
                                  gap: 6,
                                }}
                              >
                                <label style={{ margin: 0, fontWeight: 700 }}>
                                  Passage Textarea (पैराग्राफ टेक्स्ट जिसे यूजर टाइप करेगा) *
                                </label>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className="outline-btn small"
                                    onClick={() => {
                                      setPassageFormText(DEFAULT_TYPING_PASSAGES.ssc_en);
                                      setPassageFormLang("en");
                                      if (!passageFormTitle) {
                                        setPassageFormTitle("SSC CGL English Typing Test");
                                      }
                                    }}
                                  >
                                    Load Sample SSC English
                                  </button>
                                  <button
                                    type="button"
                                    className="outline-btn small"
                                    onClick={() => {
                                      setPassageFormText(DEFAULT_TYPING_PASSAGES.railway_en);
                                      setPassageFormLang("en");
                                      if (!passageFormTitle) {
                                        setPassageFormTitle("Railway English Typing Test");
                                      }
                                    }}
                                  >
                                    Load Sample Railway
                                  </button>
                                  <button
                                    type="button"
                                    className="outline-btn small"
                                    onClick={() => {
                                      setPassageFormText(DEFAULT_TYPING_PASSAGES.ssc_hi);
                                      setPassageFormLang("hi");
                                      if (!passageFormTitle) {
                                        setPassageFormTitle("हिंदी टंकण अभ्यास परीक्षा #1");
                                      }
                                    }}
                                  >
                                    Load Sample Hindi
                                  </button>
                                </div>
                              </div>

                              <textarea
                                value={passageFormText}
                                onChange={e => setPassageFormText(e.target.value)}
                                placeholder="यहाँ पैराग्राफ टेक्स्ट पेस्ट करें या लिखें जिसे छात्र टाइप करेगा..."
                                rows={6}
                                style={{
                                  width: "100%",
                                  minHeight: 130,
                                  border: "1px solid var(--line)",
                                  borderRadius: 10,
                                  padding: 12,
                                  fontSize: 12.5,
                                  lineHeight: 1.7,
                                  outline: "none",
                                  background: "#fff",
                                  fontFamily:
                                    passageFormLang === "hi"
                                      ? "'Mukta', sans-serif"
                                      : "ui-monospace, monospace",
                                }}
                              />
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginTop: 4,
                                }}
                              >
                                <span>
                                  {passageFormText.trim()
                                    ? `${passageFormText.trim().split(/\s+/).length} Words • ${passageFormText.length} Characters`
                                    : "0 Words"}
                                </span>
                                <span>
                                  Recommended: ~300-500 words for 10-15 minute tests
                                </span>
                              </div>
                            </div>

                            {/* Form Action Buttons */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 10,
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: "1px solid #e2e8f0",
                              }}
                            >
                              <button
                                type="button"
                                className="outline-btn"
                                onClick={() => {
                                  setShowPassageForm(false);
                                  setEditingPassageId(null);
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="primary-btn"
                                onClick={requestSavePassage}
                                style={{ fontWeight: 700 }}
                              >
                                <Check size={14} />
                                {editingPassageId
                                  ? "Save Changes (Confirm)"
                                  : "Add This Test (Confirm)"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PASSAGES LIST / TABLE */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#475569",
                            padding: "4px 2px",
                          }}
                        >
                          <span>All Available Typing Tests ({passagesList.length})</span>
                          <span>Click Edit to change passage text or duration</span>
                        </div>

                        {passagesList.map((passage, pIdx) => {
                          const isHi = passage.lang === "hi";
                          const wordCount = passage.text.trim()
                            ? passage.text.trim().split(/\s+/).length
                            : 0;

                          return (
                            <div
                              key={passage.id}
                              style={{
                                background: "#fff",
                                border: "1px solid var(--line)",
                                borderRadius: 10,
                                padding: 14,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                                transition: "box-shadow 0.15s",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 6,
                                      background: "#f1f5f9",
                                      color: "#334155",
                                      fontWeight: 800,
                                      fontSize: 12,
                                      display: "grid",
                                      placeItems: "center",
                                    }}
                                  >
                                    #{pIdx + 1}
                                  </span>
                                  <div>
                                    <b style={{ fontSize: 13, color: "#0f172a", display: "block" }}>
                                      {passage.title}
                                    </b>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        marginTop: 3,
                                        fontSize: 11,
                                        color: "#64748b",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <span
                                        style={{
                                          padding: "2px 6px",
                                          borderRadius: 4,
                                          fontSize: 10.5,
                                          fontWeight: 700,
                                          background: isHi ? "#fef3c7" : "#dbeafe",
                                          color: isHi ? "#92400e" : "#1e40af",
                                        }}
                                      >
                                        {isHi ? "हिंदी (Devanagari)" : "English"}
                                      </span>
                                      <span>• ⏱️ {passage.duration} Min</span>
                                      <span>• 🎯 {passage.targetWpm || 35} WPM Target</span>
                                      <span
                                        style={{
                                          padding: "2px 6px",
                                          borderRadius: 4,
                                          fontSize: 10.5,
                                          fontWeight: 700,
                                          background:
                                            passage.difficulty === "easy"
                                              ? "#dcfce7"
                                              : passage.difficulty === "hard"
                                              ? "#fee2e2"
                                              : "#fef9c3",
                                          color:
                                            passage.difficulty === "easy"
                                              ? "#166534"
                                              : passage.difficulty === "hard"
                                              ? "#991b1b"
                                              : "#854d0e",
                                        }}
                                      >
                                        {(passage.difficulty || "medium").toUpperCase()}
                                      </span>
                                      <span>• {wordCount} Words</span>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <button
                                    type="button"
                                    className="outline-btn small"
                                    onClick={() => openEditPassageForm(passage)}
                                    title="Edit this typing test"
                                  >
                                    <Pencil size={13} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="outline-btn small danger"
                                    onClick={() => requestDeletePassage(passage)}
                                    title="Delete this typing test"
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                </div>
                              </div>

                              {/* Passage Text Preview Snippet */}
                              <div
                                style={{
                                  background: "#f8fafc",
                                  border: "1px solid #edf2f7",
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  fontSize: 11.5,
                                  lineHeight: 1.6,
                                  color: "#334155",
                                  fontFamily: isHi ? "'Mukta', sans-serif" : "ui-monospace, monospace",
                                  maxHeight: 70,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                }}
                              >
                                {passage.text}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Interactive Typing Sandbox in Admin */}
                    <div className="panel" style={{ padding: 20 }}>
                      <span className="section-kicker">LIVE INTERACTIVE TEST PREVIEW</span>
                      <h3 style={{ fontSize: 14, margin: "2px 0 12px" }}>
                        Student Typing Simulation for "{passagesList[0]?.title || currentPageNode.title}":
                      </h3>
                      <TypingPracticeView
                        key={passagesList[0]?.id || "preview-typing"}
                        title={passagesList[0]?.title || currentPageNode.title}
                        passage={passagesList[0]?.text || DEFAULT_TYPING_PASSAGES.ssc_en}
                        language={passagesList[0]?.lang || "en"}
                        durationMinutes={passagesList[0]?.duration || 5}
                        targetWpm={passagesList[0]?.targetWpm || 35}
                        primaryColor={appSettings.primaryColor}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* VIEW 6: DEDICATED SPEED CALCULATION DRILL PAGE */}
              {currentPageNode && currentPageNode.kind === "calc" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="panel" style={{ padding: 20 }}>
                    <div className="panel-head" style={{ marginBottom: 12 }}>
                      <div>
                        <span className="section-kicker">SPEED MATH CALCULATION DRILL</span>
                        <h2 style={{ fontSize: 16, margin: "2px 0" }}>
                          Configure Speed Calculation Drill for "{currentPageNode.title}"
                        </h2>
                      </div>
                      <span className="type-chip orange">⚡ Speed Math</span>
                    </div>

                    <div className="form-stack">
                      <div className="two-col">
                        <label>
                          Default Drill Mode
                          <select
                            value={currentPageNode.calcMode || "mix"}
                            onChange={e => {
                              const next = updateNodes(nodes, currentPageNode.id, n => ({
                                ...n,
                                calcMode: e.target.value as CalcMode,
                              }));
                              saveStructure(next);
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--line)",
                              fontSize: 12.5,
                              background: "#fff",
                            }}
                          >
                            <option value="mix">⚡ Mix Speed Math Sprint</option>
                            <option value="multiply">✖️ Fast Multiplication (2-Digit)</option>
                            <option value="add">➕ Fast Addition Sprint</option>
                            <option value="subtract">➖ Fast Subtraction</option>
                            <option value="square">📐 Squares (1 to 35) Recall</option>
                            <option value="cube">🧊 Cubes (1 to 20) Recall</option>
                            <option value="percent">📊 Percentages & Fractions</option>
                            <option value="table">🔢 Tables (12 to 25) Drill</option>
                          </select>
                        </label>

                        <label>
                          Speed Sprint Duration
                          <select
                            value={currentPageNode.calcDurationSeconds || 60}
                            onChange={e => {
                              const next = updateNodes(nodes, currentPageNode.id, n => ({
                                ...n,
                                calcDurationSeconds: Number(e.target.value),
                              }));
                              saveStructure(next);
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--line)",
                              fontSize: 12.5,
                              background: "#fff",
                            }}
                          >
                            <option value={30}>30 Seconds (Blitz Speed)</option>
                            <option value={60}>60 Seconds (Standard Exam Sprint)</option>
                            <option value={120}>120 Seconds (Endurance Drill)</option>
                            <option value={300}>300 Seconds (5 Minutes Practice)</option>
                          </select>
                        </label>
                      </div>

                      <div
                        style={{
                          background: "#fff7ed",
                          border: "1px solid #ffedd5",
                          borderRadius: 10,
                          padding: 12,
                          fontSize: 12,
                          color: "#9a3412",
                          lineHeight: 1.6,
                        }}
                      >
                        <b>⚡ Auto-Generated Endless Math Practice:</b> Problems are
                        generated automatically with Vedic math tricks, plausible
                        distractors, streak multiplier points, and accuracy tracking.
                        Students never run out of calculation practice!
                      </div>
                    </div>
                  </div>

                  {/* Live Interactive Calculation Sandbox in Admin */}
                  <div className="panel" style={{ padding: 20 }}>
                    <span className="section-kicker">LIVE INTERACTIVE TEST PREVIEW</span>
                    <h3 style={{ fontSize: 14, margin: "2px 0 12px" }}>
                      Live Student Math Drill Simulation (Solve questions below):
                    </h3>
                    <SpeedCalculationView
                      title={currentPageNode.title}
                      mode={currentPageNode.calcMode || "mix"}
                      durationSeconds={currentPageNode.calcDurationSeconds || 60}
                      primaryColor={appSettings.primaryColor}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* EDIT ITEM TITLE / SUBTITLE / ICON MODAL */}
      {editingNode && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingMetaNodeId(null)}
        >
          <div className="create-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="section-kicker">EDIT DETAILS</span>
                <h2>{editingNode.title}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setEditingMetaNodeId(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-stack">
              <label>
                Display Title
                <input
                  value={editingNode.title}
                  onChange={e => {
                    const next = updateNodes(nodes, editingNode.id, n => ({
                      ...n,
                      title: e.target.value,
                    }));
                    saveStructure(next);
                  }}
                />
              </label>
              <label>
                Subtitle / Description
                <textarea
                  value={editingNode.subtitle || ""}
                  onChange={e => {
                    const next = updateNodes(nodes, editingNode.id, n => ({
                      ...n,
                      subtitle: e.target.value,
                    }));
                    saveStructure(next);
                  }}
                />
              </label>
              <label>
                Icon / Emoji
                <input
                  value={editingNode.icon}
                  onChange={e => {
                    const next = updateNodes(nodes, editingNode.id, n => ({
                      ...n,
                      icon: e.target.value,
                    }));
                    saveStructure(next);
                  }}
                />
              </label>
              <label>
                Item Type / Tool Kind
                <select
                  value={editingNode.kind}
                  onChange={e => {
                    const newKind = e.target.value as Kind;
                    const next = updateNodes(nodes, editingNode.id, n => ({
                      ...n,
                      kind: newKind,
                      icon:
                        newKind === "typing" && (!n.icon || n.icon === "⚡")
                          ? "⌨️"
                          : newKind === "calc" && (!n.icon || n.icon === "⚡")
                          ? "🔢"
                          : n.icon,
                      typingPassage:
                        newKind === "typing"
                          ? n.typingPassage || DEFAULT_TYPING_PASSAGES.ssc_en
                          : n.typingPassage,
                      targetWpm:
                        newKind === "typing" ? n.targetWpm || 35 : n.targetWpm,
                      durationMinutes:
                        newKind === "typing"
                          ? n.durationMinutes || 5
                          : n.durationMinutes,
                      calcMode:
                        newKind === "calc" ? n.calcMode || "mix" : n.calcMode,
                      calcDurationSeconds:
                        newKind === "calc"
                          ? n.calcDurationSeconds || 60
                          : n.calcDurationSeconds,
                    }));
                    saveStructure(next);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    fontSize: 12.5,
                    background: "#fff",
                    fontWeight: 650,
                  }}
                >
                  <option value="button">Button Page (Separate Page Container)</option>
                  <option value="folder">Folder (Quizzes & Mocks Container)</option>
                  <option value="typing">⌨️ Typing Skill Test (WPM & Accuracy)</option>
                  <option value="calc">⚡ Speed Math Calculation Drill (Vedic Tricks)</option>
                  <option value="mcq">Practice MCQ Quiz (500+ MCQs)</option>
                  <option value="mock">Full Mock Test (Timed Exam)</option>
                  <option value="notes">Study Notes / PDF Text</option>
                  <option value="section">Section</option>
                  <option value="html">Custom Web HTML</option>
                </select>
              </label>
              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  className="primary-btn"
                  onClick={() => {
                    setEditingMetaNodeId(null);
                    notify("Details saved");
                  }}
                >
                  <Check size={15} /> Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CONTAINER MODAL (BUTTON, FOLDER, SECTION, TYPING, CALC) */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="create-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="section-kicker">
                  {currentPageNode
                    ? `( CREATE ) CONTAINER INSIDE "${currentPageNode.title}"`
                    : "( CREATE ) CONTAINER FOR MAIN HOME SCREEN"}
                </span>
                <h2>
                  {currentPageNode
                    ? `Add Container inside "${currentPageNode.title}"`
                    : "Create New Home Button / Container"}
                </h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowCreate(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-copy">
              <b>( Create ) tool</b> se strictly structure containers add hote hain (Button, Folder, Section, Typing test, Speed calculation). Notes, MCQs, Mock Tests & Web code ke liye <b>(+) Content tool</b> ka prayog karein.
            </p>
            <div className="choice-grid">
              {(
                [
                  "button",
                  "folder",
                  "section",
                  "typing",
                  "calc",
                ] as Kind[]
              ).map(kind => (
                <button
                  className="choice-card"
                  key={kind}
                  onClick={() => requestCreateItemInCurrentPage(kind)}
                >
                  <span className={`choice-icon ${kindColor[kind]}`}>
                    {kind === "button" ? (
                      <LayoutGrid />
                    ) : kind === "folder" ? (
                      <FolderPlus />
                    ) : kind === "typing" ? (
                      <Keyboard />
                    ) : kind === "calc" ? (
                      <Calculator />
                    ) : (
                      <BookOpen />
                    )}
                  </span>
                  <span>
                    <b>{kindLabel[kind]}</b>
                    <small>
                      {kind === "button"
                        ? "Subject Button / Page Container"
                        : kind === "section"
                        ? "Topic Section Container"
                        : kind === "folder"
                        ? "Category Folder"
                        : kind === "typing"
                        ? "SSC CGL / CHSL Typing Test (WPM & Accuracy)"
                        : "Vedic Maths & Fast Calculation Drills"}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* (+) DIRECT CONTENT TOOL MODAL WITH AUTO-DETECTOR */}
      {showPlusTool && plusTargetNode && (
        <PlusContentToolModal
          targetNode={plusTargetNode}
          onClose={() => setShowPlusTool(false)}
          onSaveNotes={handlePlusSaveNotes}
          onSaveMcqs={handlePlusSaveMcqs}
          onSaveMock={handlePlusSaveMock}
          onSaveHtml={handlePlusSaveHtml}
        />
      )}

      {/* BULK 500+ MCQ AUTO-DETECTOR MODAL */}
      {showBulkMcq && currentPageNode && (
        <BulkMcqModal
          targetNode={currentPageNode}
          onClose={() => setShowBulkMcq(false)}
          onImport={handleBulkImportQuestions}
        />
      )}

      {/* LIVE APP PREVIEW */}
      {previewTargetId !== undefined && (
        <Preview
          nodes={nodes}
          settings={appSettings}
          initialNodeId={previewTargetId}
          onClose={() => setPreviewTargetId(undefined)}
          onUpdateNodes={saveStructure}
          onNotify={notify}
        />
      )}

      {/* HTML CODE & LIVE INTERACTIVE EDIT & VIEW MODAL */}
      {htmlCodeViewerNode && (
        <div className="modal-backdrop" onClick={() => setHtmlCodeViewerNode(null)}>
          <div className="create-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 840, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-head">
              <div>
                <span className="section-kicker">{"</>"} CUSTOM WEB & HTML EDITOR & VIEWER</span>
                <h2>{htmlCodeViewerNode.title}</h2>
              </div>
              <button className="close-button" onClick={() => setHtmlCodeViewerNode(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
              <span className="type-chip cyan">Edit HTML & Live Mobile Preview</span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, flex: 1, minHeight: 320, overflowY: "auto" }}>
              {/* EDITABLE CODE */}
              <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "#475569" }}>
                  <span>Edit HTML Source Code</span>
                  <button
                    type="button"
                    className="outline-btn small"
                    onClick={() => {
                      void navigator.clipboard.writeText(editableHtml);
                      showToast("info", "Copied", "HTML code copied to clipboard!");
                    }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <textarea
                  className="text-input"
                  value={editableHtml}
                  onChange={e => setEditableHtml(e.target.value)}
                  placeholder="Write or edit HTML code..."
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12.5,
                    color: "#0f172a",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: 10,
                    padding: 12,
                    flex: 1,
                    minHeight: 260,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              {/* LIVE RENDER PREVIEW */}
              <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                  Live Interactive Mobile Preview
                </div>
                <SandboxedHtmlView
                  htmlContent={editableHtml}
                  title={htmlCodeViewerNode.title}
                  minHeight={280}
                  style={{ flex: 1, minHeight: 280, border: "1px solid #cbd5e1" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" className="outline-btn" onClick={() => setHtmlCodeViewerNode(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  if (!htmlCodeViewerNode) return;
                  const updatedNodes = updateNodeHtmlRecursive(nodes, htmlCodeViewerNode.id, editableHtml);
                  setNodes(updatedNodes);
                  saveStructure(updatedNodes);
                  showToast("success", "Saved!", "HTML code updated & saved successfully.");
                  setHtmlCodeViewerNode(null);
                }}
              >
                <Check size={14} /> Save Changes & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSAL CONFIRMATION MODAL (CONFIRM BEFORE ADD & DELETE UPDATE) */}
      {confirmModal && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmModal(null)}
          style={{ zIndex: 120 }}
        >
          <div
            className="create-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 480, padding: 0, overflow: "hidden" }}
          >
            <div
              style={{
                padding: "18px 22px 14px",
                borderBottom: "1px solid #eef2f7",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                background:
                  confirmModal.variant === "danger"
                    ? "#fff5f5"
                    : confirmModal.variant === "emerald"
                    ? "#f0fdf4"
                    : "#f4f8ff",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    background:
                      confirmModal.variant === "danger"
                        ? "#fee2e2"
                        : confirmModal.variant === "emerald"
                        ? "#dcfce7"
                        : "#dbeafe",
                    color:
                      confirmModal.variant === "danger"
                        ? "#dc2626"
                        : confirmModal.variant === "emerald"
                        ? "#15803d"
                        : "#2563eb",
                  }}
                >
                  {confirmModal.variant === "danger" ? (
                    <Trash2 size={22} />
                  ) : confirmModal.variant === "emerald" ? (
                    <Upload size={22} />
                  ) : (
                    <CirclePlus size={22} />
                  )}
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color:
                        confirmModal.variant === "danger"
                          ? "#b91c1c"
                          : confirmModal.variant === "emerald"
                          ? "#15803d"
                          : "#2563eb",
                    }}
                  >
                    {confirmModal.badge || "CONFIRM ACTION"}
                  </span>
                  <h3
                    style={{
                      margin: "2px 0 0",
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {confirmModal.title}
                  </h3>
                </div>
              </div>
              <button
                className="close-button"
                onClick={() => setConfirmModal(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: "18px 22px 20px" }}>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#334155",
                  margin: "0 0 16px",
                  whiteSpace: "pre-wrap",
                }}
              >
                {confirmModal.description}
              </p>

              {(confirmModal.itemTitle || confirmModal.itemKind) && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <small
                      style={{
                        display: "block",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#64748b",
                        textTransform: "uppercase",
                      }}
                    >
                      Target Item
                    </small>
                    <b
                      style={{
                        fontSize: 13,
                        color: "#0f172a",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {confirmModal.itemTitle}
                    </b>
                  </div>
                  {confirmModal.itemKind && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: "#fff",
                        border: "1px solid #cbd5e1",
                        padding: "3px 8px",
                        borderRadius: 6,
                        color: "#475569",
                        flexShrink: 0,
                      }}
                    >
                      {confirmModal.itemKind}
                    </span>
                  )}
                </div>
              )}

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background:
                    confirmModal.variant === "danger" ? "#fff1f2" : "#eff6ff",
                  border: `1px solid ${
                    confirmModal.variant === "danger" ? "#fecdd3" : "#dbeafe"
                  }`,
                  marginBottom: 18,
                  fontSize: 11.5,
                  color:
                    confirmModal.variant === "danger" ? "#9f1239" : "#1e40af",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>
                  {confirmModal.variant === "danger"
                    ? "Confirm karne par ye database aur User App se permanently remove ho jayega."
                    : "Confirm karne par ye turant database me save hoga aur User App me update ho jayega."}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setConfirmModal(null)}
                  style={{ minWidth: 90 }}
                >
                  {confirmModal.cancelText || "Cancel"}
                </button>
                <button
                  type="button"
                  className={
                    confirmModal.variant === "danger"
                      ? "danger-btn"
                      : confirmModal.variant === "emerald"
                      ? "emerald-btn"
                      : "primary-btn"
                  }
                  onClick={() => {
                    confirmModal.onConfirm();
                  }}
                  style={{
                    minWidth: 120,
                    fontWeight: 700,
                  }}
                >
                  {confirmModal.variant === "danger" ? (
                    <Trash2 size={15} />
                  ) : confirmModal.variant === "emerald" ? (
                    <Upload size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  {confirmModal.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMMIT MESSAGE & SAVE CHANGES MODAL */}
      {showCommitModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCommitModal(false)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 540 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#10b981",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Upload size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    💾 Commit Changes & Publish
                  </h3>
                  <p
                    style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}
                  >
                    Commit message enter karein taaki changes note ke saath save aur
                    live sync ho jayein.
                  </p>
                </div>
              </div>
              <button
                className="close-btn"
                onClick={() => setShowCommitModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: "18px 20px" }}>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: 6,
                  }}
                >
                  📝 Commit Message (Required):
                </label>
                <input
                  type="text"
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  placeholder='e.g. "Added 50 MCQs for Ch-1 & updated Notes"'
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    fontSize: 13,
                    outline: "none",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleCommitSubmit();
                  }}
                  autoFocus
                />
              </div>

              {/* Quick Preset Commit Message Chips */}
              <div style={{ marginBottom: 16 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  ⚡ Quick Commit Presets (Click to select):
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    "✨ Added New MCQs Bank",
                    "📝 Updated Study Notes",
                    "📂 Reorganized Folders & Sections",
                    "⚙️ Updated App Branding & Colors",
                    "⏱️ Updated Mock Test Timer & Settings",
                    "🚀 Version Release Sync",
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCommitMsg(preset)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 16,
                        border: "1px solid #cbd5e1",
                        background:
                          commitMsg === preset ? "#e0f2fe" : "#f8fafc",
                        borderColor:
                          commitMsg === preset ? "#0284c7" : "#cbd5e1",
                        color: commitMsg === preset ? "#0369a1" : "#475569",
                        fontSize: 11.5,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Commit History Log */}
              {commitHistory.length > 0 && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "10px 12px",
                    maxHeight: 120,
                    overflowY: "auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#475569",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    📜 Recent Commit History ({commitHistory.length}):
                  </span>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {commitHistory.slice(0, 5).map(c => (
                      <div
                        key={c.id}
                        style={{
                          fontSize: 11,
                          display: "flex",
                          justifyContent: "space-between",
                          color: "#334155",
                          borderBottom: "1px dashed #e2e8f0",
                          paddingBottom: 3,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>✓ {c.msg}</span>
                        <span style={{ color: "#94a3b8" }}>{c.timestamp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className="modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "12px 20px",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <button
                type="button"
                className="outline-btn"
                onClick={() => setShowCommitModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="emerald-btn"
                onClick={handleCommitSubmit}
                style={{ fontWeight: 700 }}
              >
                <Check size={16} /> 🚀 Commit & Sync Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATABASE CONNECTION & SYNC MODAL */}
      {showDbModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowDbModal(false)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: 600 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: dbConfigState.isConfigured
                      ? "rgba(16, 185, 129, 0.12)"
                      : "rgba(239, 68, 68, 0.12)",
                    color: dbConfigState.isConfigured ? "#10b981" : "#ef4444",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Database size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    ⚡ Supabase Database Connection & Sync
                  </h3>
                  <p
                    style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}
                  >
                    Deploy hone ke baad Vercel ya live domain par persistent sync ke liye Supabase credentials yahan enter karein.
                  </p>
                </div>
              </div>
              <button
                className="close-btn"
                onClick={() => setShowDbModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: "18px 20px" }}>
              {/* CURRENT STATUS BANNER */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  marginBottom: 16,
                  background: dbConfigState.isConfigured ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${
                    dbConfigState.isConfigured ? "#bbf7d0" : "#fecaca"
                  }`,
                  color: dbConfigState.isConfigured ? "#166534" : "#991b1b",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                {dbConfigState.isConfigured ? (
                  <Check size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                )}
                <div>
                  <strong style={{ fontSize: 13, display: "block" }}>
                    {dbConfigState.isConfigured
                      ? `🟢 Connected to Supabase (${dbConfigState.source === "env" ? "Vercel Env Vars" : "Direct Admin Credentials"})`
                      : "🔴 Database Not Connected (Running in Local Storage Only)"}
                  </strong>
                  <span style={{ fontSize: 11.5, opacity: 0.9, display: "block", marginTop: 2 }}>
                    {dbConfigState.isConfigured
                      ? "Aapke dwara kiye gaye saare changes live Supabase table me save ho rahe hain aur sabhi users ke paas instant sync honge."
                      : "Vercel par deploy karne ke baad bina Supabase credentials ke data sirf is browser ki local memory me rahega. Live app ke sabhi users tak content pahunchane ke liye niche Supabase details dalein."}
                  </span>
                </div>
              </div>

              {dbStatusMsg && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 14,
                    background: dbStatusMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
                    border: `1px solid ${dbStatusMsg.startsWith("✅") ? "#86efac" : "#fca5a5"}`,
                    color: dbStatusMsg.startsWith("✅") ? "#15803d" : "#b91c1c",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {dbStatusMsg}
                </div>
              )}

              {/* CREDENTIALS FORM */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. https://xyz.supabase.co"
                    value={dbUrlInput}
                    onChange={e => setDbUrlInput(e.target.value)}
                    style={{ width: "100%", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                    Supabase Anon Public Key
                  </label>
                  <textarea
                    className="text-input"
                    placeholder="eyJhYmdj... (Supabase Anon Key)"
                    value={dbKeyInput}
                    onChange={e => setDbKeyInput(e.target.value)}
                    rows={2}
                    style={{ width: "100%", fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                  />
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleTestAndSaveDb}
                  disabled={dbTesting}
                  style={{ fontWeight: 700, padding: "8px 16px" }}
                >
                  <Zap size={15} /> {dbTesting ? "Testing Connection..." : "Test & Connect Database (कनेक्ट करें)"}
                </button>

                {dbConfigState.isConfigured && (
                  <button
                    type="button"
                    className="emerald-btn"
                    onClick={handleForceSyncDb}
                    disabled={dbTesting}
                    style={{ fontWeight: 700, padding: "8px 16px" }}
                  >
                    <Upload size={15} /> Force Sync Local Data to Supabase
                  </button>
                )}

                {dbConfigState.source === "local" && (
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={handleDisconnectDb}
                    style={{ color: "#ef4444", borderColor: "#fca5a5" }}
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* VERCEL DEPLOYMENT ENVIRONMENT GUIDE */}
              <div
                style={{
                  marginTop: 20,
                  padding: "14px",
                  borderRadius: 10,
                  background: "#0f172a",
                  color: "#e2e8f0",
                  fontSize: 11.5,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: 6, fontSize: 12 }}>
                  🚀 Vercel Environment Variables Guide (Permanent Deployment Fix)
                </div>
                <p style={{ margin: "0 0 8px", color: "#94a3b8" }}>
                  Agar aap chahte hain ki Vercel par bina modal khole automatic database connect ho jaye, to Vercel Dashboard me ye 2 Environment Variables add karein:
                </p>
                <div style={{ fontFamily: "monospace", background: "#1e293b", padding: "8px 12px", borderRadius: 6, fontSize: 11, color: "#f1f5f9" }}>
                  <div><b>VITE_SUPABASE_URL</b> = {dbUrlInput || "https://your-project.supabase.co"}</div>
                  <div><b>VITE_SUPABASE_ANON_KEY</b> = {dbKeyInput ? dbKeyInput.slice(0, 20) + "..." : "your-supabase-anon-key"}</div>
                </div>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#cbd5e1", fontSize: 11 }}>Supabase Table Name: <b>studybull_app_state</b></span>
                  <button
                    className="outline-btn small"
                    onClick={() => {
                      void navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                      notify("Supabase SQL Schema copied!");
                    }}
                    style={{ background: "#334155", borderColor: "#475569", color: "#fff", fontSize: 11 }}
                  >
                    <Copy size={12} /> Copy SQL Schema
                  </button>
                </div>
              </div>
            </div>

            <div
              className="modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "12px 20px",
                borderTop: "1px solid #f1f5f9",
              }}
            >
              <button
                type="button"
                className="outline-btn"
                onClick={() => setShowDbModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN POPUP TOAST NOTIFICATIONS OVERLAY */}
      <div className="admin-toast-container">
        {toastList.map(t => (
          <div key={t.id} className={`admin-toast-card ${t.type}`}>
            <div className="toast-icon">
              {t.type === "success" && <Check size={16} />}
              {t.type === "error" && <X size={16} />}
              {t.type === "warning" && <AlertTriangle size={16} />}
              {t.type === "info" && <Zap size={16} />}
            </div>
            <div className="toast-content">
              <b>{t.title}</b>
              {t.message && <p>{t.message}</p>}
            </div>
            <button
              className="toast-close"
              onClick={() =>
                setToastList(prev => prev.filter(x => x.id !== t.id))
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
