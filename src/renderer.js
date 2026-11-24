const $ = (id) => document.getElementById(id);
let tasks = [];
let selectedId = null;
let saveTimer = null;

const uid = () => crypto.randomUUID();
const current = () => tasks.find((t) => t.id === selectedId);

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.saveTasks(tasks), 300);
}
window.addEventListener('beforeunload', () => window.api.saveTasks(tasks));

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  n.append(...kids);
  return n;
}

const PRI_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

function visibleTasks() {
  const q = $('search').value.trim().toLowerCase();
  const pf = $('priorityFilter').value;
  const hide = $('hideDone').checked;
  return tasks
    .filter((t) => {
      if (hide && t.done) return false;
      if (pf && t.priority !== pf) return false;
      if (!q) return true;
      const hay = [t.title, t.notes, ...t.links, ...t.files.map((f) => f.name)].join('\n').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) =>
      (a.done - b.done) || (PRI_ORDER[a.priority] - PRI_ORDER[b.priority]) || (b.created - a.created));
}

function renderList() {
  const list = $('list');
  list.replaceChildren();
  const vis = visibleTasks();
  for (const t of vis) {
    const li = el('li', { className: (t.id === selectedId ? 'sel ' : '') + (t.done ? 'done' : '') },
      el('span', { className: 'dot ' + t.priority }),
      el('span', { className: 't', textContent: t.title || 'Untitled' }));
    const extras = (t.links.length ? '🔗' : '') + (t.files.length ? '📎' : '');
    if (extras) li.append(el('span', { className: 'meta', textContent: extras }));
    li.onclick = () => select(t.id);
    list.append(li);
  }
  const open = tasks.filter((t) => !t.done).length;
  $('count').textContent = `${vis.length} shown · ${open} open · ${tasks.length} total`;
}

function renderEditor() {
  const t = current();
  $('empty').hidden = !!t;
  $('editor').hidden = !t;
  if (!t) return;
  $('title').value = t.title;
  $('notes').value = t.notes;
  $('priority').value = t.priority;
  $('done').checked = t.done;
  renderAttachments();
}

function renderAttachments() {
  const t = current();
  if (!t) return;
  const links = $('links');
  links.replaceChildren();
  t.links.forEach((url, i) => {
    const name = el('span', { className: 'name', textContent: url, title: url });
    name.onclick = () => window.api.openLink(url);
    const rm = el('button', { textContent: 'Remove' });
    rm.onclick = () => { t.links.splice(i, 1); touch(t); renderAttachments(); renderList(); };
    links.append(el('li', {}, name, rm));
  });
  const files = $('files');
  files.replaceChildren();
  t.files.forEach((f, i) => {
    const name = el('span', { className: 'name', textContent: f.name, title: 'Open' });
    name.onclick = () => window.api.openFile(t.id, f.id, f.name);
    const show = el('button', { textContent: 'Show in Finder' });
    show.onclick = () => window.api.revealFile(t.id, f.id, f.name);
    const rm = el('button', { textContent: 'Remove' });
    rm.onclick = async () => {
      await window.api.removeFile(t.id, f.id, f.name);
      t.files.splice(i, 1); touch(t); renderAttachments(); renderList();
    };
    files.append(el('li', {}, name, show, rm));
  });
}

function touch(t) { t.updated = Date.now(); save(); }

function select(id) {
  selectedId = id;
  renderList();
  renderEditor();
}

// ---- actions ----
$('addTask').onclick = () => {
  // Clear filters so the new task is visible.
  $('search').value = ''; $('priorityFilter').value = ''; $('hideDone').checked = false;
  const t = { id: uid(), title: '', notes: '', priority: 'none', done: false,
    links: [], files: [], created: Date.now(), updated: Date.now() };
  tasks.push(t);
  save();
  select(t.id);
  $('title').focus();
};

$('delete').onclick = async () => {
  const t = current();
  if (!t) return;
  const hasContent = t.title || t.notes || t.links.length || t.files.length;
  if (hasContent && !confirm(`Delete "${t.title || 'Untitled'}"? This also removes its attached files.`)) return;
  await window.api.removeTaskFiles(t.id);
  tasks = tasks.filter((x) => x.id !== t.id);
  selectedId = null;
  save();
  renderList();
  renderEditor();
};

$('title').oninput = (e) => { const t = current(); t.title = e.target.value; touch(t); renderList(); };
$('notes').oninput = (e) => { const t = current(); t.notes = e.target.value; touch(t); };
$('priority').onchange = (e) => { const t = current(); t.priority = e.target.value; touch(t); renderList(); };
$('done').onchange = (e) => { const t = current(); t.done = e.target.checked; touch(t); renderList(); };

for (const id of ['search', 'priorityFilter', 'hideDone']) {
  $(id).addEventListener('input', renderList);
}

$('linkForm').onsubmit = (e) => {
  e.preventDefault();
  const t = current();
  let v = $('linkInput').value.trim();
  if (!v) return;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
  try { new URL(v); } catch { return alert('That does not look like a valid link.'); }
  t.links.push(v);
  $('linkInput').value = '';
  touch(t); renderAttachments(); renderList();
};

function addedFiles(added) {
  const t = current();
  if (!t || !added.length) return;
  t.files.push(...added);
  touch(t); renderAttachments(); renderList();
}

$('addFile').onclick = async () => addedFiles(await window.api.pickFiles(current().id));

const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f));
  addedFiles(await window.api.addPaths(current().id, paths));
});
// Dropping elsewhere shouldn't navigate the window.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Cmd+N for new task, Cmd+F to focus search.
document.addEventListener('keydown', (e) => {
  if (!e.metaKey) return;
  if (e.key === 'n') { e.preventDefault(); $('addTask').click(); }
  if (e.key === 'f') { e.preventDefault(); $('search').focus(); }
});

(async () => {
  tasks = (await window.api.loadTasks()).map((t) => ({
    notes: '', priority: 'none', done: false, links: [], files: [], ...t }));
  renderList();
  renderEditor();
})();
