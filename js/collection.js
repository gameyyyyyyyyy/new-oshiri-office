// カードの所持数・デッキ・戦績の永続化と、HELL 9000のパック販売。
// 価格は固定(累進は廃止)。所持カード・デッキ・戦績・天井カウンタ・
// 未開封パックはlocalStorageに保存する。

import { CARDS, STARTER_DECK, GACHA_POOL, OPPONENTS } from "./carddata.js";

import { storage, readJSON, countMap, count, isRecord } from "./storage.js";

const KEY_CARDS = "oshiri_cards";   // { [カードID]: 所持枚数 }
const KEY_DECK = "oshiri_deck";     // [[カードID, 枚数], ...]
const KEY_WINS = "oshiri_cardwins"; // { [対戦相手key]: 勝利数 }
const KEY_MISC = "oshiri_cardmisc"; // { starterBought: bool, pity: number }

function save(key, value) { storage.setItem(key, JSON.stringify(value)); }
const cardIds = Object.keys(CARDS);
const opponentKeys = OPPONENTS.map((o) => o.key);
let owned = countMap(readJSON(KEY_CARDS, {}), cardIds);
let wins = countMap(readJSON(KEY_WINS, {}), opponentKeys);
function normalizeDeck(value) {
  if (!Array.isArray(value) || value.length > cardIds.length) return null;
  const totals = new Map();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [id, n] = entry;
    if (typeof id !== "string" || !Object.hasOwn(CARDS, id) || !Number.isInteger(n) || n < 0 || n > 15) return null;
    const total = (totals.get(id) || 0) + n;
    if (total > 15 || total > ownedCount(id)) return null;
    if (total) totals.set(id, total);
  }
  return [...totals];
}
let deck = normalizeDeck(readJSON(KEY_DECK, null));
const savedMisc = readJSON(KEY_MISC, {});
let misc = {
  starterBought: isRecord(savedMisc) && savedMisc.starterBought === true,
  pity: isRecord(savedMisc) ? count(savedMisc.pity, 0, 10) : 0,
};

// ---------- パックの定義 ----------
export const PACKS = {
  starter: {
    id: "starter", name: "スターターパック", sub: "対戦に必要な15枚が入った基本デッキ。",
    price: 0, once: true, // 無料。カードゲームの入り口なので、ポイント0でも始められる
    desc: "<b>特別に無料デス</b>。",
  },
  normal: {
    id: "normal", name: "夜明けのお尻", sub: "ノーマルブースター・3枚入り。",
    price: 20000, cards: 3, rarePerPack: 0.01,
    desc: "<b>ごくまれに</b>レアが混ジリマス。",
  },
  rare: {
    id: "rare", name: "お尻星の覇者", sub: "レアブースター・3枚入り。",
    price: 100000, cards: 3, rarePerPack: 0.2, pityAt: 10,
    desc: "<b>レアが出ヤスイデス</b>。",
  },
};

/** パックの価格(固定。買うほど値上がりする累進は廃止した) */
export function packPrice(kind) { return PACKS[kind].price; }

/** スターターパックは生涯1回だけ */
export function starterAvailable() { return !misc.starterBought; }

/** カードゲームが解禁されているか(スターターを買ったか) */
export function unlocked() { return misc.starterBought; }

export function ownedCount(id) { return owned[id] || 0; }
export function ownedAll() { return { ...owned }; }
export function ownedKinds() { return Object.keys(owned).filter((id) => owned[id] > 0); }

function grant(ids) {
  for (const id of ids) {
    if (Object.hasOwn(CARDS, id)) owned[id] = count((owned[id] || 0) + 1);
  }
  save(KEY_CARDS, owned);
  // コレクションボード(3D)がカード入手を検知して描き直せるように知らせる
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("oshiri-cards-changed"));
}

function pickRandom(list, rnd) { return list[Math.floor(rnd() * list.length)]; }

/** レアブースターの共通枠はガチャ限定カードだけ(スタートデッキの11種は出ない) */
function commonPool(kind) {
  return kind === "rare" ? GACHA_POOL.premium : GACHA_POOL.common;
}

/**
 * パックを開ける。ポイントが足りるかは呼び出し側で確認済みの前提。
 * @returns {{ cost:number, cards:string[] }} 引いたカードIDの配列(レアは重複しうる=単純ランダム)
 */
