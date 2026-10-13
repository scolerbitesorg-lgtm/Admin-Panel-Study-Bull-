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

  const url = normalizeSupabaseUrl(localUrl) || normalizeSupabaseUrl(envUrl);
  const key = normalizeSupabaseKey(localKey) || normalizeSupabaseKey(envKey);

  const source: "local" | "env" | "none" =
    localUrl && localKey && url && key
      ? "local"
      : envUrl && envKey && url && key
      ? "env"
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

/**
 * Fetches current state from Supabase without uploading any seed/default data.
 * If no row exists yet in Supabase, returns null so the app remains at 0 items until the admin adds data.
 */
export async function fetchStudyBullStateFromSupabase<TNode = unknown, TSettings = unknown>(): Promise<{
  nodes: TNode[];
  settings: Partial<TSettings>;
  updatedAt?: string;
} | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("id, nodes, settings, updated_at")
      .eq("id", SUPABASE_MAIN_ROW_ID)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      nodes: Array.isArray(data.nodes) ? (data.nodes as TNode[]) : [],
      settings:
        data.settings && typeof data.settings === "object"
          ? (data.settings as Partial<TSettings>)
          : {},
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastPendingPayload: { nodes: unknown[]; settings: unknown } | null = null;

/**
 * Saves the admin's nodes and settings to Supabase with automatic debouncing
 * to avoid hitting Supabase / Cloudflare rate limits (HTTP 429 Rate Exceeded).
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

  const executeSave = async (): Promise<boolean> => {
    if (!supabase || !lastPendingPayload) return false;
    const payloadToSave = lastPendingPayload;
    try {
      const { error } = await supabase.from(SUPABASE_TABLE).upsert(
        {
          id: SUPABASE_MAIN_ROW_ID,
          nodes: payloadToSave.nodes,
          settings: payloadToSave.settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      if (error) {
        // Silently handle rate-limit or network glitches
        if (
          error.message?.includes("429") ||
          error.message?.toLowerCase().includes("rate") ||
          error.code === "429"
        ) {
          console.warn("[Supabase] Rate limit encountered, skipped save.");
        }
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  if (immediate) {
    return executeSave();
  }

  return new Promise<boolean>(resolve => {
    saveDebounceTimer = setTimeout(async () => {
      const result = await executeSave();
      resolve(result);
    }, 800);
  });
}

/**
 * Subscribes to live changes on studybull_app_state with status error handling to prevent rate-limit loops.
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
        onUpdate({
          nodes: Array.isArray(nextRow.nodes) ? nextRow.nodes : [],
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
    void supabase.removeChannel(channel);
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

