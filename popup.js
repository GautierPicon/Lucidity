const OLLAMA_URL = "http://localhost:11434/api/generate";
const DEFAULT_MODEL = "lfm2.5-thinking:1.2b";

const chatEl = document.getElementById("chat");
const composerEl = document.getElementById("composer");
const questionInput = document.getElementById("question-input");
const sendButton = document.getElementById("send-button");
const statusDot = document.getElementById("status-dot");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const modelInput = document.getElementById("model-input");
const useContextToggle = document.getElementById("use-context-toggle");
const contextBanner = document.getElementById("context-banner");
const contextBannerText = document.getElementById("context-banner-text");

let pageContext = null;
let isGenerating = false;

(async function init() {
  await loadSettings();
  showEmptyState();
  await fetchPageContext();
})();

async function loadSettings() {
  const stored = await chrome.storage.local.get(["model", "useContext"]);
  modelInput.value = stored.model || DEFAULT_MODEL;
  useContextToggle.checked = stored.useContext !== false; // true by default
}

modelInput.addEventListener("change", () => {
  chrome.storage.local.set({ model: modelInput.value.trim() || DEFAULT_MODEL });
});

useContextToggle.addEventListener("change", () => {
  chrome.storage.local.set({ useContext: useContextToggle.checked });
  updateContextBanner();
});

settingsToggle.addEventListener("click", () => {
  settingsPanel.hidden = !settingsPanel.hidden;
});

async function fetchPageContext() {
  setStatus("loading");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "REQUEST_PAGE_CONTEXT"
    });
    if (response?.ok) {
      pageContext = response.context;
      setStatus("ok");
    } else {
      pageContext = null;
      setStatus("error");
    }
  } catch (err) {
    pageContext = null;
    setStatus("error");
  }
  updateContextBanner();
}

function updateContextBanner() {
  if (!useContextToggle.checked || !pageContext) {
    contextBanner.hidden = true;
    return;
  }

  contextBanner.hidden = false;
  if (pageContext.selection) {
    const preview = pageContext.selection.slice(0, 60);
    contextBannerText.textContent = `Selection: "${preview}${pageContext.selection.length > 60 ? "…" : ""}"`;
  } else if (pageContext.title) {
    contextBannerText.textContent = `Page: ${pageContext.title}`;
  } else {
    contextBannerText.textContent = "Page context loaded";
  }
}

function buildPrompt(question) {
  if (!useContextToggle.checked || !pageContext) {
    return question;
  }

  const parts = [];
  parts.push(
    "You are an assistant answering a question using, when relevant, the web page context provided below. If the context isn't useful for answering, ignore it and answer normally."
  );
  parts.push(`\n--- PAGE CONTEXT ---`);
  parts.push(`Title: ${pageContext.title}`);
  parts.push(`URL: ${pageContext.url}`);

  if (pageContext.selection) {
    parts.push(`\nText selected by the user:\n${pageContext.selection}`);
  } else if (pageContext.content) {
    parts.push(
      `\nMain page content${pageContext.truncated ? " (truncated)" : ""}:\n${pageContext.content}`
    );
  }

  parts.push(`--- END OF CONTEXT ---\n`);
  parts.push(`User question: ${question}`);

  return parts.join("\n");
}

function setStatus(state) {
  if (state === "ok") statusDot.textContent = "(status: ok)";
  if (state === "error") statusDot.textContent = "(status: error)";
  if (state === "loading") statusDot.textContent = "(status: loading…)";
}

function showEmptyState() {
  chatEl.innerHTML = `<div class="chat__empty">Ask a question.<br/>The active page's context will be used if available.</div>`;
}

function clearEmptyState() {
  const empty = chatEl.querySelector(".chat__empty");
  if (empty) empty.remove();
}

function addBubble(text, kind) {
  clearEmptyState();
  const bubble = document.createElement("p");
  bubble.dataset.kind = kind;
  bubble.textContent = text;
  chatEl.appendChild(bubble);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}

composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSend();
});

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

async function handleSend() {
  const question = questionInput.value.trim();
  if (!question || isGenerating) return;

  addBubble(question, "user");
  questionInput.value = "";
  setGenerating(true);

  const loadingBubble = addBubble("…", "loading");

  const model = modelInput.value.trim() || DEFAULT_MODEL;
  const prompt = buildPrompt(question);

  try {
    await streamOllamaResponse(model, prompt, loadingBubble);
  } catch (err) {
    loadingBubble.dataset.kind = "error";
    loadingBubble.textContent = describeError(err);
  } finally {
    setGenerating(false);
  }
}

function setGenerating(value) {
  isGenerating = value;
  sendButton.disabled = value;
}

function describeError(err) {
  const message = String(err?.message || err);
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Could not reach Ollama on localhost:11434.\nMake sure Ollama is running (command: ollama serve) and that OLLAMA_ORIGINS allows this extension.";
  }
  return `Error: ${message}`;
}

async function streamOllamaResponse(model, prompt, bubbleEl) {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: true
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama responded ${res.status}. ${body || "Make sure the model '" + model + "' is installed (ollama pull " + model + ")."}`
    );
  }

  bubbleEl.dataset.kind = "assistant";
  bubbleEl.textContent = "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      const json = JSON.parse(line);
      if (json.response) {
        fullText += json.response;
        bubbleEl.textContent = fullText;
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      if (json.done) {
        return;
      }
    }
  }
}
