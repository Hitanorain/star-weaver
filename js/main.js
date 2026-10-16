// 界面流程：标题 → 四季星图 → 关卡 → 游戏；存档；主循环
(function () {
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g = cv.getContext('2d');
  const CH = window.CHAPTERS, Board = window.Board, Sky = window.Sky, A = window.Audio2;
  const ALL = new URLSearchParams(location.search).has('all');

  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/></svg>',
    restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>',
    hint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/><path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
  };
  // 四种玩法的小图
  const MECH = {
    line: `<svg viewBox="0 0 160 90"><path d="M24 64L62 26L100 58" fill="none" stroke="#ffd98a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M100 58L138 24" stroke="#ffe2b0" stroke-opacity=".5" stroke-dasharray="3 6"/>${['24,64', '62,26', '100,58', '138,24'].map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="4.5" fill="#fff"/>`).join('')}</svg>`,
    double: `<svg viewBox="0 0 160 90"><path d="M34 42L126 42" stroke="#ffd98a" stroke-width="2" transform="translate(0,-4)"/><path d="M34 46L126 46" stroke="#ffe2b0" stroke-opacity=".5" stroke-dasharray="3 6" transform="translate(0,4)"/><circle cx="30" cy="45" r="5" fill="#fff"/><circle cx="130" cy="45" r="5" fill="#fff"/></svg>`,
    arrow: `<svg viewBox="0 0 160 90"><path d="M32 45L128 45" stroke="#ffe2b0" stroke-opacity=".35" stroke-dasharray="3 6"/>${[52, 72, 92, 112].map(x => `<path d="M${x - 5} 39L${x} 45L${x - 5} 51" fill="none" stroke="#ffe2b0" stroke-width="2" stroke-linecap="round"/>`).join('')}<circle cx="28" cy="45" r="5" fill="#fff"/><circle cx="132" cy="45" r="5" fill="#fff"/></svg>`,
    portal: `<svg viewBox="0 0 160 90"><circle cx="40" cy="45" r="14" fill="none" stroke="#7fe8ff" stroke-width="2" stroke-dasharray="2 5"/><circle cx="120" cy="45" r="14" fill="none" stroke="#7fe8ff" stroke-width="2" stroke-dasharray="2 5"/><circle cx="40" cy="45" r="4.5" fill="#fff"/><circle cx="120" cy="45" r="4.5" fill="#fff"/><path d="M52 34Q80 12 108 34" fill="none" stroke="#7fe8ff" stroke-opacity=".6" stroke-dasharray="1 5" stroke-width="2" stroke-linecap="round"/></svg>`,
  };
  const SEASON_COLOR = { spring: '#ffb8d8', summer: '#9fe3ff', autumn: '#ffc48a', winter: '#d4eeff' };

  // —— 存档 ——
  const SAVE_KEY = 'starweaver.v1';
  let save = { done: {}, seen: {}, sound: true };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

  const doneCount = ch => ch.levels.filter(l => save.done[l.id]).length;
  const chapterOpen = ci => ALL || ci === 0 || doneCount(CH[ci - 1]) >= 6;
  const levelOpen = (ci, li) => chapterOpen(ci) && (ALL || li === 0 || !!save.done[CH[ci].levels[li - 1].id] || !!save.done[CH[ci].levels[li].id]);

  // —— 画布尺寸 ——
  let W = 0, H = 0, DPR = 1;
  function resize() {
    W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
    cv.width = W * DPR; cv.height = H * DPR;
    Sky.resize(W, H, DPR);
    layoutBoard();
  }
  function layoutBoard() {
    if (screen === 'title') {
      const top = document.querySelector('.logo').getBoundingClientRect().top;
      const w = Math.min(W * 0.84, 620);
      Board.layout({ x: (W - w) / 2, y: 50, w, h: Math.max(100, top - 70) });
    } else {
      const tip = $('pl-tip').getBoundingClientRect(), tools = document.querySelector('.tools').getBoundingClientRect();
      const winOn = $('win').classList.contains('on');
      const top = Math.max(tip.bottom, 90) + 8, bottom = winOn ? $('win').querySelector('.card').getBoundingClientRect().top - 44 : tools.top - 34;
      const side = W < 600 ? 10 : 40;
      Board.layout({ x: side, y: top, w: W - side * 2, h: Math.max(120, bottom - top) });
    }
  }

  // —— 屏幕 ——
  let screen = 'title', chapter = 0, level = 0, boardAlpha = 0, boardTarget = 0;
  function show(name) {
    screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
    boardTarget = name === 'play' ? 1 : name === 'title' ? 0.7 : 0;
    if (name === 'title') { Sky.set('title'); A.setKey('title'); startDemo(); }
    if (name === 'seasons') { renderSeasons(); Sky.set('title'); A.setKey('title'); }
    if (name === 'levels') { renderLevels(); Sky.set(CH[chapter].id); A.setKey(CH[chapter].id); }
    layoutBoard();
  }

  // 标题：随机挑星座自动连线
  let demoPool = [];
  function startDemo() {
    if (!demoPool.length) demoPool = CH.flatMap(c => c.levels.filter(l => !l.portals)).sort(() => Math.random() - 0.5);
    Board.load(demoPool.pop(), { demo: true, accent: Sky.THEMES.title.accent });
    Board.alpha = 0;
    layoutBoard();
  }
  Board.on.demoDone = () => setTimeout(() => { if (screen === 'title') { boardTarget = 0; setTimeout(() => { if (screen === 'title') { startDemo(); boardTarget = 0.7; } }, 1200); } }, 2600);

  function renderSeasons() {
    const box = $('seasons');
    box.innerHTML = CH.map((c, ci) => {
      const open = chapterOpen(ci), n = doneCount(c);
      return `<button class="season ${open ? '' : 'locked'}" data-ci="${ci}" style="--c:${SEASON_COLOR[c.id]};animation-delay:${ci * 0.08}s">
        <div class="mech">${MECH[c.intro.icon]}</div>
        <span class="big">${c.name}</span>
        <h3>${c.title}</h3>
        <p class="rule">${c.rule}</p>
        ${open ? `<div class="prog">${c.levels.map(l => `<i class="${save.done[l.id] ? 'd' : ''}"></i>`).join('')}</div>`
          : `<span class="lock">完成上一季 6 个星座后开启</span>`}
      </button>`;
    }).join('');
    box.querySelectorAll('.season').forEach(el => el.onclick = () => {
      const ci = +el.dataset.ci;
      if (!chapterOpen(ci)) { toast('完成上一季 6 个星座后开启'); return; }
      A.tap(); chapter = ci; show('levels');
    });
  }

  function renderLevels() {
    const c = CH[chapter];
    $('lv-title').textContent = c.title;
    $('lv-rule').textContent = c.rule;
    const box = $('levels');
    box.innerHTML = c.levels.map((l, li) => {
      const open = levelOpen(chapter, li), d = save.done[l.id];
      return `<button class="lv ${open ? '' : 'locked'}" data-li="${li}" style="animation-delay:${li * 0.05}s">
        <span class="num">${c.name} · ${li + 1}</span>${d ? `<span class="medal">${d === 2 ? '✦' : '✧'}</span>` : ''}
        <canvas></canvas><b>${open ? l.name : '？？？'}</b><small>${open ? l.en : ''}</small></button>`;
    }).join('');
    box.querySelectorAll('.lv').forEach(el => {
      const li = +el.dataset.li, l = c.levels[li];
      requestAnimationFrame(() => Board.preview(el.querySelector('canvas'), l, !!save.done[l.id], Sky.THEMES[c.id].accent));
      el.onclick = () => { if (!levelOpen(chapter, li)) { toast('先织好前一个星座'); return; } A.tap(); play(li); };
    });
  }

  function play(li) {
    level = li;
    const c = CH[chapter], L = c.levels[li];
    Sky.set(c.id); A.setKey(c.id);
    $('pl-index').textContent = `${c.title.split(' ')[0]} · ${li + 1} / ${c.levels.length}`;
    $('pl-name').textContent = L.name;
    $('pl-tip').textContent = L.tip || '';
    Board.load(L, { accent: Sky.THEMES[c.id].accent });
    A.level([...L.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 11) % 2147483646 + 1, Board.G.total);
    Board.alpha = 0;
    show('play');
    hideOverlays();
    updateProgress();
    if (!save.seen[c.id]) { save.seen[c.id] = 1; persist(); setTimeout(() => openIntro(c), 350); }
  }

  function updateProgress() {
    if (!Board.G || screen !== 'play') return;
    const done = Board.G.total - Board.left;
    $('pl-progress').textContent = Board.cur < 0 ? '点一颗星开始' : `星线 ${done} / ${Board.G.total}`;
  }
  Board.on.change = updateProgress;
  Board.on.toast = msg => toast(msg);
  Board.on.stuck = () => toast('无路可走了 · 撤销几步试试');
  Board.on.win = () => {
    const c = CH[chapter], L = c.levels[level];
    const perfect = Board.hintsUsed === 0;
    const prev = save.done[L.id] || 0;
    save.done[L.id] = Math.max(prev, perfect ? 2 : 1); persist();
    A.win();
    const last = level === c.levels.length - 1;
    const allDone = CH.every(ch => doneCount(ch) === ch.levels.length);
    $('win-kicker').textContent = allDone && last && chapter === CH.length - 1 ? '四季星图 · 全部织成' : '星座织成';
    $('win-name').textContent = L.name;
    $('win-en').textContent = L.en;
    $('win-line').textContent = L.line;
    $('win-medal').textContent = perfect ? '✦ 没有借助提示' : '✧ 已织成 · 不用提示再试一次可得 ✦';
    const nextOpen = !last || (chapter < CH.length - 1 && chapterOpen(chapter + 1));
    $('win-next').textContent = last ? (nextOpen ? '下一季' : '回到星图') : '下一个';
    $('win').classList.add('on');
    Board.smooth = true; layoutBoard();
  };
  $('win-next').onclick = () => {
    A.tap();
    const c = CH[chapter];
    if (level < c.levels.length - 1) play(level + 1);
    else if (chapter < CH.length - 1 && chapterOpen(chapter + 1)) { chapter++; play(0); }
    else { hideOverlays(); show('seasons'); }
  };
  $('win-map').onclick = () => { A.tap(); hideOverlays(); show('levels'); };

  function openIntro(c) {
    $('intro-art').innerHTML = MECH[c.intro.icon];
    $('intro-title').textContent = c.intro.title;
    $('intro-text').innerHTML = c.intro.text;
    $('intro').classList.add('on');
  }
  $('intro-ok').onclick = () => { A.tap(); $('intro').classList.remove('on'); };
  function hideOverlays() { $('win').classList.remove('on'); $('intro').classList.remove('on'); }

  let toastT = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // —— 按钮 ——
  document.querySelectorAll('[data-back]').forEach(b => { b.innerHTML = ICON.back; b.onclick = () => { A.tap(); hideOverlays(); show(b.dataset.back); }; });
  $('btn-undo').querySelector('i').innerHTML = ICON.undo;
  $('btn-restart').querySelector('i').innerHTML = ICON.restart;
  $('btn-hint').querySelector('i').innerHTML = ICON.hint;
  $('btn-undo').onclick = () => Board.undo();
  $('btn-restart').onclick = () => { Board.restart(); A.undo(); };
  $('btn-hint').onclick = () => Board.giveHint();
  const soundIcon = () => { $('btn-sound').innerHTML = save.sound ? ICON.sound : ICON.mute; };
  $('btn-sound').onclick = () => { save.sound = !save.sound; persist(); A.unlock(); A.setOn(save.sound); soundIcon(); };
  soundIcon(); A.setOn(save.sound);
  $('btn-start').onclick = () => { A.unlock(); A.tap(); show('seasons'); };

  addEventListener('keydown', e => {
    if (screen !== 'play' || $('win').classList.contains('on')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' || e.key === 'Backspace') { e.preventDefault(); Board.undo(); }
    else if (e.key === 'r' || e.key === 'R') Board.restart();
    else if (e.key === 'h' || e.key === 'H') Board.giveHint();
    else if (e.key === 'Escape') show('levels');
  });

  // —— 指针 ——
  const pos = e => [e.clientX, e.clientY];
  cv.addEventListener('pointerdown', e => {
    A.unlock();
    if (screen !== 'play' || $('win').classList.contains('on') || $('intro').classList.contains('on')) return;
    cv.setPointerCapture(e.pointerId);
    Board.down(...pos(e));
  });
  cv.addEventListener('pointermove', e => { if (screen === 'play') Board.moveTo(...pos(e)); });
  const end = () => Board.up();
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  document.addEventListener('gesturestart', e => e.preventDefault());

  // —— 主循环 ——
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    Sky.draw(g, t, dt);
    boardAlpha += (boardTarget - boardAlpha) * Math.min(1, dt * 3);
    Board.alpha = Math.max(0, Math.min(1, Board.alpha + (boardTarget - Board.alpha) * Math.min(1, dt * 3)));
    if (Board.alpha > 0.01) Board.draw(g, t, dt);
    A.tick();
    requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  resize();
  show('title');
  requestAnimationFrame(frame);

  window.SW = { Board, save, play: (ci, li) => { chapter = ci; play(li); }, show };
})();
