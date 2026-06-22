const MAX_CONTENT_CHARS = 3500;

const NOISE_SELECTORS = [
  "nav", "header", "footer", "aside",
  "script", "style", "noscript", "svg", "iframe",
  "form", "button",
  "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  ".cookie", ".cookie-banner", ".ad", ".ads", ".advertisement",
  ".sidebar", ".comments", ".comment-section",
  ".newsletter", ".popup", ".modal", ".paywall"
];

function getSelectedText() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";
  return text.length > 0 ? text : null;
}

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMainContent() {
  const candidates = [
    "article",
    "main",
    "[role='main']",
    "#content",
    "#main",
    ".post-content",
    ".article-content",
    ".entry-content"
  ];

  let bestNode = null;
  let bestScore = 0;

  for (const selector of candidates) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      const score = scoreNode(node);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
  }

  if (!bestNode || bestScore < 200) {
    const fallbackNodes = document.querySelectorAll("div, section");
    for (const node of fallbackNodes) {
      if (node.children.length > 60) continue;
      const score = scoreNode(node);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }
  }

  const targetNode = bestNode || document.body;
  return extractTextExcludingNoise(targetNode);
}

function scoreNode(node) {
  const clone = node.cloneNode(true);
  removeNoise(clone);
  const text = clone.textContent || "";
  const linkCount = clone.querySelectorAll("a").length;
  const textLength = cleanText(text).length;
  const penalty = linkCount * 10;
  return Math.max(0, textLength - penalty);
}

function removeNoise(node) {
  for (const selector of NOISE_SELECTORS) {
    node.querySelectorAll(selector).forEach((el) => el.remove());
  }
}

function extractTextExcludingNoise(node) {
  const clone = node.cloneNode(true);
  removeNoise(clone);
  return cleanText(clone.textContent || "");
}

function getPageContext() {
  const selected = getSelectedText();
  const mainContent = extractMainContent();

  const context = {
    title: document.title || "",
    url: window.location.href,
    selection: selected,
    content: mainContent.slice(0, MAX_CONTENT_CHARS),
    truncated: mainContent.length > MAX_CONTENT_CHARS
  };

  return context;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "GET_PAGE_CONTEXT") {
    try {
      sendResponse({ ok: true, context: getPageContext() });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  }
  return true;
});
