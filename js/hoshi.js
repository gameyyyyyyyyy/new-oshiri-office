import * as THREE from "three";

// ---- colors ----
const PINK = 0xff9ecf;
const PINK_DARK = 0xff7fc0;
const PINK_CHEEK = 0xff5c9c;
const EMISSIVE_PINK = 0xff6fa5;
const DARK = 0x2a1c22;
const WHITE = 0xffffff;
const TONGUE_PINK = 0xd9426b;

function mat(color, roughness = 0.85, metalness = 0.02, emissive = null, emissiveIntensity = 0.15) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (emissive !== null) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = emissiveIntensity;
  }
  return m;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function ease(x) {
  return x * x * (3 - 2 * x);
}

// 5-pointed star outline, first vertex pointing straight up (+Y in shape-local space).
// With points-up orientation: the top point reads as the head, the two upper-side
// points read as hands, and the two lower points read as feet.
function buildStarShape(outerR, innerR, points) {
  const shape = new THREE.Shape();
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step + Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// Open, laughing mouth outline: flattish upper lip line curving down into a
// deep rounded lower jaw opening, so an inner dark mesh reads as an open mouth.
function buildMouthShape(w, hTop, hBot) {
  const shape = new THREE.Shape();
  shape.moveTo(-w, hTop);
  shape.quadraticCurveTo(0, hTop + w * 0.35, w, hTop);
  shape.quadraticCurveTo(w * 0.92, -hBot * 0.55, 0, -hBot);
  shape.quadraticCurveTo(-w * 0.92, -hBot * 0.55, -w, hTop);
  shape.closePath();
  return shape;
}

export function createHoshi() {
  const group = new THREE.Group();
  const clickableMeshes = [];

  function addMesh(geo, material, parent, pos, scaleV, rot) {
    const m = new THREE.Mesh(geo, material);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scaleV) m.scale.set(scaleV[0], scaleV[1], scaleV[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(m);
    return m;
  }

  // ---- sizing (overall height must stay <= 0.35m) ----
  // Chubby plush silhouette: bigger inner radius (rounder body, shorter points)
  // and a heavier bevel (soft rounded edges everywhere, no sharp corners).
  const OUTER_R = 0.15;
  const INNER_R = 0.078;
  const DEPTH = 0.085;
  const BEVEL_T = 0.026;
  const BEVEL_S = 0.024;

  // dancer: root for hop / spin (idle hop + react jump-spin)
  const dancer = new THREE.Group();
  group.add(dancer);

  // squish: root for squash/stretch + sway. The star's own bottom points are
  // the "feet", so this sits directly on the floor (y=0) — no separate legs.
  const squish = new THREE.Group();
  dancer.add(squish);

  // ---- materials ----
  const bodyMat = mat(PINK, 0.85, 0.02, EMISSIVE_PINK, 0.15);
  const cheekMat = mat(PINK_CHEEK, 0.55, 0);
  const eyeMat = mat(DARK, 0.35, 0.05);
  const mouthMat = mat(DARK, 0.4, 0.02);
  const tongueMat = mat(TONGUE_PINK, 0.5, 0);
  const highlightMat = mat(WHITE, 0.2, 0);

  // ================= STAR BODY =================
  const starShape = buildStarShape(OUTER_R, INNER_R, 5);
  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL_T,
    bevelSize: BEVEL_S,
    bevelSegments: 5,
    curveSegments: 8,
  });
  starGeo.translate(0, 0, -DEPTH / 2); // center on z=0 (front cap ends up facing -z)
  starGeo.computeBoundingBox();
  starGeo.translate(0, -starGeo.boundingBox.min.y, 0); // bottom-most point -> squish-local y=0
  starGeo.computeBoundingBox();

  const starTop = starGeo.boundingBox.max.y;
  const starFrontZ = starGeo.boundingBox.min.z + 0.002; // just proud of the front (-z) cap

  const starMesh = new THREE.Mesh(starGeo, bodyMat);
  squish.add(starMesh);
  clickableMeshes.push(starMesh);

  // ================= FACE (front, facing -z, centered on the body) =================
  const faceY = starTop * 0.42;

  function makeEye(xSign) {
    const grp = new THREE.Group();
    grp.position.set(xSign * 0.045, faceY, starFrontZ);
    squish.add(grp);
    const ball = addMesh(new THREE.SphereGeometry(0.017, 14, 12), eyeMat, grp, [0, 0, 0.005], [0.62, 1.25, 0.55]);
    const hl = addMesh(new THREE.SphereGeometry(0.006, 8, 8), highlightMat, grp, [0.006, 0.008, 0.015]);
    return { grp, ball, hl };
  }
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);

  const cheekL = addMesh(
    new THREE.SphereGeometry(0.02, 12, 10),
    cheekMat,
    squish,
    [-0.085, faceY - 0.03, starFrontZ - 0.004],
    [1, 0.7, 0.4]
  );
  const cheekR = addMesh(
    new THREE.SphereGeometry(0.02, 12, 10),
    cheekMat,
    squish,
    [0.085, faceY - 0.03, starFrontZ - 0.004],
    [1, 0.7, 0.4]
  );

  // Open, laughing mouth: dark inner mesh with the open-mouth outline, plus a
  // small tongue peeking from the bottom.
  const mouthShape = buildMouthShape(0.032, 0.006, 0.026);
  const mouthGeo = new THREE.ExtrudeGeometry(mouthShape, {
    depth: 0.01,
    bevelEnabled: false,
    curveSegments: 10,
  });
  // 口の前面が星の前面キャップと同一平面になるとZファイティングでチラつくので、
  // 少し手前(-z)に浮かせる。舌も同じ量だけ前へ
  const mouth = addMesh(mouthGeo, mouthMat, squish, [0, faceY - 0.055, starFrontZ - 0.006], null, [0, 0, 0]);

  const tongue = addMesh(
    new THREE.SphereGeometry(0.013, 12, 8),
    tongueMat,
    squish,
    [0, faceY - 0.072, starFrontZ],
    [1, 0.55, 0.5]
  );

  // ---- invisible hit-sphere: easier click target around the whole toy ----
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hitSphere = addMesh(new THREE.SphereGeometry(OUTER_R * 1.3, 10, 8), hitMat, dancer, [0, starTop * 0.45, 0]);
  clickableMeshes.push(hitSphere);

  // ================= animation state =================
  let curP = 0;
  let targetP = 0;
  let idlePhase = 0;

  const HOP_PERIOD = 3.4;
  const HOP_DUR = 0.35;
  let hopTimer = 0;

  const REACT_DUR = 0.4;
  const LAND_SETTLE = 0.25;
  let reactActive = false;
  let reactTimer = 0;

  function update(t, dtIn) {
    const dt = clamp(dtIn || 0.016, 0, 0.05);

    // ease current speed multiplier toward target progress (tempo rises with BGM progress)
    curP += (targetP - curP) * Math.min(1, dt * 3);
    const spd = 1 + curP;
    idlePhase += dt * spd;

    // ---- idle sway (side to side) ----
    let swayZ = Math.sin(idlePhase * 1.6) * 0.12;

    // ---- idle squash (puni puni breathing) ----
    const squashPhase = Math.sin(idlePhase * 2.2);
    let squashY = 1 + squashPhase * 0.05;
    let squashXZ = 1 - squashPhase * 0.035;

    // ---- occasional idle hop ----
    hopTimer += dt * spd;
    let hopY = 0;
    if (hopTimer > HOP_PERIOD) {
      const ht = (hopTimer - HOP_PERIOD) / HOP_DUR;
      if (ht >= 1) {
        hopTimer = 0;
      } else {
        hopY = Math.sin(Math.PI * ht) * 0.03;
      }
    }

    let dancerY = hopY;
    let dancerRotY = 0;

    // ---- react: click reaction (jump + spin, then a puni landing squish) ----
    if (reactActive) {
      reactTimer += dt;
      if (reactTimer <= REACT_DUR) {
        const rt = reactTimer / REACT_DUR;
        dancerY = Math.sin(Math.PI * rt) * 0.12;
        dancerRotY = ease(rt) * Math.PI * 2;
        swayZ = 0;
      } else if (reactTimer <= REACT_DUR + LAND_SETTLE) {
        const lt = clamp((reactTimer - REACT_DUR) / LAND_SETTLE, 0, 1);
        dancerY = 0;
        dancerRotY = 0;
        const pulse = Math.sin(Math.PI * clamp(lt * 1.6, 0, 1)) * (1 - lt);
        squashY = 1 - pulse * 0.2;
        squashXZ = 1 + pulse * 0.14;
        swayZ *= lt;
      } else {
        reactActive = false;
      }
    }

    dancer.position.y = dancerY;
    dancer.rotation.y = dancerRotY;
    squish.rotation.z = swayZ;
    squish.scale.set(squashXZ, squashY, squashXZ);
  }

  function setProgress(p) {
    targetP = clamp(p, 0, 1);
  }

  function react() {
    reactActive = true;
    reactTimer = 0;
  }

  return { group, clickableMeshes, update, setProgress, react };
}

