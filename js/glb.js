import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// GLBモデルの読み込み・正規化・再着色ユーティリティ
// 配色方針: 家具・小物はモノクロ(白/グレー/黒)+赤の差し色。バゲット/ラバーダックは元色のまま

const loader = new GLTFLoader();
const gltfCache = new Map(); // url -> Promise<gltf>

function loadGLTF(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(
      url,
      new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))
    );
  }
  return gltfCache.get(url);
}

// マテリアルを複製してから色をいじる(GLTF内で共有されているため)
function cloneMaterials(root) {
  const seen = new Map();
  root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const cloned = mats.map((m) => {
        if (!seen.has(m)) seen.set(m, m.clone());
        return seen.get(m);
      });
      obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    }
  });
}

// モノクロ化: 各マテリアルの色を輝度ベースのグレーに。
// accent="red" なら彩度が最も高いマテリアル1つを赤に、"gold"なら全体を金色に
const RED = new THREE.Color(0xc0392b);
const GOLD = new THREE.Color(0xd4af37);
export function applyPalette(root, mode) {
  if (!mode || mode === "keep") return;
  cloneMaterials(root);
  const mats = new Set();
  root.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      const arr = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of arr) if (m.color) mats.add(m);
    }
  });
  if (mode === "gold") {
    for (const m of mats) {
      m.color.copy(GOLD);
      m.metalness = 0.75;
      m.roughness = 0.3;
      m.emissive = new THREE.Color(0x996f1f);
      m.emissiveIntensity = 0.18;
    }
    return;
  }
  // mono / mono-red
  let accentMat = null;
  let bestSat = 0;
  const hsl = {};
  for (const m of mats) {
    m.color.getHSL(hsl);
    if (hsl.s > bestSat) {
      bestSat = hsl.s;
      accentMat = m;
    }
  }
  for (const m of mats) {
    if (mode === "mono-red" && m === accentMat && bestSat > 0.15) {
      m.color.copy(RED);
    } else {
      m.color.getHSL(hsl);
      // 輝度は保ちつつ彩度を落とす(真っ黒潰れ防止に下駄)
      const l = Math.min(0.92, Math.max(0.1, hsl.l));
      m.color.setHSL(0, 0, l);
    }
  }
}

// GLBを読み込んで正規化したGroupを返す(即座に空のGroupを返し、読み込み後に中身が入る)
// opts: { targetHeight or targetWidth (m), rotationY, palette: "mono"|"mono-red"|"gold"|"keep",
//         clone: 複数回使う場合true, onReady(group, size) }
export function glbProp(url, opts = {}) {
  const group = new THREE.Group();
  loadGLTF(url)
    .then((gltf) => {
      const model = opts.clone ? gltf.scene.clone(true) : gltf.scene;
      applyPalette(model, opts.palette);
      // バウンディングボックスでスケール正規化+接地(足元をy=0に)
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      let scale = 1;
      if (opts.targetHeight) scale = opts.targetHeight / (size.y || 1);
      else if (opts.targetWidth) scale = opts.targetWidth / (size.x || 1);
      model.scale.setScalar(scale);
      const box2 = new THREE.Box3().setFromObject(model);
      const center = box2.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box2.min.y; // 接地
      if (opts.rotationY) group.rotation.y = opts.rotationY;
      group.add(model);
      if (opts.onReady) opts.onReady(group, box2.getSize(new THREE.Vector3()));
    })
    .catch((err) => console.error("GLB load failed:", url, err));
  return group;
}

// アニメーション付きモデル用(警備員Soldier等): ミキサーを登録して毎フレーム進める
const mixers = [];
export function playClip(gltf, model, clipName) {
  if (!gltf.animations || gltf.animations.length === 0) return null;
  const mixer = new THREE.AnimationMixer(model);
  const clip =
    gltf.animations.find((c) => c.name.toLowerCase().includes(clipName.toLowerCase())) ||
    gltf.animations[0];
  mixer.clipAction(clip).play();
  mixers.push(mixer);
  return mixer;
}
export function loadGLTFRaw(url) {
  return loadGLTF(url);
}
export function updateMixers(dt) {
  for (const m of mixers) m.update(dt);
}
