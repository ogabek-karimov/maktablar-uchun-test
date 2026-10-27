(() => {
  'use strict';

  const SUPPORT_URL = 'https://t.me/Uzswlu_rttm';
  const GENERAL_SIZES = [30, 50, 100];
  const GRADE_HUES = { 3: 250, 4: 275, 5: 305, 6: 335, 7: 10, 8: 150, 9: 180, 10: 205, 11: 228 };
  const LETTERS = ['A', 'B', 'C', 'D'];

  const app = document.getElementById('app');
  let INDEX = null;
  const subjectCache = {};
  let quiz = null;
  let timerId = null;
  let skipNextRoute = false;

  // ---------- yordamchilar ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bilimdon:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bilimdon:' + k, JSON.stringify(v)); } catch (e) { /* xotira yopiq */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const fmtTime = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const plural = (n, w) => `${n} ta ${w}`;

  // Build skripti bilan bir xil normallashtirish.
  const norm = (s) => String(s)
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/[«»"“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:,]+$/g, '')
    .trim();
  const asNumber = (s) => {
    const t = s.replace(/\s+/g, '').replace(',', '.');
    if (/^[-−]?\d+(\.\d+)?$/.test(t)) return parseFloat(t.replace('−', '-'));
    const f = t.match(/^([-−]?\d+)\/(\d+)$/);
    if (f && +f[2] !== 0) return parseFloat(f[1].replace('−', '-')) / +f[2];
    return null;
  };
  function typedIsCorrect(q, typed) {
    let t = norm(typed);
    if (!t) return false;
    const answers = [q.a, ...(q.alt || [])].map(norm);
    if (!answers.some((a) => a.includes('='))) t = t.replace(/^[a-z]\s*=\s*/, '');
    const tn = asNumber(t);
    return answers.some((a) => {
      if (a === t) return true;
      const an = asNumber(a);
      return an !== null && tn !== null && Math.abs(an - tn) < 1e-9;
    });
  }
  const isWritable = (q) => q.a.length <= 40 || (q.alt && q.alt.length > 0);

  function gradeInfo(pct) {
    if (pct >= 86) return { mark: 5, label: "A'lo", cls: 'ok', verdict: 'Ajoyib natija! 🎉' };
    if (pct >= 71) return { mark: 4, label: 'Yaxshi', cls: 'ok', verdict: 'Yaxshi natija! 👍' };
    if (pct >= 56) return { mark: 3, label: 'Qoniqarli', cls: 'mid', verdict: 'Yomon emas — yana mashq qiling 💪' };
    return { mark: 2, label: 'Qoniqarsiz', cls: 'bad', verdict: 'Mavzuni qayta takrorlang 📚' };
  }

  // ---------- natijalar xotirasi ----------
  const resultKey = (g, s, part) => `${g}/${s}/${part}`;
  const getResults = () => store.get('results', {});
  function saveResult(entry) {
    const all = getResults();
    const k = resultKey(entry.g, entry.s, entry.part);
    const prev = all[k] || { best: 0, n: 0 };
    all[k] = { best: Math.max(prev.best, entry.pct), last: entry.pct, n: prev.n + 1, date: entry.date };
    store.set('results', all);
    const hist = store.get('history', []);
    hist.unshift(entry);
    store.set('history', hist.slice(0, 60));
  }
  function scoreBadge(r) {
    if (!r) return '<span class="badge new">Yangi</span>';
    const cls = r.best >= 86 ? 'ok' : r.best >= 56 ? 'mid' : 'bad';
    return `<span class="badge ${cls}" title="Eng yaxshi natija">★ ${r.best}%</span>`;
  }

  // ---------- ma'lumot yuklash ----------
  async function loadIndex() {
    if (INDEX) return INDEX;
    const r = await fetch('data/index.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('index');
    INDEX = await r.json();
    return INDEX;
  }
  async function loadSubject(g, s) {
    const k = `${g}/${s}`;
    if (subjectCache[k]) return subjectCache[k];
    const r = await fetch(`data/${g}/${s}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('subject');
    return (subjectCache[k] = await r.json());
  }
  const findSubjectMeta = (g, s) => (INDEX.grades[g] || []).find((x) => x.id === s);

  // ---------- sahifalar ----------
  function setView(html, title) {
    app.innerHTML = `<div class="fade-in">${html}</div>`;
    document.title = title ? `${title} — Bilimdon` : 'Bilimdon — maktab testlari';
    window.scrollTo({ top: 0 });
  }
  const crumbs = (items) => `<nav class="crumbs">${items.map((it, i) =>
    (i ? '<span class="sep">›</span>' : '') + (it.href ? `<a href="${it.href}">${esc(it.t)}</a>` : `<span>${esc(it.t)}</span>`)).join('')}</nav>`;

  const ALL_GRADES = ['3', '4', '5', '6', '7', '8', '9', '10', '11'];

  function viewHome() {
    const grades = ALL_GRADES.filter((g) => (INDEX.grades[g] || []).length);
    const subjCount = grades.reduce((n, g) => n + INDEX.grades[g].length, 0);
    const cards = ALL_GRADES.map((g) => {
      const subs = INDEX.grades[g] || [];
      const q = subs.reduce((n, s) => n + s.total, 0);
      if (!subs.length) {
        return `<div class="grade-card soon" style="--h:${GRADE_HUES[g] ?? 240}">
          <div><div class="num">${g}</div><div class="lbl">sinf</div></div>
          <div class="sub">⏳ Tez orada</div></div>`;
      }
      return `<a class="grade-card" href="#/sinf/${g}" style="--h:${GRADE_HUES[g] ?? 240}">
        <div><div class="num">${g}</div><div class="lbl">sinf</div></div>
        <div class="sub">${subs.length} fan · ${q} savol</div></a>`;
    }).join('');
    setView(`
      <section class="hero">
        <div class="hero-emoji">🎓</div>
        <h1>Bilimingizni sinab ko'ring!</h1>
        <p>2025–2026 o'quv yili maktab darsliklari asosida tuzilgan testlar. Sinfingizni tanlang, fanni tanlang — va boshladik!</p>
        <div class="hero-stats">
          <span class="chip">🏫 <b>${ALL_GRADES.length}</b> sinf</span>
          <span class="chip">📚 <b>${subjCount}</b> fan</span>
          <span class="chip">❓ <b>${INDEX.questions}</b> savol</span>
        </div>
      </section>
      <h2 class="h2">Sinfingizni tanlang</h2>
      <div class="grade-grid">${cards}</div>
      <div class="features">
        <div class="card feature"><div class="ico">🎯</div><div><h3>Mavzular bo'yicha</h3><p>Har bir mavzuni alohida mustahkamlang — javob darhol tekshiriladi.</p></div></div>
        <div class="card feature"><div class="ico">📝</div><div><h3>Umumiy test</h3><p>Butun darslik bo'yicha: 30, 50, 100 ta yoki hamma savollar. Har safar yangi to'plam.</p></div></div>
        <div class="card feature"><div class="ico">⌨️</div><div><h3>Test yoki yozma</h3><p>Variant tanlang yoki javobni o'zingiz yozing.</p></div></div>
        <div class="card feature"><div class="ico">📊</div><div><h3>Aniq natija</h3><p>Nechta to'g'ri, nechta xato — va har bir xatoning to'g'ri javobi.</p></div></div>
      </div>`);
  }

  function viewGrade(g) {
    const subs = INDEX.grades[g];
    if (!subs) return viewNotFound();
    const results = getResults();
    const cards = subs.map((s) => {
      const r = results[resultKey(g, s.id, 'umumiy')];
      const best = r ? r.best : 0;
      return `<a class="card subject-card" href="#/sinf/${g}/${s.id}" style="--c:${s.color}">
        <div class="subject-top">
          <div class="s-icon">${s.icon}</div>
          <div><h3>${esc(s.name)}</h3><div class="meta">${s.topics.length} mavzu · ${s.total} savol</div></div>
        </div>
        <div><div class="progress-line"><span>Umumiy test</span><span>${r ? 'eng yaxshi: ' + best + '%' : 'hali ishlanmagan'}</span></div>
        <div class="bar"><i style="width:${best}%"></i></div></div>
      </a>`;
    }).join('');
    setView(`
      ${crumbs([{ t: 'Bosh sahifa', href: '#/' }, { t: `${g}-sinf` }])}
      <h1 class="h1">${g}-sinf</h1>
      <p class="lead">Qaysi fandan bilimingizni sinamoqchisiz?</p>
      <div class="subject-grid">${cards}</div>`, `${g}-sinf`);
  }

  async function viewSubject(g, s) {
    const meta = findSubjectMeta(g, s);
    if (!meta) return viewNotFound();
    const mode = store.get('mode', 'test');
    const results = getResults();
    const gen = results[resultKey(g, s, 'umumiy')];
    const topics = meta.topics.map((t, i) => `
      <a class="card topic" href="#/test/${g}/${s}/${i}/${mode}" data-part="${i}">
        <div class="n">${i + 1}</div>
        <div><div class="t">${esc(t.name)}</div><div class="m">${plural(t.count, 'savol')} · mustahkamlash</div></div>
        ${scoreBadge(results[resultKey(g, s, i)])}
      </a>`).join('');
    setView(`
      ${crumbs([{ t: 'Bosh sahifa', href: '#/' }, { t: `${g}-sinf`, href: `#/sinf/${g}` }, { t: meta.name }])}
      <div class="subject-head" style="--c:${meta.color}">
        <div class="s-icon">${meta.icon}</div>
        <div><h1 class="h1">${esc(meta.name)}</h1><div class="book">📘 ${esc(meta.book)}</div></div>
      </div>
      <div class="mode-switch" role="group" aria-label="Javob berish usuli">
        <button type="button" data-mode="test" aria-pressed="${mode === 'test'}">🔘 Test (variantli)</button>
        <button type="button" data-mode="yozma" aria-pressed="${mode === 'yozma'}">⌨️ Javobni yozaman</button>
      </div>
      <p class="mode-hint">${mode === 'test' ? "To'rtta variantdan bittasini tanlaysiz." : "Javobni o'zingiz yozasiz. Uzun javobli savollarda variant tanlanadi."}</p>
      <div class="big-test" style="--c:${meta.color}">
        <div>
          <h2>📝 Umumiy test — butun darslik bo'yicha</h2>
          <p>Barcha ${meta.topics.length} ta mavzudan aralash savollar (jami ${meta.total} ta). Nechta savol ishlashni tanlang:</p>
          ${gen ? `<span class="best">★ Eng yaxshi natija: ${gen.best}% · ${gen.n} marta ishlangan</span>` : ''}
        </div>
        <div class="size-pick">
          ${GENERAL_SIZES.filter((n) => n < meta.total).map((n) => `<a class="btn" href="#/test/${g}/${s}/umumiy/${mode}/${n}">${n} ta</a>`).join('')}
          <a class="btn" href="#/test/${g}/${s}/umumiy/${mode}/all">Hammasi (${meta.total})</a>
        </div>
      </div>
      <h2 class="h2">Mavzular bo'yicha mustahkamlash</h2>
      <div class="topic-list" style="--c:${meta.color}">${topics}</div>`, `${meta.name} — ${g}-sinf`);
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      store.set('mode', b.dataset.mode);
      viewSubject(g, s);
    }));
  }

  function viewHistory() {
    const hist = store.get('history', []);
    const rows = hist.map((h) => {
      const gi = gradeInfo(h.pct);
      const meta = findSubjectMeta(h.g, h.s);
      return `<a class="card hist" href="#/sinf/${h.g}/${h.s}" style="--c:${meta ? meta.color : 'var(--primary)'}">
        <div class="s-icon">${meta ? meta.icon : '📘'}</div>
        <div><div class="t">${esc(h.g + '-sinf · ' + (meta ? meta.name : h.s))}</div>
        <div class="m">${esc(h.partName)} · ${h.ok}/${h.total} to'g'ri · ${h.mode === 'yozma' ? 'yozma' : 'test'} · ${new Date(h.date).toLocaleDateString('uz-UZ')}</div></div>
        <span class="badge ${gi.cls}">${h.pct}%</span></a>`;
    }).join('');
    setView(`
      ${crumbs([{ t: 'Bosh sahifa', href: '#/' }, { t: 'Natijalarim' }])}
      <h1 class="h1">Natijalarim</h1>
      <p class="lead">Oxirgi ishlangan testlaringiz (faqat shu qurilmada saqlanadi).</p>
      ${rows ? `<div class="history">${rows}</div>` : `<div class="card empty"><div class="big">🗂️</div><p>Hali birorta test ishlanmagan.</p><a class="btn btn-primary" href="#/">Testni boshlash</a></div>`}`, 'Natijalarim');
  }

  function viewNotFound() {
    setView(`<div class="card empty"><div class="big">🤔</div><p>Bunday sahifa topilmadi.</p><a class="btn btn-primary" href="#/">Bosh sahifaga</a></div>`);
  }

  // ---------- test ----------
  function makeItem(q, topicIdx, mode) {
    const opts = shuffle([q.a, ...q.w]);
    return { q, topicIdx, opts, ci: opts.indexOf(q.a), text: mode === 'yozma' && isWritable(q), chosen: null, typed: '', status: null };
  }

  // Butun darslik bo'yicha: har bir mavzudan navbat bilan olinadi, shunda hamma mavzu qamraladi.
  function pickGeneral(subj, size) {
    const pools = subj.topics.map((t, i) => shuffle(t.q.map((q) => [q, i])));
    const all = pools.reduce((n, p) => n + p.length, 0);
    const total = size === 'all' ? all : Math.min(+size || GENERAL_SIZES[0], all);
    const out = [];
    for (let k = 0; out.length < total; k = (k + 1) % pools.length) {
      if (pools[k].length) out.push(pools[k].pop());
    }
    return shuffle(out);
  }

  async function startQuiz(g, s, part, mode, size) {
    const meta = findSubjectMeta(g, s);
    if (!meta) return viewNotFound();
    app.innerHTML = '<div class="loading"><span class="spinner"></span> Savollar tayyorlanmoqda…</div>';
    const subj = await loadSubject(g, s);
    mode = mode === 'yozma' ? 'yozma' : 'test';
    let pairs, partName, practice;
    if (part === 'umumiy') {
      pairs = pickGeneral(subj, size);
      partName = `Umumiy test (${pairs.length} savol)`;
      practice = false;
    } else {
      const t = subj.topics[+part];
      if (!t) return viewNotFound();
      pairs = shuffle(t.q.map((q) => [q, +part]));
      partName = t.name;
      practice = true;
    }
    if (mode === 'yozma') {
      // Yozma rejimda yoziladigan savollar oldinroq tursin.
      pairs.sort((a, b) => isWritable(b[0]) - isWritable(a[0]));
    }
    beginQuiz({ g, s, part, size, partName, mode, practice, retry: false, subj, items: pairs.map(([q, i]) => makeItem(q, i, mode)) });
  }

  function beginQuiz(cfg) {
    quiz = { ...cfg, cur: 0, done: false, started: Date.now(), elapsed: 0, hash: location.hash };
    stopTimer();
    timerId = setInterval(() => {
      if (!quiz || quiz.done) return stopTimer();
      quiz.elapsed = Math.round((Date.now() - quiz.started) / 1000);
      const el = document.getElementById('timer');
      if (el) el.textContent = fmtTime(quiz.elapsed);
    }, 1000);
    renderQuiz();
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  const answeredCount = () => quiz.items.filter((it) => it.status).length;

  function renderQuiz(focusInput = true) {
    const { items, cur, practice, subj } = quiz;
    const it = items[cur];
    const n = items.length;
    const done = answeredCount();
    const reveal = practice && it.status;
    let body;
    if (it.text) {
      const cls = reveal ? it.status : '';
      body = `<form class="write-row" id="wform" autocomplete="off">
        <input id="winput" class="${cls}" type="text" inputmode="text" placeholder="Javobingizni yozing…" value="${esc(it.typed)}" ${reveal ? 'disabled' : ''} aria-label="Javob">
        ${reveal ? '' : `<button class="btn btn-primary" type="submit">${practice ? 'Tekshirish' : 'Saqlash'}</button>`}
      </form>
      ${!practice && it.status ? `<p class="write-note">✓ Javob saqlandi. O'zgartirish uchun qayta yozing.</p>` : ''}`;
    } else {
      body = `<div class="options">${it.opts.map((o, i) => {
        let cls = '';
        let mark = '';
        if (reveal) {
          if (i === it.ci) { cls = 'ok'; mark = '✅'; }
          else if (i === it.chosen) { cls = 'bad'; mark = '❌'; }
        } else if (i === it.chosen) cls = 'sel';
        return `<button type="button" class="opt ${cls}" data-i="${i}" ${reveal ? 'disabled' : ''}>
          <span class="L">${LETTERS[i]}</span><span>${esc(o)}</span><span class="mark">${mark}</span></button>`;
      }).join('')}</div>
      ${quiz.mode === 'yozma' ? `<p class="write-note">Bu savolning javobi uzun — variantlardan birini tanlang.</p>` : ''}`;
    }
    let feedback = '';
    if (reveal) {
      feedback = it.status === 'ok'
        ? `<div class="feedback ok"><span>🎉</span><div class="fb-body"><div class="fb-title" style="color:var(--ok)">To'g'ri!</div>${it.q.e ? `<div class="explain">${esc(it.q.e)}</div>` : ''}</div></div>`
        : `<div class="feedback bad"><span>💡</span><div class="fb-body"><div class="fb-title" style="color:var(--bad)">Xato.</div>To'g'ri javob: <b style="color:var(--ok)">${esc(it.q.a)}</b>${it.q.e ? `<div class="explain">${esc(it.q.e)}</div>` : ''}</div></div>`;
    }
    const dots = items.map((x, i) => {
      let c = '';
      if (x.status) c = practice ? x.status : 'answered';
      return `<button type="button" class="dot ${c} ${i === cur ? 'cur' : ''}" data-go="${i}" aria-label="${i + 1}-savol">${i + 1}</button>`;
    }).join('');
    const isLast = cur === n - 1;
    const nextLabel = isLast ? 'Yakunlash ✓' : 'Keyingi →';
    const nextEnabled = practice ? !!it.status || !isLast : true;

    app.innerHTML = `<div class="quiz">
      <div class="quiz-top">
        <div class="quiz-title">${subj.icon} ${esc(quiz.g + '-sinf · ' + subj.name + ' · ' + quiz.partName)}</div>
        <div class="timer">⏱ <span id="timer">${fmtTime(quiz.elapsed)}</span></div>
      </div>
      <div class="qprogress"><i style="width:${(done / n) * 100}%"></i></div>
      <div class="dots">${dots}</div>
      <div class="card qcard">
        <div class="qnum">Savol ${cur + 1} / ${n}${quiz.subj.topics[it.topicIdx] && quiz.part === 'umumiy' ? ` · <span style="font-weight:600">${esc(quiz.subj.topics[it.topicIdx].name)}</span>` : ''}</div>
        <p class="qtext">${esc(it.q.q)}</p>
        ${body}
        ${feedback}
      </div>
      <div class="quiz-actions">
        <button type="button" class="btn btn-ghost" id="prevBtn" ${cur === 0 ? 'disabled style="visibility:hidden"' : ''}>← Oldingi</button>
        <div class="right">
          ${!isLast ? `<button type="button" class="btn btn-ghost" id="finishBtn">Yakunlash</button>` : ''}
          <button type="button" class="btn btn-primary" id="nextBtn" ${nextEnabled ? '' : 'disabled'}>${nextLabel}</button>
        </div>
      </div>
      <div class="kbd-hint"><span class="kbd">1</span>–<span class="kbd">4</span> variant tanlash · <span class="kbd">Enter</span> keyingi · <span class="kbd">←</span> <span class="kbd">→</span> savollar</div>
    </div>`;

    app.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => choose(+b.dataset.i)));
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
    document.getElementById('prevBtn').addEventListener('click', () => go(quiz.cur - 1));
    document.getElementById('nextBtn').addEventListener('click', next);
    const fb = document.getElementById('finishBtn');
    if (fb) fb.addEventListener('click', finish);
    const form = document.getElementById('wform');
    if (form) {
      form.addEventListener('submit', (e) => { e.preventDefault(); submitTyped(document.getElementById('winput').value); });
      const inp = document.getElementById('winput');
      if (focusInput && !inp.disabled && window.matchMedia('(pointer:fine)').matches) inp.focus();
    }
  }

  function choose(i) {
    const it = quiz.items[quiz.cur];
    if (quiz.practice && it.status) return;
    it.chosen = i;
    it.status = i === it.ci ? 'ok' : 'bad';
    renderQuiz();
    if (!quiz.practice && quiz.cur < quiz.items.length - 1) {
      const at = quiz.cur;
      setTimeout(() => { if (quiz && !quiz.done && quiz.cur === at) go(at + 1); }, 320);
    }
  }

  function submitTyped(val) {
    const it = quiz.items[quiz.cur];
    if (quiz.practice && it.status) return next();
    if (!val.trim()) return;
    it.typed = val.trim();
    it.status = typedIsCorrect(it.q, it.typed) ? 'ok' : 'bad';
    if (!quiz.practice && quiz.cur < quiz.items.length - 1) return go(quiz.cur + 1);
    renderQuiz();
  }

  function go(i) {
    if (!quiz || i < 0 || i >= quiz.items.length) return;
    quiz.cur = i;
    renderQuiz();
  }

  function next() {
    const it = quiz.items[quiz.cur];
    if (it.text && !it.status) {
      const v = document.getElementById('winput');
      if (v && v.value.trim()) return submitTyped(v.value);
    }
    if (quiz.cur < quiz.items.length - 1) return go(quiz.cur + 1);
    finish();
  }

  function finish() {
    const left = quiz.items.length - answeredCount();
    if (left > 0 && !confirm(`${left} ta savolga javob berilmagan. Testni yakunlaysizmi?`)) return;
    quiz.done = true;
    quiz.elapsed = Math.round((Date.now() - quiz.started) / 1000);
    stopTimer();
    const ok = quiz.items.filter((x) => x.status === 'ok').length;
    const bad = quiz.items.filter((x) => x.status === 'bad').length;
    const total = quiz.items.length;
    const pct = Math.round((ok / total) * 100);
    quiz.summary = { ok, bad, skip: total - ok - bad, total, pct };
    if (!quiz.retry) {
      saveResult({ g: quiz.g, s: quiz.s, part: quiz.part, partName: quiz.partName, mode: quiz.mode, ok, bad, total, pct, time: quiz.elapsed, date: Date.now() });
    }
    renderResults('all');
    if (pct >= 86) confetti();
  }

  // Xato haqida xabar: savol ma'lumotlari nusxalanadi va texnik yordam Telegram chati ochiladi.
  function reportText(it) {
    const topic = quiz.subj.topics[it.topicIdx]?.name || '';
    return `⚑ Savolda xato\nSinf: ${quiz.g}-sinf\nFan: ${quiz.subj.name}\nMavzu: ${topic}\nSavol: ${it.q.q}\nSaytdagi to'g'ri javob: ${it.q.a}\nXato nimada: `;
  }
  async function reportIssue(it) {
    const text = reportText(it);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* clipboard yopiq */ }
    if (!copied) window.prompt("Quyidagi matnni nusxalab, texnik yordamga yuboring:", text);
    else toast("📋 Savol ma'lumoti nusxalandi. Telegram'da xabarga joylab (paste), xato nimadaligini yozing.");
    window.open(SUPPORT_URL, '_blank', 'noopener');
  }
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 5000);
  }

  function renderResults(filter) {
    const { ok, bad, skip, total, pct } = quiz.summary;
    const gi = gradeInfo(pct);
    const R = 70;
    const C = 2 * Math.PI * R;
    const color = gi.cls === 'ok' ? 'var(--ok)' : gi.cls === 'mid' ? 'var(--warn)' : 'var(--bad)';
    const list = quiz.items.map((it, i) => ({ it, i })).filter(({ it }) =>
      filter === 'all' ? true : filter === 'bad' ? it.status !== 'ok' : it.status === 'ok');
    const yourAnswer = (it) => {
      if (!it.status) return '<i>javob berilmagan</i>';
      return esc(it.text ? it.typed : it.opts[it.chosen]);
    };
    const review = list.map(({ it, i }) => {
      const st = it.status || 'skip';
      return `<div class="card rv ${st}">
        <p class="rv-q"><span class="no">${i + 1}.</span>${esc(it.q.q)}</p>
        ${st === 'ok'
          ? `<div class="rv-line ok"><span class="k">Javobingiz:</span> <b>${yourAnswer(it)}</b> ✅</div>`
          : `<div class="rv-line ${st === 'bad' ? 'bad' : ''}"><span class="k">Javobingiz:</span> <b>${yourAnswer(it)}</b> ${st === 'bad' ? '❌' : ''}</div>
             <div class="rv-line ok"><span class="k">To'g'ri javob:</span> <b>${esc(it.q.a)}</b></div>`}
        ${it.q.e ? `<div class="explain">💡 ${esc(it.q.e)}</div>` : ''}
        <div class="rv-foot"><button type="button" class="report" data-report="${i}">⚑ Xato haqida xabar berish</button></div>
      </div>`;
    }).join('') || `<div class="card empty"><p>Bu bo'limda savol yo'q.</p></div>`;

    const subjHref = `#/sinf/${quiz.g}/${quiz.s}`;
    app.innerHTML = `<div class="quiz fade-in">
      ${crumbs([{ t: `${quiz.g}-sinf`, href: `#/sinf/${quiz.g}` }, { t: quiz.subj.name, href: subjHref }, { t: quiz.partName }])}
      <div class="card result-hero">
        <div class="ring">
          <svg width="168" height="168" viewBox="0 0 168 168">
            <circle cx="84" cy="84" r="${R}" fill="none" stroke="var(--bg-2)" stroke-width="16"/>
            <circle id="ringArc" cx="84" cy="84" r="${R}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"
              stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
          </svg>
          <div class="val"><div><div class="pct">${pct}%</div><div class="cap">to'g'ri javoblar</div></div></div>
        </div>
        <div>
          <p class="verdict">${gi.verdict}</p>
          <span class="grade-badge badge ${gi.cls}">Baho: ${gi.mark} — ${gi.label}</span>
          <div class="stats">
            <div class="stat ok"><b>${ok}</b><span>✅ To'g'ri</span></div>
            <div class="stat bad"><b>${bad}</b><span>❌ Xato</span></div>
            <div class="stat"><b>${skip}</b><span>⏭ Javobsiz</span></div>
            <div class="stat"><b>${fmtTime(quiz.elapsed)}</b><span>⏱ Vaqt</span></div>
          </div>
        </div>
      </div>
      <div class="result-actions">
        ${ok < total ? `<button class="btn btn-primary" id="retryWrong">🔁 Xatolar ustida ishlash (${total - ok})</button>` : ''}
        <button class="btn btn-ghost" id="again">↻ Qayta ishlash</button>
        <a class="btn btn-ghost" href="${subjHref}">📚 Boshqa mavzu</a>
      </div>
      <h2 class="h2">Javoblar tahlili</h2>
      <div class="filters" role="group">
        <button type="button" data-f="all" aria-pressed="${filter === 'all'}">Hammasi (${total})</button>
        <button type="button" data-f="bad" aria-pressed="${filter === 'bad'}">Xatolar (${total - ok})</button>
        <button type="button" data-f="ok" aria-pressed="${filter === 'ok'}">To'g'rilar (${ok})</button>
      </div>
      <div class="review">${review}</div>
    </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const arc = document.getElementById('ringArc');
      if (arc) arc.style.strokeDashoffset = String(C * (1 - pct / 100));
    }));
    app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => renderResults(b.dataset.f)));
    app.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => reportIssue(quiz.items[+b.dataset.report])));
    document.getElementById('again').addEventListener('click', () => {
      if (quiz.retry) {
        const items = shuffle(quiz.items.map((x) => makeItem(x.q, x.topicIdx, quiz.mode)));
        beginQuiz({ ...quiz, items });
      } else startQuiz(quiz.g, quiz.s, quiz.part, quiz.mode, quiz.size);
      window.scrollTo({ top: 0 });
    });
    const rw = document.getElementById('retryWrong');
    if (rw) rw.addEventListener('click', () => {
      const items = shuffle(quiz.items.filter((x) => x.status !== 'ok').map((x) => makeItem(x.q, x.topicIdx, quiz.mode)));
      beginQuiz({ ...quiz, items, practice: true, retry: true, partName: 'Xatolar ustida ishlash' });
      window.scrollTo({ top: 0 });
    });
    if (filter === 'all') window.scrollTo({ top: 0 });
  }

  function confetti() {
    const box = document.getElementById('confetti');
    const colors = ['#4f46e5', '#7c3aed', '#db2777', '#f59e0b', '#16a34a', '#0ea5e9'];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      p.style.setProperty('--rot', (Math.random() * 900 - 450) + 'deg');
      p.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
      p.style.animationDelay = Math.random() * 0.4 + 's';
      box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ''; }, 4200);
  }

  // ---------- klaviatura ----------
  document.addEventListener('keydown', (e) => {
    if (!quiz || quiz.done || !location.hash.startsWith('#/test/')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const inInput = e.target && e.target.tagName === 'INPUT';
    const it = quiz.items[quiz.cur];
    if (!inInput && !it.text) {
      const k = e.key.toLowerCase();
      const idx = ['1', '2', '3', '4'].indexOf(k) >= 0 ? +k - 1 : ['a', 'b', 'c', 'd'].indexOf(k);
      if (idx >= 0 && idx < it.opts.length) { e.preventDefault(); return choose(idx); }
      if (e.key === 'Enter') { e.preventDefault(); return next(); }
    }
    if (inInput && e.key === 'Enter') return; // forma o'zi ishlaydi
    if (!inInput && e.key === 'ArrowRight') go(quiz.cur + 1);
    if (!inInput && e.key === 'ArrowLeft') go(quiz.cur - 1);
    if (!inInput && e.key === 'Enter' && it.text && it.status && quiz.practice) next();
  });

  // ---------- marshrutlash ----------
  async function route() {
    if (skipNextRoute) { skipNextRoute = false; return; }
    if (quiz && !quiz.done && location.hash !== quiz.hash && answeredCount() > 0) {
      if (!confirm('Test hali tugamagan. Chiqib ketsangiz, javoblaringiz saqlanmaydi. Chiqasizmi?')) {
        skipNextRoute = true;
        location.hash = quiz.hash;
        return;
      }
    }
    if (quiz && location.hash !== quiz.hash) { stopTimer(); quiz = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    try {
      await loadIndex();
      if (!parts.length) return viewHome();
      if (parts[0] === 'natijalar') return viewHistory();
      if (parts[0] === 'sinf' && parts[1]) return parts[2] ? viewSubject(parts[1], parts[2]) : viewGrade(parts[1]);
      if (parts[0] === 'test' && parts.length >= 4) return startQuiz(parts[1], parts[2], parts[3], parts[4], parts[5]);
      viewNotFound();
    } catch (err) {
      console.error(err);
      app.innerHTML = `<div class="card empty"><div class="big">📡</div><p>Ma'lumotlarni yuklab bo'lmadi. Internetni tekshirib, sahifani yangilang.</p>
        <button class="btn btn-primary" onclick="location.reload()">Yangilash</button></div>`;
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => {
    if (quiz && !quiz.done && answeredCount() > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  document.getElementById('themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('bilimdon:theme', root.dataset.theme); } catch (e) { /* */ }
  });

  route();
})();
