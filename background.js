async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"]
    });
  }
}

async function getActiveTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    return { ok: false, error: "No active tab found." };
  }

  if (!/^https?:\/\//.test(tab.url || "")) {
    return {
      ok: true,
      context: {
        title: tab.title || "",
        url: tab.url || "",
        selection: null,
        content: "",
        truncated: false
      }
    };
  }

  try {
    await ensureContentScriptInjected(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PAGE_CONTEXT"
    });
    return response;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "REQUEST_PAGE_CONTEXT") {
    getActiveTabContext().then(sendResponse);
    return true;
  }
});
