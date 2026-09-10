<img src="icons/icon.svg" alt="Lucidity Logo" align="left" width="110"/>

### `Lucidity`

Ask questions while you browse

Lucidity is a Chrome extension (Manifest V3) that chats with a local LLM via **[Ollama](https://ollama.com)**, using the active tab content. No build, no tracking, 100% local.

---

## Prerequisites

- A Chromium browser
- [Ollama](https://ollama.com) installed locally
- A model, `lfm2.5-thinking:1.2b` by default:
  ```bash
  ollama pull lfm2.5-thinking:1.2b
  ```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/GautierPicon/Lucidity
   ```
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `Lucidity-extention/` folder.
4. Pin Lucidity to the toolbar if needed.

## Ollama setup

```bash
pkill -f "ollama serve"
lsof -i :11434
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*,safari-web-extension://*" ollama serve
```

```bash
curl -H "Origin: chrome-extension://test" http://localhost:11434/api/tags
```

## Privacy

Everything stays local: page -w `localhost:11434` -> popup. No third-party server, no telemetry.
