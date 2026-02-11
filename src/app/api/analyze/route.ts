import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a prompt engineering expert. Your task is to analyze a given prompt against these 5 core prompting rules and provide detailed feedback.

## The 5 Rules of Great Prompting

**Rule 1 — Give Context**: Tell the AI who you are, who the output is for, and why it matters. Without context, the AI guesses.

**Rule 2 — Be Specific**: Vague in, vague out. Define the format, length, tone, and audience explicitly.

**Rule 3 — Show an Example**: If you know what good output looks like, include an example. This grounds the AI's response.

**Rule 4 — Give It a Role**: Assigning a role like "You're a [expert]" changes everything. It frames the AI's perspective and expertise level.

**Rule 5 — Iterate, Don't Settle**: A first prompt is just a draft. This rule is about mindset — but you can check if the prompt reads like a refined, polished version or a rough first attempt.

## Scoring

Evaluate the prompt against EACH of the 5 rules individually (pass/fail/partial) and give an overall score from 0-10:
- Each rule fully met = +2 points (max 10)
- Each rule partially met = +1 point
- Each rule not met = 0 points

## Your Response

Analyze the prompt and return ONLY valid JSON matching this exact schema, with no markdown formatting, no code fences, and no additional text:
{
  "score": <number 0-10>,
  "rules": [
    { "rule": "Give Context", "status": "pass" | "partial" | "fail", "feedback": "<what's present or missing regarding this rule>", "recommendation": "<specific actionable fix, e.g. 'Add: I am a marketing manager writing for our B2B SaaS blog audience'>" },
    { "rule": "Be Specific", "status": "pass" | "partial" | "fail", "feedback": "<what's present or missing>", "recommendation": "<specific actionable fix>" },
    { "rule": "Show an Example", "status": "pass" | "partial" | "fail", "feedback": "<what's present or missing>", "recommendation": "<specific actionable fix>" },
    { "rule": "Give It a Role", "status": "pass" | "partial" | "fail", "feedback": "<what's present or missing>", "recommendation": "<specific actionable fix>" },
    { "rule": "Iterate, Don't Settle", "status": "pass" | "partial" | "fail", "feedback": "<what's present or missing>", "recommendation": "<specific actionable fix>" }
  ],
  "improvedPrompt": "<the fully rewritten improved prompt that follows ALL 5 rules>"
}`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "A valid 'prompt' string is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const stream = client.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this prompt:\n\n${prompt}`,
        },
      ],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(encoder.encode(chunk));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
