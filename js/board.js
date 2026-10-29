// コレクションボード。
// 3D側: 本棚スラブ(office.jsの茶色い板)の前面に、所持カードのミニチュアを
//        1枚のCanvasTextureとして描いて貼る(カード入手のたびに再描画)。
// UI側: ボードをクリックするとグリッドのオーバーレイ(#board-overlay)を開き、
//        カードナンバー順に所持カードを並べる。未所持は空白スロット。
//        カードをクリックすると詳細(拡大カード)を表示する。

import * as THREE from "three";
import { CARDS, ATTRS } from "./carddata.js";
import { renderCard } from "./cards.js";
import * as col from "./collection.js";

// ミニチュア1枚ぶんの描画解像度とボードのグリッド
const SLOT_W = 180;
const SLOT_H = 260;
const COLS = 8;
const ROWS = 7;

const FRAME_COLORS = {
  power: ["#b0522d", "#4a1f16"],
  mecha: ["#3d6b9e", "#16294a"],
  occult: ["#6b4fa0", "#43306b"],
  event: ["#a8863c", "#4a3a16"],
};

/** カードナンバー順(M-001.., I-001..)の全カード */
export function cardsInNumberOrder() {
  return Object.values(CARDS).slice().sort((a, b) => {
    const pa = a.no[0] === "M" ? 0 : 1;
    const pb = b.no[0] === "M" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.no.localeCompare(b.no);
  });
}

