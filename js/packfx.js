// パック開封の演出。HELL 9000の購入画面と、対戦の勝利報酬の両方から使う。
// 「大きなパックを出す → 開けるボタン → 破れる → カードが1枚ずつめくれて出てくる」まで面倒を見る。
//
// 呼び出し側は「どのパックか」と「中身のカードID配列」を渡すだけ。
// 抽選は collection.js の担当で、ここは見せ方だけを持つ。

import { CARDS } from "./carddata.js";
import { renderCard } from "./cards.js";

const el = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * パック開封の演出を出す。
 * @param {object} o
 *   host    演出を差し込む親要素(中身は空にされる)
 *   pack    collection.js の PACKS の1件 { id, name, sub }
 *   draw    () => string[]  実際に開封してカードIDを返す関数(ボタンを押した瞬間に呼ぶ)
 *   isNew   (id) => boolean  NEWバッジを出すか
 *   sfx     (name) => void
 *   onDone  () => void       「もどる」を押したとき
 *   doneLabel  ボタンの文言
 */
export async function playPackOpen(o) {
  const host = o.host;
  const sfx = (n) => { if (o.sfx) o.sfx(n); };
  host.innerHTML = "";

  const stage = el(`<div class="pk-stage"></div>`);
  stage.appendChild(el(`<div class="pk-title">${o.pack.name}</div>`));
  stage.appendChild(el(`<div class="pk-sub">${o.pack.sub}</div>`));

  const holder = el(`<div class="pk-holder"></div>`);
  const pack = el(
    `<div class="pk-pack ${o.pack.id}">` +
    `<div class="pk-foil"></div>` +
    `<div class="pk-butt"></div>` +
    `<div class="pk-label">${o.pack.name}</div>` +
    `<div class="pk-tear"></div>` +
    `</div>`
  );
  holder.appendChild(pack);
  stage.appendChild(holder);

  const btn = el(`<button class="bt-act big pk-open">パックを開ける</button>`);
  stage.appendChild(btn);
  host.appendChild(stage);

  let opened = false;
  await new Promise((resolve) => {
    const go = () => { if (!opened) { opened = true; btn.remove(); resolve(); } };
    btn.addEventListener("click", go);
    pack.addEventListener("click", go);
  });

  // --- 破く ---
  sfx("tear");
  pack.classList.add("tearing");
  await wait(620);
  const flash = el(`<div class="pk-flash"></div>`);
  stage.appendChild(flash);
  await wait(180);
  flash.remove();

  const ids = o.draw();
  const rare = ids.filter((id) => CARDS[id] && CARDS[id].rarity === "rare");
  pack.classList.add("gone");
  await wait(220);
  pack.remove(); // 透明なまま残すと、出てくるカードが中央からずれる

  // --- カードが1枚ずつめくれて出てくる ---
  const row = el(`<div class="pk-cards"></div>`);
  holder.appendChild(row);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const def = CARDS[id];
    if (!def) continue;
    const slot = el(`<div class="pk-slot"><div class="pk-inner"><div class="pk-back"></div><div class="pk-front"></div></div></div>`);
    // ミニ版=実カードの縮小(CSSの .pk-front .pcard がscaleで縮める)。面や本文もそのまま見せる
    slot.querySelector(".pk-front").appendChild(renderCard(def, id));
    if (o.isNew && o.isNew(id)) slot.appendChild(el(`<span class="pk-new">NEW</span>`));
    if (def.rarity === "rare") slot.classList.add("rare");
    // めくれたあとはタップで拡大して読める
    slot.addEventListener("click", () => {
      if (!slot.classList.contains("flip")) return;
      const zoom = el(`<div class="hell-zoomview"></div>`);
      zoom.appendChild(renderCard(def, id));
      zoom.addEventListener("click", () => zoom.remove());
      document.body.appendChild(zoom);
    });
    row.appendChild(slot);
    await wait(120);
    slot.classList.add("in");
    await wait(260);
    slot.classList.add("flip");
    sfx(def.rarity === "rare" ? "rare" : "reveal");
    await wait(def.rarity === "rare" ? 700 : 320);
  }
  if (rare.length) {
    stage.appendChild(el(`<div class="pk-rarehit">レア!</div>`));
    await wait(200);
  }

  const done = el(`<button class="bt-act big">${o.doneLabel || "もどる"}</button>`);
  done.addEventListener("click", () => { if (o.onDone) o.onDone(); });
  stage.appendChild(done);
  // カードをタップで拡大したい呼び出し側のために、出したIDを返す
  return ids;
}
