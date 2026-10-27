import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

/* 👥 USERS — every device that opened the user site, as user01, user02 … (Aarav, Oct 27 2026 11:59 AM / 12:10 PM).
 * Data: public.studybull_users (one row per device; the browser makes a random id, the DB numbers it) and
 * public.studybull_user_events (visit, button opened, notes opened, quiz/mock started, quiz/mock/typing/speed-math
 * results). Written only by the user site through studybull_track_user (/api/hit); read only by the admin email
 * login (RLS). PERMANENT: nothing here can delete or reset users (a DB guard blocks DELETE/TRUNCATE).
 * Live: Supabase Realtime on both tables + a tiny "anything newer?" check every 4 s as a safety net.
 * Created by studybull_users.sql (files/). No names: no login on the site; a new phone/browser or cleared data = new user. */

type U = {
  num: number; first_seen: string; last_seen: string; first_day: string | null; last_day: string | null;
  visits: number; opens: number; days: number; tiles: number; quizzes: number; mocks: number; typing: number; calcs: number; notes: number;
  device: string | null; os: string | null; browser: string | null; city: string | null; region: string | null; country: string | null;
  last_kind: string | null; last_title: string | null; old_visitor?: boolean;
};
type Ev = { id: number; user_num: number; at: string; kind: string; title: string | null; data: Record<string, number> | null };
type Tab = "today" | "yesterday" | "7" | "all";
type SortKey = "last" | "first" | "visits" | "days" | "mocks";

