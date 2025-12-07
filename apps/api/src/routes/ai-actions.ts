import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { requireAuth } from "../middleware/auth";
import { ErrorHandler } from "../services/error-handler";

const app = new Hono();

// AI Action types - matching AFFiNE's structure
export const AI_ACTIONS = {
  // Review Text
  fixSpelling: {
    name: "Fix spelling",
    prompt:
      "Fix all spelling errors in the following text. Only fix spelling, do not change grammar or wording. Return only the corrected text without any explanation.",
  },
  fixGrammar: {
    name: "Fix grammar",
    prompt:
      "Fix all grammar errors in the following text. Only fix grammar, preserve the original meaning and style. Return only the corrected text without any explanation.",
  },
  explain: {
    name: "Explain selection",
    prompt: "Explain the following text in simple terms. Be concise and clear.",
  },

  // Edit Text
  translate: {
    name: "Translate to",
    prompt:
      "Translate the following text to {{lang}}. Return only the translation without any explanation.",
  },
  changeTone: {
    name: "Change tone to",
    prompt:
      "Rewrite the following text in a {{tone}} tone. Preserve the meaning but change the style. Return only the rewritten text.",
  },
  improveWriting: {
    name: "Improve writing",
    prompt:
      "Improve the following text by making it clearer, more concise, and better written. Preserve the original meaning. Return only the improved text.",
  },
  makeLonger: {
    name: "Make it longer",
    prompt:
      "Expand the following text by adding more details, examples, and elaboration. Make it approximately 2-3 times longer while maintaining the original meaning and style. Return only the expanded text.",
  },
  makeShorter: {
    name: "Make it shorter",
    prompt:
      "Condense the following text to be more concise while preserving the key information. Make it approximately half the length. Return only the shortened text.",
  },
  continueWriting: {
    name: "Continue writing",
    prompt:
      "Continue writing the following text in the same style and tone. Add 2-3 more paragraphs that naturally follow from the existing content. Return only the continuation (not the original text).",
  },

  // Generate from Text
  summarize: {
    name: "Summarize",
    prompt:
      "Summarize the following text in a few sentences. Be concise and capture the main points.",
  },
  generateHeadings: {
    name: "Generate headings",
    prompt:
      "Generate appropriate headings and subheadings for the following text. Return a structured outline with headings.",
  },
  generateOutline: {
    name: "Generate outline",
    prompt:
      "Create a detailed outline for the following text. Include main topics and subtopics.",
  },
  brainstormMindmap: {
    name: "Brainstorm ideas with mind map",
    prompt: `Analyze and expand on the following content. Output as an indented mind map format.
Format:
- {topic}
  - {Level 1}
    - {Level 2}
      - {Level 3}
Maximum 5 levels of indentation. Each node should be concise.`,
  },
  findActions: {
    name: "Find actions",
    prompt:
      "Find and list all action items, tasks, or to-dos mentioned in the following text. Format as a bulleted list.",
  },

  // Draft from Text
  writeArticle: {
    name: "Write an article about this",
    prompt:
      "Write a well-structured article based on the following topic/content. Include an introduction, body paragraphs, and conclusion.",
  },
  writeTweet: {
    name: "Write a tweet about this",
    prompt:
      "Write a engaging tweet (max 280 characters) based on the following content. Make it catchy and shareable.",
  },
  writePoem: {
    name: "Write a poem about this",
    prompt:
      "Write a creative poem inspired by the following content. Use appropriate poetic devices.",
  },
  writeBlogPost: {
    name: "Write a blog post about this",
    prompt:
      "Write an engaging blog post based on the following topic. Include a catchy title, introduction, main content with subheadings, and conclusion.",
  },
  brainstormIdeas: {
    name: "Brainstorm ideas about this",
    prompt:
      "Generate creative ideas and suggestions related to the following topic. List at least 5-10 ideas with brief explanations.",
  },

  // Code actions
  explainCode: {
    name: "Explain this code",
    prompt:
      "Explain what the following code does in simple terms. Break down the logic and purpose of each part.",
  },
  checkCodeErrors: {
    name: "Check code error",
    prompt:
      "Analyze the following code for potential errors, bugs, or issues. List any problems found and suggest fixes.",
  },

  // Custom/Chat
  chat: {
    name: "Chat",
    prompt: "{{input}}",
  },
} as const;

