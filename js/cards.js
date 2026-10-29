// カードの見た目(枠・テキスト配置)。データは carddata.js、対戦ロジックは cardgame.js。
// イラストだけ assets/cards/<id>.jpg を差し込み、枠・文字・アイコンは全てDOMで描く。

export const ATTR = {
  power:  { label: "パワー",   icon: "⚡", cls: "power" },
  mecha:  { label: "メカ",     icon: "🔧", cls: "mecha" },
  occult: { label: "オカルト", icon: "✨", cls: "occult" },
};

// サイコロの目はCSSで描く(⚀⚁…のUnicodeは環境によって豆腐になるため)

// イラスト未生成のカードID。一度404を踏んだら以降はimgを作らない
const missingArt = new Set();

// 枠の確認用サンプル(本実装では carddata.js から読む)
export const SAMPLE_CARDS = {
  ojisan: {
    kind: "monster", name: "おじさん", attr: "power", hp: 105, rarity: "unique",
    flavor: "今日も定時では帰れない。",
    faces: [
      "からぶり — 何も起きない",
      "ビンタ — 相手モンスター1体に30ダメージ",
      "しりふり — 相手モンスター全員に25ダメージ",
      "ひとやすみ — イベントカードを1枚使う",
      "ほんきをだす — イベントカードを2枚使う",
      "しゃくねつのおしり — 相手モンスター1体に50ダメージ",
    ],
  },
  slipper: {
    kind: "event", name: "スリッパ", attr: null, rarity: "common",
    flavor: "どこの家にもある、最も身近な凶器。",
    text: "相手モンスター1体に30ダメージ",
  },
  oshiriseijin: {
    kind: "monster", name: "おしり星人", attr: "power", hp: 110, rarity: "rare",
    flavor: "遥か彼方、おしり星からの来訪者。",
    faces: [
      "テレパシー — カードを1枚引く",
      "みどりのてのひら — 相手モンスター1体に30ダメージ",
      "こうしん — イベントカードを1枚使う",
      "アブダクション — 相手モンスター1体を持ち主の手札に戻す。相手の手札を1枚トラッシュ",
      "おしりビーム — 相手モンスター全員に40ダメージ",
      "わくせいのいかり — 相手モンスター1体に65ダメージ",
    ],
  },
};

/**
 * カード1枚をDOMで組み立てて返す。
 * @param {object} def カード定義
 * @param {string} id  イラストのファイル名に使うID
 * @param {object} opts { mini: true で手札用の小サイズ }
 */
export function renderCard(def, id, opts = {}) {
  const a = def.attr ? ATTR[def.attr] : null;
  const el = document.createElement("div");
  el.className = [
    "pcard",
    a ? "pcard-" + a.cls : "pcard-event",
    def.rarity === "rare" ? "pcard-rare" : "",
    opts.mini ? "pcard-mini" : "",
  ].filter(Boolean).join(" ");

  const head = document.createElement("div");
  head.className = "pcard-head";
  head.innerHTML =
    `<span class="pcard-name">${def.name}</span>` +
    `<span class="pcard-no">${def.no || ""}</span>`; // 右上はカードナンバー(属性は種別帯に出る)
  el.appendChild(head);

  const art = document.createElement("div");
  art.className = "pcard-art" + (def.kind === "event" ? " pcard-art-tall" : "");
  // イラストが未生成のあいだはプレースホルダを出す。
  // 一度404だったIDは覚えておき、以降はimgを作らない(再描画のたびに404が飛ぶのを防ぐ)
  const ph = `<div class="pcard-art-ph"${missingArt.has(id) ? "" : ' style="display:none"'}>ILLUST<br><small>${id}</small></div>`;
  if (missingArt.has(id)) {
    art.innerHTML = ph;
  } else {
    // イラストは1024pxの原寸(1枚150KB前後)。手札に何枚も並ぶので遅延読み込みにする
    art.innerHTML = `<img alt="" loading="lazy" decoding="async" src="assets/cards/${id}.jpeg">` + ph;
    const img = art.firstElementChild;
    img.addEventListener("error", () => {
      missingArt.add(id);
      img.style.display = "none";
      img.nextElementSibling.style.display = "flex";
    });
  }
  el.appendChild(art);

  const type = document.createElement("div");
  type.className = "pcard-type";
  type.innerHTML =
    `<span>${def.kind === "monster" ? "モンスター" : "イベント"}${a ? " ・ " + a.icon + a.label : ""}</span>` +
    (def.kind === "monster" ? `<span class="pcard-hp">HP ${def.hp}</span>` : "");
  el.appendChild(type);

  const body = document.createElement("div");
  body.className = "pcard-body";
  if (def.kind === "monster") {
    // 面テキストが長いカード(占い少年マイケル等)は行数が増えて枠から見切れるので、
    // 折り返し行数の見積もりが多いカードだけ文字を詰める
    const lines = def.faces.reduce((n, f) => {
      const t = typeof f === "string" ? f : f.text;
      return n + Math.ceil(t.length / 27);
    }, 0);
    if (lines >= 9) el.classList.add("pcard-dense");
    // faces は carddata.js では {text, fx} オブジェクト。見本データは文字列。どちらも受ける
    body.innerHTML = def.faces
      .map((f, i) => {
        const t = typeof f === "string" ? f : f.text;
        return `<div class="pcard-face"><span class="pcard-pip pip-${i + 1}"></span><span>${t}</span></div>`;
      })
      .join("");
  } else {
    body.innerHTML = `<div class="pcard-text">${def.text}</div>`;
    if (def.flavor) body.innerHTML += `<div class="pcard-flavor">${def.flavor}</div>`;
  }
  el.appendChild(body);

  return el;
}
