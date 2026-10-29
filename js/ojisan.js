import * as THREE from "three";

// ---- colors ----
const SKIN = 0xe0a978;
const SHIRT = 0xf2f2ec;
const PANTS = 0x4c4c58;
const HAIR = 0x2a2a2e;
const TIE = 0x7a2e2e;
const SHOE = 0x1c1c1c;
const GLASSES = 0x333333;
const DARK = 0x201d1a;
const STOOL = 0x6d6d72;
const STOOL_BASE = 0x2a2a2a;
const WRINKLE = 0xb98a5e;

// costume colors
const DINO_GREEN = 0x3d8b4f;
const DINO_BELLY = 0x8fd18f;
const DINO_SPIKE = 0x1f6b2c;
const DINO_TEETH = 0xffffff;
const SPACE_WHITE = 0xf2f2f4;
const SPACE_PANEL = 0x3a4a6b;
const SPACE_GLASS = 0xbfe8ff;
const BEAR_BROWN = 0x6b4423;
const BEAR_TAN = 0xd8ab7a;
const GOLD = 0xffd24d;
const BOX_BROWN = 0xb5895a;
const BOX_TAPE = 0xe0cda0;
const TUX_BLACK = 0x131316;
const TUX_BOWTIE = 0xb31217;
const PENGUIN_BLACK = 0x16181c;
const PENGUIN_WHITE = 0xf4f4f0;
const PENGUIN_ORANGE = 0xff8c1a;
const STAR_PINK = 0xff9ecf;
const STAR_ACCENT = 0xfff2f8;

// segment presets ("higher poly" pass): [radial, vertical]
const SEG_HI = [28, 20]; // hero surfaces: head, butt
const SEG_MED = [20, 16]; // torso-scale spheres
const SEG_LO = [14, 10]; // small accent spheres
const CYL_SEG = 24;
const CAP_SEG = [8, 18]; // capsule [capSegments, radialSegments]

