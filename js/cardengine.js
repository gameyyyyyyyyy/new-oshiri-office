// js/cardengine.js
// おしりバトルダイス 対戦エンジン(ブラウザ用ESモジュール / 外部依存なし)
//
// UI(DOM)には一切触れない純粋なロジック。描画は state を読んで、演出は onEvent を聴く。
// ルールとAIの判断は sim/cardgame-sim.mjs (調整済みの正) からの移植。
// カード定義は js/carddata.js を import して使う(このファイルはカードを持たない)。
//
// ■ 使い方
//   import { createBattle } from './cardengine.js';
//   const battle = createBattle({
//     playerDeck: [['yamamoto',1], ['slipper',2], ...],  // [カードID, 枚数]
//     opponentKey: 'hoshi',                              // OPPONENTS の key
//     seed: 12345,                                       // 省略時は Math.random ベース
//   });
//   battle.onEvent(ev => queueAnimation(ev));
//   battle.state            // 盤面スナップショット(読み取り専用)
//   battle.state.prompt     // 今UIに選ばせたいもの(null なら選択待ちではない)
//   battle.choose(uid)      // prompt に答える
//   battle.roll()           // prompt.kind==='roll' のとき、ダイス演出のあとに呼ぶ
//   battle.autoPlayTurn()   // 相手(AI)の手番を最後まで自動で進める
//
// ■ 進行モデル
//   ターン処理はジェネレータのコルーチンで書かれていて、選択が必要になると yield して止まる。
//   AI側の選択は同じ処理の中で AI プロファイルが自動で埋めるので、コードは1本しかない。
//   ターン境界でも必ず止まる。プレイヤーのターンは自動で開始し、
//   AIのターンは autoPlayTurn() を呼ぶまで始まらない(UIが演出を挟めるように)。

import { CARDS, OPPONENT_DECKS, OPPONENTS } from './carddata.js';

// ---------------------------------------------------------------------------
// 0. 乱数 (mulberry32・シード固定で再現性あり)
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** シード付き乱数。同じシードなら必ず同じ試合になる */
// 検証用: 次に振られるダイス目を強制するキュー(モンスターロール・判定ダイス・なみだ全部に効く)。
// ブラウザでは __rig(6,6,1) のように積む。空になったら通常の乱数に戻る
export const RIGGED_FACES = [];
if (typeof window !== 'undefined') {
  window.__rig = (...faces) => {
    RIGGED_FACES.length = 0;
    for (const f of faces.flat()) RIGGED_FACES.push(Math.min(6, Math.max(1, f | 0)));
    return RIGGED_FACES.slice();
  };
}

