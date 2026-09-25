const MEMBERS = [
  {
    "id": "sample",
    "name": "GDGoC Chuo",
    "comment": "中大の都心3キャンパスを中心に、デジタル系ものづくりサークルとして活動しています。",
    "github": "gdgoc-chuo",
    "avatar": "./images/default-avatar.png"
  },
  {
    "id": "k3ijay",
    "name": "k3ijay",
    "comment": "犬と猫なら猫の方が好きです。",
    "github": "k3ijay",
    "avatar": "./images/default-avatar.png"
  }
];

const grid = document.getElementById('cardGrid');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render() {
  grid.innerHTML = MEMBERS.map(m => `
        <article class="card">
          <div class="card-header">
            <img class="avatar" src="${escapeHtml(m.avatar)}" alt="${escapeHtml(m.name)}" />
            <div>
              <h2 class="name">${escapeHtml(m.name)}</h2>
            </div>
          </div>
          <p class="comment">${escapeHtml(m.comment)}</p>
          <div class="card-footer">
            <a class="github-link" href="https://github.com/${encodeURIComponent(m.github)}" target="_blank" rel="noopener noreferrer">
              @${escapeHtml(m.github)}
            </a>
            <span style="color:var(--text); font-size:0.75rem; opacity:50%;">${escapeHtml(m.id)}.json</span>
          </div>
        </article>
    `).join('');
}

render();

// theme toggle via long-press
function getCurrentTheme() {
  if (document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function toggleTheme() {
  const current = getCurrentTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
}

let longPressTimer = null;
let startX = 0;
let startY = 0;
let isLongPressTriggered = false;

window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('a, button, input, textarea')) return;

  startX = e.clientX;
  startY = e.clientY;
  isLongPressTriggered = false;

  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    isLongPressTriggered = true;
    toggleTheme();
  }, 600);
});

window.addEventListener('pointermove', (e) => {
  if (!longPressTimer) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (Math.hypot(dx, dy) > 10) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
});

function cancelLongPress() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

window.addEventListener('pointerup', cancelLongPress);
window.addEventListener('pointercancel', cancelLongPress);

window.addEventListener('contextmenu', (e) => {
  if (isLongPressTriggered) {
    e.preventDefault();
    isLongPressTriggered = false;
  }
});