export type AIActionType = keyof typeof AI_ACTIONS;

// Supported languages for translation
export const TRANSLATE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Russian",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Arabic",
  "Hindi",
  "Dutch",
  "Swedish",
  "Polish",
  "Turkish",
  "Vietnamese",
  "Thai",
  "Indonesian",
] as const;

// Supported tones for text transformation
export const TEXT_TONES = [
  "Professional",
  "Casual",
  "Direct",
  "Confident",
  "Friendly",
  "Formal",
  "Humorous",
  "Empathetic",
  "Authoritative",
  "Inspirational",
] as const;

// Request schema
const aiActionRequestSchema = z.object({
  action: z.string(),
  content: z.string().min(1).max(100000),
  options: z
    .object({
      lang: z.string().optional(),
      tone: z.string().optional(),
      customPrompt: z.string().optional(),
    })
    .optional(),
});

// Build prompt based on action and options
function buildPrompt(
  action: AIActionType,
  content: string,
  options?: { lang?: string; tone?: string; customPrompt?: string },
): string {
  const actionConfig = AI_ACTIONS[action];
  if (!actionConfig) {
    throw new Error(`Unknown action: ${action}`);
  }

  let prompt = actionConfig.prompt;

  // Replace placeholders
  if (options?.lang) {
    prompt = prompt.replace("{{lang}}", options.lang);
  }
  if (options?.tone) {
    prompt = prompt.replace("{{tone}}", options.tone);
  }
  if (options?.customPrompt) {
    prompt = prompt.replace("{{input}}", options.customPrompt);
  }

  return `${prompt}\n\nText:\n${content}`;
}

// Stream AI response
app.post("/stream", requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = aiActionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", details: parsed.error.issues },
        400,
      );
    }

    const { action, content, options } = parsed.data;
    const actionType = action as AIActionType;

    if (!AI_ACTIONS[actionType]) {
      return c.json({ error: `Unknown action: ${action}` }, 400);
    }

    const prompt = buildPrompt(actionType, content, options);

    const anthropic = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    return streamSSE(c, async (stream) => {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          stream: true,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            await stream.writeSSE({
              data: JSON.stringify({
                type: "text",
                content: event.delta.text,
              }),
            });
          }
        }

        await stream.writeSSE({
          data: JSON.stringify({ type: "done" }),
        });
      } catch (error) {
        console.error("AI Action stream error:", error);
        await stream.writeSSE({
          data: JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        });
      }
    });
  } catch (error) {
    console.error("AI Action error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Non-streaming endpoint for simple actions
app.post("/execute", requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = aiActionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", details: parsed.error.issues },
        400,
      );
    }

    const { action, content, options } = parsed.data;
    const actionType = action as AIActionType;

    if (!AI_ACTIONS[actionType]) {
      return c.json({ error: `Unknown action: ${action}` }, 400);
    }

    const prompt = buildPrompt(actionType, content, options);

    const anthropic = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === "text");
    const result = textContent?.type === "text" ? textContent.text : "";

    return c.json({
      success: true,
      result,
      action: actionType,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error("AI Action error:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Get available actions
app.get("/actions", async (c) => {
  const actions = Object.entries(AI_ACTIONS).map(([key, value]) => ({
    id: key,
    name: value.name,
  }));

  return c.json({
    actions,
    languages: TRANSLATE_LANGUAGES,
    tones: TEXT_TONES,
  });
});

export default app;
