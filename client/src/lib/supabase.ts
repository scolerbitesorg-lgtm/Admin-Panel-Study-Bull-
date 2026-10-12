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

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined
);
const supabaseAnonKey = normalizeSupabaseKey(
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

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

alter table public.studybull_app_state disable row level security;
grant all on table public.studybull_app_state to anon, authenticated, service_role;`;
