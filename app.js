/* ============================================================
   Markdown Editor — vanilla JS, single file
   Features: multi-doc sidebar, live preview (marked + DOMPurify +
   highlight.js + Mermaid + KaTeX), synced scroll, slash commands,
   smart lists, paste handling, find/replace, snapshots, drag-drop,
   File System Access, TOC, front-matter, copy buttons, PDF, resizable
   split, command palette, zen + typewriter, shareable links.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const editor   = $('editor');
const preview  = $('preview');
const docList  = $('docList');
const docTitle = $('docTitle');

const HLJS_LIGHT = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
const HLJS_DARK  = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css';

/* ============================================================
   1. Document store (localStorage)
   ============================================================ */
const DOCS_KEY  = 'mdedit.docs';
const CUR_KEY   = 'mdedit.current';
const THEME_KEY = 'mdedit.theme';

let docs = [];        // [{ id, content, updated, snapshots:[{t,content}] }]
let currentId = null;
let fileHandle = null; // File System Access handle for the current doc

const uid = () => 'd' + Date.now().toString(36) + Math.floor(performance.now()).toString(36);

function loadDocs() {
  try { docs = JSON.parse(localStorage.getItem(DOCS_KEY)) || []; } catch { docs = []; }
  currentId = localStorage.getItem(CUR_KEY);
  if (!docs.length) {
    const d = newDocObject(SAMPLE);
    docs.push(d); currentId = d.id;
  }
  if (!docs.find(d => d.id === currentId)) currentId = docs[0].id;
}
function persistDocs() {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
    localStorage.setItem(CUR_KEY, currentId);
  } catch { setStatus('Save failed (storage full?)'); }
}
function newDocObject(content = '') {
  return { id: uid(), content, updated: stamp(), snapshots: [] };
}
function currentDoc() { return docs.find(d => d.id === currentId); }

// performance.now is allowed; Date.now is not in some sandboxes — guard both.
function stamp() { try { return Date.now(); } catch { return Math.floor(performance.now()); } }
function titleOf(content) {
  const m = content.match(/^\s*#{1,6}\s+(.+)$/m) || content.match(/^\s*(\S.*)$/m);
  return (m ? m[1] : 'Untitled').replace(/[#*`~]/g, '').trim().slice(0, 60) || 'Untitled';
}

/* ============================================================
   2. Markdown rendering pipeline
   ============================================================ */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = (s) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');

const renderer = new marked.Renderer();
renderer.code = function (code, infostring) {
  if (typeof code === 'object') { infostring = code.lang; code = code.text; } // marked v12 token form
  const lang = (infostring || '').trim().split(/\s+/)[0];
  if (lang === 'mermaid') return `<div class="mermaid">${esc(code)}</div>`;
  let html;
  if (window.hljs && lang && hljs.getLanguage(lang)) html = hljs.highlight(code, { language: lang }).value;
  else if (window.hljs) html = hljs.highlightAuto(code).value;
  else html = esc(code);
  return `<pre><code class="hljs ${lang ? 'language-' + lang : ''}">${html}</code></pre>`;
};
marked.setOptions({ gfm: true, breaks: true, renderer });

// Pull a leading YAML-ish front-matter block out of the source.
function extractFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: src, fm: null };
  const fm = {};
  m[1].split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return { body: src.slice(m[0].length), fm };
}

let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 120); }

function render() {
  const raw = editor.value;
  const { body, fm } = extractFrontMatter(raw);
  let dirty = marked.parse(body);
  preview.innerHTML = DOMPurify.sanitize(dirty, { ADD_ATTR: ['id', 'target'] });

  if (fm) {
    const box = document.createElement('div');
    box.className = 'frontmatter';
    box.innerHTML = Object.entries(fm).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join('<br>');
    preview.prepend(box);
  }

  addHeadingIds();
  buildTOC();
  enhanceCodeBlocks();
  renderMermaid();
  renderMath();
  updateStats(raw);
}

function addHeadingIds() {
  const seen = {};
  preview.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    let s = slug(h.textContent) || 'section';
    if (seen[s] != null) s += '-' + (++seen[s]); else seen[s] = 0;
    h.id = s;
  });
}

// Replace a paragraph that is exactly [toc] with a generated table of contents.
function buildTOC() {
  const marker = [...preview.querySelectorAll('p')].find(p => p.textContent.trim().toLowerCase() === '[toc]');
  if (!marker) return;
  const heads = preview.querySelectorAll('h1,h2,h3');
  const toc = document.createElement('nav');
  toc.className = 'toc';
  toc.innerHTML = '<div class="toc-title">Contents</div>';
  const ul = document.createElement('ul');
  heads.forEach(h => {
    const li = document.createElement('li');
    li.style.marginLeft = ({ H1: 0, H2: 14, H3: 28 }[h.tagName]) + 'px';
    li.innerHTML = `<a href="#${h.id}">${esc(h.textContent)}</a>`;
    ul.appendChild(li);
  });
  toc.appendChild(ul);
  marker.replaceWith(toc);
}