// ---- セリフ集: ピンクの星型マスコット「星」。口癖は "That's me!"。 ----
// ナルシストでツンデレ気味、口は悪いが(伏せ字)たまに可愛げを見せる。
export const HOSHI_LINES = [
  // --- 「That's me!」だけ・その変奏 (10) ---
  "That's me!",
  "That's me、以上!",
  "それが俺、That's me!",
  "That's me...当然でしょ?",
  "誰が呼んだ? That's me!",
  "That's meだよ、覚えとけ",
  "俺様、That's me参上",
  "That's me以外の何が?",
  "That's me、殿堂入り",
  "文句ある? That's me",

  // --- ナルシスト自画自賛 (20) ---
  "俺、輝きすぎ問題",
  "星型で生まれてラッキーだったな、俺",
  "この可愛さは反則級",
  "俺のピンク、宇宙一",
  "見惚れてもいいぞ、許す",
  "俺が主役、異論は却下",
  "完璧すぎて怖いだろ",
  "俺のツヤ、見た?見た?",
  "生まれながらのスター(意味深)",
  "俺のセンス、誰にも負けない",
  "可愛いは正義、俺がその証明",
  "俺様レベルの存在感、そうそう出ない",
  "鏡見るたび惚れる、自分に",
  "この輝き、有料でもいい",
  "俺がいるだけで空間が華やぐ",
  "俺のほっぺ、揉みたくなるだろ?",
  "星型のくせに完璧、それが俺",
  "俺、盛れてる自覚あるから",
  "自己肯定感、天井知らず",
  "俺を見てため息つくなよ、照れる",

  // --- プレイヤーへの悪態・ツッコミ (25) ---
  "お前、暇人かよ",
  "何度も突くな、しつこい奴",
  "指、俺に触れる資格あんのか?",
  "またお前か、飽きねえな",
  "そんなに俺が好きなの? キモいぞ",
  "は? 何見てんだよ",
  "つつくの下手くそか",
  "お前のセンス、心配になる",
  "暇なら仕事しろよ、な?",
  "俺で遊んでる場合か、お前",
  "しつこい男は嫌われるぞ",
  "毎回同じ反応、飽きた",
  "お前が一番謎の生き物な",
  "その指、洗ってから来い",
  "俺への愛が重い、引くわ",
  "何がしたいんだお前は",
  "見た目より暇そうだな、お前",
  "俺をおもちゃにすんな…嘘、もっとやれ",
  "お前の人生、大丈夫か?",
  "つつく才能だけは一流だな",
  "俺基準だとお前まだまだ",
  "そのクリック、意味あるのか?",
  "また来た、懲りない奴め",
  "お前の暇つぶし、俺かよ",
  "俺に構いすぎ、依存症だぞ",

  // --- おじさん評(尻叩き含む) (20) ---
  "あのおじさん、叩かれすぎだろ",
  "尻叩かれて喜ぶとか、末期",
  "おじさんの尻、もはや名物",
  "叩かれるの好きすぎだろ、あの人",
  "おじさん、宇宙飛ぶ準備できてる?",
  "尻ロケット、正気か?",
  "あのおじさんの悲鳴、芸術点高い",
  "叩かれ待ちの顔、必死すぎ",
  "おじさんの尻、耐久力バグってる",
  "尻叩いて育成とか、狂った職場",
  "あの人の尻、もう痣だらけじゃね?",
  "おじさん、Mの才能あるだろ",
  "尻で会社回してんの、あのオフィス",
  "叩かれるたび嬉しそう、心配だわ",
  "おじさんの絶叫、BGM代わりになる",
  "尻叩き、あの人の生きがいらしい",
  "宇宙行きたいの? 尻から?",
  "あの尻、もう財産みたいなもんだろ",
  "叩かれ役に徹しててエラい、あの人",
  "おじさんのケツ、社の宝だな",

  // --- クマ・オフィスの他オブジェクトへのコメント (15) ---
  "クマ、踊りすぎて存在感負けてる",
  "クマの着ぐるみ、俺のがまだ可愛い",
  "あのクマ、なんで巨大化すんの",
  "ゴミ箱漁る趣味、理解できん",
  "段ボールロボ、無理あるだろその発想",
  "冷蔵庫からペンギン出すな、常識で考えろ",
  "レコード山、ただのゴミの塔だろ",
  "警備員、マシンガン持つ意味ある?",
  "ポスター見て何が楽しいんだよ",
  "ロッカーからタキシード出るの怪奇現象",
  "このオフィス、ツッコミどころしかない",
  "クマのダンス、俺の方が上手い",
  "撫でられてるクマ、羨ましくないぞ、別に",
  "散らかった部屋、片付けろよ誰か",
  "このオフィス自体がもう事故物件",

  // --- 英語混じりのノリ (15) ---
  "F**k yeah, that's me!",
  "俺? 最高だよ、f**kin' obviously",
  "Hell yeah、俺様参上",
  "お前、うるせーよ、shut up already",
  "俺に敵うわけねーだろ、no cap",
  "That's f**kin' me, deal with it",
  "b**ch please、俺が正義",
  "俺の可愛さ、undeniable だから",
  "No f**kin' way お前が主役とか",
  "俺様最強、period.",
  "f**k it、俺が決める",
  "スター確定、no debate",
  "お前ら全員、my stage だから",
  "可愛い天才、that's literally me",
  "F**kin' shine bright、それが俺",

  // --- たまの可愛げ・デレ (15) ---
  "べ、別にお前のこと嫌いじゃないし",
  "ちょっとだけ…楽しいかも、今日",
  "撫でられるの、まあ悪くない",
  "お前がいると…ちょっと賑やかでいいな",
  "今のは、ちょっと可愛かったな俺",
  "たまには優しくしてやってもいいぞ",
  "…ありがとな、って言わせんな",
  "お前、たまにいい奴だな",
  "一緒にいるの、嫌いじゃないよ",
  "ちょっとだけ、そばにいてもいいぞ",
  "照れてるわけじゃないからな、これ",
  "今日は機嫌いいかも、お前のおかげ",
  "たまにはこういうのも、悪くないな",
  "ずっとここにいてくれても…いいけど",
  "本当は…嬉しいんだからな、少し",

  // --- カードバトルネタ (6) ---
  "カードバトル?俺のカード、可愛すぎて実質最強",
  "俺とカードで勝負しろよ。負けても泣くなよ?",
  "デッキに俺を入れろ。勝率?知らん。画面が輝く",
  "俺が対戦相手で最弱とか言ったやつ、F**k you",
  "後ろのロボットのガチャ、俺のカードが出たら大当たりだぜ",
  "おっさんのカード、HP高すぎだろ…ズルくね?",
];
