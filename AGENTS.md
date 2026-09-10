# Lucidity — agent notes

Chrome MV3 extension (no build, no tests, no lint). Chat with local Ollama,
augmented with active-page context. Source of truth is the code, not the README.

## Layout

- `popup.html` / `popup.js` — entire UI, prompt building, Ollama streaming.
- `background.js` — service worker, brokers `REQUEST_PAGE_CONTEXT` to the tab.
- `content-script.js` — extracts title/url/selection/main content (max 3500 chars).
- `manifest.json` — MV3, popup only (no side panel).
- `.crx` / `.pem` live in the parent dir and are gitignored. Never commit them.

## Verify (no test suite)

- `node --check <file>.js` after every JS change.
- Every `getElementById` in `popup.js` must have a matching `id` in `popup.html`.
- Reload the unpacked extension at `chrome://extensions` to see changes.

## Ollama backend (hard-earned)

- Run exactly ONE server. The macOS app and the terminal fight over `:11434`
  and the stale one serves 403s. Quit the app, `pkill -f "ollama serve"`,
  confirm `lsof -i :11434` is empty, then:
  `OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*,safari-web-extension://*" ollama serve`
- A 403 from Ollama means blocked `chrome-extension://` origin, NOT a missing
  model. Verify with:
  `curl -H "Origin: chrome-extension://test" http://localhost:11434/api/tags`
  (expect 200; `curl` without `Origin` always passes and proves nothing).
- Default model is `lfm2.5-thinking:1.2b`; install with `ollama pull <model>`.
- Reasoning models wrap output in `<think>` blocks: `stripThinking()` in
  `popup.js` filters them and the bubble stays `loading` until visible text
  arrives. Preserve that behavior.

## Conventions

- Conventional commits, in English (`feat:`, `fix:`, `docs:`).
- No code comments.
- UI strings in English; LLM prompts force the answer language, not the UI.
- Popup closes on blur and kills in-flight streams — known limitation, don't
  try to fix it with popup-side state.
