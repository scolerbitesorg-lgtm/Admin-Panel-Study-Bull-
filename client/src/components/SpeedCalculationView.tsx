import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Calculator,
  Clock,
  RotateCcw,
  Flame,
  CheckCircle2,
  XCircle,
  Trophy,
  Zap,
  Sparkles,
  ChevronRight,
} from "lucide-react";

export type CalcMode =
  | "mix"
  | "multiply"
  | "add"
  | "subtract"
  | "square"
  | "cube"
  | "percent"
  | "table";

export interface MathProblem {
  id: string;
  expression: string;
  answer: number;
  options: number[];
  trick: string;
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateMathProblem(mode: CalcMode = "mix"): MathProblem {
  let effectiveMode = mode;
  if (mode === "mix") {
    const pool: CalcMode[] = ["multiply", "add", "subtract", "square", "percent", "table"];
    effectiveMode = pool[Math.floor(Math.random() * pool.length)];
  }

  let expression = "";
  let answer = 0;
  let trick = "";

  switch (effectiveMode) {
    case "multiply": {
      const a = getRandomInt(11, 29);
      const b = getRandomInt(4, 16);
      expression = `${a} × ${b}`;
      answer = a * b;
      trick = `वैदिक ट्रिक: ${a} × ${b} = (${a >= 20 ? "20" : "10"} + ${a % 10}) × ${b} = ${answer}`;
      break;
    }
    case "add": {
      const a = getRandomInt(45, 180);
      const b = getRandomInt(35, 140);
      expression = `${a} + ${b}`;
      answer = a + b;
      trick = `फास्ट जोड़: ${a} + ${b} = ${Math.floor(a / 10) * 10 + Math.floor(b / 10) * 10} + ${
        (a % 10) + (b % 10)
      } = ${answer}`;
      break;
    }
    case "subtract": {
      const a = getRandomInt(110, 250);
      const b = getRandomInt(25, 95);
      expression = `${a} - ${b}`;
      answer = a - b;
      trick = `फास्ट घटाव: ${a} - ${b} = ${a} - ${Math.round(b / 10) * 10} ± अंतर = ${answer}`;
      break;
    }
    case "square": {
      const base = getRandomInt(12, 35);
      expression = `${base}² (वर्ग)`;
      answer = base * base;
      if (base % 10 === 5) {
        const ten = Math.floor(base / 10);
        trick = `5 पर समाप्त होने वाला वर्ग: ${ten} × ${ten + 1} = ${ten * (ten + 1)}, अंत में 25 => ${answer}`;
      } else {
        trick = `याद रखें: ${base}² = ${answer}`;
      }
      break;
    }
    case "cube": {
      const base = getRandomInt(6, 18);
      expression = `${base}³ (घन)`;
      answer = base * base * base;
      trick = `घन मान: ${base}³ = ${answer}`;
      break;
    }
    case "percent": {
      const percents = [10, 20, 25, 50, 5, 12.5, 16.66];
      const p = percents[Math.floor(Math.random() * percents.length)];
      if (p === 12.5) {
        const mul = getRandomInt(2, 12);
        const val = mul * 8;
        expression = `12.5% of ${val}`;
        answer = mul;
        trick = `भिन्न ट्रिक: 12.5% = 1/8, इसलिए ${val} ÷ 8 = ${answer}`;
      } else if (p === 16.66) {
        const mul = getRandomInt(2, 12);
        const val = mul * 6;
        expression = `16.66% of ${val}`;
        answer = mul;
        trick = `भिन्न ट्रिक: 16.66% = 1/6, इसलिए ${val} ÷ 6 = ${answer}`;
      } else {
        const val = getRandomInt(2, 20) * 50;
        expression = `${p}% of ${val}`;
        answer = Math.round((p * val) / 100);
        trick = `प्रतिशत ट्रिक: ${p}% of ${val} = (${val} ÷ 100) × ${p} = ${answer}`;
      }
      break;
    }
    case "table":
    default: {
      const t = getRandomInt(13, 24);
      const m = getRandomInt(4, 9);
      expression = `${t} × ${m} (पहाड़ा)`;
      answer = t * m;
      trick = `पहाड़ा याद करें: ${t} × ${m} = ${answer}`;
      break;
    }
  }

  // Generate 3 plausible options
  const optionSet = new Set<number>([answer]);
  const offsets = [-10, 10, -2, 2, -1, 1, -5, 5, -20, 20];
  while (optionSet.size < 4) {
    const off = offsets[Math.floor(Math.random() * offsets.length)];
    const fake = answer + off;
    if (fake > 0 && fake !== answer) {
      optionSet.add(fake);
    }
  }
  const options = Array.from(optionSet).sort(() => Math.random() - 0.5);

  return {
    id: `calc-${Date.now()}-${Math.random()}`,
    expression,
    answer,
    options,
    trick,
  };
}

interface SpeedCalculationViewProps {
  mode?: CalcMode;
  durationSeconds?: number;
  title?: string;
  primaryColor?: string;
}

export function SpeedCalculationView({
  mode = "mix",
  durationSeconds = 60,
  title = "Speed Math Calculation Drill",
  primaryColor = "#1546b5",
}: SpeedCalculationViewProps) {
  const [activeMode, setActiveMode] = useState<CalcMode>(mode);
  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const [currentProblem, setCurrentProblem] = useState<MathProblem>(() =>
    generateMathProblem(mode)
  );
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const [score, setScore] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highestStreak, setHighestStreak] = useState(0);
  const [history, setHistory] = useState<
    Array<{ problem: MathProblem; userAnswer: number; isCorrect: boolean }>
  >([]);

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