function enhanceCodeBlocks() {
  preview.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn'; btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(pre.innerText.replace(/Copy$/, '')).then(() => {
        btn.textContent = 'Copied!'; setTimeout(() => (btn.textContent = 'Copy'), 1200);
      });
    });
    pre.appendChild(btn);
  });
}

let mermaidReady = false;
function initMermaid() {
  if (!window.mermaid) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });
  mermaidReady = true;
}
let mermaidCounter = 0;
async function renderMermaid() {
  if (!mermaidReady) initMermaid();
  if (!window.mermaid) return;
  for (const node of preview.querySelectorAll('.mermaid')) {
    const src = node.textContent;
    try {
      const { svg } = await mermaid.render('mmd' + (mermaidCounter++), src);
      node.innerHTML = svg;
    } catch (e) {
      node.innerHTML = `<pre style="color:#c00">Mermaid error: ${esc(String(e.message || e))}</pre>`;
    }
  }
}

function renderMath() {
  if (!window.renderMathInElement) return;
  try {
    renderMathInElement(preview, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  } catch {}
}

function updateStats(text) {
  const words = (text.trim().match(/\S+/g) || []).length;
  $('charCount').textContent = `${text.length} chars`;
  $('wordCount').textContent = `${words} word${words === 1 ? '' : 's'}`;
  $('readTime').textContent  = `${words === 0 ? 0 : Math.max(1, Math.round(words / 200))} min`;
}

/* ============================================================
   3. Autosave + snapshots
   ============================================================ */
let saveTimer = null;
function setStatus(msg, unsaved) {
  const el = $('saveStatus'); el.textContent = msg;
  el.classList.toggle('unsaved', !!unsaved);
}
function scheduleSave() {
  setStatus('Saving…', true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const d = currentDoc();
    if (d) { d.content = editor.value; d.updated = stamp(); }
    persistDocs();
    renderDocList();
    setStatus('Saved');
    if (fileHandle) writeFileHandle(); // mirror to disk if linked
  }, 400);
}

const SNAPSHOT_INTERVAL = 3 * 60 * 1000;
setInterval(() => {
  const d = currentDoc();
  if (!d) return;
  const last = d.snapshots[d.snapshots.length - 1];
  if (last && last.content === d.content) return;
  if (!d.content.trim()) return;
  d.snapshots.push({ t: stamp(), content: d.content });
  if (d.snapshots.length > 30) d.snapshots.shift();
  persistDocs();
}, SNAPSHOT_INTERVAL);

/* ============================================================
   4. Editor input + smart lists
   ============================================================ */
editor.addEventListener('input', () => { scheduleRender(); scheduleSave(); if (document.body.classList.contains('zen')) typewriter(); });

const LIST_RE = /^(\s*)(?:([-*+])\s\[( |x|X)\]\s|([-*+])\s|(\d+)\.\s)(.*)$/;
editor.addEventListener('keydown', (e) => {
  // While the slash menu is open, let its own handler own these keys.
  if (slashOpen && ['Enter', 'ArrowUp', 'ArrowDown', 'Escape', 'Tab'].includes(e.key)) return;
  // Smart list continuation
  if (e.key === 'Enter' && !e.shiftKey) {
    const { selectionStart: s, value } = editor;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const line = value.slice(lineStart, s);
    const m = line.match(LIST_RE);
    if (m) {
      const [, indent, ub, chk, ub2, num, content] = m;
      if (!content.trim()) { // empty item -> end the list
        e.preventDefault();
        editor.setRangeText('', lineStart, s, 'end');
        scheduleRender(); scheduleSave();
        return;
      }
      let marker;
      if (num) marker = indent + (parseInt(num, 10) + 1) + '. ';
      else if (chk !== undefined) marker = indent + (ub || ub2 || '-') + ' [ ] ';
      else marker = indent + (ub || ub2) + ' ';
      e.preventDefault();
      editor.setRangeText('\n' + marker, s, s, 'end');
      scheduleRender(); scheduleSave();
      return;
    }
  }
  // Tab = two spaces
  if (e.key === 'Tab' && $('slashMenu').hidden) {
    e.preventDefault();
    editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
  }
  // Shortcuts
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    const k = e.key.toLowerCase();
    if (!e.shiftKey && k === 'b') { e.preventDefault(); ACTIONS.bold(); }
    else if (!e.shiftKey && k === 'i') { e.preventDefault(); ACTIONS.italic(); }
    else if (!e.shiftKey && k === 'k') { e.preventDefault(); ACTIONS.link(); }
    else if (!e.shiftKey && k === 's') { e.preventDefault(); scheduleSave(); }
    else if (!e.shiftKey && k === 'f') { e.preventDefault(); openFind(); }
    else if (!e.shiftKey && k === 'p') { e.preventDefault(); openPalette(); }
  }
});

