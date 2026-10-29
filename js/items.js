import * as THREE from "three";
import { glbProp } from "./glb.js";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// 叩きアイテム12種。素手/丸めた新聞紙/もふもふクマパンチ/星の本気棒は手作りモデル、
// それ以外(スリッパ/バゲット/ギター/ビニール傘/フライパン/ラバーダック/トロフィー/
// マシンガン)はGLBモデル(assets/models/*.glb)を読み込んで使用
export const SLAP_ITEMS = [
  { id: "hand", name: "素手", points: 5, unlock: 0, sound: "hand" },
  { id: "slipper", name: "スリッパ", points: 10, unlock: 500, sound: "slipper" },
  { id: "newspaper", name: "丸めた新聞紙", points: 12, unlock: -1, sound: "paper" },
  { id: "baguette", name: "バゲット", points: 15, unlock: 3500, sound: "baguette" },
  { id: "guitar", name: "ギター", points: 30, unlock: 8000, sound: "guitar" },
  { id: "kasa", name: "ビニール傘", points: 100, unlock: -1, sound: "kasa" },
  { id: "pan", name: "フライパン", points: 200, unlock: 20000, sound: "pan" },
  { id: "duck", name: "金庫のラバーダック", points: 800, unlock: -1, sound: "squeak" },
  { id: "trophy", name: "金のトロフィー", points: 1800, unlock: 100000, sound: "gold" },
  { id: "machinegun", name: "マシンガン", points: 2500, unlock: -1, sound: "gun" },
  { id: "pawpunch", name: "もふもふクマパンチ", points: 5000, unlock: -1, sound: "paw" },
  { id: "starrod", name: "星の本気棒", points: 10000, unlock: -1, sound: "star" },
];

export const COSTUMES = [
  { id: "suit", name: "いつものスーツ", unlock: 0 },
  { id: "nurse", name: "ナース服", unlock: 5000 },
  { id: "boxrobo", name: "段ボールロボ", unlock: -1 },
  { id: "dino", name: "恐竜の着ぐるみ", unlock: 50000 },
  { id: "tuxedo", name: "タキシード", unlock: -1 },
  { id: "space", name: "宇宙服", unlock: 250000 },
  { id: "penguin", name: "ペンギンの着ぐるみ", unlock: -1 },
  { id: "magical", name: "魔法少女", unlock: 600000 },
  { id: "bear", name: "クマの着ぐるみ", unlock: -1 },
  { id: "gold", name: "黄金スーツ", unlock: -1 },
  { id: "hoshi", name: "星の着ぐるみ", unlock: -1 },
];

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const SELECT_GLOW = 0xffe680;
const POP_DURATION = 0.5;

function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.15,
      roughness: opts.roughness ?? 0.6,
      emissive: new THREE.Color(opts.emissive ?? 0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
    })
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Thin cylinder stretched between two points in the local XY plane. Used for
// wire-hanger frames and rail brackets.
function wireSegment(x1, y1, x2, y2, radius = 0.005, color = 0xbbbbbb) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 0.001;
  const cyl = mesh(new THREE.CylinderGeometry(radius, radius, len, 8), color, {
    metalness: 0.7,
    roughness: 0.3,
  });
  cyl.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
  cyl.rotation.z = Math.atan2(-dx, dy);
  return cyl;
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// Flat 5-pointed star outline (alternating outer/inner radius), used for the
// starrod head and the hoshi hanger topper.
function starShape(outerR, innerR, points = 5) {
  const shape = new THREE.Shape();
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = i * step - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// Item builders (each returns { group, restY })
// ---------------------------------------------------------------------------

function buildHand() {
  const g = new THREE.Group();
  const skin = 0xf2c299;
  const palm = mesh(new THREE.BoxGeometry(0.09, 0.02, 0.1), skin, { roughness: 0.6 });
  g.add(palm);
  // rounded heel of the palm
  const palmCap = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), skin, { roughness: 0.6 });
  palmCap.rotation.x = Math.PI / 2;
  palmCap.position.set(0, 0, -0.05);
  g.add(palmCap);
  const fingerOffsets = [-0.033, -0.011, 0.011, 0.033];
  const fingerLens = [0.075, 0.085, 0.082, 0.07];
  for (let i = 0; i < 4; i++) {
    const len = fingerLens[i];
    const finger = mesh(new THREE.CapsuleGeometry(0.012, len - 0.024, 6, 10), skin, { roughness: 0.6 });
    finger.rotation.x = Math.PI / 2;
    finger.position.set(fingerOffsets[i], 0, 0.05 + len / 2);
    g.add(finger);
  }
  const thumb = mesh(new THREE.CapsuleGeometry(0.013, 0.045, 6, 10), skin, { roughness: 0.6 });
  thumb.rotation.z = Math.PI / 2;
  thumb.rotation.y = -0.5;
  thumb.position.set(-0.06, 0, -0.01);
  g.add(thumb);
  return { group: g, restY: 0.012 };
}

