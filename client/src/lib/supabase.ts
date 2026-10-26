import { createClient, SupabaseClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  if (!cleaned || cleaned.includes("your-project-id")) return "";

  // Handle Supabase Dashboard URL if pasted by mistake:
  // e.g. https://supabase.com/dashboard/project/abcdefghijklm/...
  const dashMatch = cleaned.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  if (dashMatch?.[1]) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  // Handle Postgres connection string if pasted by mistake:
  // e.g. postgresql://postgres.[ref]:...@aws-0-...pooler.supabase.com... or @db.[ref].supabase.co
  const pgPoolerMatch = cleaned.match(/postgres\.([a-z0-9-]+)[:@]/i);
  if (pgPoolerMatch?.[1]) {
    return `https://${pgPoolerMatch[1]}.supabase.co`;
  }
  const pgDbMatch = cleaned.match(/@db\.([a-z0-9-]+)\.supabase\.co/i);
  if (pgDbMatch?.[1]) {
    return `https://${pgDbMatch[1]}.supabase.co`;
  }

  // If just a project reference ID was provided (e.g. "abcdefghijklm")
  if (/^[a-z0-9]{15,30}$/i.test(cleaned)) {
    return `https://${cleaned}.supabase.co`;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    const parsed = new URL(withProtocol);
    if (
      !parsed.hostname.endsWith(".supabase.co") &&
      !parsed.hostname.endsWith(".supabase.in")
    ) {
      return "";
    }
    // Always use only the origin (https://<ref>.supabase.co) so extra paths never break PostgREST URLs
    return parsed.origin;
  } catch {
    return "";
  }
}

function normalizeSupabaseKey(raw: string | undefined): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "").trim();
  if (
    !cleaned ||
    cleaned.includes("your-supabase-anon-key") ||
    cleaned.length < 20
  ) {
    return "";
  }
  return cleaned;
}

// Built-in permanent fallback credentials
export const BUILTIN_SUPABASE_URL = "https://epsplspwdjjjjezxscer.supabase.co";
export const BUILTIN_SUPABASE_KEY = "sb_publishable_X8IsGDLwK9fUliHih60dlg_vqyOiePl";

export function getStoredSupabaseConfig() {
  let localUrl = "";
  let localKey = "";
  try {
    localUrl = localStorage.getItem("studybull_supabase_url") || "";
    localKey = localStorage.getItem("studybull_supabase_key") || "";
  } catch {
    // ignore localStorage errors
  }

  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const url =
    normalizeSupabaseUrl(localUrl) ||
    normalizeSupabaseUrl(envUrl) ||
    normalizeSupabaseUrl(BUILTIN_SUPABASE_URL);

  const key =
    normalizeSupabaseKey(localKey) ||
    normalizeSupabaseKey(envKey) ||
    normalizeSupabaseKey(BUILTIN_SUPABASE_KEY);

  const source: "local" | "env" | "builtin" | "none" =
    localUrl && localKey && url && key
      ? "local"
      : envUrl && envKey && url && key
      ? "env"
      : BUILTIN_SUPABASE_URL && BUILTIN_SUPABASE_KEY && url && key
      ? "builtin"
      : "none";

  return { url, key, source, isConfigured: Boolean(url && key) };
}

let currentConfig = getStoredSupabaseConfig();
export let isSupabaseConfigured = currentConfig.isConfigured;

export let supabase: SupabaseClient | null = currentConfig.isConfigured
  ? createClient(currentConfig.url, currentConfig.key, {
      auth: { persistSession: false },
    })
  : null;

export function setSupabaseCredentials(rawUrl: string, rawKey: string): { success: boolean; message: string } {
  const normUrl = normalizeSupabaseUrl(rawUrl);
  const normKey = normalizeSupabaseKey(rawKey);

  if (!normUrl) {
    return { success: false, message: "Invalid Supabase URL. Please copy the project URL (e.g. https://xyz.supabase.co)." };
  }
  if (!normKey) {
    return { success: false, message: "Invalid Supabase Anon Key. Please paste your anon public key." };
  }

  try {
    localStorage.setItem("studybull_supabase_url", normUrl);
    localStorage.setItem("studybull_supabase_key", normKey);
  } catch {
    return { success: false, message: "Failed to write credentials to browser storage." };
  }

  currentConfig = getStoredSupabaseConfig();
  isSupabaseConfigured = currentConfig.isConfigured;
  supabase = createClient(normUrl, normKey, {
    auth: { persistSession: false },
  });

  return { success: true, message: "Supabase credentials updated successfully!" };
}

