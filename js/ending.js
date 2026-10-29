import * as THREE from "three";
import { createOjisan } from "./ojisan.js";
import { createHoshi } from "./hoshi.js";

// エンディング分岐の演出セット
// 到着先: cloud(雲の上)/ moon(月面)/ butt(おしり星+おじさん星人)/ star(素手・星になる)
// 重ねがけ: クマ護衛(撫で1000)/ 星の仲間10体(星1000)

export const PLATFORM_TOP_Y = 60; // 到着面の高さ(おじさんの着地y)

// おじさん星人の緑肌化: 服・髪はそのまま、肌色のマテリアルだけ緑に差し替える。
// setProgressが顔色をlerpで戻すことがあるため、戻り値のマテリアル一覧を毎フレーム上書きすること。
// (エンディングと、おしり星人戦の乱入/勝敗演出の両方から使う)
export const ALIEN_GREEN = new THREE.Color(0x5cb86e);
const ALIEN_SKIN_REF = new THREE.Color(0xe0a978);
export function greenifySkin(api) {
  const mats = [];
  api.group.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.color) {
      const c = o.material.color;
      if (
        Math.abs(c.r - ALIEN_SKIN_REF.r) < 0.08 &&
        Math.abs(c.g - ALIEN_SKIN_REF.g) < 0.08 &&
        Math.abs(c.b - ALIEN_SKIN_REF.b) < 0.08 &&
        !mats.includes(o.material)
      ) {
        mats.push(o.material);
      }
    }
  });
  for (const m of mats) m.color.copy(ALIEN_GREEN);
  return mats;
}