function buildSlipper() {
  // GLBは既に横長(長軸X)・接地済みで自然な「棚に寝かせる」向きのため無回転で使用
  const g = glbProp("./assets/models/slipper.glb", {
    clone: true,
    targetWidth: 0.28,
    palette: "mono-red",
  });
  return { group: g, restY: 0 };
}

function buildNewspaper() {
  const g = new THREE.Group();
  const paper = 0xefe6d5;
  const seam = 0xcfc2a8;
  // two half-length rolls at a slight opposing tilt to read as "slightly bent"
  const bodyA = mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.18, 16), paper, { roughness: 0.85 });
  bodyA.rotation.z = Math.PI / 2 - 0.08;
  bodyA.position.set(-0.09, 0.01, 0);
  g.add(bodyA);
  const bodyB = mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.18, 16), paper, { roughness: 0.85 });
  bodyB.rotation.z = Math.PI / 2 + 0.08;
  bodyB.position.set(0.09, -0.01, 0);
  g.add(bodyB);
  // spiral seam line, approximated with short arc segments stepped along the roll
  for (let i = 0; i < 10; i++) {
    const seg = mesh(new THREE.TorusGeometry(0.0225, 0.0015, 6, 10, Math.PI * 0.6), seam, {
      roughness: 0.9,
    });
    seg.rotation.y = Math.PI / 2;
    seg.rotation.z = i * 0.35;
    seg.position.x = -0.16 + i * 0.035;
    seg.position.y = i < 5 ? 0.01 * (i / 5) : 0.01 - 0.02 * ((i - 5) / 5);
    g.add(seg);
  }
  // rubber bands
  const band1 = mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 16), 0xd2691e, { roughness: 0.8 });
  band1.rotation.y = Math.PI / 2;
  band1.position.x = -0.05;
  g.add(band1);
  const band2 = mesh(new THREE.TorusGeometry(0.024, 0.004, 8, 16), 0xd2691e, { roughness: 0.8 });
  band2.rotation.y = Math.PI / 2;
  band2.position.x = 0.06;
  g.add(band2);
  return { group: g, restY: 0.026 };
}

// ---------------------------------------------------------------------------
// GLB weapon builders (assets/models/*.glb)
// ---------------------------------------------------------------------------

// GLBの元の向きは不明なので「Z前方・Y上」を仮定し、長物(バゲット/ギター/マシンガン)は
// 内側のGroup(inner)を回転させて長軸が+Yになるよう補正する。lookAt/rotateXでの
// スイング演出は呼び出し側(slapper.js)が外側のGroup(outer)に対して直接行うため、
// outerの回転はスイング毎に上書きされる。よって向き補正は必ずinnerで行い、outerには
// 一切回転を持たせないこと。
// GLBは非同期読み込みのため、正しい寸法で正規化できるのはロード完了後(onReady)のみ。
// その時点でouterがpop演出やスイングで動いていてもズレないよう、測定中だけouterの
// position/scale/回転を一時的に単位化してから測る。
function buildGlbLong(url, { targetLen, axis, palette = "mono-red" } = {}) {
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  if (axis === "z") inner.rotation.x = -Math.PI / 2; // 長軸Z -> +Y
  else if (axis === "x") inner.rotation.z = Math.PI / 2; // 長軸X -> +Y
  outer.add(inner);
  const model = glbProp(url, {
    clone: true,
    palette,
    onReady: () => {
      const savedPos = outer.position.clone();
      const savedScale = outer.scale.clone();
      const savedQuat = outer.quaternion.clone();
      // 親(棚の陳列ラッパー等)の位置・スケールが混入しないよう、測定中は切り離す
      const savedParent = outer.parent;
      if (savedParent) savedParent.remove(outer);
      outer.position.set(0, 0, 0);
      outer.scale.set(1, 1, 1);
      outer.quaternion.identity();

      outer.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      if (targetLen && size.y > 1e-4) {
        inner.scale.setScalar(targetLen / size.y);
      }
      outer.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(inner);
      const center = box2.getCenter(new THREE.Vector3());
      inner.position.x -= center.x;
      inner.position.z -= center.z;
      inner.position.y -= box2.min.y;

      outer.position.copy(savedPos);
      outer.scale.copy(savedScale);
      outer.quaternion.copy(savedQuat);
      if (savedParent) savedParent.add(outer);
    },
  });
  inner.add(model);
  return { group: outer, restY: 0 };
}

function buildBaguette() {
  // 実測: 長軸Z(パンの長さ)、Yが厚み → Z軸をYへ
  return buildGlbLong("./assets/models/baguette.glb", { targetLen: 0.6, axis: "z", palette: "keep" });
}

