import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import {
  isAdminSignedIn,
  onAdminAuthChange,
  restoreAdminSession,
  signInAdmin,
  isSupabaseConfigured,
} from "@/lib/supabase";

/**
 * Step 1 of the admin login (Oct 26 2026 security lock): Supabase email + password.
 * Nothing behind this gate (passcode screen, data load, saves) runs until the admin is signed in.
 * Step 2 is the existing passcode screen, unchanged.
 */
export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "out" | "in">(isAdminSignedIn() ? "in" : "checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const off = onAdminAuthChange(signedIn => {
      if (!alive) return;
      setStatus(prev => {
        // Signed out from another tab or the session expired: reload so no admin data stays on screen
        if (prev === "in" && !signedIn) {
          setTimeout(() => window.location.reload(), 50);
        }
        return signedIn ? "in" : "out";
      });
    });
    void restoreAdminSession().then(ok => {
      if (alive) setStatus(ok ? "in" : "out");
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError("कृपया ईमेल और पासवर्ड दोनों भरें।");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await signInAdmin(email, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "❌ साइन-इन नहीं हुआ");
      return;
    }
    setPassword("");
    setStatus("in");
  };

  if (status === "in") return <>{children}</>;

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0284c7 100%)",
    fontFamily: "system-ui, -apple-system, 'Noto Sans Devanagari', sans-serif",
    padding: 16,
    boxSizing: "border-box",
  };

  if (status === "checking") {
    return (
      <div style={wrap} data-sb-auth="checking">
        <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600 }}>⏳ लॉगिन जाँच रहे हैं…</div>
      </div>
    );
  }

  const input: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 14px",
    fontSize: 16,
    borderRadius: 12,
    border: "1.5px solid #cbd5e1",
    outline: "none",
    background: "#f8fafc",
    color: "#0f172a",
  };
  const label: React.CSSProperties = {
    display: "block",
    textAlign: "left",
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    margin: "14px 0 6px",
  };

  return (
    <div style={wrap} data-sb-auth="signin">
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 20,
          padding: "28px 20px 22px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1 }}>🔐</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "10px 0 4px" }}>एडमिन लॉगिन</h1>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>StudyBull Admin • Step 1 of 2</div>
        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
          अपना एडमिन ईमेल और पासवर्ड डालें। इसके बाद पासकोड माँगा जाएगा।
        </div>

        <form onSubmit={submit} autoComplete="on" style={{ marginTop: 6 }}>
          <label style={label} htmlFor="sb-admin-email">
            📧 ईमेल (Email)
          </label>
          <input
            id="sb-admin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="admin@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={input}
          />
          <label style={label} htmlFor="sb-admin-password">
            🔑 पासवर्ड (Password)
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="sb-admin-password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="पासवर्ड"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ ...input, paddingRight: 64 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#0284c7",
                fontWeight: 700,
                fontSize: 13,
                padding: "8px 8px",
                cursor: "pointer",
              }}
              aria-label={showPw ? "पासवर्ड छिपाएँ" : "पासवर्ड दिखाएँ"}
            >
              {showPw ? "छिपाएँ" : "दिखाएँ"}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 13,
                fontWeight: 600,
                textAlign: "left",
              }}
            >
              {error}
            </div>
          )}
          {!isSupabaseConfigured && (
            <div style={{ marginTop: 12, color: "#b91c1c", fontSize: 13 }}>डेटाबेस कनेक्ट नहीं है।</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "14px 16px",
              borderRadius: 12,
              border: "none",
              background: busy ? "#7dd3fc" : "linear-gradient(135deg, #0284c7, #2563eb)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 800,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "⏳ साइन इन हो रहा है…" : "साइन इन करें →"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
          🔒 सिर्फ़ एडमिन के लिए • बिना लॉगिन कोई डेटा न दिखेगा, न बदलेगा
        </div>
      </div>
    </div>
  );
}