export function createEndingFx(scene) {
  let destGroup = null;
  let clouds = null;
  const aliens = []; // おじさん星人(本体と同モデルの色替え)
  const starClones = []; // 色違いの星の仲間
  let bigStar = null; // 素手エンド: おじさんが星になる

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

  function buildClouds() {
    clouds = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.7, 10, 8), cloudMat);
        s.position.set((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.6);
        s.scale.y = 0.55;
        c.add(s);
      }
      c.position.set((Math.random() - 0.5) * 34, 14 + Math.random() * 34, (Math.random() - 0.5) * 34);
      clouds.add(c);
    }
    scene.add(clouds);
  }

  function buildDest(dest) {
    destGroup = new THREE.Group();
    if (dest === "cloud") {
      // 巨大な雲の足場
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = i < 8 ? 2.6 : 1.1;
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random() * 0.6, 12, 10), cloudMat);
        s.position.set(Math.cos(a) * r, -0.9 - Math.random() * 0.4, Math.sin(a) * r);
        s.scale.y = 0.6;
        destGroup.add(s);
      }
      destGroup.position.y = PLATFORM_TOP_Y - 0.1;
    } else if (dest === "moon") {
      const rock = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.95 });
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.5, 1.4, 28), rock);
      disk.position.y = -0.7;
      destGroup.add(disk);
      const craterMat = new THREE.MeshStandardMaterial({ color: 0x707078, roughness: 0.95 });
      for (let i = 0; i < 7; i++) {
        const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + Math.random() * 0.7, 0.7 + Math.random() * 0.7, 0.12, 16), craterMat);
        const a = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random() * 4.2;
        cr.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
        destGroup.add(cr);
      }
      // 地球が遠くに見える
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0x3d7edb, emissive: 0x18365f, emissiveIntensity: 0.6 })
      );
      earth.position.set(-9, 8, -14);
      destGroup.add(earth);
      destGroup.position.y = PLATFORM_TOP_Y;
    } else if (dest === "butt") {
      // おしり星: 地平線の見えない広大な土の大地(地球のような惑星の地表)+青空に雲
      const soil = new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.95 });
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 2, 48), soil);
      disk.position.y = -1.0;
      destGroup.add(disk);
      const craterMat = new THREE.MeshStandardMaterial({ color: 0x6d5138, roughness: 0.95 });
      for (let i = 0; i < 24; i++) {
        const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.6 + Math.random() * 1.2, 0.9 + Math.random() * 1.4, 0.12, 16), craterMat);
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 30;
        cr.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
        destGroup.add(cr);
      }
      // 青空に浮かぶ雲(地表の上空)
      for (let i = 0; i < 16; i++) {
        const c = new THREE.Group();
        for (let j = 0; j < 4; j++) {
          const cs = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 1.0, 10, 8), cloudMat);
          cs.position.set((Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2.2);
          cs.scale.y = 0.5;
          c.add(cs);
        }
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 35;
        c.position.set(Math.cos(a) * r, 6 + Math.random() * 12, Math.sin(a) * r);
        destGroup.add(c);
      }
      destGroup.position.y = PLATFORM_TOP_Y;
    }
    if (destGroup) scene.add(destGroup);
  }

  // おじさん星人(おしり星のみ)10人。土の大地のあちこちに立って歩き回っている
  function buildAliens() {
    const spots = [
      [7.0, 3.0], [-7.0, 2.5], [3.0, 9.0], [-4.0, 8.0], [0.5, 11.0],
      [8.0, -2.0], [-8.0, -2.0], [2.5, -7.0], [-3.0, -7.5], [5.0, 6.0],
    ];
    for (const [x, z] of spots) {
      const api = createOjisan(scene);
      const skinMats = greenifySkin(api);
      scene.remove(api.group);
      destGroup.add(api.group);
      api.group.position.set(x, 0, z);
      api.group.rotation.y = Math.random() * Math.PI * 2;
      api.group.scale.setScalar(0.9);
      api.setProgress(0.05 + Math.random() * 0.05); // 立ち上がって歩き回る進行度
      aliens.push({ api, skinMats });
    }
  }

  // 色違いの星の仲間たち(星1000達成の重ねがけ)
  function buildStarClones() {
    for (let i = 0; i < 10; i++) {
      const api = createHoshi();
      const hueShift = (i + 1) / 11;
      api.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) {
          const m = o.material.clone();
          m.color.offsetHSL(hueShift, 0, 0);
          if (m.emissive) m.emissive.offsetHSL(hueShift, 0, 0);
          o.material = m;
        }
      });
      api.group.scale.setScalar(0.75 + Math.random() * 0.35);
      scene.add(api.group);
      starClones.push({ api, angle: (i / 10) * Math.PI * 2, radius: 1.6 + (i % 3) * 0.45, h: -0.6 + (i % 4) * 0.5 });
    }
  }

  // 素手エンド: おじさんの位置に大きな星が生まれる(色はおじさんの肌色)
  function buildBigStar(pos) {
    bigStar = createHoshi();
    const skin = new THREE.Color(0xe0a978);
    const hsl = {};
    bigStar.group.traverse((o) => {
      if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.color) {
        const m = o.material.clone();
        m.color.getHSL(hsl);
        if (hsl.l > 0.25) m.color.copy(skin); // 目などの暗い部分はそのまま
        if (m.emissive) {
          m.emissive.copy(skin);
          m.emissiveIntensity = 0.3;
        }
        o.material = m;
      }
    });
    bigStar.group.scale.setScalar(4);
    bigStar.group.position.copy(pos);
    scene.add(bigStar.group);
    return bigStar;
  }

  function begin(dest, opts) {
    buildClouds();
    if (dest !== "star") buildDest(dest);
    if (dest === "butt") buildAliens();
    // 星の仲間たちは到着後(結果画面・エンディング曲のタイミング)にshowStarFriends()で登場
  }

  // 毎フレーム: 護衛の追従・星人と星のアニメ
  const _v = new THREE.Vector3();
  function update(t, dt, ojisanPos) {
    for (const a of aliens) {
      a.api.update(t, dt);
      for (const m of a.skinMats) m.color.copy(ALIEN_GREEN);
    }
    for (const s of starClones) {
      s.angle += dt * 0.9;
      s.api.group.position.set(
        ojisanPos.x + Math.cos(s.angle) * s.radius,
        ojisanPos.y + s.h + Math.sin(t * 2 + s.angle) * 0.2,
        ojisanPos.z + Math.sin(s.angle) * s.radius
      );
      s.api.update(t, dt);
    }
    if (bigStar) {
      bigStar.update(t, dt);
      bigStar.group.rotation.y += dt * 0.6;
    }
  }

  return {
    begin,
    update,
    buildBigStar,
    showStarFriends: buildStarClones,
    get hasAliens() { return aliens.length > 0; },
  };
}