function buildGuitar() {
  // 実測: 長軸Z(ネック〜ボディ)、Yが薄い厚み → Z軸をYへ
  return buildGlbLong("./assets/models/guitar.glb", { targetLen: 0.75, axis: "z", palette: "mono-red" });
}

function buildKasa() {
  // 実測: 既に長軸がY(閉じた傘が立った状態)のため回転不要、そのままtargetHeightで正規化
  const g = glbProp("./assets/models/umbrella.glb", {
    clone: true,
    targetHeight: 0.8,
    palette: "mono-red",
  });
  return { group: g, restY: 0 };
}

function buildPan() {
  // 実測: Yが薄い(鍋が寝ている)、X=鍋本体の幅 → 無回転でtargetWidthのみ正規化
  const g = glbProp("./assets/models/pan.glb", {
    clone: true,
    targetWidth: 0.45,
    palette: "mono-red",
  });
  return { group: g, restY: 0 };
}

function buildDuck() {
  // 実測: ほぼ等方だが浮かぶアヒルとして自然なY上向きのままtargetHeightで正規化
  const g = glbProp("./assets/models/duck.glb", {
    clone: true,
    targetHeight: 0.22,
    palette: "keep",
  });
  return { group: g, restY: 0 };
}

function buildTrophy() {
  // 実測: 既にYが最大(トロフィーが立った状態)のため回転不要
  const g = glbProp("./assets/models/trophy.glb", {
    clone: true,
    targetHeight: 0.4,
    palette: "gold",
  });
  return { group: g, restY: 0 };
}

function buildMachinegun() {
  // 実測: 長軸X(銃身〜ストック)、Zが薄い厚み → X軸をYへ
  return buildGlbLong("./assets/models/machinegun.glb", { targetLen: 0.65, axis: "x", palette: "mono-red" });
}

function buildPawpunch() {
  const g = new THREE.Group();
  const fur = 0x8b5e34;
  const pad = 0xd9b48f;
  const palm = mesh(new THREE.SphereGeometry(0.09, 24, 18), fur, { roughness: 0.95 });
  palm.scale.set(1, 0.85, 1.1);
  g.add(palm);
  // four toe pads
  const toeOffsets = [-0.06, -0.02, 0.02, 0.06];
  for (const ox of toeOffsets) {
    const toe = mesh(new THREE.SphereGeometry(0.022, 16, 12), pad, { roughness: 0.7 });
    toe.position.set(ox, -0.02, 0.1);
    g.add(toe);
  }
  // big center pad
  const centerPad = mesh(new THREE.SphereGeometry(0.03, 16, 12), pad, { roughness: 0.7 });
  centerPad.position.set(0, -0.04, 0.03);
  centerPad.scale.set(1, 0.7, 1);
  g.add(centerPad);
  // claws
  for (const ox of toeOffsets) {
    const claw = mesh(new THREE.ConeGeometry(0.008, 0.025, 8), 0xf2ede1, { roughness: 0.4 });
    claw.rotation.x = -Math.PI / 2.2;
    claw.position.set(ox, -0.015, 0.14);
    g.add(claw);
  }
  // fluffy cuff
  const cuff = mesh(new THREE.TorusGeometry(0.075, 0.035, 12, 24), fur, { roughness: 0.95 });
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, 0, -0.09);
  g.add(cuff);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tuft = mesh(new THREE.SphereGeometry(0.02, 8, 6), fur, { roughness: 1 });
    tuft.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.055, -0.09 + (i % 2 === 0 ? 0.01 : -0.01));
    g.add(tuft);
  }
  return { group: g, restY: 0.09 };
}

