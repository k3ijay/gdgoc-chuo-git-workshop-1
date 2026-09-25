import fs from 'node:fs';
import path from 'node:path';

const CONTENTS_DIR = path.resolve('contents');
const PUBLIC_DIR = path.resolve('public');
const DIST_DIR = path.resolve('dist');
const TEMPLATE_PATH = path.resolve('src/template.html');

// initialize dist directory
fs.rmSync(DIST_DIR, { recursive: true, force: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

// copy public directory contents to dist directory
fs.cpSync(PUBLIC_DIR, DIST_DIR, { recursive: true });

const files = fs.readdirSync(CONTENTS_DIR).filter(f => f.endsWith('.json') && fs.statSync(path.join(CONTENTS_DIR, f)).isFile());
const members = files.map(file => {
  const raw = fs.readFileSync(path.join(CONTENTS_DIR, file), 'utf-8');
  const data = JSON.parse(raw);
  const rawAvatar = data.avatar || '/images/default-avatar.png';
  return {
    id: path.basename(file, '.json'),
    name: data.name,
    comment: data.comment,
    github: data.github,
    avatar: rawAvatar.replace(/^\//, './')
  };
});

// place sample.json first, then sort others by filename
members.sort((a, b) => {
  if (a.id === 'sample') return -1;
  if (b.id === 'sample') return 1;
  return a.id.localeCompare(b.id);
});

const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), template, 'utf-8');

const distJsPath = path.join(DIST_DIR, 'js/main.js');
const js = fs.readFileSync(distJsPath, 'utf-8');
const updatedJs = js.replace(
  /\/\* __MEMBERS_DATA_PLACEHOLDER__ \*\/\s*\[\]/,
  () => JSON.stringify(members, null, 2)
);
fs.writeFileSync(distJsPath, updatedJs, 'utf-8');

console.log(`Built ${members.length} member card(s) into dist/`);
