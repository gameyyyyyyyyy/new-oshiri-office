// 「おしりバトルダイス」のルール表示。HELL 9000のメニューと対戦画面の両方から開く。
// ルールの本文はここだけにある(文言を直すときはこのファイルを見ればよい)。

import { INITIAL_HAND, DRAW_LIMIT, REROLL_TOKENS } from "./cardengine.js";

const RULES = [
  {
    h: "勝ち負け",
    p: [
      "自分のターンのはじめに<b>場にモンスターがおらず、手札からも出せなければ負け</b>。",
    ],
  },
  {
    h: "ゲーム開始",
    p: [
      `最初の手札は<b>${INITIAL_HAND}枚</b>。モンスターが1枚も無ければ自動で配り直される。`,
      "そのうえで、<b>1回だけ引き直せる</b>。",
    ],
  },
  {
    h: "ターンの流れ",
    ol: [
      `<b>ドロー</b> — 手札が<b>${DRAW_LIMIT}枚以下なら</b>山札から1枚引く`,
      "<b>召喚</b> — 1ターンに1体・場は<b>最大2体</b>まで。交換もできる。出したターンは攻撃できない(召喚酔い)",
      "<b>攻撃</b> — 場のモンスター1体ずつにサイコロを振り、出た目のテキストを実行する",
      "<b>ターン終了</b> — 手札を<b>1枚捨ててもよい</b>",
    ],
  },
  {
    h: "ダイス振り直し",
    p: [
      `出た目を見てから<b>振り直せる</b>。1試合に<b>${REROLL_TOKENS}回</b>まで。`,
      "「サイコロを振って○○なら」の判定ダイスにも使える。",
    ],
  },
  {
    h: "勝利報酬",
    p: [
      "対戦に勝つと<b>カード1枚とパックが1つ</b>もらえる。",
    ],
  },
  {
    h: "デッキ",
    p: [
      "<b>モンスター5枚 + イベント10枚 = ちょうど15枚</b>。",
      "同じカードは何枚でも入れられる。",
    ],
  },
  {
    h: "モンスター",
    p: [
      "カードには6つのテキストがあり、<b>出た目の行だけ</b>が起こる。",
      "交換やバウンスで<b>手札に戻ったモンスターは最大HPの半分回復する</b>。",
    ],
  },
  {
    h: "イベントカード",
    p: [
      "モンスターの出目に<b>「イベントカードを使う」が出たときだけ</b>使える。",
    ],
  },
  {
    h: "属性",
    p: [
      "⚡パワー / 🔧メカ / ✨オカルト の3種。<b>相性による有利不利はない</b>。" +
      "「メカ属性のモンスター1体に70ダメージ」のように、カードのテキストの中でだけ意味を持つ。",
    ],
  },
];

export function createCardRules() {
  const overlay = document.getElementById("rules-overlay");
  const body = document.getElementById("rules-body");
  document.getElementById("rules-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  let built = false;
  function build() {
    if (built) return;
    built = true;
    for (const sec of RULES) {
      const d = document.createElement("section");
      d.className = "rules-sec";
      let html = `<h3>${sec.h}</h3>`;
      if (sec.ol) html += "<ol>" + sec.ol.map((t) => `<li>${t}</li>`).join("") + "</ol>";
      if (sec.p) html += sec.p.map((t) => `<p>${t}</p>`).join("");
      d.innerHTML = html;
      body.appendChild(d);
    }
  }

  function open() { build(); overlay.classList.add("show"); body.scrollTop = 0; }
  function close() { overlay.classList.remove("show"); }

  return { open, close, get isOpen() { return overlay.classList.contains("show"); } };
}
