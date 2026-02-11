"use client";

import { useState, useCallback } from "react";
import { diffWords } from "diff";

interface RuleResult {
  rule: string;
  status: "pass" | "partial" | "fail";
  feedback: string;
  recommendation: string;
}

interface AnalysisResult {
  score: number;
  rules: RuleResult[];
  improvedPrompt: string;
}

const EXAMPLE_PROMPTS = [
  "Write me a blog post about AI",
  "Make a website",
  "Help me fix my code it's broken",
  "Summarize this document",
];

const RULE_ICONS: Record<string, string> = {
  "Give Context": "1",
  "Be Specific": "2",
  "Show an Example": "3",
  "Give It a Role": "4",
  "Iterate, Don't Settle": "5",
};

const RULE_DESCRIPTIONS: Record<string, string> = {
  "Give Context": "Tell it who you are, who it's for, and why it matters",
  "Be Specific": "Define format, length, tone, audience",
  "Show an Example": "If you know what good looks like, share it",
  "Give It a Role": '"You\'re a [expert]" changes everything',
  "Iterate, Don't Settle": "Your first prompt is a draft. Refine it",
};

/* ------------------------------------------------------------------ */
/*  Try to extract partial results from an incomplete JSON stream      */
/* ------------------------------------------------------------------ */
function extractPartialResult(raw: string): Partial<AnalysisResult> | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    return JSON.parse(text);
  } catch {
    // Continue with partial extraction
  }

  const partial: Partial<AnalysisResult> = {};

  const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
  if (scoreMatch) {
    partial.score = parseInt(scoreMatch[1], 10);
  }

  // Extract rule objects with recommendation field
  const rulePattern =
    /\{\s*"rule"\s*:\s*"([^"]+)"\s*,\s*"status"\s*:\s*"(pass|partial|fail)"\s*,\s*"feedback"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"recommendation"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  const rules: RuleResult[] = [];
  let match;
  while ((match = rulePattern.exec(text)) !== null) {
    rules.push({
      rule: match[1],
      status: match[2] as "pass" | "partial" | "fail",
      feedback: match[3].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
      recommendation: match[4].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
    });
  }
  if (rules.length > 0) {
    partial.rules = rules;
  }

  const ipMatch = text.match(
    /"improvedPrompt"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/
  );
  if (ipMatch) {
    partial.improvedPrompt = ipMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t");
  }

  return Object.keys(partial).length > 0 ? partial : null;
}

