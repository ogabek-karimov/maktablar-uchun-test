// content/<sinf>/<fan>.txt fayllarini o'qib, tekshiradi va _site/ papkasiga
// tayyor saytni (index.html, assets, data/*.json) yig'adi.
//
// Ishlatish:  node scripts/build.mjs          -> _site/ ni yig'adi
//             node scripts/build.mjs --check  -> faqat tekshiradi
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, '_site');
const CHECK_ONLY = process.argv.includes('--check');

// Fanlar: id -> ko'rinish. Tartib saytdagi tartibni belgilaydi.
const SUBJECTS = {
  matematika: { name: 'Matematika', icon: '🔢', color: '#4f46e5' },
  algebra: { name: 'Algebra', icon: '➗', color: '#4f46e5' },
  geometriya: { name: 'Geometriya', icon: '📐', color: '#0891b2' },
  'ona-tili': { name: 'Ona tili', icon: '✍️', color: '#db2777' },
  adabiyot: { name: 'Adabiyot', icon: '📖', color: '#9333ea' },
  'ingliz-tili': { name: 'Ingliz tili', icon: '🇬🇧', color: '#2563eb' },
  'tabiiy-fanlar': { name: 'Tabiiy fanlar', icon: '🌿', color: '#16a34a' },
  biologiya: { name: 'Biologiya', icon: '🧬', color: '#16a34a' },
  fizika: { name: 'Fizika', icon: '⚛️', color: '#ea580c' },
  kimyo: { name: 'Kimyo', icon: '🧪', color: '#0d9488' },
};

const MIN_PER_TOPIC = 30;
const MIN_PER_SUBJECT = 30;

