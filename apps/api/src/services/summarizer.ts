import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../env";

const SUMMARY_MAX_CHARS = 6000;
const ANALYSIS_MAX_CHARS = 20000; // Maior limite para análise profunda

const googleClient = env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(env.GOOGLE_API_KEY)
  : null;

export async function generateSummary(
  text: string,
  context?: { title?: string | null; url?: string | null },
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!googleClient) {
    return buildFallbackSummary(trimmed, context);
  }

  const snippet = trimmed.slice(0, SUMMARY_MAX_CHARS);
  const modelId = "models/gemini-2.5-flash-preview-09-2025";
  try {
    const model = googleClient.getGenerativeModel({ model: modelId });
    const prompt = buildPrompt(snippet, context);
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 256,
      },
    });

    let textPart = result.response.text().trim();
    if (!textPart) {
      return buildFallbackSummary(trimmed, context);
    }
    textPart = ensureUseCasesSection(textPart);
    return textPart;
  } catch (error) {
    console.warn("generateSummary fallback", error);
    return buildFallbackSummary(trimmed, context);
  }
}

function buildPrompt(
  snippet: string,
  context?: { title?: string | null; url?: string | null },
) {
  const header: string[] = [
    "Você é um assistente que resume conteúdos para o aplicativo Supermemory. Responda em português do Brasil.",
    "Responda SEMPRE no formato Markdown com as seguintes seções, mesmo que alguma fique vazia:",
    "## Resumo Executivo — 2 a 3 frases diretas sobre o tema principal.",
    "## Pontos-Chave — Liste de 6 a 10 bullets curtos com fatos relevantes, insights ou argumentos.",
    "## Casos de Uso — Gere de 3 a 6 bullets com aplicações práticas, cenários ou exemplos de uso observados OU claramente inferidos do conteúdo (sem inventar fatos).",
  ];

  if (context?.title) {
    header.push(`Título detectado: ${context.title}`);
  }
  if (context?.url) {
    header.push(`Fonte: ${context.url}`);
  }

  header.push(
    "Não inclua textos introdutórios como 'Segue o resumo'. Seja direto e objetivo.\n\nConteúdo a ser resumido:\n\n" +
      snippet,
  );

  return header.join("\n\n");
}

function buildFallbackSummary(
  text: string,
  context?: { title?: string | null; url?: string | null },
) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const executive = sentences.slice(0, 2);
  const remaining = sentences.slice(2);

  const points = remaining.slice(0, 10).map((sentence) => `- ${sentence}`);

  const useCases: string[] = [];
  if (remaining.length === 0) {
    useCases.push("- (sem casos de uso identificados)");
  } else {
    const actionCandidates = remaining
      .filter((sentence) =>
        /deve|faça|passo|recomenda|sugere|precisa|evite|comece|conclua|usar|aplique|utilize|serve para|pode ser usado/i.test(
          sentence,
        ),
      )
      .slice(0, 4);
    if (actionCandidates.length > 0) {
      for (const candidate of actionCandidates) {
        useCases.push(`- ${candidate}`);
      }
    } else {
      useCases.push("- (sem casos de uso identificados)");
    }
  }

  const parts: string[] = ["## Resumo Executivo"];
  if (executive.length > 0) {
    for (const sentence of executive) {
      parts.push(`- ${sentence}`);
    }
  } else {
    parts.push(`- ${text.slice(0, 200)}`);
  }

  parts.push("\n## Pontos-Chave");
  if (points.length > 0) {
    parts.push(...points);
  } else {
    parts.push("- (informações limitadas para destacar)");
  }

  parts.push("\n## Casos de Uso");
  parts.push(...useCases);

  if (context?.url) {
    parts.push("\n## Fonte");
    parts.push(`- ${context.url}`);
  }

  return ensureUseCasesSection(parts.join("\n"));
}

/**
 * Gera análise profunda do conteúdo usando Gemini 2.5 Flash
 * Se tiver URL, usa urlContext para o Gemini ler diretamente
 * Caso contrário, analisa o texto extraído
 */