function mat(color, roughness = 0.7, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function ease(x) {
  return x * x * (3 - 2 * x);
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

// shortest-path angle lerp (avoids spinning the long way around)
function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// Flat 5-pointed star outline (alternating outer/inner radius). Used by the
// hoshi costume's hood (with a face-hole cut into it) and its chest badge.
function starShape2D(outerR, innerR, points = 5) {
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

// Same star outline, but with a circular hole cut in the middle so the
// ojisan's face can peek through when this is used as a hood.
function starHoodShape2D(outerR, innerR, holeR, points = 5) {
  const shape = starShape2D(outerR, innerR, points);
  const hole = new THREE.Path();
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, false);
  shape.holes.push(hole);
  return shape;
}

export function createOjisan(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // materials
  const skinMat = mat(SKIN, 0.85, 0);
  const faceMat = mat(SKIN, 0.85, 0); // separate so the head can flush independently of arms/neck
  const shirtMat = mat(SHIRT, 0.75, 0);
  const pantsMat = mat(PANTS, 0.7, 0.05);
  const buttMat = mat(PANTS, 0.28, 0.2); // shinier for comedy
  const hairMat = mat(HAIR, 0.8, 0);
  const tieMat = mat(TIE, 0.5, 0.1);
  const shoeMat = mat(SHOE, 0.5, 0.1);
  const soleMat = mat(0x0a0a0a, 0.9, 0);
  const glassesMat = mat(GLASSES, 0.4, 0.3);
  const darkMat = mat(DARK, 0.6, 0);
  const wrinkleMat = mat(WRINKLE, 0.9, 0);
  const beltMat = mat(0x2a2320, 0.6, 0.1);
  const buckleMat = mat(0xc8c0a0, 0.35, 0.6);
  buttMat.emissive = new THREE.Color(0xff2200);
  buttMat.emissiveIntensity = 0;

  // remember pants/shirt base look so costumes can restore it
  const shirtBaseRoughness = shirtMat.roughness;
  const shirtBaseMetalness = shirtMat.metalness;
  const pantsBaseRoughness = pantsMat.roughness;
  const pantsBaseMetalness = pantsMat.metalness;

  // ---- stool ----
  // スツールは削除(おじさんは空気椅子で座る — 座り姿勢はそのまま)

  // ---- rocket flame (hidden until launch()) ----
  const flameGroup = new THREE.Group();
  flameGroup.position.set(0, -0.02, 0);
  flameGroup.visible = false;
  group.add(flameGroup);

  const flameMat = mat(0xff8800, 0.4, 0);
  flameMat.emissive = new THREE.Color(0xff5500);
  flameMat.emissiveIntensity = 1.6;
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 16), flameMat);
  flameOuter.rotation.x = Math.PI; // point down
  flameOuter.position.y = -0.2;
  flameGroup.add(flameOuter);

  const innerFlames = [];
  for (let i = 0; i < 3; i++) {
    const innerMat = mat(0xffee66, 0.3, 0);
    innerMat.emissive = new THREE.Color(0xffff88);
    innerMat.emissiveIntensity = 2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.07 - i * 0.015, 0.22 - i * 0.04, 12), innerMat);
    c.rotation.x = Math.PI;
    c.position.set((i - 1) * 0.015, -0.12 - i * 0.02, (i - 1) * 0.01);
    flameGroup.add(c);
    innerFlames.push(c);
  }

  // ---- pelvis / hips (root of the body; carries sit pose AND the
  // stand/walk/run/jump world offset once he gets up) ----
  const SIT_PELVIS_Y = 0.45;
  const STAND_PELVIS_Y = 0.7;
  const pelvis = new THREE.Group();
  pelvis.position.set(0, SIT_PELVIS_Y, 0);
  group.add(pelvis);

  const hipBlock = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), pantsMat);
  hipBlock.position.set(0, -0.02, -0.02);
  pelvis.add(hipBlock);

  // belt + buckle (detail pass)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.28), beltMat);
  belt.position.set(0, 0.08, -0.02);
  pelvis.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.02), buckleMat);
  buckle.position.set(0, 0.08, 0.115);
  pelvis.add(buckle);

  // ---- butt (comedically prominent) ----
  function makeButt(xSign) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.19, SEG_HI[0], SEG_HI[1]), buttMat);
    m.scale.set(1.3, 0.85, 1.15);
    m.position.set(xSign * 0.14, 0.02, -0.28);
    pelvis.add(m);
    return m;
  }
  const buttL = makeButt(-1);
  const buttR = makeButt(1);
  const buttMeshes = [buttL, buttR];
  const buttRest = buttMeshes.map((m) => m.scale.clone());
  const buttRestOriginal = buttRest.map((v) => v.clone());

  // ---- legs ----
  // Sitting bend (unchanged from the original desk pose) and the
  // standing/walking pose the legs unfold into once p >= 0.10.
  const SIT_THIGH_ROT_X = THREE.MathUtils.degToRad(80);
  const SIT_SHIN_ROT_X = THREE.MathUtils.degToRad(102);
  const SIT_THIGH_Z = 0.1;
  const STAND_THIGH_ROT_X = Math.PI; // straight down
  const STAND_SHIN_ROT_X = 0; // straight continuation of the thigh
  const STAND_THIGH_Z = 0;

  function makeLeg(xSign) {
    const thighPivot = new THREE.Group();
    thighPivot.position.set(xSign * 0.14, -0.05, SIT_THIGH_Z);
    thighPivot.rotation.x = SIT_THIGH_ROT_X;
    pelvis.add(thighPivot);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, CAP_SEG[0], CAP_SEG[1]), pantsMat);
    thigh.position.set(0, 0.17, 0);
    thighPivot.add(thigh);

    const shinPivot = new THREE.Group();
    shinPivot.position.set(0, 0.34, 0);
    shinPivot.rotation.x = SIT_SHIN_ROT_X;
    thighPivot.add(shinPivot);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, CAP_SEG[0], CAP_SEG[1]), pantsMat);
    shin.position.set(0, 0.16, 0);
    shinPivot.add(shin);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), shoeMat);
    shoe.position.set(0, 0.33, 0.06);
    shinPivot.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.02, 0.25), soleMat);
    sole.position.set(0, 0.375, 0.06);
    shinPivot.add(sole);

    return { thighPivot, shinPivot, shoe };
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  const legs = [legL, legR];

  // ---- torso (leans forward toward the desk while sitting, upright
  // once standing) ----
  const SIT_TORSO_Y = 0.17;
  const STAND_TORSO_Y = 0.11;
  const SIT_TORSO_ROT_X = THREE.MathUtils.degToRad(17);
  const STAND_TORSO_ROT_X = 0;
  const torsoLean = new THREE.Group();
  torsoLean.position.set(0, SIT_TORSO_Y, 0);
  torsoLean.rotation.x = SIT_TORSO_ROT_X;
  pelvis.add(torsoLean);

  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.3), shirtMat);
  torsoMesh.position.set(0, 0.24, 0);
  torsoLean.add(torsoMesh);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.18, SEG_MED[0], SEG_MED[1]), shirtMat);
  belly.position.set(0, 0.09, 0.17);
  belly.scale.set(1, 0.8, 0.75);
  torsoLean.add(belly);

  // shirt collar (detail pass)
  function collarWing(xSign) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.03), shirtMat);
    c.position.set(xSign * 0.07, 0.46, 0.14);
    c.rotation.z = xSign * 0.5;
    torsoLean.add(c);
  }
  collarWing(-1);
  collarWing(1);

  // shirt buttons (detail pass)
  const buttonMeshes = [];
  for (let i = 0; i < 3; i++) {
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), darkMat);
    btn.position.set(0, 0.38 - i * 0.09, 0.155);
    torsoLean.add(btn);
    buttonMeshes.push(btn);
  }

  const tieKnot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.03), tieMat);
  tieKnot.position.set(0, 0.44, 0.16);
  torsoLean.add(tieKnot);

  const tieBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.02), tieMat);
  tieBody.position.set(0, 0.27, 0.165);
  torsoLean.add(tieBody);
  for (const b of buttonMeshes) b.visible = true; // buttons sit under the tie, still peek out either side

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.08, CYL_SEG), skinMat);
  neck.position.set(0, 0.5, 0.02);
  torsoLean.add(neck);

  // ---- head ----
  const head = new THREE.Group();
  head.position.set(0, 0.58, 0.02);
  torsoLean.add(head);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, SEG_HI[0], SEG_HI[1]), faceMat);
  headMesh.scale.set(1, 1.05, 0.95);
  head.add(headMesh);

  // ears (detail pass)
  function ear(xSign) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), faceMat);
    e.scale.set(0.6, 1, 0.5);
    e.position.set(xSign * 0.195, -0.01, 0.01);
    head.add(e);
    return e;
  }
  const earL = ear(-1);
  const earR = ear(1);

  const hairMeshes = [];
  function hairPatch(x, y, z, sx, sy, sz) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, SEG_LO[0], SEG_LO[1]), hairMat);
    h.position.set(x, y, z);
    h.scale.set(sx, sy, sz);
    head.add(h);
    hairMeshes.push(h);
    return h;
  }
  hairPatch(-0.17, -0.02, -0.02, 0.55, 0.8, 0.75);
  hairPatch(0.17, -0.02, -0.02, 0.55, 0.8, 0.75);
  hairPatch(0, -0.03, -0.16, 0.85, 0.7, 0.55);

  // ---- sweat drops (hidden until setProgress reveals them) ----
  const sweatMat = mat(0xaee4ff, 0.3, 0.1);
  function sweatDrop(x, y, z) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), sweatMat);
    s.position.set(x, y, z);
    s.visible = false;
    head.add(s);
    return s;
  }
  const sweatDrops = [
    sweatDrop(-0.19, 0.06, 0.06),
    sweatDrop(0.18, 0.0, 0.09),
    sweatDrop(-0.1, 0.14, 0.16),
  ];

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.026, SEG_LO[0], SEG_LO[1]), darkMat);
  eyeL.position.set(-0.075, 0.02, 0.175);
  head.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.075;
  head.add(eyeR);

  // wrinkle hints under the eyes (detail pass)
  function wrinkle(xSign) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), wrinkleMat);
    w.position.set(xSign * 0.075, -0.005, 0.185);
    head.add(w);
  }
  wrinkle(-1);
  wrinkle(1);

  function brow(xSign) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.02), hairMat);
    b.position.set(xSign * 0.075, 0.065, 0.18);
    b.rotation.z = -xSign * 0.15; // tired, slightly furrowed
    head.add(b);
  }
  brow(-1);
  brow(1);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, SEG_LO[0], SEG_LO[1]), faceMat);
  nose.position.set(0, -0.015, 0.195);
  head.add(nose);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.02), darkMat);
  mouth.position.set(0, -0.09, 0.185);
  head.add(mouth);
  const mouthRestY = mouth.scale.y;

  const glassesGroup = new THREE.Group();
  head.add(glassesGroup);

  function glassFrame(xSign) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.015), glassesMat);
    f.position.set(xSign * 0.075, 0.02, 0.19);
    glassesGroup.add(f);
  }
  glassFrame(-1);
  glassFrame(1);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.015), glassesMat);
  bridge.position.set(0, 0.02, 0.19);
  glassesGroup.add(bridge);

  // ---- arms ----
  // Sitting reach-for-the-keyboard pose, and a relaxed standing pose
  // that walk/run/jump animate on top of.
  const SIT_SHOULDER_ROT_X = THREE.MathUtils.degToRad(80);
  const SIT_ELBOW_ROT_X = THREE.MathUtils.degToRad(-58);
  const STAND_SHOULDER_ROT_X = THREE.MathUtils.degToRad(15);
  const STAND_ELBOW_ROT_X = THREE.MathUtils.degToRad(-10);
  const ARMS_UP_SHOULDER_ROT_X = THREE.MathUtils.degToRad(-10);
  const ARMS_UP_ELBOW_ROT_X = THREE.MathUtils.degToRad(15);
  const HAND_BASE_Y = 0.2;
  const HAND_BASE_Z = 0.02;

  function makeArm(xSign) {
    const shoulder = new THREE.Group();
    shoulder.position.set(xSign * 0.25, 0.43, 0.02);
    shoulder.rotation.x = SIT_SHOULDER_ROT_X;
    shoulder.rotation.z = -xSign * 0.12;
    torsoLean.add(shoulder);

    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, CAP_SEG[0], CAP_SEG[1]), shirtMat);
    upperArm.position.set(0, 0.11, 0);
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, 0.22, 0);
    elbow.rotation.x = SIT_ELBOW_ROT_X;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, CAP_SEG[0], CAP_SEG[1]), skinMat); // rolled-up sleeve: bare forearm
    forearm.position.set(0, 0.1, 0);
    elbow.add(forearm);

    const hand = new THREE.Group();
    hand.position.set(0, HAND_BASE_Y, HAND_BASE_Z);
    elbow.add(hand);

    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.1), skinMat);
    hand.add(handMesh);

    return { shoulder, elbow, hand };
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const arms = [armL, armR];
  const handL = armL.hand;
  const handR = armR.hand;

  // ============================================================
  // ---- costume system ----
  // Extra costume geometry is built once here and toggled with
  // .visible per costume. Body materials that are reused elsewhere
  // (shirtMat/pantsMat drive torso/belly/sleeves/legs) are recolored
  // per costume; buttMat and faceMat are NEVER touched here so
  // setProgress()'s flush/blush lerps keep working underneath any
  // costume, and the butt stays bare (comedic "butt window") in
  // every kigurumi.
  // ============================================================
  function costumeMesh(geometry, material, parent) {
    const m = new THREE.Mesh(geometry, material);
    m.visible = false;
    parent.add(m);
    return m;
  }

  // dedicated costume-only materials
  const nurseWhiteMat = mat(0xffffff, 0.6, 0);
  const nurseCrossMat = mat(0xd42020, 0.5, 0);
  const ribbonMat = mat(0x3db8e8, 0.5, 0.05); // 魔法少女リボン(水色)
  const wandGoldMat = mat(0xffe14d, 0.35, 0.2);
  const wandStickMat = mat(0xd8d8dc, 0.5, 0.1);

  const dinoHoodMat = mat(DINO_GREEN, 0.6, 0);
  const dinoBellyMat = mat(DINO_BELLY, 0.55, 0);
  const dinoSpikeMat = mat(DINO_SPIKE, 0.6, 0);
  const dinoTeethMat = mat(DINO_TEETH, 0.4, 0);
  const dinoTailMat = mat(DINO_GREEN, 0.6, 0);
  const dinoNostrilMat = mat(0x14401f, 0.6, 0);

  const spaceWhiteMat = mat(SPACE_WHITE, 0.5, 0.05);
  const spacePanelMat = mat(SPACE_PANEL, 0.4, 0.15);
  const spaceGlassMat = new THREE.MeshStandardMaterial({
    color: SPACE_GLASS,
    transparent: true,
    opacity: 0.25,
    roughness: 0.1,
    metalness: 0.1,
  });
  const spaceButtonMats = [mat(0xd42020, 0.4, 0.1), mat(0x2fb84f, 0.4, 0.1), mat(0xe8c92a, 0.4, 0.1)];

  const bearHoodMat = mat(BEAR_BROWN, 0.65, 0);
  const bearTanMat = mat(BEAR_TAN, 0.6, 0);

  const goldCrownMat = mat(GOLD, 0.2, 0.9);

  const boxCardboardMat = mat(BOX_BROWN, 0.85, 0);
  const boxTapeMat = mat(BOX_TAPE, 0.6, 0);

  const tuxShirtFrontMat = mat(0xffffff, 0.5, 0);
  const tuxBowMat = mat(TUX_BOWTIE, 0.5, 0.05);
  const tuxHatMat = mat(TUX_BLACK, 0.35, 0.2);

  const penguinHoodMat = mat(PENGUIN_BLACK, 0.6, 0);
  const penguinBeakMat = mat(PENGUIN_ORANGE, 0.5, 0);
  const penguinBellyMat = mat(PENGUIN_WHITE, 0.55, 0);
  const penguinFeetMat = mat(PENGUIN_ORANGE, 0.5, 0);
  const penguinTailMat = mat(PENGUIN_BLACK, 0.6, 0);

  const starHoodMat = mat(STAR_PINK, 0.75, 0);
  const starChestMat = mat(STAR_ACCENT, 0.4, 0.1);
  starChestMat.emissive = new THREE.Color(0xff6fa5);
  starChestMat.emissiveIntensity = 0.4;

  // base/target torso + pants colors (shirtMat also colors belly +
  // arm sleeves; pantsMat also colors thighs/shins/hips)
  const TORSO_SUIT_COLOR = shirtMat.color.clone();
  const PANTS_SUIT_COLOR = pantsMat.color.clone();
  const TORSO_NURSE_COLOR = new THREE.Color(0xffffff);
  const TORSO_MAGICAL_COLOR = new THREE.Color(0x66ccff); // 水色
  const TORSO_DINO_COLOR = new THREE.Color(DINO_GREEN);
  const PANTS_DINO_COLOR = new THREE.Color(DINO_GREEN);
  const TORSO_SPACE_COLOR = new THREE.Color(SPACE_WHITE);
  const PANTS_SPACE_COLOR = new THREE.Color(SPACE_WHITE);
  const TORSO_BEAR_COLOR = new THREE.Color(BEAR_BROWN);
  const PANTS_BEAR_COLOR = new THREE.Color(BEAR_BROWN);
  const TORSO_GOLD_COLOR = new THREE.Color(GOLD);
  const PANTS_GOLD_COLOR = new THREE.Color(GOLD);
  const TORSO_BOXROBO_COLOR = new THREE.Color(BOX_BROWN);
  const PANTS_BOXROBO_COLOR = new THREE.Color(BOX_BROWN);
  const TORSO_TUXEDO_COLOR = new THREE.Color(TUX_BLACK);
  const PANTS_TUXEDO_COLOR = new THREE.Color(TUX_BLACK);
  const TORSO_PENGUIN_COLOR = new THREE.Color(PENGUIN_BLACK);
  const PANTS_PENGUIN_COLOR = new THREE.Color(PENGUIN_BLACK);
  const TORSO_HOSHI_COLOR = new THREE.Color(STAR_PINK);
  const PANTS_HOSHI_COLOR = new THREE.Color(STAR_PINK);

  let currentCostume = "suit";

  // ---- shared dress skirt (nurse + magical; color follows shirtMat) ----
  const dressSkirt = costumeMesh(new THREE.ConeGeometry(0.24, 0.2, CYL_SEG), shirtMat, pelvis);
  dressSkirt.position.set(0, -0.04, 0.06);

  // ---- nurse: cap + red cross ----
  const nurseCap = costumeMesh(new THREE.BoxGeometry(0.19, 0.06, 0.17), nurseWhiteMat, head);
  nurseCap.position.set(0, 0.195, -0.02);
  const nurseCrossV = costumeMesh(new THREE.BoxGeometry(0.022, 0.06, 0.012), nurseCrossMat, head);
  nurseCrossV.position.set(0, 0.235, 0.05);
  const nurseCrossH = costumeMesh(new THREE.BoxGeometry(0.06, 0.022, 0.012), nurseCrossMat, head);
  nurseCrossH.position.set(0, 0.235, 0.05);
  const nurseParts = [nurseCap, nurseCrossV, nurseCrossH];

  // ---- magical girl: pink dress (shared dressSkirt) + ribbon + wand ----
  const ribbonL = costumeMesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), ribbonMat, head);
  ribbonL.position.set(-0.06, 0.2, -0.05);
  ribbonL.rotation.z = 0.5;
  const ribbonR = costumeMesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), ribbonMat, head);
  ribbonR.position.set(0.06, 0.2, -0.05);
  ribbonR.rotation.z = -0.5;
  const ribbonKnot = costumeMesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), ribbonMat, head);
  ribbonKnot.position.set(0, 0.2, -0.05);
  const magicalHeadParts = [ribbonL, ribbonR, ribbonKnot];

  const wandGroup = new THREE.Group();
  wandGroup.visible = false;
  wandGroup.position.set(0, 0.06, 0.02);
  wandGroup.rotation.x = -0.3;
  handR.add(wandGroup);

  const wandStick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 10), wandStickMat);
  wandStick.position.set(0, 0.1, 0);
  wandGroup.add(wandStick);

  const wandStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), wandGoldMat);
  wandStar.position.set(0, 0.22, 0);
  wandGroup.add(wandStar);

  // ---- dino: green kigurumi hood + jaw/teeth/nostrils + spine
  // spikes + thick tail ----
  const dinoHoodBack = costumeMesh(new THREE.SphereGeometry(0.21, 20, 16), dinoHoodMat, head);
  dinoHoodBack.scale.set(1.15, 1.1, 0.9);
  dinoHoodBack.position.set(0, 0.05, -0.06);
  const dinoSnout = costumeMesh(new THREE.BoxGeometry(0.16, 0.1, 0.14), dinoHoodMat, head);
  dinoSnout.position.set(0, -0.03, 0.23);
  const dinoTeeth = costumeMesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), dinoTeethMat, head);
  dinoTeeth.position.set(0, -0.075, 0.29);
  const dinoNostrilL = costumeMesh(new THREE.SphereGeometry(0.018, 8, 8), dinoNostrilMat, head);
  dinoNostrilL.position.set(-0.04, 0.0, 0.295);
  const dinoNostrilR = costumeMesh(new THREE.SphereGeometry(0.018, 8, 8), dinoNostrilMat, head);
  dinoNostrilR.position.set(0.04, 0.0, 0.295);
  const dinoHeadParts = [dinoHoodBack, dinoSnout, dinoTeeth, dinoNostrilL, dinoNostrilR];

  const dinoBellyPatch = costumeMesh(new THREE.SphereGeometry(0.14, 16, 12), dinoBellyMat, torsoLean);
  dinoBellyPatch.position.set(0, 0.08, 0.2);
  dinoBellyPatch.scale.set(0.9, 0.75, 0.6);

  const dinoSpikes = [];
  const dinoSpikeSpots = [
    [torsoLean, 0, 0.5, -0.14, 0.045],
    [torsoLean, 0, 0.36, -0.16, 0.04],
    [torsoLean, 0, 0.22, -0.16, 0.035],
    [pelvis, 0, 0.1, -0.22, 0.03],
    [pelvis, 0, 0.0, -0.3, 0.025],
  ];
  for (const [parent, x, y, z, r] of dinoSpikeSpots) {
    const spike = costumeMesh(new THREE.ConeGeometry(r, r * 2.4, 8), dinoSpikeMat, parent);
    spike.position.set(x, y, z);
    dinoSpikes.push(spike);
  }

  function makeTail(parent, { baseZ, segLen1, segLen2, segR1, segR2, material, tipR }) {
    const base = new THREE.Group();
    base.position.set(0, 0.0, baseZ);
    base.rotation.x = THREE.MathUtils.degToRad(100);
    base.visible = false;
    parent.add(base);

    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(segR1, segLen1, 6, 12), material);
    seg1.position.set(0, segLen1 / 2 + segR1, 0);
    base.add(seg1);

    const pivot2 = new THREE.Group();
    pivot2.position.set(0, segLen1 + segR1 * 2, 0);
    pivot2.rotation.x = THREE.MathUtils.degToRad(-50);
    seg1.add(pivot2);

    const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(segR2, segLen2, 6, 12), material);
    seg2.position.set(0, segLen2 / 2 + segR2, 0);
    pivot2.add(seg2);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(tipR, 10, 10), material);
    tip.position.set(0, segLen2 + segR2, 0);
    pivot2.add(tip);

    return { base, seg1, pivot2, seg2, tip };
  }

  const dinoTail = makeTail(pelvis, {
    baseZ: -0.32,
    segLen1: 0.16,
    segLen2: 0.13,
    segR1: 0.05,
    segR2: 0.04,
    material: dinoTailMat,
    tipR: 0.035,
  });

  // ---- space: bulky white suit + chest panel + backpack + glass
  // helmet bubble (face stays visible through it) ----
  const spaceHelmet = costumeMesh(new THREE.SphereGeometry(0.26, 24, 18), spaceGlassMat, head);
  spaceHelmet.position.set(0, 0.0, 0.02);
  const spaceChestPanel = costumeMesh(new THREE.BoxGeometry(0.16, 0.12, 0.03), spacePanelMat, torsoLean);
  spaceChestPanel.position.set(0, 0.32, 0.165);
  const spaceButtons = [];
  for (let i = 0; i < 3; i++) {
    const b = costumeMesh(new THREE.SphereGeometry(0.014, 8, 8), spaceButtonMats[i], torsoLean);
    b.position.set(-0.05 + i * 0.05, 0.33, 0.185);
    spaceButtons.push(b);
  }
  const spaceBackpack = costumeMesh(new THREE.BoxGeometry(0.28, 0.32, 0.14), spaceWhiteMat, torsoLean);
  spaceBackpack.position.set(0, 0.26, -0.2);
  const spaceParts = [spaceHelmet, spaceChestPanel, spaceBackpack, ...spaceButtons];

  // ---- bear: brown kigurumi hood + round ears + muzzle patch +
  // belly patch + stub tail ----
  function bearEar(xSign) {
    const e = costumeMesh(new THREE.SphereGeometry(0.055, 16, 12), bearHoodMat, head);
    e.position.set(xSign * 0.13, 0.2, -0.03);
    return e;
  }
  const bearEarL = bearEar(-1);
  const bearEarR = bearEar(1);
  const bearHoodBack = costumeMesh(new THREE.SphereGeometry(0.21, 20, 16), bearHoodMat, head);
  bearHoodBack.scale.set(1.15, 1.1, 0.9);
  bearHoodBack.position.set(0, 0.04, -0.06);
  const bearMuzzle = costumeMesh(new THREE.SphereGeometry(0.09, 16, 12), bearTanMat, head);
  bearMuzzle.scale.set(1, 0.7, 0.6);
  bearMuzzle.position.set(0, -0.04, 0.2);
  const bearHeadParts = [bearEarL, bearEarR, bearHoodBack, bearMuzzle];

  const bearBellyPatch = costumeMesh(new THREE.SphereGeometry(0.15, 16, 12), bearTanMat, torsoLean);
  bearBellyPatch.position.set(0, 0.08, 0.2);
  bearBellyPatch.scale.set(0.9, 0.75, 0.55);

  const bearTail = makeTail(pelvis, {
    baseZ: -0.3,
    segLen1: 0.05,
    segLen2: 0.02,
    segR1: 0.055,
    segR2: 0.03,
    material: bearHoodMat,
    tipR: 0.03,
  });

  // ---- gold: shiny full-body recolor (handled via shirtMat/pantsMat
  // below) + spiked crown ----
  const goldCrownBand = costumeMesh(new THREE.CylinderGeometry(0.15, 0.16, 0.05, 20), goldCrownMat, head);
  goldCrownBand.position.set(0, 0.21, 0);
  const goldSpikes = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const spike = costumeMesh(new THREE.ConeGeometry(0.02, 0.06, 8), goldCrownMat, head);
    spike.position.set(Math.cos(ang) * 0.15, 0.255, Math.sin(ang) * 0.15);
    goldSpikes.push(spike);
  }
  const goldParts = [goldCrownBand, ...goldSpikes];

  // ---- boxrobo: cardboard box torso + tape stripes + box helmet
  // w/ dark eye-slit + cardboard tube bracers on the forearms ----
  const boxTorso = costumeMesh(new THREE.BoxGeometry(0.52, 0.5, 0.34), boxCardboardMat, torsoLean);
  boxTorso.position.set(0, 0.24, 0.01);
  const boxTapeH = costumeMesh(new THREE.BoxGeometry(0.53, 0.05, 0.35), boxTapeMat, torsoLean);
  boxTapeH.position.set(0, 0.24, 0.01);
  const boxTapeV = costumeMesh(new THREE.BoxGeometry(0.05, 0.51, 0.35), boxTapeMat, torsoLean);
  boxTapeV.position.set(0, 0.24, 0.01);
  const boxHelmet = costumeMesh(new THREE.BoxGeometry(0.32, 0.3, 0.32), boxCardboardMat, head);
  boxHelmet.position.set(0, 0.01, 0.02);
  const boxHelmetTape = costumeMesh(new THREE.BoxGeometry(0.33, 0.05, 0.33), boxTapeMat, head);
  boxHelmetTape.position.set(0, 0.01, 0.02);
  const boxEyeSlit = costumeMesh(new THREE.BoxGeometry(0.22, 0.04, 0.02), darkMat, head);
  boxEyeSlit.position.set(0, 0.02, 0.19);
  function boxBracer(elbowGroup) {
    const b = costumeMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, CYL_SEG), boxCardboardMat, elbowGroup);
    b.position.set(0, 0.1, 0);
    return b;
  }
  const boxBracerL = boxBracer(armL.elbow);
  const boxBracerR = boxBracer(armR.elbow);
  const boxParts = [boxTorso, boxTapeH, boxTapeV, boxHelmet, boxHelmetTape, boxEyeSlit, boxBracerL, boxBracerR];

  // ---- tuxedo: black jacket (shirtMat/pantsMat recolor) + white
  // shirt-front V panel w/ tiny buttons + red bow tie + pocket
  // square hint + black top hat ----
  const tuxShirtL = costumeMesh(new THREE.BoxGeometry(0.09, 0.28, 0.02), tuxShirtFrontMat, torsoLean);
  tuxShirtL.position.set(-0.045, 0.36, 0.153);
  tuxShirtL.rotation.z = 0.25;
  const tuxShirtR = costumeMesh(new THREE.BoxGeometry(0.09, 0.28, 0.02), tuxShirtFrontMat, torsoLean);
  tuxShirtR.position.set(0.045, 0.36, 0.153);
  tuxShirtR.rotation.z = -0.25;
  const tuxButtons = [];
  for (let i = 0; i < 3; i++) {
    const btn = costumeMesh(new THREE.SphereGeometry(0.012, 8, 8), darkMat, torsoLean);
    btn.position.set(0, 0.4 - i * 0.07, 0.163);
    tuxButtons.push(btn);
  }
  const tuxBowL = costumeMesh(new THREE.BoxGeometry(0.07, 0.05, 0.025), tuxBowMat, torsoLean);
  tuxBowL.position.set(-0.045, 0.44, 0.165);
  tuxBowL.rotation.z = 0.5;
  const tuxBowR = costumeMesh(new THREE.BoxGeometry(0.07, 0.05, 0.025), tuxBowMat, torsoLean);
  tuxBowR.position.set(0.045, 0.44, 0.165);
  tuxBowR.rotation.z = -0.5;
  const tuxBowKnot = costumeMesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), tuxBowMat, torsoLean);
  tuxBowKnot.position.set(0, 0.44, 0.165);
  const tuxPocketSquare = costumeMesh(new THREE.BoxGeometry(0.05, 0.035, 0.015), tuxShirtFrontMat, torsoLean);
  tuxPocketSquare.position.set(-0.14, 0.32, 0.157);
  tuxPocketSquare.rotation.z = 0.15;
  const tuxHatBrim = costumeMesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, CYL_SEG), tuxHatMat, head);
  tuxHatBrim.position.set(0, 0.2, 0);
  const tuxHatTop = costumeMesh(new THREE.CylinderGeometry(0.115, 0.125, 0.16, CYL_SEG), tuxHatMat, head);
  tuxHatTop.position.set(0, 0.29, 0);
  const tuxParts = [
    tuxShirtL,
    tuxShirtR,
    ...tuxButtons,
    tuxBowL,
    tuxBowR,
    tuxBowKnot,
    tuxPocketSquare,
    tuxHatBrim,
    tuxHatTop,
  ];

  // ---- penguin: black kigurumi hood w/ orange beak + eye dots +
  // white belly panel + black limbs (shirtMat/pantsMat recolor) +
  // orange webbed-feet covers + tiny black tail ----
  const penguinHoodBack = costumeMesh(new THREE.SphereGeometry(0.21, 20, 16), penguinHoodMat, head);
  penguinHoodBack.scale.set(1.15, 1.1, 0.9);
  penguinHoodBack.position.set(0, 0.05, -0.06);
  const penguinBeak = costumeMesh(new THREE.ConeGeometry(0.045, 0.09, 10), penguinBeakMat, head);
  penguinBeak.rotation.x = Math.PI / 2;
  penguinBeak.position.set(0, 0.0, 0.22);
  const penguinEyeL = costumeMesh(new THREE.SphereGeometry(0.02, 10, 10), darkMat, head);
  penguinEyeL.position.set(-0.075, 0.05, 0.18);
  const penguinEyeR = costumeMesh(new THREE.SphereGeometry(0.02, 10, 10), darkMat, head);
  penguinEyeR.position.set(0.075, 0.05, 0.18);
  const penguinHeadParts = [penguinHoodBack, penguinBeak, penguinEyeL, penguinEyeR];

  const penguinBelly = costumeMesh(new THREE.SphereGeometry(0.16, 16, 12), penguinBellyMat, torsoLean);
  penguinBelly.position.set(0, 0.1, 0.19);
  penguinBelly.scale.set(0.85, 0.85, 0.6);

  function penguinFoot(shinPivot) {
    const f = costumeMesh(new THREE.BoxGeometry(0.16, 0.02, 0.27), penguinFeetMat, shinPivot);
    f.position.set(0, 0.35, 0.07);
    return f;
  }
  const penguinFootL = penguinFoot(legL.shinPivot);
  const penguinFootR = penguinFoot(legR.shinPivot);

  const penguinTail = makeTail(pelvis, {
    baseZ: -0.28,
    segLen1: 0.03,
    segLen2: 0.015,
    segR1: 0.045,
    segR2: 0.025,
    material: penguinTailMat,
    tipR: 0.02,
  });

  const penguinParts = [...penguinHeadParts, penguinBelly, penguinFootL, penguinFootR];

  // ---- hoshi: pink kigurumi with a big 5-pointed star hood behind the
  // head (a circular hole is cut into the star itself so the face peeks
  // through, like the round kigurumi hoods above) + a small star badge on
  // the chest. Body recolor only (shirtMat/pantsMat), same as bear/dino;
  // buttMat/faceMat are untouched and the butt stays fully exposed. ----
  const starHoodGeo = new THREE.ExtrudeGeometry(starHoodShape2D(0.24, 0.1, 0.16, 5), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  starHoodGeo.center();
  const starHood = costumeMesh(starHoodGeo, starHoodMat, head);
  starHood.position.set(0, 0.03, -0.1);

  const starChestGeo = new THREE.ExtrudeGeometry(starShape2D(0.036, 0.015, 5), {
    depth: 0.012,
    bevelEnabled: false,
  });
  starChestGeo.center();
  const starChest = costumeMesh(starChestGeo, starChestMat, torsoLean);
  starChest.position.set(0, 0.34, 0.17);

  const starParts = [starHood, starChest];

  const COSTUME_IDS = [
    "suit",
    "nurse",
    "dino",
    "space",
    "magical",
    "bear",
    "gold",
    "boxrobo",
    "tuxedo",
    "penguin",
    "hoshi",
  ];

  function hideAllCostumeParts() {
    dressSkirt.visible = false;
    for (const m of nurseParts) m.visible = false;
    for (const m of magicalHeadParts) m.visible = false;
    wandGroup.visible = false;
    for (const m of dinoHeadParts) m.visible = false;
    dinoBellyPatch.visible = false;
    for (const m of dinoSpikes) m.visible = false;
    dinoTail.base.visible = false;
    for (const m of spaceParts) m.visible = false;
    for (const m of bearHeadParts) m.visible = false;
    bearBellyPatch.visible = false;
    bearTail.base.visible = false;
    for (const m of goldParts) m.visible = false;
    for (const m of boxParts) m.visible = false;
    for (const m of tuxParts) m.visible = false;
    for (const m of penguinParts) m.visible = false;
    penguinTail.base.visible = false;
    for (const m of starParts) m.visible = false;
  }

  function setCostume(id) {
    if (!COSTUME_IDS.includes(id)) id = "suit";
    currentCostume = id;
    hideAllCostumeParts();

    // restore suit defaults first, then layer costume-specific changes
    shirtMat.color.copy(TORSO_SUIT_COLOR);
    shirtMat.roughness = shirtBaseRoughness;
    shirtMat.metalness = shirtBaseMetalness;
    pantsMat.color.copy(PANTS_SUIT_COLOR);
    pantsMat.roughness = pantsBaseRoughness;
    pantsMat.metalness = pantsBaseMetalness;
    tieKnot.visible = true;
    tieBody.visible = true;

    if (id === "nurse") {
      shirtMat.color.copy(TORSO_NURSE_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      dressSkirt.visible = true;
      for (const m of nurseParts) m.visible = true;
    } else if (id === "magical") {
      shirtMat.color.copy(TORSO_MAGICAL_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      dressSkirt.visible = true;
      for (const m of magicalHeadParts) m.visible = true;
      wandGroup.visible = true;
    } else if (id === "dino") {
      shirtMat.color.copy(TORSO_DINO_COLOR);
      pantsMat.color.copy(PANTS_DINO_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of dinoHeadParts) m.visible = true;
      dinoBellyPatch.visible = true;
      for (const m of dinoSpikes) m.visible = true;
      dinoTail.base.visible = true;
    } else if (id === "space") {
      shirtMat.color.copy(TORSO_SPACE_COLOR);
      pantsMat.color.copy(PANTS_SPACE_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of spaceParts) m.visible = true;
    } else if (id === "bear") {
      shirtMat.color.copy(TORSO_BEAR_COLOR);
      pantsMat.color.copy(PANTS_BEAR_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of bearHeadParts) m.visible = true;
      bearBellyPatch.visible = true;
      bearTail.base.visible = true;
    } else if (id === "gold") {
      shirtMat.color.copy(TORSO_GOLD_COLOR);
      shirtMat.roughness = 0.2;
      shirtMat.metalness = 0.9;
      pantsMat.color.copy(PANTS_GOLD_COLOR);
      pantsMat.roughness = 0.2;
      pantsMat.metalness = 0.9;
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of goldParts) m.visible = true;
    } else if (id === "boxrobo") {
      shirtMat.color.copy(TORSO_BOXROBO_COLOR);
      pantsMat.color.copy(PANTS_BOXROBO_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of boxParts) m.visible = true;
    } else if (id === "tuxedo") {
      shirtMat.color.copy(TORSO_TUXEDO_COLOR);
      pantsMat.color.copy(PANTS_TUXEDO_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of tuxParts) m.visible = true;
    } else if (id === "penguin") {
      shirtMat.color.copy(TORSO_PENGUIN_COLOR);
      pantsMat.color.copy(PANTS_PENGUIN_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of penguinParts) m.visible = true;
      penguinTail.base.visible = true;
    } else if (id === "hoshi") {
      shirtMat.color.copy(TORSO_HOSHI_COLOR);
      pantsMat.color.copy(PANTS_HOSHI_COLOR);
      tieKnot.visible = false;
      tieBody.visible = false;
      for (const m of starParts) m.visible = true;
    }
    // "suit": defaults above already restore the original look
  }

  function getCostume() {
    return currentCostume;
  }

  setCostume("suit");

  // ---- animation state ----
  let talkTimeLeft = 0;
  let slapActive = false;
  let slapElapsed = 0;
  let bobActive = false;
  let bobElapsed = 0;
  const SLAP_DURATION = 1.8;
  const BOB_DURATION = 0.32;
  let launched = false;
  let launchElapsed = 0;
  const LAUNCH_SHAKE_DURATION = 1.0;
  const LAUNCH_RISE_DURATION = 8.0;

  function startTalk(ms) {
    talkTimeLeft = ms / 1000;
  }

  function slap() {
    if (launched) return;
    slapActive = true;
    slapElapsed = 0;
  }

  function bob() {
    bobActive = true;
    bobElapsed = 0;
  }

  // ============================================================
  // ---- locomotion state machine ----
  // p < 0.10: unchanged seated pose.
  // p >= 0.10: one-time ~1s stand-up transition, then he plants
  //   himself just off the stool and shakes his butt in place.
  // p >= 0.30: wanders between random floor waypoints, pausing to
  //   shake between walks.
  // p >= 0.55: wander speed becomes a run.
  // p >= 0.75: random jumps during pauses and mid-run.
  // ============================================================
  const STAND_OFFSET = new THREE.Vector2(-0.5, -0.6); // 机の手前・徘徊範囲内
  const STANDUP_DURATION = 1.0;
  // 机(z=0.4〜)より手前の広いスペースのみ。壁からも1m以上離れる
  const WANDER_MIN_X = -1.6;
  const WANDER_MAX_X = 1.6;
  const WANDER_MIN_Z = -1.9;
  const WANDER_MAX_Z = -0.4;
  const JUMP_DURATION = 0.5;
  const JUMP_HEIGHT = 0.5;
  const WAYPOINT_EPS = 0.08;

  let stoodUp = false;
  let standUpElapsed = 0;
  let standBlend = 0; // 0 = fully seated, 1 = fully standing

  let locoState = "PAUSE"; // "PAUSE" | "WALK"
  let pauseTimer = 0;
  const walkPos = new THREE.Vector2(0, 0); // pelvis x/z offset (group-local)
  const walkTarget = new THREE.Vector2(STAND_OFFSET.x, STAND_OFFSET.y);
  let facingYaw = 0;
  let gaitPhase = 0;

  let jumpActive = false;
  let jumpElapsed = 0;
  let jumpCooldown = randRange(2, 4);

  // 動き変化はアイテム出現ptに同期(p=points/1,000,000):
  // 立つ3,500(ハリセン)/徘徊8,000(バチ)/走る20,000(フライパン)/ジャンプ100,000(孫の手)
  function isRunPhase(pr) {
    return pr >= 0.02;
  }
  function wanderEnabled(pr) {
    return pr >= 0.008;
  }
  function jumpsEnabled(pr) {
    return pr >= 0.1;
  }
  // 終盤ランプ: p=0.1(孫の手出現)→1.0で0→1。ゴールに近づくほど速く・跳びまくる
  function endgameRamp(pr) {
    return clamp01((pr - 0.1) / 0.9);
  }
  function currentSpeed(pr) {
    if (pr < 0.02) return 0.4;
    // 走りは常に一定(速度変化なし・ゆっくりめ)
    return 0.6;
  }

  // 中央のデスクの当たり判定(すり抜け防止)。デスクは(0,0,0.75)に幅1.4×奥行0.7
  const DESK_AABB = { minX: -0.85, maxX: 0.85, minZ: 0.2, maxZ: 1.3 };
  function insideDesk(x, z) {
    return x > DESK_AABB.minX && x < DESK_AABB.maxX && z > DESK_AABB.minZ && z < DESK_AABB.maxZ;
  }

  function pickWaypoint() {
    // デスク内部の目的地は選ばない
    for (let i = 0; i < 20; i++) {
      const x = randRange(WANDER_MIN_X, WANDER_MAX_X);
      const z = randRange(WANDER_MIN_Z, WANDER_MAX_Z);
      if (!insideDesk(x, z)) {
        walkTarget.set(x, z);
        return;
      }
    }
    walkTarget.set(STAND_OFFSET.x, STAND_OFFSET.y);
  }

  function startJump() {
    jumpActive = true;
    jumpElapsed = 0;
  }

  // ---- フィーバータイム: 予測可能なパターン移動(5種) ----
  // 1=水平円 2=垂直円(宙返りループ) 3=2mジャンプ連発 4=左右往復 5=前後往復
  let feverPattern = 0;
  let feverT = 0;
  let feverY = 0;
  const feverFrom = new THREE.Vector2(); // 開始時の位置(テレポート防止のブレンド元)
  function setFever(pattern) {
    feverPattern = pattern || 0;
    feverT = 0;
    feverY = 0;
    feverFrom.copy(walkPos);
  }
  const _feverPos = new THREE.Vector2();
  function applyFever(dt) {
    feverT += dt;
    const t = feverT;
    let fy = 0;
    let wantYaw = facingYaw;
    if (feverPattern === 1) {
      // 水平円軌道(ゆっくり・小さめ・机から離れた手前側)
      const R = 0.5, w = (Math.PI * 2) / 5.5;
      _feverPos.set(Math.cos(w * t) * R, -1.1 + Math.sin(w * t) * R * 0.75);
      wantYaw = Math.atan2(-Math.sin(w * t), Math.cos(w * t) * 0.75) + Math.PI / 2;
    } else if (feverPattern === 2) {
      // 垂直円軌道(宙返りループ・ゆっくり)
      const R = 0.45, w = (Math.PI * 2) / 4.5;
      _feverPos.set(Math.sin(w * t) * R, -1.1);
      fy = R * (1 - Math.cos(w * t));
      wantYaw = Math.cos(w * t) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (feverPattern === 3) {
      // ジャンプ連発(その場・高さ1m・ゆっくり)
      const w = Math.PI / 1.0;
      _feverPos.set(0, -1.1);
      fy = Math.abs(Math.sin(w * t)) * 1.0;
      wantYaw = 0;
    } else if (feverPattern === 4) {
      // 直線を左右往復(短め・ゆっくり)
      const w = (Math.PI * 2) / 4.2;
      _feverPos.set(Math.sin(w * t) * 0.6, -1.1);
      wantYaw = Math.cos(w * t) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (feverPattern === 5) {
      // 直線を前後往復(短め・ゆっくり)
      const w = (Math.PI * 2) / 4.2;
      _feverPos.set(0, -1.3 + Math.sin(w * t) * 0.4);
      wantYaw = Math.cos(w * t) >= 0 ? 0 : Math.PI;
    }
    // 向きの瞬間反転を防いでなめらかに旋回
    facingYaw = lerpAngle(facingYaw, wantYaw, Math.min(1, dt * 7));
    // 開始1秒は現在地からパターンへなめらかに合流(瞬間移動防止)
    const blend = Math.min(feverT / 1.0, 1);
    walkPos.lerpVectors(feverFrom, _feverPos, blend);
    feverY = fy * blend;
    gaitPhase += dt * 9;
  }

  // ---- progress (slap-count driven) transformation state ----
  const buttBaseColor = buttMat.color.clone();
  const buttPinkColor = new THREE.Color(0xff7fb0);
  const buttHotColor = new THREE.Color(0xff2200);
  const buttBaseRoughness = buttMat.roughness;
  const faceBaseColor = faceMat.color.clone();
  const faceHotColor = new THREE.Color(0xdd3322);
  const tieBaseRotZ = tieBody.rotation.z;
  const tieKnotBaseRotZ = tieKnot.rotation.z;
  const tieBaseX = tieBody.position.x;

  let progress = 0;
  let trembleAmp = 0;
  let buttEmissiveBase = 0;

  function setProgress(p) {
    if (launched) return;
    progress = THREE.MathUtils.clamp(p, 0, 1);
    const pr = progress;

    // ---- butt: grow, shift color, glow, get shinier ----
    const buttScaleMul = 1 + pr * 1.2; // up to ~2.2x
    for (let i = 0; i < buttMeshes.length; i++) {
      buttRest[i].copy(buttRestOriginal[i]).multiplyScalar(buttScaleMul);
      if (!slapActive) buttMeshes[i].scale.copy(buttRest[i]);
    }
    if (pr <= 0.5) {
      buttMat.color.copy(buttBaseColor).lerp(buttPinkColor, ease(pr / 0.5));
    } else {
      buttMat.color.copy(buttPinkColor).lerp(buttHotColor, ease((pr - 0.5) / 0.5));
    }
    buttEmissiveBase = pr < 0.6 ? 0 : ((pr - 0.6) / 0.4) * 2.2;
    buttMat.roughness = THREE.MathUtils.lerp(buttBaseRoughness, 0.04, pr);

    // ---- face: progressively flushed ----
    faceMat.color.copy(faceBaseColor).lerp(faceHotColor, ease(pr));

    // ---- sweat drops ----
    sweatDrops[0].visible = pr >= 0.25;
    sweatDrops[1].visible = pr >= 0.25;
    sweatDrops[2].visible = pr >= 0.6;

    // ---- hair loss in chunks ----
    hairMeshes[0].visible = pr < 0.35;
    hairMeshes[1].visible = pr < 0.7;

    // ---- crooked tie ----
    const tieP = pr < 0.4 ? 0 : ease((pr - 0.4) / 0.6);
    tieBody.rotation.z = tieBaseRotZ + tieP * 0.55;
    tieKnot.rotation.z = tieKnotBaseRotZ + tieP * 0.4;
    tieBody.position.x = tieBaseX + tieP * 0.045;

    // ---- askew glasses ----
    const glassP = pr < 0.55 ? 0 : ease((pr - 0.55) / 0.45);
    glassesGroup.rotation.z = glassP * 0.5;
    glassesGroup.position.set(glassP * 0.02, -glassP * 0.015, 0);

    // ---- trembling amplitude (applied in update()) ----
    trembleAmp = pr < 0.5 ? 0 : ((pr - 0.5) / 0.5) * 0.018;
  }

  // ---- the ending: blast off from wherever he currently is ----
  function launch() {
    if (launched) return;
    launched = true;
    launchElapsed = 0;
    flameGroup.visible = true;
    // put the flame under his current feet/butt position (stool if
    // still seated, wherever he's wandered to if standing) instead
    // of always the stool
    flameGroup.position.set(pelvis.position.x, -0.02, pelvis.position.z);
  }

  function headPos() {
    const p = new THREE.Vector3();
    head.getWorldPosition(p);
    p.y += 0.34;
    return p;
  }

  function update(t, dt) {
    // ---- launch: blast off, skip the normal pose entirely ----
    if (launched) {
      launchElapsed += dt;
      const shakeP = Math.min(launchElapsed / LAUNCH_SHAKE_DURATION, 1);
      const shakeAmp = 0.01 + shakeP * 0.05;
      const riseP = launchElapsed > LAUNCH_SHAKE_DURATION
        ? Math.min((launchElapsed - LAUNCH_SHAKE_DURATION) / LAUNCH_RISE_DURATION, 1)
        : 0;
      const risen = ease(riseP);
      const spiralR = 0.15 * (1 - risen * 0.5);

      group.position.y = risen * 80;
      group.position.x = Math.sin(t * 31) * shakeAmp + Math.sin(t * 1.3) * spiralR * riseP;
      group.position.z = Math.cos(t * 27) * shakeAmp + Math.cos(t * 1.3) * spiralR * riseP;
      group.rotation.y = t * 0.8;
      group.rotation.z = Math.sin(t * 6) * shakeAmp * 2;

      // ---- frantic arm waving ----
      handL.position.y = HAND_BASE_Y + Math.sin(t * 20) * 0.05;
      handR.position.y = HAND_BASE_Y + Math.sin(t * 20 + Math.PI) * 0.05;
      handL.position.z = HAND_BASE_Z + Math.sin(t * 17) * 0.05;
      handR.position.z = HAND_BASE_Z + Math.cos(t * 17) * 0.05;

      // ---- flickering flame ----
      const flicker = 0.85 + Math.random() * 0.3;
      flameOuter.scale.set(flicker, 0.9 + Math.random() * 0.4, flicker);
      for (const im of innerFlames) {
        const f2 = 0.7 + Math.random() * 0.6;
        im.scale.set(f2, 0.8 + Math.random() * 0.5, f2);
      }
      return;
    }

    // ---- talk timer ----
    if (talkTimeLeft > 0) talkTimeLeft = Math.max(0, talkTimeLeft - dt);
    const talking = talkTimeLeft > 0;

    // ---- bob timer ----
    let bobOffset = 0;
    if (bobActive) {
      bobElapsed += dt;
      if (bobElapsed >= BOB_DURATION) {
        bobActive = false;
      } else {
        bobOffset = Math.sin((bobElapsed / BOB_DURATION) * Math.PI) * 0.07;
      }
    }

    // ---- slap timer ----
    let slapJoltZ = 0;
    let slapLookY = 0;
    if (slapActive) {
      slapElapsed += dt;
      if (slapElapsed >= SLAP_DURATION) {
        slapActive = false;
      } else {
        const joltP = Math.min(slapElapsed / 0.18, 1);
        slapJoltZ = Math.sin(joltP * Math.PI) * 0.06 * Math.exp(-slapElapsed * 1.4);
        const lookIn = ease(THREE.MathUtils.clamp((slapElapsed - 0.06) / 0.3, 0, 1));
        const lookOut = ease(THREE.MathUtils.clamp((slapElapsed - 1.0) / 0.6, 0, 1));
        slapLookY = 2.3 * lookIn * (1 - lookOut);
      }
    }
    // よろけによる移動凍結は完全廃止(連打で足止めできると簡単すぎるため)。
    // 叩かれジョルトの見た目(slapJoltZ等)は残る
    const staggering = false;

    // ---- breathing ----
    const breathe = Math.sin(t * 1.6) * 0.02;
    torsoMesh.scale.set(1 + breathe * 0.5, 1 + breathe, 1 + breathe * 0.5);

    // ---- idle sway + talk nod ----
    const headYawIdle = Math.sin(t * 0.33) * 0.05;
    const headRollIdle = Math.sin(t * 0.5) * 0.03;
    let headNod = 0;
    if (talking) {
      headNod = Math.sin(t * 14) * 0.06;
      mouth.scale.y = mouthRestY * (0.5 + Math.abs(Math.sin(t * 20)) * 2.2);
    } else {
      mouth.scale.y = mouthRestY;
    }

    // ==== locomotion: sit -> stand -> wander/run/jump ====
    if (!stoodUp) {
      if (progress >= 0.0035) {
        standUpElapsed += dt;
        standBlend = ease(Math.min(standUpElapsed / STANDUP_DURATION, 1));
        walkPos.set(
          THREE.MathUtils.lerp(0, STAND_OFFSET.x, standBlend),
          THREE.MathUtils.lerp(0, STAND_OFFSET.y, standBlend)
        );
        facingYaw = 0;
        if (standBlend >= 1) {
          stoodUp = true;
          locoState = "PAUSE";
          pauseTimer = randRange(1, 2);
          walkPos.copy(STAND_OFFSET);
        }
      } else {
        standBlend = 0;
      }
    } else {
      standBlend = 1;
      if (feverPattern > 0) {
        applyFever(dt);
      } else if (!staggering) {
        const pr = progress;
        const speed = currentSpeed(pr);
        const running = isRunPhase(pr);
        if (locoState === "PAUSE") {
          pauseTimer -= dt;
          if (wanderEnabled(pr) && pauseTimer <= 0) {
            pickWaypoint();
            locoState = "WALK";
          } else if (!wanderEnabled(pr)) {
            pauseTimer = 0.5; // keep re-arming: no wandering yet, just shake in place
          }
          if (jumpsEnabled(pr) && wanderEnabled(pr) && !jumpActive) {
            jumpCooldown -= dt;
            if (jumpCooldown <= 0) {
              startJump();
              jumpCooldown = randRange(2, 4);
            }
          }
        } else if (locoState === "WALK") {
          const dx = walkTarget.x - walkPos.x;
          const dz = walkTarget.y - walkPos.y;
          const dist = Math.hypot(dx, dz);
          if (dist < WAYPOINT_EPS) {
            locoState = "PAUSE";
            // 走りフェーズは立ち止まりを短くして一定ペースを保つ
            pauseTimer = running ? 0.3 : randRange(1, 2);
          } else {
            const step = Math.min(speed * dt, dist);
            const nx = walkPos.x + (dx / dist) * step;
            const nz = walkPos.y + (dz / dist) * step;
            if (insideDesk(nx, nz)) {
              // デスクに突っ込む経路なら目的地を選び直す(すり抜け防止)。この歩は進まない
              pickWaypoint();
            } else {
              walkPos.x = nx;
              walkPos.y = nz;
              facingYaw = Math.atan2(dx, dz);
              gaitPhase += dt * (speed * 7 + (running ? 4 : 0));
            }
          }
          if (jumpsEnabled(pr) && !jumpActive) {
            jumpCooldown -= dt;
            if (jumpCooldown <= 0) {
              startJump();
              jumpCooldown = randRange(3, 6);
            }
          }
        }
      }
      // while paused (or not yet wandering) slowly turn to present
      // the butt toward the camera-ish -z side, i.e. back to yaw 0
      const targetYaw = (feverPattern > 0 || (locoState === "WALK" && !staggering)) ? facingYaw : 0;
      facingYaw = lerpAngle(facingYaw, targetYaw, clamp01(dt * 4));
    }

    if (jumpActive) {
      jumpElapsed += dt;
      if (jumpElapsed >= JUMP_DURATION) jumpActive = false;
    }
    const jumpArc = jumpActive ? Math.sin(clamp01(jumpElapsed / JUMP_DURATION) * Math.PI) : 0;

    // continuous side-to-side hip shake/taunt while standing
    const shakeT = t * 5.2;
    const shakeX = Math.sin(shakeT) * 0.15 * standBlend * (1 - jumpArc * 0.5);
    const shakeRotZ = Math.sin(shakeT + 0.3) * 0.22 * standBlend * (1 - jumpArc * 0.6);
    const shakeRotY = Math.sin(shakeT * 0.5) * 0.08 * standBlend;

    // ---- idle typing hands (fades out as he stands up) ----
    const typeAmp = 1 - standBlend;
    handL.position.y = HAND_BASE_Y + Math.sin(t * 9) * 0.012 * typeAmp;
    handR.position.y = HAND_BASE_Y + Math.sin(t * 9 + Math.PI) * 0.012 * typeAmp;
    handL.position.z = HAND_BASE_Z + Math.sin(t * 9 + 1.2) * 0.008 * typeAmp;
    handR.position.z = HAND_BASE_Z + Math.sin(t * 9 + 1.2 + Math.PI) * 0.008 * typeAmp;

    // ---- apply pelvis (sit <-> stand/walk/run/jump) ----
    const staggerScale = 1 + standBlend * 2; // bigger stumble once standing
    // 重要: group全体がfacingYawで回転するため、walkPos(ワールド座標)は逆回転して
    // ローカルに変換してから適用する。そうしないと振り向くたびに体が原点周りに
    // 振り回される(瞬間移動バグ)。シェイクやジョルトは体基準なのでそのまま加算
    const wx = THREE.MathUtils.lerp(0, walkPos.x, standBlend);
    const wz = THREE.MathUtils.lerp(0, walkPos.y, standBlend);
    const cosFy = Math.cos(facingYaw);
    const sinFy = Math.sin(facingYaw);
    const pelvisX = wx * cosFy - wz * sinFy + shakeX;
    const pelvisZ = wx * sinFy + wz * cosFy + slapJoltZ * staggerScale;
    const pelvisY = THREE.MathUtils.lerp(SIT_PELVIS_Y, STAND_PELVIS_Y, standBlend) +
      jumpArc * JUMP_HEIGHT * standBlend +
      feverY * standBlend;
    pelvis.position.set(pelvisX, pelvisY, pelvisZ);
    pelvis.rotation.z = shakeRotZ;
    pelvis.rotation.y = shakeRotY;

    // ---- apply torso lean ----
    const runLean = standBlend > 0 && locoState === "WALK" && isRunPhase(progress) ? 0.12 * standBlend : 0;
    torsoLean.position.set(
      0,
      THREE.MathUtils.lerp(SIT_TORSO_Y, STAND_TORSO_Y, standBlend) + bobOffset + breathe * 0.04,
      0
    );
    torsoLean.rotation.x = THREE.MathUtils.lerp(SIT_TORSO_ROT_X, STAND_TORSO_ROT_X + runLean, standBlend) + bobOffset * 0.15;
    torsoLean.rotation.y = slapLookY * 0.22;

    head.rotation.set(headNod, headYawIdle + slapLookY, headRollIdle);

    // ---- legs: sit <-> stand, plus gait swing while walking/running,
    // plus a knee tuck while airborne ----
    const walking = stoodUp && locoState === "WALK" && !staggering;
    const running = walking && isRunPhase(progress);
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const phaseOff = i === 0 ? 0 : Math.PI;
      const swingAmp = walking ? (running ? 0.55 : 0.35) : 0;
      const thighSwing = walking ? Math.sin(gaitPhase + phaseOff) * swingAmp : 0;
      const kneeLift = walking ? Math.max(0, Math.sin(gaitPhase + phaseOff)) * swingAmp * 0.9 : 0;
      const jumpTuck = jumpArc * 0.6;

      const standThighTarget = STAND_THIGH_ROT_X + thighSwing - jumpTuck;
      const standShinTarget = STAND_SHIN_ROT_X + kneeLift + jumpTuck * 1.4;

      leg.thighPivot.rotation.x = THREE.MathUtils.lerp(SIT_THIGH_ROT_X, standThighTarget, standBlend);
      leg.shinPivot.rotation.x = THREE.MathUtils.lerp(SIT_SHIN_ROT_X, standShinTarget, standBlend);
      leg.thighPivot.position.z = THREE.MathUtils.lerp(SIT_THIGH_Z, STAND_THIGH_Z, standBlend);
    }

    // ---- arms: sit <-> stand, swing while walking, raised while
    // jumping ----
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const xSign = i === 0 ? -1 : 1;
      const phaseOff = i === 0 ? Math.PI : 0; // opposite phase to same-side leg
      const swingAmpArm = walking ? (running ? 0.5 : 0.3) : 0;
      const shoulderSwing = walking ? Math.sin(gaitPhase + phaseOff) * swingAmpArm : 0;
      const elbowSwing = walking ? Math.max(0, Math.sin(gaitPhase + phaseOff + Math.PI)) * swingAmpArm * 0.6 : 0;

      let shoulderX = THREE.MathUtils.lerp(SIT_SHOULDER_ROT_X, STAND_SHOULDER_ROT_X + shoulderSwing, standBlend);
      let elbowX = THREE.MathUtils.lerp(SIT_ELBOW_ROT_X, STAND_ELBOW_ROT_X + elbowSwing, standBlend);
      if (jumpArc > 0) {
        shoulderX = THREE.MathUtils.lerp(shoulderX, ARMS_UP_SHOULDER_ROT_X, jumpArc);
        elbowX = THREE.MathUtils.lerp(elbowX, ARMS_UP_ELBOW_ROT_X, jumpArc);
      }
      arm.shoulder.rotation.x = shoulderX;
      arm.shoulder.rotation.z = -xSign * 0.12;
      arm.elbow.rotation.x = elbowX;
    }

    // ---- facing (butt-shake taunt / walk direction) ----
    group.rotation.y = facingYaw;

    // ---- butt jiggle ----
    for (let i = 0; i < buttMeshes.length; i++) {
      const m = buttMeshes[i];
      const rest = buttRest[i];
      if (slapActive) {
        const amp = 0.4 * Math.exp(-slapElapsed * 6);
        const wob = Math.sin(slapElapsed * 45 + i * Math.PI);
        m.scale.set(rest.x * (1 + wob * amp), rest.y * (1 - wob * amp * 0.7), rest.z * (1 + wob * amp * 0.5));
      } else {
        m.scale.copy(rest);
      }
    }

    // ---- progress-driven trembling ----
    if (trembleAmp > 0) {
      group.position.x = Math.sin(t * 47) * trembleAmp + Math.sin(t * 71) * trembleAmp * 0.4;
      group.position.z = Math.cos(t * 39) * trembleAmp * 0.6;
    } else {
      group.position.x = 0;
      group.position.z = 0;
    }

    // ---- progress-driven butt glow pulse ----
    let emissivePulse = 0;
    if (progress >= 0.85) {
      const steamP = (progress - 0.85) / 0.15;
      emissivePulse = Math.abs(Math.sin(t * 8)) * 0.6 * steamP;
    }
    buttMat.emissiveIntensity = buttEmissiveBase + emissivePulse;

    // ---- dino tail: gentle constant sway ----
    if (currentCostume === "dino") {
      dinoTail.base.rotation.z = Math.sin(t * 2.2) * 0.18;
      dinoTail.pivot2.rotation.z = Math.sin(t * 2.2 + 1.1) * 0.15;
    }
  }

  // ---- 写真モード用の静的ポーズ ----
  // update() は毎フレーム全パーツのtransformを書き戻すため、
  // 写真モード中は呼び出し側が update() を止めた上でこれを使う。
  // (update() が再開すれば自動的に元の状態機械ポーズへ戻る)
  const PHOTO_POSES = ["sit", "stand", "banzai", "oshiri", "jump"];
  function photoPose(name) {
    if (!PHOTO_POSES.includes(name)) name = "stand";
    // まず「立ち」の基準にリセット
    pelvis.position.set(0, STAND_PELVIS_Y, 0);
    pelvis.rotation.set(0, 0, 0);
    torsoLean.position.y = STAND_TORSO_Y;
    torsoLean.rotation.set(STAND_TORSO_ROT_X, 0, 0);
    head.rotation.set(0, 0, 0);
    for (const leg of [legL, legR]) {
      leg.thighPivot.rotation.set(STAND_THIGH_ROT_X, 0, 0);
      leg.shinPivot.rotation.set(STAND_SHIN_ROT_X, 0, 0);
    }
    // ゲーム中の立ち(STAND=腕上げ気味)と違い、写真では腕を下ろして落ち着かせる
    armL.shoulder.rotation.set(Math.PI * 0.94, 0, 0.15);
    armR.shoulder.rotation.set(Math.PI * 0.94, 0, -0.15);
    armL.elbow.rotation.set(-0.25, 0, 0);
    armR.elbow.rotation.set(-0.25, 0, 0);
    group.position.y = 0;

    if (name === "sit") {
      // 椅子なしの地べた座り(体育座りふう)。デスク前の座りポーズ(SIT_*)は椅子前提なので使わない
      pelvis.position.y = 0.34;
      torsoLean.position.y = SIT_TORSO_Y;
      torsoLean.rotation.x = 0.28;
      for (const leg of [legL, legR]) {
        leg.thighPivot.rotation.x = THREE.MathUtils.degToRad(70);
        leg.shinPivot.rotation.x = THREE.MathUtils.degToRad(78);
      }
      armL.shoulder.rotation.set(2.55, 0, 0.3);
      armR.shoulder.rotation.set(2.55, 0, -0.3);
      armL.elbow.rotation.x = -0.5;
      armR.elbow.rotation.x = -0.5;
    } else if (name === "banzai") {
      armL.shoulder.rotation.set(ARMS_UP_SHOULDER_ROT_X, 0, 0.3);
      armR.shoulder.rotation.set(ARMS_UP_SHOULDER_ROT_X, 0, -0.3);
      armL.elbow.rotation.x = ARMS_UP_ELBOW_ROT_X;
      armR.elbow.rotation.x = ARMS_UP_ELBOW_ROT_X;
      head.rotation.x = -0.15; // ちょっと上を向く
    } else if (name === "oshiri") {
      // おしりドン: 前屈みでお尻を突き出す(向きは呼び出し側がgroup.rotation.yで決める)
      torsoLean.rotation.x = 1.05;
      head.rotation.x = -0.9; // 顔だけ起こす
      armL.shoulder.rotation.set(2.4, 0, 0.55);
      armR.shoulder.rotation.set(2.4, 0, -0.55);
      armL.elbow.rotation.x = -0.4;
      armR.elbow.rotation.x = -0.4;
      for (const leg of [legL, legR]) leg.thighPivot.rotation.x = Math.PI - 0.12;
    } else if (name === "jump") {
      group.position.y = 0.34;
      for (const leg of [legL, legR]) {
        leg.thighPivot.rotation.x = Math.PI - 0.55;
        leg.shinPivot.rotation.x = 1.0;
      }
      armL.shoulder.rotation.set(ARMS_UP_SHOULDER_ROT_X, 0, 0.55);
      armR.shoulder.rotation.set(ARMS_UP_SHOULDER_ROT_X, 0, -0.55);
      armL.elbow.rotation.x = ARMS_UP_ELBOW_ROT_X;
      armR.elbow.rotation.x = ARMS_UP_ELBOW_ROT_X;
      head.rotation.x = -0.1;
      torsoLean.rotation.x = -0.08; // 軽くのけぞる
    }
  }

  return {
    group,
    buttMeshes,
    headPos,
    update,
    startTalk,
    slap,
    bob,
    setCostume,
    getCostume,
    setProgress,
    setFever,
    photoPose,
    get feverState() {
      return { p: feverPattern, t: +feverT.toFixed(2), wx: +walkPos.x.toFixed(2), wz: +walkPos.y.toFixed(2), state: locoState };
    },
    launch,
  };
}