export function clearSupabaseCredentials() {
  try {
    localStorage.removeItem("studybull_supabase_url");
    localStorage.removeItem("studybull_supabase_key");
  } catch {
    // ignore
  }
  currentConfig = getStoredSupabaseConfig();
  isSupabaseConfigured = currentConfig.isConfigured;
  supabase = currentConfig.isConfigured
    ? createClient(currentConfig.url, currentConfig.key, {
        auth: { persistSession: false },
      })
    : null;
}

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  if (!supabase) {
    return { success: false, message: "Supabase is not configured yet. Please provide URL & Anon Key." };
  }

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("id")
      .eq("id", SUPABASE_MAIN_ROW_ID)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return {
          success: false,
          message: `Table "${SUPABASE_TABLE}" does not exist in Supabase! Please run the SQL Schema in your Supabase SQL Editor.`,
        };
      }
      return {
        success: false,
        message: `Supabase Error: ${error.message || "Could not access table"} (Code: ${error.code})`,
      };
    }

    return {
      success: true,
      message: data
        ? `Successfully connected! Existing database row found.`
        : `Successfully connected to Supabase! (Database table is ready)`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Network/Connection error: ${err?.message || "Failed to connect to Supabase"}`,
    };
  }
}

export const SUPABASE_TABLE = "studybull_app_state";
export const SUPABASE_MAIN_ROW_ID = "main";

export interface StudyBullRemoteRow<TNode = unknown, TSettings = unknown> {
  id: string;
  nodes: TNode[];
  settings: Partial<TSettings>;
  updated_at?: string;
}

/* ============================================================================
 * SPLIT DATA LAYOUT (Oct 26 2026)
 * The site's content used to be ONE row ("main", ~3.5 MB). Saving it took 4–13 s and sometimes failed
 * with HTTP 500, silently. Now:
 *   - row "tile:<tileId>": nodes = [{ id, children[, passages] }] = one home tile's whole content,
 *                          settings = { _v: <version>, tile }
 *   - row "index":         nodes = home tiles WITHOUT content (+ _sb marker), settings = app settings
 *                          WITHOUT passcodes + settings._split = { mainAt, v, tiles: { <tileId>: <version> } }
 *   - row "main":          the old single row — still written (in the background) for compatibility.
 *                          Passcodes stay only here.
 * A save writes ONLY the tile rows whose content changed, then the small index row, then (background)
 * the old row. New rows use updated_at = 2000-01-01 so old app bundles that read "the newest row" keep
 * reading "main". A failed save shows a visible red message and is retried once.
 * ========================================================================== */
const SPLIT_INDEX_ID = "index";
const SPLIT_OLD_TS = "2000-01-01T00:00:00+00:00";
const HEAVY_KEYS = ["children", "passages"];
const SECRET_SETTINGS_KEYS = ["passcodes"];
const LEGACY_SLACK_MS = 2000;

let splitReady = false; // index + every tile row loaded and matching
let lastSavedTileJson = new Map<string, string>(); // tileId -> heavy JSON confirmed in the database
let lastSavedTileBytes = new Map<string, number>();
let currentTileVersions: Record<string, string> = {};
let lastLocalWriteAt = ""; // updated_at of the newest "main" copy this tab wrote

const tileRowId = (id: unknown) => `tile:${String(id)}`;
const newVersion = () => `${new Date().toISOString()}~${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const byteLen = (s: string) => {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
};

function splitNode(n: any): { light: Record<string, unknown>; heavy: Record<string, unknown> } {
  const light: Record<string, unknown> = {};
  const heavy: Record<string, unknown> = { id: n?.id };
  for (const k of Object.keys(n || {})) {
    if (HEAVY_KEYS.includes(k)) heavy[k] = n[k];
    else light[k] = n[k];
  }
  return { light, heavy };
}

function publicSettings(settings: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (settings && typeof settings === "object") {
    for (const [k, v] of Object.entries(settings as Record<string, unknown>)) {
      if (!SECRET_SETTINGS_KEYS.includes(k) && k !== "_split") out[k] = v;
    }
  }
  return out;
}

function isNewer(a?: string | null, b?: string | null): boolean {
  if (!a) return false;
  const ta = Date.parse(a);
  const tb = b ? Date.parse(b) : 0;
  if (Number.isNaN(ta)) return false;
  return ta > (Number.isNaN(tb) ? 0 : tb) + LEGACY_SLACK_MS;
}

function rememberBaseline(nodes: any[], versions: Record<string, string>) {
  lastSavedTileJson = new Map();
  lastSavedTileBytes = new Map();
  for (const n of nodes) {
    const hj = JSON.stringify(splitNode(n).heavy);
    lastSavedTileJson.set(String(n?.id), hj);
    lastSavedTileBytes.set(String(n?.id), byteLen(hj));
  }
  currentTileVersions = { ...versions };
  splitReady = true;
}

/* ---------- visible save status (works without touching the editor UI code) ---------- */
type SaveInfo = { ok: boolean; state: "saving" | "saved" | "error"; ms?: number; rows?: number; error?: string; at: string };
let statusHideTimer: ReturnType<typeof setTimeout> | null = null;
let retryHandler: (() => void) | null = null;

function showSaveStatus(info: SaveInfo) {
  if (typeof document === "undefined") return;
  try {
    (window as any).__sbLastSave = info;
    document.documentElement.setAttribute("data-sb-save-status", info.state);
    let box = document.getElementById("sb-save-status");
    if (!box) {
      box = document.createElement("div");
      box.id = "sb-save-status";
      box.setAttribute("role", "status");
      box.style.cssText =
        "position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:min(92vw,420px);font:600 13px/1.4 system-ui,sans-serif;border-radius:12px;padding:10px 14px;box-shadow:0 6px 24px rgba(0,0,0,.18);display:none;";
      document.body.appendChild(box);
    }
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }
    box.innerHTML = "";
    box.style.display = "block";
    if (info.state === "saving") {
      box.style.background = "#1e3a8a";
      box.style.color = "#fff";
      box.textContent = "⏳ सेव हो रहा है… (Saving)";
    } else if (info.state === "saved") {
      box.style.background = "#065f46";
      box.style.color = "#fff";
      box.textContent = `✅ सेव हो गया (Saved) • ${((info.ms || 0) / 1000).toFixed(1)} s`;
      statusHideTimer = setTimeout(() => {
        if (box) box.style.display = "none";
      }, 2500);
    } else {
      box.style.background = "#b91c1c";
      box.style.color = "#fff";
      const msg = document.createElement("div");
      msg.textContent = `❌ सेव नहीं हुआ (Save failed) — बदलाव अभी database में नहीं गए। ${info.error ? "(" + info.error + ")" : ""}`;
      box.appendChild(msg);
      const row = document.createElement("div");
      row.style.cssText = "margin-top:8px;display:flex;gap:8px;";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "🔄 फिर से सेव करें (Retry)";
      retry.style.cssText = "background:#fff;color:#b91c1c;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;";
      retry.onclick = () => retryHandler && retryHandler();
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "✕";
      close.style.cssText = "background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:6px 10px;cursor:pointer;";
      close.onclick = () => {
        if (box) box.style.display = "none";
      };
      row.appendChild(retry);
      row.appendChild(close);
      box.appendChild(row);
    }
  } catch {
    // never let the status UI break saving
  }
}

/**
 * Fetches current state (split rows; falls back to the old single row) without uploading seed data.
 * If nothing exists yet, returns null so the app remains at 0 items until the admin adds data.
 */
export async function fetchStudyBullStateFromSupabase<TNode = unknown, TSettings = unknown>(): Promise<{
  nodes: TNode[];
  settings: Partial<TSettings>;
  updatedAt?: string;
} | null> {
  if (!supabase) return null;
  const client = supabase;

  try {
    const [mainRes, idxRes, tilesRes] = await Promise.all([
      client.from(SUPABASE_TABLE).select("id, settings, updated_at").eq("id", SUPABASE_MAIN_ROW_ID).maybeSingle(),
      client.from(SUPABASE_TABLE).select("id, nodes, settings").eq("id", SPLIT_INDEX_ID).maybeSingle(),
      client.from(SUPABASE_TABLE).select("id, nodes, settings").like("id", "tile:%"),
    ]);
    const main: any = mainRes.data;
    const idx: any = idxRes.data;
    const split = idx?.settings?._split;
    const mainSettings = main?.settings && typeof main.settings === "object" ? main.settings : null;

    let useSplit = Boolean(!idxRes.error && !tilesRes.error && idx && Array.isArray(idx.nodes) && split && split.tiles);
    // An older admin tab wrote only the old row after the last split save → the old row is the truth
    if (useSplit && main?.updated_at && isNewer(main.updated_at, split.mainAt)) useSplit = false;

    if (useSplit) {
      const byId = new Map<string, any>((tilesRes.data || []).map((r: any) => [String(r.id), r]));
      const nodes: any[] = [];
      for (const l of idx.nodes) {
        const { _sb, ...light } = l || {};
        const row = byId.get(String(_sb?.row || tileRowId(light.id)));
        const heavyRow = row && Array.isArray(row.nodes) ? row.nodes[0] : null;
        if (!heavyRow) {
          useSplit = false;
          break;
        }
        const { id: _ignored, ...heavy } = heavyRow;
        nodes.push({ ...light, ...heavy });
      }
      if (useSplit) {
        rememberBaseline(nodes, split.tiles || {});
        return {
          nodes: nodes as TNode[],
          settings: (mainSettings || publicSettings(idx.settings)) as Partial<TSettings>,
          updatedAt: main?.updated_at,
        };
      }
    }

    // Fallback: the old single row
    const { data, error } = await client
      .from(SUPABASE_TABLE)
      .select("id, nodes, settings, updated_at")
      .eq("id", SUPABASE_MAIN_ROW_ID)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    const nodes = Array.isArray(data.nodes) ? (data.nodes as TNode[]) : [];
    const settings = data.settings && typeof data.settings === "object" ? (data.settings as Partial<TSettings>) : {};
    // Split rows missing or older than the old row: rebuild them from it (same content, background)
    splitReady = false;
    lastSavedTileJson = new Map();
    currentTileVersions = {};
    if (nodes.length > 0) {
      void runSave({ nodes: nodes as unknown[], settings, at: data.updated_at, skipMain: true });
    }
    return { nodes, settings, updatedAt: data.updated_at };
  } catch {
    return null;
  }
}

type SavePayload = { nodes: unknown[]; settings: unknown; at?: string; skipMain?: boolean };

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastPendingPayload: SavePayload | null = null;
let saveRunning = false;
let saveQueued: SavePayload | null = null;
let saveWaiters: Array<(ok: boolean) => void> = [];

function runSave(payload: SavePayload): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    saveWaiters.push(resolve);
    saveQueued = payload;
    if (!saveRunning) void pumpSaves();
  });
}