function buildStarrod() {
  const g = new THREE.Group();
  const goldOpts = { metalness: 0.85, roughness: 0.25 };
  const stick = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.3, 20), 0xffd700, goldOpts);
  stick.rotation.z = Math.PI / 2;
  g.add(stick);
  // grip wrap rings along the shaft
  for (let i = -2; i <= 2; i++) {
    const wrap = mesh(new THREE.TorusGeometry(0.012, 0.0018, 6, 16), 0xe6c200, goldOpts);
    wrap.rotation.y = Math.PI / 2;
    wrap.position.set(-0.05 + i * 0.03, 0, 0);
    g.add(wrap);
  }
  // pink 5-pointed star head, mounted flat like a paddle at the tip
  const starGeo = new THREE.ExtrudeGeometry(starShape(0.075, 0.032, 5), {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  starGeo.center();
  const star = mesh(starGeo, 0xff6fa5, {
    metalness: 0.2,
    roughness: 0.3,
    emissive: 0xff6fa5,
    emissiveIntensity: 0.5,
  });
  star.rotation.x = Math.PI / 2;
  star.position.set(0.19, 0, 0);
  g.add(star);
  // small inner sparkle accent
  const sparkleGeo = new THREE.ExtrudeGeometry(starShape(0.03, 0.013, 5), {
    depth: 0.006,
    bevelEnabled: false,
  });
  sparkleGeo.center();
  const sparkle = mesh(sparkleGeo, 0xffffff, {
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    roughness: 0.3,
  });
  sparkle.rotation.x = Math.PI / 2;
  sparkle.position.set(0.19, 0.014, 0);
  g.add(sparkle);
  return { group: g, restY: 0.02 };
}

const ITEM_BUILDERS = {
  hand: buildHand,
  slipper: buildSlipper,
  newspaper: buildNewspaper,
  baguette: buildBaguette,
  guitar: buildGuitar,
  kasa: buildKasa,
  pan: buildPan,
  duck: buildDuck,
  trophy: buildTrophy,
  machinegun: buildMachinegun,
  pawpunch: buildPawpunch,
  starrod: buildStarrod,
};

// ---------------------------------------------------------------------------
// Costume toppers (mounted above the hanger hook)
// ---------------------------------------------------------------------------

function tieTopper() {
  const t = new THREE.Group();
  const tieColor = 0x7a1f1f;
  const knot = mesh(new THREE.BoxGeometry(0.02, 0.02, 0.015), tieColor, { emissive: tieColor });
  knot.position.y = 0.01;
  t.add(knot);
  const tieShape = new THREE.Shape();
  tieShape.moveTo(-0.015, 0);
  tieShape.lineTo(0.015, 0);
  tieShape.lineTo(0.02, -0.06);
  tieShape.lineTo(0, -0.08);
  tieShape.lineTo(-0.02, -0.06);
  tieShape.closePath();
  const tieGeo = new THREE.ExtrudeGeometry(tieShape, { depth: 0.006, bevelEnabled: false });
  const tie = mesh(tieGeo, tieColor, { emissive: tieColor });
  tie.position.set(0, 0, -0.003);
  t.add(tie);
  return t;
}

function boxroboTopper() {
  const t = new THREE.Group();
  const cardboard = 0xc19a6b;
  const head = mesh(new THREE.BoxGeometry(0.1, 0.09, 0.08), cardboard, {
    roughness: 0.9,
    emissive: cardboard,
  });
  t.add(head);
  const marker = 0x2b2b2b;
  const eyeGeo = new THREE.BoxGeometry(0.012, 0.012, 0.004);
  const eyeL = mesh(eyeGeo, marker, { roughness: 0.9 });
  eyeL.position.set(-0.022, 0.01, 0.041);
  t.add(eyeL);
  const eyeR = mesh(eyeGeo.clone(), marker, { roughness: 0.9 });
  eyeR.position.set(0.022, 0.01, 0.041);
  t.add(eyeR);
  const mouth = mesh(new THREE.BoxGeometry(0.04, 0.006, 0.004), marker, { roughness: 0.9 });
  mouth.position.set(0, -0.018, 0.041);
  t.add(mouth);
  // flap "ears" on top like an open box lid
  const flapGeo = new THREE.BoxGeometry(0.06, 0.015, 0.04);
  const flapL = mesh(flapGeo, cardboard, { roughness: 0.9, emissive: cardboard });
  flapL.rotation.z = 0.5;
  flapL.position.set(-0.045, 0.05, 0);
  t.add(flapL);
  const flapR = mesh(flapGeo.clone(), cardboard, { roughness: 0.9, emissive: cardboard });
  flapR.rotation.z = -0.5;
  flapR.position.set(0.045, 0.05, 0);
  t.add(flapR);
  return t;
}

function nurseTopper() {
  const t = new THREE.Group();
  const cap = mesh(new THREE.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, {
    emissive: 0xffffff,
  });
  t.add(cap);
  const cross1 = mesh(new THREE.BoxGeometry(0.06, 0.015, 0.015), 0xe53935, { emissive: 0xe53935 });
  cross1.position.y = 0.03;
  t.add(cross1);
  const cross2 = mesh(new THREE.BoxGeometry(0.015, 0.015, 0.06), 0xe53935, { emissive: 0xe53935 });
  cross2.position.y = 0.03;
  t.add(cross2);
  return t;
}

function dinoTopper() {
  const t = new THREE.Group();
  const hood = mesh(
    new THREE.SphereGeometry(0.065, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.65),
    0x4caf50,
    { emissive: 0x4caf50 }
  );
  t.add(hood);
  for (let i = -2; i <= 2; i++) {
    const tooth = mesh(new THREE.ConeGeometry(0.008, 0.02, 6), 0xffffff, { emissive: 0xffffff });
    tooth.position.set(i * 0.018, 0, 0.055);
    tooth.rotation.x = Math.PI;
    t.add(tooth);
  }
  const eyeGeo = new THREE.SphereGeometry(0.008, 8, 6);
  const eyeL = mesh(eyeGeo, 0xffffff, { emissive: 0xffffff });
  eyeL.position.set(-0.03, 0.02, 0.045);
  t.add(eyeL);
  const eyeR = mesh(eyeGeo.clone(), 0xffffff, { emissive: 0xffffff });
  eyeR.position.set(0.03, 0.02, 0.045);
  t.add(eyeR);
  return t;
}

function bowTieTopper() {
  const t = new THREE.Group();
  const tieColor = 0x8b1a1a;
  const knot = mesh(new THREE.BoxGeometry(0.014, 0.014, 0.014), tieColor, { emissive: tieColor });
  t.add(knot);
  const wingGeo = new THREE.ConeGeometry(0.02, 0.03, 4);
  const wingL = mesh(wingGeo, tieColor, { emissive: tieColor });
  wingL.rotation.z = Math.PI / 2;
  wingL.position.set(-0.025, 0, 0);
  t.add(wingL);
  const wingR = mesh(wingGeo.clone(), tieColor, { emissive: tieColor });
  wingR.rotation.z = -Math.PI / 2;
  wingR.position.set(0.025, 0, 0);
  t.add(wingR);
  return t;
}

function spaceTopper() {
  const t = new THREE.Group();
  const helmet = mesh(new THREE.SphereGeometry(0.065, 20, 16), 0xe8e8ec, {
    emissive: 0xe8e8ec,
    metalness: 0.3,
    roughness: 0.3,
  });
  t.add(helmet);
  const visor = mesh(
    new THREE.SphereGeometry(0.045, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    0x2a6ee0,
    { emissive: 0x2a6ee0, metalness: 0.5, roughness: 0.15 }
  );
  visor.rotation.x = Math.PI * 0.55;
  visor.position.set(0, 0, 0.02);
  t.add(visor);
  return t;
}

function penguinTopper() {
  const t = new THREE.Group();
  const head = mesh(new THREE.SphereGeometry(0.06, 18, 14), 0x101010, { emissive: 0x101010, roughness: 0.6 });
  t.add(head);
  const faceGeo = new THREE.SphereGeometry(0.05, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const face = mesh(faceGeo, 0xffffff, { emissive: 0xffffff, roughness: 0.6 });
  face.rotation.x = Math.PI * 0.55;
  face.position.set(0, -0.005, 0.015);
  t.add(face);
  const beak = mesh(new THREE.ConeGeometry(0.018, 0.04, 8), 0xff9800, { emissive: 0xff9800 });
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.01, 0.05);
  t.add(beak);
  return t;
}

function magicalTopper() {
  const t = new THREE.Group();
  const loopGeo = new THREE.SphereGeometry(0.03, 14, 10);
  const loopL = mesh(loopGeo, 0x3db8e8, { emissive: 0x3db8e8 });
  loopL.scale.set(1, 0.6, 0.4);
  loopL.position.set(-0.028, 0, 0);
  loopL.rotation.z = 0.4;
  t.add(loopL);
  const loopR = mesh(loopGeo.clone(), 0x3db8e8, { emissive: 0x3db8e8 });
  loopR.scale.set(1, 0.6, 0.4);
  loopR.position.set(0.028, 0, 0);
  loopR.rotation.z = -0.4;
  t.add(loopR);
  const knot = mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), 0xffe14d, { emissive: 0xffe14d });
  t.add(knot);
  const tailGeo = new THREE.BoxGeometry(0.012, 0.03, 0.004);
  const tailL = mesh(tailGeo, 0x3db8e8, { emissive: 0x3db8e8 });
  tailL.position.set(-0.01, -0.025, 0);
  tailL.rotation.z = 0.3;
  t.add(tailL);
  const tailR = mesh(tailGeo.clone(), 0x3db8e8, { emissive: 0x3db8e8 });
  tailR.position.set(0.01, -0.025, 0);
  tailR.rotation.z = -0.3;
  t.add(tailR);
  return t;
}

