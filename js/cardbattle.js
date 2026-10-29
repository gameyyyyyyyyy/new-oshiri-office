// 対戦画面。cardengine.js の prompt/choose/roll を画面に橋渡しするだけで、
// ルールの判断は一切しない(エンジンが唯一の正)。
//
// 演出の方針(ポケポケ参考):
//  - 盤面は実物のカードを並べる(イラスト・HPバー付き)
//  - エンジンが吐くイベントを**1件ずつ順番に再生**し、何が起きたか読める間を作る
//  - ダメージ/回復は当該カードを揺らす・光らせる・数字を飛ばす
//  - 出目のテキストは中央のバナーに大きく出す(ログを読まなくても分かるように)
//  - 演出中に画面をタップすると早送りできる
import { CARDS, OPPONENTS, GACHA_POOL } from "./carddata.js";
import { createBattle, INITIAL_HAND, DRAW_LIMIT } from "./cardengine.js";
import { renderCard } from "./cards.js";
import * as col from "./collection.js";
import { playPackOpen } from "./packfx.js";

const $ = (id) => document.getElementById(id);

// 各イベントの見せ場の長さ(ms)。短すぎると何が起きたか読めない
const DUR = {
  turnStart: 1500, play: 1000, roll: 2200, damage: 1400, heal: 1200, draw: 550,
  useEvent: 1900, foeEvent: 2500, popOut: 320, bounce: 1300, trash: 900, discard: 1000, skipRoll: 1300,
  recover: 1300, chooseFace: 1800, mulligan: 1200, over: 900, turnEnd: 150,
  diceCheck: 1800, // 判定ダイスの結果(成功/失敗スタンプ)を見せる間
  noDraw: 1300,    // 手札が多くてドローが起きなかった時の説明
  flip: 1500,      // 先攻決めのカードをめくってから対戦が始まるまで
  ko: 1200,        // 撃破の追い演出
  aiThink: 900,    // 相手のターンに入る前の間
  diceSpin: 900,   // ダイスが回っている時間
  diceHold: 1200,  // 出目が決まってから次へ進むまでの間
};