export async function generateDeepAnalysis(
  text: string,
  context?: {
    title?: string | null;
    url?: string | null;
    contentType?: string | null;
  },
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!googleClient) {
    console.warn("Google AI not configured, cannot generate deep analysis");
    return null;
  }

  try {
    const model = googleClient.getGenerativeModel({
      model: "models/gemini-2.5-flash-preview-09-2025",
    });

    // Se tiver URL, deixa o Gemini ler diretamente (mais limpo)
    if (context?.url) {
      const prompt = buildUrlAnalysisPrompt(context);

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.3,
        },
        tools: [{ urlContext: {} }],
      });

      const analysis = result.response.text().trim();

      if (!analysis || analysis.length < 50) {
        console.warn("URL-based analysis returned empty, trying text fallback");
        // Fallback: usar o texto extraído
        return generateTextBasedAnalysis(text, context, model);
      }

      return ensureUseCasesSection(analysis);
    }

    // Sem URL: usa o texto extraído
    return generateTextBasedAnalysis(text, context, model);
  } catch (error) {
    console.warn("generateDeepAnalysis error", error);
    return buildFallbackSummary(trimmed, context);
  }
}

/**
 * Análise usando o texto extraído (fallback ou quando não tem URL)
 */
async function generateTextBasedAnalysis(
  text: string,
  context?: {
    title?: string | null;
    url?: string | null;
    contentType?: string | null;
  },
  model?: any,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (!googleClient) return null;

  const snippet = trimmed.slice(0, ANALYSIS_MAX_CHARS);
  const prompt = buildDeepAnalysisPrompt(snippet, context);

  const geminiModel =
    model ||
    googleClient.getGenerativeModel({
      model: "models/gemini-2.5-flash-preview-09-2025",
    });

  const result = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.3,
    },
  });

  const analysis = result.response.text().trim();

  if (!analysis || analysis.length < 50) {
    return buildFallbackSummary(trimmed, context);
  }

  return ensureUseCasesSection(analysis);
}

/**
 * Prompt simplificado para análise via URL (Gemini lê diretamente)
 */
function buildUrlAnalysisPrompt(context: {
  title?: string | null;
  url?: string | null;
  contentType?: string | null;
}) {
  const isGitHub = context.url?.includes("github.com");

  const header: string[] = [
    "Você é um assistente analítico do Supermemory. Responda em português do Brasil.",
    `Analise o conteúdo desta URL: ${context.url}`,
    "",
    "Responda SEMPRE no formato Markdown com as seguintes seções:",
    "",
    "## Resumo Executivo",
    "2-3 frases diretas sobre o tema principal, contexto e relevância.",
    "",
    "## Pontos-Chave",
    "Liste 6-10 bullets com conceitos, fatos, dados ou insights importantes.",
    "",
  ];

  if (isGitHub) {
    header.push(
      "## Tecnologias e Ferramentas",
      "Liste linguagens, frameworks, bibliotecas ou arquiteturas mencionadas.",
      "",
    );
  }

  header.push(
    "## Casos de Uso",
    "Liste aplicações práticas, cenários ou exemplos de uso.",
    "",
    "**IMPORTANTE:** Seja objetivo e direto. Não inicie com 'Aqui está' ou 'Segue o resumo'.",
  );

  if (context.title) {
    header.push("", `**Título:** ${context.title}`);
  }

  return header.join("\n");
}

