export type McqQuestion = {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation?: string;
};

/**
 * High-speed bulk MCQ parser supporting 500+ questions at once.
 * Handles formats like:
 * question 1. What is ...?
 * A.. Option 1
 * B.. Option 2
 * C.. Option 3
 * D.. Option 4
 * And. C   (or Ans. C / Answer: C / उत्तर: C)
 * Explane. Detailed explanation here... (or Explain / Explanation / व्याख्या)
 */
export function parseBulkMcqText(rawText: string): McqQuestion[] {
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const results: McqQuestion[] = [];

  // Regex patterns
  const questionStartRe =
    /^\s*(?:(?:question|ques|que|q|प्र|प्रश्न)\s*[-.:)]*\s*\d+\s*[-.:)]*|\d+\s*[-.):]+|\(\d+\))\s*(.+)$/i;

  const optionLineRe =
    /^\s*(?:\(([A-Da-dअ-दक-घ1-4])\)|\[([A-Da-dअ-दक-घ1-4])\]|([A-Da-dअ-दक-घ])\s*(?:\.{1,3}|\)|:|-|–))\s*(.+)$/;

  const inlineOptionsRe =
    /(?:^|\s+)(?:\(?([A-Da-d])\)?(?:\.{1,3}|\)|:|-)\s*)([^A-D\n]+?)(?=\s+(?:\(?[B-Db-d]\)?(?:\.{1,3}|\)|:|-)\s*)|$)/g;

  const answerLineRe =
    /^\s*(?:ans(?:wer)?|and|correct(?:\s*ans(?:wer)?)?|right\s*ans(?:wer)?|उत्तर|सही\s*उत्तर)\s*[-.:=)]*\s*\(?\[?([A-Da-dअ-दक-घ1-4])\]?\)?(?:\s*[-.:)]*\s*(.*))?$/i;

  const explainLineRe =
    /^\s*(?:explane|explain|explanation|exp|sol(?:ution)?|note|व्याख्या|स्पष्टीकरण|हल)\s*[-.:=)]*\s*(.*)$/i;

  const mapOptionCharToIndex = (ch: string): number => {
    const c = ch.trim().toUpperCase();
    if (c === "A" || c === "1" || c === "अ" || c === "क") return 0;
    if (c === "B" || c === "2" || c === "ब" || c === "ख") return 1;
    if (c === "C" || c === "3" || c === "स" || c === "ग") return 2;
    if (c === "D" || c === "4" || c === "द" || c === "घ") return 3;
    return 0;
  };

  let currentQuestionText = "";
  let currentOptions: [string, string, string, string] = ["", "", "", ""];
  let optionsFoundMask = [false, false, false, false];
  let currentCorrectIndex = 0;
  let currentExplanation = "";
  let state: "idle" | "question" | "options" | "answer" | "explanation" = "idle";

  const flushCurrent = () => {
    const qClean = currentQuestionText.trim();
    const hasAnyOption = optionsFoundMask.some(Boolean);
    if (qClean && hasAnyOption) {
      results.push({
        id: `mcq-${Date.now()}-${results.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
        question: qClean,
        options: [
          currentOptions[0].trim() || "Option A",
          currentOptions[1].trim() || "Option B",
          currentOptions[2].trim() || "Option C",
          currentOptions[3].trim() || "Option D",
        ],
        correctIndex:
          currentCorrectIndex >= 0 && currentCorrectIndex <= 3 ? currentCorrectIndex : 0,
        explanation: currentExplanation.trim() || undefined,
      });
    }
    currentQuestionText = "";
    currentOptions = ["", "", "", ""];
    optionsFoundMask = [false, false, false, false];
    currentCorrectIndex = 0;
    currentExplanation = "";
    state = "idle";
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Check if this line is an Answer declaration (e.g. "And. C" or "Ans: B")
    const ansMatch = line.match(answerLineRe);
    if (ansMatch && state !== "idle") {
      currentCorrectIndex = mapOptionCharToIndex(ansMatch[1]);
      state = "answer";
      // Check if explanation is on the same line after answer
      if (ansMatch[2]) {
        const inlineExp = ansMatch[2].match(explainLineRe);
        if (inlineExp && inlineExp[1]) {
          currentExplanation = inlineExp[1].trim();
          state = "explanation";
        }
      }
      continue;
    }

    // 2. Check if this line is an Explanation declaration (e.g. "Explane. ...")
    const expMatch = line.match(explainLineRe);
    if (expMatch && state !== "idle") {
      currentExplanation = expMatch[1] ? expMatch[1].trim() : "";
      state = "explanation";
      continue;
    }

    // 3. Check if this line is an Option (A.. / B.. / C.. / D..)
    const optMatch = line.match(optionLineRe);
    if (optMatch && state !== "idle") {
      // Check if multiple options are on the same line
      const inlineMatches = [...line.matchAll(inlineOptionsRe)];
      if (inlineMatches.length >= 2) {
        for (const m of inlineMatches) {
          const idx = mapOptionCharToIndex(m[1]);
          currentOptions[idx] = m[2].trim();
          optionsFoundMask[idx] = true;
        }
      } else {
        const letter = optMatch[1] || optMatch[2] || optMatch[3];
        const idx = mapOptionCharToIndex(letter);
        // If we already completed a full question + options + answer/explanation, and suddenly see A.. without a question header, Wait: only flush if we had no new question header
        currentOptions[idx] = optMatch[4].trim();
        optionsFoundMask[idx] = true;
      }
      state = "options";
      continue;
    }

    // 4. Check if this line starts a new Question ("question 1. ..." or "1. ...")
    const qMatch = line.match(questionStartRe);
    if (qMatch) {
      if (state !== "idle") {
        flushCurrent();
      }
      currentQuestionText = qMatch[1].trim();
      state = "question";
      continue;
    }

    // 5. Continuation lines or unnumbered question start
    if (state === "idle") {
      currentQuestionText = line;
      state = "question";
    } else if (state === "question") {
      currentQuestionText += "\n" + line;
    } else if (state === "explanation") {
      // If we are in explanation and encounter a line that looks like a new unnumbered question (next line is A..), check lookahead
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)?.trim() || "";
      const nextIsOptA =
        nextNonEmpty.match(optionLineRe) &&
        mapOptionCharToIndex(
          (nextNonEmpty.match(optionLineRe)?.[1] ||
            nextNonEmpty.match(optionLineRe)?.[2] ||
            nextNonEmpty.match(optionLineRe)?.[3]) ?? "A"
        ) === 0;
      if (nextIsOptA) {
        flushCurrent();
        currentQuestionText = line;
        state = "question";
      } else {
        currentExplanation += (currentExplanation ? "\n" : "") + line;
      }
    } else if (state === "answer") {
      // Check if next line is Option A (meaning this line is a new unnumbered question)
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)?.trim() || "";
      const nextIsOptA =
        nextNonEmpty.match(optionLineRe) &&
        mapOptionCharToIndex(
          (nextNonEmpty.match(optionLineRe)?.[1] ||
            nextNonEmpty.match(optionLineRe)?.[2] ||
            nextNonEmpty.match(optionLineRe)?.[3]) ?? "A"
        ) === 0;
      if (nextIsOptA) {
        flushCurrent();
        currentQuestionText = line;
        state = "question";
      } else {
        currentExplanation += (currentExplanation ? "\n" : "") + line;
        state = "explanation";
      }
    } else if (state === "options") {
      // Append to last active option
      let lastIdx = 0;
      for (let k = 3; k >= 0; k--) {
        if (optionsFoundMask[k]) {
          lastIdx = k;
          break;
        }
      }
      currentOptions[lastIdx] += " " + line;
    }
  }

  flushCurrent();
  return results;
}

export const SAMPLE_BULK_MCQ_FORMAT = `question 1. भारतीय संविधान का कौन सा अनुच्छेद स्वतंत्रता का अधिकार देता है?
A.. अनुच्छेद 14
B.. अनुच्छेद 19
C.. अनुच्छेद 21
D.. अनुच्छेद 32
And. B
Explane. अनुच्छेद 19 नागरिकों को वाक् एवं अभिव्यक्ति सहित 6 प्रकार की स्वतंत्रताएं प्रदान करता है।

question 2. संविधान सभा की प्रारूप समिति (Drafting Committee) के अध्यक्ष कौन थे?
A.. डॉ. राजेंद्र प्रसाद
B.. पं. जवाहरलाल नेहरू
C.. डॉ. बी.आर. अम्बेडकर
D.. सरदार वल्लभभाई पटेल
And. C
Explane. डॉ. भीमराव अम्बेडकर संविधान की प्रारूप समिति के अध्यक्ष थे।

question 3. भारत में 'योजना आयोग' के स्थान पर किस संस्था का गठन किया गया?
A.. वित्त आयोग
B.. नीति आयोग
C.. चुनाव आयोग
D.. लोकपाल
And. B
Explane. 1 जनवरी 2015 को योजना आयोग के स्थान पर नीति आयोग (NITI Aayog) का गठन किया गया।`;