async function pumpSaves() {
  saveRunning = true;
  try {
    while (saveQueued) {
      const p = saveQueued;
      saveQueued = null;
      const waiters = saveWaiters.splice(0);
      const ok = await saveWithRetry(p);
      waiters.forEach(w => w(ok));
    }
  } finally {
    saveRunning = false;
  }
}

async function saveWithRetry(p: SavePayload): Promise<boolean> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  showSaveStatus({ ok: false, state: "saving", at: new Date().toISOString() });
  let r = await saveSplitOnce(p);
  if (!r.ok) {
    await sleep(1500);
    r = await saveSplitOnce(p);
  }
  const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
  if (r.ok) {
    retryHandler = null;
    showSaveStatus({ ok: true, state: "saved", ms, rows: r.rows, at: new Date().toISOString() });
  } else {
    retryHandler = () => {
      void runSave(lastPendingPayload || p);
    };
    console.warn("[Supabase] Save failed after retry:", r.error);
    showSaveStatus({ ok: false, state: "error", ms, error: r.error, at: new Date().toISOString() });
  }
  return r.ok;
}

async function saveSplitOnce(p: SavePayload): Promise<{ ok: boolean; rows?: number; error?: string }> {
  if (!supabase) return { ok: false, error: "database not configured" };
  const client = supabase;
  try {
    const nodes: any[] = Array.isArray(p.nodes) ? (p.nodes as any[]) : [];
    const at = p.at || new Date().toISOString();
    const lights: any[] = [];
    const changed: any[] = [];
    const nextJson = new Map<string, string>();
    const nextBytes = new Map<string, number>();
    const nextVersions: Record<string, string> = {};

    for (const n of nodes) {
      const id = String(n?.id);
      const { light, heavy } = splitNode(n);
      const hj = JSON.stringify(heavy);
      let v = currentTileVersions[id];
      let b = lastSavedTileBytes.get(id) || 0;
      if (!splitReady || !v || lastSavedTileJson.get(id) !== hj) {
        v = newVersion();
        b = byteLen(hj);
        changed.push({ id: tileRowId(id), nodes: [heavy], settings: { _v: v, tile: n?.id }, updated_at: SPLIT_OLD_TS });
      }
      nextJson.set(id, hj);
      nextBytes.set(id, b);
      nextVersions[id] = v;
      lights.push({
        ...light,
        _sb: {
          row: tileRowId(id),
          v,
          n: Array.isArray(n?.children) ? n.children.length : 0,
          heavy: HEAVY_KEYS.filter(k => n && k in n),
          b,
        },
      });
    }

    // 1) changed tile rows (in parallel) — readers only learn a new version after its row is in place
    if (changed.length > 0) {
      const results = await Promise.all(changed.map(row => client.from(SUPABASE_TABLE).upsert(row, { onConflict: "id" })));
      const bad = results.find(r => r.error);
      if (bad && bad.error) return { ok: false, error: `${bad.error.code || ""} ${bad.error.message || "tile save error"}`.trim() };
    }

    // 2) the small index row (order, titles, settings without passcodes, versions)
    const index = {
      id: SPLIT_INDEX_ID,
      nodes: lights,
      settings: { ...publicSettings(p.settings), _split: { format: 1, mainAt: at, v: newVersion(), tiles: nextVersions } },
      updated_at: SPLIT_OLD_TS,
    };
    const { error: idxErr } = await client.from(SUPABASE_TABLE).upsert(index, { onConflict: "id" });
    if (idxErr) return { ok: false, error: `${idxErr.code || ""} ${idxErr.message || "index save error"}`.trim() };

    lastSavedTileJson = nextJson;
    lastSavedTileBytes = nextBytes;
    currentTileVersions = nextVersions;
    splitReady = true;

    // 3) compatibility copy in the old single row (one week) — background, never blocks the editor
    if (!p.skipMain) queueMainWrite({ nodes, settings: p.settings, at });
    return { ok: true, rows: changed.length + 1 };
  } catch (err: any) {
    return { ok: false, error: err?.message || "network error" };
  }
}