/* ============================================================
   5. Toolbar formatting
   ============================================================ */
function wrap(before, after = before, placeholder = 'text') {
  const { selectionStart: s, selectionEnd: e, value } = editor;
  const selected = value.slice(s, e) || placeholder;
  editor.setRangeText(before + selected + after, s, e, 'end');
  const inner = s + before.length;
  editor.setSelectionRange(inner, inner + selected.length);
  editor.focus(); scheduleRender(); scheduleSave();
}
function linePrefix(prefix, { numbered = false } = {}) {
  const { selectionStart: s, selectionEnd: e, value } = editor;
  const ls = value.lastIndexOf('\n', s - 1) + 1;
  let le = value.indexOf('\n', e); if (le === -1) le = value.length;
  const out = value.slice(ls, le).split('\n')
    .map((l, i) => (numbered ? `${i + 1}. ` : prefix) + l).join('\n');
  editor.setRangeText(out, ls, le, 'end');
  editor.focus(); scheduleRender(); scheduleSave();
}
function insertBlock(text, caretBack = 0) {
  const { selectionStart: s } = editor;
  const before = editor.value.slice(0, s);
  const pad = before.length && !before.endsWith('\n') ? '\n' : '';
  editor.setRangeText(pad + text, s, editor.selectionEnd, 'end');
  if (caretBack) { const p = editor.selectionStart - caretBack; editor.setSelectionRange(p, p); }
  editor.focus(); scheduleRender(); scheduleSave();
}
const TABLE_TPL = `\n| Column A | Column B |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n`;
const MERMAID_TPL = '```mermaid\ngraph TD\n  A[Start] --> B{Choice}\n  B -->|Yes| C[OK]\n  B -->|No| D[Stop]\n```\n';

const ACTIONS = {
  bold: () => wrap('**'), italic: () => wrap('*'), strike: () => wrap('~~'),
  code: () => wrap('`', '`', 'code'),
  h1: () => linePrefix('# '), h2: () => linePrefix('## '), h3: () => linePrefix('### '),
  ul: () => linePrefix('- '), ol: () => linePrefix('', { numbered: true }),
  task: () => linePrefix('- [ ] '), quote: () => linePrefix('> '),
  codeblock: () => insertBlock('```\ncode\n```\n'),
  link: () => wrap('[', '](https://)', 'title'),
  image: () => insertBlock('![alt text](https://image-url)'),
  table: () => insertBlock(TABLE_TPL), hr: () => insertBlock('\n---\n'),
  mermaid: () => insertBlock(MERMAID_TPL), math: () => wrap('$$\n', '\n$$', 'E = mc^2'),
  toc: () => insertBlock('\n[toc]\n'),
};
$('toolbar').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button'); if (!btn) return;
  ACTIONS[btn.dataset.md]?.();
});

/* ============================================================
   6. Slash command menu
   ============================================================ */
const SLASH_ITEMS = [
  { ic: 'heading-1',    name: 'Heading 1', run: ACTIONS.h1 },
  { ic: 'heading-2',    name: 'Heading 2', run: ACTIONS.h2 },
  { ic: 'heading-3',    name: 'Heading 3', run: ACTIONS.h3 },
  { ic: 'list',         name: 'Bullet list', run: ACTIONS.ul },
  { ic: 'list-ordered', name: 'Numbered list', run: ACTIONS.ol },
  { ic: 'list-checks',  name: 'Task list', run: ACTIONS.task },
  { ic: 'text-quote',   name: 'Quote', run: ACTIONS.quote },
  { ic: 'braces',       name: 'Code block', run: ACTIONS.codeblock },
  { ic: 'table',        name: 'Table', run: ACTIONS.table },
  { ic: 'link',         name: 'Link', run: ACTIONS.link },
  { ic: 'image',        name: 'Image', run: ACTIONS.image },
  { ic: 'minus',        name: 'Divider', run: ACTIONS.hr },
  { ic: 'workflow',     name: 'Mermaid diagram', run: ACTIONS.mermaid },
  { ic: 'sigma',        name: 'Math block', run: ACTIONS.math },
  { ic: 'list-tree',    name: 'Table of contents', run: ACTIONS.toc },
];
const slashMenu = $('slashMenu');
let slashOpen = false, slashStart = -1, slashSel = 0, slashFiltered = [];

