const editor = document.querySelector("#workflowEditor");
const connectorsEl = document.querySelector("#connectors");
const logsEl = document.querySelector("#logs");
const artifactEl = document.querySelector("#artifactOutput");
const runStatusEl = document.querySelector("#runStatus");
const runBtn = document.querySelector("#runBtn");
const refreshBtn = document.querySelector("#refreshBtn");
const loadExampleBtn = document.querySelector("#loadExampleBtn");

let exampleWorkflow = null;

async function loadConnectors() {
  const response = await fetch("/api/connectors");
  const data = await response.json();
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
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow })
    });
    const result = await response.json();

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