/* ---------- background write of the old single row "main" (compatibility + passcodes) ---------- */
let mainPending: { nodes: unknown[]; settings: unknown; at: string } | null = null;
let mainRunning = false;

function queueMainWrite(p: { nodes: unknown[]; settings: unknown; at: string }) {
  mainPending = p;
  if (!mainRunning) void pumpMain();
}

async function writeMain(p: { nodes: unknown[]; settings: unknown; at: string }): Promise<string | null> {
  if (!supabase) return "database not configured";
  try {
    lastLocalWriteAt = p.at;
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert({ id: SUPABASE_MAIN_ROW_ID, nodes: p.nodes, settings: p.settings, updated_at: p.at }, { onConflict: "id" });
    return error ? `${error.code || ""} ${error.message || "main save error"}`.trim() : null;
  } catch (err: any) {
    return err?.message || "network error";
  }
}

async function pumpMain() {
  mainRunning = true;
  try {
    while (mainPending) {
      const p = mainPending;
      mainPending = null;
      let err = await writeMain(p);
      if (err && !mainPending) {
        await sleep(3000);
        if (!mainPending) err = await writeMain(p);
      }
      if (err && !mainPending) {
        console.warn("[Supabase] Old-row (main) copy failed:", err);
        retryHandler = () => queueMainWrite(p);
        showSaveStatus({ ok: false, state: "error", error: `पुरानी कॉपी (main) — ${err}`, at: new Date().toISOString() });
      }
    }
  } finally {
    mainRunning = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", e => {
    if (saveRunning || mainRunning || saveDebounceTimer) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

/**
 * Saves the admin's nodes and settings with debouncing (avoids 429s). Only changed tiles are written.
 */
export async function saveStudyBullStateToSupabase<TNode = unknown, TSettings = unknown>(
  nodes: TNode[],
  settings: TSettings,
  immediate = false
): Promise<boolean> {
  if (!supabase) return false;

  lastPendingPayload = { nodes: nodes as unknown[], settings: settings as unknown };

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }

  if (immediate) {
    return runSave(lastPendingPayload);
  }

  return new Promise<boolean>(resolve => {
    saveDebounceTimer = setTimeout(async () => {
      saveDebounceTimer = null;
      const payload = lastPendingPayload;
      if (!payload) return resolve(false);
      resolve(await runSave(payload));
    }, 800);
  });
}

/**
 * Subscribes to live changes of the old row (only when Realtime is enabled on the table).
 * Ignores this tab's own background copies so an older copy can never overwrite newer edits.
 */
export function subscribeToStudyBullState<TNode = unknown, TSettings = unknown>(
  onUpdate: (payload: { nodes: TNode[]; settings: Partial<TSettings> }) => void
): () => void {
  if (!supabase) return () => {};

  let isSubscribed = true;

  const channel = supabase
    .channel("studybull-live-sync")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: SUPABASE_TABLE,
        filter: `id=eq.${SUPABASE_MAIN_ROW_ID}`,
      },
      payload => {
        if (!isSubscribed) return;
        const nextRow = payload.new as StudyBullRemoteRow<TNode, TSettings> | undefined;
        if (!nextRow) return;
        if (saveRunning || mainRunning || saveDebounceTimer) return;
        if (nextRow.updated_at && lastLocalWriteAt && !isNewer(nextRow.updated_at, lastLocalWriteAt)) return;
        if (!Array.isArray(nextRow.nodes)) return;
        onUpdate({
          nodes: nextRow.nodes,
          settings:
            nextRow.settings && typeof nextRow.settings === "object"
              ? nextRow.settings
              : {},
        });
      }
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[Supabase Realtime] Channel notice:", status, err?.message);
      }
    });

  return () => {
    isSubscribed = false;
    void supabase?.removeChannel(channel);
  };
}