/* ------------------------------------------------------------------ */
/*  Score Ring                                                         */
/* ------------------------------------------------------------------ */
function ScoreRing({ score }: { score: number }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  const offset = circumference - progress;

  const color =
    score <= 3 ? "#dc2626" : score <= 6 ? "#d97706" : "#16a34a";

  const labelColor =
    score <= 3 ? "#dc2626" : score <= 6 ? "#b45309" : "#15803d";

  const label =
    score <= 3
      ? "Needs work"
      : score <= 6
        ? "Getting there"
        : score <= 8
          ? "Strong"
          : "Excellent";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative inline-flex items-center justify-center">
        <svg width="180" height="180" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="50" cy="50" r={radius} fill="none" stroke={color}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="animate-score-ring"
            style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center animate-score-number">
          <span className="text-6xl font-bold tabular-nums tracking-tight" style={{ color }}>
            {score}
          </span>
          <span className="text-sm font-medium text-gray-400 -mt-1">/ 10</span>
        </div>
      </div>
      <span
        className="text-sm font-semibold tracking-wide uppercase animate-fade-in delay-500"
        style={{ color: labelColor }}
      >
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rule Card (with integrated recommendation)                        */
/* ------------------------------------------------------------------ */
function RuleCard({ rule, index }: { rule: RuleResult; index: number }) {
  const statusDotColor =
    rule.status === "pass" ? "bg-green-500" : rule.status === "partial" ? "bg-amber-500" : "bg-red-500";

  const statusLabel =
    rule.status === "pass" ? "Pass" : rule.status === "partial" ? "Partial" : "Missing";

  const statusTextColor =
    rule.status === "pass" ? "text-green-700" : rule.status === "partial" ? "text-amber-700" : "text-red-700";

  return (
    <div
      className="animate-fade-in-up group"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start gap-4 p-5 rounded-xl bg-white border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow duration-200">
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
          {RULE_ICONS[rule.rule] || index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-[15px] font-semibold text-gray-900 tracking-[-0.01em]">
              {rule.rule}
            </h3>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusTextColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
              {statusLabel}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2 leading-relaxed">
            {RULE_DESCRIPTIONS[rule.rule]}
          </p>
          {/* Assessment */}
          <p className="text-sm text-gray-600 leading-relaxed">
            {rule.feedback}
          </p>
          {/* Recommendation */}
          {rule.recommendation && (
            <div className="mt-3 flex gap-2 items-start rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2.5">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5 text-indigo-500">
                <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 5a.75.75 0 011.5 0v3.25a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 100-1.5.75.75 0 000 1.5z" fill="currentColor"/>
              </svg>
              <p className="text-[13px] text-indigo-700 leading-relaxed">
                {rule.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Diff View                                                          */
/* ------------------------------------------------------------------ */
function DiffView({ original, improved }: { original: string; improved: string }) {
  const changes = diffWords(original, improved);

  return (
    <div className="font-mono text-[14px] leading-[1.75] whitespace-pre-wrap text-gray-700">
      {changes.map((part, i) => {
        if (part.added) return <span key={i} className="diff-added">{part.value}</span>;
        if (part.removed) return <span key={i} className="diff-removed">{part.value}</span>;
        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Streaming Progress Indicator                                       */
/* ------------------------------------------------------------------ */
function StreamingProgress({ phase }: { phase: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-16 animate-fade-in">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-[3px] border-gray-200" />
        <div className="absolute top-0 left-0 w-12 h-12 rounded-full border-[3px] border-transparent border-t-indigo-600 animate-spin-slow" />
      </div>
      <p className="text-base text-gray-400 font-medium">{phase}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Header                                                     */
/* ------------------------------------------------------------------ */
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-gray-900 tracking-[-0.02em]">{title}</h2>
      {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */
export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<Partial<AnalysisResult> | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState("Analyzing your prompt...");

  const analyzePrompt = useCallback(async () => {
    if (!prompt.trim()) return;

    setStreaming(true);
    setDone(false);
    setError(null);
    setResult(null);
    setPhase("Analyzing your prompt...");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!response.ok) throw new Error("Analysis failed. Please try again.");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream.");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                setError(parsed.error);
                setStreaming(false);
                return;
              }
              if (parsed.text) {
                accumulated += parsed.text;

                const partial = extractPartialResult(accumulated);
                if (partial) {
                  setResult(partial);

                  if (partial.improvedPrompt) {
                    setPhase("Done!");
                  } else if (partial.rules && partial.rules.length > 0) {
                    setPhase(`Evaluating rules... (${partial.rules.length}/5)`);
                  } else if (partial.score !== undefined) {
                    setPhase("Evaluating rules...");
                  }
                }
              }
            } catch {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }

      const final = extractPartialResult(accumulated);
      if (final) setResult(final);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStreaming(false);
    }
  }, [prompt]);

  function reset() {
    setPrompt("");
    setResult(null);
    setDone(false);
    setError(null);
  }

  function useExample(example: string) {
    setPrompt(example);
    setResult(null);
    setDone(false);
    setError(null);
  }

  const hasScore = result?.score !== undefined;
  const hasRules = (result?.rules?.length ?? 0) > 0;
  const hasImproved = !!result?.improvedPrompt;
  const showInput = !result && !streaming;

  const rulesPassed = result?.rules?.filter((r) => r.status === "pass").length ?? 0;
  const rulesPartial = result?.rules?.filter((r) => r.status === "partial").length ?? 0;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-600" />

      {/* ---- Input Mode: centered narrow layout ---- */}
      {showInput && (
        <div className="mx-auto max-w-[720px] px-6 py-16">
          <header className="text-center mb-14 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-indigo-600 mb-4">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-80">
                <path d="M8 1L10.163 5.279L15 6.056L11.5 9.321L12.326 14L8 11.779L3.674 14L4.5 9.321L1 6.056L5.837 5.279L8 1Z" fill="currentColor"/>
              </svg>
              Prompt Workshop
            </div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-gray-900">Prompt Analyzer</h1>
            <p className="mt-3 text-base text-gray-500 max-w-md mx-auto leading-relaxed">
              Rate your prompts against the 5 rules of great prompting
            </p>
          </header>

          <div className="animate-fade-in-up delay-100">
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5">Try an example</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    onClick={() => useExample(example)}
                    className="px-3.5 py-1.5 text-[13px] rounded-full bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all duration-150 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Paste your prompt here..."
                rows={5}
                className="w-full rounded-xl bg-white border border-gray-200 p-5 text-[15px] text-gray-900 placeholder-gray-400 resize-none transition-all duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] leading-relaxed"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={analyzePrompt}
                disabled={!prompt.trim()}
                className="px-7 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer shadow-[0_1px_3px_rgba(79,70,229,0.3)]"
              >
                Analyze Prompt
              </button>
            </div>

            {error && (
              <div className="mt-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-center font-medium">
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Results Mode: wide two-column layout ---- */}
      {(streaming || result) && (
        <div className="mx-auto max-w-[1400px] px-8 py-8">
          {/* Top bar: Score + Title + Try Another */}
          <div className="flex items-center gap-8 mb-8 animate-fade-in-up">
            {hasScore ? (
              <div className="flex items-center gap-6 flex-shrink-0">
                <ScoreRing score={result!.score!} />
              </div>
            ) : (
              <StreamingProgress phase={phase} />
            )}

            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-indigo-600 mb-1">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-80">
                  <path d="M8 1L10.163 5.279L15 6.056L11.5 9.321L12.326 14L8 11.779L3.674 14L4.5 9.321L1 6.056L5.837 5.279L8 1Z" fill="currentColor"/>
                </svg>
                Prompt Workshop
              </div>
              <h1 className="text-2xl font-bold tracking-[-0.03em] text-gray-900">Analysis Results</h1>
              {done && hasScore && (
                <p className="text-sm text-gray-500 mt-1 animate-fade-in">
                  {rulesPassed === 5
                    ? "All 5 rules met -- excellent prompt!"
                    : `${rulesPassed} of 5 rules passed${rulesPartial > 0 ? `, ${rulesPartial} partial` : ""}`}
                </p>
              )}
              {streaming && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-3 h-3 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin-slow" />
                  {phase}
                </div>
              )}
            </div>

            {done && (
              <button
                onClick={reset}
                className="flex-shrink-0 px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.04)] animate-fade-in"
              >
                Try Another Prompt
              </button>
            )}
          </div>

          {/* Two-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* ---- Left Column: Rules + Recommendations (combined) ---- */}
            <div className="space-y-6">
              {hasRules && (
                <div className="animate-fade-in">
                  <SectionHeader
                    title="The 5 Rules"
                    subtitle="Assessment & recommendation for each rule"
                  />
                  <div className="space-y-2.5">
                    {result!.rules!.map((rule, i) => (
                      <RuleCard key={rule.rule} rule={rule} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ---- Right Column: Improved Prompt ---- */}
            <div className="space-y-6">
              {hasImproved && (
                <div className="animate-fade-in">
                  <SectionHeader
                    title="Improved Prompt"
                    subtitle="Green = added, strikethrough = removed"
                  />
                  <div className="relative">
                    <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-indigo-500" />
                    <div className="p-5 pl-6 rounded-xl bg-white border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <DiffView original={prompt} improved={result!.improvedPrompt!} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
