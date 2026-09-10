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
const summarizeButton = document.getElementById("summarize-button");
const explainButton = document.getElementById("explain-button");

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
  updatePresetButtons();
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
  updatePresetButtons();
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

function formatPageContext() {
  const parts = [];
  parts.push(`--- PAGE CONTEXT ---`);
  parts.push(`Title: ${pageContext.title}`);
  parts.push(`URL: ${pageContext.url}`);

  if (pageContext.selection) {
    parts.push(`\nText selected by the user:\n${pageContext.selection}`);
  } else if (pageContext.content) {
    parts.push(
      `\nMain page content${pageContext.truncated ? " (truncated)" : ""}:\n${pageContext.content}`
    );
  }

  parts.push(`--- END OF CONTEXT ---`);
  return parts.join("\n");
}

function hasUsablePageContext() {
  return Boolean(pageContext && (pageContext.selection || pageContext.content));
}

function updatePresetButtons() {
  const enabled = !isGenerating && hasUsablePageContext();
  summarizeButton.disabled = !enabled;
  explainButton.disabled = !enabled;
}

function buildPrompt(question) {
  if (!useContextToggle.checked || !pageContext) {
    return question;
  }

  const parts = [];
  parts.push(
    "You are an assistant answering a question using, when relevant, the web page context provided below. If the context isn't useful for answering, ignore it and answer normally."
  );
  parts.push(`\n${formatPageContext()}\n`);
  parts.push(`User question: ${question}`);

  return parts.join("\n");
}

function buildSummarizePrompt() {
  return [
    "Detect the main language of the page context below and always answer in that same language.",
    "Summarize the web page for someone who hasn't read it.",
    "Provide a short summary in 3-5 sentences, followed by a 'Key points' section with exactly 3 bullet points.",
    "Only use the information from the context. If the selected text is present, focus on it; otherwise summarize the main page content.",
    "",
    formatPageContext()
  ].join("\n");
}

function buildExplainPrompt() {
  return [
    "Detect the main language of the page context below and always answer in that same language.",
    "Explain the content of this web page to an adult non-expert.",
    "Use simple everyday language, avoid jargon, and use 1-2 concrete analogies when helpful.",
    "Keep short paragraphs with a clear structure. Do not assume prior knowledge.",
    "If the selected text is present, explain it first, then its broader context on the page.",
    "",
    formatPageContext()
  ].join("\n");
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

async function handlePreset(kind) {
  if (isGenerating) return;

  if (!hasUsablePageContext()) {
    addBubble(
      "Ouvre une page web avec du contenu (ou sélectionne du texte) pour utiliser cette action.",
      "error"
    );
    return;
  }

  const isSummary = kind === "summary";
  addBubble(
    isSummary ? "Résume cette page" : "Explique-moi cette page simplement",
    "user"
  );
  setGenerating(true);

  const loadingBubble = addBubble("…", "loading");
  const model = modelInput.value.trim() || DEFAULT_MODEL;
  const prompt = isSummary ? buildSummarizePrompt() : buildExplainPrompt();

  try {
    await streamOllamaResponse(model, prompt, loadingBubble);
  } catch (err) {
    loadingBubble.dataset.kind = "error";
    loadingBubble.textContent = describeError(err);
  } finally {
    setGenerating(false);
  }
}

summarizeButton.addEventListener("click", () => handlePreset("summary"));
explainButton.addEventListener("click", () => handlePreset("explain"));

function setGenerating(value) {
  isGenerating = value;
  sendButton.disabled = value;
  updatePresetButtons();
}

function describeError(err) {
  const message = String(err?.message || err);
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Could not reach Ollama on localhost:11434.\nMake sure Ollama is running (command: ollama serve) and that OLLAMA_ORIGINS allows this extension.";
  }
  if (err?.status === 403 || message.includes(" 403")) {
    const extId = globalThis.chrome?.runtime?.id || "<extension-id>";
    return (
      "Ollama a refusé la requête (403 : origine bloquée).\n" +
      "Quitte l'app Ollama (tueur de doublon : pkill), puis relance un seul serveur avec :\n" +
      `OLLAMA_ORIGINS="chrome-extension://${extId}" ollama serve\n` +
      "(En dev : OLLAMA_ORIGINS=\"chrome-extension://*\" ollama serve)"
    );
  }
  if (err?.status === 404 || message.includes(" 404")) {
    const model = modelInput.value.trim() || DEFAULT_MODEL;
    return `Modèle '${model}' introuvable (404).\nInstalle-le avec : ollama pull ${model}`;
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
    const error = new Error(`Ollama responded ${res.status}. ${body}`);
    error.status = res.status;
    error.body = body;
    throw error;
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