function bearTopper() {
  const t = new THREE.Group();
  const band = mesh(new THREE.TorusGeometry(0.06, 0.007, 10, 20), 0x6b4423, { emissive: 0x6b4423 });
  band.rotation.x = Math.PI / 2;
  t.add(band);
  const earGeo = new THREE.SphereGeometry(0.022, 14, 10);
  const earL = mesh(earGeo, 0x6b4423, { emissive: 0x6b4423 });
  earL.position.set(-0.045, 0.02, 0);
  t.add(earL);
  const earR = mesh(earGeo.clone(), 0x6b4423, { emissive: 0x6b4423 });
  earR.position.set(0.045, 0.02, 0);
  t.add(earR);
  const innerGeo = new THREE.SphereGeometry(0.011, 10, 8);
  const innerL = mesh(innerGeo, 0xd9b48f, { emissive: 0xd9b48f });
  innerL.position.set(-0.045, 0.02, 0.012);
  t.add(innerL);
  const innerR = mesh(innerGeo.clone(), 0xd9b48f, { emissive: 0xd9b48f });
  innerR.position.set(0.045, 0.02, 0.012);
  t.add(innerR);
  return t;
}

function goldTopper() {
  const t = new THREE.Group();
  const goldOpts = { metalness: 1, roughness: 0.25 };
  const band = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.03, 20), 0xffd700, {
    ...goldOpts,
    emissive: 0xffd700,
  });
  t.add(band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = mesh(new THREE.ConeGeometry(0.01, 0.03, 6), 0xffd700, {
      ...goldOpts,
      emissive: 0xffd700,
    });
    spike.position.set(Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05);
    t.add(spike);
  }
  const gem = mesh(new THREE.SphereGeometry(0.008, 10, 8), 0xd32f2f, {
    emissive: 0xd32f2f,
    emissiveIntensity: 0.3,
  });
  gem.position.set(0, 0.005, 0.05);
  t.add(gem);
  return t;
}

