const editor = document.querySelector("#workflowEditor");
const connectorsEl = document.querySelector("#connectors");
const logsEl = document.querySelector("#logs");
const artifactEl = document.querySelector("#artifactOutput");
const runStatusEl = document.querySelector("#runStatus");
const runBtn = document.querySelector("#runBtn");
const refreshBtn = document.querySelector("#refreshBtn");
const loadExampleBtn = document.querySelector("#loadExampleBtn");

let exampleWorkflow = null;
let apiAvailable = true;

const fallbackConnectors = [
  {
    id: "text.input",
    name: "Manual Text Input",
    category: "Input",
    description: "Static-site fallback connector. Use this when the server API is unavailable."
  },
  {
    id: "text.summarize",
    name: "Summarize Text",
    category: "AI/Text",
    description: "Creates a concise extractive summary in the browser."
  },
  {
    id: "text.keywords",
    name: "Extract Keywords",
    category: "AI/Text",
    description: "Extracts frequent keywords in the browser."
  },
  {
    id: "file.markdown",
    name: "Export Markdown",
    category: "Output",
    description: "Builds a Markdown artifact from upstream outputs."
  }
];

const fallbackWorkflow = {
  name: "静态网站 Demo",
  steps: [
    {
      id: "input",
      connector: "text.input",
      input: {
        title: "开源项目串联示例",
        text: "开源项目串联的关键不是复制源码，而是把每个项目封装成统一连接器。连接器声明输入、输出和运行方式，工作流负责把上一步输出传递给下一步。第一版可以先串联文本、网页、文档、OCR 和导出工具，等流程稳定后再接 Docker、队列和远程 GPU。"
      }
    },
    {
      id: "summary",
      connector: "text.summarize",
      input: {
        text: "{{ input.output.text }}",
        sentences: 2
      }
    },
    {
      id: "keywords",
      connector: "text.keywords",
      input: {
        text: "{{ input.output.text }}",
        limit: 8
      }
    },
    {
      id: "export",
      connector: "file.markdown",
      input: {
        title: "{{ input.output.title }}",
        summary: "{{ summary.output.summary }}",
        keywords: "{{ keywords.output.keywords }}"
      }
    }
  ]
};

async function loadConnectors() {
  let data;
  try {
    const response = await fetch("api/connectors");
    if (!response.ok) throw new Error(`API unavailable: ${response.status}`);
    data = await response.json();
  } catch {
    apiAvailable = false;
    data = { connectors: fallbackConnectors, exampleWorkflow: fallbackWorkflow };
    setStatus("静态演示模式", "");
  }

  exampleWorkflow = data.exampleWorkflow;
  renderConnectors(data.connectors);

  if (!editor.value.trim()) {
    editor.value = JSON.stringify(exampleWorkflow, null, 2);
  }
}

function renderConnectors(connectors) {
  connectorsEl.innerHTML = connectors
    .map(
      (connector) => `
        <article class="connector">
          <strong>${escapeHtml(connector.name)}</strong>
          <p>${escapeHtml(connector.description)}</p>
          <span class="tag">${escapeHtml(connector.category)}</span>
        </article>
      `
    )
    .join("");
}

async function runWorkflow() {
  let workflow;
  try {
    workflow = JSON.parse(editor.value);
  } catch (error) {
    setStatus("JSON 格式错误", "error");
    logsEl.innerHTML = `<div class="log-entry error"><div class="log-message">${escapeHtml(error.message)}</div></div>`;
    return;
  }

  setStatus("运行中", "running");
  runBtn.disabled = true;
  logsEl.textContent = "正在执行工作流...";
  logsEl.classList.add("empty");
  artifactEl.textContent = "暂无输出";

  try {
    const result = apiAvailable ? await runWorkflowOnServer(workflow) : await runWorkflowInBrowser(workflow);

    renderLogs(result.logs || []);
    renderArtifact(result);
    setStatus(result.ok ? "运行成功" : "运行失败", result.ok ? "success" : "error");
  } catch (error) {
    setStatus("运行失败", "error");
    logsEl.innerHTML = `<div class="log-entry error"><div class="log-message">${escapeHtml(error.message)}</div></div>`;
  } finally {
    runBtn.disabled = false;
  }
}