editor.addEventListener('input', maybeSlash);
function maybeSlash() {
  const s = editor.selectionStart;
  const before = editor.value.slice(0, s);
  const m = before.match(/(^|\s)\/([\w]*)$/);
  if (m) {
    slashStart = s - m[2].length - 1;
    openSlash(m[2]);
  } else if (slashOpen) closeSlash();
}
function openSlash(query) {
  slashFiltered = SLASH_ITEMS.filter(i => i.name.toLowerCase().includes(query.toLowerCase()));
  if (!slashFiltered.length) { closeSlash(); return; }
  slashSel = 0; slashOpen = true;
  slashMenu.innerHTML = slashFiltered.map((it, i) =>
    `<div class="slash-item ${i === 0 ? 'sel' : ''}" data-i="${i}">
       <span class="ic"><i data-lucide="${it.ic}"></i></span><span>${it.name}</span></div>`).join('');
  drawIcons();
  const c = caretCoords(editor, editor.selectionStart);
  slashMenu.style.left = Math.min(c.left, editor.clientWidth - 240) + 'px';
  slashMenu.style.top = (c.top + 22) + 'px';
  slashMenu.hidden = false;
}
function closeSlash() { slashOpen = false; slashMenu.hidden = true; }
function runSlash(i) {
  const it = slashFiltered[i]; if (!it) return;
  editor.setRangeText('', slashStart, editor.selectionStart, 'end'); // remove "/query"
  closeSlash();
  it.run();
}
slashMenu.addEventListener('mousedown', (e) => {
  const el = e.target.closest('.slash-item'); if (!el) return;
  e.preventDefault(); runSlash(+el.dataset.i);
});
editor.addEventListener('keydown', (e) => {
  if (!slashOpen) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    slashSel = (slashSel + (e.key === 'ArrowDown' ? 1 : -1) + slashFiltered.length) % slashFiltered.length;
    [...slashMenu.children].forEach((c, i) => c.classList.toggle('sel', i === slashSel));
  } else if (e.key === 'Enter') { e.preventDefault(); runSlash(slashSel); }
  else if (e.key === 'Escape') { closeSlash(); }
}, true);

// Caret pixel position inside a textarea (mirror-div technique).
function caretCoords(el, pos) {
  const div = document.createElement('div');
  const style = getComputedStyle(el);
  ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','border','boxSizing','whiteSpace','wordWrap','width']
    .forEach(p => div.style[p] = style[p]);
  div.style.position = 'absolute'; div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap'; div.style.wordWrap = 'break-word';
  div.textContent = el.value.slice(0, pos);
  const span = document.createElement('span'); span.textContent = '.';
  div.appendChild(span);
  el.parentElement.appendChild(div);
  const top = span.offsetTop - el.scrollTop, left = span.offsetLeft;
  div.remove();
  return { top, left };
}

/* ============================================================
   7. Paste handling: URL wrapping + image embedding
   ============================================================ */
editor.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.type.startsWith('image/')) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => insertBlock(`![pasted image](${reader.result})`);
      reader.readAsDataURL(it.getAsFile());
      return;
    }
  }
  const text = e.clipboardData?.getData('text') || '';
  const isUrl = /^https?:\/\/\S+$/.test(text.trim());
  const { selectionStart: s, selectionEnd: en } = editor;
  if (isUrl && en > s) { // wrap selection as a link
    e.preventDefault();
    const sel = editor.value.slice(s, en);
    editor.setRangeText(`[${sel}](${text.trim()})`, s, en, 'end');
    scheduleRender(); scheduleSave();
  }
});

/* ============================================================
   8. Find & replace
   ============================================================ */
let matches = [], matchIdx = -1;
function buildRegex() {
  const q = $('findInput').value; if (!q) return null;
  const flags = 'g' + ($('findCase').checked ? '' : 'i');
  try { return new RegExp($('findRegex').checked ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); }
  catch { return null; }
}
function refreshMatches() {
  const re = buildRegex(); matches = [];
  if (re) { let m; while ((m = re.exec(editor.value))) { matches.push([m.index, m.index + m[0].length]); if (m.index === re.lastIndex) re.lastIndex++; } }
  $('findCount').textContent = `${matches.length ? matchIdx + 1 : 0}/${matches.length}`;
}
function gotoMatch(dir) {
  refreshMatches();
  if (!matches.length) { $('findCount').textContent = '0/0'; return; }
  matchIdx = (matchIdx + dir + matches.length) % matches.length;
  const [a, b] = matches[matchIdx];
  editor.focus(); editor.setSelectionRange(a, b);
  const c = caretCoords(editor, a); editor.scrollTop += c.top - editor.clientHeight / 2;
  $('findCount').textContent = `${matchIdx + 1}/${matches.length}`;
}
function openFind() {
  $('findPanel').hidden = false; $('findInput').focus(); $('findInput').select(); refreshMatches();
}
$('findClose').addEventListener('click', () => { $('findPanel').hidden = true; editor.focus(); });
$('findNext').addEventListener('click', () => gotoMatch(1));
$('findPrev').addEventListener('click', () => gotoMatch(-1));
$('findInput').addEventListener('input', () => { matchIdx = -1; refreshMatches(); });
['findRegex','findCase'].forEach(id => $(id).addEventListener('change', () => { matchIdx = -1; refreshMatches(); }));
$('findInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') $('findClose').click(); });
$('replaceOne').addEventListener('click', () => {
  if (matchIdx < 0) gotoMatch(1);
  if (matchIdx < 0) return;
  const [a, b] = matches[matchIdx];
  editor.setRangeText($('replaceInput').value, a, b, 'end');
  matchIdx = -1; scheduleRender(); scheduleSave(); gotoMatch(1);
});
$('replaceAll').addEventListener('click', () => {
  const re = buildRegex(); if (!re) return;
  editor.value = editor.value.replace(re, $('replaceInput').value);
  refreshMatches(); scheduleRender(); scheduleSave();
});