function hoshiTopper() {
  const t = new THREE.Group();
  const starGeo = new THREE.ExtrudeGeometry(starShape(0.07, 0.03, 5), {
    depth: 0.012,
    bevelEnabled: false,
  });
  starGeo.center();
  const star = mesh(starGeo, 0xff9ecf, { emissive: 0xff9ecf, emissiveIntensity: 0.2, roughness: 0.7 });
  t.add(star);
  // face-hole ring hint, echoing the hood's opening on the model itself
  const ring = mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16), 0xffffff, { roughness: 0.7 });
  ring.position.z = 0.008;
  t.add(ring);
  return t;
}

// ---------------------------------------------------------------------------
// Costume hangers: wire hanger + flat garment silhouette + topper
// ---------------------------------------------------------------------------

function garmentShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.16, -0.13);
  s.lineTo(-0.19, -0.22);
  s.lineTo(-0.13, -0.25);
  s.lineTo(-0.12, -0.5);
  s.lineTo(-0.17, -0.57);
  s.lineTo(0.17, -0.57);
  s.lineTo(0.12, -0.5);
  s.lineTo(0.13, -0.25);
  s.lineTo(0.19, -0.22);
  s.lineTo(0.16, -0.13);
  s.lineTo(0, -0.1);
  s.closePath();
  return s;
}
const GARMENT_GEO = new THREE.ExtrudeGeometry(garmentShape(), { depth: 0.02, bevelEnabled: false, curveSegments: 1 });

// Decorations layered on top of the flat garment silhouette (V-neck shirt
// insert, belly patch, etc.) for costumes whose garment isn't a solid block.
function tuxedoDecorate(g) {
  const shirtShape = new THREE.Shape();
  shirtShape.moveTo(-0.09, -0.15);
  shirtShape.lineTo(0, -0.32);
  shirtShape.lineTo(0.09, -0.15);
  shirtShape.lineTo(0.06, -0.14);
  shirtShape.lineTo(0, -0.28);
  shirtShape.lineTo(-0.06, -0.14);
  shirtShape.closePath();
  const geo = new THREE.ExtrudeGeometry(shirtShape, { depth: 0.015, bevelEnabled: false });
  const shirt = mesh(geo, 0xffffff, { roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
  shirt.position.z = 0.006;
  g.add(shirt);
}

function penguinDecorate(g) {
  const bellyShape = new THREE.Shape();
  bellyShape.moveTo(-0.09, -0.16);
  bellyShape.lineTo(0.09, -0.16);
  bellyShape.lineTo(0.07, -0.52);
  bellyShape.lineTo(-0.07, -0.52);
  bellyShape.closePath();
  const geo = new THREE.ExtrudeGeometry(bellyShape, { depth: 0.015, bevelEnabled: false });
  const belly = mesh(geo, 0xffffff, { roughness: 0.7, emissive: 0xffffff, emissiveIntensity: 0 });
  belly.position.z = 0.006;
  g.add(belly);
}

const COSTUME_CFG = {
  suit: { color: 0x555a63, roughness: 0.55, topper: tieTopper },
  nurse: { color: 0xffffff, roughness: 0.7, topper: nurseTopper },
  boxrobo: { color: 0xc19a6b, roughness: 0.9, topper: boxroboTopper },
  dino: { color: 0x4caf50, roughness: 0.85, topper: dinoTopper },
  tuxedo: { color: 0x1a1a1a, roughness: 0.4, topper: bowTieTopper, decorate: tuxedoDecorate },
  space: { color: 0xd8d8e0, roughness: 0.35, metalness: 0.3, topper: spaceTopper },
  penguin: { color: 0x161616, roughness: 0.6, topper: penguinTopper, decorate: penguinDecorate },
  magical: { color: 0x66ccff, roughness: 0.6, topper: magicalTopper },
  bear: { color: 0x8b5e34, roughness: 0.95, topper: bearTopper },
  gold: { color: 0xffd700, roughness: 0.25, metalness: 0.9, topper: goldTopper },
  hoshi: { color: 0xff9ecf, roughness: 0.85, topper: hoshiTopper },
};

function buildHanger(id) {
  const cfg = COSTUME_CFG[id];
  const g = new THREE.Group();
  const hookCurl = mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 16, Math.PI * 1.4), 0xaaaaaa, {
    metalness: 0.8,
    roughness: 0.3,
  });
  hookCurl.rotation.z = 2.4;
  hookCurl.position.y = 0.015;
  g.add(hookCurl);
  g.add(wireSegment(0, 0, -0.16, -0.13));
  g.add(wireSegment(0, 0, 0.16, -0.13));
  const garment = mesh(GARMENT_GEO, cfg.color, {
    metalness: cfg.metalness ?? 0.1,
    roughness: cfg.roughness ?? 0.75,
    emissive: cfg.color,
  });
  garment.position.z = -0.01;
  g.add(garment);
  if (cfg.decorate) cfg.decorate(g);
  const topperHolder = new THREE.Group();
  topperHolder.position.y = 0.04;
  topperHolder.add(cfg.topper());
  g.add(topperHolder);
  return { group: g, restY: 0, topperHolder };
}

