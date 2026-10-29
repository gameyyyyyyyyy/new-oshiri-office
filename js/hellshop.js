// HELL 9000 のメニュー画面。購入 / デッキ構築 / 対戦 の3本立て。
// 3Dではなく図鑑と同じHTMLオーバーレイ。カードの見た目は cards.js の renderCard に任せる。

import { CARDS, OPPONENTS } from "./carddata.js";
import { renderCard } from "./cards.js";
import * as col from "./collection.js";
import { playPackOpen } from "./packfx.js";

// HELL 9000のひとこと(機械的で、微妙に脅してくる)
const LINES = {
  menu: [
    "……イラッシャイマセ。カードヲ、オ求メデスカ。",
    "……在庫ハ、無限デス。財布ハ、有限デス。",
    "……ヨウコソ。オ尻ノ対価ハ、カードデ支払ワレマス。",
  ],
  bought: [
    "……オ買イ上ゲ、アリガトウゴザイマス。",
    "……返品ハ、受ケ付ケマセン。",
    "……次モ、ドウゾ。",
  ],
  broke: [
    "……残高不足デス。オ尻ヲ、叩イテキテクダサイ。",
    "……ポイントガ、足リマセン。労働ヲ推奨シマス。",
  ],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createHellShop(deps) {
  // deps: { getPoints, spendPoints, toast, playSfx, onStartBattle }
  const overlay = document.getElementById("hell-overlay");
  const body = document.getElementById("hell-body");
  const pointsEl = document.getElementById("hell-points");
  document.getElementById("hell-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  let open = false;

  function close() { overlay.classList.remove("show"); open = false; }
  function refreshPoints() { pointsEl.textContent = deps.getPoints().toLocaleString() + " pt"; }

  function show() {
    open = true;
    overlay.classList.add("show");
    refreshPoints();
    screenMenu();
  }

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }
  function setBody(...nodes) {
    body.innerHTML = "";
    for (const n of nodes) body.appendChild(n);
    body.scrollTop = 0;
  }
  function backBtn(to) {
    const b = el(`<button class="hell-back">← もどる</button>`);
    b.addEventListener("click", to);
    return b;
  }

  // ---------- メニュー ----------
  function screenMenu() {
    const line = el(`<div class="hell-line">${pick(LINES.menu)}</div>`);
    const menu = el(`<div class="hell-menu"></div>`);
    const unlocked = col.unlocked();

    const buy = el(`<button class="hell-btn">🛒 パックを買う<small>${col.starterAvailable() ? "スターターパックは無料" : "カードを手に入れる"}</small></button>`);
    buy.addEventListener("click", screenShop);
    menu.appendChild(buy);

    const build = el(
      `<button class="hell-btn" ${unlocked ? "" : "disabled"}>🗂 デッキ構築` +
      `<small>${unlocked ? "モンスター5枚+イベント10枚を組む" : "無料のスターターパックを受け取ると使えます"}</small></button>`
    );
    build.addEventListener("click", screenDeck);
    menu.appendChild(build);

    const fight = el(
      `<button class="hell-btn" ${unlocked ? "" : "disabled"}>⚔️ 対戦する` +
      `<small>${unlocked ? "5人の相手から選ぶ" : "無料のスターターパックを受け取ると使えます"}</small></button>`
    );
    fight.addEventListener("click", screenOpponents);
    menu.appendChild(fight);

    const rules = el(`<button class="hell-btn">📜 ルールを読む<small>おしりバトルダイスの遊び方</small></button>`);
    rules.addEventListener("click", () => deps.onShowRules());
    menu.appendChild(rules);

    setBody(line, menu);
  }

  // ---------- 購入 ----------
  function packRow(kind) {
    const p = col.PACKS[kind];
    const price = col.packPrice(kind);
    const sold = kind === "starter" && !col.starterAvailable();
    const afford = deps.getPoints() >= price;
    const b = el(
      `<button class="hell-btn" ${sold || !afford ? "disabled" : ""}>` +
      `<span>${p.name}<small>${p.sub}${p.desc}</small></span>` +
      `<span class="hell-cost ${afford ? "" : "short"}">` +
      `${sold ? "受取済み" : price > 0 ? price.toLocaleString() + " pt" : "むりょう"}</span></button>`
    );
    if (!sold && afford) b.addEventListener("click", () => doBuy(kind));
    return b;
  }
  function screenShop() {
    refreshPoints();
    const line = el(
      `<div class="hell-line">……商品ハ3種類デス。価格ハ<b>一定</b>デス。` +
      `値切ル交渉ニハ、応ジマセン。</div>`
    );
    const packs = el(`<div class="hell-packs"></div>`);
    for (const k of ["starter", "normal", "rare"]) packs.appendChild(packRow(k));
    setBody(line, packs, backBtn(screenMenu));
  }

  function doBuy(kind) {
    const price = col.packPrice(kind);
    if (deps.getPoints() < price) { deps.toast(pick(LINES.broke)); return; }
    const before = col.ownedAll();
    deps.spendPoints(price);
    if (deps.playSfx) deps.playSfx();
    refreshPoints();
    // 先にポイントだけ引き、抽選は「開ける」を押した瞬間に行う
    if (kind === "starter") {
      // スターターは15枚あるので、演出せず一覧で見せる
      screenOpened(col.openPack(kind), before);
      return;
    }
    screenOpening(kind, before, price);
  }

  /** 購入したパックを大きく出して開封する */
  function screenOpening(kind, before, price) {
    const host = el(`<div></div>`);
    setBody(el(`<div class="hell-line">${pick(LINES.bought)} <b>−${price.toLocaleString()} pt</b></div>`), host);
    let res = null;
    playPackOpen({
      host,
      pack: col.PACKS[kind],
      draw: () => { res = col.openPack(kind); refreshPoints(); return res.cards; },
      isNew: (id) => !before[id],
      sfx: (n) => { if (deps.sfx) deps.sfx(n); },
      onDone: screenShop,
    });
  }

  function screenOpened(res, before) {
    refreshPoints();
    const line = el(
      `<div class="hell-line">${pick(LINES.bought)}` +
      (res.cost > 0 ? ` <b>−${res.cost.toLocaleString()} pt</b>` : " <b>むりょう</b>") + `</div>`
    );
    const seen = { ...before };
    let wrap;
    if (res.cards.length > 6) {
      // スターターパックは15枚。枠を全部出すと長すぎるので一覧で見せる
      wrap = el(`<div class="hell-list"></div>`);
      const tally = {};
      for (const id of res.cards) tally[id] = (tally[id] || 0) + 1;
      for (const [id, n] of Object.entries(tally)) {
        const def = CARDS[id];
        const isNew = !seen[id];
        wrap.appendChild(el(
          `<div class="hell-list-item"><span class="a">${def.kind === "monster" ? "👾" : "📜"}</span>` +
          `<span>${def.name}${isNew ? ' <span class="hell-new" style="position:static">NEW</span>' : ""}</span>` +
          `<span class="q">×${n}</span></div>`
        ));
        seen[id] = (seen[id] || 0) + n;
      }
    } else {
      wrap = el(`<div class="hell-open"></div>`);
      res.cards.forEach((id, i) => {
        const holder = el(`<div class="hell-cardwrap"></div>`);
        const card = renderCard(CARDS[id], id);
        card.style.animationDelay = i * 0.12 + "s";
        if (!seen[id]) holder.appendChild(el(`<span class="hell-new">NEW</span>`));
        seen[id] = (seen[id] || 0) + 1;
        holder.appendChild(card);
        wrap.appendChild(holder);
      });
    }
    setBody(line, wrap, backBtn(screenShop));
  }

  /** カード1枚を大きく表示する(デッキ構築の🔍から) */
  function showCard(id) {
    const box = el(`<div class="hell-zoomview"></div>`);
    box.appendChild(renderCard(CARDS[id], id));
    box.addEventListener("click", () => box.remove());
    overlay.appendChild(box);
  }

  // ---------- デッキ構築 ----------
  let draft = null;
  function screenDeck() {
    draft = new Map((col.getDeck() || []).map(([id, n]) => [id, n]));
    renderDeck();
  }
  function draftCounts() {
    let mon = 0, ev = 0;
    for (const [id, n] of draft) (CARDS[id].kind === "monster" ? (mon += n) : (ev += n));
    return { mon, ev };
  }
  function renderDeck(keepScroll) {
    // カードをタップするたびに再描画するので、スクロール位置を保って戻す
    const st = keepScroll ? body.scrollTop : 0;
    const { mon, ev } = draftCounts();
    const okMon = mon === col.DECK_MONSTERS, okEv = ev === col.DECK_EVENTS;
    const bar = el(
      `<div class="hell-deckbar">` +
      `<span>モンスター <b class="${okMon ? "ok" : "ng"}">${mon}/${col.DECK_MONSTERS}</b></span>` +
      `<span>イベント <b class="${okEv ? "ok" : "ng"}">${ev}/${col.DECK_EVENTS}</b></span>` +
      `<span style="opacity:.6">タップで+1 / 右クリック・長押しで−1</span></div>`
    );
    // 5枚+10枚が揃った時だけピンクにして、確定できることを目立たせる
    const ready = okMon && okEv;
    const save = el(
      `<button class="hell-btn hell-save${ready ? " hell-ready" : ""}" ${ready ? "" : "disabled"}>💾 確定</button>`
    );
    save.addEventListener("click", () => {
      col.setDeck([...draft].filter(([, n]) => n > 0));
      // 「デッキを保存しました」のトーストは出さない(2026-08-27 ユーザー指示)
      screenMenu();
    });
    // 画面下部に「キャンセル」と「確定」を並べる
    const foot = el(`<div class="hell-deckfoot"></div>`);
    const cancel = el(`<button class="hell-back">キャンセル</button>`);
    cancel.addEventListener("click", screenMenu);
    foot.appendChild(cancel);
    foot.appendChild(save);

    const grid = el(`<div class="hell-grid"></div>`);
    const ids = col.ownedKinds().sort((a, b) => {
      const A = CARDS[a], B = CARDS[b];
      if (A.kind !== B.kind) return A.kind === "monster" ? -1 : 1;
      return A.name.localeCompare(B.name, "ja");
    });
    for (const id of ids) {
      const def = CARDS[id];
      const n = draft.get(id) || 0;
      const isMon = def.kind === "monster";
      const slot = el(
        `<div class="hell-slot ${isMon ? "mon" : "ev"} ${n ? "in" : ""}">` +
        `<button class="hell-zoom" title="カードを大きく見る">🔍</button>` +
        `<span class="n">${n}/${col.ownedCount(id)}</span>` +
        `${def.name}<span class="k">${isMon ? "👾 モンスター" : "📜 イベント"}</span></div>`
      );
      const add = () => { if ((draft.get(id) || 0) < col.ownedCount(id)) { draft.set(id, (draft.get(id) || 0) + 1); renderDeck(true); } };
      const sub = () => { const c = draft.get(id) || 0; if (c > 0) { draft.set(id, c - 1); renderDeck(true); } };
      let held = 0;
      let longFired = false; // 長押しで−1した直後の click は捨てる(+1で相殺されるため)
      slot.addEventListener("click", () => {
        if (longFired) { longFired = false; return; }
        add();
      });
      // 右クリックは contextmenu で−1する。長押しタイマーも走っていると−2になるので必ず止める
      slot.addEventListener("contextmenu", (e) => { e.preventDefault(); clearTimeout(held); held = 0; sub(); });
      // 長押しの−1は左ボタン(またはタッチ)のときだけ
      slot.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        longFired = false;
        held = setTimeout(() => { longFired = true; sub(); }, 450);
      });
      for (const ev2 of ["pointerup", "pointerleave", "pointercancel"])
        slot.addEventListener(ev2, () => clearTimeout(held));
      // 🔍 は枚数を増やさずにカードだけ見せる
      const zoom = slot.querySelector(".hell-zoom");
      zoom.addEventListener("click", (e) => { e.stopPropagation(); showCard(id); });
      zoom.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
      grid.appendChild(slot);
    }
    setBody(bar, grid, foot);
    if (keepScroll) body.scrollTop = st;
  }

  // ---------- 対戦相手選択 ----------
  function screenOpponents() {
    const errs = col.validateDeck(col.getDeck() || []);
    const line = el(
      `<div class="hell-line">${errs.length
        ? "……デッキガ不正デス。先ニ構築シテクダサイ: " + errs[0]
        : "……対戦相手ヲ、選択シテクダサイ。"}</div>`
    );
    const menu = el(`<div class="hell-menu"></div>`);
    // 1つ下の難易度に1勝するまで挑戦できない(星は最初から開いている)
    OPPONENTS.forEach((o, i) => {
      const w = col.winCount(o.key);
      const prev = OPPONENTS[i - 1];
      const locked = !!prev && col.winCount(prev.key) === 0;
      // 隠しボスは解禁まで名前を伏せる
      const hidden = o.key === "oshiriseijin" && locked;
      const label = hidden ? "???" : o.label;
      const prevLabel = prev && (prev.key === "oshiriseijin" && col.winCount("ojisan") === 0 ? "???" : prev.label);
      const b = el(
        `<button class="hell-btn" ${errs.length || locked ? "disabled" : ""}>` +
        `<span>${locked ? "🔒 " : ""}${"★".repeat(o.difficulty)}` +
        `<span style="opacity:.3">${"★".repeat(Math.max(0, 5 - o.difficulty))}</span> ${label}` +
        `<small>${locked ? `${prevLabel}に1勝すると挑戦できます` : w ? `${w}勝` : "未対戦"}</small></span></button>`
      );
      if (!locked) b.addEventListener("click", () => { close(); deps.onStartBattle(o.key); });
      menu.appendChild(b);
    });
    setBody(line, menu, backBtn(screenMenu));
  }

  return { show, close, get isOpen() { return open; } };
}
