const connectors = [
  {
    id: "web.fetch",
    name: "Fetch Web Page",
    category: "Input",
    description: "Fetches text from a public URL. This is the wrapper pattern for crawler-style open-source projects.",
    inputSchema: { url: "string" },
    outputSchema: { title: "string", text: "string", url: "string" }
  },
  {
    id: "text.summarize",
    name: "Summarize Text",
    category: "AI/Text",
    description: "Creates a concise extractive summary. Replace this with a local LLM or API connector later.",
    inputSchema: { text: "string", sentences: "number" },
    outputSchema: { summary: "string" }
  },
  {
    id: "text.keywords",
    name: "Extract Keywords",
    category: "AI/Text",
    description: "Extracts frequent keywords from text.",
    inputSchema: { text: "string", limit: "number" },
    outputSchema: { keywords: "array" }
  },
  {
    id: "file.markdown",
    name: "Export Markdown",
    category: "Output",
    description: "Builds a Markdown artifact from upstream outputs.",
    inputSchema: { title: "string", summary: "string", keywords: "array" },
    outputSchema: { filename: "string", content: "string" }
  }
];

const stopWords = new Set([
  "the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "you", "your", "have",
  "has", "had", "not", "but", "all", "can", "will", "its", "they", "their", "our", "out", "about",
  "into", "more", "when", "what", "which", "who", "how", "why", "在", "是", "和", "了", "的", "与",
  "就", "都", "而", "及", "或", "一个", "这个", "我们", "你们"
]);

export function getConnectors() {
  return connectors;
}

export function getExampleWorkflow() {
  return {
    name: "网页内容分析 Demo",
    steps: [
      {
        id: "fetch",
        connector: "web.fetch",
        input: {
          url: "https://example.com"
        }
      },
      {
        id: "summary",
        connector: "text.summarize",
        input: {
          text: "{{ fetch.output.text }}",
          sentences: 2
        }
      },
      {
        id: "keywords",
        connector: "text.keywords",
        input: {
          text: "{{ fetch.output.text }}",
          limit: 8
        }
      },
      {
        id: "export",
        connector: "file.markdown",
        input: {
          title: "{{ fetch.output.title }}",
          summary: "{{ summary.output.summary }}",
          keywords: "{{ keywords.output.keywords }}"
        }
      }
    ]
  };
}

export async function runWorkflow(workflow) {
  const startedAt = new Date().toISOString();
  const logs = [];
  const context = {};

  try {
    validateWorkflow(workflow);

    for (const step of workflow.steps) {
      const connector = connectors.find((item) => item.id === step.connector);
      if (!connector) throw new Error(`Unknown connector: ${step.connector}`);

      const input = resolveTemplates(step.input || {}, context);
      logs.push({ step: step.id, connector: connector.id, level: "info", message: "Started", input });

      const output = await runConnector(connector.id, input);
      context[step.id] = { input, output };

      logs.push({ step: step.id, connector: connector.id, level: "success", message: "Completed", output });
    }

    return {
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      workflowName: workflow.name || "Untitled workflow",
      logs,
      outputs: context
    };
  } catch (error) {
    logs.push({ level: "error", message: error.message });
    return {
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error.message,
      logs,
      outputs: context
    };
  }
}

function validateWorkflow(workflow) {
  if (!workflow || typeof workflow !== "object") throw new Error("Workflow must be an object.");
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new Error("Workflow must contain at least one step.");
  }

  const ids = new Set();
  for (const step of workflow.steps) {
    if (!step.id || !/^[a-zA-Z][\w-]*$/.test(step.id)) {
      throw new Error(`Invalid step id: ${step.id}`);
    }
    if (ids.has(step.id)) throw new Error(`Duplicate step id: ${step.id}`);
    ids.add(step.id);
  }
}

function resolveTemplates(value, context) {
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, context)]));
  }
  if (typeof value !== "string") return value;

  const exact = value.match(/^{{\s*([^}]+?)\s*}}$/);
  if (exact) return getPath(context, exact[1].trim());

  return value.replace(/{{\s*([^}]+?)\s*}}/g, (_, path) => {
    const resolved = getPath(context, path.trim());
    return Array.isArray(resolved) || typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved ?? "");
  });
}

function getPath(source, path) {
  return path.split(".").reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, source);
}

async function runConnector(id, input) {
  switch (id) {
    case "web.fetch":
      return await fetchWebPage(input);
    case "text.summarize":
      return summarizeText(input);
    case "text.keywords":
      return extractKeywords(input);
    case "file.markdown":
      return exportMarkdown(input);
    default:
      throw new Error(`No runner implemented for connector: ${id}`);
  }
}

async function fetchWebPage(input) {
  if (!input.url || typeof input.url !== "string") throw new Error("web.fetch requires input.url");

  const response = await fetch(input.url, {
    headers: {
      "user-agent": "OpenSourceOrchestrator/0.1"
    }
  });

  if (!response.ok) throw new Error(`Failed to fetch ${input.url}: HTTP ${response.status}`);

  const html = await response.text();
  const title = decodeHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || input.url).trim());
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  return { title, text: text.slice(0, 12000), url: input.url };
}

function summarizeText(input) {
  const text = String(input.text || "").trim();
  if (!text) throw new Error("text.summarize requires input.text");

  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s+/)
    .filter(Boolean);

  const limit = Number(input.sentences || 3);
  const summary = sentences.slice(0, Math.max(1, limit)).join(" ");
  return { summary: summary || text.slice(0, 600) };
}

function extractKeywords(input) {
  const text = String(input.text || "").toLowerCase();
  if (!text) throw new Error("text.keywords requires input.text");

  const counts = new Map();
  for (const word of text.match(/[\p{L}\p{N}_-]{2,}/gu) || []) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const limit = Number(input.limit || 10);
  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));

  return { keywords };
}

function exportMarkdown(input) {
  const title = String(input.title || "Workflow Result");
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];
  const keywordText = keywords.map((item) => `- ${item.word} (${item.count})`).join("\n") || "- None";
  const content = `# ${title}

## Summary

${input.summary || "No summary generated."}

## Keywords

${keywordText}
`;

  return {
    filename: `${slugify(title)}.md`,
    content
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "workflow-result";
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
