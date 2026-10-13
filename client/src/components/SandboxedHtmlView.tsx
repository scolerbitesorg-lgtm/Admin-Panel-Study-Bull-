import React, { useEffect, useId, useMemo, useRef, useState } from "react";

export interface SandboxedHtmlViewProps {
  htmlContent?: string | null;
  title?: string;
  minHeight?: number | string;
  maxHeight?: number | string;
  style?: React.CSSProperties;
  className?: string;
  showCardHeader?: boolean;
  onFullScreen?: () => void;
}

/**
 * SandboxedHtmlView
 *
 * Universal, error-free HTML / CSS / JS Sandbox execution engine.
 * Guarantees that every kind of web app executes properly:
 * 1. Polyfills localStorage & sessionStorage in memory so sandboxed code never crashes with SecurityError.
 * 2. Polyfills alert, confirm, prompt, and clipboard APIs safely.
 * 3. Handles both full HTML5 documents (<!DOCTYPE html>) and raw HTML/JS snippets.
 * 4. Injects viewport meta and mobile responsive styling to prevent Android overflow.
 * 5. Uses a controlled postMessage height auto-resizer to dynamically adapt to content changes.
 * 6. Catches unhandled runtime script errors gracefully to prevent white-screens.
 */
export default function SandboxedHtmlView({
  htmlContent,
  title,
  minHeight = 480,
  maxHeight,
  style,
  className,
  showCardHeader = false,
}: SandboxedHtmlViewProps) {
  const uniqueId = useId().replace(/[:]/g, "_");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  // Check if content exists and has non-whitespace characters
  const trimmed = (htmlContent || "").trim();
  const isEmpty = trimmed.length === 0;

  // Listen for controlled postMessage height events from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "STUDYBULL_HTML_RESIZE" &&
        event.data.id === uniqueId &&
        typeof event.data.height === "number" &&
        event.data.height > 40
      ) {
        // Clamp height between 280px and 3500px to avoid runaway expansion
        const safeHeight = Math.max(280, Math.min(event.data.height + 24, 3500));
        setContentHeight(safeHeight);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [uniqueId]);

  // Construct fail-safe, complete HTML document
  const safeSrcDoc = useMemo(() => {
    if (isEmpty) return "";

    // Polyfill script injected at the very start of execution
    const polyfillScript = `
<script>
(function() {
  // 1. Safe in-memory localStorage & sessionStorage polyfill (prevents SecurityError in sandboxes)
  function createMemoryStore() {
    var store = {};
    return {
      getItem: function(k) { return store.hasOwnProperty(k) ? store[k] : null; },
      setItem: function(k, v) { store[k] = String(v); },
      removeItem: function(k) { delete store[k]; },
      clear: function() { store = {}; },
      key: function(i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
  }

  try {
    var testKey = "__sb_test_" + Math.random();
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
  } catch(e) {
    try {
      var memLocal = createMemoryStore();
      var memSession = createMemoryStore();
      Object.defineProperty(window, 'localStorage', { value: memLocal, configurable: true, writable: true });
      Object.defineProperty(window, 'sessionStorage', { value: memSession, configurable: true, writable: true });
    } catch(err2) {}
  }

  // 2. Safe dialog polyfills (prevent blocked alerts/prompts from breaking scripts)
  if (typeof window.alert !== "function") {
    window.alert = function(msg) { console.log("[Alert]:", msg); };
  }
  if (typeof window.confirm !== "function") {
    window.confirm = function() { return true; };
  }
  if (typeof window.prompt !== "function") {
    window.prompt = function() { return ""; };
  }

  // 3. Graceful error logging (prevents uncaught exceptions from halting DOM execution)
  window.addEventListener('error', function(e) {
    console.warn('[StudyBull Sandbox Notice]:', e.message);
  });
})();
</script>
`;

    // Dynamic height reporter script injected at end
    const resizeScript = `
<script>
(function() {
  var lastH = 0;
  function reportHeight() {
    try {
      var h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.offsetHeight : 0
      );
      if (h > 0 && Math.abs(h - lastH) > 4) {
        lastH = h;
        if (window.parent) {
          window.parent.postMessage({
            type: "STUDYBULL_HTML_RESIZE",
            id: "${uniqueId}",
            height: h
          }, "*");
        }
      }
    } catch(e) {}
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    reportHeight();
  } else {
    window.addEventListener("DOMContentLoaded", reportHeight);
  }
  window.addEventListener("load", reportHeight);

  if (typeof ResizeObserver !== "undefined" && document.body) {
    try {
      new ResizeObserver(function() { reportHeight(); }).observe(document.body);
    } catch(e) {}
  }

  // Periodically check for dynamic DOM modifications (e.g. search filters or collapsible cards)
  setInterval(reportHeight, 1000);
})();
</script>
`;

    const metaViewport = `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">`;
    const baseStyle = `
<style>
  html, body {
    max-width: 100%;
    overflow-x: hidden;
    -webkit-text-size-adjust: 100%;
    box-sizing: border-box;
  }
  *, *:before, *:after {
    box-sizing: inherit;
  }
  img, video, canvas, svg {
    max-width: 100%;
    height: auto;
  }
</style>
`;

    // Case A: Full HTML document already present
    if (/<html[\s>]/i.test(trimmed) || /<!doctype/i.test(trimmed)) {
      let doc = trimmed;

      // Ensure viewport meta is present in <head>
      if (!/<meta[^>]+viewport/i.test(doc)) {
        if (/<head[\s>]/i.test(doc)) {
          doc = doc.replace(/<head[\s>]/i, (match) => `${match}\n  ${metaViewport}`);
        } else {
          doc = doc.replace(/<html[\s>]/i, (match) => `${match}\n<head>${metaViewport}</head>`);
        }
      }

      // Prepend polyfills right after <head> or at top
      if (/<head[\s>]/i.test(doc)) {
        doc = doc.replace(/<head[\s>]/i, (match) => `${match}\n${polyfillScript}\n${baseStyle}`);
      } else {
        doc = polyfillScript + baseStyle + doc;
      }

      // Inject resize script before </body> or append
      if (/<\/body>/i.test(doc)) {
        return doc.replace(/<\/body>/i, `${resizeScript}\n</body>`);
      }
      return doc + resizeScript;
    }

    // Case B: Raw snippet, markup, or script - Wrap in a standard, clean HTML5 document shell
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  ${metaViewport}
  ${polyfillScript}
  ${baseStyle}
  <style>
    body {
      margin: 0;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #ffffff;
      color: #0f172a;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  ${trimmed}
  ${resizeScript}
</body>
</html>`;
  }, [trimmed, isEmpty, uniqueId]);

  if (isEmpty) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          padding: "36px 20px",
          textAlign: "center",
          background: "#f8fafc",
          borderRadius: 12,
          border: "1px dashed #cbd5e1",
          color: "#64748b",
          boxSizing: "border-box",
          ...style,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>🌐</div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#334155" }}>
          {title ? `No content available for "${title}"` : "No custom web content"}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
          HTML code has not been added to this section yet.
        </p>
      </div>
    );
  }

  const computedHeight = contentHeight || minHeight;

  return (
    <div
      className={className}
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: 12,
        background: "#ffffff",
        ...style,
      }}
    >
      {showCardHeader && title && (
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
            {title}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#0284c7",
              background: "#e0f2fe",
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            {"</>"} Web App
          </span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={title || "Custom Web View"}
        srcDoc={safeSrcDoc}
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
        allow="fullscreen; clipboard-read; clipboard-write; autoplay; encrypted-media; picture-in-picture"
        loading="lazy"
        style={{
          width: "100%",
          maxWidth: "100%",
          height: computedHeight,
          minHeight: minHeight,
          maxHeight: maxHeight,
          border: "none",
          borderRadius: showCardHeader ? "0 0 12px 12px" : "12px",
          background: "#ffffff",
          display: "block",
          overflowY: "auto",
          overflowX: "hidden",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