export function openPack(kind, rnd = Math.random) {
  const p = PACKS[kind];
  const cost = packPrice(kind);
  let cards;
  if (kind === "starter") {
    cards = [];
    for (const [id, n] of STARTER_DECK) for (let i = 0; i < n; i++) cards.push(id);
    misc.starterBought = true;
    save(KEY_MISC, misc);
    // 買った直後に遊べるよう、スターターの構成をそのままデッキに入れる
    deck = STARTER_DECK.map(([id, n]) => [id, n]);
    save(KEY_DECK, deck);
  } else {
    cards = [];
    // レア枠の判定はパック単位。天井はレアブースターのみ
    let rareHit = rnd() < p.rarePerPack;
    if (p.pityAt && misc.pity >= p.pityAt) rareHit = true;
    if (kind === "rare") {
      misc.pity = rareHit ? 0 : misc.pity + 1;
      save(KEY_MISC, misc);
    }
    for (let i = 0; i < p.cards; i++) {
      const isRare = rareHit && i === p.cards - 1; // レアは最後の1枚に置く(開封演出映え)
      cards.push(pickRandom(isRare ? GACHA_POOL.rare : commonPool(kind), rnd));
    }
  }
  grant(cards);
  return { cost, cards };
}

// ---------- デッキ ----------
export const DECK_MONSTERS = 5;
export const DECK_EVENTS = 10;

export function getDeck() { return deck ? deck.map(([id, n]) => [id, n]) : null; }
export function setDeck(list) { deck = normalizeDeck(list); save(KEY_DECK, deck); }

/** デッキが規定どおりか調べる。問題があれば理由の配列を返す */
export function validateDeck(list) {
  const normalized = normalizeDeck(list);
  if (!normalized) return ["デッキの保存データが正しくありません。選び直してください。"];
  list = normalized;
  const errs = [];
  let mon = 0, ev = 0;
  for (const [id, n] of list) {
    const def = CARDS[id];
    if (!def) { errs.push(`未知のカード: ${id}`); continue; }
    if (n > ownedCount(id)) errs.push(`${def.name} は ${ownedCount(id)}枚しか持っていません`);
    if (def.kind === "monster") mon += n; else ev += n;
  }
  if (mon !== DECK_MONSTERS) errs.push(`モンスターは${DECK_MONSTERS}枚ちょうど(いま${mon}枚)`);
  if (ev !== DECK_EVENTS) errs.push(`イベントは${DECK_EVENTS}枚ちょうど(いま${ev}枚)`);
  return errs;
}

// ---------- 戦績と勝利報酬 ----------
export function winCount(key) { return wins[key] || 0; }
export function recordWin(key) {
  if (!opponentKeys.includes(key)) return;
  wins[key] = count((wins[key] || 0) + 1); save(KEY_WINS, wins);
}

/**
 * 勝利報酬のパック。おじさんはレア確定、それ以外は五分でノーマル/レア。
 * 開封は報酬画面で行うので、ここでは種類を決めるだけ。
 */
export function rewardPack(opponentKey, rnd = Math.random) {
  if (opponentKey === "ojisan") return "rare";
  return rnd() < 0.5 ? "rare" : "normal";
}

/** 勝利報酬のパックを開ける(ポイントは減らさない) */
export function openRewardPack(kind, rnd = Math.random) {
  const p = PACKS[kind];
  const cards = [];
  let rareHit = rnd() < p.rarePerPack;
  if (p.pityAt && misc.pity >= p.pityAt) rareHit = true;
  if (kind === "rare") {
    misc.pity = rareHit ? 0 : misc.pity + 1;
    save(KEY_MISC, misc);
  }
  for (let i = 0; i < p.cards; i++) {
    const isRare = rareHit && i === p.cards - 1;
    cards.push(pickRandom(isRare ? GACHA_POOL.rare : commonPool(kind), rnd));
  }
  grant(cards);
  return { cost: 0, cards };
}

/** そのキャラに勝ったときに選べる固有カード(4種) */
export function rewardChoices(opponentKey) {
  return Object.values(CARDS).filter((c) => c.rarity === "unique" && c.owner === opponentKey).map((c) => c.id);
}
export function grantReward(id) { grant([id]); }

/** デバッグ・図鑑用 */
export function resetAll() {
  owned = Object.create(null); deck = null; wins = Object.create(null); misc = { starterBought: false, pity: 0 };
  for (const k of [KEY_CARDS, KEY_DECK, KEY_WINS, KEY_MISC]) storage.removeItem(k);
}