// ---------------------------------------------------------------------------
// Furniture: item shelf (left wall) + costume hanger rail (front wall)
// ---------------------------------------------------------------------------

const TIER_Y = [0.45, 0.95, 1.45];

function buildShelf() {
  const g = new THREE.Group();
  const wood = 0x8b5a2b;
  const darkWood = 0x6b4423;
  const backPanel = mesh(new THREE.BoxGeometry(0.04, 1.9, 1.7), darkWood, { roughness: 0.8 });
  backPanel.position.set(-2.93, 1.0, -0.75);
  g.add(backPanel);
  // 横板はアイテムと被って見づらいため、一番下の1枚だけ残す(上段のアイテムは浮かせて陳列)
  const tierGeo = new THREE.BoxGeometry(0.35, 0.04, 1.7);
  const bottomTier = mesh(tierGeo, wood, { roughness: 0.7 });
  bottomTier.position.set(-2.75, TIER_Y[0], -0.75);
  g.add(bottomTier);
  const supGeo = new THREE.BoxGeometry(0.35, 1.9, 0.04);
  const supA = mesh(supGeo, darkWood, { roughness: 0.8 });
  supA.position.set(-2.75, 1.0, -1.58);
  g.add(supA);
  const supB = mesh(supGeo.clone(), darkWood, { roughness: 0.8 });
  supB.position.set(-2.75, 1.0, 0.08);
  g.add(supB);
  return g;
}