export function makeRng(seed) {
  const f = mulberry32(seed);
  return {
    next() {
      return f();
    },
    /** 0..n-1 */
    int(n) {
      return Math.floor(f() * n) % n;
    },
    d6() {
      if (RIGGED_FACES.length) return RIGGED_FACES.shift();
      return 1 + this.int(6);
    },
    pick(arr) {
      return arr[this.int(arr.length)];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. 定数
// ---------------------------------------------------------------------------

export const MAX_TURNS = 200; // 打ち切り(引き分け)
export const INITIAL_HAND = 4; // 初期手札(手札の上限は設けていない)
export const DRAW_LIMIT = 5;   // ターン開始時、手札がこの枚数以下ならドローする
export const REROLL_TOKENS = 5; // 1試合に振り直せる回数(出た目を見てから決められる。判定ダイスにも使える)
export const MAX_ROLLS_PER_TURN = 10; // 「もう一度振る」連鎖のフェイルセーフ
const MAX_LOG = 300;

// ---------------------------------------------------------------------------
// 2. AIプロファイル (sim の AI をそのまま移植。sim の 'gacha' はここでは 'hell')
// ---------------------------------------------------------------------------
//  rollOrder  : ドロー/イベント起動面を持つモンスターを先に振るか
//  targeting  : 'lethal' 倒せる相手優先 / 'highest' 常にHP最大 / 'random' でたらめ
//  eventChoice: 'best' 完全な優先度 / 'damage' ダメージ偏重 / 'random' でたらめ
//  swapAt     : 場のモンスターのHPがこの割合以下なら満タンの手札モンスターと交換 (0=交換しない)
//  lookahead  : ダメージで「あと一歩で倒せる」相手を優先的に削る

export const AI_PROFILES = {
  // 2026-08-10: キャラごとのAI差(脳筋・ダメージ偏重など)は廃止。
  // 全員が最も賢い設定で、難易度はデッキの強さだけで決まる。
  // swapAt: 旧ルール(HP据え置き)では交換は逆効果で全員0だったが、
  // 2026-08-12の「手札に戻ると最大HPの半分回復」導入で有利な選択肢になったため0.4に戻した
  base: { name: '基本AI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: true },
  // 星のみ捨て札はしない(デッキが弱く掘っても恩恵ゼロと実測済み・最初の相手の緩さも兼ねる)
  hoshi: { name: '星AI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: false },
  kuma: { name: 'クマAI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: true },
  carry: { name: 'キャリーAI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: true },
  hell: { name: 'HELL AI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: true },
  ojisan: { name: 'おじさんAI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: true },
  oshiriseijin: { name: 'おしり星人AI', rollOrder: true, targeting: 'lethal', eventChoice: 'best', swapAt: 0.4, lookahead: true, endDiscard: true },
};

function resolveAi(v) {
  if (!v) return null;
  if (typeof v === 'string') return AI_PROFILES[v] || AI_PROFILES.base;
  return v;
}

// ---------------------------------------------------------------------------
// 3. 盤面の基本操作
// ---------------------------------------------------------------------------

function byUid(list, uid) {
  for (const c of list) if (c.uid === uid) return c;
  return null;
}

function makePlayer(g, side, label, deckList, ai, auto) {
  const p = {
    side, // 'you' | 'foe'
    label,
    ai,
    auto, // true ならAIが選択を自動で埋める
    deck: [],
    hand: [],
    field: [],
    trash: [],
    turnNo: 0,
    doubleDamageTurn: -1,
    rerollTokens: REROLL_TOKENS, // 残り振り直し回数
  };
  for (const [cid, n] of deckList) {
    const def = CARDS[cid];
    if (!def) throw new Error('未知のカードID: ' + cid);
    for (let i = 0; i < n; i++) p.deck.push(makeInst(g, def));
  }
  g.rng.shuffle(p.deck);
  return p;
}

function makeInst(g, def) {
  const inst = { def, uid: ++g.uid, hp: 0, maxHp: 0, sickTurn: -1, skipTurn: -1 };
  if (def.kind === 'monster') {
    inst.hp = def.hp;
    inst.maxHp = def.hp;
  }
  return inst;
}

function drawCards(g, p, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) break; // 山札切れはドロー不発 (敗北ではない)
    p.hand.push(p.deck.pop());
    got++;
  }
  if (got > 0) emit(g, { t: 'draw', side: p.side, n: got });
  return got;
}

function handMonsters(p) {
  return p.hand.filter((c) => c.def.kind === 'monster');
}
function handEvents(p) {
  return p.hand.filter((c) => c.def.kind === 'event');
}

function removeFromHand(p, inst) {
  const i = p.hand.indexOf(inst);
  if (i >= 0) p.hand.splice(i, 1);
}

function placeMonster(g, p, inst, swappedOut) {
  removeFromHand(p, inst);
  inst.sickTurn = p.turnNo; // 召喚酔い: 出したターンは振れない (例外なし)
  inst.skipTurn = -1;
  p.field.push(inst);
  emit(g, {
    t: 'play',
    side: p.side,
    uid: inst.uid,
    id: inst.def.id,
    hp: inst.hp,
    maxHp: inst.maxHp,
    swapped: swappedOut ? swappedOut.uid : null,
  });
}

function returnToHand(g, p, inst, cause) {
  // バウンス / 交換で手札に戻ったモンスターは最大HPの半分回復する(2026-08-12)。
  // 交換が「使うだけ損」の死にルールだったのを、休ませる価値がある選択肢にするための救済
  const i = p.field.indexOf(inst);
  if (i >= 0) p.field.splice(i, 1);
  inst.sickTurn = -1;
  inst.skipTurn = -1;
  if (inst.maxHp) inst.hp = Math.min(inst.maxHp, inst.hp + Math.floor(inst.maxHp / 2));
  p.hand.push(inst);
  emit(g, { t: 'bounce', side: p.side, uid: inst.uid, id: inst.def.id, hp: inst.hp, cause: cause || 'bounce' });
}

function toTrash(g, p, inst) {
  const i = p.field.indexOf(inst);
  if (i >= 0) p.field.splice(i, 1);
  inst.hp = inst.maxHp; // トラッシュ上のカードは「カード」に戻る (回収時は全快)
  p.trash.push(inst);
  emit(g, { t: 'trash', side: p.side, uid: inst.uid, id: inst.def.id });
}

function cleanupDeaths(g) {
  for (const p of [g.you, g.foe]) {
    for (const m of p.field.slice()) {
      if (m.hp <= 0) toTrash(g, p, m);
    }
  }
}

function canRoll(p, m) {
  return m.hp > 0 && m.sickTurn !== p.turnNo && m.skipTurn !== p.turnNo;
}

// --- 判定ダイス ({t:'dice'} 用。「サイコロを振って○○なら」の○○の部分) ---
//     cond: 'even' | 'odd' | 出目の配列 ([1] や [5,6])
function diceCondList(cond) {
  return Array.isArray(cond) ? cond : [cond];
}
function diceCondLabel(cond) {
  if (cond === 'even') return '偶数';
  if (cond === 'odd') return '奇数';
  return diceCondList(cond).join('か');
}
function diceCondOk(cond, face) {
  if (cond === 'even') return face % 2 === 0;
  if (cond === 'odd') return face % 2 === 1;
  return diceCondList(cond).includes(face);
}
/** 成功率。AIの評価で「期待値としてどれくらい効くか」に掛ける */
function diceCondChance(cond) {
  if (cond === 'even' || cond === 'odd') return 0.5;
  return diceCondList(cond).length / 6;
}

// --- 面の期待値 (AIの判断材料。カードデータから静的に算出) ---
const FACE_INFO_CACHE = new Map();
function monsterInfo(def) {
  let info = FACE_INFO_CACHE.get(def.id);
  if (info) return info;
  let util = 0; // draw / useEvent / recover を含む面の数
  let dmgSum = 0;
  for (const face of def.faces) {
    let hasUtil = false;
    const scan = (fx, w) => {
      for (const e of fx) {
        if (e.t === 'dice') { scan(e.then, w * diceCondChance(e.cond)); continue; }
        if (e.t === 'draw' || e.t === 'useEvent' || e.t === 'recover') hasUtil = true;
        if (e.t === 'damage' || e.t === 'damageByAttr') dmgSum += e.n * w;
        if (e.t === 'damageAll') dmgSum += e.n * w;
      }
    };
    scan(face.fx, 1);
    if (hasUtil) util++;
  }
  info = { util, avgDmg: dmgSum / 6 };
  FACE_INFO_CACHE.set(def.id, info);
  return info;
}

/** カードの効果配列を取り出す(モンスターは面ごと・イベントは fx) */
function faceFx(def, faceIndex) {
  return def.faces[faceIndex].fx;
}

// ---------------------------------------------------------------------------
// 4. イベント / ログ
// ---------------------------------------------------------------------------

function emit(g, ev) {
  g.events.push(ev);
  const line = logLine(g, ev);
  if (line) {
    g.log.push(line);
    if (g.log.length > MAX_LOG) g.log.shift();
  }
  for (const cb of g.listeners) {
    try {
      cb(ev);
    } catch (err) {
      // UI側の例外でエンジンを止めない
      if (typeof console !== 'undefined') console.error('[cardengine] onEvent:', err);
    }
  }
}

function who(g, side) {
  return side === 'you' ? g.you.label : g.foe.label;
}
function nameOf(id) {
  const def = CARDS[id];
  return def ? def.name : id;
}

function logLine(g, ev) {
  switch (ev.t) {
    case 'turnStart':
      return `── ${who(g, ev.side)} のターン ${ev.turn}`;
    case 'draw':
      return `${who(g, ev.side)}: カードを${ev.n}枚引いた`;
    case 'play':
      return ev.swapped
        ? `${who(g, ev.side)}: ${nameOf(ev.id)} と入れ替えた`
        : `${who(g, ev.side)}: ${nameOf(ev.id)} を出した`;
    case 'roll':
      return `${who(g, ev.side)}: ${nameOf(ev.id)} → ${ev.face} 「${ev.text}」`;
    case 'chooseFace':
      return `${who(g, ev.side)}: ${nameOf(ev.id)} の出目 ${ev.face} を選んだ`;
    case 'diceCheck':
      return ev.verdict
        ? `  判定 🎲${ev.face} (${ev.label}) → ${ev.verdict}`
        : `  判定 🎲${ev.face} (${ev.label}なら成功) → ${ev.ok ? '成功' : '失敗'}`;
    case 'redraw':
      return `${who(g, ev.side)}: 手札を引き直した`;
    case 'damage':
      return `  ${nameOf(ev.id)} に ${ev.n} ダメージ (HP ${ev.hp})`;
    case 'heal':
      return `  ${nameOf(ev.id)} を ${ev.n} 回復 (HP ${ev.hp})`;
    case 'trash':
      return `  ${nameOf(ev.id)} は たおれた`;
    case 'bounce':
      return `  ${nameOf(ev.id)} が手札に戻った`;
    case 'useEvent':
      return `${who(g, ev.side)}: イベント「${nameOf(ev.id)}」`;
    case 'discard':
      return ev.own
        ? `${who(g, ev.side)}: ${nameOf(ev.id)} を捨てた`
        : `  ${who(g, ev.side)} の手札から ${nameOf(ev.id)} が落ちた`;
    case 'recover':
      return `  トラッシュから ${nameOf(ev.id)} を回収`;
    case 'skipRoll':
      return `  ${nameOf(ev.id)} は次のターン振れない`;
    case 'over':
      return ev.winner ? `▼ ${who(g, ev.winner)} の勝ち` : '▼ 引き分け';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 5. AIの対象選択 (sim からそのまま移植)
// ---------------------------------------------------------------------------

function aiPickOpponentTarget(g, me, cands, dmg) {
  if (!cands.length) return null;
  const style = me.ai.targeting;
  if (style === 'random') return g.rng.pick(cands);
  if (style === 'lethal' && dmg > 0) {
    const lethal = cands.filter((m) => m.hp <= dmg);
    if (lethal.length) {
      // 倒せるなら、その中で一番HPが高い (=一番硬い相手) を落とす
      return lethal.reduce((a, b) => (b.hp > a.hp ? b : a));
    }
    if (me.ai.lookahead) {
      // あと一歩で倒せる相手を優先して削る
      const near = cands.filter((m) => m.hp <= dmg * 2);
      if (near.length) return near.reduce((a, b) => (b.hp < a.hp ? b : a));
    }
  }
  return cands.reduce((a, b) => (b.hp > a.hp ? b : a));
}

/** damageByAttr の scope:'one' 用 (sim のインライン処理と同じ。lookahead は使わない) */
function aiPickAttrTarget(g, me, cands, n) {
  if (!cands.length) return null;
  if (me.ai.targeting === 'random') return g.rng.pick(cands);
  const lethal = cands.filter((m) => m.hp <= n);
  return lethal.length
    ? lethal.reduce((a, b) => (b.hp > a.hp ? b : a))
    : cands.reduce((a, b) => (b.hp > a.hp ? b : a));
}

function aiPickBounceTarget(g, me, cands) {
  if (!cands.length) return null;
  if (me.ai.targeting === 'random') return g.rng.pick(cands);
  // 場が1体だけならそれを戻すのが最大のテンポ得
  if (cands.length === 1) return cands[0];
  // それ以外は一番HPが高い (=手札に戻して仕切り直させたい) 相手
  return cands.reduce((a, b) => (b.hp > a.hp ? b : a));
}

function aiPickSkipTarget(g, me, opp, cands) {
  if (!cands.length) return null;
  // 既に停止中の相手に重ねがけしない(全員停止中なら仕方なくその中から)
  const fresh = cands.filter((m) => m.skipTurn !== opp.turnNo + 1);
  const pool = fresh.length ? fresh : cands;
  if (me.ai.targeting === 'random') return g.rng.pick(pool);
  return pool.reduce((a, b) => (monsterInfo(b.def).avgDmg > monsterInfo(a.def).avgDmg ? b : a));
}

function aiPickHealTarget(cands, amount) {
  if (!cands.length) return null;
  // 回復量が無駄にならない範囲で、一番危ない味方
  const useful = cands.filter((m) => m.maxHp - m.hp >= amount);
  const pool = useful.length ? useful : cands;
  return pool.reduce((a, b) => (b.hp < a.hp ? b : a));
}

function aiPickSelfDamageTarget(cands, amount) {
  if (!cands.length) return null;
  const survive = cands.filter((m) => m.hp > amount);
  const pool = survive.length ? survive : cands;
  return pool.reduce((a, b) => (b.hp > a.hp ? b : a));
}

function aiPickRerollTarget(g, me, cands) {
  if (!cands.length) return null;
  if (me.ai.targeting === 'random') return g.rng.pick(cands);
  return cands.reduce((a, b) => (monsterInfo(b.def).avgDmg > monsterInfo(a.def).avgDmg ? b : a));
}

function aiChooseMonsterToPlay(p) {
  const mons = handMonsters(p);
  if (!mons.length) return null;
  // 「手札の中で最もHPが高いもの」(バウンスで戻った負傷カードは現在HPで評価)
  return mons.reduce((a, b) => (b.hp > a.hp ? b : a));
}

function aiRollOrder(g, p) {
  const rollable = p.field.filter((m) => canRoll(p, m));
  if (!p.ai.rollOrder) return g.rng.shuffle(rollable.slice());
  // ドロー/イベント起動面を持つモンスターを先に振る
  return rollable.slice().sort((a, b) => monsterInfo(b.def).util - monsterInfo(a.def).util);
}

// ---------------------------------------------------------------------------
// 6. AIのイベント評価 (「イベントカードをN枚使う」時の選択)
// ---------------------------------------------------------------------------

function summarizeEvent(def) {
  const s = {
    single: 0, all: 0, heal: 0, healAll: 0, draw: 0, bounce: false,
    discard: 0, selfDiscard: 0, recoverKinds: [], reroll: false, dbl: false, selfDmg: 0,
    skip: 0, choose: 0,
  };
  accumEventFx(s, def.fx, 1);
  return s;
}

/** w は判定ダイスの成功率。当たらないかもしれない効果は期待値に落として数える */
function accumEventFx(s, fx, w) {
  for (const e of fx) {
    if (e.t === 'dice') {
      accumEventFx(s, e.then, w * diceCondChance(e.cond));
      continue;
    }
    if (e.t === 'damage') s.single += e.n * w;
    else if (e.t === 'damageByAttr') e.scope === 'all' ? (s.all += e.n * w) : (s.single += e.n * w);
    else if (e.t === 'damageAll') s.all += e.n * w;
    else if (e.t === 'heal') s.heal += e.n * w;
    else if (e.t === 'healAll') s.healAll += e.n * w;
    else if (e.t === 'healFull') s.heal += 999 * w;
    else if (e.t === 'diceHeal') (e.scope === 'all' ? (s.healAll += 3.5 * e.mult * w) : (s.heal += 3.5 * e.mult * w));
    else if (e.t === 'draw') s.draw += e.n * w;
    else if (e.t === 'bounce') s.bounce = true;
    else if (e.t === 'discardOpponentHand') s.discard += e.n * w;
    else if (e.t === 'discardOwnHand') s.selfDiscard += e.n * w;
    else if (e.t === 'recover') s.recoverKinds.push(e.kind);
    else if (e.t === 'reroll') s.reroll = true;
    else if (e.t === 'doubleDamage') s.dbl = true;
    else if (e.t === 'selfDamage') s.selfDmg += e.n * w;
    else if (e.t === 'selfDamageAll') s.selfDmg += e.n * w;
    else if (e.t === 'skipRoll') s.skip += w;
    else if (e.t === 'chooseFace') s.choose += w;
  }
}

function eventScore(g, me, opp, inst) {
  const s = summarizeEvent(inst.def);
  const style = me.ai.eventChoice;
  const oppMons = opp.field.filter((m) => m.hp > 0);
  const myMons = me.field.filter((m) => m.hp > 0);

  if (style === 'damage') {
    // ダメージ偏重: 出せるダメージの総量を主に見る(妨害系も少しは数える)
    return s.single + s.all * Math.max(1, oppMons.length) + (s.bounce ? 20 : 0) + s.draw * 5 + s.heal * 0.2
      + s.discard * 8 - s.selfDiscard * 4 + s.skip * 15 + s.choose * 20;
  }

  let score = 0;
  // 1) 相手モンスターを倒せるダメージ (最優先)
  if (s.single > 0 && oppMons.some((m) => m.hp <= s.single)) score += 10000;
  if (s.all > 0) {
    const kills = oppMons.filter((m) => m.hp <= s.all).length;
    if (kills) score += 10000 + (kills - 1) * 2000;
  }
  // 2) 自分の瀕死を回復
  const critical = myMons.filter((m) => m.hp <= m.maxHp * 0.3);
  if (critical.length && (s.heal > 0 || s.healAll > 0)) score += 5000;
  // 3) ドロー
  if (s.draw > 0) score += 1000 + s.draw * 20;
  // 4) その他
  score += s.single * 3;
  score += s.all * 3 * oppMons.length;
  const wounded = myMons.reduce((acc, m) => acc + (m.maxHp - m.hp), 0);
  score += Math.min(s.heal + s.healAll * myMons.length, wounded) * 1.5;
  if (s.bounce && oppMons.length) score += 250 + (oppMons.length === 1 ? 250 : 0);
  score += s.discard * Math.min(60, opp.hand.length * 20);
  score -= s.selfDiscard * Math.min(60, me.hand.length * 20); // 自分の手札も捨てるなら差し引く
  for (const rk of s.recoverKinds) {
    const has = me.trash.some((c) => (rk === 'monster' ? c.def.kind === 'monster' : c.def.kind === 'event'));
    score += has ? 400 : -100; // 片方だけ空振りでも、もう片方が有効なら使う価値がある
  }
  if (s.reroll) score += me.field.some((m) => canRoll(me, m)) ? 200 : -500;
  if (s.dbl) score += 150;
  // 行動停止: 相手の打点が高いほど価値がある(止める対象がいることは fxHasUse が保証)
  if (s.skip > 0 && oppMons.length) {
    const worst = oppMons.reduce((a, b) => (monsterInfo(b.def).avgDmg > monsterInfo(a.def).avgDmg ? b : a));
    score += s.skip * (100 + monsterInfo(worst.def).avgDmg * 10);
  }
  // 選択ロール: 自分の場が生きていれば常にそこそこ強い
  if (s.choose > 0 && myMons.length) score += s.choose * 300;
  score -= s.selfDmg * 2;
  return score;
}

/**
 * そのイベントを今使って意味があるか。
 * 恩恵side(ダメージ/回復/ドロー等)が全て空振りになる状況なら false。
 * 反動(selfDamage系・自分の手札破壊)はコストなので「使う理由」に数えない
 */
function fxHasUse(g, me, opp, fx) {
  for (const e of fx) {
    switch (e.t) {
      case 'dice':
        if (fxHasUse(g, me, opp, e.then)) return true;
        break;
      case 'damage':
      case 'damageAll':
      case 'bounce':
        if (opp.field.some((m) => m.hp > 0)) return true;
        break;
      case 'damageByAttr':
        if (opp.field.some((m) => m.hp > 0 && m.def.attr === e.attr)) return true;
        break;
      case 'skipRoll':
        // 既に次ターン停止中の相手しかいないなら重ねがけは無駄
        if (opp.field.some((m) => m.hp > 0 && m.skipTurn !== opp.turnNo + 1)) return true;
        break;
      case 'heal':
      case 'healFull':
      case 'diceHeal':
        if (me.field.some((m) => m.hp > 0 && m.hp < m.maxHp)) return true;
        break;
      case 'healAll':
        if (me.field.some((m) => m.hp > 0 && m.hp < m.maxHp && (!e.attr || m.def.attr === e.attr))) return true;
        break;
      case 'draw':
        if (me.deck.length > 0) return true;
        break;
      case 'discardOpponentHand':
        if (opp.hand.length > 0) return true;
        break;
      case 'recover': {
        const want = e.kind === 'monster';
        if (me.trash.some((c) => (want ? c.def.kind === 'monster' : c.def.kind === 'event'))) return true;
        break;
      }
      case 'reroll':
        if (me.field.some((m) => canRoll(me, m))) return true;
        break;
      case 'chooseFace':
        if (me.field.some((m) => m.hp > 0)) return true;
        break;
      case 'useEvent':
        if (me.hand.some((c) => c.def.kind === 'event')) return true;
        break;
      case 'doubleDamage':
        return true;
      default:
        break; // none / selfDamage / selfDamageAll / discardOwnHand は理由にならない
    }
  }
  return false;
}

function aiChooseEvent(g, me, opp) {
  // 空振りになるイベント(負傷者ゼロでの回復札など)は候補から外す。
  // 全部空振りなら「1枚も使わない」を選ぶ(← 最弱AI含め全員)
  const evs = handEvents(me).filter((c) => fxHasUse(g, me, opp, c.def.fx));
  if (!evs.length) return null;
  if (me.ai.eventChoice === 'random') return g.rng.pick(evs);
  let best = evs[0];
  let bestScore = eventScore(g, me, opp, evs[0]);
  for (let i = 1; i < evs.length; i++) {
    const sc = eventScore(g, me, opp, evs[i]);
    if (sc > bestScore) {
      best = evs[i];
      bestScore = sc;
    }
  }
  // 使っても損しかない(相手より自分の手札を余計に捨てる等)なら温存する
  return bestScore > 0 ? best : null;
}

/** 「尻に願いを」で選ぶ面を決めるための、面のざっくり評価 */
function faceScore(g, me, opp, fx) {
  const foes = opp.field.filter((m) => m.hp > 0);
  const mine = me.field.filter((m) => m.hp > 0);
  const weakest = foes.length ? foes.reduce((a, b) => (b.hp < a.hp ? b : a)) : null;
  const hurt = mine.length ? mine.reduce((a, b) => (b.def.hp - b.hp > a.def.hp - a.hp ? b : a)) : null;
  let s = 0;
  for (const e of fx) {
    switch (e.t) {
      case 'dice':
        s += faceScore(g, me, opp, e.then) * diceCondChance(e.cond);
        break;
      case 'selfDamageAll':
        s -= e.n * mine.length;
        break;
      case 'discardOwnHand':
        s -= e.n * 8;
        break;
      case 'damage':
        s += e.n + (weakest && e.n >= weakest.hp ? 30 : 0);
        break;
      case 'damageAll':
        s += e.n * foes.length + (weakest && e.n >= weakest.hp ? 30 : 0);
        break;
      case 'damageByAttr': {
        const hit = foes.filter((m) => m.def.attr === e.attr);
        s += e.n * (e.scope === 'all' ? hit.length : Math.min(hit.length, 1));
        break;
      }
      case 'heal':
        s += hurt ? Math.min(e.n, hurt.def.hp - hurt.hp) : 0;
        break;
      case 'selfHeal':
        // 振る本人がどれかはここでは分からないので、heal と同じ近似で見積もる
        s += hurt ? Math.min(e.n, hurt.def.hp - hurt.hp) : 0;
        break;
      case 'healAll':
        s += mine.reduce((a, m) => a + Math.min(e.n, m.def.hp - m.hp), 0);
        break;
      case 'healFull':
        s += hurt ? hurt.def.hp - hurt.hp : 0;
        break;
      case 'diceHeal': {
        const exp = 3.5 * e.mult;
        if (e.scope === 'all') s += mine.reduce((a, m) => a + Math.min(exp, m.def.hp - m.hp), 0);
        else s += hurt ? Math.min(exp, hurt.def.hp - hurt.hp) : 0;
        break;
      }
      case 'selfDamage':
        s -= e.n;
        break;
      case 'draw':
        s += e.n * 8;
        break;
      case 'useEvent':
        s += e.n * Math.min(me.hand.filter((c) => c.def.kind === 'event').length, e.n) * 12;
        break;
      case 'discardOpponentHand':
        s += e.n * 8;
        break;
      case 'reroll':
        s += 15;
        break;
      case 'skipRoll':
        s += 12;
        break;
      case 'bounce':
        s += foes.length ? 25 : 0;
        break;
      case 'recover':
        s += e.n * 18;
        break;
      default:
        break;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// 7. 選択の受け口
//    AI側 (p.auto) は yield せずに AI の判断をそのまま返す。
//    人間側は prompt を yield して止まり、choose() の値で再開する。
// ---------------------------------------------------------------------------

/** 対象を1体選ぶ。cands が空なら null (=不発)、1体だけなら聞かない */
function* askTarget(g, p, cands, reason, aiFn) {
  if (!cands.length) return null;
  if (p.auto) return aiFn();
  if (cands.length === 1) return cands[0];
  const uid = yield { kind: 'pickTarget', side: p.side, options: cands.map((m) => m.uid), reason };
  return byUid(cands, uid) || aiFn();
}

// ---------------------------------------------------------------------------
// 8. 効果の実行 (すべてジェネレータ。選択が要るところで止まる)
// ---------------------------------------------------------------------------

function damageMonster(g, owner, m, n) {
  m.hp -= n;
  emit(g, {
    t: 'damage',
    side: owner.side,
    uid: m.uid,
    id: m.def.id,
    n,
    hp: Math.max(0, m.hp),
    dead: m.hp <= 0,
  });
}

function healMonster(g, owner, m, n) {
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + n);
  if (m.hp !== before) {
    emit(g, { t: 'heal', side: owner.side, uid: m.uid, id: m.def.id, n: m.hp - before, hp: m.hp });
  }
}

/** 指定した側の手札から n 枚ランダムにトラッシュ */
function discardHand(g, p, n) {
  for (let i = 0; i < n; i++) {
    if (!p.hand.length) return;
    const idx = g.rng.int(p.hand.length);
    const c = p.hand.splice(idx, 1)[0];
    p.trash.push(c);
    emit(g, { t: 'discard', side: p.side, uid: c.uid, id: c.def.id });
  }
}

function dmgMul(me, ctx) {
  // 「このターン、自分のモンスターが与えるダメージが2倍」= モンスターの面によるダメージのみ
  return ctx.fromMonster && me.doubleDamageTurn === me.turnNo ? 2 : 1;
}

function* execEffects(g, me, opp, fx, ctx) {
  for (const e of fx) {
    yield* execEffect(g, me, opp, e, ctx);
    cleanupDeaths(g);
  }
}

function* execEffect(g, me, opp, e, ctx) {
  switch (e.t) {
    case 'none':
      return;

    // 「サイコロを振って○○なら〜」。当たったときだけ then の効果を実行する。
    // これは判定用のダイスなので turnCtx.rolls には数えない(モンスターのロールではない)。
    // リロールトークンは判定ダイスにも使える(2026-08-12)
    case 'dice': {
      let face = g.rng.d6();
      let ok = diceCondOk(e.cond, face);
      const label = e.label || diceCondLabel(e.cond);
      if (me.auto) {
        // AI: 失敗していて、成功時の効果が1トークンの価値(スコア20)以上なら振り直す
        let guard = 0;
        while (!ok && me.rerollTokens > 0 && guard++ < 5 && faceScore(g, me, opp, e.then) >= 20) {
          me.rerollTokens--;
          face = g.rng.d6();
          ok = diceCondOk(e.cond, face);
        }
        emit(g, { t: 'diceCheck', side: me.side, face, ok, label });
      } else {
        emit(g, { t: 'diceCheck', side: me.side, face, ok, label });
        // 成功/失敗の二択判定は、失敗しているときだけ振り直すか聞く(成功を振り直す理由がない)
        while (!ok && me.rerollTokens > 0) {
          const redo = yield { kind: 'rerollAsk', side: me.side, judge: true, face, ok, label, tokens: me.rerollTokens };
          if (!redo) break;
          me.rerollTokens--;
          face = g.rng.d6();
          ok = diceCondOk(e.cond, face);
          emit(g, { t: 'diceCheck', side: me.side, face, ok, label, reroll: true });
        }
      }
      if (ok) yield* execEffects(g, me, opp, e.then, ctx);
      return;
    }

    // 「サイコロを振って出た目×mult回復」(おしりのなみだ)。判定ダイスの演出を流用する。
    // こちらもリロールトークンで振り直せる(低い目の救済)
    case 'diceHeal': {
      const cands = me.field.filter((m) => m.hp > 0 && m.hp < m.maxHp);
      if (!cands.length) return;
      let face = g.rng.d6();
      const label = '出た目×' + e.mult;
      if (me.auto) {
        let guard = 0;
        while (face <= 2 && me.rerollTokens > 0 && guard++ < 5) {
          me.rerollTokens--;
          face = g.rng.d6();
        }
        emit(g, { t: 'diceCheck', side: me.side, face, ok: true, label, verdict: face * e.mult + '回復!' });
      } else {
        emit(g, { t: 'diceCheck', side: me.side, face, ok: true, label, verdict: face * e.mult + '回復!' });
        while (me.rerollTokens > 0) {
          const redo = yield { kind: 'rerollAsk', side: me.side, judge: true, face, ok: true, label, tokens: me.rerollTokens };
          if (!redo) break;
          me.rerollTokens--;
          face = g.rng.d6();
          emit(g, { t: 'diceCheck', side: me.side, face, ok: true, label, verdict: face * e.mult + '回復!', reroll: true });
        }
      }
      const n = face * e.mult;
      if (e.scope === 'all') {
        for (const m of cands) healMonster(g, me, m, n);
        return;
      }
      const t = yield* askTarget(g, me, cands, 'heal', () => aiPickHealTarget(cands, n));
      if (!t) return;
      healMonster(g, me, t, n);
      return;
    }

    case 'damage': {
      const n = e.n * dmgMul(me, ctx);
      const cands = opp.field.filter((m) => m.hp > 0);
      const t = yield* askTarget(g, me, cands, 'damage', () => aiPickOpponentTarget(g, me, cands, n));
      if (!t) return; // 対象がいなければ不発
      damageMonster(g, opp, t, n);
      return;
    }

    case 'damageAll': {
      const n = e.n * dmgMul(me, ctx);
      for (const m of opp.field.slice()) if (m.hp > 0) damageMonster(g, opp, m, n);
      return;
    }

    case 'damageByAttr': {
      const n = e.n * dmgMul(me, ctx);
      const cands = opp.field.filter((m) => m.hp > 0 && m.def.attr === e.attr);
      if (!cands.length) return;
      if (e.scope === 'all') {
        for (const m of cands) damageMonster(g, opp, m, n);
      } else {
        const t = yield* askTarget(g, me, cands, 'damage', () => aiPickAttrTarget(g, me, cands, n));
        if (t) damageMonster(g, opp, t, n);
      }
      return;
    }

    case 'heal': {
      const cands = me.field.filter((m) => m.hp > 0 && m.hp < m.maxHp);
      const t = yield* askTarget(g, me, cands, 'heal', () => aiPickHealTarget(cands, e.n));
      if (!t) return;
      healMonster(g, me, t, e.n);
      return;
    }

    case 'healAll': {
      for (const m of me.field) {
        if (m.hp <= 0) continue;
        if (e.attr && m.def.attr !== e.attr) continue;
        healMonster(g, me, m, e.n);
      }
      return;
    }

    case 'healFull': {
      const cands = me.field.filter((m) => m.hp > 0 && m.hp < m.maxHp);
      const t = yield* askTarget(g, me, cands, 'heal', () => aiPickHealTarget(cands, 9999));
      if (!t) return;
      healMonster(g, me, t, t.maxHp - t.hp);
      return;
    }

    case 'selfDamage': {
      // 反動。ざんぎょうだけは「振り直したモンスター」に固定
      if (e.to === 'rerolled' && ctx.local && ctx.local.rerolled && ctx.local.rerolled.hp > 0) {
        damageMonster(g, me, ctx.local.rerolled, e.n);
        return;
      }
      // to:'source' は振った本人が受ける(選ばせない)
      if (e.to === 'source' && ctx.source && ctx.source.hp > 0 && me.field.includes(ctx.source)) {
        damageMonster(g, me, ctx.source, e.n);
        return;
      }
      const cands = me.field.filter((m) => m.hp > 0);
      const t = yield* askTarget(g, me, cands, 'selfDamage', () => aiPickSelfDamageTarget(cands, e.n));
      if (!t) return;
      damageMonster(g, me, t, e.n);
      return;
    }

    case 'selfDamageAll': {
      for (const m of me.field.slice()) if (m.hp > 0) damageMonster(g, me, m, e.n);
      return;
    }

    case 'selfHeal': {
      // 振った本人が回復する(きゅうけい/ゴミをたべる)。対象は選ばせない
      if (ctx.source && ctx.source.hp > 0 && me.field.includes(ctx.source)) {
        healMonster(g, me, ctx.source, e.n);
      }
      return;
    }

    case 'draw':
      drawCards(g, me, e.n);
      return;

    case 'useEvent': {
      // 手札のイベントを N 枚使う。1枚ずつ解決するので、引いた札を続けて使える
      let queue = null;
      for (let i = 0; i < e.n; i++) {
        const evs = handEvents(me);
        if (!evs.length) return; // 手札にイベントが無ければ不発 (残りも打ち切り)
        let ev = null;
        if (queue && queue.length) {
          ev = byUid(evs, queue.shift());
        } else if (me.auto) {
          ev = aiChooseEvent(g, me, opp);
        } else {
          const ans = yield {
            kind: 'useEvent',
            side: me.side,
            options: evs.map((c) => c.uid),
            max: e.n - i,
            canSkip: true,
          };
          if (Array.isArray(ans)) {
            queue = ans.slice();
            ev = byUid(evs, queue.shift());
          } else {
            ev = byUid(evs, ans);
          }
        }
        if (!ev) return; // 見送り
        removeFromHand(me, ev);
        me.trash.push(ev); // 使用後はトラッシュへ
        emit(g, { t: 'useEvent', side: me.side, uid: ev.uid, id: ev.def.id });
        yield* execEffects(g, me, opp, ev.def.fx, {
          fromMonster: false,
          source: ctx.source,
          turnCtx: ctx.turnCtx,
          local: {},
        });
        cleanupDeaths(g);
      }
      return;
    }

    case 'discardOpponentHand': {
      discardHand(g, opp, e.n);
      return;
    }

    // 自分の手札も巻き込むタイプ(ひじょうベル)
    case 'discardOwnHand': {
      discardHand(g, me, e.n);
      return;
    }

    case 'reroll': {
      // count で「自分2体をもう一度振る」まで対応する(同じモンスターは選び直さない)
      const times = e.count || 1;
      const used = [];
      for (let i = 0; i < times; i++) {
        let target = null;
        if (e.target === 'self') {
          target = ctx.source && ctx.source.hp > 0 && me.field.includes(ctx.source) ? ctx.source : null;
        } else {
          const cands = me.field.filter((m) => canRoll(me, m) && !used.includes(m));
          target = yield* askTarget(g, me, cands, 'reroll', () => aiPickRerollTarget(g, me, cands));
        }
        if (!target) return; // 振れる相手が尽きたら残りは不発
        used.push(target);
        if (ctx.local) ctx.local.rerolled = target;
        const face = yield* rollMonster(g, me, opp, target, ctx.turnCtx);
        if (e.chainOn6 && face === 6 && target.hp > 0 && me.field.includes(target)) {
          yield* rollMonster(g, me, opp, target, ctx.turnCtx);
        }
        if (e.target === 'self') return; // self は1体しかいない
      }
      return;
    }

    case 'skipRoll': {
      const cands = opp.field.filter((m) => m.hp > 0);
      const t = yield* askTarget(g, me, cands, 'skipRoll', () => aiPickSkipTarget(g, me, opp, cands));
      if (!t) return;
      t.skipTurn = opp.turnNo + 1; // 相手の次のターンは振れない
      emit(g, { t: 'skipRoll', side: opp.side, uid: t.uid, id: t.def.id });
      return;
    }

    case 'bounce': {
      const times = e.n || 1;
      for (let i = 0; i < times; i++) {
        const cands = opp.field.filter((m) => m.hp > 0);
        const t = yield* askTarget(g, me, cands, 'bounce', () => aiPickBounceTarget(g, me, cands));
        if (!t) return;
        returnToHand(g, opp, t, 'bounce'); // HPは減ったまま手札へ
      }
      return;
    }

    case 'recover': {
      const wantMonster = e.kind === 'monster';
      const matches = () => me.trash.filter((c) => (wantMonster ? c.def.kind === 'monster' : c.def.kind === 'event'));
      if (!matches().length) return;
      if (me.auto) {
        for (let i = 0; i < e.n; i++) {
          const pool = matches();
          if (!pool.length) return;
          const pickCard = wantMonster
            ? pool.reduce((a, b) => (b.def.hp > a.def.hp ? b : a))
            : pool.reduce((a, b) => (eventScore(g, me, opp, b) > eventScore(g, me, opp, a) ? b : a));
          me.trash.splice(me.trash.indexOf(pickCard), 1);
          me.hand.push(pickCard);
          emit(g, { t: 'recover', side: me.side, uid: pickCard.uid, id: pickCard.def.id });
        }
        return;
      }
      const pool = matches();
      const ans = yield { kind: 'recover', side: me.side, options: pool.map((c) => c.uid), max: e.n, kindWanted: e.kind };
      const uids = Array.isArray(ans) ? ans : ans == null ? [] : [ans];
      let taken = 0;
      for (const uid of uids) {
        if (taken >= e.n) break;
        const c = byUid(matches(), uid);
        if (!c) continue;
        me.trash.splice(me.trash.indexOf(c), 1);
        me.hand.push(c);
        emit(g, { t: 'recover', side: me.side, uid: c.uid, id: c.def.id });
        taken++;
      }
      return;
    }

    case 'doubleDamage':
      me.doubleDamageTurn = me.turnNo;
      return;

    // 尻に願いを: 自分の場のモンスター1体を選び、出目を選んでそのテキストを実行する
    // ※これは「振る」ではなく「テキストの実行」なので召喚酔い/ロール封じの対象外(simと同じ)。
    //   ただしロール回数には数えるので、連鎖のフェイルセーフは共通
    case 'chooseFace': {
      const cands = me.field.filter((m) => m.hp > 0);
      if (!cands.length) return;
      if (ctx.turnCtx.rolls >= MAX_ROLLS_PER_TURN) return;
      let mon = null;
      let face = 0; // 1..6
      if (me.auto) {
        let best = null;
        for (const m of cands) {
          for (let f = 0; f < 6; f++) {
            const sc = faceScore(g, me, opp, faceFx(m.def, f));
            if (!best || sc > best.sc) best = { m, f, sc };
          }
        }
        mon = best.m;
        face = best.f + 1;
      } else {
        const uid = yield { kind: 'pickTarget', side: me.side, options: cands.map((m) => m.uid), reason: 'chooseFace' };
        mon = byUid(cands, uid) || cands[0];
        const ans = yield { kind: 'pickFace', side: me.side, monsterUid: mon.uid, options: [1, 2, 3, 4, 5, 6] };
        face = ans >= 1 && ans <= 6 ? ans : 1;
      }
      ctx.turnCtx.rolls++;
      emit(g, { t: 'chooseFace', side: me.side, uid: mon.uid, id: mon.def.id, face, text: mon.def.faces[face - 1].text });
      yield* execEffects(g, me, opp, faceFx(mon.def, face - 1), {
        fromMonster: true,
        source: mon,
        turnCtx: ctx.turnCtx,
        local: {},
      });
      return;
    }

    default:
      throw new Error('未知の効果: ' + e.t);
  }
}

/** サイコロを1回振って、その面のテキストを実行する。@returns 出目 (振れなければ0) */
function* rollMonster(g, me, opp, mon, turnCtx) {
  if (turnCtx.rolls >= MAX_ROLLS_PER_TURN) return 0;
  if (mon.hp <= 0 || !me.field.includes(mon)) return 0;
  turnCtx.rolls++;
  // 人間側はここで止まる。UIがダイス演出を出してから roll() を呼ぶ
  if (!me.auto) yield { kind: 'roll', side: me.side, monsterUid: mon.uid };
  let face = g.rng.d6();
  const emitRoll = (reroll) => {
    g.lastFace = face;
    emit(g, {
      t: 'roll',
      side: me.side,
      uid: mon.uid,
      id: mon.def.id,
      face,
      text: mon.def.faces[face - 1].text,
      reroll: !!reroll,
    });
  };
  // リロールトークン: 出た目を見てから、1試合にREROLL_TOKENS回まで振り直せる
  if (me.auto) {
    // AI: 出た目のスコアが「振り直したときの期待値」を下回るなら振り直す
    let guard = 0;
    while (me.rerollTokens > 0 && guard++ < 5) {
      const sc = faceScore(g, me, opp, faceFx(mon.def, face - 1));
      let ev = 0;
      for (let i = 0; i < 6; i++) ev += faceScore(g, me, opp, faceFx(mon.def, i));
      ev /= 6;
      if (sc >= ev - 1) break;
      me.rerollTokens--;
      face = g.rng.d6();
    }
    emitRoll(false);
  } else {
    emitRoll(false);
    // 人間: トークンが残っていれば毎回聞く(振り直した先でも続けて聞く)
    while (me.rerollTokens > 0) {
      const redo = yield {
        kind: 'rerollAsk',
        side: me.side,
        monsterUid: mon.uid,
        face,
        tokens: me.rerollTokens,
      };
      if (!redo) break;
      me.rerollTokens--;
      face = g.rng.d6();
      emitRoll(true);
    }
  }
  yield* execEffects(g, me, opp, faceFx(mon.def, face - 1), {
    fromMonster: true,
    source: mon,
    turnCtx,
    local: {},
  });
  return face;
}

// ---------------------------------------------------------------------------
// 9. ターン処理
// ---------------------------------------------------------------------------

/** AIの交換判断 (場が満杯のとき) */
function aiTrySwap(g, p) {
  if (!p.ai.swapAt) return false;
  if (p.field.length < 2) return false;
  const weak = p.field.filter((m) => m.hp <= m.maxHp * p.ai.swapAt);
  if (!weak.length) return false;
  const fresh = handMonsters(p).filter((m) => m.hp === m.maxHp);
  if (!fresh.length) return false;
  const out = weak.reduce((a, b) => (b.hp < a.hp ? b : a));
  const inn = fresh.reduce((a, b) => (b.hp > a.hp ? b : a));
  returnToHand(g, p, out, 'swap'); // HPが減ったまま手札へ
  placeMonster(g, p, inn, out); // 出したほうは召喚酔い
  return true;
}

/**
 * ②③ モンスターを出す。②の強制補充も③の1体に含まれる(1ターン1体まで)
 * @returns 'lose' | 'ok'
 */
function* playPhase(g, p) {
  const empty = p.field.length === 0;
  if (empty && !handMonsters(p).length) return 'lose'; // 場が空で手札からも出せない = 負け

  if (p.auto) {
    if (empty) {
      placeMonster(g, p, aiChooseMonsterToPlay(p), null);
      return 'ok';
    }
    if (p.field.length < 2) {
      const m = aiChooseMonsterToPlay(p);
      if (m) placeMonster(g, p, m, null);
      return 'ok';
    }
    aiTrySwap(g, p); // 場が満杯: 条件を満たせば交換
    return 'ok';
  }

  const mons = handMonsters(p);
  if (!mons.length) return 'ok';
  const ans = yield {
    kind: 'playMonster',
    side: p.side,
    options: mons.map((c) => c.uid),
    canSkip: !empty,
    canSwap: p.field.map((m) => m.uid),
    initial: !!p.initialPlacement,
  };
  let playUid = ans;
  let swapUid = null;
  if (ans && typeof ans === 'object') {
    playUid = ans.play;
    swapUid = ans.swap != null ? ans.swap : null;
  }
  let inst = byUid(mons, playUid);
  if (!inst) {
    if (empty) inst = aiChooseMonsterToPlay(p); // 場が空なら見送れない
    else return 'ok'; // 見送り
  }
  let out = swapUid != null ? byUid(p.field, swapUid) : null;
  if (p.field.length >= 2 && !out) return 'ok'; // 満杯で交換指定が無ければ見送り扱い
  if (out) returnToHand(g, p, out, 'swap');
  placeMonster(g, p, inst, out);
  return 'ok';
}

/** ④ 場のモンスターそれぞれにサイコロを振る (順番は振る側が選ぶ) */
function* rollPhase(g, p, opp) {
  const turnCtx = { rolls: 0 };
  const remaining = p.auto ? aiRollOrder(g, p) : p.field.filter((m) => canRoll(p, m));
  while (remaining.length) {
    if (turnCtx.rolls >= MAX_ROLLS_PER_TURN) break;
    let m;
    if (p.auto) {
      m = remaining.shift();
    } else {
      const valid = remaining.filter((x) => p.field.includes(x) && x.hp > 0 && canRoll(p, x));
      if (!valid.length) break;
      if (valid.length === 1) m = valid[0];
      else {
        const uid = yield { kind: 'rollOrder', side: p.side, options: valid.map((x) => x.uid) };
        m = byUid(valid, uid) || valid[0];
      }
      remaining.splice(remaining.indexOf(m), 1);
    }
    if (!p.field.includes(m) || m.hp <= 0) continue;
    if (!canRoll(p, m)) continue;
    yield* rollMonster(g, p, opp, m, turnCtx);
    cleanupDeaths(g);
  }
}

/** @returns 'lose' | null */
function* takeTurn(g, p, opp) {
  p.turnNo++;
  emit(g, { t: 'turnStart', side: p.side, turn: g.turns });
  // ① 手札がDRAW_LIMIT枚以下のときだけドロー(手札が膨らみすぎるのを防ぐ)
  if (p.hand.length <= DRAW_LIMIT) drawCards(g, p, 1);
  else emit(g, { t: 'noDraw', side: p.side, n: p.hand.length });
  const res = yield* playPhase(g, p); // ②③
  if (res === 'lose') return 'lose';
  yield* rollPhase(g, p, opp); // ④
  yield* endDiscardPhase(g, p, opp); // ⑤ 手札を1枚捨ててもよい
  emit(g, { t: 'turnEnd', side: p.side }); // ⑥
  return null;
}

/** ⑤ ターン終了時に手札を1枚捨ててもよい(手札事故からの脱出手段) */
function* endDiscardPhase(g, p, opp) {
  if (!p.hand.length) return;
  let pickCard = null;
  if (p.auto) {
    // AI: 手札が6枚以上(=このままだと次のターン引けない)で、手札にモンスターがおらず、
    // 山札にまだモンスターが残っているなら、一番価値の低いイベントを捨てて掘りにいく
    // (星だけは捨てない)。手札5枚以下なら捨てても捨てなくても次のターン引けるので、
    // 捨てるのはただのカード損にしかならず、常に温存する
    if (!p.ai.endDiscard) return;
    if (p.hand.length < DRAW_LIMIT + 1) return;
    if (handMonsters(p).length > 0) return;
    if (!p.deck.some((c) => c.def.kind === 'monster')) return;
    let ws = Infinity;
    for (const c of p.hand) {
      const sc = eventScore(g, p, opp, c);
      if (sc < ws) { ws = sc; pickCard = c; }
    }
  } else {
    const ans = yield { kind: 'endDiscard', side: p.side, options: p.hand.map((c) => c.uid), canSkip: true };
    pickCard = ans != null ? byUid(p.hand, ans) : null;
  }
  if (!pickCard) return;
  p.hand.splice(p.hand.indexOf(pickCard), 1);
  p.trash.push(pickCard);
  emit(g, { t: 'discard', side: p.side, uid: pickCard.uid, id: pickCard.def.id, own: true });
}

// ---------------------------------------------------------------------------
// 10. 試合全体の流れ
// ---------------------------------------------------------------------------

function* gameFlow(g) {
  const players = [g.you, g.foe];

  // 初期手札を配る。モンスターが1枚も無ければ配り直し(任意マリガンの回数には含めない)
  const deal = (p) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      p.deck = p.deck.concat(p.hand);
      p.hand = [];
      g.rng.shuffle(p.deck);
      for (let i = 0; i < INITIAL_HAND; i++) {
        if (!p.deck.length) break;
        p.hand.push(p.deck.pop());
      }
      if (handMonsters(p).length > 0) break;
    }
  };
  for (const p of players) deal(p);
  emit(g, { t: 'mulligan' });

  // 任意マリガン: 手札全部を1回だけ引き直せる(引き直した後もモンスター0枚なら配り直し)。
  // AIはモンスターが1枚しかいない時だけ引き直す
  for (const p of players) {
    let redo;
    if (p.auto) redo = handMonsters(p).length === 1;
    else redo = !!(yield { kind: 'mulligan', side: p.side });
    if (redo) {
      deal(p);
      emit(g, { t: 'redraw', side: p.side, n: p.hand.length });
    }
  }

  // 初期配置は廃止。第1ターンの「場が空なら出す」から始まる
  // 先攻は開始時のカード選択(UI側)で決まる。指定が無ければ乱数
  const first = g.forcedFirst === 'you' ? 0 : g.forcedFirst === 'foe' ? 1 : g.rng.int(2);
  let cur = first;
  g.firstPlayer = first === 0 ? 'you' : 'foe';

  while (g.turns < MAX_TURNS) {
    const p = cur === 0 ? g.you : g.foe;
    const o = cur === 0 ? g.foe : g.you;
    g.turns++;
    g.actingSide = p.side;
    yield { kind: 'turn', side: p.side, turn: g.turns }; // ターン境界(ドライバが制御)
    const res = yield* takeTurn(g, p, o);
    if (res === 'lose') {
      finish(g, o.side);
      return;
    }
    cur = 1 - cur;
  }
  finish(g, null); // 打ち切り = 引き分け
}

function finish(g, winner) {
  g.over = true;
  g.winner = winner;
  emit(g, { t: 'over', winner });
}

// ---------------------------------------------------------------------------
// 11. スナップショット
// ---------------------------------------------------------------------------

function snapMonster(p, m) {
  return {
    uid: m.uid,
    id: m.def.id,
    hp: Math.max(0, m.hp),
    maxHp: m.maxHp,
    attr: m.def.attr,
    sick: m.sickTurn === p.turnNo, // 召喚酔い
    skip: m.skipTurn === p.turnNo, // かくほ等で、いま振れない
    skipSoon: m.skipTurn > p.turnNo, // 次の自分のターンに振れない(予告)
    canRoll: canRoll(p, m),
  };
}

function snapSide(p, hidden) {
  return {
    label: p.label,
    hand: hidden ? null : p.hand.map((c) => ({ uid: c.uid, id: c.def.id, kind: c.def.kind, hp: c.hp })),
    handCount: p.hand.length,
    field: p.field.map((m) => snapMonster(p, m)),
    deckCount: p.deck.length,
    trash: p.trash.map((c) => ({ uid: c.uid, id: c.def.id, kind: c.def.kind })),
    trashCount: p.trash.length,
    rerollTokens: p.rerollTokens,
  };
}

// ---------------------------------------------------------------------------
// 12. ドライバ (公開API)
// ---------------------------------------------------------------------------

/**
 * 対戦を1つ作る。
 * @param {object} opts
 *   playerDeck   [カードID, 枚数] の配列 (省略時は相手と同じ構成にはしない・必須)
 *   opponentKey  OPPONENTS の key ('hoshi'|'kuma'|'carry'|'hell'|'ojisan')
 *   seed         数値。省略時は Math.random ベース
 *   playerAi     プレイヤー側もAIに任せる場合のプロファイル名 (シミュレーション用)
 *   opponentDeck 相手デッキを直接指定する場合の [カードID, 枚数] 配列 (省略可)
 *   rng          乱数オブジェクトを外から渡す場合 (連続対戦で乱数列を共有したいとき)
 */
export function createBattle(opts = {}) {
  const seed = Number.isFinite(opts.seed) ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
  const oppKey = opts.opponentKey || 'hoshi';
  const oppEntry = OPPONENT_DECKS[oppKey];
  const oppDeckList = opts.opponentDeck || (oppEntry ? oppEntry.list : null);
  if (!oppDeckList) throw new Error('未知の対戦相手: ' + oppKey);
  if (!opts.playerDeck || !opts.playerDeck.length) throw new Error('playerDeck が空');

  const oppMeta = OPPONENTS.find((o) => o.key === oppKey);
  const g = {
    rng: opts.rng || makeRng(seed),
    seed,
    uid: 0,
    events: [],
    listeners: [],
    log: [],
    turns: 0,
    over: false,
    winner: null,
    actingSide: 'you',
    lastFace: 0,
    firstPlayer: null,
    forcedFirst: opts.firstPlayer === 'you' || opts.firstPlayer === 'foe' ? opts.firstPlayer : null,
    opponentKey: oppKey,
  };

  const playerAi = resolveAi(opts.playerAi);
  g.you = makePlayer(g, 'you', opts.playerLabel || 'あなた', opts.playerDeck, playerAi || AI_PROFILES.base, !!playerAi);
  g.foe = makePlayer(
    g,
    'foe',
    opts.opponentLabel || (oppEntry && oppEntry.label) || (oppMeta && oppMeta.label) || oppKey,
    oppDeckList,
    AI_PROFILES[oppKey] || AI_PROFILES.base,
    true
  );

  const gen = gameFlow(g);
  let pending = null; // 今止まっている yield の中身

  function sideOf(side) {
    return side === 'you' ? g.you : g.foe;
  }

  /** ジェネレータを次の停止点まで進める。ターン境界は人間側だけ自動で通過する */
  function advance(answer) {
    let value = answer;
    for (;;) {
      const r = gen.next(value);
      value = undefined;
      if (r.done) {
        pending = null;
        return;
      }
      const req = r.value;
      if (req.kind === 'turn') {
        const p = sideOf(req.side);
        if (p.auto) {
          pending = req; // autoPlayTurn() 待ち
          return;
        }
        continue; // 人間のターンはそのまま開始
      }
      pending = req;
      return;
    }
  }

  function publicPrompt() {
    if (!pending || pending.kind === 'turn') return null;
    return pending;
  }

  function validate(answer) {
    const q = publicPrompt();
    if (!q) throw new Error('選択待ちではない');
    if (q.kind === 'roll') throw new Error('ダイスは roll() で振る');
    const inOptions = (v) => q.options.indexOf(v) >= 0;
    switch (q.kind) {
      case 'playMonster': {
        if (answer == null) {
          if (!q.canSkip) throw new Error('場が空なのでモンスターを出さなければならない');
          return;
        }
        const play = typeof answer === 'object' ? answer.play : answer;
        const swap = typeof answer === 'object' && answer.swap != null ? answer.swap : null;
        if (!inOptions(play)) throw new Error('手札にないモンスター: ' + play);
        if (swap != null && q.canSwap.indexOf(swap) < 0) throw new Error('場にないモンスターとは交換できない');
        return;
      }
      case 'rollOrder':
      case 'pickTarget':
        if (!inOptions(answer)) throw new Error('選べない対象: ' + answer);
        return;
      case 'useEvent': {
        if (answer == null) return; // 見送り
        const list = Array.isArray(answer) ? answer : [answer];
        if (list.length > q.max) throw new Error('使えるのは最大' + q.max + '枚');
        for (const u of list) if (!inOptions(u)) throw new Error('手札にないイベント: ' + u);
        return;
      }
      case 'recover': {
        if (answer == null) return;
        const list = Array.isArray(answer) ? answer : [answer];
        if (list.length > q.max) throw new Error('戻せるのは最大' + q.max + '枚');
        for (const u of list) if (!inOptions(u)) throw new Error('トラッシュにない: ' + u);
        return;
      }
      case 'pickFace':
        if (!(answer >= 1 && answer <= 6)) throw new Error('出目は1〜6');
        return;
      case 'endDiscard':
        if (answer == null) return; // 捨てない
        if (!inOptions(answer)) throw new Error('手札にないカード: ' + answer);
        return;
      default:
        return;
    }
  }

  /** AIが現在の prompt に答える(playerAi 指定時など、人間側もAIに任せる場合の保険) */
  function aiAnswer(q) {
    const p = sideOf(q.side);
    switch (q.kind) {
      case 'playMonster': {
        const m = aiChooseMonsterToPlay(p);
        return m ? m.uid : null;
      }
      case 'rollOrder':
        return q.options[0];
      case 'pickTarget':
        return q.options[0];
      case 'useEvent':
        return q.options[0];
      case 'recover':
        return q.options.slice(0, q.max);
      case 'pickFace':
        return 6;
      default:
        return null;
    }
  }

  const battle = {
    /** 盤面スナップショット(毎回作り直すので書き換えても盤面には影響しない) */
    get state() {
      const q = publicPrompt();
      return {
        turn: g.turns,
        activeSide: g.actingSide,
        firstPlayer: g.firstPlayer,
        opponentKey: g.opponentKey,
        you: snapSide(g.you, false),
        foe: snapSide(g.foe, true), // 相手の手札は枚数だけ
        prompt: q,
        awaitingRoll: q && q.kind === 'roll' ? q.monsterUid : null,
        awaitingAiTurn: !!(pending && pending.kind === 'turn'),
        log: g.log.slice(),
        over: g.over,
        winner: g.winner,
        seed: g.seed,
      };
    },

    /** 演出用イベントの購読。戻り値を呼ぶと解除 */
    onEvent(cb) {
      g.listeners.push(cb);
      return () => {
        const i = g.listeners.indexOf(cb);
        if (i >= 0) g.listeners.splice(i, 1);
      };
    },

    /** 溜まったイベントを取り出して空にする(onEvent を使わない場合用) */
    drainEvents() {
      const evs = g.events;
      g.events = [];
      return evs;
    },

    /** prompt に答えて、次の prompt または AI ターン境界まで進める */
    choose(value) {
      validate(value);
      advance(value);
      return battle.state;
    },

    /** prompt.kind==='roll' のときにダイスを実際に振る。@returns 出目 */
    roll() {
      const q = publicPrompt();
      if (!q || q.kind !== 'roll') throw new Error('いまはダイスを振るところではない');
      advance(undefined);
      return g.lastFace;
    },

    /** 手番側(AI)のターンを最後まで進める。@returns 進めたら true */
    autoPlayTurn() {
      if (g.over) return false;
      if (!pending || pending.kind !== 'turn') return false;
      const p = sideOf(pending.side);
      if (!p.auto) return false;
      advance(undefined);
      // playerAi 未指定でも、万一 AI 側で prompt が立ったら AI の既定手で埋める
      let guard = 0;
      while (pending && pending.kind !== 'turn' && sideOf(pending.side).auto) {
        if (++guard > 500) throw new Error('AIターンが終わらない');
        if (pending.kind === 'roll') advance(undefined);
        else advance(aiAnswer(pending));
      }
      return true;
    },

    /** 現在のカード定義(UIの描画用に再exportしておく) */
    cardOf(id) {
      return CARDS[id] || null;
    },

    isOver() {
      return g.over;
    },
    get winner() {
      return g.winner;
    },
  };

  advance(undefined); // セットアップを実行して最初の停止点まで
  return battle;
}