const COLS = "num,first_seen,last_seen,first_day,last_day,visits,opens,days,tiles,quizzes,mocks,typing,calcs,notes,device,os,browser,city,region,country,last_kind,last_title,old_visitor";
const label = (n: number) => "user" + String(n).padStart(2, "0");
function istDay(off = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - off * 86400000).toISOString().slice(0, 10);
}
const HI_M = ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सितं", "अक्टू", "नवं", "दिसं"];
function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const ago = (Date.now() - t) / 1000;
  const d = new Date(t + 5.5 * 3600 * 1000);
  const hh = d.getUTCHours(), mm = String(d.getUTCMinutes()).padStart(2, "0");
  const time = `${((hh + 11) % 12) + 1}:${mm} ${hh < 12 ? "AM" : "PM"}`;
  if (ago < 60) return "अभी";
  if (ago < 3600) return `${Math.floor(ago / 60)} मि पहले`;
  const day = d.toISOString().slice(0, 10);
  if (day === istDay(0)) return `आज ${time}`;
  if (day === istDay(1)) return `कल ${time}`;
  return `${d.getUTCDate()} ${HI_M[d.getUTCMonth()]} ${time}`;
}
const mmss = (s?: number) => (s === undefined || s === null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const KIND: Record<string, { i: string; t: string }> = {
  visit: { i: "🌐", t: "साइट खोली" }, tile: { i: "🔘", t: "बटन खोला" }, notes: { i: "📖", t: "नोट्स पढ़े" },
  quiz_start: { i: "🎯", t: "क्विज़ शुरू" }, quiz: { i: "✅", t: "क्विज़ पूरा" }, mock_start: { i: "📝", t: "मॉक शुरू" },
  mock: { i: "🏁", t: "मॉक सबमिट" }, typing: { i: "⌨️", t: "टाइपिंग टेस्ट" }, calc: { i: "🧮", t: "स्पीड मैथ" },
};
function evLine(e: Ev): string {
  const d = e.data || {};
  if (e.kind === "mock") return `✔ ${d.c ?? 0}  ✘ ${d.w ?? 0}  / ${d.n ?? "?"}` + (d.max ? ` • अंक ${d.marks ?? 0}/${d.max}` : "") + (d.secs ? ` • ⏱ ${mmss(d.secs)}` : "");
  if (e.kind === "quiz") return `${d.c ?? 0}/${d.n ?? "?"} सही` + (d.a !== undefined && d.n !== undefined && d.a < d.n ? ` (${d.a} किए)` : "");
  if (e.kind === "typing") return `${d.wpm ?? 0} WPM • ${d.acc ?? 0}% सही` + (d.secs ? ` • ⏱ ${mmss(d.secs)}` : "");
  if (e.kind === "calc") return `✔ ${d.c ?? 0}  ✘ ${d.w ?? 0}` + (d.secs ? ` • ⏱ ${mmss(d.secs)}` : "");
  if ((e.kind === "quiz_start" || e.kind === "mock_start") && d.n) return `${d.n} प्रश्न`;
  return "";
}
const place = (u: U) => [u.city, u.region].filter(Boolean).join(", ") || "—";
const dev = (u: U) => [u.device, u.os].filter(Boolean).join(" • ") || "—";

const TH: CSSProperties = { fontSize: 11, color: "#64748b", fontWeight: 800, padding: "7px 6px", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #e5eaf2", cursor: "pointer", background: "#f8fafc", position: "sticky", top: 0 };
const TD: CSSProperties = { fontSize: 12.5, color: "#0f172a", fontWeight: 600, padding: "8px 6px", whiteSpace: "nowrap", borderBottom: "1px solid #f1f5f9" };

function Card({ id, icon, title, value, sub, color }: { id: string; icon: string; title: string; value: number | string; sub: string; color: string }) {
  return (
    <div data-sb-users-card={id} style={{ background: "#fff", border: `1px solid ${color}40`, borderRadius: 16, padding: "11px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#334155", fontWeight: 800 }}><span style={{ marginRight: 4 }}>{icon}</span>{title}</div>
      <div data-sb-users-value={id} style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1.15, marginTop: 3 }}>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export default function UsersView() {
  const [state, setState] = useState<"loading" | "ok" | "pending" | "error">("loading");
  const [err, setErr] = useState("");
  const [users, setUsers] = useState<Map<number, U>>(new Map());
  const [counts, setCounts] = useState({ total: 0, newToday: 0, retToday: 0, active7: 0 });
  const [tab, setTab] = useState<Tab>("today");
  const [sort, setSort] = useState<SortKey>("last");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [evState, setEvState] = useState<"idle" | "loading" | "ok">("idle");
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const maxSeen = useRef<string>("");
  const maxEv = useRef<number>(0);
  const selRef = useRef<number | null>(null);
  selRef.current = sel;

  const isMissing = (e: any) => /PGRST205|42P01|does not exist|Could not find the table|schema cache/i.test(`${e?.code || ""} ${e?.message || ""}`);

  const merge = (rows: U[]) => {
    if (!rows.length) return;
    setUsers(prev => {
      const m = new Map(prev);
      rows.forEach(r => {
        m.set(Number(r.num), r);
        if (!maxSeen.current || r.last_seen > maxSeen.current) maxSeen.current = r.last_seen;
      });
      return m;
    });
    setUpdatedAt(new Date());
  };

  const loadCounts = async () => {
    if (!supabase) return;
    const t = istDay(0), w = istDay(6);
    const c = (f: (x: any) => any) => f(supabase!.from("studybull_users").select("num", { count: "exact", head: true }));
    const [a, b, r, s] = await Promise.all([
      c(x => x),
      c(x => x.eq("first_day", t)),
      c(x => x.eq("last_day", t).lt("first_day", t)),
      c(x => x.gte("last_day", w)),
    ]);
    if (a.error) throw a.error;
    setCounts({ total: a.count || 0, newToday: b.count || 0, retToday: r.count || 0, active7: s.count || 0 });
  };

  // first load: the 3,000 most recently active users (+ the four counts)
  const loadAll = async () => {
    if (!supabase) { setState("error"); setErr("डेटाबेस कनेक्ट नहीं है"); return; }
    try {
      const r = await supabase.from("studybull_users").select(COLS).order("last_seen", { ascending: false }).limit(3000);
      if (r.error) { if (isMissing(r.error)) setState("pending"); else { setState("error"); setErr(r.error.message); } return; }
      maxSeen.current = "";
      const m = new Map<number, U>();
      (r.data as any as U[]).forEach(u => { m.set(Number(u.num), u); if (!maxSeen.current || u.last_seen > maxSeen.current) maxSeen.current = u.last_seen; });
      setUsers(m);
      await loadCounts();
      setUpdatedAt(new Date());
      setState("ok");
    } catch (x: any) {
      setState("error"); setErr(x?.message || "नेटवर्क एरर");
    }
  };

  // every few seconds: only rows that changed since the newest one we have (a few bytes when nothing changed)
  const pollNew = async () => {
    if (!supabase || !maxSeen.current) return;
    const r = await supabase.from("studybull_users").select(COLS).gt("last_seen", maxSeen.current).order("last_seen", { ascending: true }).limit(500);
    if (!r.error && r.data && r.data.length) { merge(r.data as any as U[]); loadCounts().catch(() => {}); }
    const s = selRef.current;
    if (s !== null && maxEv.current) {
      const e = await supabase.from("studybull_user_events").select("id,user_num,at,kind,title,data").eq("user_num", s).gt("id", maxEv.current).order("id", { ascending: false }).limit(100);
      if (!e.error && e.data && e.data.length && selRef.current === s) addEvents(e.data as any as Ev[]);
    }
  };

  const addEvents = (list: Ev[]) => {
    setEvents(prev => {
      const seen = new Set(prev.map(x => x.id));
      const add = list.filter(x => !seen.has(x.id));
      add.forEach(x => { if (x.id > maxEv.current) maxEv.current = x.id; });
      return add.length ? [...add, ...prev].sort((a, b) => b.id - a.id) : prev;
    });
  };

  const openUser = async (n: number) => {
    setSel(n); setEvents([]); setEvState("loading"); maxEv.current = 0;
    if (!supabase) return;
    const e = await supabase.from("studybull_user_events").select("id,user_num,at,kind,title,data").eq("user_num", n).order("id", { ascending: false }).limit(400);
    if (selRef.current !== n) return;
    const list = (e.data || []) as any as Ev[];
    list.forEach(x => { if (x.id > maxEv.current) maxEv.current = x.id; });
    setEvents(list); setEvState("ok");
    try { window.scrollTo({ top: 0 }); } catch {}
  };

  useEffect(() => {
    loadAll();
    let timer: any = null;
    let ch: any = null;
    try {
      if (supabase) {
        ch = supabase
          .channel("studybull-users-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "studybull_users" }, (p: any) => {
            if (p && p.new && p.new.num) { merge([p.new as U]); loadCounts().catch(() => {}); }
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "studybull_user_events" }, (p: any) => {
            const e = p && p.new;
            if (e && selRef.current !== null && Number(e.user_num) === selRef.current) addEvents([e as Ev]);
          })
          .subscribe((st: string) => setLive(st === "SUBSCRIBED"));
      }
    } catch { /* polling below still works */ }
    timer = setInterval(() => { if (document.visibilityState !== "hidden") pollNew().catch(() => {}); }, 4000);
    return () => { clearInterval(timer); try { if (ch && supabase) supabase.removeChannel(ch); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => {
    const t = istDay(0), y = istDay(1), w = istDay(6);
    let arr = [...users.values()];
    if (tab === "today") arr = arr.filter(u => u.last_day === t);
    else if (tab === "yesterday") arr = arr.filter(u => u.last_day === y);
    else if (tab === "7") arr = arr.filter(u => (u.last_day || "") >= w);
    const s = q.trim().toLowerCase();
    if (s) {
      const n = Number(s.replace(/^user\s*/, ""));
      arr = arr.filter(u => (Number.isFinite(n) && n > 0 && u.num === n) || label(u.num).includes(s) || `${u.city || ""} ${u.region || ""} ${u.device || ""} ${u.os || ""} ${u.browser || ""}`.toLowerCase().includes(s));
    }
    const k: Record<SortKey, (u: U) => any> = { last: u => u.last_seen, first: u => u.first_seen, visits: u => u.visits, days: u => u.days, mocks: u => u.mocks + u.quizzes };
    arr.sort((a, b) => (k[sort](a) < k[sort](b) ? 1 : k[sort](a) > k[sort](b) ? -1 : b.num - a.num));
    return arr;
  }, [users, tab, q, sort]);

  const u = sel !== null ? users.get(sel) : undefined;

  // पुराना डेटा: the 📊 Views daily counts from before 👥 Users started (counts only — no per-person history exists)
  const [oldRows, setOldRows] = useState<{ day: string; visitors: number; opens: number; new_visitors: number }[]>([]);
  const trackStart = useMemo(() => {
    let m = "";
    users.forEach(x => { if (!x.old_visitor && x.first_day && (!m || x.first_day < m)) m = x.first_day; });
    return m || istDay(0);
  }, [users]);
  useEffect(() => {
    if (state !== "ok" || !supabase) return;
    supabase.from("studybull_views").select("day,visitors,opens,new_visitors").eq("page", "_site").lte("day", trackStart).order("day", { ascending: false }).limit(60)
      .then((r: any) => { if (!r.error && Array.isArray(r.data)) setOldRows(r.data); });
  }, [state, trackStart]);

  if (state === "pending") {
    return (
      <div className="panel" data-sb-users="1" data-sb-users-state="pending" style={{ padding: 18, maxWidth: 760, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 8px" }}>👥 Users — setup बाकी है</h2>
        <p style={{ fontSize: 14, color: "#334155" }}>एक बार Supabase में SQL चलाना है (Tab ने फ़ाइल studybull_users.sql भेजी है):</p>
        <ol style={{ fontSize: 14, color: "#334155", lineHeight: 1.7 }}>
          <li>supabase.com → अपना प्रोजेक्ट → बाएँ <b>SQL Editor</b></li>
          <li><b>New query</b> → पूरी फ़ाइल paste करें → <b>Run</b></li>
          <li>नीचे 2 लाइन दिखें: studybull_user_events | true, studybull_users | true</li>
        </ol>
        <button className="outline-btn" onClick={loadAll}>🔄 दोबारा जाँचें</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 40 }} data-sb-users="1" data-sb-users-state={state}>
      <div className="page-banner">
        <div className="page-banner-left">
          <div className="page-big-icon emerald" style={{ fontSize: 26 }}>👥</div>
          <div className="page-banner-info">
            <span className="section-kicker">USER SITE • हर डिवाइस = एक user</span>
            <h2>👥 Users — कौन आया, क्या किया</h2>
            <p>
              हर नए फ़ोन/ब्राउज़र को अपने आप user01, user02… नंबर मिलता है (user को नहीं दिखता)।{" "}
              <span data-sb-users-live={live ? "1" : "0"} style={{ fontWeight: 800, color: live ? "#059669" : "#b45309" }}>{live ? "🟢 LIVE" : "🟡 हर 4 सेकंड अपडेट"}</span>
              {updatedAt ? <span style={{ color: "#94a3b8" }}> • {when(updatedAt.toISOString())}</span> : null}
            </p>
          </div>
        </div>
      </div>

      {state === "loading" && <div className="panel" style={{ padding: 24, textAlign: "center", color: "#64748b" }}>लोड हो रहा है…</div>}
      {state === "error" && (
        <div className="panel" style={{ padding: 18, color: "#b91c1c" }}>पढ़ नहीं पाए: {err} <button className="outline-btn" onClick={loadAll}>🔄 फिर से</button></div>
      )}

      {state === "ok" && !u && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 9, margin: "10px 0" }}>
            <Card id="total" icon="👥" title="कुल users" value={counts.total} sub="शुरू से अब तक, हर डिवाइस एक बार" color="#0f766e" />
            <Card id="new" icon="🆕" title="आज नए" value={counts.newToday} sub="आज पहली बार आए" color="#2563eb" />
            <Card id="returning" icon="🔁" title="आज लौटे" value={counts.retToday} sub="पहले आ चुके, आज फिर आए" color="#7c3aed" />
            <Card id="active7" icon="📅" title="7 दिन में active" value={counts.active7} sub="पिछले 7 दिन में कभी भी" color="#d97706" />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "6px 0 8px" }}>
            {([["today", "आज"], ["yesterday", "कल"], ["7", "7 दिन"], ["all", "सब"]] as [Tab, string][]).map(([k, t]) => (
              <button key={k} data-sb-users-tab={k} onClick={() => setTab(k)} className={tab === k ? "primary-btn" : "outline-btn"} style={{ padding: "6px 14px", borderRadius: 999, fontSize: 13 }}>{t}</button>
            ))}
            <input
              data-sb-users-search="1"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="🔍 user12, शहर, Android…"
              style={{ flex: "1 1 160px", minWidth: 0, padding: "8px 12px", borderRadius: 12, border: "1px solid #cbd5e1", fontSize: 14 }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 6px" }}>
            {list.length.toLocaleString("en-IN")} users • टैब = आख़िरी विज़िट का दिन • कॉलम के नाम पर टैप = sort • किसी user पर टैप = पूरी history
          </div>

          <div className="panel" style={{ padding: 0, overflow: "auto", maxHeight: "70vh" }}>
            <table data-sb-users-table="1" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>User</th>
                  <th style={TH} onClick={() => setSort("last")}>आख़िरी बार{sort === "last" ? " ▼" : ""}</th>
                  <th style={TH} onClick={() => setSort("visits")}>विज़िट{sort === "visits" ? " ▼" : ""}</th>
                  <th style={TH} onClick={() => setSort("days")}>दिन{sort === "days" ? " ▼" : ""}</th>
                  <th style={TH} onClick={() => setSort("mocks")}>टेस्ट{sort === "mocks" ? " ▼" : ""}</th>
                  <th style={TH}>आख़िरी काम</th>
                  <th style={TH}>डिवाइस</th>
                  <th style={TH}>शहर (अंदाज़ा)</th>
                  <th style={TH} onClick={() => setSort("first")}>पहली बार{sort === "first" ? " ▼" : ""}</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 500).map(x => (
                  <tr key={x.num} data-sb-users-row={x.num} onClick={() => openUser(x.num)} style={{ cursor: "pointer" }}>
                    <td style={{ ...TD, fontWeight: 900, color: "#0f766e" }}>{label(x.num)}{x.old_visitor ? <span title="👥 Users शुरू होने से पहले से आता है" style={{ marginLeft: 4, fontSize: 10, background: "#fef3c7", color: "#92400e", borderRadius: 6, padding: "1px 5px" }}>पुराना</span> : x.first_day === istDay(0) ? <span style={{ marginLeft: 4, fontSize: 10, background: "#dbeafe", color: "#1d4ed8", borderRadius: 6, padding: "1px 5px" }}>नया</span> : null}</td>
                    <td style={TD}>{when(x.last_seen)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{x.visits}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{x.days}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{x.mocks + x.quizzes + x.typing}</td>
                    <td style={{ ...TD, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>{x.last_kind ? `${KIND[x.last_kind]?.i || "•"} ${x.last_title || KIND[x.last_kind]?.t || ""}` : "—"}</td>
                    <td style={TD}>{dev(x)}</td>
                    <td style={TD}>{place(x)}</td>
                    <td style={TD}>{when(x.first_seen)}</td>
                  </tr>
                ))}
                {!list.length && (
                  <tr><td colSpan={9} style={{ ...TD, textAlign: "center", color: "#94a3b8", padding: 24 }}>इस टैब में अभी कोई user नहीं</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {list.length > 500 && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>पहले 500 दिखाए — खोज से कोई भी user ढूँढें।</div>}
          {oldRows.length > 0 && (
            <div className="panel" data-sb-users-old="1" style={{ padding: 12, marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>🗂️ पुराना डेटा (सिर्फ़ गिनती)</div>
              <div style={{ fontSize: 11.5, color: "#64748b", margin: "2px 0 8px" }}>
                👥 Users शुरू होने ({trackStart}) तक के दिन — 📊 Views की रोज़ की गिनती। इनमें किसी व्यक्ति की अलग history नहीं है; पुराने visitor दोबारा आते ही "पुराना" निशान के साथ ऊपर की लिस्ट में जुड़ जाते हैं।
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={TH}>दिन</th><th style={TH}>users</th><th style={TH}>नए</th><th style={TH}>साइट खुली</th></tr></thead>
                <tbody>
                  {oldRows.map(r => (
                    <tr key={r.day}>
                      <td style={TD}>{r.day}{r.day === trackStart ? " (आज/शुरुआत का दिन, आंशिक)" : ""}</td>
                      <td style={TD}>{Math.max(r.visitors || 0, r.new_visitors || 0)}</td>
                      <td style={TD}>{r.new_visitors || 0}</td>
                      <td style={TD}>{r.opens || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: "#64748b", marginTop: 10, lineHeight: 1.5 }}>
            ध्यान दें: साइट पर लॉगिन नहीं है, इसलिए नाम नहीं आते। वही इंसान नए फ़ोन/ब्राउज़र से या ब्राउज़र का डेटा साफ़ करके आए तो नया user गिना जाएगा। शहर नेटवर्क से अंदाज़ा है (GPS नहीं)। ये users कभी डिलीट नहीं होते।
          </p>
        </>
      )}

      {state === "ok" && u && (
        <div data-sb-users-detail={u.num}>
          <button className="outline-btn" data-sb-users-back="1" onClick={() => { setSel(null); setEvents([]); }} style={{ margin: "8px 0" }}>← सभी users</button>
          <div className="panel" style={{ padding: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0f766e" }}>
              {label(u.num)}
              {u.old_visitor ? <span style={{ marginLeft: 8, fontSize: 12, background: "#fef3c7", color: "#92400e", borderRadius: 8, padding: "2px 8px", verticalAlign: "middle" }}>पुराना visitor</span> : null}
            </div>
            {u.old_visitor ? <div style={{ fontSize: 11.5, color: "#92400e", marginTop: 2 }}>👥 Users शुरू होने से पहले से आता है — पहली विज़िट की तारीख उसके फ़ोन की पुरानी गिनती से; उससे पहले की गतिविधि रिकॉर्ड नहीं है।</div> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 8, fontSize: 13 }}>
              <div>🕐 पहली बार: <b>{when(u.first_seen)}</b></div>
              <div>🟢 आख़िरी बार: <b>{when(u.last_seen)}</b></div>
              <div>🔁 विज़िट: <b>{u.visits}</b> (साइट खुली {u.opens} बार)</div>
              <div>📅 दिन active: <b>{u.days}</b></div>
              <div>📝 मॉक: <b>{u.mocks}</b> • 🎯 क्विज़: <b>{u.quizzes}</b></div>
              <div>⌨️ टाइपिंग: <b>{u.typing}</b> • 🧮 मैथ: <b>{u.calcs}</b></div>
              <div>📖 नोट्स: <b>{u.notes}</b> • 🔘 बटन: <b>{u.tiles}</b></div>
              <div>📱 {dev(u)}{u.browser ? ` • ${u.browser}` : ""}</div>
              <div>📍 {place(u)}{u.country && u.country !== "IN" ? ` (${u.country})` : ""}</div>
            </div>
          </div>
          <h3 style={{ margin: "14px 0 6px", fontSize: 16 }}>पूरी history (नया ऊपर)</h3>
          {evState === "loading" && <div className="panel" style={{ padding: 16, color: "#64748b" }}>लोड हो रहा है…</div>}
          {evState === "ok" && !events.length && <div className="panel" style={{ padding: 16, color: "#94a3b8" }}>अभी कोई गतिविधि नहीं</div>}
          <div data-sb-users-timeline="1">
            {events.map(e => (
              <div key={e.id} className="panel" style={{ padding: "9px 12px", margin: "6px 0", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontSize: 20, lineHeight: 1.2 }}>{KIND[e.kind]?.i || "•"}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0f172a" }}>
                    {KIND[e.kind]?.t || e.kind}
                    {e.title ? <span style={{ fontWeight: 600, color: "#334155" }}> — {e.title}</span> : null}
                  </div>
                  {evLine(e) && <div style={{ fontSize: 12.5, color: "#0f766e", fontWeight: 700, marginTop: 2 }}>{evLine(e)}</div>}
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{when(e.at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