function buildHangerRail() {
  const g = new THREE.Group();
  const rod = mesh(new THREE.CylinderGeometry(0.015, 0.015, 5.0, 16), 0xaaaaaa, {
    metalness: 0.8,
    roughness: 0.3,
  });
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, 2.0, 2.85);
  g.add(rod);
  const bracketGeo = new THREE.BoxGeometry(0.03, 0.15, 0.05);
  for (const bx of [-2.35, 0, 2.35]) {
    const b = mesh(bracketGeo.clone(), 0x888888, { metalness: 0.7, roughness: 0.4 });
    b.position.set(bx, 2.0, 2.87);
    g.add(b);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Fixed slot layout
// ---------------------------------------------------------------------------

// 棚のスロット間隔(約0.4m)に収まらない長物の陳列縮小率
const SHELF_DISPLAY_SCALE = {
  baguette: 0.6, guitar: 0.5, kasa: 0.45, machinegun: 0.6, pan: 0.7,
};

const ITEM_ORDER = SLAP_ITEMS.map((it) => it.id);
const COSTUME_ORDER = COSTUMES.map((c) => c.id);

// 3 tiers holding 12 shelf slots total (4/4/4), filled in SLAP_ITEMS order.
// Each tier's slots are spread evenly across the shared z-range so tiers
// with fewer items stay centered instead of bunching to one side.
const ITEM_SLOT_Y = TIER_Y.map((y) => y + 0.04);
const ITEM_TIER_COUNTS = [4, 4, 4];
const ITEM_Z_RANGE = [-1.45, -0.05];
function itemSlotPos(id) {
  const idx = ITEM_ORDER.indexOf(id);
  if (idx < 0) return null;
  let tier = 0;
  let offset = idx;
  while (tier < ITEM_TIER_COUNTS.length - 1 && offset >= ITEM_TIER_COUNTS[tier]) {
    offset -= ITEM_TIER_COUNTS[tier];
    tier++;
  }
  const count = ITEM_TIER_COUNTS[tier];
  const z =
    count === 1
      ? (ITEM_Z_RANGE[0] + ITEM_Z_RANGE[1]) / 2
      : ITEM_Z_RANGE[0] + (offset / (count - 1)) * (ITEM_Z_RANGE[1] - ITEM_Z_RANGE[0]);
  return { x: -2.7, y: ITEM_SLOT_Y[tier], z };
}

// 11 hanger slots spanning x [-2.4, 2.4], filled in COSTUMES order.
const COSTUME_SLOT_X = Array.from({ length: 11 }, (_, i) => -2.4 + (4.8 * i) / 10);
function costumeSlotPos(id) {
  const idx = COSTUME_ORDER.indexOf(id);
  if (idx < 0) return null;
  return { x: COSTUME_SLOT_X[idx], y: 2.0, z: 2.8 };
}

// ---------------------------------------------------------------------------
// 叩き演出用: アイテムの3Dモデルだけを複製生成する(素手は対象外)
// ---------------------------------------------------------------------------

export function buildWeaponModel(id) {
  if (id === "hand") return null;
  const b = ITEM_BUILDERS[id];
  return b ? b().group : null;
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export function createItemManager(scene) {
  const activeObjects = [];
  const spawned = new Set();

  scene.add(buildShelf());
  scene.add(buildHangerRail());

  function spawn(kind, id) {
    const key = kind + ":" + id;
    if (spawned.has(key)) return;

    let built;
    let slot;
    if (kind === "item") {
      const fn = ITEM_BUILDERS[id];
      if (!fn) return;
      slot = itemSlotPos(id);
      if (!slot) return;
      built = fn();
      // 長物は棚のスロット幅に収まるよう陳列時のみ縮小(装備時のサイズは変えない)
      const ds = SHELF_DISPLAY_SCALE[id];
      if (ds) {
        const wrap = new THREE.Group();
        built.group.scale.setScalar(ds);
        wrap.add(built.group);
        built = { group: wrap, restY: (built.restY || 0) * ds };
      }
    } else if (kind === "costume") {
      if (!COSTUME_CFG[id]) return;
      slot = costumeSlotPos(id);
      if (!slot) return;
      built = buildHanger(id);
    } else {
      return;
    }

    const group = built.group;
    const baseY = slot.y + (built.restY || 0);
    group.position.set(slot.x, baseY, slot.z);
    group.scale.setScalar(0.0001);

    scene.add(group);

    activeObjects.push({
      group,
      kind,
      id,
      baseY,
      popping: true,
      popT: 0,
      selected: false,
      isCostume: kind === "costume",
      topperHolder: built.topperHolder || null,
      phase: Math.random() * Math.PI * 2,
    });
    spawned.add(key);
  }

  // GLBは非同期でメッシュが追加されるため、spawn時の一度きりのtraverseでは
  // 拾いきれないことがある。呼び出しの都度その場でtraverseし直して常に最新の
  // メッシュ一覧を返す(タグ付けも都度やり直すが冪等なので問題ない)。
  function tagMeshesOf(o) {
    const out = [];
    o.group.traverse((node) => {
      if (node.isMesh) {
        node.userData.kind = o.kind;
        node.userData.id = o.id;
        out.push(node);
      }
    });
    return out;
  }

  function clickableMeshes() {
    const out = [];
    for (const o of activeObjects) {
      if (!o.group.visible) continue;
      out.push(...tagMeshesOf(o));
    }
    return out;
  }

  function setEquipped(itemId) {
    for (const o of activeObjects) {
      if (o.kind !== "item") continue;
      const hidden = o.id === itemId;
      o.group.visible = !hidden;
      if (hidden) o.selected = false;
    }
  }

  function setWornCostume(costumeId) {
    for (const o of activeObjects) {
      if (o.kind !== "costume") continue;
      o.group.visible = o.id !== costumeId;
    }
  }

  function spawnedIds() {
    const items = [];
    const costumes = [];
    for (const o of activeObjects) {
      if (o.kind === "item") items.push(o.id);
      else costumes.push(o.id);
    }
    return { items, costumes };
  }

  function update(t, dt) {
    for (const o of activeObjects) {
      const g = o.group;

      if (o.popping) {
        o.popT += dt;
        const x = Math.min(o.popT / POP_DURATION, 1);
        const s = Math.max(easeOutBack(x), 0);
        g.scale.setScalar(s);
        const flash = Math.max(0, 1 - x) * 1.4;
        for (const m of tagMeshesOf(o)) m.material.emissiveIntensity = flash;
        if (x >= 1) {
          o.popping = false;
          g.scale.setScalar(1);
          for (const m of tagMeshesOf(o)) m.material.emissiveIntensity = 0;
        }
        continue;
      }

      if (o.kind === "item") {
        g.position.y = o.baseY + Math.sin(t * 1.6 + o.phase) * 0.012;
        g.rotation.y += dt * 0.25;
      } else {
        g.rotation.z = Math.sin(t * 1.1 + o.phase) * 0.05;
        if (o.topperHolder) o.topperHolder.rotation.y = Math.sin(t * 0.8 + o.phase) * 0.15;
      }
    }
  }

  return { spawn, clickableMeshes, setEquipped, setWornCostume, update, spawnedIds };
}
