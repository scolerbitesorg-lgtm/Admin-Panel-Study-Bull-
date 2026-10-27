import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

/* 📊 VIEWS — how many people opened the user site (Aarav, Oct 26 2026 11:04 PM; clearer cards Oct 27 10:12 AM).
 * Data: table public.studybull_views (one row per India-date per page: '_site' or 'tile:<home button>').
 *   visitors     = unique devices that day (a device counts once per IST day)
 *   new_visitors = devices visiting for the first time ever
 *   opens        = every open of the site (50 opens by one phone = 50)
 * Derived here: old (returning) users = visitors − new_visitors; total users (all time) = Σ new_visitors;
 * total opens (all time) = Σ opens. The user site only adds +1 through studybull_track_visit (/api/hit);
 * only the admin email login can read the table (RLS). Created by studybull_views.sql. */

type Row = { day: string; page: string; visitors: number; opens: number; new_visitors: number; updated_at?: string };
type RangeKey = "today" | "yesterday" | "7" | "30" | "all";

const COUNT_START = "2026-10-27"; // counter went live 27 Oct 2026, 6:23 AM IST
const TEST_DAY = "2026-10-27"; // ~30 of that day's visits were Tab's own speed testing

function istDay(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const t = new Date(d + "T00:00:00Z").getTime() + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const HI_MONTHS = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सितं", "अक्टू", "नवं", "दिसं"];
function shortDate(d: string): string {
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${HI_MONTHS[(m || 1) - 1]}`;
}
const fmt = (n: number) => n.toLocaleString("en-IN");
const num = (x: unknown) => Number(x) || 0;

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "आज" },
  { key: "yesterday", label: "कल" },
  { key: "7", label: "7 दिन" },
  { key: "30", label: "30 दिन" },
  { key: "all", label: "सब" },
];

function Card({ icon, title, value, explain, color, bg, id, wide }: { icon: string; title: string; value: string; explain: string; color: string; bg: string; id: string; wide?: boolean }) {
  return (
    <div
      data-sb-views-card={id}
      style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 16, padding: "12px 13px 11px", minWidth: 0, gridColumn: wide ? "1 / -1" : undefined }}
    >
      <div style={{ fontSize: 12.5, color: "#334155", fontWeight: 800, lineHeight: 1.3 }}>
        <span style={{ marginRight: 4 }}>{icon}</span>
        {title}
      </div>
      <div data-sb-views-value={id} style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1.1, marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: "#475569", marginTop: 4, lineHeight: 1.4 }}>{explain}</div>
    </div>
  );
}

const TH: CSSProperties = { fontSize: 11, color: "#64748b", fontWeight: 800, padding: "6px 4px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #e5eaf2" };
const TD: CSSProperties = { fontSize: 13, color: "#0f172a", fontWeight: 700, padding: "7px 4px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #f1f5f9" };

export default function ViewsStatsView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "pending" | "error">("loading");
  const [err, setErr] = useState("");
  const [range, setRange] = useState<RangeKey>("today");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = async () => {
    if (!supabase) {
      setState("error");
      setErr("डेटाबेस कनेक्ट नहीं है");
      return;
    }
    setState(s => (s === "ok" ? "ok" : "loading"));
    try {
      // all rows (small table: ~10 rows a day); page through in 1000s (PostgREST row cap)
      const all: Row[] = [];
      for (let from = 0; from < 100000; from += 1000) {
        const r = await supabase
          .from("studybull_views")
          .select("day,page,visitors,opens,new_visitors,updated_at")
          .order("day", { ascending: true })
          .order("page", { ascending: true })
          .range(from, from + 999);
        if (r.error) {
          const e = r.error;
          const msg = `${(e as any).code || ""} ${e.message || ""}`;
          if (/PGRST205|42P01|does not exist|Could not find the table|schema cache/i.test(msg)) {
            setState("pending");
          } else {
            setState("error");
            setErr(e.message || "पढ़ नहीं पाए");
          }
          return;
        }
        const got = (r.data || []) as Row[];
        all.push(...got);
        if (got.length < 1000) break;
      }
      setRows(all);
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

  const today = istDay(0);

  const data = useMemo(() => {
    const siteRows = rows.filter(r => r.page === "_site");
    const site = new Map<string, Row>();
    siteRows.forEach(r => site.set(r.day, r));
    const firstDay = siteRows.reduce((m, r) => (!m || r.day < m ? r.day : m), "") || COUNT_START;

    // days in the chosen range, newest first
    let from: string;
    let to = today;
    if (range === "today") from = today;
    else if (range === "yesterday") from = to = istDay(1);
    else if (range === "7") from = istDay(6);
    else if (range === "30") from = istDay(29);
    else from = firstDay < today ? firstDay : today;
    if (range !== "yesterday" && from < firstDay && range !== "today") from = firstDay;
    const days: string[] = [];
    for (let d = to; d >= from; d = addDays(d, -1)) days.push(d);

    const pick = (d: string) => {
      const r = site.get(d);
      const nw = num(r?.new_visitors);
      // a new device is always a user of that day; before the Oct 27 ~10:40 AM site fix some new devices
      // were not added to visitors (button tapped in the first 2.5 s), so never show fewer users than new users
      const users = Math.max(num(r?.visitors), nw);
      return { day: d, users, nw, old: Math.max(0, users - nw), opens: num(r?.opens) };
    };
    const daily = days.map(pick);
    const sum = (k: "users" | "nw" | "old" | "opens") => daily.reduce((a, r) => a + r[k], 0);

    const tiles = new Map<string, { v: number; o: number }>();
    rows
      .filter(r => r.page.startsWith("tile:") && r.day >= from && r.day <= to)
      .forEach(r => {
        const k = r.page.slice(5);
        const t = tiles.get(k) || { v: 0, o: 0 };
        t.v += num(r.visitors);
        t.o += num(r.opens);
        tiles.set(k, t);
      });
    const tileList = [...tiles.entries()].sort((a, b) => b[1].o - a[1].o || b[1].v - a[1].v);

    return {
      firstDay,
      days,
      daily,
      single: days.length === 1,
      users: sum("users"),
      nw: sum("nw"),
      old: sum("old"),
      opens: sum("opens"),
      totalUsers: siteRows.reduce((a, r) => a + num(r.new_visitors), 0),
      totalOpens: siteRows.reduce((a, r) => a + num(r.opens), 0),
      tileList,
      includesTestDay: days.includes(TEST_DAY),
    };
  }, [rows, range, today]);

  const rangeName =
    range === "today" ? "आज" : range === "yesterday" ? "कल" : range === "7" ? "पिछले 7 दिन" : range === "30" ? "पिछले 30 दिन" : "शुरू से अब तक";
  const avg = data.users > 0 ? data.opens / data.users : 0;
  const maxOpens = Math.max(1, ...data.daily.map(r => r.opens));
  const maxT = Math.max(1, ...data.tileList.map(t => t[1].o));

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", paddingBottom: 40 }} data-sb-views="1">
      <div className="page-banner">
        <div className="page-banner-left">
          <div className="page-big-icon emerald" style={{ fontSize: 26 }}>📊</div>
          <div className="page-banner-info">
            <span className="section-kicker">USER SITE • USERS & OPENS</span>
            <h2>📊 Views — कितने लोग आए, कितनी बार खुली</h2>
            <p>studybull.vercel.app की गिनती (भारत की तारीख से)। सिर्फ गिनती, किसी की निजी जानकारी नहीं।</p>
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
        </div>
      )}

      {state === "error" && (
        <div className="panel" style={{ padding: 20, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
          ❌ गिनती पढ़ नहीं पाए: {err} <button className="outline-btn" style={{ marginLeft: 8 }} onClick={load}>दोबारा</button>
        </div>
      )}

      {state === "ok" && (
        <div data-sb-views-state="ok">
          {/* range tabs */}
          <div data-sb-views-range="1" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 0 10px", WebkitOverflowScrolling: "touch" }}>
            {RANGES.map(r => (
              <button
                key={r.key}
                data-sb-views-tab={r.key}
                onClick={() => setRange(r.key)}
                className="outline-btn"
                style={{
                  padding: "7px 14px",
                  fontWeight: 800,
                  fontSize: 13.5,
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                  borderRadius: 999,
                  ...(range === r.key ? { background: "#0f766e", color: "#fff", borderColor: "#0f766e" } : {}),
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* all-time card */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 10 }}>
            <Card
              id="total-users"
              wide
              icon="👥"
              title="Total users (ab tak, सब मिलाकर)"
              value={fmt(data.totalUsers)}
              explain={`अब तक कितने अलग-अलग device (फ़ोन/कंप्यूटर) आए — एक device हमेशा 1 ही गिना। कुल web opens ab tak: ${fmt(data.totalOpens)}`}
              color="#0f172a"
              bg="#f8fafc"
            />
          </div>

          <div style={{ fontSize: 13, fontWeight: 900, color: "#0f766e", margin: "4px 2px 8px" }}>
            📅 {rangeName}
            {!data.single && data.days.length > 0 && (
              <span style={{ fontWeight: 700, color: "#64748b" }}> ({shortDate(data.days[data.days.length - 1])} – {shortDate(data.days[0])})</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
            <Card
              id="users"
              icon="👤"
              title={data.single ? `${rangeName} के users (unique)` : "Users (रोज़ के unique का जोड़)"}
              value={fmt(data.users)}
              explain={data.single ? "एक device दिन में 1 बार गिना — 50 बार खोले तब भी 1" : "हर दिन के unique users जोड़े; जो device 3 दिन आया = 3"}
              color="#0f766e"
              bg="#f0fdfa"
            />
            <Card id="new" icon="🆕" title="New users" value={fmt(data.nw)} explain="पहली बार आए (हर device ज़िंदगी में 1 बार)" color="#7c3aed" bg="#f5f3ff" />
            <Card
              id="old"
              icon="🔁"
              title="Purane users (wapas aaye)"
              value={fmt(data.old)}
              explain={data.single ? "पहले आ चुके थे, इस दिन फिर आए" : "पहले आ चुके devices की वापसी (रोज़ का जोड़)"}
              color="#b45309"
              bg="#fffbeb"
            />
            <Card id="opens" icon="👆" title="Total web opens" value={fmt(data.opens)} explain="हर बार खुलना गिना (एक user 50 बार = 50)" color="#2563eb" bg="#eff6ff" />
            <Card
              id="avg"
              wide
              icon="📊"
              title="Avg opens per user"
              value={data.users > 0 ? avg.toFixed(1) : "0"}
              explain="एक user ने औसतन कितनी बार साइट खोली (opens ÷ users)"
              color="#be185d"
              bg="#fdf2f8"
            />
          </div>

          <div
            data-sb-views-note="1"
            style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "8px 11px", marginBottom: 12, lineHeight: 1.5 }}
          >
            ℹ️ गिनती 27 अक्टू, सुबह 6:23 से शुरू हुई।
            {data.includesTestDay && (
              <> {today === TEST_DAY ? "आज" : "27 अक्टू"} के ~30 visits Tab की testing के हैं, और सुबह 10:40 से पहले के कुछ users सिर्फ़ "New" में गिने गए थे (गलती ठीक कर दी)।</>
            )}
            {" "}Users = कितने लोग, Opens = कितनी बार खुली।
          </div>

          {/* daily table */}
          <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
            <b style={{ fontSize: 15 }}>📈 रोज़ का हिसाब</b>
            <div style={{ overflowX: "auto", marginTop: 6 }}>
              <table data-sb-views-daily="1" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: "left" }}>तारीख</th>
                    <th style={TH}>👤 Users</th>
                    <th style={TH}>🆕 New</th>
                    <th style={TH}>🔁 Old</th>
                    <th style={TH}>👆 Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map(r => (
                    <tr key={r.day}>
                      <td style={{ ...TD, textAlign: "left" }}>
                        {r.day === today ? "आज" : r.day === istDay(1) ? "कल" : shortDate(r.day)}
                        <div style={{ height: 4, background: "#eef2f7", borderRadius: 2, marginTop: 3, width: 64 }}>
                          <div style={{ height: "100%", width: `${r.opens > 0 ? Math.max(4, Math.round((r.opens / maxOpens) * 100)) : 0}%`, background: "#2563eb", borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={{ ...TD, color: "#0f766e" }}>{fmt(r.users)}</td>
                      <td style={{ ...TD, color: "#7c3aed" }}>{fmt(r.nw)}</td>
                      <td style={{ ...TD, color: "#b45309" }}>{fmt(r.old)}</td>
                      <td style={{ ...TD, color: "#2563eb" }}>{fmt(r.opens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>नीली पट्टी = उस दिन कितनी बार खुली</div>
          </div>

          {/* per-button table */}
          <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
            <b style={{ fontSize: 15 }}>🔘 कौन-सा बटन कितना खुला ({rangeName})</b>
            <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>👤 Users = कितने device ने खोला (दिन में 1 बार) • 👆 Opens = कुल कितनी बार</div>
            {data.tileList.length === 0 ? (
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>इस समय में कोई बटन नहीं खुला।</div>
            ) : (
              <table data-sb-views-tiles="1" style={{ width: "100%", borderCollapse: "collapse", marginTop: 6, tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: "left" }}>बटन</th>
                    <th style={{ ...TH, width: 74 }}>👤 Users</th>
                    <th style={{ ...TH, width: 74 }}>👆 Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tileList.map(([name, t]) => (
                    <tr key={name}>
                      <td style={{ ...TD, textAlign: "left", whiteSpace: "normal" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                        <div style={{ height: 4, background: "#eef2f7", borderRadius: 2, marginTop: 3 }}>
                          <div style={{ height: "100%", width: `${Math.max(3, Math.round((t.o / maxT) * 100))}%`, background: "#4f46e5", borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={{ ...TD, color: "#0f766e" }}>{fmt(t.v)}</td>
                      <td style={{ ...TD, color: "#2563eb" }}>{fmt(t.o)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.6, padding: "0 4px" }}>
            Bots नहीं गिने जाते। {loadedAt && <>अपडेट: {loadedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} (हर मिनट खुद रिफ्रेश)</>}
            <br />इस काउंटर से पहले का डेटा: Vercel → studybull → Analytics.
          </div>
        </div>
      )}
    </div>
  );
}