/* ============================================================
   9. Synced scrolling (bidirectional, lock-guarded)
   ============================================================ */
let scrollLock = false;
function sync(from, to) {
  if (scrollLock) return; scrollLock = true;
  const r = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
  to.scrollTop = r * (to.scrollHeight - to.clientHeight);
  requestAnimationFrame(() => (scrollLock = false));
}
editor.addEventListener('scroll', () => sync(editor, preview));
preview.addEventListener('scroll', () => sync(preview, editor));

/* ============================================================
   10. Sidebar / multi-document
   ============================================================ */
function renderDocList() {
  docList.innerHTML = '';
  [...docs].sort((a, b) => b.updated - a.updated).forEach(d => {
    const li = document.createElement('li');
    li.className = 'doc-item' + (d.id === currentId ? ' active' : '');
    li.innerHTML = `<span class="name">${esc(titleOf(d.content))}</span>
                    <button class="del" title="Delete"><i data-lucide="trash-2"></i></button>`;
    li.addEventListener('click', (e) => { if (!e.target.closest('.del')) switchDoc(d.id); });
    li.querySelector('.del').addEventListener('click', (e) => { e.stopPropagation(); deleteDoc(d.id); });
    docList.appendChild(li);
  });
  drawIcons();
}

// (Re)render any Lucide <i data-lucide> placeholders into SVGs. Safe to call repeatedly.
function drawIcons() { if (window.lucide) lucide.createIcons(); }
function loadCurrentIntoEditor() {
  const d = currentDoc(); if (!d) return;
  editor.value = d.content;
  docTitle.value = titleOf(d.content);
  fileHandle = null;
  render(); renderDocList();
  setStatus('Saved');
}
function switchDoc(id) {
  flushSave(); currentId = id; persistDocs(); loadCurrentIntoEditor(); editor.focus();
}
function newDoc(content = '# Untitled\n\n') {
  flushSave();
  const d = newDocObject(content); docs.push(d); currentId = d.id;
  persistDocs(); loadCurrentIntoEditor(); editor.focus();
}
function deleteDoc(id) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  docs = docs.filter(d => d.id !== id);
  if (!docs.length) docs.push(newDocObject('# Untitled\n\n'));
  if (currentId === id) currentId = docs[0].id;
  persistDocs(); loadCurrentIntoEditor();
}
function flushSave() {
  clearTimeout(saveTimer);
  const d = currentDoc(); if (d) { d.content = editor.value; d.updated = stamp(); }
  persistDocs();
}
$('newDocBtn').addEventListener('click', () => newDoc());
docTitle.addEventListener('change', () => {
  // Rename = ensure the first heading matches the typed title.
  const t = docTitle.value.trim(); if (!t) return;
  if (/^\s*#/.test(editor.value)) editor.value = editor.value.replace(/^\s*#{1,6}\s+.*$/m, '# ' + t);
  else editor.value = '# ' + t + '\n\n' + editor.value;
  render(); scheduleSave();
});
$('collapseSidebar').addEventListener('click', () => document.body.classList.add('sidebar-hidden'));
$('showSidebar').addEventListener('click', () => document.body.classList.toggle('sidebar-hidden'));

/* ============================================================
   11. Version history modal
   ============================================================ */
$('historyBtn').addEventListener('click', () => {
  const d = currentDoc(); const list = $('historyList'); list.innerHTML = '';
  const snaps = [...(d.snapshots || [])].reverse();
  if (!snaps.length) list.innerHTML = '<li class="hist-item">No snapshots yet — they’re taken every few minutes.</li>';
  snaps.forEach(sn => {
    const li = document.createElement('li'); li.className = 'hist-item';
    li.innerHTML = `<span class="when">${new Date(sn.t).toLocaleString()}</span>
                    <span class="prev">${esc(sn.content.slice(0, 40))}</span>
                    <button>Restore</button>`;
    li.querySelector('button').addEventListener('click', () => {
      editor.value = sn.content; render(); scheduleSave(); $('historyModal').hidden = true;
    });
    list.appendChild(li);
  });
  $('historyModal').hidden = false;
});
$('historyClose').addEventListener('click', () => $('historyModal').hidden = true);

/* ============================================================
   11b. Pre-made templates
   ============================================================ */
const TEMPLATES = [
  {
    name: 'Blank document', icon: 'file', desc: 'A clean slate with just a title.',
    content: `# Untitled\n\n`,
  },
  {
    name: 'Project README', icon: 'file-text', desc: 'Sections for a typical repo readme.',
    content: `# Project Name

> One-line description of what this project does.

## Features
- Feature one
- Feature two
- Feature three

## Installation
\`\`\`bash
npm install project-name
\`\`\`

## Usage
\`\`\`js
import { thing } from 'project-name';
thing();
\`\`\`

## Contributing
Pull requests are welcome. For major changes, open an issue first.

## License
[MIT](LICENSE)
`,
  },
  {
    name: 'Meeting notes', icon: 'users', desc: 'Attendees, agenda, decisions, action items.',
    content: `# Meeting Notes

**Date:** \n**Attendees:** \n**Topic:**

## Agenda
1.
2.

## Discussion
-

## Decisions
-

## Action items
- [ ] Task — *owner* — due
- [ ] Task — *owner* — due
`,
  },
  {
    name: 'Daily journal', icon: 'calendar-days', desc: 'Plan, log, and reflect on your day.',
    content: `# Journal —

## Today's focus
- [ ]
- [ ]
- [ ]

## Notes
-

## Wins
-

## Tomorrow
-
`,
  },
  {
    name: 'Blog post', icon: 'newspaper', desc: 'Front-matter plus a ready-to-write outline.',
    content: `---
title: Your Post Title
date:
tags:
---

# Your Post Title

A compelling introduction that hooks the reader in a sentence or two.

## Background
Set up the problem or context.

## Main point
Develop your idea with examples.

> A quote or key takeaway worth highlighting.

## Conclusion
Wrap up and tell the reader what to do next.
`,
  },
  {
    name: 'Project plan / PRD', icon: 'target', desc: 'Goals, scope, milestones, and risks.',
    content: `# Project Plan:

## Overview
Brief summary of the project and why it matters.

## Goals
-
-

## Non-goals
-

## Scope & milestones
| Milestone | Owner | Target date | Status |
| --------- | ----- | ----------- | ------ |
| M1        |       |             | ☐      |
| M2        |       |             | ☐      |

## Risks
-

## Open questions
-
`,
  },
  {
    name: 'To-do list', icon: 'list-checks', desc: 'Prioritised checklist to track tasks.',
    content: `# To-Do

## Today
- [ ]
- [ ]

## This week
- [ ]
- [ ]

## Someday
- [ ]
`,
  },
];

function openTemplates() {
  const list = $('templatesList');
  list.innerHTML = TEMPLATES.map((t, i) =>
    `<div class="tpl-card" data-i="${i}">
       <span class="tpl-ic"><i data-lucide="${t.icon}"></i></span>
       <span class="tpl-name">${esc(t.name)}</span>
       <span class="tpl-desc">${esc(t.desc)}</span>
     </div>`).join('');
  drawIcons();
  $('templatesModal').hidden = false;
}
function closeTemplates() { $('templatesModal').hidden = true; }
$('templatesList').addEventListener('click', (e) => {
  const el = e.target.closest('.tpl-card'); if (!el) return;
  const t = TEMPLATES[+el.dataset.i]; if (!t) return;
  closeTemplates(); newDoc(t.content);
});
$('templatesBtn').addEventListener('click', openTemplates);
$('templatesClose').addEventListener('click', closeTemplates);
$('templatesModal').addEventListener('mousedown', (e) => { if (e.target.id === 'templatesModal') closeTemplates(); });

/* ============================================================
   12. Drag-drop + File System Access
   ============================================================ */
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files[0]; if (!f) return;
  f.text().then(t => newDoc(t));
});
$('fileInput').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => newDoc(t)); e.target.value = '';
});
async function openFromDisk() {
  if (!window.showOpenFilePicker) { $('fileInput').click(); return; }
  try {
    const [h] = await window.showOpenFilePicker({ types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] });
    const file = await h.getFile();
    newDoc(await file.text()); fileHandle = h;
    setStatus('Linked to ' + file.name);
  } catch {}
}
async function saveToDisk() {
  try {
    if (!fileHandle) {
      if (!window.showSaveFilePicker) { download(titleOf(editor.value) + '.md', editor.value, 'text/markdown'); return; }
      fileHandle = await window.showSaveFilePicker({ suggestedName: titleOf(editor.value) + '.md', types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }] });
    }
    await writeFileHandle(); setStatus('Saved to disk');
  } catch {}
}
async function writeFileHandle() {
  try { const w = await fileHandle.createWritable(); await w.write(editor.value); await w.close(); } catch {}
}