export function createCollectionBoard(scene) {
  // ---------------- 3D側: アトラステクスチャの板 ----------------
  const canvas = document.createElement("canvas");
  canvas.width = SLOT_W * COLS;
  canvas.height = SLOT_H * ROWS;
  const g = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  // コルクボード(office.jsの薄い板・前面z=-2.90)の少し手前に貼る。
  // 8列×7段 = 56スロット。スロット比(180:260)を保つと縦長ボードになる。
  // MeshStandardMaterialにして部屋の照明の影響を受けさせる(Basicだと自己発光して見える)
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.7),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 })
  );
  plane.position.set(1.5, 1.6, -2.895);
  plane.userData.clickId = "board";
  scene.add(plane);

  const artCache = new Map(); // id -> Image | 'missing'
  let redrawQueued = false;

  function loadArt(id) {
    if (artCache.has(id)) return;
    const img = new Image();
    img.onload = () => { artCache.set(id, img); queueRedraw(); };
    img.onerror = () => { artCache.set(id, "missing"); queueRedraw(); };
    artCache.set(id, "loading");
    img.src = `assets/cards/${id}.jpeg`;
  }

  function queueRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => { redrawQueued = false; redraw(); });
  }

  /** ミニチュア1枚を(x,y)スロットに描く */
  function drawMini(def, x, y) {
    const W = SLOT_W - 8, H = SLOT_H - 8;
    const ox = x + 4, oy = y + 4;
    const [frame, frameDark] = FRAME_COLORS[def.kind === "event" ? "event" : def.attr];
    g.save();
    g.translate(ox, oy);
    g.beginPath(); g.roundRect(0, 0, W, H, 10); g.fillStyle = frame; g.fill();
    g.beginPath(); g.roundRect(2.5, 2.5, W - 5, H - 5, 8); g.fillStyle = frameDark; g.fill();
    // 名前帯(左: 名前 / 右: 番号)
    g.fillStyle = "rgba(20,12,20,.92)";
    g.beginPath(); g.roundRect(7, 7, W - 14, 20, 4); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 9px sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
    g.fillText(def.name, 12, 17.5, W - 60);
    g.fillStyle = "#ffe9c0"; g.font = "bold 8px ui-monospace, monospace"; g.textAlign = "right";
    g.fillText(def.no, W - 12, 17.5);
    // カード絵(実カードと同じ比率: 絵60% : 本文40%)
    const artY = 30;
    const remain = H - artY - 7 - 16 - 6;
    const artH = Math.round(remain * 0.6);
    const art = artCache.get(def.id);
    g.save();
    g.beginPath(); g.roundRect(7, artY, W - 14, artH, 4); g.clip();
    if (art && art !== "loading" && art !== "missing") {
      const sc = Math.max((W - 14) / art.width, artH / art.height);
      g.drawImage(art, 7 + (W - 14 - art.width * sc) / 2, artY + (artH - art.height * sc) / 2, art.width * sc, art.height * sc);
    } else {
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(7, artY, W - 14, artH);
      g.fillStyle = "rgba(255,255,255,.4)"; g.font = "bold 10px sans-serif"; g.textAlign = "center";
      g.fillText("ILLUST", W / 2, artY + artH / 2);
    }
    g.restore();
    // 種別帯
    const typeY = artY + artH + 3;
    g.fillStyle = "rgba(20,12,20,.92)";
    g.beginPath(); g.roundRect(7, typeY, W - 14, 16, 3); g.fill();
    const a = def.attr ? ATTRS[def.attr] : null;
    g.fillStyle = "#e0d8f0"; g.font = "7px sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(def.kind === "monster" ? `モンスター ・ ${a.icon}${a.label}` : "イベント", 12, typeY + 8.5);
    if (def.kind === "monster") {
      g.fillStyle = "#ffd76e"; g.font = "bold 9px sans-serif"; g.textAlign = "right";
      g.fillText(`HP ${def.hp}`, W - 12, typeY + 8.5);
    }
    // 本文(モンスター: 6面リスト / イベント: 効果テキスト)
    const bodyY = typeY + 19;
    const bodyH = H - bodyY - 7;
    g.fillStyle = "#f7f0dc";
    g.beginPath(); g.roundRect(7, bodyY, W - 14, bodyH, 4); g.fill();
    if (def.kind === "monster") {
      const rowH = (bodyH - 6) / 6;
      const PIPS = [
        [[0, 0]],
        [[-1.5, -1.5], [1.5, 1.5]],
        [[-1.8, -1.8], [0, 0], [1.8, 1.8]],
        [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]],
        [[-1.8, -1.8], [1.8, -1.8], [0, 0], [-1.8, 1.8], [1.8, 1.8]],
        [[-1.6, -1.9], [1.6, -1.9], [-1.6, 0], [1.6, 0], [-1.6, 1.9], [1.6, 1.9]],
      ];
      def.faces.forEach((f, i) => {
        const y2 = bodyY + 3 + rowH * i + rowH / 2;
        g.fillStyle = "#fff"; g.strokeStyle = "#8a7a5c"; g.lineWidth = 0.6;
        g.beginPath(); g.roundRect(11, y2 - 3, 6, 6, 1.2); g.fill(); g.stroke();
        g.fillStyle = "#5a3315";
        for (const [px, py] of PIPS[i]) { g.beginPath(); g.arc(14 + px * 0.7, y2 + py * 0.7, 0.6, 0, 7); g.fill(); }
        g.fillStyle = "#3a2c18"; g.font = "4.5px sans-serif"; g.textAlign = "left";
        g.fillText(f.text.slice(0, 32), 20, y2);
        if (i < 5) { g.strokeStyle = "rgba(0,0,0,.08)"; g.beginPath(); g.moveTo(11, y2 + rowH / 2); g.lineTo(W - 11, y2 + rowH / 2); g.stroke(); }
      });
    } else {
      g.fillStyle = "#3a2c18"; g.font = "6px sans-serif"; g.textAlign = "left"; g.textBaseline = "top";
      // 効果テキストを適当な幅で折り返す
      const maxW = W - 24;
      let line = "", ty = bodyY + 8;
      for (const ch of def.text) {
        if (g.measureText(line + ch).width > maxW) { g.fillText(line, 12, ty); ty += 9; line = ch; }
        else line += ch;
        if (ty > bodyY + bodyH - 12) break;
      }
      if (line && ty <= bodyY + bodyH - 12) g.fillText(line, 12, ty);
    }
    g.restore();
  }

  function redraw() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    // 下地: コルクボード風
    g.fillStyle = "#7a5c30";
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = "rgba(0,0,0,.18)";
    g.fillRect(0, 0, canvas.width, 10); g.fillRect(0, canvas.height - 10, canvas.width, 10);
    const list = cardsInNumberOrder();
    list.forEach((def, i) => {
      const x = (i % COLS) * SLOT_W;
      const y = Math.floor(i / COLS) * SLOT_H;
      if (col.ownedCount(def.id) > 0) {
        loadArt(def.id);
        const art = artCache.get(def.id);
        if (art === "loading") return; // 読み込み後に再描画される
        drawMini(def, x, y);
      } else {
        // 未所持: うっすら凹んだ空スロット+カードナンバー
        g.fillStyle = "rgba(0,0,0,.22)";
        g.beginPath(); g.roundRect(x + 6, y + 6, SLOT_W - 12, SLOT_H - 12, 10); g.fill();
        g.fillStyle = "rgba(255,255,255,.16)";
        g.font = "bold 22px ui-monospace, monospace";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(def.no, x + SLOT_W / 2, y + SLOT_H / 2);
      }
    });
    texture.needsUpdate = true;
  }

  // ---------------- UI側: グリッドのオーバーレイ ----------------
  const overlay = document.getElementById("board-overlay");
  const grid = document.getElementById("board-grid");
  const countEl = document.getElementById("board-count");
  document.getElementById("board-close").addEventListener("click", () => close());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  function close() { overlay.classList.remove("show"); }

  function show() {
    const list = cardsInNumberOrder();
    const ownedKinds = list.filter((d) => col.ownedCount(d.id) > 0).length;
    countEl.textContent = `${ownedKinds} / ${list.length} 種`;
    grid.innerHTML = "";
    for (const def of list) {
      if (col.ownedCount(def.id) > 0) {
        // セルで包む: スマホではセルを小さくしてカードをscaleで縮める(1行3枚)
        const cell = el(`<div class="board-cell"></div>`);
        const card = renderCard(def, def.id); // 拡大カードをそのまま並べる
        card.classList.add("board-slot-card");
        card.addEventListener("click", (e) => { e.stopPropagation(); zoom(def.id); });
        cell.appendChild(card);
        grid.appendChild(cell);
      } else {
        grid.appendChild(el(`<div class="board-slot-empty">${def.no}</div>`));
      }
    }
    overlay.classList.add("show");
  }

  /** グリッドのカードをクリック → いつもの拡大表示 */
  function zoom(id) {
    const box = el(`<div class="hell-zoomview"></div>`);
    box.appendChild(renderCard(CARDS[id], id));
    box.addEventListener("click", () => box.remove());
    document.body.appendChild(box);
  }

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  // カード入手のたびにボードを描き直す
  document.addEventListener("oshiri-cards-changed", queueRedraw);
  redraw();

  return { show, refresh: queueRedraw, get isOpen() { return overlay.classList.contains("show"); } };
}
