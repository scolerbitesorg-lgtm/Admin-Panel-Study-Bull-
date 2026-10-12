import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Keyboard,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Flame,
  Target,
  Sparkles,
} from "lucide-react";

export const DEFAULT_TYPING_PASSAGES = {
  ssc_en:
    "India has achieved significant milestones in the field of science, technology and digital governance. The implementation of digital public infrastructure across rural and urban regions has empowered millions of citizens with transparent access to welfare benefits, digital payments, and educational resources. Competitive examination aspirants must cultivate disciplined time management, continuous practice, and high precision in typing and rapid quantitative calculations. Consistent daily practice enhances keyboard familiarity, cognitive focus, and procedural memory, allowing students to qualify typing skill tests with commendable speed and accuracy under strict exam conditions.",
  railway_en:
    "The Indian Railways network serves as the arterial backbone of national connectivity, transporting millions of passengers and crucial freight across vast geographical distances every single day. Modernization initiatives including electrification of tracks, introduction of high-speed passenger trains, and computerized signaling have transformed the transport logistics of our nation. Aspirants preparing for clerical, data entry, and assistant roles must master touch typing without glancing at keyboard keys, ensuring minimal backspaces and high word completion rates.",
  ssc_hi:
    "भारत एक विशाल एवं समृद्ध सांस्कृतिक विविधता वाला महान देश है। आधुनिक युग में डिजिटल साक्षरता और तकनीकी ज्ञान के विस्तार ने युवाओं के समक्ष अनंत संभावनाओं के नए द्वार खोले हैं। प्रतियोगी परीक्षाओं में सफलता प्राप्त करने के लिए निरंतर अध्ययन, एकाग्रता और नियमित समय प्रबंधन अत्यंत आवश्यक है। टंकण परीक्षा में गति के साथ-साथ शुद्धता का भी समान महत्व होता है। नियमित अभ्यास और दृढ़ संकल्प से कठिन से कठिन परीक्षा में भी उत्कृष्ट सफलता प्राप्त की जा सकती है।",
};

interface TypingPracticeViewProps {
  passage?: string;
  language?: "en" | "hi";
  durationMinutes?: number;
  targetWpm?: number;
  title?: string;
  primaryColor?: string;
}

