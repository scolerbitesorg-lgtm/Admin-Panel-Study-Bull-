import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/* 📊 VIEWS — how many people opened the user site, day by day (Aarav, Oct 26 2026 11:04 PM).
 * Data: table public.studybull_views (one row per India-date per page: '_site' or 'tile:<home button>').
 * The user site only adds +1 through the function studybull_track_visit (via its /api/hit route);
 * only the admin email login can read the table (Row Level Security). Created by studybull_views.sql. */

type Row = { day: string; page: string; visitors: number; opens: number; new_visitors: number; updated_at?: string };

function istDay(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400000).toISOString().slice(0, 10);
}

const HI_MONTHS = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सितं", "अक्टू", "नवं", "दिसं"];
function shortDate(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${HI_MONTHS[(m || 1) - 1]}`;
}
const fmt = (n: number) => n.toLocaleString("en-IN");

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5eaf2", borderRadius: 16, padding: "14px 14px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1.15, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, max, right, color }: { label: string; value: number; max: number; right: string; color: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", alignItems: "center", gap: 8, padding: "5px 0" }}>
      <div style={{ fontSize: 12.5, color: "#334155", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ height: 14, background: "#eef2f7", borderRadius: 7, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 7, transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 800, whiteSpace: "nowrap", textAlign: "right" }}>{right}</div>
    </div>
  );
}

export default function ViewsStatsView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [allSite, setAllSite] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "pending" | "error">("loading");
  const [err, setErr] = useState("");
  const [range, setRange] = useState<7 | 30>(7);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = async () => {
    if (!supabase) {
      setState("error");
      setErr("डेटाबेस कनेक्ट नहीं है");
      return;
    }
    setState(s => (s === "ok" ? "ok" : "loading"));
    try {
      const since = istDay(29);
      const [recent, site] = await Promise.all([
        supabase.from("studybull_views").select("day,page,visitors,opens,new_visitors,updated_at").gte("day", since).limit(5000),
        supabase.from("studybull_views").select("day,page,visitors,opens,new_visitors").eq("page", "_site").limit(5000),
      ]);
      const e = recent.error || site.error;
      if (e) {
        const msg = `${(e as any).code || ""} ${e.message || ""}`;
        if (/PGRST205|42P01|does not exist|Could not find the table|schema cache/i.test(msg)) {
          setState("pending");
        } else {
          setState("error");
          setErr(e.message || "पढ़ नहीं पाए");
        }
        return;
      }
      setRows((recent.data || []) as Row[]);
      setAllSite((site.data || []) as Row[]);
      setLoadedAt(new Date());
      setState("ok");
    } catch (x: any) {
      setState("error");
      setErr(x?.message || "नेटवर्क एरर");
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    const site = new Map<string, Row>();
    rows.filter(r => r.page === "_site").forEach(r => site.set(r.day, r));
    const days = (n: number) => Array.from({ length: n }, (_, i) => istDay(i));
    const pick = (d: string) => site.get(d) || { day: d, page: "_site", visitors: 0, opens: 0, new_visitors: 0 };
    const sum = (list: Row[], k: "visitors" | "opens" | "new_visitors") => list.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const last7 = days(7).map(pick);
    const last30 = days(30).map(pick);
    const since7 = istDay(6);
    const tiles = new Map<string, { v: number; o: number }>();
    rows
      .filter(r => r.page.startsWith("tile:") && r.day >= (range === 7 ? since7 : istDay(29)))
      .forEach(r => {
        const k = r.page.slice(5);
        const t = tiles.get(k) || { v: 0, o: 0 };
        t.v += Number(r.visitors) || 0;
        t.o += Number(r.opens) || 0;
        tiles.set(k, t);
      });
    const topTiles = [...tiles.entries()].sort((a, b) => b[1].o - a[1].o).slice(0, 10);
    const firstDay = allSite.reduce((m, r) => (!m || r.day < m ? r.day : m), "");
    return {
      today: pick(istDay(0)),
      yesterday: pick(istDay(1)),
      last7,
      last30,
      v7: sum(last7, "visitors"),
      o7: sum(last7, "opens"),
      v30: sum(last30, "visitors"),
      o30: sum(last30, "opens"),
      vAll: sum(allSite, "visitors"),
      oAll: sum(allSite, "opens"),
      nAll: sum(allSite, "new_visitors"),
      firstDay,
      topTiles,
    };
  }, [rows, allSite, range]);

  const list = range === 7 ? data.last7 : data.last30;
  const maxV = Math.max(1, ...list.map(r => r.opens));
  const maxT = Math.max(1, ...data.topTiles.map(t => t[1].o));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 40 }} data-sb-views="1">
      <div className="page-banner">
        <div className="page-banner-left">
          <div className="page-big-icon emerald" style={{ fontSize: 26 }}>📊</div>
          <div className="page-banner-info">
            <span className="section-kicker">USER SITE • DAILY VISITORS</span>
            <h2>📊 Views — कितने लोगों ने साइट खोली</h2>
            <p>studybull.vercel.app रोज़ कितने लोगों ने खोली (भारत की तारीख से)। सिर्फ गिनती, किसी की निजी जानकारी नहीं।</p>
          </div>
        </div>
        <div className="page-banner-actions">
          <button className="outline-btn" onClick={load}>🔄 Refresh</button>
        </div>
      </div>

      {state === "loading" && <div className="panel" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>लोड हो रहा है…</div>}

      {state === "pending" && (
        <div className="panel" data-sb-views-state="pending" style={{ padding: 20, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "#92400e" }}>⏳ Setup pending — एक बार का डेटाबेस सेटअप बाकी है</div>
          <ol style={{ margin: "10px 0 0 18px", fontSize: 14, color: "#78350f", lineHeight: 1.7 }}>
            <li>Supabase → अपना project → <b>SQL Editor</b> → <b>New query</b></li>
            <li><b>studybull_views.sql</b> (Tab ने भेजी) पूरी paste करें → <b>Run</b></li>
            <li>आखिरी लाइन में <b>studybull_views | true</b> दिखे = हो गया</li>
          </ol>
          <div style={{ fontSize: 12.5, color: "#92400e", marginTop: 10 }}>
            उसके बाद से हर visit यहाँ गिनी जाएगी। तब तक पूरा डेटा Vercel → studybull → <b>Analytics</b> में है।
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="panel" style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
          ❌ गिनती पढ़ नहीं पाए: {err} <button className="outline-btn" style={{ marginLeft: 8 }} onClick={load}>दोबारा</button>
        </div>
      )}

      {state === "ok" && (
        <div data-sb-views-state="ok">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
            <Stat label="👥 आज के विज़िटर" value={fmt(data.today.visitors)} sub={`🆕 नए: ${fmt(data.today.new_visitors)}`} color="#0f766e" />
            <Stat label="👁️ आज कितनी बार खुली" value={fmt(data.today.opens)} sub={`कल: ${fmt(data.yesterday.visitors)} विज़िटर • ${fmt(data.yesterday.opens)} बार`} color="#2563eb" />
            <Stat label="📅 पिछले 7 दिन" value={fmt(data.v7)} sub={`विज़िटर • ${fmt(data.o7)} बार खुली`} color="#7c3aed" />
            <Stat label="🗓️ पिछले 30 दिन" value={fmt(data.v30)} sub={`विज़िटर • ${fmt(data.o30)} बार खुली`} color="#b45309" />
          </div>
          <div className="panel" style={{ padding: "12px 14px", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13, color: "#334155" }}>
            <span>🏁 <b>कुल (शुरू से)</b>: {fmt(data.vAll)} विज़िटर</span>
            <span>👁️ {fmt(data.oAll)} बार खुली</span>
            <span>🆕 {fmt(data.nAll)} अलग डिवाइस</span>
            {data.firstDay && <span style={{ color: "#64748b" }}>गिनती {shortDate(data.firstDay)} से</span>}
          </div>

          <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <b style={{ fontSize: 15 }}>📈 रोज़ का हिसाब</b>
              <div style={{ display: "flex", gap: 6 }}>
                {[7, 30].map(n => (
                  <button
                    key={n}
                    onClick={() => setRange(n as 7 | 30)}
                    className="outline-btn"
                    style={{ padding: "5px 12px", fontWeight: 800, ...(range === n ? { background: "#0f766e", color: "#fff", borderColor: "#0f766e" } : {}) }}
                  >
                    {n} दिन
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 6 }}>पट्टी = कितनी बार खुली • दाएँ: 👥 विज़िटर / 👁️ बार</div>
            {list.map(r => (
              <BarRow key={r.day} label={r.day === istDay(0) ? "आज" : shortDate(r.day)} value={r.opens} max={maxV} right={`👥 ${fmt(r.visitors)} / 👁️ ${fmt(r.opens)}`} color="linear-gradient(90deg,#14b8a6,#0f766e)" />
            ))}
          </div>

          <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
            <b style={{ fontSize: 15 }}>🔥 सबसे ज़्यादा खुले बटन ({range} दिन)</b>
            {data.topTiles.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>अभी कोई डेटा नहीं।</div>
            ) : (
              <div style={{ marginTop: 6 }}>
                {data.topTiles.map(([name, t]) => (
                  <div key={name} style={{ padding: "4px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#1e293b", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                      <span style={{ whiteSpace: "nowrap" }}>👁️ {fmt(t.o)} • 👥 {fmt(t.v)}</span>
                    </div>
                    <div style={{ height: 10, background: "#eef2f7", borderRadius: 5, overflow: "hidden", marginTop: 3 }}>
                      <div style={{ width: `${Math.max(3, Math.round((t.o / maxT) * 100))}%`, height: "100%", background: "linear-gradient(90deg,#818cf8,#4f46e5)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.6, padding: "0 4px" }}>
            👥 विज़िटर = उस दिन अलग-अलग डिवाइस (एक फ़ोन दिन में 10 बार खोले तो 1 विज़िटर, 10 बार)। 7/30 दिन वाले विज़िटर रोज़ के जोड़ हैं।
            Bots नहीं गिने जाते। {loadedAt && <>अपडेट: {loadedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} (हर मिनट खुद रिफ्रेश)</>}
            <br />इस काउंटर से पहले का डेटा: Vercel → studybull → Analytics.
          </div>
        </div>
      )}
    </div>
  );
}
