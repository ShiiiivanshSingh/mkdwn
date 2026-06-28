

<div align="center">

# mkdwn

**A clean, fast, browser-based Markdown editor. No accounts. No installs. Just write.**

<p align="center">
  <a href="https://shiiiivanshsingh.github.io/mkdwn/">
    <img src="https://img.shields.io/badge/🚀%20TRY%20IT%20LIVE-mkdwn-4493f8?style=for-the-badge" />
  </a>
</p>

<img width="3840" height="2880" alt="image" src="https://github.com/user-attachments/assets/abf23312-0090-4078-800a-de6a26119dae" />


<img width="1920" height="1440" alt="screenshot-studio-1782633724695" src="https://github.com/user-attachments/assets/4c40cbdf-9105-418c-b82b-b3d184460851" />


</div>

---

## ✨ Features

- 📝 **Live split-pane preview** — editor and rendered output side-by-side, synced scroll, resizable divider
- 📂 **Multi-document sidebar** — manage multiple documents in one session, auto-sorted by last edited
- 💾 **Autosave + version history** — everything persists to `localStorage`; snapshots taken every 3 minutes so you can roll back
- ⚡ **Slash commands** — type `/` anywhere in the editor to pop up an insert menu (headings, lists, code blocks, tables, diagrams, math, TOC...)
- 🧰 **Full formatting toolbar** — bold, italic, strikethrough, headings H1–H3, bullet/numbered/task lists, blockquote, inline code, code block, link, image, table, horizontal rule
- 🎨 **Syntax highlighting** — via highlight.js with language auto-detection; dark and light themes swap automatically
- 📊 **Mermaid diagrams** — render flowcharts and sequence diagrams inline in the preview
- ∑ **Math rendering** — KaTeX support for inline `$...$` and block `$$...$$` expressions
- 📑 **Auto table of contents** — drop `[toc]` on its own line and it builds itself from your headings
- 🗂️ **Front-matter** — YAML front-matter blocks parsed and displayed as a metadata card
- 🔍 **Find & replace** — with regex support, case sensitivity toggle, and match counter
- 🖥️ **Zen mode** — distraction-free writing with typewriter-style centered scrolling
- 🔗 **Shareable links** — encode the current document into a URL hash and share it with anyone
- 📤 **Export** — download as `.md`, standalone `.html`, or print/save as PDF
- 💿 **File System Access API** — open and save directly to files on disk (Chrome/Edge); falls back to download on other browsers
- 🖱️ **Drag & drop** — drop a `.md`, `.markdown`, or `.txt` file onto the window to open it
- 📋 **Smart paste** — paste an image from clipboard to embed it as base64; paste a URL over selected text to auto-wrap it as a link
- 📐 **Templates** — six built-in starter templates: blank, project README, meeting notes, daily journal, PRD, to-do list
- 🌙 **Dark / light theme** — persisted across sessions; Mermaid diagrams re-render to match
- ⌨️ **Keyboard shortcuts** — `Ctrl/⌘+B`, `Ctrl/⌘+I`, `Ctrl/⌘+K`, `Ctrl/⌘+F`, `Ctrl/⌘+P` (command palette), `Ctrl/⌘+S`
- 📏 **Live word count, character count, and reading time** in the status bar
- 🎛️ **Command palette** — `Ctrl/⌘+P` to fuzzy-search and run any action

---

## 🚀 Usage

No install needed — just open [shiiiivanshsingh.github.io/mkdwn](https://shiiiivanshsingh.github.io/mkdwn/) and start writing.

To run locally:

```bash
git clone https://github.com/ShiiiivanshSingh/mkdwn.git
cd mkdwn
# Open index.html in your browser — no build step, no server required
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ + B` | Bold |
| `Ctrl/⌘ + I` | Italic |
| `Ctrl/⌘ + K` | Link |
| `Ctrl/⌘ + F` | Find & replace |
| `Ctrl/⌘ + P` | Command palette |
| `Ctrl/⌘ + S` | Save |
| `/` | Slash command menu |
| `Esc` | Close any open panel / exit zen mode |

---

## 🎨 Templates

| Template | Description |
|---|---|
| Blank document | Clean slate |
| Project README | Sections for a typical repo readme |
| Meeting notes | Attendees, agenda, decisions, action items |
| Daily journal | Plan, log, and reflect |
| PRD | Product requirements doc with goals, risks, open questions |
| To-do list | Prioritised checklist |

---

## 🛠 Tech Stack

- **Vanilla HTML / CSS / JavaScript** — zero runtime dependencies, zero build step
- [marked](https://github.com/markedjs/marked) — Markdown parsing
- [DOMPurify](https://github.com/cure53/DOMPurify) — XSS sanitization
- [highlight.js](https://highlightjs.org/) — syntax highlighting
- [KaTeX](https://katex.org/) — math rendering
- [Mermaid](https://mermaid.js.org/) — diagram rendering
- [Lucide](https://lucide.dev/) — icons
- `localStorage` — document persistence
- File System Access API — native file open/save

---

## 📁 File Structure

```
mkdwn/
├── index.html     # App shell + all markup
├── app.js         # All logic: docs, rendering, editor, export, sharing
└── style.css      # Dark theme, split pane, slash menu, all UI
```

---

<div align="center">
  Made by <a href="https://github.com/ShiiiivanshSingh">@ShiiiivanshSingh</a>
</div>
