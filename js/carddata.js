// js/carddata.js
// おしりバトルダイス カードデータ(ブラウザ用・純粋なESモジュール / 外部依存なし)
//
// 出典:
//   - 数値と効果オブジェクト : sim/cardgame-sim.mjs (調整済みの正)
//   - 日本語の表示テキスト     : CARDGAME.md
//
// 効果オブジェクト(fx)の語彙 ※sim の E.xxx() が生成する形と完全に一致させること
//   { t:'none' }
//   { t:'dice', cond, then:[fx] }              サイコロを振って cond なら then を実行
//                                              (cond: 'even' | 'odd' | 出目の配列 [1] など)
//   { t:'damage', n }                          相手モンスター1体に N ダメージ
//   { t:'damageAll', n }                       相手モンスター全員に N ダメージ
//   { t:'damageByAttr', attr, scope, n }       ○○属性の相手1体/全員に N ダメージ
//   { t:'heal', n }                            自分のモンスター1体を N 回復
//   { t:'healAll', n, attr }                   自分のモンスター全員を N 回復(attrはスコープ)
//   { t:'healFull' }                           自分のモンスター1体をHP全回復
//   { t:'selfDamage', n, to }                  反動(to: 'choose' | 'rerolled')
//   { t:'selfDamageAll', n }                   自分のモンスター全員に N ダメージ(反動)
//   { t:'selfHeal', n }                        振ったモンスター自身を N 回復(対象は選ばない)
//   { t:'draw', n }                            カードを N 枚引く
//   { t:'useEvent', n }                        イベントカードを N 枚使う
//   { t:'discardOpponentHand', n }             相手の手札を N 枚ランダムにトラッシュ
//   { t:'discardOwnHand', n }                  自分の手札を N 枚ランダムにトラッシュ
//   { t:'reroll', target, chainOn6, count? }   もう一度振る(target: 'self' | 'choose'。countで複数体)
//   { t:'skipRoll' }                           相手モンスター1体は次のターン振れない
//   { t:'bounce', n? }                         相手モンスター N 体(省略時1)を持ち主の手札に戻す
//   { t:'recover', kind, n }                   トラッシュから monster/event を N 枚回収
//   { t:'diceHeal', mult, scope? }             サイコロを振って出た目×mult回復(scope:'all'で全員)
//   { t:'doubleDamage' }                       このターンのダメージ2倍(現行カードでは未使用)
//   { t:'chooseFace' }                         選択ロール

// カードナンバー(no): 図鑑・コレクションボードの並び順。
// モンスターM-/イベントI-。属性(オカルト→パワー→メカ)→グループ(スタート→パック→固有→レア)→定義順。
export const ATTRS = {
  power: { key: 'power', label: 'パワー', icon: '⚡' },
  mecha: { key: 'mecha', label: 'メカ', icon: '🔧' },
  occult: { key: 'occult', label: 'オカルト', icon: '✨' },
};