export const SUPABASE_SQL_SCHEMA = `create table if not exists public.studybull_app_state (
  id text primary key default 'main',
  nodes jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS and create explicit policies to satisfy Supabase security advisor
alter table public.studybull_app_state enable row level security;

drop policy if exists "Allow public read access" on public.studybull_app_state;
create policy "Allow public read access" on public.studybull_app_state for select using (true);

drop policy if exists "Allow public insert access" on public.studybull_app_state;
create policy "Allow public insert access" on public.studybull_app_state for insert with check (true);

drop policy if exists "Allow public update access" on public.studybull_app_state;
create policy "Allow public update access" on public.studybull_app_state for update using (true);

drop policy if exists "Allow public upsert access" on public.studybull_app_state;
create policy "Allow public upsert access" on public.studybull_app_state for all using (true) with check (true);

grant all on table public.studybull_app_state to anon, authenticated, service_role;

-- Clean up unused experimental tables if any
drop table if exists public.custom_features;`;

export async function diagnoseSupabaseStatus(): Promise<void> {
  console.group("[Supabase Diagnostic Utility]");
  const config = getStoredSupabaseConfig();
  console.log("Configuration Source:", config.source);
  console.log("Supabase URL:", config.url || "Not Set");
  console.log("Is Configured:", config.isConfigured);

  if (!supabase) {
    console.error("❌ Supabase client is not initialized. Please configure URL and Anon Key.");
    console.groupEnd();
    return;
  }

  try {
    console.log(`Checking table "${SUPABASE_TABLE}"...`);
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("*")
      .eq("id", SUPABASE_MAIN_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase Query Error:", error.message, "(Code:", error.code, ")");
      if (error.code === "42P01") {
        console.warn(`⚠️ Table "${SUPABASE_TABLE}" does not exist. Please run the SQL reset script in your Supabase SQL Editor.`);
      }
    } else {
      console.log("✅ Successfully connected to Supabase table:", SUPABASE_TABLE);
      console.log("📊 Record status:", data ? "Row 'main' exists" : "Table is empty (no 'main' row yet)");
    }
  } catch (err: any) {
    console.error("❌ Network or Exception during Supabase diagnostic:", err?.message || err);
  }
  console.groupEnd();
}

// Auto-run diagnostic in development/console if window is available
if (typeof window !== "undefined") {
  (window as any).diagnoseSupabase = diagnoseSupabaseStatus;
}