/* ============================================================
   13. Export: .md / .html / PDF
   ============================================================ */
function download(filename, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function exportMd() { download(titleOf(editor.value) + '.md', editor.value, 'text/markdown'); }
function exportHtml() {
  const body = preview.innerHTML;
  const html = `<!DOCTYPE html><meta charset="utf-8"><title>${esc(titleOf(editor.value))}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>body{max-width:820px;margin:40px auto;padding:0 20px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.65}
pre{background:#f6f8fa;padding:14px;border-radius:8px;overflow:auto}code{background:#f6f8fa;padding:.2em .4em;border-radius:5px}
pre code{background:none;padding:0}blockquote{border-left:.25em solid #d8dee4;margin:0;padding:0 1em;color:#656d76}
table{border-collapse:collapse}th,td{border:1px solid #d8dee4;padding:6px 13px}img{max-width:100%}</style>
${body}`;
  download(titleOf(editor.value) + '.html', html, 'text/html');
}
// Print/PDF in light theme: dark-theme diagrams render light text on dark fills,
// which the browser turns into unreadable black-on-black on white paper.
async function exportPDF() {
  const prev = document.documentElement.getAttribute('data-theme');
  if (prev === 'dark') {
    applyTheme('light');                                 // re-renders mermaid/math in light theme
    await new Promise(r => setTimeout(r, 400));           // let the async diagram render settle
  }
  const restore = () => {
    window.removeEventListener('afterprint', restore);
    if (prev === 'dark') applyTheme('dark');
  };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(restore, 1000);                              // fallback if afterprint never fires
}

/* ============================================================
   14. Preview toggle / theme / zen / typewriter
   ============================================================ */
$('togglePreview').addEventListener('click', () => document.body.classList.toggle('no-preview'));
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('hljs-theme').href = theme === 'dark' ? HLJS_DARK : HLJS_LIGHT;
  $('themeBtn').innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  drawIcons();
  localStorage.setItem(THEME_KEY, theme);
  mermaidReady = false; // re-init mermaid with the matching theme
  render();
}
$('themeBtn').addEventListener('click', () =>
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

function toggleZen() { document.body.classList.toggle('zen'); if (document.body.classList.contains('zen')) { editor.focus(); typewriter(); } }
$('zenBtn').addEventListener('click', toggleZen);
$('zenExit').addEventListener('click', toggleZen);
function typewriter() {
  const c = caretCoords(editor, editor.selectionStart);
  editor.scrollTop += c.top - editor.clientHeight / 2;
}
editor.addEventListener('click', () => { if (document.body.classList.contains('zen')) typewriter(); });

/* ============================================================
   15. Command palette
   ============================================================ */
const COMMANDS = [
  { name: 'New document', key: '', run: () => newDoc() },
  { name: 'New from template…', key: '', run: openTemplates },
  { name: 'Open file from disk', key: '', run: openFromDisk },
  { name: 'Save to disk', key: '', run: saveToDisk },
  { name: 'Export as Markdown', key: '', run: exportMd },
  { name: 'Export as HTML', key: '', run: exportHtml },
  { name: 'Export as PDF / Print', key: '', run: exportPDF },
  { name: 'Find & replace', key: 'Ctrl+F', run: openFind },
  { name: 'Toggle preview', key: '', run: () => document.body.classList.toggle('no-preview') },
  { name: 'Toggle dark mode', key: '', run: () => $('themeBtn').click() },
  { name: 'Zen mode', key: '', run: toggleZen },
  { name: 'Version history', key: '', run: () => $('historyBtn').click() },
  { name: 'Share via link', key: '', run: shareLink },
  { name: 'Insert table', key: '', run: ACTIONS.table },
  { name: 'Insert Mermaid diagram', key: '', run: ACTIONS.mermaid },
  { name: 'Insert math block', key: '', run: ACTIONS.math },
  { name: 'Insert table of contents', key: '', run: ACTIONS.toc },
];
let palItems = [], palSel = 0;
function openPalette() {
  $('palette').hidden = false; $('paletteInput').value = ''; filterPalette('');
  $('paletteInput').focus();
}
function filterPalette(q) {
  palItems = COMMANDS.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  palSel = 0;
  $('paletteList').innerHTML = palItems.map((c, i) =>
    `<li class="palette-item ${i === 0 ? 'sel' : ''}" data-i="${i}"><span>${c.name}</span><span class="key">${c.key}</span></li>`).join('');
}
function runPalette(i) { const c = palItems[i]; $('palette').hidden = true; if (c) c.run(); }
$('paletteBtn').addEventListener('click', openPalette);
$('paletteInput').addEventListener('input', (e) => filterPalette(e.target.value));
$('paletteInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    palSel = (palSel + (e.key === 'ArrowDown' ? 1 : -1) + palItems.length) % palItems.length;
    [...$('paletteList').children].forEach((c, i) => c.classList.toggle('sel', i === palSel));
  } else if (e.key === 'Enter') { e.preventDefault(); runPalette(palSel); }
  else if (e.key === 'Escape') $('palette').hidden = true;
});
$('paletteList').addEventListener('mousedown', (e) => { const el = e.target.closest('.palette-item'); if (el) runPalette(+el.dataset.i); });
$('palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') $('palette').hidden = true; });
$('historyModal').addEventListener('mousedown', (e) => { if (e.target.id === 'historyModal') $('historyModal').hidden = true; });

