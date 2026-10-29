import * as THREE from "three";
import { buildWeaponModel } from "./items.js";

// 叩いた瞬間に、装備中のアイテム(素手なら手)がお尻へスイングする演出
export function createSlapper(scene) {
  const cache = {}; // id -> THREE.Group(使い回し)

  function buildHand() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.7 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.2), skin);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.09, 3, 6), skin);
      f.rotation.x = Math.PI / 2;
      f.position.set(-0.06 + i * 0.04, 0, 0.14);
      g.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.06, 3, 6), skin);
    thumb.rotation.z = Math.PI / 2.5;
    thumb.position.set(0.1, 0, 0.02);
    g.add(thumb);
    return g;
  }

  function getModel(id) {
    if (!cache[id]) {
      const model = id === "hand" ? buildHand() : (buildWeaponModel(id) || buildHand());
      model.visible = false;
      model.traverse((o) => { if (o.isMesh) o.raycast = () => {}; }); // クリック判定に乗せない
      scene.add(model);
      cache[id] = model;
    }
    return cache[id];
  }

  let active = null; // { model, from, to, dir, t, dur, hold, mode }

  function swing(id, hitPoint, cameraPos) {
    if (active) active.model.visible = false;
    const model = getModel(id);
    // カメラ側から尻に向かって振り抜く
    const dir = hitPoint.clone().sub(cameraPos).setY(0).normalize();
    const from = hitPoint.clone().sub(dir.clone().multiplyScalar(0.75));
    from.y += 0.45;
    model.position.copy(from);
    model.visible = true;
    // 進行方向を向かせて少し振りかぶる
    model.lookAt(hitPoint);
    model.rotateX(-0.9);
    active = { model, from, to: hitPoint.clone(), dir, t: 0, dur: 0.13, hold: 0.16, mode: "swing" };
  }

  // 撫でる: 装備に関係なく手が出てきて、対象の頭上を左右にさすさすする
  function pet(hitPoint) {
    if (active) active.model.visible = false;
    const model = getModel("hand");
    const base = hitPoint.clone();
    base.y += 0.12;
    model.position.copy(base);
    model.rotation.set(-0.5, 0, 0);
    model.visible = true;
    active = { model, base, t: 0, dur: 1.1, mode: "pet" };
  }

  function update(t, dt) {
    if (!active) return;
    active.t += dt;
    const a = active;
    if (a.mode === "pet") {
      if (a.t >= a.dur) {
        a.model.visible = false;
        active = null;
        return;
      }
      // 左右にさすさす+軽い上下
      a.model.position.copy(a.base);
      a.model.position.x += Math.sin(a.t * 14) * 0.12;
      a.model.position.y += Math.abs(Math.sin(a.t * 14)) * 0.02;
      a.model.rotation.z = Math.sin(a.t * 14) * 0.25;
      return;
    }
    if (a.t <= a.dur) {
      // スイングイン(加速)
      const p = a.t / a.dur;
      const e = p * p;
      a.model.position.lerpVectors(a.from, a.to, e);
      a.model.rotateX(dt * 9); // 振り下ろし回転
    } else if (a.t <= a.dur + a.hold) {
      // インパクトで一瞬静止(軽く震える)
      const s = 1 + Math.sin(a.t * 90) * 0.04;
      a.model.scale.set(s, s, s);
    } else {
      a.model.visible = false;
      a.model.scale.set(1, 1, 1);
      active = null;
    }
  }

  return { swing, pet, update };
}