async function runWorkflowOnServer(workflow) {
  const response = await fetch("api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflow })
  });
  return await response.json();
}

async function runWorkflowInBrowser(workflow) {
  const logs = [];
  const outputs = {};

  try {
    for (const step of workflow.steps || []) {
      const input = resolveTemplates(step.input || {}, outputs);
      logs.push({ step: step.id, connector: step.connector, level: "info", message: "Started", input });
      const output = runClientConnector(step.connector, input);
      outputs[step.id] = { input, output };
      logs.push({ step: step.id, connector: step.connector, level: "success", message: "Completed", output });
    }

    return { ok: true, logs, outputs };
  } catch (error) {
    logs.push({ level: "error", message: error.message });
    return { ok: false, error: error.message, logs, outputs };
  }
}

function runClientConnector(connector, input) {
  if (connector === "text.input") return { title: input.title || "Untitled", text: input.text || "" };
  if (connector === "text.summarize") return summarizeText(input);
  if (connector === "text.keywords") return extractKeywords(input);
  if (connector === "file.markdown") return exportMarkdown(input);
  throw new Error(`Static demo cannot run connector: ${connector}`);
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

function summarizeText(input) {
  const text = String(input.text || "").trim();
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[。！？.!?])\s+/).filter(Boolean);
  const limit = Number(input.sentences || 3);
  return { summary: sentences.slice(0, Math.max(1, limit)).join(" ") || text.slice(0, 600) };
}

function extractKeywords(input) {
  const stopWords = new Set(["the", "and", "for", "that", "with", "this", "from", "are", "was", "were", "的", "了", "是", "和", "把", "每个"]);
  const counts = new Map();
  for (const word of String(input.text || "").toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || []) {
    if (stopWords.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(input.limit || 10))
    .map(([word, count]) => ({ word, count }));
  return { keywords };
}

function exportMarkdown(input) {
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];
  const keywordText = keywords.map((item) => `- ${item.word} (${item.count})`).join("\n") || "- None";
  return {
    filename: "workflow-result.md",
    content: `# ${input.title || "Workflow Result"}\n\n## Summary\n\n${input.summary || "No summary generated."}\n\n## Keywords\n\n${keywordText}\n`
  };
}

function renderLogs(logs) {
  logsEl.classList.remove("empty");
  logsEl.innerHTML = logs
    .map((log) => {
      const detail = log.output || log.input || null;
      return `
        <article class="log-entry ${escapeHtml(log.level || "info")}">
          <div class="log-meta">
            <span>${escapeHtml(log.step || "system")}</span>
            <span>${escapeHtml(log.connector || log.level || "")}</span>
          </div>
          <div class="log-message">${escapeHtml(log.message || "")}</div>
          ${detail ? `<pre>${escapeHtml(JSON.stringify(detail, null, 2))}</pre>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderArtifact(result) {
  const artifact = result.outputs?.export?.output;
  if (!artifact?.content) {
    artifactEl.textContent = result.error || "没有生成 Markdown。";
    return;
  }

  artifactEl.textContent = artifact.content;
}

function setStatus(text, state) {
  runStatusEl.textContent = text;
  runStatusEl.className = `badge ${state || ""}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

refreshBtn.addEventListener("click", loadConnectors);
runBtn.addEventListener("click", runWorkflow);
loadExampleBtn.addEventListener("click", () => {
  editor.value = JSON.stringify(exampleWorkflow, null, 2);
});

loadConnectors().catch((error) => {
  setStatus("初始化失败", "error");
  logsEl.textContent = error.message;
});