export const CARDS = {
  // =========================================================================
  // 共通モンスター5種(スタートデッキ)
  // =========================================================================
  yamamoto: {
    id: 'yamamoto',
    no: 'M-011',
    kind: 'monster',
    name: '新入社員 山本くん',
    attr: 'power',
    hp: 50,
    rarity: 'common',
    owner: null,
    flavor: '返事だけは、この部屋のだれよりも速い。',
    faces: [
      { text: 'きんちょう — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'ぺこぺこおじぎ — 相手モンスター1体に20ダメージ', fx: [{ t: 'damage', n: 20 }] },
      { text: 'ほうれんそう — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'きゅうけい — 自分を20回復', fx: [{ t: 'selfHeal', n: 20 }] },
      { text: 'しゃにむに — 相手モンスター1体に40ダメージ', fx: [{ t: 'damage', n: 40 }] },
      { text: 'きあいのビンタ — 相手モンスター1体に55ダメージ', fx: [{ t: 'damage', n: 55 }] },
    ],
  },
  gomibako: {
    id: 'gomibako',
    no: 'M-012',
    kind: 'monster',
    name: 'ゴミばこおばけ',
    attr: 'power',
    hp: 45,
    rarity: 'common',
    owner: null,
    flavor: '捨てられたものたちの、ささやかな復讐。',
    faces: [
      { text: 'ちらかす — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'ゴミをなげる — 相手モンスター1体に20ダメージ', fx: [{ t: 'damage', n: 20 }] },
      { text: 'ゴミをたべる — 自分を20回復', fx: [{ t: 'selfHeal', n: 20 }] },
      { text: 'あさる — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      {
        text: 'ひろいもの — 自分のトラッシュからイベントカードを1枚選び、手札に戻す',
        fx: [{ t: 'recover', kind: 'event', n: 1 }],
      },
      { text: 'なまゴミバクダン — 相手モンスター全員に35ダメージ', fx: [{ t: 'damageAll', n: 35 }] },
    ],
  },
  danboru: {
    id: 'danboru',
    no: 'M-021',
    kind: 'monster',
    name: 'だんボールロボ',
    attr: 'mecha',
    hp: 65,
    rarity: 'common',
    owner: null,
    flavor: 'ただの箱であることをやめた日、それは戦士になった。',
    faces: [
      { text: 'ただのはこにもどる — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'かどでこづく — サイコロを振って偶数なら、相手モンスター1体に40ダメージ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damage', n: 40 }] }] },
      { text: 'くみたてなおす — イベントカードを1枚使う。カードを1枚引く', fx: [{ t: 'useEvent', n: 1 }, { t: 'draw', n: 1 }] },
      { text: 'ガムテープほきょう — サイコロを振って奇数なら、自分のモンスター1体を40回復', fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'heal', n: 40 }] }] },
      { text: 'たいあたり — 相手モンスター1体に35ダメージ', fx: [{ t: 'damage', n: 35 }] },
      {
        text: 'ダンボールプレス — サイコロを振って3以上なら、相手モンスター1体に70ダメージ',
        fx: [{ t: 'dice', cond: [3, 4, 5, 6], label: '3以上', then: [{ t: 'damage', n: 70 }] }],
      },
    ],
  },
  byun: {
    id: 'byun',
    no: 'M-022',
    kind: 'monster',
    name: '扇風機の妖精 ビュン',
    attr: 'mecha',
    hp: 45,
    rarity: 'common',
    owner: null,
    flavor: '風は三段階。そのすべてが、生ぬるい。',
    faces: [
      { text: 'でんげんが入らない — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'そよかぜ — 相手モンスター1体に15ダメージ', fx: [{ t: 'damage', n: 15 }] },
      { text: 'かぜをおこす — サイコロを振って偶数なら、カードを2枚引く', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'draw', n: 2 }] }] },
      { text: 'びみょうなかぜ — イベントカードを1枚使う。カードを1枚引く', fx: [{ t: 'useEvent', n: 1 }, { t: 'draw', n: 1 }] },
      { text: '首ふりモード — サイコロを振って偶数なら、相手モンスター全員に50ダメージ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damageAll', n: 50 }] }] },
      {
        text: 'きょうふうモード — 相手モンスター1体を持ち主の手札に戻す。カードを1枚引く',
        fx: [{ t: 'bounce' }, { t: 'draw', n: 1 }],
      },
    ],
  },
  marley: {
    id: 'marley',
    no: 'M-001',
    kind: 'monster',
    name: 'はっぱのマーリー',
    attr: 'occult',
    hp: 50,
    rarity: 'common',
    owner: null,
    flavor: '最後に水をやったのは、たぶん半年前だ。',
    faces: [
      { text: 'こうごうせい — 自分のモンスター1体を15回復', fx: [{ t: 'heal', n: 15 }] },
      { text: 'つるでたたく — 相手モンスター1体に20ダメージ', fx: [{ t: 'damage', n: 20 }] },
      { text: 'はっぱのささやき — イベントカードを2枚使う', fx: [{ t: 'useEvent', n: 2 }] },
      { text: 'はっぱカッター — 相手モンスター1体に30ダメージ', fx: [{ t: 'damage', n: 30 }] },
      { text: '森のめぐみ — 自分のモンスター全員を15回復', fx: [{ t: 'healAll', n: 15, attr: null }] },
      {
        text: 'きゅうせいちょう — 自分のモンスター1体を40回復。イベントカードを1枚使う',
        fx: [{ t: 'heal', n: 40 }, { t: 'useEvent', n: 1 }],
      },
    ],
  },

  // =========================================================================
  // 星 の固有カード
  // =========================================================================
  hoshi: {
    id: 'hoshi',
    no: 'M-008',
    kind: 'monster',
    name: 'ほし',
    attr: 'occult',
    hp: 40,
    rarity: 'unique',
    owner: 'hoshi',
    flavor: '机の上から、この部屋のすべてを見下ろし、ののしる。',
    faces: [
      { text: 'あくたい — 相手モンスター1体に25ダメージ', fx: [{ t: 'damage', n: 25 }] },
      { text: 'みまわす — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ひらめき — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'きらめき — 自分のモンスター1体を30回復', fx: [{ t: 'heal', n: 30 }] },
      {
        text: 'ひとりごと — イベントカードを1枚使う。カードを1枚引く',
        fx: [{ t: 'useEvent', n: 1 }, { t: 'draw', n: 1 }],
      },
      { text: 'ねがいごと — イベントカードを2枚使う', fx: [{ t: 'useEvent', n: 2 }] },
    ],
  },
  hoshinakama: {
    id: 'hoshinakama',
    no: 'M-009',
    kind: 'monster',
    name: 'ほしのなかま',
    attr: 'occult',
    hp: 60,
    rarity: 'unique',
    owner: 'hoshi',
    flavor: 'ひとりが跳ねれば、みんなが跳ねる。理由はない。',
    faces: [
      { text: 'ぴょんぴょん — 相手モンスター1体に15ダメージ', fx: [{ t: 'damage', n: 15 }] },
      { text: 'おしゃべり — カードを2枚引く', fx: [{ t: 'draw', n: 2 }] },
      { text: 'みんなでおうえん — 自分のモンスター全員を10回復', fx: [{ t: 'healAll', n: 10, attr: null }] },
      { text: 'あいずをおくる — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'ほしのかけら — 相手モンスター1体に40ダメージ', fx: [{ t: 'damage', n: 40 }] },
      {
        text: 'なかまをよぶ — オカルト属性の自分のモンスター全員を25回復。カードを1枚引く',
        fx: [{ t: 'healAll', n: 25, attr: 'occult' }, { t: 'draw', n: 1 }],
      },
    ],
  },
  starrod: {
    id: 'starrod',
    no: 'I-013',
    kind: 'event',
    name: '星の本気棒',
    attr: null,
    rarity: 'unique',
    owner: 'hoshi',
    flavor: '星が振るう杖。当たれば、ただでは済まない。',
    text: 'サイコロを振って偶数なら、相手モンスター1体に70ダメージ',
    fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damage', n: 70 }] }],
  },
  akutai: {
    id: 'akutai',
    no: 'I-014',
    kind: 'event',
    name: 'あくたいぞうごん',
    attr: null,
    rarity: 'unique',
    owner: 'hoshi',
    flavor: 'その一言は短く、鋭く、そして無慈悲である。',
    text: '相手の手札を1枚ランダムにトラッシュ',
    fx: [{ t: 'discardOpponentHand', n: 1 }],
  },

  // =========================================================================
  // クマ の固有カード
  // =========================================================================
  kuma: {
    id: 'kuma',
    no: 'M-016',
    kind: 'monster',
    name: 'おどるクマ',
    attr: 'power',
    hp: 75,
    rarity: 'unique',
    owner: 'kuma',
    flavor: 'その踊りに意味はない。だが、誰にも止められない。',
    faces: [
      { text: 'いねむり — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'ひっかき — 相手モンスター1体に20ダメージ', fx: [{ t: 'damage', n: 20 }] },
      { text: 'ダンス — 自分のモンスター全員を10回復', fx: [{ t: 'healAll', n: 10, attr: null }] },
      { text: 'ごきげん — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'クマパンチ — 相手モンスター1体に35ダメージ', fx: [{ t: 'damage', n: 35 }] },
      { text: 'まわしげり — 相手モンスター全員に25ダメージ', fx: [{ t: 'damageAll', n: 25 }] },
    ],
  },
  koganekuma: {
    id: 'koganekuma',
    no: 'M-017',
    kind: 'monster',
    name: 'こがねのクマ',
    attr: 'power',
    hp: 70,
    rarity: 'unique',
    owner: 'kuma',
    flavor: '黄金に輝く毛皮。その中身は、ただのクマである。',
    faces: [
      { text: 'きんのゆめ — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ゴールドひっかき — 相手モンスター1体に25ダメージ', fx: [{ t: 'damage', n: 25 }] },
      { text: 'きんのオーラ — 自分のモンスター全員を15回復', fx: [{ t: 'healAll', n: 15, attr: null }] },
      {
        text: 'ちからくらべ — パワー属性の相手モンスター1体に45ダメージ',
        fx: [{ t: 'damageByAttr', attr: 'power', scope: 'one', n: 45 }],
      },
      { text: 'きんのクマパンチ — 相手モンスター1体に45ダメージ', fx: [{ t: 'damage', n: 45 }] },
      {
        text: 'おうごんらんぶ — 相手モンスター全員に30ダメージ。相手の手札を1枚ランダムにトラッシュ',
        fx: [{ t: 'damageAll', n: 30 }, { t: 'discardOpponentHand', n: 1 }],
      },
    ],
  },
  kumapunch: {
    id: 'kumapunch',
    no: 'I-015',
    kind: 'event',
    name: 'クマパンチ',
    attr: null,
    rarity: 'unique',
    owner: 'kuma',
    flavor: '愛らしい見た目から繰り出される、鉄の一撃。',
    text: '相手モンスター1体に40ダメージ',
    fx: [{ t: 'damage', n: 40 }],
  },
  nadenade: {
    id: 'nadenade',
    no: 'I-016',
    kind: 'event',
    name: 'なでなで',
    attr: null,
    rarity: 'unique',
    owner: 'kuma',
    flavor: 'なでられたクマは、少しだけ強くなるのだという。',
    text: '自分のモンスター1体を10回復。カードを1枚引く',
    fx: [{ t: 'heal', n: 10 }, { t: 'draw', n: 1 }],
  },

  // =========================================================================
  // キャリーちゃん の固有カード
  // =========================================================================
  carry: {
    id: 'carry',
    no: 'M-026',
    kind: 'monster',
    name: 'けいびいんキャリー',
    attr: 'mecha',
    hp: 70,
    rarity: 'unique',
    owner: 'carry',
    flavor: '規則は絶対である。ただし、その口は悪い。',
    faces: [
      { text: 'けいこく — サイコロを振って奇数なら、相手モンスター1体に30ダメージ', fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'damage', n: 30 }] }] },
      { text: 'みまわり — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'そうびてんけん — イベントカードを2枚使う', fx: [{ t: 'useEvent', n: 2 }] },
      { text: 'せいあつ — サイコロを振って3以上なら、相手モンスター1体に60ダメージ', fx: [{ t: 'dice', cond: [3, 4, 5, 6], label: '3以上', then: [{ t: 'damage', n: 60 }] }] },
      { text: 'かくほ — 相手モンスター1体は次のターン、サイコロを振れない', fx: [{ t: 'skipRoll' }] },
      { text: 'とっしん — 相手モンスター1体に45ダメージ', fx: [{ t: 'damage', n: 45 }] },
    ],
  },
  busoucarry: {
    id: 'busoucarry',
    no: 'M-027',
    kind: 'monster',
    name: 'ぶそうキャリー',
    attr: 'mecha',
    hp: 65,
    rarity: 'unique',
    owner: 'carry',
    flavor: '警備という業務の範囲を、明らかに超えている。',
    faces: [
      { text: 'リロード — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ハンドガン — 相手モンスター1体に30ダメージ', fx: [{ t: 'damage', n: 30 }] },
      { text: 'だんやくこうかん — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'マシンガン — サイコロを振って偶数なら、相手モンスター全員に60ダメージ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damageAll', n: 60 }] }] },
      {
        text: 'じょれいだん — オカルト属性の相手モンスター全員に45ダメージ',
        fx: [{ t: 'damageByAttr', attr: 'occult', scope: 'all', n: 45 }],
      },
      {
        text: 'フルバースト — 相手モンスター1体に70ダメージ。自分のモンスター1体に10ダメージ',
        fx: [{ t: 'damage', n: 70 }, { t: 'selfDamage', n: 10, to: 'choose' }],
      },
    ],
  },
  taihojou: {
    id: 'taihojou',
    no: 'I-017',
    kind: 'event',
    name: 'たいほじょう',
    attr: null,
    rarity: 'unique',
    owner: 'carry',
    flavor: 'たった一枚の紙が、すべての抵抗を終わらせる。',
    text: '相手モンスター1体を持ち主の手札に戻す',
    fx: [{ t: 'bounce' }],
  },
  keihou: {
    id: 'keihou',
    no: 'I-018',
    kind: 'event',
    name: 'けいほうサイレン',
    attr: null,
    rarity: 'unique',
    owner: 'carry',
    flavor: 'これは訓練ではない。たぶん、訓練ではない。',
    text: '相手モンスター全員に20ダメージ。相手の手札を1枚ランダムにトラッシュ',
    fx: [{ t: 'damageAll', n: 20 }, { t: 'discardOpponentHand', n: 1 }],
  },

  // =========================================================================
  // HELL 9000 の固有カード
  // =========================================================================
  gacha: {
    id: 'gacha',
    no: 'M-028',
    kind: 'monster',
    name: 'HELL 9000',
    attr: 'mecha',
    hp: 75,
    rarity: 'unique',
    owner: 'hell',
    flavor: '百円で運命を売りつける、無慈悲な鉄の箱。',
    faces: [
      { text: 'はずれ — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'カプセル1こ — サイコロを振って奇数なら、相手モンスター1体に70ダメージ', fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'damage', n: 70 }] }] },
      { text: 'サービスタイム — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'あたり — サイコロを振って偶数なら、カードを4枚引く', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'draw', n: 4 }] }] },
      { text: 'カプセルらんしゃ — サイコロを振って3以上なら、相手モンスター全員に60ダメージ', fx: [{ t: 'dice', cond: [3, 4, 5, 6], label: '3以上', then: [{ t: 'damageAll', n: 60 }] }] },
      { text: '大あたり — 相手モンスター全員に20ダメージ。もう一度振る', fx: [{ t: 'damageAll', n: 20 }, { t: 'reroll', target: 'self', chainOn6: false }] },
    ],
  },
  capsule: {
    id: 'capsule',
    no: 'M-029',
    kind: 'monster',
    name: 'カプセルモンスター',
    attr: 'mecha',
    hp: 70,
    rarity: 'unique',
    owner: 'hell',
    flavor: '開けるまでは、誰もが夢を見ていられる。',
    faces: [
      { text: 'からのカプセル — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'とびだす — サイコロを振って偶数なら、相手モンスター1体に80ダメージ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damage', n: 80 }] }] },
      { text: 'ふたがひらく — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      {
        text: 'じゅうでん — メカ属性の自分のモンスター全員を20回復',
        fx: [{ t: 'healAll', n: 20, attr: 'mecha' }],
      },
      { text: 'ミニロケット — サイコロを振って3以上なら、相手モンスター1体に75ダメージ', fx: [{ t: 'dice', cond: [3, 4, 5, 6], label: '3以上', then: [{ t: 'damage', n: 75 }] }] },
      {
        text: 'レアカプセル — 相手モンスター1体に70ダメージ。カードを1枚引く',
        fx: [{ t: 'damage', n: 70 }, { t: 'draw', n: 1 }],
      },
    ],
  },
  hyakuen: {
    id: 'hyakuen',
    no: 'I-019',
    kind: 'event',
    name: '100えんだま',
    attr: null,
    rarity: 'unique',
    owner: 'hell',
    flavor: 'たった百円が、運命の歯車をひとつ回す。',
    text: 'サイコロを振って奇数なら、カードを3枚引く',
    fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'draw', n: 3 }] }],
  },
  ooatari: {
    id: 'ooatari',
    no: 'I-020',
    kind: 'event',
    name: '大あたり',
    attr: null,
    rarity: 'unique',
    owner: 'hell',
    flavor: '二度目の幸運は、一度目よりもずっと甘い。',
    text: 'サイコロを振って偶数なら、自分のモンスター2体をもう一度振る',
    fx: [{ t: 'dice', cond: 'even', then: [{ t: 'reroll', target: 'choose', count: 2 }] }],
  },

  // =========================================================================
  // おじさん の固有カード
  // =========================================================================
  ojisan: {
    id: 'ojisan',
    no: 'M-018',
    kind: 'monster',
    name: 'おじさん',
    attr: 'power',
    hp: 95,
    rarity: 'unique',
    owner: 'ojisan',
    flavor: '叩かれるほどに輝きを増す、この部屋の主。',
    faces: [
      { text: 'ちゃをすする — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ビンタ — 相手モンスター1体に35ダメージ', fx: [{ t: 'damage', n: 35 }] },
      { text: 'しりふり — 相手モンスター全員に30ダメージ', fx: [{ t: 'damageAll', n: 30 }] },
      { text: 'ひとやすみ — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'ほんきをだす — イベントカードを1枚使う。相手モンスター全員に20ダメージ', fx: [{ t: 'useEvent', n: 1 }, { t: 'damageAll', n: 20 }] },
      { text: 'しゃくねつのおしり — 相手モンスター1体に60ダメージ', fx: [{ t: 'damage', n: 60 }] },
    ],
  },
  rocketojisan: {
    id: 'rocketojisan',
    no: 'M-019',
    kind: 'monster',
    name: 'おしりロケットおじさん',
    attr: 'power',
    hp: 85,
    rarity: 'unique',
    owner: 'ojisan',
    flavor: '推進剤は根性。着地の予定は、いまだ未定。',
    faces: [
      { text: 'カウントダウン — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ふんしゃ — 相手モンスター1体に35ダメージ', fx: [{ t: 'damage', n: 35 }] },
      { text: 'ねんりょうほきゅう — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'きりもみひこう — 相手モンスター全員に40ダメージ', fx: [{ t: 'damageAll', n: 40 }] },
      {
        text: 'メカキラー — メカ属性の相手モンスター1体に70ダメージ',
        fx: [{ t: 'damageByAttr', attr: 'mecha', scope: 'one', n: 70 }],
      },
      {
        text: 'だいばくはつ — 相手モンスター全員に45ダメージ。自分のモンスター1体に30ダメージ',
        fx: [{ t: 'damageAll', n: 45 }, { t: 'selfDamage', n: 30, to: 'choose' }],
      },
    ],
  },
  oshiriroket: {
    id: 'oshiriroket',
    no: 'I-021',
    kind: 'event',
    name: 'おしりロケット',
    attr: null,
    rarity: 'unique',
    owner: 'ojisan',
    flavor: '点火。その行き先は、本人すら知らない。',
    text: '相手モンスター全員に40ダメージ。自分のモンスター全員に10ダメージ',
    fx: [{ t: 'damageAll', n: 40 }, { t: 'selfDamageAll', n: 10 }],
  },
  shachiku: {
    id: 'shachiku',
    no: 'I-022',
    kind: 'event',
    name: 'しゃちくのどこんじょう',
    attr: null,
    rarity: 'unique',
    owner: 'ojisan',
    flavor: '倒れても立ち上がる。休み方を知らないだけだ。',
    text: '自分のトラッシュからモンスターカードを1枚選び、手札に戻す。自分のモンスター全員を20回復',
    fx: [{ t: 'recover', kind: 'monster', n: 1 }, { t: 'healAll', n: 20, attr: null }],
  },

  // =========================================================================
  // 共通イベント6種(スタートデッキ)
  // =========================================================================
  slipper: {
    id: 'slipper',
    no: 'I-001',
    kind: 'event',
    name: 'スリッパ',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: 'どこの家にもある、最も身近な凶器。',
    text: '相手モンスター1体に20ダメージ',
    fx: [{ t: 'damage', n: 20 }],
  },
  rubberduck: {
    id: 'rubberduck',
    no: 'I-002',
    kind: 'event',
    name: 'ラバーダック',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: 'ただ浮かぶだけで、なぜか心がやすらぐ。',
    text: '自分のモンスター1体を30回復',
    fx: [{ t: 'heal', n: 30 }],
  },
  coffee: {
    id: 'coffee',
    no: 'I-003',
    kind: 'event',
    name: 'きゅうとうしつのコーヒー',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '本日三杯目。味はもう、わからない。',
    text: 'カードを2枚引く',
    fx: [{ t: 'draw', n: 2 }],
  },
  zangyou: {
    id: 'zangyou',
    no: 'I-004',
    kind: 'event',
    name: 'ざんぎょう',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '時計の針は進む。仕事は減らない。',
    text: '選んだモンスターのサイコロを振る。そのモンスターに20ダメージ',
    fx: [{ t: 'reroll', target: 'choose', chainOn6: false }, { t: 'selfDamage', n: 20, to: 'rerolled' }],
  },
  bell: {
    id: 'bell',
    no: 'I-005',
    kind: 'event',
    name: 'ひじょうベル',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '鳴った瞬間、全員の手がぴたりと止まる。',
    text: 'おたがいの手札を2枚ずつランダムにトラッシュ',
    fx: [{ t: 'discardOpponentHand', n: 2 }, { t: 'discardOwnHand', n: 2 }],
  },
  recyclebox: {
    id: 'recyclebox',
    no: 'I-006',
    kind: 'event',
    name: 'リサイクルボックス',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '捨てたはずのものが、なぜかまた戻ってくる。',
    text: '自分のトラッシュからイベントカードを1枚選び、手札に戻す',
    fx: [{ t: 'recover', kind: 'event', n: 1 }],
  },

  // =========================================================================
  // レアカード5種(ガチャ限定)
  // =========================================================================
  nijiiroboshi: {
    id: 'nijiiroboshi',
    no: 'M-010',
    kind: 'monster',
    name: '虹色星',
    attr: 'occult',
    hp: 85,
    rarity: 'rare',
    owner: null,
    flavor: '七色に光る星。ただし願いは、たいてい叶わない。',
    faces: [
      { text: 'にじいろのかがやき — 自分のモンスター全員を15回復', fx: [{ t: 'healAll', n: 15, attr: null }] },
      { text: 'ほしよみ — カードを2枚引く', fx: [{ t: 'draw', n: 2 }] },
      { text: 'にじのちから — イベントカードを2枚使う', fx: [{ t: 'useEvent', n: 2 }] },
      { text: 'プリズムビーム — 相手モンスター1体に45ダメージ', fx: [{ t: 'damage', n: 45 }] },
      { text: 'オーロラ — 相手モンスター全員に35ダメージ', fx: [{ t: 'damageAll', n: 35 }] },
      {
        text: 'にじのねがい — イベントカードを2枚使う。カードを2枚引く',
        fx: [{ t: 'useEvent', n: 2 }, { t: 'draw', n: 2 }],
      },
    ],
  },
  oshiriseijin: {
    id: 'oshiriseijin',
    no: 'M-020',
    kind: 'monster',
    name: 'おしり星人',
    attr: 'power',
    hp: 90,
    rarity: 'rare',
    owner: null,
    flavor: 'はるかな星から、緑の手のひらを掲げてやってきた。',
    faces: [
      { text: 'テレパシー — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'みどりのてのひら — 相手モンスター1体に30ダメージ', fx: [{ t: 'damage', n: 30 }] },
      { text: 'こうしん — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      {
        text: 'アブダクション — 相手モンスター1体を持ち主の手札に戻す。相手の手札を1枚ランダムにトラッシュ',
        fx: [{ t: 'bounce' }, { t: 'discardOpponentHand', n: 1 }],
      },
      { text: 'おしりビーム — 相手モンスター全員に40ダメージ', fx: [{ t: 'damageAll', n: 40 }] },
      { text: 'わくせいのいかり — 相手モンスター1体に70ダメージ', fx: [{ t: 'damage', n: 70 }] },
    ],
  },
  berserker: {
    id: 'berserker',
    no: 'M-030',
    kind: 'monster',
    name: 'バーサーカー 覚醒キャリー',
    attr: 'mecha',
    hp: 80,
    rarity: 'rare',
    owner: null,
    flavor: '規則を忘れた警備員ほど、こわいものはない。',
    faces: [
      {
        text: 'ぼうそう — サイコロを振って奇数なら、相手モンスター1体に100ダメージ',
        fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'damage', n: 100 }] }],
      },
      { text: 'ガトリング — サイコロを振って偶数なら、相手モンスター全員に55ダメージ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damageAll', n: 55 }] }] },
      { text: 'だんやくそうてん — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      {
        text: 'にくだんとつげき — パワー属性の相手モンスター1体に65ダメージ',
        fx: [{ t: 'damageByAttr', attr: 'power', scope: 'one', n: 65 }],
      },
      {
        text: 'れんしゃ — 相手モンスター1体に25ダメージ。もう一度振る',
        fx: [{ t: 'damage', n: 25 }, { t: 'reroll', target: 'self', chainOn6: false }],
      },
      {
        text: 'かくせい — 相手モンスター全員に30ダメージ。もう一度振る',
        fx: [{ t: 'damageAll', n: 30 }, { t: 'reroll', target: 'self', chainOn6: false }],
      },
    ],
  },
  negai: {
    id: 'negai',
    no: 'I-023',
    kind: 'event',
    name: '尻に願いを',
    attr: null,
    rarity: 'rare',
    owner: null,
    flavor: '出る目を選べるなら、それはもう運命ではない。',
    text: '自分の場のモンスターを1体選び、出目を1〜6から選んでそのテキストを実行する',
    fx: [{ t: 'chooseFace' }],
  },
  tenshi: {
    id: 'tenshi',
    no: 'I-024',
    kind: 'event',
    name: 'てんしのおしり',
    attr: null,
    rarity: 'rare',
    owner: null,
    flavor: '天から差しのべられた、まるくてやさしい救い。',
    text: '自分のトラッシュからモンスターカードとイベントカードを1枚ずつ選び、手札に戻す',
    fx: [{ t: 'recover', kind: 'monster', n: 1 }, { t: 'recover', kind: 'event', n: 1 }],
  },
  oshirinova: {
    id: 'oshirinova',
    no: 'I-025',
    kind: 'event',
    name: 'おしりノヴァ',
    attr: null,
    rarity: 'rare',
    owner: null,
    flavor: '爆ぜる尻は、超新星よりまぶしい。',
    text: '相手モンスター全員に50ダメージ。自分のモンスター全員に15ダメージ',
    fx: [{ t: 'damageAll', n: 50 }, { t: 'selfDamageAll', n: 15 }],
  },
  namida: {
    id: 'namida',
    no: 'I-026',
    kind: 'event',
    name: 'おしりのなみだ',
    attr: null,
    rarity: 'rare',
    owner: null,
    flavor: '満月がまるいのは、あれが誰かのおしりだからである。',
    text: 'サイコロを振って、自分のモンスター全員を出た目×15回復',
    fx: [{ t: 'diceHeal', mult: 15, scope: 'all' }],
  },

  // =========================================================================
  // ガチャ限定の共通カード15種(モンスター10 + イベント5)
  // スタートデッキには入らない。ノーマル/レア両方のパックから出る。
  // 役割を極端に振ってあり、属性を見る面が多い。
  // =========================================================================

  // --- ✨オカルト4種 ---
  pocha: {
    id: 'pocha',
    no: 'M-002',
    kind: 'monster',
    name: '整体アザラシ もみ子',
    attr: 'occult',
    hp: 80,
    rarity: 'common',
    owner: null,
    flavor: 'もんでいるのか、もまれているのか、途中から分からなくなる。',
    faces: [
      { text: 'かたもみ — 自分のモンスター1体を20回復', fx: [{ t: 'heal', n: 20 }] },
      { text: 'ぜんしんコース — オカルト属性の自分のモンスター全員を30回復', fx: [{ t: 'healAll', n: 30, attr: 'occult' }] },
      { text: 'ボキボキ — 自分のモンスター1体を40回復', fx: [{ t: 'heal', n: 40 }] },
      { text: 'よやくのでんわ — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'つよもみ — 相手モンスター1体に30ダメージ', fx: [{ t: 'damage', n: 30 }] },
      { text: 'こつばんきょうせい — 自分のモンスター1体をHP全回復', fx: [{ t: 'healFull' }] },
    ],
  },
  suekichi: {
    id: 'suekichi',
    no: 'M-003',
    kind: 'monster',
    name: 'パチンカス よし子',
    attr: 'occult',
    hp: 60,
    rarity: 'common',
    owner: null,
    flavor: '今日は出る。今日は出る。今日は出る。',
    faces: [
      { text: 'はまる — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'のまれる — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'たまをかりる — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'ぜんツッパ — 自分に30ダメージ', fx: [{ t: 'selfDamage', n: 30, to: 'source' }] },
      { text: 'こあたり — 相手モンスター1体に25ダメージ', fx: [{ t: 'damage', n: 25 }] },
      { text: 'フィーバー — 相手モンスター全員に50ダメージ。イベントカードを1枚使う', fx: [{ t: 'damageAll', n: 50 }, { t: 'useEvent', n: 1 }] },
    ],
  },
  manekineko: {
    id: 'manekineko',
    no: 'M-004',
    kind: 'monster',
    name: 'ヤニカス 竹造',
    attr: 'occult',
    hp: 70,
    rarity: 'common',
    owner: null,
    flavor: '本数は減らしている。一本あたりの時間が延びただけだ。',
    faces: [
      { text: 'いっぷく — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'けむをまく — 相手モンスター1体に20ダメージ', fx: [{ t: 'damage', n: 20 }] },
      { text: 'ひをかす — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'きつえんじょのわ — オカルト属性の自分のモンスター全員を25回復', fx: [{ t: 'healAll', n: 25, attr: 'occult' }] },
      { text: 'もういっぽん — カードを2枚引く', fx: [{ t: 'draw', n: 2 }] },
      { text: 'じゅうねんぶんのヤニ — パワー属性の相手モンスター全員に30ダメージ。イベントカードを1枚使う', fx: [{ t: 'damageByAttr', attr: 'power', scope: 'all', n: 30 }, { t: 'useEvent', n: 1 }] },
    ],
  },
  mabuta: {
    id: 'mabuta',
    no: 'M-005',
    kind: 'monster',
    name: 'まぶたの裏の君',
    attr: 'occult',
    hp: 65,
    rarity: 'common',
    owner: null,
    flavor: '目を閉じるとそこにいる。開けてもたぶん、まだいる。',
    faces: [
      { text: 'まばたき — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'のぞきこむ — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'かなしばり — 相手モンスター1体は次のターン振れない', fx: [{ t: 'skipRoll' }] },
      { text: 'ねむりのいと — オカルト属性の自分のモンスター全員を20回復', fx: [{ t: 'healAll', n: 20, attr: 'occult' }] },
      { text: 'ゆめのなか — 相手モンスター1体は次のターン振れない。カードを1枚引く', fx: [{ t: 'skipRoll' }, { t: 'draw', n: 1 }] },
      { text: 'まぶたをとじる — 相手モンスター全員に35ダメージ。相手の手札を1枚トラッシュ', fx: [{ t: 'damageAll', n: 35 }, { t: 'discardOpponentHand', n: 1 }] },
    ],
  },

  michael: {
    id: 'michael',
    no: 'M-006',
    kind: 'monster',
    name: '占い少年 マイケル',
    attr: 'occult',
    hp: 65,
    rarity: 'common',
    owner: null,
    flavor: '当たるも八卦。外れたら、君の日頃の行いのせい。',
    faces: [
      { text: 'みずうらない — サイコロを振って偶数なら、カードを2枚引く', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'draw', n: 2 }] }] },
      { text: 'ほしうらない — サイコロを振って奇数なら、相手モンスター1体に35ダメージ', fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'damage', n: 35 }] }] },
      { text: 'タロット — サイコロを振って4以上なら、イベントカードを1枚使う', fx: [{ t: 'dice', cond: [4, 5, 6], label: '4以上', then: [{ t: 'useEvent', n: 1 }] }] },
      { text: 'すいしょうだま — サイコロを振って3以下なら、自分のモンスター1体を30回復', fx: [{ t: 'dice', cond: [1, 2, 3], label: '3以下', then: [{ t: 'heal', n: 30 }] }] },
      { text: 'よげん — サイコロを振って5以上なら、イベントカードを2枚使う', fx: [{ t: 'dice', cond: [5, 6], label: '5以上', then: [{ t: 'useEvent', n: 2 }] }] },
      { text: 'うんめいのひ — サイコロを振って6なら、イベントカードを3枚使う', fx: [{ t: 'dice', cond: [6], then: [{ t: 'useEvent', n: 3 }] }] },
    ],
  },
  momo: {
    id: 'momo',
    no: 'M-007',
    kind: 'monster',
    name: '酒カス犬 モモ',
    attr: 'occult',
    hp: 70,
    rarity: 'common',
    owner: null,
    flavor: '飲んでいるのは水である。酔っているのは気分である。',
    faces: [
      { text: 'むかえざけ — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ちどりあし — 相手モンスター1体に25ダメージ', fx: [{ t: 'damage', n: 25 }] },
      { text: 'くだをまく — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'ほえまくる — 相手モンスター1体を持ち主の手札に戻す', fx: [{ t: 'bounce' }] },
      {
        text: 'あきかんあさり — 自分のトラッシュからイベントカードを1枚選び、手札に戻す',
        fx: [{ t: 'recover', kind: 'event', n: 1 }],
      },
      { text: 'へべれけタックル — 相手モンスター1体に55ダメージ', fx: [{ t: 'damage', n: 55 }] },
    ],
  },

  // --- ⚡パワー3種 ---
  supa: {
    id: 'supa',
    no: 'M-013',
    kind: 'monster',
    name: 'カッターアイドル ちょんぱ',
    attr: 'power',
    hp: 20,
    rarity: 'common',
    owner: null,
    flavor: '替刃は無い。折れたら、そこで解散である。',
    faces: [
      { text: 'あくしゅかい — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'キレのあるダンス — 相手モンスター1体に45ダメージ', fx: [{ t: 'damage', n: 45 }] },
      { text: 'メロメロボイス — パワー属性の相手モンスター1体に60ダメージ', fx: [{ t: 'damageByAttr', attr: 'power', scope: 'one', n: 60 }] },
      { text: 'かいさんはっぴょう — メカ属性の相手モンスター1体に80ダメージ', fx: [{ t: 'damageByAttr', attr: 'mecha', scope: 'one', n: 80 }] },
      { text: 'ぜんこくツアー — 相手モンスター全員に40ダメージ', fx: [{ t: 'damageAll', n: 40 }] },
      { text: 'でんせつのラストライブ — 相手モンスター1体に90ダメージ', fx: [{ t: 'damage', n: 90 }] },
    ],
  },
  midori: {
    id: 'midori',
    no: 'M-014',
    kind: 'monster',
    name: 'おならマン',
    attr: 'power',
    hp: 75,
    rarity: 'common',
    owner: null,
    flavor: '本人だけが、においに気づいていない。',
    faces: [
      { text: 'すかしっぺ — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'こだしのいちげき — 相手モンスター1体に25ダメージ', fx: [{ t: 'damage', n: 25 }] },
      { text: 'もろにあびせる — 相手モンスター1体に30ダメージ', fx: [{ t: 'damage', n: 30 }] },
      { text: 'ふかいこきゅう — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ちからずくのいちげき — パワー属性の相手モンスター1体に55ダメージ', fx: [{ t: 'damageByAttr', attr: 'power', scope: 'one', n: 55 }] },
      { text: 'かんぷうかんき — 相手モンスター全員に35ダメージ', fx: [{ t: 'damageAll', n: 35 }] },
    ],
  },
  nikutai: {
    id: 'nikutai',
    no: 'M-015',
    kind: 'monster',
    name: 'ペロペロ魔神',
    attr: 'power',
    hp: 80,
    rarity: 'common',
    owner: null,
    flavor: 'なめる以外の解決手段を、持ち合わせていない。',
    faces: [
      { text: 'においをかぎとる — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'ひとなめ — 相手モンスター1体に20ダメージ', fx: [{ t: 'damage', n: 20 }] },
      { text: 'よだれをたらすだけ — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'ねっとりロング — パワー属性の相手モンスター1体に60ダメージ', fx: [{ t: 'damageByAttr', attr: 'power', scope: 'one', n: 60 }] },
      { text: 'まわしなめ — 相手モンスター全員に25ダメージ', fx: [{ t: 'damageAll', n: 25 }] },
      { text: 'ぜんりょくペロペロ — 相手モンスター1体に50ダメージ。自分に10ダメージ', fx: [{ t: 'damage', n: 50 }, { t: 'selfDamage', n: 10, to: 'source' }] },
    ],
  },

  // --- 🔧メカ3種 ---
  zakuro: {
    id: 'zakuro',
    no: 'M-023',
    kind: 'monster',
    name: 'すてちゃうぞおじさん',
    attr: 'mecha',
    hp: 40,
    rarity: 'common',
    owner: null,
    flavor: '捨てるぞ。ほんとに捨てるぞ。……もう捨てた。',
    faces: [
      { text: 'かたづけをはじめる — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'ゴミぶくろでなぐる — サイコロを振って奇数なら、相手モンスター1体に70ダメージ', fx: [{ t: 'dice', cond: 'odd', then: [{ t: 'damage', n: 70 }] }] },
      { text: 'これいる? — 相手の手札を1枚トラッシュ。相手モンスター1体に15ダメージ', fx: [{ t: 'discardOpponentHand', n: 1 }, { t: 'damage', n: 15 }] },
      { text: 'せいりせいとん — メカ属性の自分のモンスター全員を25回復', fx: [{ t: 'healAll', n: 25, attr: 'mecha' }] },
      { text: 'まとめてすてちゃうぞ — サイコロを振って偶数なら、相手の手札を3枚トラッシュ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'discardOpponentHand', n: 3 }] }] },
      { text: 'だいそうじ — 相手モンスター1体に55ダメージ。相手の手札を1枚トラッシュ', fx: [{ t: 'damage', n: 55 }, { t: 'discardOpponentHand', n: 1 }] },
    ],
  },
  gakon: {
    id: 'gakon',
    no: 'M-024',
    kind: 'monster',
    name: '横綱ロボ メロン海',
    attr: 'mecha',
    hp: 85,
    rarity: 'common',
    owner: null,
    flavor: '油圧で四股を踏む。土俵のほうがへこむ。',
    faces: [
      { text: 'しきりなおし — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'はりて — サイコロを振って偶数なら、相手モンスター1体に50ダメージ', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'damage', n: 50 }] }] },
      { text: 'ちゃんこきゅうゆ — メカ属性の自分のモンスター全員を30回復', fx: [{ t: 'healAll', n: 30, attr: 'mecha' }] },
      { text: 'けんしょうきん — カードを1枚引く', fx: [{ t: 'draw', n: 1 }] },
      { text: 'かなめのつっぱり — メカ属性の相手モンスター1体に60ダメージ', fx: [{ t: 'damageByAttr', attr: 'mecha', scope: 'one', n: 60 }] },
      { text: 'うっちゃり — サイコロを振って3以上なら、相手モンスター全員に55ダメージ', fx: [{ t: 'dice', cond: [3, 4, 5, 6], label: '3以上', then: [{ t: 'damageAll', n: 55 }] }] },
    ],
  },
  taiki: {
    id: 'taiki',
    no: 'M-025',
    kind: 'monster',
    name: 'Pai phone 13',
    attr: 'mecha',
    hp: 60,
    rarity: 'common',
    owner: null,
    flavor: '本家より1世代進んでいる。中身は3世代遅れている。',
    faces: [
      { text: 'けんがい — 何も起きない', fx: [{ t: 'none' }] },
      { text: 'つうち — イベントカードを1枚使う', fx: [{ t: 'useEvent', n: 1 }] },
      { text: 'じゅうでんぎれ — 相手モンスター1体に40ダメージ', fx: [{ t: 'damage', n: 40 }] },
      { text: 'きゅうそくじゅうでん — メカ属性の自分のモンスター全員を25回復', fx: [{ t: 'healAll', n: 25, attr: 'mecha' }] },
      { text: 'アプリぜんかいほう — サイコロを振って偶数なら、イベントカードを2枚使う', fx: [{ t: 'dice', cond: 'even', then: [{ t: 'useEvent', n: 2 }] }] },
      { text: 'はつねつばくはつ — 相手モンスター全員に45ダメージ', fx: [{ t: 'damageAll', n: 45 }] },
    ],
  },

  // --- イベント5種 ---
  timecard: {
    id: 'timecard',
    no: 'I-007',
    kind: 'event',
    name: 'ちょっとまってん!',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '言われた側は、なぜか本当に待ってしまう。',
    text: '相手モンスター1体は次のターン振れない',
    fx: [{ t: 'skipRoll' }],
  },
  hijoushoku: {
    id: 'hijoushoku',
    no: 'I-008',
    kind: 'event',
    name: 'スタープリン',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '星の形の器に入っているだけで、味はふつうのプリンである。',
    text: '自分のモンスター全員を20回復',
    fx: [{ t: 'healAll', n: 20, attr: null }],
  },
  fax: {
    id: 'fax',
    no: 'I-009',
    kind: 'event',
    name: 'フィッシングメール',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '【重要】アカウントが凍結されました。心当たりしかない。',
    text: 'メカ属性の相手モンスター全員に25ダメージ',
    fx: [{ t: 'damageByAttr', attr: 'mecha', scope: 'all', n: 25 }],
  },
  yume: {
    id: 'yume',
    no: 'I-010',
    kind: 'event',
    name: '昨日見た明後日の夢',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '見たのは昨日。起きるのは明後日。もう間に合わない。',
    text: 'サイコロを振って5以上が出たら、相手モンスター2体を持ち主の手札に戻す',
    fx: [{ t: 'dice', cond: [5, 6], label: '5以上', then: [{ t: 'bounce', n: 2 }] }],
  },
  onaji: {
    id: 'onaji',
    no: 'I-011',
    kind: 'event',
    name: '卑弥呼様の妄想',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: '鬼道である。たぶん、ぜんぶ妄想である。',
    text: 'パワー属性の相手モンスター全員に25ダメージ',
    fx: [{ t: 'damageByAttr', attr: 'power', scope: 'all', n: 25 }],
  },
  shirislot: {
    id: 'shirislot',
    no: 'I-012',
    kind: 'event',
    name: '尻スロット',
    attr: null,
    rarity: 'common',
    owner: null,
    flavor: 'そろえば天国。はずせば、ただの尻である。',
    text: 'サイコロを振って偶数なら、自分のモンスター1体をHP全回復',
    fx: [{ t: 'dice', cond: 'even', then: [{ t: 'healFull' }] }],
  }
};

// ---------------------------------------------------------------------------
// デッキ(いずれも モンスター5枚 + イベント10枚 = 15枚)
// ---------------------------------------------------------------------------

export const STARTER_DECK = [
  ['yamamoto', 1],
  ['gomibako', 1],
  ['danboru', 1],
  ['byun', 1],
  ['marley', 1],
  ['slipper', 2],
  ['rubberduck', 2],
  ['coffee', 2],
  ['zangyou', 2],
  ['bell', 1],
  ['recyclebox', 1],
];

export const OPPONENT_DECKS = {
  // ガチャ限定の新イベントも1〜2枚ずつ配り、キャラの得意分野を伸ばしている。
  // 共通カード(スリッパ/コーヒー/ベル/リサイクル等)も残してある。
  hoshi: {
    label: '星',
    list: [
      ['hoshi', 3],
      ['hoshinakama', 2],
      ['starrod', 2],
      ['akutai', 2],
      ['recyclebox', 2],
      ['coffee', 2],
      ['hijoushoku', 2], // スタープリン(全体回復) ← スリッパ×2 と入れ替え
    ],
  },
  kuma: {
    label: 'クマ',
    list: [
      ['kuma', 3],
      ['koganekuma', 2],
      ['kumapunch', 3],
      ['nadenade', 3],
      ['slipper', 2],
      ['yume', 2], // 昨日見た明後日の夢(バウンス+ドロー) ← ラバーダック×2 と入れ替え
    ],
  },
  carry: {
    label: 'キャリーちゃん',
    list: [
      ['carry', 3],
      ['busoucarry', 2],
      ['keihou', 3],
      ['taihojou', 2],
      ['bell', 3],
      ['coffee', 1],
      ['fax', 1], // フィッシングメール(オカルト全体45) ← 対オカルトの得意分野を伸ばす
    ],
  },
  hell: {
    label: 'HELL 9000',
    list: [
      ['gacha', 2],
      ['capsule', 3],
      ['ooatari', 3],
      ['hyakuen', 3],
      ['zangyou', 2],
      ['fax', 1],
      ['slipper', 1], // 卑弥呼様の妄想(パワー全体45) ← スリッパ×2 と入れ替え
    ],
  },
  ojisan: {
    label: 'おじさん',
    list: [
      ['ojisan', 3],
      ['rocketojisan', 2],
      ['oshiriroket', 3],
      ['shachiku', 2],
      ['recyclebox', 1],
      ['coffee', 2], // ← ひじょうベル×1 と 卑弥呼様の妄想×1 を入れ替え(2026-08-10)
      ['timecard', 2],
    ],
  },
  oshiriseijin: {
    label: 'おしり星人',
    list: [
      // 隠しボス: 15枚すべてレアカード
      ['oshiriseijin', 2],
      ['nijiiroboshi', 2],
      ['berserker', 1],
      ['negai', 3],
      ['tenshi', 3],
      ['oshirinova', 2],
      ['namida', 2],
    ],
  },
};
// ---------------------------------------------------------------------------
// 対戦相手(難易度順)
// ---------------------------------------------------------------------------

export const OPPONENTS = [
  { key: 'hoshi', label: '星', deck: 'hoshi', difficulty: 1 },
  { key: 'kuma', label: 'クマ', deck: 'kuma', difficulty: 2 },
  { key: 'carry', label: 'キャリーちゃん', deck: 'carry', difficulty: 3 },
  { key: 'hell', label: 'HELL 9000', deck: 'hell', difficulty: 4 },
  { key: 'ojisan', label: 'おじさん', deck: 'ojisan', difficulty: 5 },
  // 隠しボス。おじさんに勝つまで名前は「???」で伏せる(hellshop側で処理)
  { key: 'oshiriseijin', label: 'おしり星人', deck: 'oshiriseijin', difficulty: 6 },
];

// ---------------------------------------------------------------------------
// ガチャの排出プール(固有カードは勝利報酬なので排出されない)
// ---------------------------------------------------------------------------

export const GACHA_POOL = {
  common: [
    'yamamoto',
    'gomibako',
    'danboru',
    'byun',
    'marley',
    'slipper',
    'rubberduck',
    'coffee',
    'zangyou',
    'bell',
    'recyclebox',
    // ガチャ限定の共通カード(スタートデッキには入らない)
    'pocha',
    'suekichi',
    'manekineko',
    'supa',
    'midori',
    'zakuro',
    'gakon',
    'timecard',
    'hijoushoku',
    'fax',
    'mabuta',
    'nikutai',
    'taiki',
    'yume',
    'onaji',
    // 2026-08-11追加の3種
    'michael',
    'momo',
    'shirislot',
  ],
  rare: ['nijiiroboshi', 'oshiriseijin', 'berserker', 'negai', 'tenshi', 'oshirinova', 'namida'],
};

// レアブースターの共通枠。スタートデッキで配られる11種は出さず、
// ガチャ限定の15種だけを対象にする(高い金を払って手持ちと同じ物が出ないように)
const STARTER_IDS = new Set(STARTER_DECK.map(([id]) => id));
GACHA_POOL.premium = GACHA_POOL.common.filter((id) => !STARTER_IDS.has(id));