export function createCardBattle(deps) {
  // deps: { toast, onFinish }
  const overlay = $("battle-overlay");
  const els = {
    foeName: $("bt-foe-name"), foeSt: $("bt-foe-st"), youSt: $("bt-you-st"),
    turn: $("bt-turn"), foeField: $("bt-foe-field"), youField: $("bt-you-field"),
    hand: $("bt-hand"), foeHand: $("bt-foe-hand"),
    moreL: $("bt-more-l"), moreR: $("bt-more-r"),
    logView: $("bt-logview"), logList: $("bt-loglist"),
    youTrash: $("bt-you-trash"), foeTrash: $("bt-foe-trash"),
    youDeck: $("bt-you-deck"), foeDeck: $("bt-foe-deck"),
    prompt: $("bt-prompt"), banner: $("bt-banner"), turnBanner: $("bt-turnbanner"),
  };
  $("bt-quit").addEventListener("click", () => { if (battle) finish(null); });
  $("bt-rules").addEventListener("click", (e) => { e.stopPropagation(); deps.onShowRules(); });
  // 音のON/OFF(設定パネルのBGM・効果音をまとめて切り替える)
  const soundBtn = $("bt-sound");
  function refreshSound() {
    const on = deps.isSoundOn ? deps.isSoundOn() : true;
    soundBtn.textContent = on ? "🔊" : "🔇";
    soundBtn.title = on ? "音を消す" : "音を出す";
    soundBtn.classList.toggle("off", !on);
  }
  soundBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (deps.toggleSound) deps.toggleSound();
    refreshSound();
  });
  $("bt-history").addEventListener("click", (e) => { e.stopPropagation(); openLog(); });
  $("bt-log-close").addEventListener("click", (e) => { e.stopPropagation(); els.logView.classList.remove("show"); });
  // 手札を横スクロールしたら、画面外にまだカードがあるかの表示を更新する
  els.hand.addEventListener("scroll", updateHandArrows, { passive: true });
  addEventListener("resize", updateHandArrows);
  els.youTrash.addEventListener("click", () => showTrash("you"));
  els.foeTrash.addEventListener("click", () => showTrash("foe"));

  let battle = null;
  let oppKey = null;
  let selected = new Set();
  let busy = false;        // 演出中は入力を止める
  let pendingPlay = null;  // 交換相手を選ばせている最中の手札uid
  let pendingPick = null;  // 盤面の選択で「詳細を見て確認待ち」のuid
  let autoRollUid = null;  // ロール順の「サイコロを振る」から来たら、rollプロンプトで自動で振る
  let handHpOverride = new Map(); // 手札に戻ったモンスターの回復演出用(演出前のHPを見せる)
  let rerollPeek = false;  // 振り直し確認中に「場を確認」でカード詳細を一時的に畳む
  let lastActionText = ""; // 直前に実行した面/イベントのテキスト(判定ダイスの説明に出す)
  let actingUid = null;    // いま行動している(振る)モンスター
  // このターンに行動を終えたモンスター(暗く表示する)。ターンが変わると空になる
  let doneMons = new Set();
  // ターン終了で召喚酔いの表示を消したモンスター(エンジン上は次の自分の手番まで酔ったまま)
  let sickCleared = new Set();
  // 行動停止(かくほ・かなしばり等)の表示をターン終了で消すための記録
  let stopCleared = new Set();
  // 配布・ドロー演出の間だけ手札の表示枚数を絞る(nullなら全部出す)
  let handLimit = null;
  let foeHandLimit = null;
  // これから捨てられる予定のカード。演出でトラッシュに落ちるまで手札に残して見せる
  let handGhosts = [];
  // これから場に出るモンスター(playの演出まで出さない)
  let hiddenMons = new Set();
  // これから場から消えるモンスター(trash/bounce/交換の演出まで残す)
  let ghostMons = [];
  // 直前の場のスナップショット(消えるモンスターの見た目を復元するのに使う)
  let prevField = { you: [], foe: [] };
  // 演出が追いつくまで表示しておくHP(uid → hp)。エンジンは先に減らしているため
  let hpOverride = new Map();
  let skipNow = null;      // 演出の早送り
  let skipLayer = null;
  let pickRow = null;      // 中央に並べたカード選択(トラッシュから戻すときなど)
  let slideTimers = [];    // 配布・ドロー演出のタイマー(開始/終了で止める)
  // 演出が追いつくまで表示しておくトラッシュの枚数(nullなら実数をそのまま出す)
  let trashLimit = { you: null, foe: null };
  // 山札の枚数表示も演出に合わせる(エンジンは先に引き終わっているので、
  // カードが束から抜けるアニメの瞬間に1枚ずつ減らす)
  let deckLimit = { you: null, foe: null };
  const logLines = [];

  const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
  const sfx = (n) => { if (deps.sfx) deps.sfx(n); };
  const nameOf = (id) => (CARDS[id] ? CARDS[id].name : id);

  // ---------- 起動と終了 ----------
  /**
   * 対戦前の先攻決め。伏せた2枚から1枚選ばせる(中身は「先攻」「後攻」)。
   * @returns {Promise<'you'|'foe'>}
   */
  function coinFlip() {
    return new Promise((resolve) => {
      const youFirst = Math.random() < 0.5; // 左のカードが「先攻」かどうか
      const box = el(
        `<div class="bt-flip"><h3>先攻・後攻を決めます</h3>` +
        `<p class="sub">伏せられた2枚から1枚選んでください</p>` +
        `<div class="row"></div></div>`
      );
      const row = box.querySelector(".row");
      const faces = [youFirst ? "先攻" : "後攻", youFirst ? "後攻" : "先攻"];
      let done = false;
      faces.forEach((label, i) => {
        const c = el(`<div class="bt-flipcard"><div class="in"><div class="bk"></div>` +
          `<div class="fr ${label === "先攻" ? "fr-first" : "fr-second"}">${label}</div></div></div>`);
        c.addEventListener("click", () => {
          if (done) return;
          done = true;
          sfx("play");
          c.classList.add("open", "chosen");
          // もう1枚も遅れて開いて、外れの中身を見せる
          setTimeout(() => { for (const o of row.children) o.classList.add("open"); }, 450);
          box.querySelector("h3").textContent = label === "先攻" ? "あなたの先攻!" : "あいての先攻!";
          setTimeout(() => { box.remove(); resolve(label === "先攻" ? "you" : "foe"); }, DUR.flip);
        });
        row.appendChild(c);
      });
      overlay.appendChild(box);
    });
  }

  // opts(検証用): { playerDeck, opponentDeck } で所持チェックを無視してデッキを強制できる
  async function start(opponentKey, seed, opts = {}) {
    clearSlideTimers();
    closePickRow();
    // 前の対戦の演出が残っていたら片付ける(連続で開始した時の取りこぼし防止)
    overlay.querySelectorAll(".bt-intro, .bt-flip, .bt-result, .bt-eventpop").forEach((e) => e.remove());
    oppKey = opponentKey;
    logLines.length = 0;
    els.logView.classList.remove("show");
    els.banner.className = "bt-banner";
    closeStage();
    const meta0 = OPPONENTS.find((o) => o.key === opponentKey);
    els.foeName.textContent = meta0 ? meta0.label : opponentKey;
    if (deps.onBattleStart) deps.onBattleStart();
    // 乱入演出は3D空間側で出す。対戦画面はそのあとに開く
    if (deps.onIntro) await deps.onIntro(opponentKey, meta0 ? meta0.label : opponentKey);
    overlay.classList.add("show");
    refreshSound();
    const first = await coinFlip();
    // seed は検証用(省略時は毎回ランダム)
    battle = createBattle({
      playerDeck: opts.playerDeck || col.getDeck() || [],
      opponentKey,
      opponentDeck: opts.opponentDeck,
      seed,
      firstPlayer: first,
    });
    selected.clear(); pendingPlay = null; pendingPick = null; actingUid = null; busy = false; logLines.length = 0;
    autoRollUid = null; handHpOverride = new Map(); rerollPeek = false; lastActionText = "";
    doneMons = new Set();
    sickCleared = new Set();
    stopCleared = new Set();
    handLimit = null; foeHandLimit = null; handGhosts = [];
    hiddenMons = new Set(); ghostMons = []; prevField = { you: [], foe: [] };
    hpOverride = new Map();
    deckLimit = { you: null, foe: null };
    curTurnSide = null;
    pushLog(first === "you" ? "あなたの先攻" : "あいての先攻");
    render();
    run();
  }

  function finish(winner) {
    clearSlideTimers();
    closePickRow();
    closeStage();
    overlay.classList.remove("show");
    const had = !!battle;
    battle = null;
    if (winner === "you" && had) { col.recordWin(oppKey); showReward(oppKey); }
    else if (deps.onFinish) deps.onFinish(winner, oppKey);
  }

  // ---------- 演出の下ごしらえ ----------
  let speedMult = 1; // 検証用の倍速(__btSpeed)。通常プレイでは1のまま
  function wait(ms) {
    return new Promise((res) => {
      const t = setTimeout(done, ms / speedMult);
      function done() { clearTimeout(t); skipNow = null; res(); }
      skipNow = done;
    });
  }
  function setBusy(on) {
    busy = on;
    if (on && !skipLayer) {
      skipLayer = el(`<div class="bt-skip" title="タップで早送り"></div>`);
      skipLayer.addEventListener("click", () => { if (skipNow) skipNow(); });
      overlay.appendChild(skipLayer);
      updateSkipHint();
    } else if (!on && skipLayer) { skipLayer.remove(); skipLayer = null; }
  }
  // 相手ターンの演出中だけ「画面タップでスキップ」のヒントを透かしで出す
  // (.bt-skip::after で描く。表示アニメに遅延があるので一瞬の演出では出ない)
  let curTurnSide = null;
  function updateSkipHint() {
    if (skipLayer) skipLayer.classList.toggle("hint", curTurnSide === "foe");
  }
  function banner(text, sub) {
    els.banner.innerHTML = text + (sub ? `<span class="sub">${sub}</span>` : "");
    els.banner.className = "bt-banner";
    void els.banner.offsetWidth; // アニメーションを再生し直す
    els.banner.className = "bt-banner show";
  }
  /** 行動履歴に1行足す(中央には出さない。📋ボタンで見る) */
  function pushLog(t, side) {
    logLines.push({ t: t.replace(/<[^>]+>/g, ""), side: side || "" });
    while (logLines.length > 120) logLines.shift();
    if (els.logView.classList.contains("show")) renderLog();
  }
  function renderLog() {
    const atBottom = els.logList.scrollTop + els.logList.clientHeight >= els.logList.scrollHeight - 20;
    els.logList.innerHTML = "";
    for (const l of logLines) {
      const d = el(`<div class="${l.side}"></div>`);
      d.textContent = l.t;
      els.logList.appendChild(d);
    }
    // 開いたまま進行しても、いちばん新しい行が見えるようにする
    if (atBottom) els.logList.scrollTop = els.logList.scrollHeight;
  }
  function openLog() {
    els.logView.classList.add("show");
    renderLog();
    els.logList.scrollTop = els.logList.scrollHeight; // 最新を見せる
  }

  /** 手札が画面外まで続いているとき、その側に矢印を出す */
  function updateHandArrows() {
    const h = els.hand;
    const over = h.scrollWidth - h.clientWidth;
    els.moreL.classList.toggle("show", over > 4 && h.scrollLeft > 4);
    els.moreR.classList.toggle("show", over > 4 && h.scrollLeft < over - 4);
  }
  const cardEl = (uid) => overlay.querySelector(`.bt-card[data-uid="${uid}"]`);

  // --- カードを画面中央にせり出させる「ステージ」 ---
  // 選択中のカードやロール中のモンスターを実物大で見せ、6面テキストを直接強調する。
  let stageEl = null;
  let stageCardEl = null;
  let stageDice = null;   // せり出したカードの右上に出すサイコロ
  let stageKey = null;   // いま出しているカードの識別(同じなら出し直さない)
  let stageHidden = null; // 元の場所で隠しているDOM

  /** uidから場/手札のカード実体を探す(現在HP表示用) */
  function instOf(uid) {
    if (!battle) return null;
    const s = battle.state;
    return [...s.you.field, ...s.foe.field, ...s.you.hand].find((x) => x.uid === uid) || null;
  }
  /** せり出し/詳細カードのHP表記を「HP 現在 / 最大」にする */
  function patchHp(cardDom, uid) {
    const m = instOf(uid); // 盤面スナップショットの要素({uid,id,hp,maxHp?}。defは持たない)
    const def = m && CARDS[m.id];
    if (!def || def.kind !== "monster" || m.hp == null) return;
    const hp = hpOverride.has(uid) ? hpOverride.get(uid) : m.hp;
    const max = m.maxHp != null ? m.maxHp : def.hp;
    const tag = cardDom.querySelector(".pcard-hp");
    if (tag) tag.textContent = `HP ${hp} / ${max}`;
  }

  function openStage(cardId, fromEl, key) {
    const k = key != null ? key : cardId;
    if (stageEl && stageKey === k) return stageCardEl;
    closeStage();
    stageKey = k;
    const wrap = el(`<div class="bt-stage"><div class="bt-stage-inner"></div></div>`);
    const inner = wrap.firstElementChild;
    const card = renderCard(CARDS[cardId], cardId);
    // 場・手札のモンスターは定義の最大HPではなく現在HPを「HP 20 / 45」で見せる
    const km = /^(mon|hand)(\d+)$/.exec(k);
    if (km) patchHp(card, Number(km[2]));
    inner.appendChild(card);
    // 攻撃ロール用のサイコロ。カードの右上に重ねる
    stageDice = el(`<div class="bt-dice pip-1"></div>`);
    inner.appendChild(stageDice);
    overlay.appendChild(wrap);
    els.prompt.classList.add("low"); // 中央はカードに譲る
    stageEl = wrap;
    stageCardEl = card;
    // 画面に収まるよう縮める(下に逃がした操作パネルのぶんも空ける)
    const sc = Math.min(1, (innerHeight - 240) / 502, (innerWidth - 30) / 340);
    inner.style.transform = `scale(${sc.toFixed(3)})`;
    // 元のカードの位置から飛んでくる
    if (fromEl) {
      const a = fromEl.getBoundingClientRect();
      const b = card.getBoundingClientRect();
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      const r = a.width / b.width;
      card.style.transition = "none";
      card.style.transform = `translate(${dx}px, ${dy}px) scale(${r.toFixed(3)})`;
      requestAnimationFrame(() => {
        card.style.transition = "transform .42s cubic-bezier(.2,1.2,.4,1)";
        card.style.transform = "";
      });
      fromEl.style.visibility = "hidden";
      stageHidden = fromEl;
    }
    // サイコロをステージ上へ移す
    return card;
  }

  function closeStage() {
    els.prompt.classList.remove("low");
    if (!stageEl) return;
    stageEl.remove();
    if (stageHidden) { stageHidden.style.visibility = ""; stageHidden = null; }
    stageEl = null; stageCardEl = null; stageDice = null; stageKey = null;
  }

  /** ステージ上のカードの6面のうち1つを光らせる。mode: "spin" | "lock" */
  function stageHighlight(face, mode) {
    if (!stageCardEl) return;
    const rows = [...stageCardEl.querySelectorAll(".pcard-face")];
    rows.forEach((r, i) => {
      r.classList.remove("spin", "on", "off");
      if (mode === "spin") { if (i === face - 1) r.classList.add("spin"); }
      else r.classList.add(i === face - 1 ? "on" : "off");
    });
  }

  function floatNum(uid, text, cls) {
    const c = cardEl(uid);
    if (!c) return;
    const f = el(`<div class="bt-float ${cls}">${text}</div>`);
    c.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }

  // ---------- 盤面の描画 ----------
  function fieldCard(m, side) {
    const def = CARDS[m.id];
    // 演出がまだのダメージ/回復は反映しない
    const hp = hpOverride.has(m.uid) ? hpOverride.get(m.uid) : m.hp;
    const pct = Math.max(0, Math.round((hp / m.maxHp) * 100));
    const sick = m.sick && !sickCleared.has(m.uid); // 召喚酔い(ターン終了で表示は消える)
    // 行動停止(かくほ・かなしばり等)。いま止まっているのか、次のターン止まるのかを出し分ける
    const stopped = !sick && !!m.skip && !stopCleared.has(m.uid);
    const stopSoon = !sick && !m.skip && !!m.skipSoon;
    const c = el(
      `<div class="bt-card ${def.attr || ""}${sick || stopped ? " done" : ""}" data-uid="${m.uid}" data-side="${side}">` +
      `<div class="bt-flash"></div>` +
      (sick ? `<span class="bt-sick">召喚酔い</span>` : "") +
      (stopped ? `<span class="bt-sick stop">行動停止</span>` : "") +
      (stopSoon ? `<span class="bt-sick stop soon">次ターン停止</span>` : "") +
      `<div class="bt-card-art" style="background-image:url(assets/cards/${m.id}.jpeg)"></div>` +
      `<div class="bt-card-name">${def.name}</div>` +
      `<div class="bt-card-hp"><i style="width:${pct}%"></i></div>` +
      `<div class="bt-card-num">${hp} / ${m.maxHp}</div></div>`
    );
    c.addEventListener("click", () => onBoardClick(m.uid, side));
    return c;
  }
  function renderField(box, list, side) {
    box.innerHTML = "";
    const shown = list.filter((m) => !hiddenMons.has(m.uid));
    // 撃破/バウンス待ちのモンスターは、演出が終わるまで**元の位置**に戻す。
    // 末尾に足すと、1体目が倒れたときに残った2体目が左へ飛んで見える
    const all = shown.slice();
    for (const g of ghostMons) {
      if (g.side !== side) continue;
      const at = g.at == null ? all.length : Math.min(g.at, all.length);
      all.splice(at, 0, g.m);
    }
    if (!all.length) { box.appendChild(el(`<div class="bt-empty">場にモンスターがいない</div>`)); return; }
    for (const m of all) box.appendChild(fieldCard(m, side));
  }

  function render() {
    if (!battle) return;
    const s = battle.state;
    const meta = OPPONENTS.find((o) => o.key === s.opponentKey);
    els.foeName.textContent = meta ? meta.label : s.opponentKey;
    // 手札の枚数も並べる(演出中は見せている枚数に合わせる)
    const foeHandN = foeHandLimit == null ? s.foe.handCount : foeHandLimit;
    const youHandN = handLimit == null ? s.you.hand.length : Math.min(handLimit, s.you.hand.length);
    // トラッシュも演出が追いつくまでは増やさない
    const youTrashN = trashLimit.you == null ? s.you.trashCount : trashLimit.you;
    const foeTrashN = trashLimit.foe == null ? s.foe.trashCount : trashLimit.foe;
    const youDeckN = deckLimit.you == null ? s.you.deckCount : deckLimit.you;
    const foeDeckN = deckLimit.foe == null ? s.foe.deckCount : deckLimit.foe;
    els.foeSt.textContent = `手札${foeHandN} / 山札${foeDeckN} / トラッシュ${foeTrashN} / 振り直し 残り${s.foe.rerollTokens}`;
    els.youSt.textContent = `手札${youHandN} / 山札${youDeckN} / トラッシュ${youTrashN} / 振り直し 残り${s.you.rerollTokens}`;
    els.turn.textContent = `${s.turn}ターン目`;
    renderFoeHand(foeHandLimit == null ? s.foe.handCount : foeHandLimit);
    for (const [el2, n] of [[els.youTrash, youTrashN], [els.foeTrash, foeTrashN]]) {
      el2.querySelector(".n").textContent = n;
      el2.classList.toggle("empty", n === 0);
    }
    els.youDeck.querySelector(".n").textContent = youDeckN;
    els.foeDeck.querySelector(".n").textContent = foeDeckN;
    renderField(els.foeField, s.foe.field, "foe");
    renderField(els.youField, s.you.field, "you");
    markPickable(s);
    renderHand(s);
    renderPrompt(s);
    requestAnimationFrame(updateHandArrows); // 並べ終わってから幅を測る
  }

  function markPickable(s) {
    // 行動を終えたモンスターだけ沈める(相手の場・未行動のカードは明るいまま)
    for (const uid of doneMons) {
      if (uid === actingUid) continue;
      const e = cardEl(uid);
      if (e) e.classList.add("done");
    }
    // いま行動するモンスターを強調する
    if (actingUid != null) {
      const e = cardEl(actingUid);
      if (e) { e.classList.remove("done"); e.classList.add("acting"); }
    }
    // 演出再生中はエンジンが先の手番まで進んでいるため、prompt(次の自分の選択)を
    // 見せると相手のターン中に自分の場へ黄色枠が出てしまう。busy中は無視する
    const q = busy ? null : s.prompt;
    if (!q || !q.options) return;
    if (q.kind === "rollOrder" || q.kind === "pickTarget") {
      for (const uid of q.options) { const e = cardEl(uid); if (e) e.classList.add("pick"); }
    }
    if (q.kind === "roll" && q.monsterUid != null) {
      const e = cardEl(q.monsterUid);
      if (e) { e.classList.remove("done"); e.classList.add("acting"); }
    }
    if (pendingPlay != null) {
      for (const e of els.youField.querySelectorAll(".bt-card")) e.classList.add("pick");
    }
    if (pendingPick != null) { const e = cardEl(pendingPick); if (e) e.classList.add("acting"); }
  }

  // 相手の手札は中身を見せず、裏面を枚数ぶん並べる
  function renderFoeHand(n) {
    els.foeHand.innerHTML = "";
    const show = Math.min(n, 12); // 多すぎるときは12枚までにして枚数を添える
    for (let i = 0; i < show; i++) {
      const b = el(`<div class="bt-back"></div>`);
      b.style.animationDelay = i * 0.03 + "s";
      els.foeHand.appendChild(b);
    }

  }

  /** 手札のカード。場のカード(bt-card)と同じ見た目: 絵柄+名前+モンスターはHPバー。番号は出さない */
  function handCard(id, hp) {
    const def = CARDS[id];
    const isMon = def.kind === "monster";
    // バウンス/交換で戻ったモンスターは最大HPの半分回復した状態で手札に来る
    const cur = isMon ? (hp != null ? hp : def.hp) : 0;
    const pct = isMon ? Math.max(0, Math.round((cur / def.hp) * 100)) : 0;
    return el(
      `<div class="bt-handcard ${isMon ? def.attr || "" : "event"}">` +
      `<div class="bt-card-art" style="background-image:url(assets/cards/${id}.jpeg)"></div>` +
      `<div class="bt-card-name">${def.name}</div>` +
      (isMon
        ? `<div class="bt-card-hp"><i style="width:${pct}%"></i></div>` +
          `<div class="bt-card-num">${cur} / ${def.hp}</div>`
        : "") +
      `</div>`
    );
  }

  function renderHand(s) {
    const q = busy ? null : s.prompt; // 演出中は先の手番のハイライトを見せない
    const pickable = new Set(q && (q.kind === "playMonster" || q.kind === "useEvent" || q.kind === "endDiscard") ? q.options : []);
    els.hand.innerHTML = "";
    const shown = handLimit == null ? s.you.hand : s.you.hand.slice(0, handLimit);
    // まだ演出していない「捨てられる予定」のカードも並べておく
    for (const g of handGhosts) {
      const mini = handCard(g.id);
      mini.dataset.uid = g.uid;
      mini.classList.add("dim");
      els.hand.appendChild(mini);
    }
    // 表示はモンスター→イベントの順に並べ替える(引いた順は保つ)
    const sorted = shown.slice().sort(
      (a, b) => (CARDS[a.id].kind === "monster" ? 0 : 1) - (CARDS[b.id].kind === "monster" ? 0 : 1)
    );
    for (const c of sorted) {
      // 手札に戻った直後の回復演出中は、回復前のHPで見せる
      const mini = handCard(c.id, handHpOverride.has(c.uid) ? handHpOverride.get(c.uid) : c.hp);
      mini.dataset.uid = c.uid;
      if (pickable.size) mini.classList.add(pickable.has(c.uid) ? "pick" : "dim");
      if (selected.has(c.uid)) mini.classList.add("sel");
      mini.addEventListener("click", () => onHandClick(c, pickable.has(c.uid)));
      els.hand.appendChild(mini);
    }
  }

  // ---------- 選択待ちの表示 ----------
  function renderPrompt(s) {
    els.prompt.innerHTML = "";
    // 中央のカード選択は recover の選択待ちのあいだだけ出す
    if (!s.prompt || s.prompt.kind !== "recover") closePickRow();
    if (s.over) return;
    if (busy) return; // 演出中は空にしておく(空のパネルはCSSで消える)
    if (s.awaitingAiTurn) { els.prompt.appendChild(el(`<span class="msg">相手のターン…</span>`)); return; }
    const q = s.prompt;
    if (!q) return;
    // ()の注釈が長い文は .msg-note で包み、PC表示のときだけ(の前で改行する(CSS側で制御)
    const msg = (t) => {
      const t2 = t.replace(/[(（]([^)）]+)[)）]/g, (m, inner) =>
        inner.replace(/<[^>]*>/g, "").length >= 12 ? `<span class="msg-note">(${inner})</span>` : m);
      els.prompt.appendChild(el(`<span class="msg">${t2}</span>`));
    };
    const act = (label, fn, cls) => {
      const b = el(`<button class="bt-act ${cls || ""}">${label}</button>`);
      b.addEventListener("click", fn);
      els.prompt.appendChild(b);
      return b;
    };
    // 出目の結果に続く選択(対象選び・イベント使用など)の間は、
    // どのテキストが選ばれたのかを見せたままにする
    // 盤面の選択で1枚目をタップ済み: 中身を見せて確定を促す
    if (pendingPick != null && (q.kind === "rollOrder" || q.kind === "pickTarget")) {
      const id = monIdOf(pendingPick);
      openStage(id, cardEl(pendingPick), "mon" + pendingPick);
      if (q.kind === "rollOrder") {
        // 振るモンスターを選んだら、そのまま「サイコロを振る」で一気に振れる
        msg(`<b>${nameOf(id)}</b> で振りますか?(中身は上に表示中)`);
        act("🎲 サイコロを振る", () => {
          const u = pendingPick;
          pendingPick = null;
          autoRollUid = u; // 続く roll プロンプトで自動的にダイスを回す
          answer(u);
        }, "big");
      } else {
        msg(`<b>${nameOf(id)}</b> を対象にしますか?`);
        act("これで決定", () => { const u = pendingPick; pendingPick = null; answer(u); });
      }
      act("選び直す", () => { pendingPick = null; closeStage(); render(); }, "ghost");
      return;
    }
    // 何も選びかけていない選択待ちでは、せり出したカードを片付ける
    // (pickFace = 尻に願いをの出目選びは、カードを見ながら選ぶので閉じない)
    if (q && q.kind !== "roll" && q.kind !== "rerollAsk" && q.kind !== "useEvent" && q.kind !== "pickFace" && pendingPick == null && !busy) closeStage();
    if (pendingPlay != null) {
      const full = s.you.field.length >= 2;
      msg(full
        ? "場が埋まっています。<b>どのモンスターと交換しますか?</b>(戻したモンスターは最大HPの半分回復)"
        : "<b>交換もできます。</b>入れ替えたいモンスターをタップ(戻したモンスターは最大HPの半分回復)");
      if (!full) act("そのまま出す", () => { const u = pendingPlay; pendingPlay = null; answer(u); });
      act("やめる", () => { pendingPlay = null; render(); }, "ghost");
      return;
    }
    switch (q.kind) {
      case "playMonster": {
        if (pendingPick != null) {
          const c = s.you.hand.find((x) => x.uid === pendingPick);
          if (c) {
            openStage(c.id, els.hand.querySelector(`[data-uid="${c.uid}"]`), "hand" + c.uid);
            msg(`<b>${nameOf(c.id)}</b> を場に出しますか?`);
            act("出す", () => { const u = pendingPick; pendingPick = null; onConfirmPlay(u); });
            act("選び直す", () => { pendingPick = null; closeStage(); render(); }, "ghost");
            return;
          }
        }
        // 開始時の初期配置と、通常ターンの配置を区別して伝える
        msg(q.initial
          ? "<b>開始時の配置です。</b>モンスターを1体出してください(お互い1体ずつ置いてから第1ターンが始まります。置いたモンスターは召喚酔いで第1ターンは振れません)"
          : q.canSkip
            ? "手札のモンスターを1体出せます(場のモンスターと交換した場合、<b>戻したモンスターは最大HPの半分回復</b>)"
            : "<b>場が空です。</b>モンスターを出してください");
        if (q.canSkip) act("出さない", () => answer(null), "ghost");
        break;
      }
      case "rollOrder": msg("どのモンスターから振りますか?(カードをタップ)"); break;
      case "roll":
        // 振る前にカードを中央にせり出させる。何が当たりうるかを見た上で振れる
        openStage(monIdOf(q.monsterUid), cardEl(q.monsterUid), "mon" + q.monsterUid);
        // ロール順の選択から「サイコロを振る」で来た場合は、もう一度押させずにそのまま振る
        if (autoRollUid != null && q.monsterUid === autoRollUid) {
          autoRollUid = null;
          doRoll();
          break;
        }
        msg(`<b>${nameOf(monIdOf(q.monsterUid))}</b> の番です`);
        act("🎲 サイコロを振る", doRoll, "big");
        break;
      case "rerollAsk": {
        // 出目を見てから振り直すか選べる(判定ダイスにも使える)。
        if (q.judge) {
          // 判定ダイス: カードのせり出しはなく、結果だけ聞く
          msg(`判定ダイスは <b>${q.face}</b>${q.ok ? "" : "(失敗…)"} でした`);
          act(`🎲 振り直す(残り${q.tokens})`, () => answer(true));
          act("このままでいい", () => answer(false), "ghost");
          break;
        }
        // モンスターのロール: カードは出しっぱなしで聞くが、
        // 「場を確認」でカードを一時的に畳んで盤面を見てから決められる
        const id = monIdOf(q.monsterUid);
        if (rerollPeek) closeStage();
        else {
          openStage(id, cardEl(q.monsterUid), "mon" + q.monsterUid);
          if (stageDice) stageDice.className = "bt-dice landed pip-" + q.face;
          stageHighlight(q.face, "lock");
        }
        msg(`出目は <b>${q.face}</b> でした`);
        act(`🎲 振り直す(残り${q.tokens})`, () => { rerollPeek = false; answer(true); });
        act("このままでいい", () => { rerollPeek = false; answer(false); }, "ghost");
        act(rerollPeek ? "カードを見る" : "場を確認", () => { rerollPeek = !rerollPeek; render(); }, "ghost");
        break;
      }
      case "useEvent": {
        const last = [...selected].pop();
        if (last != null) {
          const c = s.you.hand.find((x) => x.uid === last);
          if (c) openStage(c.id, els.hand.querySelector(`[data-uid="${c.uid}"]`), "ev" + c.uid);
        } else closeStage();
        msg(selected.size
          ? `<b>${nameOf(s.you.hand.find((x) => x.uid === last).id)}</b> を使いますか?` +
            `(別の手札をタップすると選び替えられます)`
          : `イベントカードを最大${q.max}枚まで使えます(手札をタップすると効果が出ます)`);
        // カードを選んだ時だけ「使う/選び直す」を出す。未選択のうちは「使う」ボタン自体を出さない
        if (selected.size) {
          // 1枚のときは枚数表示なし。2枚同時に使うときだけ「使う (2)」と枚数を添える
          act(selected.size > 1 ? `使う (${selected.size})` : "使う", () => answer([...selected]));
          act("選び直す", () => { selected.clear(); closeStage(); render(); }, "ghost");
        } else if (q.canSkip !== false) act("使わない", () => answer(null), "ghost");
        break;
      }
      case "mulligan":
        msg("<b>手札を引き直しますか?</b>(1回だけ・全部を引き直します)");
        act("このままでいく", () => answer(false));
        act("引き直す", () => answer(true), "ghost");
        break;
      case "endDiscard": {
        // ターン終了時に手札を1枚捨ててもよい。1回目のタップで確認、捨てるで確定
        if (pendingPick != null) {
          const c = s.you.hand.find((x) => x.uid === pendingPick);
          if (c) {
            openStage(c.id, els.hand.querySelector(`[data-uid="${c.uid}"]`), "hand" + c.uid);
            msg(`<b>${nameOf(c.id)}</b> を捨てますか?`);
            act("捨てる", () => { const u = pendingPick; pendingPick = null; answer(u); });
            act("選び直す", () => { pendingPick = null; closeStage(); render(); }, "ghost");
            return;
          }
        }
        msg("<b>ターン終了</b> — 手札を1枚捨てられます(捨てるならカードをタップ)");
        act("捨てずに終了", () => answer(null));
        break;
      }
      case "pickTarget": msg(targetMsg(q) + "(カードをタップ)"); break;
      case "pickFace": {
        // 6面を読みながら選べるよう、対象のカードをせり出したままにする。
        // カード内の行を直接タップしても選べる(ステージはpointer-events:noneなのでカードだけ有効化)
        const mid = monIdOf(q.monsterUid);
        const card = openStage(mid, cardEl(q.monsterUid), "mon" + q.monsterUid);
        if (card && !card.dataset.facePick) {
          card.dataset.facePick = "1"; // 再描画時の二重リスナー防止
          card.style.pointerEvents = "auto";
          [...card.querySelectorAll(".pcard-face")].forEach((row, i) => {
            row.style.cursor = "pointer";
            row.addEventListener("click", () => answer(i + 1));
          });
        }
        msg(`<b>${nameOf(mid)}</b> の出目を選べます(カードの行をタップでもOK)`);
        const box = el(`<div class="bt-faces"></div>`);
        for (const f of q.options) {
          const b = el(`<div class="bt-face pip-${f}" title="${f}"></div>`);
          b.addEventListener("click", () => answer(f));
          box.appendChild(b);
        }
        els.prompt.appendChild(box);
        break;
      }
      case "recover": {
        // 1回目のタップでカードを大きく見せ、2回目(決定)で確定する
        if (pendingPick != null) {
          closePickRow();
          const id = trashIdOf(pendingPick);
          openStage(id, null, "rec" + pendingPick);
          msg(`<b>${nameOf(id)}</b> を手札に戻しますか?`);
          act("これで決定", () => { const u = pendingPick; pendingPick = null; answer([u]); });
          act("選び直す", () => { pendingPick = null; closeStage(); render(); }, "ghost");
          return;
        }
        showPickRow(q.options, "トラッシュから手札に戻すカードを選ぶ");
        msg(`トラッシュから最大${q.max}枚まで手札に戻せます(カードをタップ)`);
        break;
      }
      default: msg("…");
    }
  }

  function targetMsg(q) {
    const by = { damage: "ダメージを与える相手", heal: "回復する味方", bounce: "手札に戻す相手",
      selfDamage: "ダメージを受ける味方", reroll: "もう一度振るモンスター",
      chooseFace: "出目を選ぶモンスター", skipRoll: "行動を止める相手" };
    return (by[q.reason] || "対象") + "を選んでください";
  }
  function monIdOf(uid) {
    const s = battle.state;
    const m = [...s.you.field, ...s.foe.field].find((x) => x.uid === uid);
    return m ? m.id : "?";
  }
  function trashIdOf(uid) {
    const s = battle.state;
    const c = (s.you.trash || []).find((x) => x.uid === uid);
    return c ? c.id : "?";
  }

  // ---------- 入力 ----------
  function onHandClick(card, isPickable) {
    if (busy || !battle) return;
    const q = battle.state.prompt;
    if (!q || !isPickable) { showDetail(card.id, card.uid); return; }
    if (q.kind === "playMonster") {
      // 1回目のタップで6面を見せ、同じカードをもう一度タップすると場に出す
      if (pendingPick !== card.uid) {
        pendingPick = card.uid;
        render();
        return;
      }
      pendingPick = null;
      if (q.canSwap && q.canSwap.length) { pendingPlay = card.uid; render(); }
      else answer(card.uid);
    } else if (q.kind === "useEvent") {
      if (selected.has(card.uid)) {
        selected.delete(card.uid); // もう一度タップで選択解除
      } else {
        // 上限まで選んでいる時に別のカードをタップしたら、古いほうと入れ替える
        // (1枚しか使えない場面で選び直せないのを防ぐ)
        while (selected.size >= q.max) selected.delete(selected.values().next().value);
        selected.add(card.uid);
      }
      render();
    } else if (q.kind === "endDiscard") {
      // 1回目のタップで確認(捨てる/選び直すはrenderPrompt側)。同じカードならそのまま確定
      if (pendingPick === card.uid) { pendingPick = null; answer(card.uid); return; }
      pendingPick = card.uid;
      render();
    }
  }

  function onConfirmPlay(uid) {
    // 場に1体でも居れば交換を選べる(2体目として出すか、入れ替えるか)
    const q = battle.state.prompt;
    if (q && q.canSwap && q.canSwap.length) { pendingPlay = uid; render(); return; }
    answer(uid);
  }

  function onBoardClick(uid, side) {
    if (busy || !battle) return;
    if (pendingPlay != null && side === "you") {
      const p = pendingPlay; pendingPlay = null;
      answer({ play: p, swap: uid });
      return;
    }
    const q = battle.state.prompt;
    if (q && (q.kind === "rollOrder" || q.kind === "pickTarget") && q.options.includes(uid)) {
      // 1回目のタップ: 中身(6面テキスト)を見せて確認させる / 2回目で確定
      if (pendingPick === uid) { pendingPick = null; answer(uid); return; }
      pendingPick = uid;
      render();
      return;
    }
    showDetail(monIdOf(uid), uid);
  }

  function answer(v) {
    if (!battle) return;
    const q0 = battle.state.prompt;
    const kind = q0 && q0.kind;
    try { battle.choose(v); } catch (e) { deps.toast("⚠ " + e.message); return; }
    selected.clear();
    pendingPick = null;
    if (kind === "rerollAsk") {
      // 「このままでいい」= ここで詳細表示を畳み、行動済みにする
      // (rollイベントの再生は振り直し待ちのままカードを出して抜けているため)。
      // 「振り直す」= 同じカードの上でダイスを回し直すので開けたまま
      if (!v) {
        closeStage();
        if (q0.monsterUid != null) doneMons.add(q0.monsterUid);
        actingUid = null;
      }
    } else if (kind !== "rollOrder") {
      // ロール順を決めた直後は同じモンスターの「振る」に続くので閉じない
      closeStage();
    }
    run();
  }

  /** サイコロを回してから face で止める(自分・相手で共通) */
  async function spinDice(face) {
    sfx("dice");
    // カード右上のサイコロを回しつつ、6面の該当行も一緒に光らせる
    const spin = setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 6);
      if (stageDice) stageDice.className = "bt-dice rolling pip-" + n;
      stageHighlight(n, "spin");
    }, 65);
    await wait(DUR.diceSpin);
    clearInterval(spin);
    if (stageDice) stageDice.className = "bt-dice landed pip-" + face;
    sfx("land");
  }

  async function doRoll() {
    if (busy || !battle) return;
    const q = battle.state.prompt;
    const monId = q && q.monsterUid != null ? monIdOf(q.monsterUid) : null;
    setBusy(true);
    renderPrompt(battle.state);
    if (monId) openStage(monId, cardEl(q.monsterUid), "mon" + q.monsterUid);
    // 先に回してから、止める瞬間に出目を確定させる
    sfx("dice");
    const spin = setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 6);
      if (stageDice) stageDice.className = "bt-dice rolling pip-" + n;
      stageHighlight(n, "spin");
    }, 65);
    await wait(DUR.diceSpin);
    clearInterval(spin);
    const face = battle.roll();
    if (stageDice) stageDice.className = "bt-dice landed pip-" + face;
    sfx("land");
    stageHighlight(face, "lock"); // カード内の該当テキストだけを強調する
    // ここでは閉じない。続く roll イベントの再生が同じステージを使い回す
    // (閉じるとカードがもう一度せり出して二度手間になる)
    await wait(DUR.diceHold);
    setBusy(false);
    run();
  }

  // ---------- 進行(イベントを1件ずつ再生してから次の入力を待つ) ----------
  let running = false;
  async function run() {
    if (running || !battle) return;
    running = true;
    try {
      for (;;) {
        await playEvents();
        if (!battle) return;
        const s = battle.state;
        if (s.over) { render(); await wait(700); showResult(s.winner); return; }
        if (s.awaitingAiTurn) {
          render();
          await wait(DUR.aiThink);
          if (!battle) return;
          battle.autoPlayTurn();
          continue; // 溜まったイベントを再生してから次へ
        }
        render();
        snapField();
        return; // プレイヤーの入力待ち
      }
    } finally { running = false; }
  }

  /** トラッシュの表示枚数を1つ進める(演出に合わせて増やす) */
  function bumpTrash(side, n = 1) {
    if (trashLimit[side] == null) return;
    trashLimit[side] = Math.max(0, trashLimit[side] + n);
  }

  /** これから再生するイベントのうち、その側のトラッシュを増減させる合計枚数 */
  function pendingTrashAdds(evs, side) {
    let n = 0;
    for (const ev of evs) {
      if (ev.t === "recover" && ev.side === side) { n -= 1; continue; }
      if (ev.side !== side) continue;
      // 手札から落ちる / 場から落ちる / 使ったイベント は全部トラッシュ行き
      if (ev.t === "discard" || ev.t === "trash" || ev.t === "useEvent") n += 1;
    }
    return n;
  }

  /** これから再生するイベントのうち、その側の手札を増やすものの合計枚数 */
  function pendingHandAdds(evs, side) {
    let n = 0;
    for (const ev of evs) {
      if (ev.side !== side) continue;
      if (ev.t === "draw") n += ev.n;
      else if (ev.t === "recover" || ev.t === "bounce") n += 1;
    }
    return n;
  }

  /** これから再生するイベントのうち、その側の山札から抜けるカードの合計枚数 */
  function pendingDeckDraws(evs, side) {
    let n = 0;
    for (const ev of evs) {
      if (ev.t === "mulligan") n += INITIAL_HAND; // 初期手札はお互いに配る
      else if ((ev.t === "draw" || ev.t === "redraw") && ev.side === side) n += ev.n;
    }
    return n;
  }

  /** いまの場を覚えておく(次の再生で「消えるモンスター」を復元するため) */
  function snapField() {
    if (!battle) return;
    const s = battle.state;
    prevField = {
      you: s.you.field.map((m) => ({ ...m })),
      foe: s.foe.field.map((m) => ({ ...m })),
    };
  }

  async function playEvents() {
    if (!battle) return;
    const evs = battle.drainEvents();
    if (!evs.length) return;
    setBusy(true);
    // エンジンは先の手番まで進んでいるので、これから演出する増加分は伏せておく。
    // (相手のターンを再生している最中に、自分の次のドローが見えてしまうのを防ぐ)
    const s0 = battle.state;
    handLimit = Math.max(0, s0.you.hand.length - pendingHandAdds(evs, "you"));
    // 捨てられる予定のカードは、演出でトラッシュへ落ちるまで手札に残して見せる
    handGhosts = evs.filter((e) => e.t === "discard" && e.side === "you" && CARDS[e.id])
      .map((e) => ({ uid: e.uid, id: e.id }));
    // ダメージ/回復もエンジンは先に適用済みなので、直前のHPを持ち越して表示する
    hpOverride = new Map();
    for (const sd of ["you", "foe"]) {
      for (const m of prevField[sd] || []) hpOverride.set(m.uid, m.hp);
    }
    // これから場に出るモンスターは、play の演出まで出さない
    hiddenMons = new Set(evs.filter((e) => e.t === "play").map((e) => e.uid));
    // これから場を離れるモンスターは、その演出まで残しておく
    ghostMons = [];
    const leaving = [];
    const seenLeaving = new Set();
    const addLeaving = (side, uid) => {
      // 交換は bounce と play(swapped) が同じカードを指す。二重に積むと場に2枚出てしまう
      const k = side + ":" + uid;
      if (seenLeaving.has(k)) return;
      seenLeaving.add(k);
      leaving.push({ side, uid });
    };
    for (const e of evs) {
      if (e.t === "trash" || e.t === "bounce") addLeaving(e.side, e.uid);
      else if (e.t === "play" && e.swapped != null) addLeaving(e.side, e.swapped);
    }
    for (const lv of leaving) {
      const cur = (lv.side === "you" ? s0.you.field : s0.foe.field).find((m) => m.uid === lv.uid);
      if (cur) continue; // まだ場にいるなら復元不要
      const at = (prevField[lv.side] || []).findIndex((m) => m.uid === lv.uid);
      if (at >= 0) ghostMons.push({ side: lv.side, at, m: prevField[lv.side][at] });
    }
    ghostMons.sort((a, b) => a.at - b.at); // 元の並び順どおりに差し戻す
    trashLimit = {
      you: Math.max(0, s0.you.trashCount - pendingTrashAdds(evs, "you")),
      foe: Math.max(0, s0.foe.trashCount - pendingTrashAdds(evs, "foe")),
    };
    const foeAdds = pendingHandAdds(evs, "foe");
    const foeDrops = evs.filter((e) => e.t === "discard" && e.side === "foe").length;
    foeHandLimit = Math.max(0, s0.foe.handCount - foeAdds + foeDrops);
    // 山札はエンジンが引き終わった後の枚数なので、これから引く分を足し戻しておき、
    // flyFromDeck がカード1枚抜くたびに減らす
    deckLimit = {
      you: s0.you.deckCount + pendingDeckDraws(evs, "you"),
      foe: s0.foe.deckCount + pendingDeckDraws(evs, "foe"),
    };
    render(); // 演出中の盤面(まだ結果は反映されていない状態)
    for (const ev of evs) {
      if (!battle) break;
      await playOne(ev);
    }
    handLimit = null;
    foeHandLimit = null;
    handGhosts = [];
    hiddenMons = new Set();
    ghostMons = [];
    hpOverride = new Map();
    trashLimit = { you: null, foe: null };
    deckLimit = { you: null, foe: null };
    handHpOverride = new Map();
    render();
    snapField();
    setBusy(false);
  }

  async function playOne(ev) {
    const who = ev.side === "you" ? "あなた" : "相手";
    switch (ev.t) {
      case "turnStart":
        els.turnBanner.textContent = ev.side === "you" ? "あなたのターン" : "あいてのターン";
        els.turnBanner.className = "bt-turnbanner";
        void els.turnBanner.offsetWidth;
        els.turnBanner.className = "bt-turnbanner show";
        sfx("turn");
        curTurnSide = ev.side;
        updateSkipHint();
        actingUid = null;
        doneMons = new Set(); // 新しいターン: 全部明るく戻す
        render();             // 暗くしていた表示をここで戻す
        closeStage();
        els.banner.className = "bt-banner"; // ターン表示と重ならないよう他は消す
        els.banner.innerHTML = "";
        pushLog(`${who}のターン`, ev.side);
        await wait(DUR.turnStart);
        return;

      case "play": {
        hiddenMons.delete(ev.uid);                     // ここで初めて場に現れる
        sickCleared.delete(ev.uid);                    // 出し直しなら再び召喚酔い
        stopCleared.delete(ev.uid);
        if (ev.swapped != null) ghostMons = ghostMons.filter((g) => g.m.uid !== ev.swapped);
        render();
        const c = cardEl(ev.uid);
        if (c) c.classList.add("entering");
        sfx("play");
        banner(`${who}は <b>${nameOf(ev.id)}</b> を出した`, ev.swapped != null ? "交換して場に出した" : "このターンは召喚酔いで振れない");
        pushLog(`${who}が${nameOf(ev.id)}を出した`, ev.side);
        await wait(DUR.play);
        return;
      }

      case "roll": {
        // 自分で振った直後は、すでに同じカードがせり出しているので出し直さない
        const already = stageKey === "mon" + ev.uid;
        actingUid = ev.uid;
        if (!already) {
          render();
          await wait(500); // 誰が振るのかを見せる間
          openStage(ev.id, cardEl(ev.uid), "mon" + ev.uid);
          if (ev.side === "foe" || ev.reroll) await spinDice(ev.face);
          else if (stageDice) stageDice.className = "bt-dice landed pip-" + ev.face;
          stageHighlight(ev.face, "lock");
        } else if (ev.reroll) {
          // 振り直し: 同じカードの上でもう一度ダイスを回す
          await spinDice(ev.face);
          stageHighlight(ev.face, "lock");
        }
        banner(
          ev.reroll ? `🎲 振り直し! <b>${ev.face}</b> — ${nameOf(ev.id)}` : `🎲 <b>${ev.face}</b> — ${nameOf(ev.id)}`,
          ev.text
        );
        lastActionText = ev.text; // 直後の判定ダイスの説明に使う
        pushLog(`${nameOf(ev.id)}→${ev.face} ${ev.text}${ev.reroll ? "(振り直し)" : ""}`, ev.side);
        await wait(already ? 700 : DUR.roll); // 既に見せた分は短くする
        // このあと「振り直しますか?」と聞く場合は、カードを出したまま行動済みにもしない
        const q2 = battle ? battle.state.prompt : null;
        if (q2 && q2.kind === "rerollAsk" && q2.monsterUid === ev.uid) { render(); return; }
        closeStage();
        doneMons.add(ev.uid); // このモンスターは行動済み
        actingUid = null;
        render();
        return;
      }

      case "chooseFace":
        actingUid = ev.uid;
        render();
        openStage(ev.id, cardEl(ev.uid), "mon" + ev.uid);
        if (stageDice) stageDice.className = "bt-dice landed pip-" + ev.face;
        stageHighlight(ev.face, "lock");
        banner(`✨ 出目を <b>${ev.face}</b> に選んだ`, ev.text);
        pushLog(`${nameOf(ev.id)}の出目を${ev.face}に選択`, ev.side);
        await wait(DUR.chooseFace);
        closeStage();
        return;

      case "diceCheck": {
        // 判定ダイス(「サイコロを振って○○なら」)。画面中央で振って見せる。
        // 何の判定なのか分かるよう、直前に実行した面/イベントの文をダイスの上に出す
        // 説明は「〜 — サイコロを振って」までを省き、条件と結果だけを出す
        // (例:「偶数なら、相手モンスター1体に40ダメージ」)
        const dcText = (lastActionText || "").replace(/^.*サイコロを振って/, "");
        const wrap = el(
          `<div class="bt-dicecheck">` +
          (dcText ? `<div class="bt-dc-text">${dcText}</div>` : "") +
          `<div class="bt-dice pip-1"></div></div>`
        );
        overlay.appendChild(wrap);
        const dice = wrap.querySelector(".bt-dice");
        sfx("dice");
        const spin = setInterval(() => {
          dice.className = "bt-dice rolling pip-" + (1 + Math.floor(Math.random() * 6));
        }, 65);
        await wait(DUR.diceSpin);
        clearInterval(spin);
        dice.className = "bt-dice landed pip-" + ev.face;
        sfx("land");
        // verdict付き(おしりのなみだ等)は成功/失敗ではなく効果量を出す
        banner(ev.verdict ? `🎲 <b>${ev.face}</b> — ${ev.label}` : `🎲 <b>${ev.face}</b> — ${ev.label}なら成功`);
        // 結果はバナーとは別に、判定スタンプとしてドンと出す
        const vtext = ev.verdict ? `✨ ${ev.verdict}` : ev.ok ? "✅ 成功!" : "❌ 失敗…";
        wrap.appendChild(el(`<div class="bt-verdict ${ev.ok ? "ok" : "ng"}">${vtext}</div>`));
        if (ev.ok) sfx("event");
        pushLog(ev.verdict
          ? `判定🎲${ev.face}(${ev.label})→${ev.verdict}`
          : `判定🎲${ev.face}(${ev.label}で成功)→${ev.ok ? "成功" : "失敗"}`, ev.side);
        await wait(DUR.diceCheck);
        wrap.remove();
        return;
      }

      case "damage": {
        hpOverride.set(ev.uid, ev.hp); // ここで初めてHPが減る
        const c = cardEl(ev.uid);
        // 攻撃側(行動中のモンスター)が踏み込む。相手を殴っている時だけ
        if (actingUid != null && actingUid !== ev.uid) {
          const a = cardEl(actingUid);
          if (a) {
            const dir = a.dataset.side === "you" ? "lunge-up" : "lunge-down";
            a.classList.add(dir);
            setTimeout(() => a.classList.remove(dir), 520);
            await wait(190); // 踏み込んでから当たるように少し待つ
          }
        }
        sfx("hit");
        if (c) {
          c.classList.add("hit");
          floatNum(ev.uid, "-" + ev.n, "dmg");
          const bar = c.querySelector(".bt-card-hp i");
          const num = c.querySelector(".bt-card-num");
          const max = Number((num.textContent.split("/")[1] || "1").trim());
          if (bar) bar.style.width = Math.max(0, (ev.hp / max) * 100) + "%";
          if (num) num.textContent = `${ev.hp} / ${max}`;
        }
        pushLog(`${nameOf(ev.id)}に${ev.n}ダメージ`);
        await wait(DUR.damage);
        if (ev.dead && c) { sfx("ko"); banner(`💥 <b>${nameOf(ev.id)}</b> は倒れた`); await wait(DUR.ko); }
        return;
      }

      case "heal": {
        hpOverride.set(ev.uid, ev.hp);
        const c = cardEl(ev.uid);
        sfx("heal");
        if (c) {
          c.classList.add("healed");
          floatNum(ev.uid, "+" + ev.n, "heal");
          const num = c.querySelector(".bt-card-num");
          const max = Number((num.textContent.split("/")[1] || "1").trim());
          const bar = c.querySelector(".bt-card-hp i");
          if (bar) bar.style.width = Math.min(100, (ev.hp / max) * 100) + "%";
          if (num) num.textContent = `${ev.hp} / ${max}`;
        }
        pushLog(`${nameOf(ev.id)}が${ev.n}回復`);
        await wait(DUR.heal);
        return;
      }

      case "useEvent": {
        // 使ったイベントカードを中央に大きく出し、効果文も併記する。
        // 特に相手のイベントは何が起きたのか分からなくなりがちなので、枠に効果を出す
        const def = CARDS[ev.id];
        closeStage();
        lastActionText = def.text; // 直後の判定ダイスの説明に使う
        // 相手のイベントは見落としやすいので、長めに出してから発動する
        const ms = ev.side === "foe" ? DUR.foeEvent : DUR.useEvent;
        // 出したら消えずに残し、時間いっぱいまで見せてから引っこめる
        // (以前は1.15s固定のアニメで消えていて、待ち時間より先にカードが消えていた)
        const pop = el(`<div class="bt-eventpop hold"></div>`);
        pop.appendChild(renderCard(def, ev.id));
        overlay.appendChild(pop);
        sfx("event");
        banner(`${who}は <b>${nameOf(ev.id)}</b> を使った`, def.text);
        bumpTrash(ev.side); render();
        pushLog(`${who}が${nameOf(ev.id)}を使用: ${def.text}`, ev.side);
        await wait(Math.max(0, ms - DUR.popOut));
        pop.classList.add("out");
        await wait(DUR.popOut);
        pop.remove();
        return;
      }

      case "bounce": {
        const c = cardEl(ev.uid);
        if (c) c.classList.add("leaving");
        // 場にいたとき(回復前)のHPを控えておき、手札にはまず減ったままの姿で出す
        const pre = hpOverride.has(ev.uid) ? hpOverride.get(ev.uid) : null;
        if (ev.side === "you") {
          handLimit++;
          if (pre != null && pre < ev.hp) handHpOverride.set(ev.uid, pre);
          renderHand(battle.state);
        } else foeHandLimit++;
        ghostMons = ghostMons.filter((g) => g.m.uid !== ev.uid);
        banner(`↩️ <b>${nameOf(ev.id)}</b> が手札に戻された`, "最大HPの半分回復");
        pushLog(`${nameOf(ev.id)}が手札に戻った`);
        await wait(DUR.bounce);
        // 手札の上で回復エフェクト → HPバーがするっと伸びる
        if (ev.side === "you" && handHpOverride.has(ev.uid)) {
          handHpOverride.delete(ev.uid);
          const mini = els.hand.querySelector(`[data-uid="${ev.uid}"]`);
          if (mini) {
            mini.classList.add("healed");
            sfx("heal");
            const max = CARDS[ev.id].hp;
            const bar = mini.querySelector(".bt-card-hp i");
            const num = mini.querySelector(".bt-card-num");
            if (bar) bar.style.width = Math.min(100, Math.round((ev.hp / max) * 100)) + "%";
            if (num) num.textContent = `${ev.hp} / ${max}`;
            await wait(600);
          }
        }
        return;
      }

      case "skipRoll":
        // 前に止められたときの「表示を消した」記録を捨てる。
        // 消さないと、2回目以降の行動停止バッジが出なくなる
        stopCleared.delete(ev.uid);
        render();
        banner(`🚫 <b>${nameOf(ev.id)}</b> は次のターン振れない`);
        pushLog(`${nameOf(ev.id)}を行動不能に`);
        await wait(DUR.skipRoll);
        return;

      case "discard": {
        // 手札から実際に1枚落ちるところを見せる
        const from = els.hand.querySelector(`[data-uid="${ev.uid}"]`);
        flyToTrash(ev.side, ev.id, ev.side === "you" ? from : null);
        if (ev.side === "you") {
          handGhosts = handGhosts.filter((g) => g.uid !== ev.uid);
          renderHand(battle.state);
        } else {
          foeHandLimit = Math.max(0, foeHandLimit - 1);
          renderFoeHand(foeHandLimit);
        }
        // own = ターン終了時に自分で捨てた(手札破壊と言い分ける)
        banner(ev.own
          ? `🗑 ${who}は <b>${nameOf(ev.id)}</b> を捨てた`
          : `🗑 ${who}の手札から <b>${nameOf(ev.id)}</b> がトラッシュへ`);
        bumpTrash(ev.side); render();
        pushLog(ev.own ? `${who}が${nameOf(ev.id)}を捨てた` : `${who}の手札から${nameOf(ev.id)}が落ちた`, ev.side);
        await wait(DUR.discard);
        return;
      }

      case "recover":
        if (ev.side === "you") { handLimit++; renderHand(battle.state); }
        else { foeHandLimit++; renderFoeHand(foeHandLimit); }
        banner(`♻️ <b>${nameOf(ev.id)}</b> をトラッシュから手札へ`);
        bumpTrash(ev.side, -1); render();
        pushLog(`${nameOf(ev.id)}を回収`);
        await wait(DUR.recover);
        return;

      case "draw": {
        sfx("draw");
        // スライドが着地したところで手札に1枚ずつ現れる
        const ms = flyFromDeck(ev.side, ev.n, 0, () => {
          if (!battle) return;
          if (ev.side === "you") { if (handLimit == null) return; handLimit++; renderHand(battle.state); }
          else { if (foeHandLimit == null) return; foeHandLimit++; renderFoeHand(foeHandLimit); }
        });
        pushLog(`${who}が${ev.n}枚引いた`, ev.side);
        await wait(Math.max(DUR.draw, ms));
        return;
      }

      case "noDraw": {
        banner("ドローなし", `手札が${DRAW_LIMIT + 1}枚以上なのでドローしない`);
        pushLog(`${who}は手札${ev.n}枚でドローなし`, ev.side);
        await wait(DUR.noDraw);
        return;
      }

      case "redraw": {
        // 任意マリガン: その側の手札を配り直す
        sfx("draw");
        banner(`${who}は手札を引き直した`);
        pushLog(`${who}が手札を引き直した`, ev.side);
        if (ev.side === "you") {
          handLimit = 0;
          render();
          const ms = flyFromDeck("you", ev.n, 0, () => {
            if (handLimit == null || !battle) return;
            handLimit++; renderHand(battle.state);
          });
          await wait(ms + 250);
        } else {
          foeHandLimit = 0;
          renderFoeHand(0);
          const ms = flyFromDeck("foe", ev.n, 0, () => {
            if (foeHandLimit == null) return;
            foeHandLimit++; renderFoeHand(foeHandLimit); sfx("draw");
          });
          await wait(ms + 250);
        }
        return;
      }

      case "mulligan": {
        // 対戦開始: 手札を空にしてから、1枚着地するたびに増やしていく
        banner("カードを配ります", `お互い${INITIAL_HAND}枚`);
        handLimit = 0;
        foeHandLimit = 0;
        render();
        sfx("draw");
        const a = flyFromDeck("foe", INITIAL_HAND, 0, () => {
          if (foeHandLimit == null) return; // 早送りで演出を追い越した分は捨てる
          foeHandLimit++; renderFoeHand(foeHandLimit); sfx("draw");
        });
        const b = flyFromDeck("you", INITIAL_HAND, 130, () => {
          if (handLimit == null || !battle) return;
          handLimit++; renderHand(battle.state);
        });
        await wait(Math.max(a, b) + 250);
        return;
      }

      case "trash": {
        // 場から消えるカードをトラッシュへ飛ばしてから盤面から外す
        const from = cardEl(ev.uid);
        flyToTrash(ev.side, ev.id, from);
        if (from) from.style.visibility = "hidden";
        await wait(DUR.trash);
        ghostMons = ghostMons.filter((g) => g.m.uid !== ev.uid);
        bumpTrash(ev.side);
        render();
        return;
      }

      case "over":
        actingUid = null;
        await wait(DUR.over);
        return;

      case "turnEnd": {
        actingUid = null; // ターンが終わったら行動中の強調を解除
        doneMons = new Set(); // 暗くしていたカードも明るく戻す
        // 召喚酔い・行動停止の表示もここで消す
        // (エンジン上は次の自分の手番まで状態が残るが、見た目は自分のターンの終わりで戻す)
        const fs = ev.side === "you" ? battle.state.you.field : battle.state.foe.field;
        for (const m of fs) { sickCleared.add(m.uid); stopCleared.add(m.uid); }
        closeStage();
        render();
        await wait(DUR.turnEnd);
        return;
      }

      default:
        return;
    }
  }

  // ---------- 結果と報酬 ----------
  function showResult(winner) {
    const win = winner === "you";
    sfx(win ? "win" : "lose");
    const box = el(
      `<div class="bt-result"><h2 style="color:${win ? "#ffd76e" : "#8fa3bd"}">${win ? "勝利!" : "敗北…"}</h2>` +
      `<div class="sub">${win
        ? "勝利報酬として、相手の固有カードから1枚もらえます"
        : "……出直シテキテクダサイ、とHELL 9000が言っています"}</div></div>`
    );
    const b = el(`<button class="bt-act big">${win ? "報酬を選ぶ" : "もどる"}</button>`);
    b.addEventListener("click", () => { box.remove(); finish(winner); });
    box.appendChild(b);
    overlay.appendChild(box);
  }

  // おしり星人の勝利報酬: 全レアカードを伏せて並べ、選んだ1枚をもらう
  function showRareReward() {
    const box = el(`<div class="bt-result"></div>`);
    overlay.classList.add("show");
    overlay.appendChild(box);
    box.appendChild(el(`<h2 style="color:#ffd76e">勝利報酬</h2>`));
    box.appendChild(el(
      `<div class="sub"><b>おしり星人</b>「ぶりっぷり!」<br>` +
      `<b>HELL 9000</b>「……1枚アゲルト言ッテイルヨウデス。スキナ札ヲ、ドウゾ」</div>`
    ));
    const ids = [...GACHA_POOL.rare];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const row = el(`<div class="pk-cards"></div>`);
    box.appendChild(row);
    let picked = false;
    ids.forEach((id, i) => {
      const slot = el(`<div class="pk-slot"><div class="pk-inner"><div class="pk-back"></div><div class="pk-front"></div></div></div>`);
      // pk-front内は実カードの縮小表示(.pk-front .pcard のscale)。ミニ版だと二重に縮んでしまう
      slot.querySelector(".pk-front").appendChild(renderCard(CARDS[id], id));
      row.appendChild(slot);
      setTimeout(() => slot.classList.add("in"), 60 * i);
      slot.addEventListener("click", () => {
        if (picked) return;
        picked = true;
        slot.classList.add("flip", "rare");
        sfx("rare");
        col.grantReward(id);
        deps.toast(`🎴 ${CARDS[id].name} を手に入れた!`);
        // 少ししてから残りもめくって、何が入っていたかを見せる
        setTimeout(() => {
          for (const s2 of row.children) if (s2 !== slot) { s2.classList.add("flip"); s2.style.opacity = ".45"; }
          const done = el(`<button class="bt-act big">もどる</button>`);
          done.addEventListener("click", () => {
            box.remove();
            overlay.classList.remove("show");
            if (deps.onFinish) deps.onFinish("you", "oshiriseijin");
          });
          box.appendChild(done);
        }, 800);
      });
    });
  }

  function showReward(key) {
    if (key === "oshiriseijin") { showRareReward(); return; }
    const box = el(`<div class="bt-result"></div>`);
    overlay.classList.add("show");
    overlay.appendChild(box);

    // 一覧から1枚選ぶ → 大きく表示して確認 → 決定
    const pickList = () => {
      box.innerHTML = "";
      box.appendChild(el(`<h2 style="color:#ffd76e">勝利報酬</h2>`));
      box.appendChild(el(`<div class="sub">好きなカードを1枚選んでください(タップすると大きく見られます)</div>`));
      const row = el(`<div class="bt-rewards"></div>`);
      for (const id of col.rewardChoices(key)) {
        // ミニ版=実カードの縮小(面・本文つき)。セルで包んでscaleする
        const cell = el(`<div class="bt-rewardcell"></div>`);
        cell.title = CARDS[id].name;
        cell.appendChild(renderCard(CARDS[id], id));
        cell.addEventListener("click", () => confirmOne(id));
        row.appendChild(cell);
      }
      box.appendChild(row);
    };

    const confirmOne = (id) => {
      box.innerHTML = "";
      box.appendChild(el(`<div class="sub">このカードを受け取りますか?</div>`));
      const holder = el(`<div class="bt-rewardbig"></div>`);
      holder.appendChild(renderCard(CARDS[id], id));
      box.appendChild(holder);
      const btns = el(`<div class="bt-rewardbtns"></div>`);
      const ok = el(`<button class="bt-act big">これで決定</button>`);
      ok.addEventListener("click", () => {
        col.grantReward(id);
        deps.toast(`🎴 ${CARDS[id].name} を手に入れた!`);
        packStep(); // 続けておまけのパックを開ける
      });
      const re = el(`<button class="bt-act ghost">選び直す</button>`);
      re.addEventListener("click", pickList);
      btns.appendChild(ok);
      btns.appendChild(re);
      box.appendChild(btns);
    };

    // 固有カードを選んだあと、おまけのパックを開ける
    // 固有カードを選んだあと、おまけのパックを開ける(購入時と同じ演出)
    const packStep = () => {
      const kind = col.rewardPack(key);
      const before = col.ownedAll();
      box.innerHTML = "";
      box.appendChild(el(`<div class="sub">勝利のおまけです</div>`));
      const host = el(`<div></div>`);
      box.appendChild(host);
      playPackOpen({
        host,
        pack: col.PACKS[kind],
        draw: () => col.openRewardPack(kind).cards,
        isNew: (id) => !before[id],
        sfx,
        onDone: () => {
          box.remove();
          overlay.classList.remove("show");
          if (deps.onFinish) deps.onFinish("you", key);
        },
      });
    };

    pickList();
  }

  // トラッシュの中身を一覧表示(カードをタップすると詳細)
  /** トラッシュから戻すカードなどを、画面中央にカードのまま並べて選ばせる */
  function showPickRow(uids, title) {
    if (pickRow && pickRow.dataset.key === uids.join(",")) return; // 出しっぱなしでよい
    closePickRow();
    const box = el(`<div class="bt-trashlist bt-pickrow"><h3>${title}</h3></div>`);
    box.dataset.key = uids.join(",");
    const grid = el(`<div class="grid"></div>`);
    for (const uid of uids) {
      const id = trashIdOf(uid);
      if (!CARDS[id]) continue;
      const mini = renderCard(CARDS[id], id, { mini: true });
      mini.title = CARDS[id].name;
      mini.addEventListener("click", (e) => {
        e.stopPropagation();
        pendingPick = uid;
        render();
      });
      grid.appendChild(mini);
    }
    box.appendChild(grid);
    overlay.appendChild(box);
    pickRow = box;
  }
  function clearSlideTimers() {
    for (const t of slideTimers) clearTimeout(t);
    slideTimers = [];
    for (const g of document.querySelectorAll(".bt-slide")) g.remove();
  }
  function closePickRow() {
    if (pickRow) { pickRow.remove(); pickRow = null; }
  }

  function showTrash(side) {
    if (!battle) return;
    const s = battle.state;
    const list = (side === "you" ? s.you.trash : s.foe.trash) || [];
    const box = el(
      `<div class="bt-trashlist"><h3>${side === "you" ? "あなた" : "相手"}のトラッシュ (${list.length}枚)</h3></div>`
    );
    if (!list.length) box.appendChild(el(`<div class="sub" style="opacity:.6">まだ何も入っていません</div>`));
    const grid = el(`<div class="grid"></div>`);
    for (const c of list) {
      const mini = renderCard(CARDS[c.id], c.id, { mini: true });
      mini.title = CARDS[c.id].name;
      mini.addEventListener("click", (e) => { e.stopPropagation(); showDetail(c.id); });
      grid.appendChild(mini);
    }
    box.appendChild(grid);
    const close = el(`<button class="bt-act ghost">閉じる</button>`);
    close.addEventListener("click", () => box.remove());
    box.appendChild(close);
    overlay.appendChild(box);
  }

  /**
   * 山札の一番上からカードが1枚ずつスライドして抜け、手札へ滑り込む演出。
   * @returns 全部終わるまでの時間(ms)
   */
  function flyFromDeck(side, n, offset = 0, onLand) {
    // 早送りや投了で取り残されたタイマーが後から悪さをしないよう控えておく
    const keep = (t) => { slideTimers.push(t); return t; };
    const deck = side === "you" ? els.youDeck : els.foeDeck;
    const target = side === "you" ? els.hand : els.foeHand;
    const dr = deck.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const step = 260;   // 1枚ずつ順に配る間隔
    const slide = 190;  // 束から抜き出すまで
    const move = 340;   // 手札へ滑り込むまで
    for (let i = 0; i < n; i++) {
      keep(setTimeout(() => {
        deck.classList.add("draw");
        keep(setTimeout(() => deck.classList.remove("draw"), 300));
        // カードが束から抜ける瞬間に山札の枚数を1減らす(数字が先に減るのを防ぐ)
        if (deckLimit[side] != null && battle) {
          deckLimit[side] = Math.max(0, deckLimit[side] - 1);
          render();
        }
        const g = el(`<div class="bt-slide"></div>`);
        g.style.left = dr.left + "px";
        g.style.top = dr.top + "px";
        g.style.width = dr.width + "px";
        g.style.height = dr.height + "px";
        document.body.appendChild(g);
        // ① 束の一番上から手札の方向へスッと抜き出す
        const outDx = (side === "you" ? -1 : 1) * dr.width * 0.6;
        requestAnimationFrame(() => {
          g.style.transition = `transform ${slide}ms ease-out`;
          g.style.transform = `translate(${outDx}px, -5px)`;
        });
        // ② そのまま手札へ滑り込む
        keep(setTimeout(() => {
          const dx = tr.left + tr.width * (side === "you" ? 0.66 : 0.5) - dr.left;
          const dy = tr.top + tr.height * 0.5 - (dr.top + dr.height * 0.5);
          g.style.transition = `transform ${move}ms cubic-bezier(.4,0,.3,1), opacity ${move}ms ease-in`;
          g.style.transform = `translate(${dx}px, ${dy}px) scale(.82)`;
          g.style.opacity = "0.2";
          keep(setTimeout(() => { g.remove(); if (onLand) onLand(); }, move + 30));
        }, slide));
      }, offset + i * step));
    }
    return offset + (n - 1) * step + slide + move + 60;
  }

  /** カードがトラッシュへ飛んでいく残像を出す */
  function flyToTrash(side, cardId, fromEl) {
    const target = side === "you" ? els.youTrash : els.foeTrash;
    const tr = target.getBoundingClientRect();
    const fr = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2 - 40, top: innerHeight / 2 - 55, width: 80, height: 110 };
    const g = el(`<div class="bt-fly"></div>`);
    g.style.left = fr.left + "px";
    g.style.top = fr.top + "px";
    g.style.width = fr.width + "px";
    g.style.height = fr.height + "px";
    g.style.backgroundImage = `url(assets/cards/${cardId}.jpeg)`;
    document.body.appendChild(g);
    requestAnimationFrame(() => {
      const dx = tr.left + tr.width / 2 - (fr.left + fr.width / 2);
      const dy = tr.top + tr.height / 2 - (fr.top + fr.height / 2);
      g.style.transform = `translate(${dx}px, ${dy}px) scale(.28) rotate(20deg)`;
      g.style.opacity = "0.15";
    });
    setTimeout(() => {
      g.remove();
      target.classList.add("flash");
      setTimeout(() => target.classList.remove("flash"), 500);
    }, 560);
  }

  function showDetail(id, uid) {
    if (!CARDS[id]) return;
    const w = el(`<div class="bt-result"></div>`);
    const card = renderCard(CARDS[id], id);
    if (uid != null) patchHp(card, uid); // 場のモンスターは現在HPも見せる
    w.appendChild(card);
    w.addEventListener("click", () => w.remove());
    overlay.appendChild(w);
  }

  return {
    start,
    get isOpen() { return overlay.classList.contains("show"); },
    // 検証用: 対戦演出をn倍速にする(__btSpeed)
    setSpeed(n) { speedMult = Math.max(0.1, +n || 1); return speedMult; },
  };
}
