import * as THREE from "three";
import { glbProp, loadGLTFRaw, applyPalette, playClip, updateMixers } from "./glb.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createOffice(scene) {
  // Floor
  const floorGeom = new THREE.PlaneGeometry(6, 6);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8b8b8b });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0 });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.1), wallMat);
  backWall.position.z = -3;
  backWall.position.y = 1.5;
  scene.add(backWall);

  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.1), wallMat);
  frontWall.position.z = 3;
  frontWall.position.y = 1.5;
  scene.add(frontWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 6), wallMat);
  leftWall.position.x = -3;
  leftWall.position.y = 1.5;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 6), wallMat);
  rightWall.position.x = 3;
  rightWall.position.y = 1.5;
  scene.add(rightWall);

  // Ceiling
  const ceilingGeom = new THREE.PlaneGeometry(6, 6);
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
  const ceiling = new THREE.Mesh(ceilingGeom, ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3;
  scene.add(ceiling);

  // Desk (GLB: Quaternius Desk。天板高さ≈0.72を保つようtargetHeightで正規化)
  const deskGroup = glbProp("assets/models/desk.glb", {
    targetHeight: 0.76,
    palette: "keep",
  });
  deskGroup.position.set(0, 0, 0.75);
  deskGroup.rotation.y = Math.PI; // 引き出し面をプレイヤー側(-z)へ
  scene.add(deskGroup);

  // Keyboard
  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.02, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
  );
  keyboard.position.set(-0.3, 0.73, 0.9);
  scene.add(keyboard);

  // Mouse
  const mouse = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.03, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
  );
  mouse.position.set(0.3, 0.73, 0.95);
  scene.add(mouse);

  // (コーヒーマグは星のマスコットと位置が被るため削除)

  // Clutter registry: small chaotic objects that escalate/levitate with progress
  const clutterItems = [];
  function registerClutter(mesh) {
    clutterItems.push({
      mesh,
      basePos: mesh.position.clone(),
      baseRot: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
      tiltSeed: {
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random() * 2 - 1
      },
      phase: Math.random() * Math.PI * 2,
      spinSeed: (Math.random() * 2 - 1) * 0.6,
      restY: mesh.position.y,
      levitating: false
    });
  }

  // Clickable registry: meshes the player can click, tagged with userData.clickId
  const clickables = [];
  function tagClickable(root, id) {
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.clickId = id;
        clickables.push(obj);
      }
    });
  }

  // Generic material helper for the new procedural props
  function stdMat(color, roughness = 0.7, metalness = 0.05, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  }

  // Scattered papers on desk
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0 });
  for (let i = 0; i < 8; i++) {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.005, 0.25),
      paperMat
    );
    paper.position.set(
      (Math.random() - 0.5) * 0.8,
      0.73 + Math.random() * 0.05,
      0.95 + Math.random() * 0.3
    );
    paper.rotation.z = Math.random() * Math.PI * 2;
    paper.rotation.x = (Math.random() - 0.5) * 0.3;
    scene.add(paper);
    registerClutter(paper);
  }

  // Scattered papers on floor
  for (let i = 0; i < 5; i++) {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.002, 0.2),
      paperMat
    );
    paper.position.set(
      (Math.random() - 0.5) * 2,
      0.01,
      1 + Math.random() * 1
    );
    paper.rotation.z = Math.random() * Math.PI * 2;
    scene.add(paper);
    registerClutter(paper);
  }

  // Stacked cardboard boxes in corner [CLICKABLE: boxes] (GLB: Quaternius Cardboard Boxes)
  const boxGroup = glbProp("assets/models/boxes.glb", {
    targetHeight: 1.2,
    palette: "keep",
    onReady: (g) => tagClickable(g, "boxes"),
  });
  boxGroup.position.set(-2.2, 0, -2.2);
  scene.add(boxGroup);

  // Trash can [CLICKABLE: trash] (GLB: Quaternius Trashcan)
  const trashGroup = glbProp("assets/models/trashcan.glb", {
    targetHeight: 0.55,
    palette: "keep",
    onReady: (g) => tagClickable(g, "trash"),
  });
  trashGroup.position.set(-2.5, 0, 0.5);
  scene.add(trashGroup);

  // Crumpled paper around trash
  const crumpleMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
  for (let i = 0; i < 6; i++) {
    const crumple = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      crumpleMat
    );
    crumple.position.set(
      -2.5 + (Math.random() - 0.5) * 0.6,
      0.1 + Math.random() * 0.3,
      0.5 + (Math.random() - 0.5) * 0.6
    );
    scene.add(crumple);
    registerClutter(crumple);
  }

  // Bookshelf on back wall = コレクションボードの台座。
  // 入手カードのミニチュアは board.js がこの前面(z=-2.65)にテクスチャで貼る。
  // (以前あった散らばった本のパーツは、ボード表示の邪魔になるため撤去)
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x8b6914 });
  // コルクボード風の薄い板を壁の高めに掛ける
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.47, 1.82, 0.04), shelfMat);
  shelf.position.set(1.5, 1.6, -2.92);
  scene.add(shelf);
  tagClickable(shelf, "board");

  // Beer and coffee cans
  const canMat1 = new THREE.MeshStandardMaterial({ color: 0xffd700 });
  const canMat2 = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  for (let i = 0; i < 3; i++) {
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8),
      i % 2 === 0 ? canMat1 : canMat2
    );
    can.position.set(
      -1.5 + i * 0.4,
      0.06,
      1.5 + Math.random() * 1
    );
    scene.add(can);
  }

  // Cable
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.8), cableMat);
  cable.position.set(-0.5, 0.8, 0.2);
  scene.add(cable);

  // Wall clock
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  clockFace.position.set(-2.8, 2, -2.8);
  clockFace.rotation.y = Math.PI / 2;
  scene.add(clockFace);

  const clockHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.1, 0.01),
    new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  clockHand.position.set(-2.8, 2, -2.76);
  scene.add(clockHand);

  // Poster on right wall
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b })
  );
  poster.position.set(2.9, 2, 0);
  scene.add(poster);
  const posterBaseRotZ = poster.rotation.z;

  // Potted plant (GLB: Quaternius Houseplant・傘の右側)
  const plantGroup = glbProp("assets/models/plant.glb", {
    targetHeight: 0.85,
    palette: "keep",
    onReady: (g) => tagClickable(g, "plant"),
  });
  plantGroup.position.set(1.55, 0, 2.7);
  scene.add(plantGroup);

  // ================================================================
  // NEW PROPS
  // ================================================================

  // ① Copier — beige box, dark glass lid, paper tray
  {
    const copier = new THREE.Group();
    copier.position.set(-2.6, 0, 1.6);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.5), stdMat(0xe8dcc0, 0.8, 0.05));
    body.position.y = 0.425;
    copier.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.46), stdMat(0x232328, 0.2, 0.3));
    lid.position.set(0, 0.875, 0);
    copier.add(lid);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.16), stdMat(0xcfcfcf, 0.6, 0.1));
    tray.position.set(0, 0.18, 0.32);
    copier.add(tray);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.02), stdMat(0x2c2c2c, 0.5, 0.2));
    panel.position.set(0.18, 0.68, 0.26);
    copier.add(panel);
    scene.add(copier);
    tagClickable(copier, "copier");
    var copierGroup = copier;
  }

  // ② Water cooler — white stand + translucent blue bottle
  {
    const cooler = new THREE.Group();
    cooler.position.set(2.7, 0, -0.6);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.9, 14), stdMat(0xf5f5f5, 0.6, 0.05));
    stand.position.y = 0.45;
    cooler.add(stand);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 16), stdMat(0x9aa0a6, 0.5, 0.2));
    basin.position.y = 0.935;
    cooler.add(basin);
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.48, 16),
      new THREE.MeshStandardMaterial({ color: 0x3f9fd6, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.05 })
    );
    bottle.position.y = 1.2;
    cooler.add(bottle);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.08, 12), stdMat(0x3f9fd6, 0.2, 0.05, { transparent: true, opacity: 0.6 }));
    neck.position.y = 1.48;
    cooler.add(neck);
    for (const [dx, color] of [[-0.06, 0xdd3333], [0.06, 0x3366dd]]) {
      const spigot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), stdMat(color, 0.5, 0.2));
      spigot.position.set(dx, 0.75, 0.18);
      cooler.add(spigot);
    }
    scene.add(cooler);
    tagClickable(cooler, "cooler");
    var coolerGroup = cooler;
  }

  // ③ Locker [CLICKABLE: locker] (GLB: Quaternius Closet・赤アクセント)
  const lockerGroup = glbProp("assets/models/locker.glb", {
    targetHeight: 1.85,
    palette: "mono-red",
    onReady: (g) => tagClickable(g, "locker"),
  });
  lockerGroup.position.set(-1.0, 0, -2.74);
  scene.add(lockerGroup);

  // ④ Fridge [CLICKABLE: fridge] (GLB: Quaternius Kitchen Fridge・フルサイズ)
  // (電子レンジは削除済み)
  const fridgeGroup = glbProp("assets/models/fridge.glb", {
    targetHeight: 1.55,
    palette: "keep",
    onReady: (g) => tagClickable(g, "fridge"),
  });
  fridgeGroup.position.set(-2.65, 0, 2.6);
  scene.add(fridgeGroup);

  // ⑥ Electric fan — stand fan with an oscillating head(傘の左側)
  let fanHead;
  {
    const fan = new THREE.Group();
    fan.position.set(0.25, 0, 2.75);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 16), stdMat(0x2b2b2e, 0.5, 0.3));
    base.position.y = 0.02;
    fan.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10), stdMat(0x33363a, 0.5, 0.3));
    pole.position.y = 0.47;
    fan.add(pole);

    fanHead = new THREE.Group();
    fanHead.position.y = 0.95;
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 14), stdMat(0x3a3d42, 0.5, 0.3));
    motor.rotation.z = Math.PI / 2;
    fanHead.add(motor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), stdMat(0xcfcfcf, 0.3, 0.5));
    hub.rotation.z = Math.PI / 2;
    hub.position.z = 0.1;
    fanHead.add(hub);
    for (let i = 0; i < 3; i++) {
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.05 + i * 0.06, 0.006, 6, 20), stdMat(0xaaaaaa, 0.4, 0.4));
      cage.position.z = 0.1;
      fanHead.add(cage);
    }
    fan.add(fanHead);
    scene.add(fan);
    tagClickable(fan, "fan");
    var fanGroup = fan;
  }

  // ⑦ Safe — small heavy dark-green safe with round dial
  {
    const safe = new THREE.Group();
    safe.position.set(-2.75, 0, -2.4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.44), stdMat(0x1f3d2b, 0.5, 0.35));
    body.position.y = 0.24;
    safe.add(body);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 20), stdMat(0xcccccc, 0.3, 0.6));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.05, 0.28, 0.23);
    safe.add(dial);
    const dialNub = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.01), stdMat(0x333333, 0.4, 0.4));
    dialNub.position.set(0.05, 0.32, 0.245);
    safe.add(dialNub);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.03), stdMat(0x14231a, 0.5, 0.3));
    handle.position.set(-0.16, 0.24, 0.235);
    safe.add(handle);
    scene.add(safe);
    tagClickable(safe, "safe");
    var safeGroup = safe;
  }

  // ⑧ 傘 — ビニール傘3本が壁に立てかけてある [CLICKABLE: umbrella]
  // (傘立ては見た目が悪いため廃止。GLB: CreativeTrio Closed Umbrella ×3、色違い)
  const umbrellaGroup = new THREE.Group();
  umbrellaGroup.position.set(0.9, 0, 2.8);
  {
    const configs = [
      { x: -0.3, tiltX: -0.16, tiltZ: 0.12, palette: "keep" },
      { x: 0.0, tiltX: -0.2, tiltZ: -0.06, palette: "keep" },
      { x: 0.32, tiltX: -0.14, tiltZ: 0.18, palette: "keep" },
    ];
    for (const c of configs) {
      const u = glbProp("assets/models/umbrella.glb", {
        targetHeight: 0.9,
        palette: c.palette,
        clone: true,
        onReady: (g) => tagClickable(g, "umbrella"),
      });
      u.position.set(c.x, 0.02, 0);
      u.rotation.x = c.tiltX; // 壁(+z)に立てかける傾き
      u.rotation.z = c.tiltZ;
      umbrellaGroup.add(u);
    }
    scene.add(umbrellaGroup);
  }

  // ⑨ Dartboard — ring-colored disc on the right wall with 2 tiny darts
  {
    const board = new THREE.Group();
    board.position.set(2.95, 1.7, -1.5);
    board.rotation.z = Math.PI / 2; // orients disc normal to point into the room (-x)
    const rings = [
      { r: 0.28, color: 0x1a1a1a, y: 0 },
      { r: 0.24, color: 0xf2f2f2, y: 0.006 },
      { r: 0.18, color: 0xcc2b2b, y: 0.012 },
      { r: 0.12, color: 0xf2f2f2, y: 0.018 },
      { r: 0.07, color: 0x1a1a1a, y: 0.024 },
      { r: 0.03, color: 0xcc2b2b, y: 0.03 }
    ];
    for (const ring of rings) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(ring.r, ring.r, 0.02, 28), stdMat(ring.color, 0.8, 0));
      mesh.position.y = ring.y;
      board.add(mesh);
    }
    scene.add(board);
    tagClickable(board, "dartboard");
    var dartboardGroup = board;

    function dart(x, y, z) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 8), stdMat(0x999999, 0.3, 0.6));
      shaft.rotation.z = Math.PI / 2;
      shaft.position.set(x, y, z);
      scene.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 8), stdMat(0x555555, 0.3, 0.6));
      tip.rotation.z = -Math.PI / 2;
      tip.position.set(x - 0.06, y, z);
      scene.add(tip);
      const flight = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.03, 8), stdMat(0xdd3333, 0.6, 0.05));
      flight.rotation.z = Math.PI / 2;
      flight.position.set(x + 0.05, y, z);
      scene.add(flight);
    }
    dart(2.9, 1.72, -1.48);
    dart(2.9, 1.65, -1.53);
  }

  // ⑨b HELL 9000 [CLICKABLE: hell] — カードパックを売るガチャロボ
  // (GLB: Polygonal Mind "Mr Zurb Zurb" / CC0)。ダーツの的の真下、右壁ぎわに置く。
  // おじさんの徘徊域(x≤1.6)とクマ(2.2, 0.8)のどちらからも離れた空き地。
  const hellGroup = glbProp("assets/models/hell9000.glb", {
    targetHeight: 1.5,
    palette: "keep",
    onReady: (g) => tagClickable(g, "hell"),
  });
  hellGroup.position.set(2.45, 0, -1.5);
  // モデルの正面は+x(壁側)なので180度回して部屋の中心を向かせる。
  // T字に広げた腕は壁と平行なz方向に伸びるので、90度回すと腕が壁を突き抜ける。
  hellGroup.rotation.y = Math.PI;
  scene.add(hellGroup);

  // ⑩ Security guard [CLICKABLE: muscle] (GLB: Quaternius Soldier)
  // 旧マッチョの腕振りアニメは廃止。Idleクリップがあれば再生し、リアクションは共通バウンス
  const guardGroup = new THREE.Group();
  {
    const guardPos = new THREE.Vector3(2.5, 0, 2.3);
    guardGroup.position.copy(guardPos);
    guardGroup.rotation.y = Math.atan2(0 - guardPos.x, 0 - guardPos.z);
    loadGLTFRaw("assets/models/soldier.glb").then((gltf) => {
      const model = gltf.scene;
      // 注意: スキンメッシュはBox3で実寸が取れない(ボーン基準で身長約1.7・実物大)。
      // 正規化せずそのまま置く
      model.scale.setScalar(1.05);
      // スキンメッシュはバインド空間の境界が巨大でカリング判定が壊れるため無効化+
      // レイキャスト用境界を現ポーズで計算(クリック判定に必要)
      model.traverse((o) => {
        if (o.isSkinnedMesh) {
          o.frustumCulled = false;
          o.computeBoundingBox();
          o.computeBoundingSphere();
        }
      });
      guardGroup.add(model);
      // three r160はSkinnedMeshのレイキャスト(ポーズ反映)非対応のため、
      // 透明コライダーでクリック判定する
      const collider = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 1.75, 0.5),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      collider.position.y = 0.875;
      guardGroup.add(collider);
      tagClickable(collider, "muscle");
      // 通常はIdle。フィーバー中は左右パンチを交互に出してモンキーダンス化
      guardMixer = new THREE.AnimationMixer(model);
      const findClip = (name) =>
        gltf.animations.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      const idleClip = findClip("|Idle") || findClip("Idle");
      guardActions = {
        idle: idleClip ? guardMixer.clipAction(idleClip) : null,
        punchL: findClip("Punch_Left") ? guardMixer.clipAction(findClip("Punch_Left")) : null,
        punchR: findClip("Punch_Right") ? guardMixer.clipAction(findClip("Punch_Right")) : null,
      };
      if (guardActions.idle) {
        guardActions.idle.play();
        guardCurrentAction = guardActions.idle;
      }
    }).catch((err) => console.error("soldier load failed", err));
    scene.add(guardGroup);
  }
  let guardMixer = null;
  let guardActions = null;
  let guardCurrentAction = null;
  let guardDanceT = 0;
  const guardBaseYaw = guardGroup.rotation.y;
  function switchGuardAction(next) {
    if (!next || guardCurrentAction === next) return;
    next.reset().fadeIn(0.12).play();
    if (guardCurrentAction) guardCurrentAction.fadeOut(0.12);
    guardCurrentAction = next;
  }
  // ⑪ Record player on a small side table [CLICKABLE: player]
  let recordPlatter;
  const playerSpinBurst = { active: false, startT: null, duration: 0.6 };
  {
    const playerGroup = new THREE.Group();
    playerGroup.position.set(2.45, 0, -2.45);

    // small dark side table
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.4), stdMat(0x2b1d14, 0.6, 0.1));
    tableTop.position.y = 0.48;
    playerGroup.add(tableTop);
    const tableLegMat = stdMat(0x1c130d, 0.6, 0.1);
    for (const [lx, lz] of [[-0.21, -0.16], [0.21, -0.16], [-0.21, 0.16], [0.21, 0.16]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.46, 0.035), tableLegMat);
      leg.position.set(lx, 0.23, lz);
      playerGroup.add(leg);
    }

    // turntable plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.34), stdMat(0x18181a, 0.4, 0.3));
    plinth.position.y = 0.53;
    playerGroup.add(plinth);

    // platter (spins continuously, faster burst on react)
    recordPlatter = new THREE.Group();
    recordPlatter.position.set(-0.03, 0.565, 0);
    const platterDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 32), stdMat(0x101010, 0.3, 0.2));
    recordPlatter.add(platterDisc);
    const centerLabel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.017, 20), stdMat(0xcc2222, 0.4, 0.1));
    recordPlatter.add(centerLabel);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), stdMat(0xdddddd, 0.3, 0.5));
    spindle.position.y = 0.02;
    recordPlatter.add(spindle);
    playerGroup.add(recordPlatter);

    // tonearm
    const armBase = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), stdMat(0x888888, 0.3, 0.5));
    armBase.position.set(0.16, 0.565, -0.12);
    playerGroup.add(armBase);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.012), stdMat(0xaaaaaa, 0.3, 0.5));
    arm.position.set(0.09, 0.585, -0.07);
    arm.rotation.y = 0.5;
    playerGroup.add(arm);

    scene.add(playerGroup);
    tagClickable(playerGroup, "player");
    var playerGroupRef = playerGroup;
  }

  // ⑫ Messy record pile next to the player [CLICKABLE: records]
  {
    const pileGroup = new THREE.Group();
    pileGroup.position.set(1.85, 0, -2.6);
    const darkSleeveColors = [0x1a1a1a, 0x2b2b2e, 0x232326, 0x181818, 0x2f2f33];
    let stackY = 0.01;
    for (let i = 0; i < 7; i++) {
      const w = 0.32 + Math.random() * 0.02;
      const thickness = 0.012 + Math.random() * 0.006;
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(w, thickness, w * 0.98),
        stdMat(darkSleeveColors[i % darkSleeveColors.length], 0.7, 0.05)
      );
      sleeve.position.set((Math.random() - 0.5) * 0.03, stackY + thickness / 2, (Math.random() - 0.5) * 0.03);
      sleeve.rotation.y = (Math.random() - 0.5) * 0.5;
      pileGroup.add(sleeve);
      stackY += thickness;
    }
    // a couple of colorful sleeves leaning against the stack
    const leanColors = [0xdd5533, 0x3388cc];
    for (let i = 0; i < 2; i++) {
      const lean = new THREE.Mesh(
        new THREE.BoxGeometry(0.31, 0.012, 0.31),
        stdMat(leanColors[i], 0.6, 0.05)
      );
      lean.position.set(0.17 + i * 0.05, 0.13, 0.02);
      lean.rotation.z = Math.PI / 2 - 0.35 - i * 0.1;
      lean.rotation.y = (Math.random() - 0.5) * 0.3;
      pileGroup.add(lean);
    }
    scene.add(pileGroup);
    tagClickable(pileGroup, "records");
    var pileGroupRef = pileGroup;
  }

  // ⑬ Music artist poster on the back wall [CLICKABLE: musicposter]
  // RaDIOHIP『ぴっちぴち・アンドロイド』のポスター画像を貼る
  {
    const musicPoster = new THREE.Group();
    musicPoster.position.set(-0.4, 1.9, -2.92);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.28, 0.04), stdMat(0x1a1a1a, 0.6, 0.2));
    musicPoster.add(frame);

    const posterTex = new THREE.TextureLoader().load("assets/radiohip.jpg");
    posterTex.colorSpace = THREE.SRGBColorSpace;
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 1.2), // 726x1024のアスペクト比に合わせる
      new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.85, metalness: 0 })
    );
    art.position.z = 0.021;
    musicPoster.add(art);

    scene.add(musicPoster);
    tagClickable(musicPoster, "musicposter");
    var musicPosterGroupRef = musicPoster;
  }

  // ================================================================
  // LIGHTING — dim, moody room lit mainly by ceiling spotlights
  // ================================================================
  const ambientLight = new THREE.AmbientLight(0x2b3a55, 0.1);
  scene.add(ambientLight);
  const ambientBase = { color: new THREE.Color(0x2b3a55), intensity: 0.1 };

  // Old sole directional light: weakened drastically, kept only as a faint fill
  // (also reused as the "sunburst" when the roof opens at the end)
  const directionalLight = new THREE.DirectionalLight(0xdfe8ff, 0.05);
  directionalLight.position.set(2, 3, 2);
  scene.add(directionalLight);
  const directionalBase = { color: new THREE.Color(0xdfe8ff), intensity: 0.05 };

  const deskLamp = new THREE.PointLight(0xffcc99, 0.8);
  deskLamp.position.set(0.4, 1.2, 0.7);
  scene.add(deskLamp);
  const deskLampBase = { color: new THREE.Color(0xffcc99), intensity: 0.8 };

  // Ceiling spotlights + their visible fixtures
  const spotConfigs = [
    { pos: [0, 2.88, 0.6], target: [0, 0, 0.75], intensity: 13 }, // over the desk
    { pos: [-1.3, 2.88, -1.4], target: [-1.3, 0, -1.4], intensity: 10 }, // over the other half (shelves/boxes)
    { pos: [1.8, 2.88, 1.1], target: [1.8, 0, 1.1], intensity: 10 } // over the right side clutter
  ];
  const ceilingSpots = [];
  const spotBases = [];
  const ceilingFixtures = [];
  for (const cfg of spotConfigs) {
    const spot = new THREE.SpotLight(0xfff0d0, cfg.intensity, 7, 0.6, 0.4, 1.6);
    spot.position.set(...cfg.pos);
    scene.add(spot);
    spot.target.position.set(...cfg.target);
    scene.add(spot.target);
    ceilingSpots.push(spot);
    spotBases.push({ color: new THREE.Color(0xfff0d0), intensity: cfg.intensity });

    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.12, 16),
      stdMat(0x1a1a1a, 0.6, 0.3)
    );
    housing.position.set(cfg.pos[0], 2.94, cfg.pos[2]);
    scene.add(housing);
    const bulb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffcc66, emissiveIntensity: 1.3 })
    );
    bulb.position.set(cfg.pos[0], 2.87, cfg.pos[2]);
    scene.add(bulb);
    ceilingFixtures.push(housing, bulb);
  }

  // Display lighting — warm accent spots so the item shelf and hanger rail read
  // clearly against the otherwise dim room.
  const displayFixtures = [];

  const shelfLight = new THREE.SpotLight(0xffcc88, 6, 6, 0.6, 0.5, 1.5);
  shelfLight.position.set(-1.8, 2.9, -0.75);
  scene.add(shelfLight);
  shelfLight.target.position.set(-2.75, 1.0, -0.75);
  scene.add(shelfLight.target);
  const shelfLightBase = { color: new THREE.Color(0xffcc88), intensity: 6 };
  const shelfFixture = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.1, 12),
    stdMat(0x1a1a1a, 0.6, 0.3)
  );
  shelfFixture.position.set(-1.8, 2.93, -0.75);
  scene.add(shelfFixture);
  displayFixtures.push(shelfFixture);

  const railLights = [];
  const railLightBases = [];
  const railConfigs = [
    { pos: [-1.0, 2.9, 1.8], target: [-1.0, 1.9, 2.9] },
    { pos: [1.0, 2.9, 1.8], target: [1.0, 1.9, 2.9] }
  ];
  for (const cfg of railConfigs) {
    const railLight = new THREE.SpotLight(0xffcc88, 5, 6, 0.7, 0.5, 1.5);
    railLight.position.set(...cfg.pos);
    scene.add(railLight);
    railLight.target.position.set(...cfg.target);
    scene.add(railLight.target);
    railLights.push(railLight);
    railLightBases.push({ color: new THREE.Color(0xffcc88), intensity: 5 });

    const railFixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.09, 12),
      stdMat(0x1a1a1a, 0.6, 0.3)
    );
    railFixture.position.set(cfg.pos[0], cfg.pos[1] + 0.03, cfg.pos[2]);
    scene.add(railFixture);
    displayFixtures.push(railFixture);
  }

  // HELL 9000・警備員・コレクションボードを照らすアクセント照明
  const accentConfigs = [
    { pos: [2.5, 2.9, -1.0], target: [2.5, 0.9, -1.5] },   // HELL 9000
    { pos: [1.8, 2.9, 1.6], target: [2.5, 1.0, 2.3] },     // 警備員
    { pos: [1.5, 2.9, -2.0], target: [1.5, 1.6, -2.92] },  // コレクションボード
  ];
  for (const cfg of accentConfigs) {
    const accentLight = new THREE.SpotLight(0xffcc88, 5, 7, 0.55, 0.5, 1.5);
    accentLight.position.set(...cfg.pos);
    scene.add(accentLight);
    accentLight.target.position.set(...cfg.target);
    scene.add(accentLight.target);
    railLights.push(accentLight); // 進行時の色変化・屋根オープン処理は既存レール灯と同じ扱い
    railLightBases.push({ color: new THREE.Color(0xffcc88), intensity: 5 });

    const accentFixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.09, 12),
      stdMat(0x1a1a1a, 0.6, 0.3)
    );
    accentFixture.position.set(cfg.pos[0], cfg.pos[1] + 0.03, cfg.pos[2]);
    scene.add(accentFixture);
    displayFixtures.push(accentFixture);
  }

  // Escalation target colors
  const sunsetColor = new THREE.Color(0xff2f6d);
  const deskLampHotColor = new THREE.Color(0xff1a66);
  const wallEmissiveHot = new THREE.Color(0x440000);
  const brightWarmColor = new THREE.Color(0xfff2d9);

  // --- Progression state ---
  let progress = 0;

  function setProgress(p) {
    progress = clamp01(p);

    // Ambient: stays dim throughout, tints toward the hot mood
    ambientLight.color.copy(ambientBase.color).lerp(sunsetColor, progress * 0.6);
    ambientLight.intensity = lerp(ambientBase.intensity, ambientBase.intensity * 1.4, progress);

    // Weak fill light nudges toward the hot mood too (barely noticeable)
    directionalLight.color.copy(directionalBase.color).lerp(sunsetColor, progress);

    // Ceiling spotlights: warm white -> hot red, glow intensifies
    for (let i = 0; i < ceilingSpots.length; i++) {
      const spot = ceilingSpots[i];
      const base = spotBases[i];
      spot.color.copy(base.color).lerp(sunsetColor, progress);
      spot.intensity = lerp(base.intensity, base.intensity * 1.6, progress);
    }

    // Desk lamp color shift
    deskLamp.color.copy(deskLampBase.color).lerp(deskLampHotColor, progress);

    // Display accent lights: tint only partly and keep intensity up so the
    // shelf/rail stay legible even as the room escalates
    shelfLight.color.copy(shelfLightBase.color).lerp(sunsetColor, progress * 0.4);
    shelfLight.intensity = lerp(shelfLightBase.intensity, shelfLightBase.intensity * 1.1, progress);
    for (let i = 0; i < railLights.length; i++) {
      const rl = railLights[i];
      const base = railLightBases[i];
      rl.color.copy(base.color).lerp(sunsetColor, progress * 0.4);
      rl.intensity = lerp(base.intensity, base.intensity * 1.1, progress);
    }

    // Clutter chaos: wilder tilt, and levitation from p >= 0.5
    const tiltAmount = progress * Math.PI * 1.4;
    const liftT = smoothstep(0.5, 1.0, progress);
    const maxLift = 1.3;
    for (const item of clutterItems) {
      item.mesh.rotation.x = item.baseRot.x + item.tiltSeed.x * tiltAmount;
      item.mesh.rotation.y = item.baseRot.y + item.tiltSeed.y * tiltAmount;
      item.mesh.rotation.z = item.baseRot.z + item.tiltSeed.z * tiltAmount;
      item.restY = item.basePos.y + liftT * maxLift;
      item.mesh.position.x = item.basePos.x;
      item.mesh.position.y = item.restY;
      item.mesh.position.z = item.basePos.z;
      item.levitating = progress >= 0.5;
    }

    // Walls: faint red emissive tint from p >= 0.8
    const wallHeat = smoothstep(0.8, 1.0, progress);
    wallMat.emissive.copy(wallEmissiveHot).multiplyScalar(wallHeat * 0.5);

    // Poster flips upside down from p >= 0.8
    const flipT = smoothstep(0.8, 0.95, progress);
    poster.rotation.z = posterBaseRotZ + Math.PI * flipT;
  }

  // --- Roof opening (rocket-launch ending) ---
  let roofOpening = false;
  let roofOpenStartT = null;
  const roofOpenDuration = 1.0;
  let roofSnapshotAmbientColor = null;
  let roofSnapshotDirectionalColor = null;
  let roofSnapshotDeskLampColor = null;
  let roofSnapshotAmbientIntensity = 0;
  let roofSnapshotDirectionalIntensity = 0;

  function openRoof() {
    ceiling.visible = false;
    // Ceiling fixtures/spotlights go with the ceiling; bright ambient/sun takes over
    for (const fx of ceilingFixtures) fx.visible = false;
    for (const spot of ceilingSpots) spot.visible = false;
    for (const fx of displayFixtures) fx.visible = false;

    roofOpening = true;
    roofOpenStartT = null;
    roofSnapshotAmbientColor = ambientLight.color.clone();
    roofSnapshotDirectionalColor = directionalLight.color.clone();
    roofSnapshotDeskLampColor = deskLamp.color.clone();
    roofSnapshotAmbientIntensity = ambientLight.intensity;
    roofSnapshotDirectionalIntensity = directionalLight.intensity;
  }

  // --- フィーバータイム: 天井から回転するカラースポット(ミラーボール風) ---
  const feverLights = [];
  {
    const colors = [0xff3377, 0x33ccff, 0xffee44];
    for (let i = 0; i < colors.length; i++) {
      const sp = new THREE.SpotLight(colors[i], 25, 12, 0.5, 0.55, 1.2);
      sp.position.set(0, 2.95, 0);
      const target = new THREE.Object3D();
      scene.add(target);
      sp.target = target;
      sp.visible = false;
      scene.add(sp);
      feverLights.push({ light: sp, target, phase: (i * Math.PI * 2) / colors.length });
    }
  }
  let feverOn = false;
  function setFever(on) {
    feverOn = on;
    for (const f of feverLights) f.light.visible = on;
    if (!on) {
      // キャリーちゃんのダンスを終了してIdleへ戻す
      guardDanceT = 0;
      if (guardActions) switchGuardAction(guardActions.idle);
      guardGroup.position.y = 0;
      guardGroup.rotation.y = guardBaseYaw;
    }
  }

  // --- Reaction system: quick feedback animations for clickable props ---
  function makeBounceState(meshes) {
    return {
      active: false,
      startT: null,
      duration: 0.3,
      targets: meshes.map((mesh) => ({
        mesh,
        basePos: mesh.position.clone(),
        baseScale: mesh.scale.clone()
      }))
    };
  }

  function updateBounce(state, t) {
    if (!state.active) return;
    if (state.startT === null) state.startT = t;
    const u = clamp01((t - state.startT) / state.duration);
    const hop = Math.sin(Math.PI * u);
    const squash = Math.sin(Math.PI * 2 * u);
    const scaleY = 1 + squash * 0.25;
    const scaleXZ = 1 - squash * 0.15;
    for (const tgt of state.targets) {
      tgt.mesh.position.set(tgt.basePos.x, tgt.basePos.y + hop * 0.14, tgt.basePos.z);
      tgt.mesh.scale.set(tgt.baseScale.x * scaleXZ, tgt.baseScale.y * scaleY, tgt.baseScale.z * scaleXZ);
    }
    if (u >= 1) {
      state.active = false;
      for (const tgt of state.targets) {
        tgt.mesh.position.copy(tgt.basePos);
        tgt.mesh.scale.copy(tgt.baseScale);
      }
    }
  }

  const bounceStates = {
    boxes: makeBounceState([boxGroup]),
    trash: makeBounceState([trashGroup]),
    locker: makeBounceState([lockerGroup]),
    fridge: makeBounceState([fridgeGroup]),
    copier: makeBounceState([copierGroup]),
    cooler: makeBounceState([coolerGroup]),
    safe: makeBounceState([safeGroup]),
    fan: makeBounceState([fanGroup]),
    umbrella: makeBounceState([umbrellaGroup]),
    dartboard: makeBounceState([dartboardGroup]),
    hell: makeBounceState([hellGroup]),
    plant: makeBounceState([plantGroup]),
    muscle: makeBounceState([guardGroup]),
    player: makeBounceState([playerGroupRef]),
    records: makeBounceState([pileGroupRef]),
    musicposter: makeBounceState([musicPosterGroupRef])
  };

  const fanBoostState = { active: false, startT: null, duration: 1.0 };

  function updateFan(t) {
    let freq = 0.5;
    if (fanBoostState.active) {
      if (fanBoostState.startT === null) fanBoostState.startT = t;
      const u = clamp01((t - fanBoostState.startT) / fanBoostState.duration);
      freq = lerp(3.5, 0.5, u);
      if (u >= 1) fanBoostState.active = false;
    }
    fanHead.rotation.y = Math.sin(t * freq) * 0.6;
  }

  // Record player platter: spins continuously, with a faster decaying burst on react
  const platterBaseSpeed = 1.1;
  function updatePlayer(t, dt) {
    recordPlatter.rotation.y += dt * platterBaseSpeed;
    if (playerSpinBurst.active) {
      if (playerSpinBurst.startT === null) playerSpinBurst.startT = t;
      const u = clamp01((t - playerSpinBurst.startT) / playerSpinBurst.duration);
      const extra = (1 - u) * 20;
      recordPlatter.rotation.y += extra * dt;
      if (u >= 1) playerSpinBurst.active = false;
    }
  }

  function react(clickId) {
    if (clickId === "fan") {
      fanBoostState.active = true;
      fanBoostState.startT = null;
    }
    if (clickId === "player") {
      playerSpinBurst.active = true;
      playerSpinBurst.startT = null;
    }
    const state = bounceStates[clickId];
    if (state) {
      state.active = true;
      state.startT = null;
    }
  }

  function update(t, dt) {
    if (roofOpening) {
      if (roofOpenStartT === null) roofOpenStartT = t;
      const rp = clamp01((t - roofOpenStartT) / roofOpenDuration);
      ambientLight.color.copy(roofSnapshotAmbientColor).lerp(brightWarmColor, rp);
      ambientLight.intensity = lerp(roofSnapshotAmbientIntensity, 1.1, rp);
      directionalLight.color.copy(roofSnapshotDirectionalColor).lerp(brightWarmColor, rp);
      directionalLight.intensity = lerp(roofSnapshotDirectionalIntensity, 1.3, rp);
      deskLamp.color.copy(roofSnapshotDeskLampColor).lerp(brightWarmColor, rp);
      if (rp >= 1) roofOpening = false;
    }

    updateFan(t);
    updateMixers(dt);
    if (guardMixer) guardMixer.update(dt);
    // フィーバー中のキャリーちゃん: 左右パンチ交互+弾み+体振り=モンキーダンス
    if (feverOn && guardActions) {
      guardDanceT += dt;
      switchGuardAction(
        Math.floor(guardDanceT / 0.4) % 2 ? guardActions.punchL : guardActions.punchR
      );
      guardGroup.position.y = Math.abs(Math.sin(guardDanceT * 6)) * 0.14;
      guardGroup.rotation.y = guardBaseYaw + Math.sin(guardDanceT * 3.2) * 0.5;
    }
    updatePlayer(t, dt);
    if (feverOn) {
      for (const f of feverLights) {
        const a = t * 2.2 + f.phase;
        f.target.position.set(Math.cos(a) * 2.4, 0.4, Math.sin(a) * 2.4);
      }
    }
    for (const key in bounceStates) updateBounce(bounceStates[key], t);

    if (progress < 0.5) return;

    const shakeOn = progress >= 0.85;
    const bobAmp = lerp(0.03, 0.09, smoothstep(0.5, 1.0, progress));
    const shakeAmp = shakeOn ? lerp(0.0, 0.12, smoothstep(0.85, 1.0, progress)) : 0;

    for (const item of clutterItems) {
      if (!item.levitating) continue;
      const bob = Math.sin(t * 1.6 + item.phase) * bobAmp;
      item.mesh.position.y = item.restY + bob;
      item.mesh.rotation.y += item.spinSeed * dt;
      if (shakeOn) {
        item.mesh.position.x = item.basePos.x + Math.sin(t * 7 + item.phase) * shakeAmp;
        item.mesh.position.z = item.basePos.z + Math.cos(t * 6.3 + item.phase * 1.3) * shakeAmp;
      }
    }
  }

  setProgress(0);

  return {
    setProgress, openRoof, update, clickables, react, setFever,
    // 写真モード用: キャリーちゃん/HELL 9000の実体(相棒として一時的に借りて戻す)
    photoActors: { get guard() { return guardGroup; }, get hell() { return hellGroup; } },
  };
}