export function TypingPracticeView({
  passage = DEFAULT_TYPING_PASSAGES.ssc_en,
  language = "en",
  durationMinutes = 5,
  targetWpm = 35,
  title = "Typing Skill Test Practice",
  primaryColor = "#1546b5",
}: TypingPracticeViewProps) {
  const targetText = passage.trim() || DEFAULT_TYPING_PASSAGES.ssc_en;
  const initialSeconds = Math.max(30, (durationMinutes || 5) * 60);

  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [backspaceCount, setBackspaceCount] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textDisplayRef = useRef<HTMLDivElement>(null);

  // Timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRunning && timeLeft > 0 && !isFinished) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsFinished(true);
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft, isFinished]);

  // Handle keystroke and character comparisons
  const { correctChars, errorChars, totalTyped } = useMemo(() => {
    let correct = 0;
    let errors = 0;
    const len = input.length;
    for (let i = 0; i < len; i++) {
      if (input[i] === targetText[i]) {
        correct++;
      } else {
        errors++;
      }
    }
    return {
      correctChars: correct,
      errorChars: errors,
      totalTyped: len,
    };
  }, [input, targetText]);

  const elapsedSeconds = initialSeconds - timeLeft;
  const elapsedMinutes = elapsedSeconds > 0 ? elapsedSeconds / 60 : 1 / 60;

  // Standard exam WPM formula: (Characters / 5) / minutes
  const grossWpm = Math.round(totalTyped / 5 / elapsedMinutes);
  const netWpm = Math.max(0, Math.round(correctChars / 5 / elapsedMinutes));
  const accuracy =
    totalTyped > 0 ? Math.max(0, Math.min(100, Math.round((correctChars / totalTyped) * 100))) : 100;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isFinished) return;
    const val = e.target.value;
    if (!isRunning && val.length > 0) {
      setIsRunning(true);
    }
    setInput(val);

    if (val.length >= targetText.length) {
      setIsFinished(true);
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Backspace") {
      setBackspaceCount((b) => b + 1);
    }
  };

  const resetTest = () => {
    setInput("");
    setTimeLeft(initialSeconds);
    setIsRunning(false);
    setIsFinished(false);
    setBackspaceCount(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isQualified = netWpm >= targetWpm && accuracy >= 90;

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        padding: 16,
        color: "#0f172a",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          borderBottom: "1px solid #f1f5f9",
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#e6fffa",
              color: "#0d9488",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Keyboard size={18} />
          </div>
          <div>
            <b style={{ fontSize: 13, display: "block", color: "#1e293b" }}>
              {title}
            </b>
            <small style={{ fontSize: 10, color: "#64748b" }}>
              {language === "hi" ? "हिंदी टंकण (Devanagari)" : "English Typing"} • Target:{" "}
              <b>{targetWpm} WPM</b>
            </small>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Timer Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: 8,
              background: timeLeft <= 60 && isRunning ? "#fee2e2" : "#f1f5f9",
              color: timeLeft <= 60 && isRunning ? "#dc2626" : "#0f172a",
            }}
          >
            <Clock size={13} />
            <span>{formatTimer(timeLeft)}</span>
          </div>

          <button
            onClick={resetTest}
            title="Restart Test"
            style={{
              border: "1px solid #e2e8f0",
              background: "#fff",
              padding: "4px 8px",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              color: "#475569",
            }}
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Realtime Floating Metrics Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          background: "#f8fafc",
          padding: 8,
          borderRadius: 10,
          border: "1px solid #edf2f7",
          textAlign: "center",
        }}
      >
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Speed
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: primaryColor }}>
            {netWpm} <span style={{ fontSize: 9.5, fontWeight: 600 }}>WPM</span>
          </div>
        </div>
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Accuracy
          </small>
          <div
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: accuracy >= 90 ? "#16a34a" : "#dc2626",
            }}
          >
            {accuracy}%
          </div>
        </div>
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Errors
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: errorChars > 0 ? "#dc2626" : "#64748b" }}>
            {errorChars}
          </div>
        </div>
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Chars
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#334155" }}>
            {totalTyped}/{targetText.length}
          </div>
        </div>
      </div>

      {/* Target Passage Visualizer with character highlighting */}
      <div
        ref={textDisplayRef}
        style={{
          maxHeight: 145,
          overflowY: "auto",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 12,
          fontSize: 13,
          lineHeight: 1.8,
          fontFamily:
            language === "hi"
              ? "'Mukta', 'Noto Sans Devanagari', sans-serif"
              : "ui-monospace, monospace",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}
      >
        {targetText.split("").map((char, idx) => {
          let color = "#64748b";
          let bg = "transparent";
          let textDecoration = "none";

          if (idx < input.length) {
            if (input[idx] === char) {
              color = "#15803d";
              bg = "#dcfce7";
            } else {
              color = "#b91c1c";
              bg = "#fee2e2";
              textDecoration = "underline";
            }
          } else if (idx === input.length) {
            bg = "#93c5fd";
            color = "#1e3a8a";
          }

          return (
            <span
              key={idx}
              style={{
                color,
                background: bg,
                borderRadius: 2,
                textDecoration,
                fontWeight: idx === input.length ? 700 : 500,
              }}
            >
              {char}
            </span>
          );
        })}
      </div>

      {/* Typing Input Box */}
      {!isFinished ? (
        <div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              language === "hi"
                ? "यहाँ टाइप करना शुरू करें... टाइमर अपने आप चालू हो जाएगा।"
                : "Start typing here... Timer will start automatically upon your first keystroke."
            }
            autoFocus
            rows={3}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 13,
              borderRadius: 10,
              border: `2px solid ${isRunning ? primaryColor : "#cbd5e1"}`,
              outline: "none",
              fontFamily:
                language === "hi"
                  ? "'Mukta', 'Noto Sans Devanagari', sans-serif"
                  : "ui-monospace, monospace",
              resize: "none",
              lineHeight: 1.6,
              background: "#fbfcfe",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
              fontSize: 10.5,
              color: "#64748b",
            }}
          >
            <span>
              💡 Tip: Backspace: <b>{backspaceCount}</b> times • Keep typing to boost speed!
            </span>
            <span style={{ fontWeight: 600 }}>
              {isRunning ? "🟢 Test in progress" : "⚪ Waiting for first character"}
            </span>
          </div>
        </div>
      ) : (
        /* Results Scorecard */
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: isQualified ? "#f0fdf4" : "#fff7ed",
            border: `1px solid ${isQualified ? "#bbf7d0" : "#fed7aa"}`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: isQualified ? "#22c55e" : "#f97316",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 8px",
            }}
          >
            <Trophy size={22} />
          </div>

          <b
            style={{
              fontSize: 15,
              display: "block",
              color: isQualified ? "#15803d" : "#c2410c",
            }}
          >
            {isQualified
              ? "🎉 SSC / EXAM QUALIFIED!"
              : "⚠️ SPEED CRITERIA NOT MET"}
          </b>

          <p style={{ fontSize: 11.5, color: "#475569", margin: "4px 0 12px" }}>
            {isQualified
              ? `Congratulations! Your speed of ${netWpm} WPM exceeds the exam target of ${targetWpm} WPM with ${accuracy}% accuracy.`
              : `Your Net Speed is ${netWpm} WPM. Target is ${targetWpm} WPM with minimum 90% accuracy. Practice regularly to improve!`}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              textAlign: "left",
              fontSize: 11,
              marginBottom: 14,
            }}
          >
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Net Speed</small>
              <b style={{ fontSize: 13, color: primaryColor }}>{netWpm} WPM</b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Gross Speed</small>
              <b style={{ fontSize: 13, color: "#1e293b" }}>{grossWpm} WPM</b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Accuracy</small>
              <b style={{ fontSize: 13, color: accuracy >= 90 ? "#16a34a" : "#dc2626" }}>
                {accuracy}%
              </b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Errors</small>
              <b style={{ fontSize: 13, color: "#dc2626" }}>{errorChars} chars</b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Backspaces</small>
              <b style={{ fontSize: 13, color: "#b45309" }}>{backspaceCount}</b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Time Taken</small>
              <b style={{ fontSize: 13, color: "#0f172a" }}>{formatTimer(elapsedSeconds)}</b>
            </div>
          </div>

          <button
            onClick={resetTest}
            style={{
              width: "100%",
              height: 36,
              background: primaryColor,
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={14} /> Re-Attempt Typing Test
          </button>
        </div>
      )}
    </div>
  );
}