function buildDeepAnalysisPrompt(
  snippet: string,
  context?: {
    title?: string | null;
    url?: string | null;
    contentType?: string | null;
  },
) {
  const isGitHub = context?.url?.includes("github.com");
  const isPDF = context?.contentType?.includes("pdf");
  const isWebPage = context?.contentType?.includes("html") || context?.url;

  const header: string[] = [
    "Você é um assistente analítico do Supermemory que cria resumos estruturados e insights profundos. Responda em português do Brasil.",
    "Analise o conteúdo abaixo e responda SEMPRE no formato Markdown com as seguintes seções:",
    "",
    "## Resumo Executivo",
    "2-3 frases diretas sobre o tema principal, contexto e relevância do conteúdo.",
    "",
    "## Pontos-Chave",
    "Liste 6-10 bullets com:",
    "- Conceitos, ideias ou argumentos centrais",
    "- Fatos, dados ou estatísticas importantes",
    "- Insights ou conclusões relevantes",
    "",
  ];

  // Ajustar seções baseado no tipo de conteúdo
  if (isGitHub) {
    header.push(
      "## Tecnologias e Ferramentas",
      "Se aplicável, liste:",
      "- Linguagens de programação ou frameworks mencionados",
      "- Bibliotecas, APIs ou dependências relevantes",
      "- Arquitetura ou padrões de design",
      "",
    );
  }

  header.push(
    "## Casos de Uso",
    "Liste bullets com aplicações práticas, cenários ou exemplos de uso",
    "Se não houver casos claros, escreva: `- (sem casos de uso identificados)`",
    "",
  );

  if (isPDF || isWebPage) {
    header.push(
      "## Contexto Adicional",
      "Se relevante, mencione:",
      "- Autores, organizações ou fontes citadas",
      "- Data de publicação ou atualização (se disponível)",
      "- Público-alvo ou caso de uso",
      "",
    );
  }

  if (context?.title) {
    header.push(`**Título:** ${context.title}`);
  }
  if (context?.url) {
    header.push(`**Fonte:** ${context.url}`);
  }

  header.push(
    "",
    "**IMPORTANTE:** Seja objetivo, analítico e direto. Não inicie com frases como 'Aqui está' ou 'Segue o resumo'.",
    "",
    "---",
    "",
    "Conteúdo a ser analisado:",
    "",
    snippet,
  );

  return header.join("\n");
}

export async function summarizeYoutubeVideo(
  url: string,
): Promise<string | null> {
  if (!googleClient) {
    console.warn("Google AI not configured, cannot analyze YouTube video");
    return null;
  }

  try {
    const modelId = "models/gemini-2.5-flash-preview-09-2025";
    const model = googleClient.getGenerativeModel({ model: modelId });

    const prompt = [
      "Analise este vídeo do YouTube e crie um resumo estruturado em português do Brasil.",
      "",
      "## Resumo Executivo",
      "Escreva 2-3 frases sobre o tema principal e contexto geral do vídeo.",
      "",
      "## Pontos Principais",
      "Liste 6-10 bullet points com:",
      "- Tópicos importantes discutidos",
      "- Insights e conclusões chave",
      "- Dados, estatísticas ou fatos relevantes",
      "",
      "## Casos de Uso",
      "Se aplicável, liste aplicações práticas, cenários ou exemplos de uso mencionados no vídeo.",
      "",
      "## Contexto Visual",
      "Se relevante, descreva:",
      "- Elementos visuais importantes (gráficos, demos, slides)",
      "- Apresentadores ou pessoas que aparecem",
      "",
      "Seja objetivo e detalhado. Não inicie com frases como 'Aqui está' ou 'Segue o resumo'.",
    ].join("\n");

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                mimeType: "video/*",
                fileUri: url,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.4,
      },
    });

    const summary = result.response.text().trim();

    if (!summary || summary.length < 50) {
      console.warn(
        "YouTube video analysis returned empty or very short result",
      );
      return null;
    }

    return ensureUseCasesSection(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("summarizeYoutubeVideo error:", message);

    // Se falhar com Gemini 2.0, não tentar fallback pois não funciona bem
    return null;
  }
}

/**
 * Garantir que a seção "Casos de Uso" apareça no Markdown de saída.
 * Se o modelo não incluir, adicionamos um bloco padrão vazio.
 */
function ensureUseCasesSection(markdown: string): string {
  const hasUseCases = /(^|\n)##\s*Casos\s*de\s*Uso(\s|\n)/i.test(markdown);
  if (hasUseCases) return markdown;
  const appendix = "\n\n## Casos de Uso\n- (sem casos de uso identificados)\n";
  return markdown.trimEnd() + appendix;
}