// O'zbek lotin yozuvida: o' g' -> oʻ gʻ, boshqa harflar orasidagi ' -> ʼ (tutuq belgisi).
// f'(x) kabi matematik belgilarga tegmaydi (keyingi belgi harf bo'lishi shart).
function uzApostrophes(s) {
  return s
    .replace(/([oOgG])['‘’`ʼ]([a-zA-Z])/g, '$1ʻ$2')
    .replace(/([a-zA-Z])['’`]([a-zA-Z])/g, '$1ʼ$2');
}

// Javoblarni solishtirish uchun normallashtirish (sayt ham xuddi shu qoidani ishlatadi).
function norm(s) {
  return s
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/[«»"“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:,]+$/g, '')
    .trim();
}

function parseFile(file, grade, subjectId) {
  const errors = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const meta = {};
  const topics = [];
  let topic = null;
  let q = null;
  const where = (i) => `${path.relative(ROOT, file)}:${i + 1}`;

  const finishQ = () => {
    if (!q) return;
    if (!q.a) errors.push(`${q.at}: to'g'ri javob (+) yo'q`);
    if (q.w.length !== 3) errors.push(`${q.at}: 3 ta xato variant (-) bo'lishi kerak, ${q.w.length} ta bor`);
    // Katta-kichik harf farqi saqlanadi: imloga oid savollarda variantlar faqat shu bilan farq qilishi mumkin.
    const all = [q.a, ...q.w].filter(Boolean).map((x) => x.replace(/[ʻʼ‘’`´']/g, "'").replace(/\s+/g, ' ').trim());
    if (new Set(all).size !== all.length) errors.push(`${q.at}: variantlar takrorlangan`);
    topic.q.push(q);
    q = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const m = line.match(/^(fan|nom|kitob):\s*(.+)$/);
    if (m && !topics.length) { meta[m[1]] = m[2]; return; }
    if (line.startsWith('## ')) {
      finishQ();
      topic = { name: line.slice(3).trim(), q: [] };
      topics.push(topic);
      return;
    }
    const tag = line[0];
    const val = line.slice(1).trim().replace(/\\n/g, '\n');
    if (!'?+-=!'.includes(tag) || line[1] !== ' ') {
      errors.push(`${where(i)}: tushunarsiz qator: ${line.slice(0, 60)}`);
      return;
    }
    if (tag === '?') {
      if (!topic) { errors.push(`${where(i)}: savol mavzudan (##) oldin kelgan`); return; }
      finishQ();
      q = { q: val, a: '', w: [], alt: [], e: '', at: where(i) };
      return;
    }
    if (!q) { errors.push(`${where(i)}: '${tag}' qatori savolsiz`); return; }
    if (tag === '+') { if (q.a) errors.push(`${where(i)}: ikkinchi to'g'ri javob`); q.a = val; }
    else if (tag === '-') q.w.push(val);
    else if (tag === '=') q.alt.push(...val.split('|').map((s) => s.trim()).filter(Boolean));
    else if (tag === '!') q.e = val;
  });
  finishQ();

  if (meta.fan !== subjectId) errors.push(`${path.relative(ROOT, file)}: 'fan: ${subjectId}' bo'lishi kerak`);
  if (!meta.kitob) errors.push(`${path.relative(ROOT, file)}: 'kitob:' qatori yo'q`);

  const seen = new Map();
  let total = 0;
  for (const t of topics) {
    if (t.q.length < MIN_PER_TOPIC) errors.push(`${path.relative(ROOT, file)}: «${t.name}» mavzusida ${t.q.length} ta savol (kamida ${MIN_PER_TOPIC})`);
    for (const x of t.q) {
      const k = norm(x.q) + '|' + norm(x.a);
      if (seen.has(k)) errors.push(`${x.at}: savol takrorlangan (${seen.get(k)})`);
      seen.set(k, x.at);
      total++;
    }
  }
  if (total < MIN_PER_SUBJECT) errors.push(`${path.relative(ROOT, file)}: jami ${total} ta savol (kamida ${MIN_PER_SUBJECT})`);

  const english = subjectId === 'ingliz-tili';
  const fix = (s) => (english ? s : uzApostrophes(s));
  const base = SUBJECTS[subjectId];
  const data = {
    grade,
    id: subjectId,
    name: meta.nom || base?.name || subjectId,
    icon: base?.icon,
    color: base?.color,
    book: meta.kitob,
    topics: topics.map((t) => ({
      name: fix(t.name),
      q: t.q.map((x) => {
        const o = { q: fix(x.q), a: fix(x.a), w: x.w.map(fix) };
        if (x.alt.length) o.alt = x.alt;
        if (x.e) o.e = fix(x.e);
        return o;
      }),
    })),
  };
  return { data, errors };
}

function main() {
  const errors = [];
  const index = { generated: new Date().toISOString().slice(0, 10), grades: {} };
  const files = [];
  let questionCount = 0;

  const grades = fs.readdirSync(CONTENT).filter((d) => /^\d+$/.test(d)).sort((a, b) => a - b);
  for (const g of grades) {
    const dir = path.join(CONTENT, g);
    const subs = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4));
    subs.sort((a, b) => Object.keys(SUBJECTS).indexOf(a) - Object.keys(SUBJECTS).indexOf(b));
    index.grades[g] = [];
    for (const s of subs) {
      if (!SUBJECTS[s]) { errors.push(`content/${g}/${s}.txt: noma'lum fan`); continue; }
      const { data, errors: errs } = parseFile(path.join(dir, `${s}.txt`), Number(g), s);
      errors.push(...errs);
      const total = data.topics.reduce((n, t) => n + t.q.length, 0);
      questionCount += total;
      index.grades[g].push({
        id: s, name: data.name, icon: data.icon, color: data.color, book: data.book, total,
        topics: data.topics.map((t) => ({ name: t.name, count: t.q.length })),
      });
      files.push([`data/${g}/${s}.json`, data]);
    }
  }

  if (errors.length) {
    console.error(`\n❌ ${errors.length} ta xato topildi:\n` + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`✅ ${grades.length} ta sinf, ${files.length} ta fan, ${questionCount} ta savol — xato yo'q.`);
  if (CHECK_ONLY) return;

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
  fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  index.questions = questionCount;
  for (const [rel, data] of [['data/index.json', index], ...files]) {
    const p = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data));
  }
  console.log(`📦 _site/ tayyor.`);
}

main();