/* ============================================================
   16. Resizable split
   ============================================================ */
(function () {
  const divider = $('divider'), panes = $('panes'), ed = $('editorPane'), pv = $('previewPane');
  let dragging = false;
  divider.addEventListener('mousedown', () => { dragging = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = panes.getBoundingClientRect();
    const ratio = Math.min(0.85, Math.max(0.15, (e.clientX - rect.left) / rect.width));
    ed.style.flex = `0 0 ${ratio * 100}%`; pv.style.flex = `1 1 auto`;
  });
})();

/* ============================================================
   17. Shareable links
   ============================================================ */
function shareLink() {
  try {
    const data = btoa(unescape(encodeURIComponent(editor.value)));
    const url = location.origin + location.pathname + '#doc=' + data;
    navigator.clipboard.writeText(url).then(() => setStatus('Share link copied to clipboard'));
  } catch { setStatus('Could not build share link'); }
}
function loadFromHash() {
  const m = location.hash.match(/#doc=(.+)$/);
  if (!m) return false;
  try {
    const content = decodeURIComponent(escape(atob(m[1])));
    history.replaceState(null, '', location.pathname);
    newDoc(content); return true;
  } catch { return false; }
}

/* ============================================================
   18. Global key handling + flush on unload
   ============================================================ */
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'p' && !e.altKey) { e.preventDefault(); openPalette(); }
  if (e.key === 'Escape') {
    // Don't bail out of zen if Escape is really dismissing an open overlay.
    const overlayOpen = slashOpen || !$('palette').hidden || !$('findPanel').hidden
      || !$('templatesModal').hidden || !$('historyModal').hidden;
    closeSlash();
    $('templatesModal').hidden = true;
    $('historyModal').hidden = true;
    if (!overlayOpen && document.body.classList.contains('zen')) toggleZen();
  }
});
window.addEventListener('beforeunload', flushSave);