  const handlePickOption = (chosen: number) => {
    if (isFinished || selectedOption !== null) return;
    if (!isRunning) setIsRunning(true);

    setSelectedOption(chosen);
    setAttempted((a) => a + 1);

    const isCorrect = chosen === currentProblem.answer;
    if (isCorrect) {
      setFeedback("correct");
      setScore((s) => s + 1);
      setStreak((st) => {
        const next = st + 1;
        if (next > highestStreak) setHighestStreak(next);
        return next;
      });
    } else {
      setFeedback("wrong");
      setStreak(0);
    }

    setHistory((prev) => [
      ...prev,
      { problem: currentProblem, userAnswer: chosen, isCorrect },
    ]);

    // Fast automatic next question transition
    setTimeout(() => {
      setSelectedOption(null);
      setFeedback(null);
      setCurrentProblem(generateMathProblem(activeMode));
    }, 450);
  };

  const handleReset = () => {
    setTimeLeft(durationSeconds);
    setIsRunning(false);
    setIsFinished(false);
    setScore(0);
    setAttempted(0);
    setStreak(0);
    setHighestStreak(0);
    setSelectedOption(null);
    setFeedback(null);
    setHistory([]);
    setCurrentProblem(generateMathProblem(activeMode));
  };

  const accuracy =
    attempted > 0 ? Math.round((score / attempted) * 100) : 100;
  const elapsed = durationSeconds - timeLeft;
  const avgTimePerQuestion =
    attempted > 0 ? (elapsed / attempted).toFixed(1) : "0.0";

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
              background: "#fff7ed",
              color: "#ea580c",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Zap size={18} />
          </div>
          <div>
            <b style={{ fontSize: 13, display: "block", color: "#1e293b" }}>
              {title}
            </b>
            <small style={{ fontSize: 10, color: "#64748b" }}>
              Fast Calculation • {durationSeconds}s Speed Sprint
            </small>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Live Streak indicator */}
          {streak > 1 && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 800,
                color: "#ea580c",
                background: "#ffedd5",
                padding: "3px 8px",
                borderRadius: 99,
              }}
            >
              <Flame size={12} /> {streak} Streak!
            </div>
          )}

          {/* Timer */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: 8,
              background: timeLeft <= 15 && isRunning ? "#fee2e2" : "#f1f5f9",
              color: timeLeft <= 15 && isRunning ? "#dc2626" : "#0f172a",
            }}
          >
            <Clock size={13} />
            <span>{timeLeft}s</span>
          </div>

          <button
            onClick={handleReset}
            title="Reset Drill"
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

      {/* Drill Mode Pills */}
      {!isRunning && !isFinished && (
        <div
          style={{
            display: "flex",
            gap: 5,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {(
            [
              { id: "mix", label: "⚡ Mix Sprint" },
              { id: "multiply", label: "✖️ Multiply" },
              { id: "add", label: "➕ Addition" },
              { id: "subtract", label: "➖ Subtraction" },
              { id: "square", label: "📐 Squares" },
              { id: "cube", label: "🧊 Cubes" },
              { id: "percent", label: "📊 Percent" },
              { id: "table", label: "🔢 Tables" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setActiveMode(m.id);
                setCurrentProblem(generateMathProblem(m.id));
              }}
              style={{
                border: "1px solid",
                borderColor: activeMode === m.id ? primaryColor : "#e2e8f0",
                background: activeMode === m.id ? `${primaryColor}15` : "#fff",
                color: activeMode === m.id ? primaryColor : "#475569",
                borderRadius: 8,
                padding: "4px 8px",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Realtime Stats Bar */}
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
            Score
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#16a34a" }}>
            {score}
          </div>
        </div>
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Attempted
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: "#1e293b" }}>
            {attempted}
          </div>
        </div>
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Accuracy
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: accuracy >= 80 ? "#16a34a" : "#dc2626" }}>
            {accuracy}%
          </div>
        </div>
        <div>
          <small style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Speed
          </small>
          <div style={{ fontSize: 15, fontWeight: 900, color: primaryColor }}>
            {avgTimePerQuestion}s
          </div>
        </div>
      </div>

      {/* Main Interactive Calculation Question Display */}
      {!isFinished ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Question Expression Box */}
          <div
            style={{
              padding: "24px 16px",
              borderRadius: 14,
              textAlign: "center",
              background:
                feedback === "correct"
                  ? "#dcfce7"
                  : feedback === "wrong"
                  ? "#fee2e2"
                  : "linear-gradient(135deg, #f8fafc, #edf2f7)",
              border: `2px solid ${
                feedback === "correct"
                  ? "#22c55e"
                  : feedback === "wrong"
                  ? "#ef4444"
                  : "#cbd5e1"
              }`,
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#64748b",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Solve Quickly:
            </span>
            <div
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: "#0f172a",
                margin: "6px 0",
                letterSpacing: "0.02em",
              }}
            >
              {currentProblem.expression} = ?
            </div>
            <small style={{ fontSize: 11, color: "#64748b" }}>
              {!isRunning
                ? "Tap any answer below to start the timer!"
                : "Choose the correct answer instantly:"}
            </small>
          </div>

          {/* 4 Quick Options Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {currentProblem.options.map((opt, i) => {
              const isSelected = selectedOption === opt;
              const isAnswer = opt === currentProblem.answer;

              let bg = "#fff";
              let border = "#cbd5e1";
              let color = "#1e293b";

              if (selectedOption !== null) {
                if (isAnswer) {
                  bg = "#dcfce7";
                  border = "#22c55e";
                  color = "#15803d";
                } else if (isSelected) {
                  bg = "#fee2e2";
                  border = "#ef4444";
                  color = "#b91c1c";
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handlePickOption(opt)}
                  disabled={selectedOption !== null}
                  style={{
                    padding: "14px 10px",
                    borderRadius: 12,
                    fontSize: 18,
                    fontWeight: 800,
                    background: bg,
                    border: `2px solid ${border}`,
                    color,
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    transition: "transform 0.1s ease",
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Vedic Math Trick Tip */}
          {currentProblem.trick && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 11,
                color: "#166534",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={13} style={{ flexShrink: 0, color: "#16a34a" }} />
              <span>{currentProblem.trick}</span>
            </div>
          )}
        </div>
      ) : (
        /* Final Scorecard */
        <div
          style={{
            padding: 18,
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#ea580c",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 8px",
            }}
          >
            <Trophy size={24} />
          </div>

          <b style={{ fontSize: 16, display: "block", color: "#0f172a" }}>
            Speed Sprint Completed!
          </b>

          <p style={{ fontSize: 11.5, color: "#64748b", margin: "4px 0 14px" }}>
            You solved <b>{score}</b> correct out of <b>{attempted}</b> questions in {durationSeconds} seconds with an average pace of <b>{avgTimePerQuestion}s</b> per problem.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              textAlign: "left",
              fontSize: 11,
              marginBottom: 16,
            }}
          >
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Total Score</small>
              <b style={{ fontSize: 14, color: "#16a34a" }}>{score} Correct</b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Accuracy</small>
              <b style={{ fontSize: 14, color: accuracy >= 80 ? "#16a34a" : "#dc2626" }}>
                {accuracy}%
              </b>
            </div>
            <div style={{ background: "#fff", padding: 8, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Max Streak</small>
              <b style={{ fontSize: 14, color: "#ea580c" }}>🔥 {highestStreak}</b>
            </div>
          </div>

          <button
            onClick={handleReset}
            style={{
              width: "100%",
              height: 38,
              background: primaryColor,
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={14} /> Play Again
          </button>
        </div>
      )}
    </div>
  );
}