/* ============================================================
   19. Sample + boot
   ============================================================ */
const SAMPLE = `# Welcome 👋

A full-featured markdown editor — **everything saves automatically**.

Type \`/\` for commands, drag in a \`.md\` file, or hit **Ctrl/⌘+P** for the palette.

## What it can do
- **Bold**, *italic*, ~~strike~~, \`code\`, [links](https://commonmark.org)
- Task lists:
  - [x] Live preview
  - [ ] Try the slash menu
- Tables, footnotes, blockquotes

\`\`\`js
const greet = (name) => \`Hello, \${name}!\`;
\`\`\`

### Diagrams (Mermaid)
\`\`\`mermaid
graph LR
  A[Write] --> B[Preview]
  B --> C{Export}
  C -->|PDF| D[Print]
  C -->|HTML| E[Share]
\`\`\`

### Math (KaTeX)
Inline $a^2 + b^2 = c^2$ and a block:
$$\\int_0^\\infty e^{-x}\\,dx = 1$$

> Tip: \`[toc]\` on its own line inserts a table of contents.
`;

function boot() {
  const firstRun = !localStorage.getItem(DOCS_KEY); // no saved docs => brand-new visitor
  loadDocs();
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  const fromHash = loadFromHash();
  if (!fromHash) loadCurrentIntoEditor();
  drawIcons(); // render all remaining static toolbar/action icons
  // Greet new visitors with the template gallery (skip if they arrived via a share link).
  if (firstRun && !fromHash) openTemplates();
  // Hide File System buttons in palette handled gracefully via fallbacks.
  editor.focus();
}
boot();
