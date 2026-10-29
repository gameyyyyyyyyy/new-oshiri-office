import { storage, readJSON, countMap, count, readCount, normalizeSettings, clearGameData } from "./storage.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createOffice } from "./office.js";
import { createOjisan } from "./ojisan.js";
import { createBGM, TRACKS } from "./bgm.js";
import { SLAP_ITEMS, COSTUMES, createItemManager } from "./items.js";
import { createSlapper } from "./slapper.js";
import { createFPSControls } from "./fpscontrols.js";
import { createAnimal } from "./animal.js";
import { createHoshi, HOSHI_LINES } from "./hoshi.js";
import { maybeSlapVoice, screamVoice, setVoicesEnabled } from "./voices.js";
import { getReply, getSlapLine, getStageLine, getEndingLine, ENDING_TEXTS, getCostumeEndLine } from "./dialog.js";
import { createHellShop } from "./hellshop.js";
import { OPPONENTS } from "./carddata.js";
import * as collection from "./collection.js";
import { createCardBattle } from "./cardbattle.js";
import { createCardRules } from "./cardrules.js";
import { createEndingFx, PLATFORM_TOP_Y, greenifySkin, ALIEN_GREEN } from "./ending.js";
import { createCollectionBoard } from "./board.js";
import { createPhotoMode } from "./photo.js";

const TOTAL_POINTS = 1000000;
// ステージ演出の閾値: 序盤はアイテム出現(3,500/8,000/20,000/100,000)に同期
const STAGE_THRESHOLDS = [0, 3500, 8000, 20000, 100000, 300000, 550000, 800000]; // ステージ0〜7

// ---------- 3D シーン ----------
const app = document.getElementById("app");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a35);
scene.fog = new THREE.Fog(0x2a2a35, 8, 16);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(1.7, 1.6, -2.3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.85, 0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.55;

const fps = createFPSControls(camera, renderer.domElement);
const office = createOffice(scene);
const ojisan = createOjisan(scene);
const items = createItemManager(scene);
const slapper = createSlapper(scene);
const animal = createAnimal(scene);
const hoshi = createHoshi();
hoshi.group.position.set(0.5, 0.745, 0.55); // デスクの天板の上
scene.add(hoshi.group);
const endFx = createEndingFx(scene);
const bgm = createBGM();

// 宇宙(エンディング用の星空)
const starField = (() => {
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 60 + Math.random() * 80;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) + 5;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0 });
  const pts = new THREE.Points(geo, mat);
  pts.visible = false;
  scene.add(pts);
  return pts;
})();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- 吹き出し / トースト ----------
const bubble = document.getElementById("bubble");
const hoshiBubble = document.getElementById("hoshi-bubble");
const carrieBubble = document.getElementById("carrie-bubble");
let bubbleTimer = 0;
let hoshiBubbleTimer = 0;
let carrieBubbleTimer = 0;
// 発言クールダウン: おじさん/キャリーちゃん/星は、前の発言から15タップ以上経たないと
// 次のひとことを言わない(3者それぞれ独立カウンタ)。喋りすぎ防止。
// 解禁告知・ステージ・エンディング等の重要な発言はクールダウンで潰さないが、
// 発言した時刻は記録するので、直後の雑談は自然に後ろへずれる。
const SPEAK_COOLDOWN_TAPS = 15;
let tapCount = 0;
const lastSpeakTap = { ojisan: -999, hoshi: -999, carrie: -999 };
function canSpeak(who) { return tapCount - lastSpeakTap[who] >= SPEAK_COOLDOWN_TAPS; }
function say(text, ms = 5000) {
  lastSpeakTap.ojisan = tapCount;
  bubble.textContent = text;
  bubble.style.display = "block";
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (bubble.style.display = "none"), ms);
  ojisan.startTalk(Math.min(ms, 2200));
}
function sayHoshi(text, ms = 5000) {
  lastSpeakTap.hoshi = tapCount;
  hoshiBubble.textContent = text;
  hoshiBubble.style.display = "block";
  clearTimeout(hoshiBubbleTimer);
  hoshiBubbleTimer = setTimeout(() => (hoshiBubble.style.display = "none"), ms);
}
function sayCarrie(text, ms = 4000) {
  lastSpeakTap.carrie = tapCount;
  carrieBubble.textContent = text;
  carrieBubble.style.display = "block";
  clearTimeout(carrieBubbleTimer);
  carrieBubbleTimer = setTimeout(() => (carrieBubble.style.display = "none"), ms);
}
// 話し手の頭上に吹き出しを置く。画面外や背後のときは画面上部に固定表示
// (FPSで下を向いていてもセリフが読めるように)
const _camDir = new THREE.Vector3();
const _toSpeaker = new THREE.Vector3();
function placeBubble(el, worldPos, pinnedTop) {
  if (el.style.display === "none") return;
  camera.getWorldDirection(_camDir);
  _toSpeaker.copy(worldPos).sub(camera.position);
  const behind = _camDir.dot(_toSpeaker) <= 0.01;
  const p = worldPos.clone().project(camera);
  const x = (p.x * 0.5 + 0.5) * innerWidth;
  const y = (-p.y * 0.5 + 0.5) * innerHeight - 10;
  const off = behind || x < 50 || x > innerWidth - 50 || y < 60 || y > innerHeight - 20;
  el.classList.toggle("pinned", off);
  if (off) {
    el.style.left = "50%";
    el.style.top = pinnedTop + "px";
  } else {
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
}
const _hoshiHead = new THREE.Vector3();
const _carrieHead = new THREE.Vector3(2.5, 1.95, 2.3); // 警備員キャリーちゃんの頭上(固定)
function updateBubblePos() {
  // 画面上部固定(.pinned)の位置はスパンキングポイントのウィンドウや
  // フィーバーバナー(〜160px)と被らない高さまで下げる
  placeBubble(bubble, ojisan.headPos(), 190);
  _hoshiHead.copy(hoshi.group.position);
  _hoshiHead.y += 0.4;
  placeBubble(hoshiBubble, _hoshiHead, 255);
  placeBubble(carrieBubble, _carrieHead, 320);
}
// ---------- 対戦後の寄り演出 ----------
// 対戦画面を閉じたあと、部屋にいる当人をアップで映してひとこと言わせる。
// 専用の画面は作らず、いつもの3D空間のカメラを一時的に借りるだけ。
// おしり星人は部屋にいないので、演出の間だけ上空に宇宙ステージを仮設して
// エンディングと同じ緑肌のおじさん星人を立たせる
let alienStage = null; // { group, api, skinMats }
function ensureAlienStage() {
  if (alienStage) return alienStage;
  const group = new THREE.Group();
  group.position.set(0, 40, 0); // 部屋のはるか上空。通常カメラからは見えない
  // 星空(内側を向いた黒球+星の点)
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(14, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x04060f, side: THREE.BackSide })
  ));
  const starPos = [];
  for (let i = 0; i < 400; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(7 + Math.random() * 6);
    starPos.push(v.x, v.y, v.z);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07 })));
  // 足場(おじさんの徘徊域 x±1.6 / z-1.9..-0.4 が乗るサイズ・位置)
  const disk = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.5, 0.14, 28),
    new THREE.MeshStandardMaterial({ color: 0x352a5e, emissive: 0x191040, emissiveIntensity: 0.7, roughness: 0.9 })
  );
  disk.position.set(0, -0.07, -1.1);
  group.add(disk);
  // 専用の照明(部屋の照明が届かない)
  const key = new THREE.PointLight(0xffffff, 1.3, 24);
  key.position.set(1.6, 2.6, 1.8);
  group.add(key);
  group.add(new THREE.AmbientLight(0x9aa4ff, 0.55));
  // 本人(エンディングのおじさん星人と同じ作り)
  const api = createOjisan(scene);
  scene.remove(api.group);
  group.add(api.group);
  api.setProgress(0.07); // 立って歩き回る進行度(エンディングの星人と同じ)
  const skinMats = greenifySkin(api);
  group.visible = false;
  scene.add(group);
  alienStage = { group, api, skinMats };
  return alienStage;
}

const CINE_SPOTS = {
  hoshi: () => ({ at: hoshi.group.position.clone().setY(hoshi.group.position.y + 0.11), dist: 0.55 }),
  kuma: () => {
    const s = Math.max(1, animal.group.scale.x);
    return { at: animal.group.position.clone().setY(0.6 * s), dist: 0.9 + s * 0.5 };
  },
  carry: () => ({ at: new THREE.Vector3(2.5, 1.55, 2.3), dist: 1.25 }),
  hell: () => ({ at: new THREE.Vector3(2.45, 1.05, -1.5), dist: 1.15 }),
  // おじさんは歩き回るので、演出の間だけ進行度0にして机の前に座らせる(cinematicFocus内)。
  // 座り位置は固定なので、そこを正面から映せばよい
  // おじさんは歩き回るので毎フレーム追いかける。向きは他のキャラと同じく
  // 「部屋の中心側から映す」に統一(本人の向き基準だと後ろ姿になりやすい)
  // 頭基準だと下半身が切れるので、胴のあたりを狙って少し引きで全身を入れる
  ojisan: () => ({
    at: ojisan.headPos().clone().add(new THREE.Vector3(0, -0.5, 0)),
    dist: 2.6,
    follow: () => ({
      at: ojisan.headPos().clone().add(new THREE.Vector3(0, -0.5, 0)),
      front: ojisan.headPos().clone().setY(0).normalize().negate(),
    }),
  }),
  // 隠しボス: 宇宙ステージを出して、歩き回る星人を正面から追いかける
  oshiriseijin: () => {
    const st = ensureAlienStage();
    st.group.visible = true;
    st.group.updateMatrixWorld(true);
    // 頭より少し下(胴)を狙い、距離をとって全身が入るようにする
    const aim = () => st.api.headPos().clone().add(new THREE.Vector3(0, -0.3, 0));
    // 星人は徘徊して向きが変わるので、固定方向ではなく本人の正面側から追いかける
    const face = () => {
      const yaw = st.api.group.rotation.y;
      return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    };
    return {
      at: aim(),
      dist: 2.4,
      follow: () => ({ at: aim(), front: face() }),
    };
  },
};
// 対戦後のひとこと。win = そのキャラが勝った時 / lose = 負けた時
const CARD_OUTRO = {
  hoshi: {
    name: "星",
    win: ["よえーーー! 机の上から見てても分かるわ、よえー!", "オレに勝てない奴が、おじさんに勝てるわけねーだろ。"],
    lose: ["は? いまのナシ。サイコロが悪い。サイコロが。", "……つよ。ちょっとだけ認めてやる。ちょっとだけな。"],
  },
  kuma: {
    name: "クマ",
    win: ["(勝ち誇ってすごい速さで踊っている)", "(こちらを見ずに、ただ踊り続けている)"],
    lose: ["(負けたのに、なぜか嬉しそうに踊っている)", "(しょんぼりしたあと、また踊りはじめた)"],
  },
  carry: {
    name: "警備員キャリーちゃん",
    win: ["以上。次の巡回に戻ります。", "警備の勝ちです。当然の結果です。"],
    lose: ["……敗北を、報告書に書く必要は、ありますか?", "つよい。今度から あなたを 警戒対象にします。"],
  },
  hell: {
    name: "HELL 9000",
    win: ["……敗北デス。次ハ、パックヲ買ッテカラ来テクダサイ。", "……在庫ハ無限。アナタノ勝機ハ、有限デス。"],
    lose: ["……計算外デス。返金ハ、致シマセン。", "……オメデトウゴザイマス。ソノ調子デ、散財シテクダサイ。"],
  },
  ojisan: {
    name: "おじさん",
    win: ["いやあ、悪いねえ。おじさん、こういうの本気出しちゃうタイプでなあ。", "まだまだ叩き足りんようだな。出直してきなさい。"],
    lose: ["……まいった。おじさんの完敗だ。尻を差し出そう。", "つ、強い……! きみ、うちの部署に来ないか?"],
  },
  // おしり星人はお尻の擬音でしか喋らない
  oshiriseijin: {
    name: "おしり星人",
    win: ["ぷりぷりぃ〜!", "ぶりんっ、ぶりんっ!", "もっちもちぃ。"],
    lose: ["ぺっちん!?", "ぷすぅ……。", "ぷるぷる……ぺたん。"],
  },
};
const cineCaption = document.getElementById("cine-caption");
let cineToken = 0; // 演出の世代番号(重なった時に古い後片付けを無視する)
let cine = null; // { camPos, look } カメラを借りている間だけ入る

/** 部屋の当人にカメラを寄せる。text を省くとセリフ枠は出さない(対戦開始の乱入用) */
function cinematicFocus(who, name, text, ms = 3400, speed = 0.06) {
  return new Promise((resolve) => {
    // おじさんは徘徊するので、演出の間だけ進行度0に落として机の前に座らせる
    const spot = CINE_SPOTS[who] && CINE_SPOTS[who]();
    if (!spot || ending) { resolve(); return; }
    // 既定はキャラから部屋の中心へ向かう方向。その先にカメラを置くと正面から映せる。
    // front 指定があれば、本人の正面を優先する
    const dir = spot.front ? spot.front.clone().normalize() : spot.at.clone().setY(0).normalize().negate();
    const camPos = spot.at.clone().add(dir.clone().multiplyScalar(spot.dist));
    camPos.y = spot.at.y + 0.16;
    const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), target: controls.target.clone() };
    // いきなり切り替えず、少し引いた位置から寄っていく
    camera.position.copy(camPos.clone().add(dir.clone().multiplyScalar(0.7)).setY(camPos.y + 0.28));
    const token = ++cineToken; // 後から呼ばれた演出が古い後片付けに壊されないように
    // おじさんは進行度に応じて巨大化し、机まわりの被写体に被る。主役でない間は隠す
    const hideOjisan = who !== "ojisan";
    if (hideOjisan) ojisan.group.visible = false;
    cine = { camPos, look: spot.at.clone(), speed, follow: spot.follow, dist: spot.dist };
    document.body.classList.add("cine-on");

    if (text) {
      cineCaption.innerHTML = `<b>${name}</b>${text}`;
      cineCaption.classList.add("show");
    }
    setTimeout(() => {
      if (token !== cineToken) { if (hideOjisan) ojisan.group.visible = true; resolve(); return; }
      cineCaption.classList.remove("show");
      document.body.classList.remove("cine-on");
      if (hideOjisan) ojisan.group.visible = true;
      if (who === "oshiriseijin" && alienStage) alienStage.group.visible = false; // 宇宙ステージを片付ける
      cine = null;
      camera.position.copy(saved.pos);
      camera.quaternion.copy(saved.quat);
      controls.target.copy(saved.target);
      resolve();
    }, ms);
  });
}

/**
 * 対戦開始の乱入演出。カード絵ではなく、部屋にいる本人を3Dで寄って映し、
 * その上に名前と BATTLE START を叩きつける。
 */
function cinematicIntro(who, label) {
  const box = document.createElement("div");
  box.className = "bt-intro";
  box.innerHTML =
    `<div class="band b1"></div><div class="band b2"></div><div class="who">${label}</div>`;
  document.body.appendChild(box);
  playCardSfx("vs");
  setTimeout(() => {
    box.insertAdjacentHTML("beforeend", `<div class="shock"></div><div class="vs">BATTLE START</div>`);
    playCardSfx("slam");
  }, 700);
  setTimeout(() => box.classList.add("out"), 1900);
  setTimeout(() => box.remove(), 2260);
  return cinematicFocus(who, null, null, 2260, 0.2); // 文字が出るまでに寄り切る速さ
}

const toastArea = document.getElementById("toast-area");
function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastArea.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ---------- 会話 ----------
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
function sendChat() {
  const text = chatInput.value.trim();
  if (!text || ending) return;
  chatInput.value = "";
  say(getReply(text), 7000);
}
chatSend.addEventListener("click", sendChat);
// Enter送信はしない(漢字変換の確定Enterで誤送信するため、送信は送信ボタンのみ)
chatInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
});

// ---------- 効果音 ----------
// iOS: マナーモード中でもWebAudioを再生する(Safari 16.4+)
try {
  // Respect the device audio policy; do not force playback through silent mode.
} catch (_) { /* 非対応環境は無視 */ }

let audioCtx = null;
let sfxGain = null; // 効果音の音量設定用マスターゲイン
function ctx() {
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (!sfxGain) {
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = settings.sfx;
    sfxGain.connect(audioCtx.destination);
  }
  return audioCtx;
}
function sfxOut(ac) {
  return sfxGain || ac.destination;
}
function noiseBurst(ac, t, { dur = 0.12, freq = 900, q = 0.8, gain = 0.9, type = "bandpass" }) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.03);
  src.connect(f).connect(g).connect(sfxOut(ac));
  src.start(t);
}
function thump(ac, t, { from = 180, to = 60, dur = 0.12, gain = 0.5, type = "sine" }) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.02);
  osc.connect(g).connect(sfxOut(ac));
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
function ding(ac, t, freq, dur = 0.5, gain = 0.25) {
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(sfxOut(ac));
  osc.start(t);
  osc.stop(t + dur);
}
// カードゲームの演出用の効果音(すべてWebAudio合成)
const CARD_SFX = {
  dice(ac, t) { // サイコロが転がる
    for (let i = 0; i < 5; i++)
      noiseBurst(ac, t + i * 0.055, { freq: 2400 + Math.random() * 900, dur: 0.045, gain: 0.35, q: 1.6 });
  },
  land(ac, t) { // 出目が決まる
    thump(ac, t, { from: 420, to: 130, dur: 0.13, gain: 0.5 });
    noiseBurst(ac, t, { freq: 1800, dur: 0.06, gain: 0.5 });
    ding(ac, t + 0.04, 1320, 0.26, 0.16);
  },
  hit(ac, t) { // 被弾
    noiseBurst(ac, t, { freq: 700, dur: 0.16, gain: 1, q: 0.6 });
    thump(ac, t, { from: 260, to: 55, dur: 0.2, gain: 0.7 });
  },
  heal(ac, t) { // 回復
    ding(ac, t, 880, 0.3, 0.16);
    ding(ac, t + 0.07, 1175, 0.34, 0.14);
    ding(ac, t + 0.14, 1568, 0.42, 0.12);
  },
  ko(ac, t) { // 撃破
    thump(ac, t, { from: 200, to: 34, dur: 0.5, gain: 0.85 });
    noiseBurst(ac, t, { freq: 420, dur: 0.4, gain: 0.8, q: 0.4 });
  },
  draw(ac, t) { // ドロー(紙をこする音)
    noiseBurst(ac, t, { freq: 3600, dur: 0.09, gain: 0.35, type: "highpass" });
  },
  event(ac, t) { // イベントカード発動
    noiseBurst(ac, t, { freq: 2200, dur: 0.18, gain: 0.5, type: "highpass" });
    ding(ac, t + 0.05, 1046, 0.4, 0.15);
    ding(ac, t + 0.12, 1568, 0.5, 0.12);
  },
  play(ac, t) { // カードを場に出す
    noiseBurst(ac, t, { freq: 1500, dur: 0.07, gain: 0.4 });
    thump(ac, t, { from: 300, to: 120, dur: 0.09, gain: 0.3 });
  },
  turn(ac, t) { // ターン開始
    ding(ac, t, 660, 0.3, 0.14);
    ding(ac, t + 0.1, 990, 0.4, 0.12);
  },
  win(ac, t) {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => ding(ac, t + i * 0.11, f, 0.6, 0.2));
  },
  lose(ac, t) {
    const notes = [440, 392, 330, 262];
    notes.forEach((f, i) => ding(ac, t + i * 0.14, f, 0.7, 0.18));
  },
  tear(ac, t) { // パックを破く
    noiseBurst(ac, t, { freq: 4200, dur: 0.22, gain: 0.55, type: "highpass" });
    noiseBurst(ac, t + 0.09, { freq: 3000, dur: 0.16, gain: 0.4, type: "highpass" });
    thump(ac, t + 0.02, { from: 220, to: 70, dur: 0.18, gain: 0.4 });
  },
  reveal(ac, t) { // カードが1枚めくれる
    noiseBurst(ac, t, { freq: 2600, dur: 0.07, gain: 0.3, type: "highpass" });
    ding(ac, t + 0.02, 1320, 0.32, 0.1);
  },
  rare(ac, t) { // レアが出た
    const notes = [784, 988, 1319, 1568, 2093];
    notes.forEach((f, i) => ding(ac, t + i * 0.09, f, 0.55, 0.26));
    noiseBurst(ac, t, { freq: 5000, dur: 0.5, gain: 0.25, type: "highpass" });
  },
  vs(ac, t) { // 対戦開始の乱入
    thump(ac, t, { from: 180, to: 40, dur: 0.5, gain: 0.95 });
    noiseBurst(ac, t, { freq: 900, dur: 0.3, gain: 0.7, q: 0.5 });
    ding(ac, t + 0.22, 330, 0.7, 0.3);
    ding(ac, t + 0.34, 494, 0.8, 0.4);
  },
  slam(ac, t) { // 文字が叩きつけられる
    thump(ac, t, { from: 320, to: 45, dur: 0.28, gain: 1 });
    noiseBurst(ac, t, { freq: 1500, dur: 0.12, gain: 0.7 });
  },
};
function playCardSfx(name) {
  const fn = CARD_SFX[name];
  if (!fn) return;
  const ac = ctx();
  fn(ac, ac.currentTime);
}

// アイテムごとの叩き音
const ITEM_SOUNDS = {
  hand(ac, t) { noiseBurst(ac, t, { freq: 900, dur: 0.12 }); thump(ac, t, {}); },
  slipper(ac, t) { noiseBurst(ac, t, { freq: 1500, dur: 0.09, gain: 0.8 }); thump(ac, t, { from: 220, gain: 0.3 }); },
  harisen(ac, t) { noiseBurst(ac, t, { freq: 2600, dur: 0.14, q: 0.5, gain: 1 }); noiseBurst(ac, t + 0.02, { freq: 3400, dur: 0.07, gain: 0.5 }); },
  drum(ac, t) { thump(ac, t, { from: 140, to: 50, dur: 0.28, gain: 0.9 }); noiseBurst(ac, t, { freq: 4000, dur: 0.03, gain: 0.4, type: "highpass" }); },
  pan(ac, t) {
    thump(ac, t, { from: 90, to: 70, dur: 0.2, gain: 0.5 });
    for (const [f, g] of [[820, 0.35], [1230, 0.25], [2070, 0.18], [3300, 0.1]]) {
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f * (0.98 + Math.random() * 0.04);
      const gg = ac.createGain();
      gg.gain.setValueAtTime(g, t);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(gg).connect(sfxOut(ac));
      osc.start(t);
      osc.stop(t + 0.75);
    }
  },
  gold(ac, t) {
    noiseBurst(ac, t, { freq: 1200, dur: 0.1 });
    thump(ac, t, {});
    ding(ac, t + 0.03, 1568, 0.4, 0.18);
    ding(ac, t + 0.09, 2093, 0.5, 0.15);
    ding(ac, t + 0.15, 2637, 0.6, 0.12);
  },
  paper(ac, t) {
    noiseBurst(ac, t, { freq: 1600, dur: 0.11, q: 0.6, gain: 0.85 });
    noiseBurst(ac, t + 0.015, { freq: 700, dur: 0.08, gain: 0.4, type: "lowpass" });
    thump(ac, t, { from: 200, to: 90, dur: 0.08, gain: 0.25 });
  },
  gun(ac, t) {
    // ラタタタッ!と4連射
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.055;
      noiseBurst(ac, tt, { freq: 800, dur: 0.045, q: 0.7, gain: 0.65 });
      thump(ac, tt, { from: 220, to: 70, dur: 0.05, gain: 0.45 });
    }
    noiseBurst(ac, t + 0.23, { freq: 2500, dur: 0.06, gain: 0.25, type: "highpass" });
  },
  baguette(ac, t) {
    // バフッという鈍いパン打撃
    noiseBurst(ac, t, { freq: 500, dur: 0.14, q: 0.5, gain: 0.9, type: "lowpass" });
    noiseBurst(ac, t + 0.02, { freq: 300, dur: 0.1, gain: 0.4, type: "lowpass" });
    thump(ac, t, { from: 150, to: 60, dur: 0.12, gain: 0.5 });
  },
  guitar(ac, t) {
    // ジャーン!というかき鳴らし
    noiseBurst(ac, t, { freq: 3000, dur: 0.04, gain: 0.35, type: "highpass" });
    for (const [i, f] of [82.4, 110, 146.8, 196, 246.9].entries()) {
      const osc = ac.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f * (0.995 + Math.random() * 0.01);
      const g = ac.createGain();
      const tt = t + i * 0.012;
      g.gain.setValueAtTime(0.12, tt);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.9);
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2500, tt);
      lp.frequency.exponentialRampToValueAtTime(500, tt + 0.8);
      osc.connect(lp).connect(g).connect(sfxOut(ac));
      osc.start(tt);
      osc.stop(tt + 0.95);
    }
    thump(ac, t, { from: 120, to: 70, dur: 0.1, gain: 0.3 });
  },
  kasa(ac, t) {
    // ビュッというスイング風切り+ペチッ
    const len = Math.floor(ac.sampleRate * 0.18);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
    bp.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(bp).connect(g).connect(sfxOut(ac));
    src.start(t);
    noiseBurst(ac, t + 0.13, { freq: 1800, dur: 0.06, gain: 0.7 });
  },
  squeak(ac, t) {
    // ラバーダックのキュッキュ
    noiseBurst(ac, t, { freq: 900, dur: 0.05, gain: 0.4 });
    for (const [dt0, f0, f1] of [[0, 2200, 3400], [0.09, 3000, 2000]]) {
      const sq = ac.createOscillator();
      sq.type = "square";
      sq.frequency.setValueAtTime(f0, t + dt0);
      sq.frequency.exponentialRampToValueAtTime(f1, t + dt0 + 0.08);
      const sg = ac.createGain();
      sg.gain.setValueAtTime(0.12, t + dt0);
      sg.gain.exponentialRampToValueAtTime(0.001, t + dt0 + 0.1);
      sq.connect(sg).connect(sfxOut(ac));
      sq.start(t + dt0);
      sq.stop(t + dt0 + 0.12);
    }
  },
  star(ac, t) {
    // キラキラ星アルペジオ+軽い打撃音
    noiseBurst(ac, t, { freq: 1400, dur: 0.08, gain: 0.5 });
    thump(ac, t, { from: 200, to: 80, dur: 0.1, gain: 0.4 });
    ding(ac, t, 1568, 0.3, 0.2);
    ding(ac, t + 0.06, 1975, 0.35, 0.18);
    ding(ac, t + 0.12, 2637, 0.5, 0.15);
    ding(ac, t + 0.18, 3136, 0.6, 0.12);
  },
  paw(ac, t) {
    // もふっとした低音ボヨン+キュッというぬいぐるみの鳴き
    thump(ac, t, { from: 120, to: 45, dur: 0.3, gain: 0.8, type: "triangle" });
    noiseBurst(ac, t, { freq: 500, dur: 0.2, q: 0.5, gain: 0.4, type: "lowpass" });
    const sq = ac.createOscillator();
    sq.type = "sine";
    sq.frequency.setValueAtTime(2400, t + 0.05);
    sq.frequency.exponentialRampToValueAtTime(3200, t + 0.12);
    sq.frequency.exponentialRampToValueAtTime(2000, t + 0.2);
    const sg = ac.createGain();
    sg.gain.setValueAtTime(0.15, t + 0.05);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    sq.connect(sg).connect(sfxOut(ac));
    sq.start(t + 0.05);
    sq.stop(t + 0.25);
  },
};
function playItemSound(soundId) {
  const ac = ctx();
  (ITEM_SOUNDS[soundId] || ITEM_SOUNDS.hand)(ac, ac.currentTime);
}
function playRocketSound() {
  const ac = ctx();
  const t = ac.currentTime;
  const len = Math.floor(ac.sampleRate * 9);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(250, t);
  lp.frequency.linearRampToValueAtTime(1200, t + 2);
  lp.frequency.linearRampToValueAtTime(300, t + 8);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
  src.connect(lp).connect(g).connect(sfxOut(ac));
  src.start(t);
}
function playDropSound() {
  const ac = ctx();
  const t = ac.currentTime;
  ding(ac, t, 880, 0.25, 0.2);
  ding(ac, t + 0.1, 1175, 0.3, 0.2);
}

// ---------- ポイント / 進行管理 ----------
const slapCountEl = document.getElementById("slap-count");
const slapBarFill = document.getElementById("slap-bar-fill");
const equipNameEl = document.getElementById("equip-name");
const equipPtsEl = document.getElementById("equip-pts");
const stageFlash = document.getElementById("stage-flash");

let points = 0;
// 総獲得ポイント: パック購入で減らない累計。アイテム/衣装のポイント解禁はこちらを見る
// (買い物で解禁が後退しないようにする。ステージ進行やエンディングは現在ポイントのまま)
let totalEarned = points;
let slapCount = 0;
let equipped = SLAP_ITEMS[0]; // 素手
let ending = false;
let onlyHandUsed = true; // 素手のみでクリアすると特別エンド

function currentStage(n) {
  let s = 0;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) if (n >= STAGE_THRESHOLDS[i]) s = i;
  return s;
}
let stage = currentStage(points);

// 解禁済みアイテム/衣装を部屋に出す(起動時は即設置、プレイ中は降ってくる)
const dropped = new Set();
function checkUnlocks(announce) {
  for (const it of SLAP_ITEMS) {
    if (it.unlock > 0 && totalEarned >= it.unlock && !dropped.has("item:" + it.id)) {
      dropped.add("item:" + it.id);
      items.spawn("item", it.id);
      if (announce) {
        playDropSound();
        toast(`🎁 ${it.name} が降ってきた!(+${it.points}pt)`);
        say("おっ、なんか降ってきたぞ!?嫌な予感しかせんのう…", 4500);
      }
    }
  }
  for (const c of COSTUMES) {
    if (c.unlock > 0 && totalEarned >= c.unlock && !dropped.has("cos:" + c.id)) {
      dropped.add("cos:" + c.id);
      items.spawn("costume", c.id);
      if (announce) {
        playDropSound();
        toast(`👗 ${c.name} が降ってきた!クリックで着せ替え`);
        say("なんか可愛いのが落ちてきたが…まさかワシが着るんか?", 4500);
      }
    }
  }
}

function applyProgress() {
  const p = Math.min(points / TOTAL_POINTS, 1);
  ojisan.setProgress(p);
  office.setProgress(p);
  animal.setProgress(p);
  hoshi.setProgress(p);
  bgm.setIntensity(p);
  slapCountEl.textContent = points.toLocaleString();
  slapBarFill.style.width = (p * 100) + "%";
}
applyProgress();
checkUnlocks(false);

// HELL 9000のショップ。ポイントを消費してカードパックを買う
// HELLのショップやカード対戦を開いている間は、スマホの仮想スティックを引っこめる
// (画面下のボタンに重なって押せなくなるため)
let stickHidden = false;
function syncStickVisibility() {
  // コレクション/図鑑/設定/ヘルプなどのウィンドウ中も照準とスティックをしまう
  const busy = !!(hellShop.isOpen || cardBattle.isOpen || cardRules.isOpen || overlayOpen() ||
    (typeof photo !== "undefined" && photo.isOpen));
  if (busy === stickHidden) return;
  stickHidden = busy;
  fps.setUiHidden(busy);
  document.body.classList.toggle("overlay-busy", busy); // 照準もしまう
}

const cardRules = createCardRules();
const cardBattle = createCardBattle({
  toast: (t) => toast(t),
  sfx: (name) => playCardSfx(name),
  onBattleStart: () => { endFeverTime(true); bgm.startBattle(); },
  // 対戦が終わったら、部屋の当人をアップで映してひとこと言わせてからショップに戻る
  onFinish: async (winner, key) => {
    bgm.stopBattle();
    const c = CARD_OUTRO[key];
    if (c && winner) {
      const lines = winner === "you" ? c.lose : c.win; // 相手から見た勝敗
      await cinematicFocus(key, c.name, lines[Math.floor(Math.random() * lines.length)]);
    }
    hellShop.show();
  },
  onShowRules: () => cardRules.open(),
  onIntro: (key, label) => cinematicIntro(key, label),
  isSoundOn: () => !soundMuted,
  toggleSound: () => setSoundMuted(!soundMuted),
});
// コレクションボード(本棚スラブの前面に入手カードを描く+クリックで一覧)
const collectionBoard = createCollectionBoard(scene);

const hellShop = createHellShop({
  getPoints: () => points,
  spendPoints: (n) => { points = Math.max(0, points - n); applyProgress(); },
  toast: (t) => toast(t),
  playSfx: () => playDropSound(),
  sfx: (name) => playCardSfx(name),
  onStartBattle: (opponentKey) => cardBattle.start(opponentKey),
  onShowRules: () => cardRules.open(),
});

function flashStage() {
  stageFlash.classList.add("on");
  setTimeout(() => stageFlash.classList.remove("on"), 80);
}

function equip(def) {
  equipped = def;
  items.setEquipped(def.id);
  equipNameEl.textContent = def.name;
  equipPtsEl.textContent = def.points;
  toast(`✋ ${def.name} を装備!(1叩き +${def.points}pt)`);
}

// ---------- 動物(隠し要素) ----------
// 撫で回数はlocalStorageに保存(リロードしても継続)
const PETS_KEY = "oshiri_pets";
let petCount = readCount(PETS_KEY);
function petSound() {
  const ac = ctx();
  const t = ac.currentTime;
  ding(ac, t, 1320, 0.12, 0.15);
  ding(ac, t + 0.08, 1760, 0.15, 0.12);
}
function checkPetUnlocks(announce) {
  if (petCount >= 100 && !dropped.has("cos:bear")) {
    dropped.add("cos:bear");
    items.spawn("costume", "bear");
    if (announce) {
      playDropSound();
      toast("🧸 隠し衣装『クマの着ぐるみ』がハンガーに出現!");
      say("おお!?クマ君とおそろいの服が出てきたぞ!", 5000);
    }
  }
  if (petCount >= 1000 && !dropped.has("cos:gold")) {
    dropped.add("cos:gold");
    dropped.add("item:pawpunch");
    items.spawn("costume", "gold");
    items.spawn("item", "pawpunch");
    if (announce) {
      playDropSound();
      toast("👑 隠し衣装『黄金スーツ』がハンガーに出現!");
      toast("🐾 最強アイテム『もふもふクマパンチ』が棚に出現!(+3000pt)");
      say("な、なんじゃこの黄金のオーラは…!クマ君、おぬし何者じゃ!?", 6000);
    }
  }
}
function onPetAnimal(hitPoint) {
  petCount++;
  storage.setItem(PETS_KEY, petCount);
  bumpTaps();
  animal.pet();
  slapper.pet(hitPoint);
  petSound();
  checkPetUnlocks(true);
  if (petCount % 10 === 0) {
    toast(`🐻 クマ君なでなで ${petCount}回目`);
  }
}
checkPetUnlocks(false); // 保存済みの撫で回数ぶんを起動時に復元

// クマの巨大化: 10回撫でるごとに一段階、1000回で最大(おじさんの約3倍)
const BEAR_MAX_SCALE = 4.4;
const bearHomeStart = new THREE.Vector3(2.2, 0, 0.8);
const bearHomeEnd = new THREE.Vector3(1.5, 0, 1.0); // 大きくなったら壁から離す
function bearTargetScale() {
  const capped = Math.min(Math.floor(petCount / 10) * 10, 1000);
  return 1 + (BEAR_MAX_SCALE - 1) * (capped / 1000);
}
const _bearScaleV = new THREE.Vector3();
const _bearPosV = new THREE.Vector3();
function updateBearGrowth(dt) {
  const s = bearTargetScale();
  const k = 1 - Math.pow(0.05, dt); // なめらかに成長
  animal.group.scale.lerp(_bearScaleV.set(s, s, s), k);
  const g = (s - 1) / (BEAR_MAX_SCALE - 1);
  _bearPosV.lerpVectors(bearHomeStart, bearHomeEnd, g);
  _bearPosV.y = animal.group.position.y;
  animal.group.position.lerp(_bearPosV, k);
}
animal.group.scale.setScalar(bearTargetScale()); // 起動時は即適用

// 素手とスーツも実物として棚/ハンガーに常設(使用中は非表示になる)
items.spawn("item", "hand");
items.spawn("costume", "suit");
items.setEquipped("hand");
items.setWornCostume("suit");

// ---------- 部屋オブジェクトのクリックギミック ----------
const CLICK_UNLOCKS = {
  trash:  { count: 15,  kind: "item",    id: "newspaper",  name: "丸めた新聞紙",
            line: "ゴミ箱から新聞紙!?昭和のしつけ道具じゃないか…" },
  boxes:  { count: 30,  kind: "costume", id: "boxrobo",    name: "段ボールロボ",
            line: "段ボールから服が…ワシ、ロボになるんか?" },
  locker: { count: 15,  kind: "costume", id: "tuxedo",     name: "タキシード",
            line: "ロッカーにタキシード…誰のじゃ?まあ、着るがの。" },
  fridge: { count: 45,  kind: "costume", id: "penguin",    name: "ペンギンの着ぐるみ",
            line: "冷蔵庫からペンギン服…ひんやりしとるのう!" },
  muscle: { count: 120, kind: "item",    id: "machinegun", name: "マシンガン",
            line: "ちょ、キャリーちゃん!?それはやりすぎじゃろ!!" },
  umbrella: { count: 30,  kind: "item",  id: "kasa",       name: "ビニール傘",
            line: "その傘、誰のか知らんが…借りるんかの?ワシを叩くのに?" },
  safe:   { count: 60,  kind: "item",    id: "duck",       name: "金庫のラバーダック",
            line: "き、金庫の中身はアヒルじゃったんか…!ワシも知らんかったわい!" },
  musicposter: { count: 12, kind: "bgm", id: "android",    name: "ぴっちぴち・アンドロイド",
            line: "おっ、このアーティストの曲が聴きたくなってきたのう。" },
  // レコードの山は2段階解禁(配列は多段階解禁として扱われる)。To the zooは星300クリック
  records: [
    { count: 30,  kind: "bgm", id: "gedatsu", name: "解脱",
      line: "このレコード…なんだか心が無になりそうじゃ…。" },
    { count: 70,  kind: "bgm", id: "alice",   name: "Alice fell down",
      line: "ほう、不思議な曲が出てきたのう。誰の落とし物じゃ?" },
  ],
};
// クリック回数を記録する全オブジェクト(ハズレも含む — 宝探し用)
const CLICK_NAMES = {
  trash: "ゴミ箱", boxes: "段ボール", locker: "ロッカー", fridge: "冷蔵庫", muscle: "警備員キャリーちゃん",
  player: "レコードプレイヤー", records: "レコードの山", musicposter: "音楽ポスター",
  copier: "コピー機", cooler: "ウォーターサーバー", safe: "金庫",
  fan: "扇風機", umbrella: "傘", dartboard: "ダーツボード", plant: "観葉植物",
  hell: "HELL 9000",
  hoshi: "星",
  board: "コレクションボード",
};
// BGM管理
function trackTitle(id) {
  const t = TRACKS.find((x) => x.id === id);
  return t ? t.title : id;
}
function availableTracks() {
  const list = ["heya", "sekkai"];
  if (dropped.has("bgm:android")) list.push("android");
  if (dropped.has("bgm:gedatsu")) list.push("gedatsu");
  if (dropped.has("bgm:alice")) list.push("alice");
  if (dropped.has("bgm:zoo")) list.push("zoo");
  return list;
}
function cycleTrack() {
  const avail = availableTracks();
  const cur = bgm.track;
  const idx = avail.indexOf(cur);
  const next = avail[(idx + 1) % avail.length];
  bgm.setTrack(next);
  if (!bgm.playing) bgm.start();
  toast(`♪ ${trackTitle(next)}`);
}
const CLICKS_KEY = "oshiri_clicks";
let clicks = countMap(readJSON(CLICKS_KEY, {}), Object.keys(CLICK_NAMES));
function saveClicks() { storage.setItem(CLICKS_KEY, JSON.stringify(clicks)); }

// 総クリック数(写真モードで表示): オブジェクト+おじさん叩き+星+クマ撫での総累計。
// 初回はこれまでの永続カウンタ(clicks/pets)から概算でシードする
// 累計お尻たたきポイント(写真モード表示用): エンディングのなでなでリセットや
// パック購入の影響を受けず、セッションをまたいで増え続ける
const LIFE_KEY = "oshiri_totalpt";
let lifetimePt = readCount(LIFE_KEY);
// 写真モードのスタンプ用: おじさんを叩いた累計回数と、アイテム別の叩き回数(どちらも永続)
const SLAPS_KEY = "oshiri_slaps";
let lifetimeSlaps = readCount(SLAPS_KEY);
const SLAPITEMS_KEY = "oshiri_slapitems";
let slapItemCounts = countMap(readJSON(SLAPITEMS_KEY, {}), SLAP_ITEMS.map((item) => item.id));

const TAPS_KEY = "oshiri_taps";
let totalTaps = readCount(TAPS_KEY, -1);
if (!(totalTaps >= 0)) {
  totalTaps = Object.values(clicks).reduce((a, b) => a + (+b || 0), 0) + petCount;
}
function bumpTaps() { totalTaps++; storage.setItem(TAPS_KEY, totalTaps); }
function tickSound() {
  const ac = ctx();
  const t = ac.currentTime;
  noiseBurst(ac, t, { freq: 2200, dur: 0.04, gain: 0.3, type: "highpass" });
  thump(ac, t, { from: 320, to: 180, dur: 0.05, gain: 0.2 });
}
function checkClickUnlocks(announce) {
  for (const [cid, cfgOrList] of Object.entries(CLICK_UNLOCKS)) {
    for (const cfg of [].concat(cfgOrList)) {
      const key = (cfg.kind === "item" ? "item:" : cfg.kind === "costume" ? "cos:" : "bgm:") + cfg.id;
      if ((clicks[cid] || 0) >= cfg.count && !dropped.has(key)) {
        dropped.add(key);
        if (cfg.kind === "bgm") {
          if (announce) {
            playDropSound();
            toast(`🎵 新しいBGM『${cfg.name}』を獲得!レコードプレイヤーで切替できます`);
            say(cfg.line, 5500);
          }
        } else {
          items.spawn(cfg.kind, cfg.id);
          if (announce) {
            playDropSound();
            toast(`${cfg.kind === "item" ? "🎁" : "👗"} 隠し${cfg.kind === "item" ? "アイテム" : "衣装"}『${cfg.name}』が出現!`);
            say(cfg.line, 5500);
          }
        }
      }
    }
  }
}
// 警備員キャリーちゃん: クリックの20%で1〜2語の過激なひとことをぼそっと言う
const CARRIE_LINES = [
  "……排除。", "……殲滅。", "……粛清?", "……制圧完了。", "……ロックオン。",
  "……交戦許可を。", "……武力行使。", "……焦土作戦。", "……対象、確認。", "……逃がさない。",
  "……包囲済み。", "……掃討。", "……漏れなく。", "……更地に。", "……跡形もなく。",
  "……容赦不要。", "……慈悲は経費。", "……武器庫、満タン。", "……安全装置?外した。", "……照準、良好。",
  "……火力こそ正義。", "……会話終了。", "……傾聴。のち砲撃。", "……平和(暫定)。", "……敵、未定。",
  "……全方位警戒。", "……瞬殺希望。", "……過剰防衛上等。", "……鎮圧予定。", "……立入、禁止。",
  "……忠告は一度。", "……次は撃つ。", "……もう撃ちたい。", "……指がうずく。", "……嵐、呼ぶ?",
  "……静粛に。永遠に。", "……命拾い。", "……今日は見逃す。", "……燃やす?", "……冷凍も可。",
  "……後始末は任せろ。", "……道具は選ばない。", "……素手でも可。", "……逃走は運動。", "……無駄。全部。",
  "……勝率100%。", "……戦場が呼んでる。", "……給料分は壊す。", "……残業?殲滅する。", "……おじさんは、守る。",
];
// 写真モード(📷ボタン)。対戦/ショップ/エンディング中は開けない
const photo = createPhotoMode({
  scene, camera, renderer, controls,
  ojisan, hoshi, animal, office, items,
  getLifetimePt: () => lifetimePt,
  getSlapStats: () => ({ slaps: lifetimeSlaps, byItem: slapItemCounts }),
  carrieLines: CARRIE_LINES,
  cardOutro: CARD_OUTRO,
  canOpen: () => !!gameMode && !ending && !cine &&
    !cardBattle.isOpen && !hellShop.isOpen && !cardRules.isOpen && !overlayOpen(),
});

function onObjectClick(clickId) {
  clicks[clickId] = (clicks[clickId] || 0) + 1;
  bumpTaps();
  saveClicks();
  office.react(clickId);
  if (clickId === "muscle" && Math.random() < 0.2 && canSpeak("carrie")) {
    sayCarrie(CARRIE_LINES[Math.floor(Math.random() * CARRIE_LINES.length)]);
  }
  if (clickId === "player") {
    // レコードプレイヤーはBGM切替(獲得済みの曲を順番に)
    cycleTrack();
    return;
  }
  if (clickId === "hell") {
    // HELL 9000: カードパックの購入・デッキ構築・対戦のメニュー
    hellShop.show();
    return;
  }
  if (clickId === "board") {
    // コレクションボード: 入手カードの一覧(番号順・未所持は空白)
    collectionBoard.show();
    return;
  }
  tickSound();
  checkClickUnlocks(true);
  const n = clicks[clickId];
  if (n % 10 === 0) {
    toast(`👆 ${CLICK_NAMES[clickId] || clickId}: ${n}回目`);
  }
}
checkClickUnlocks(false); // 保存済みクリック数ぶんを起動時に復元

// ---------- マスコット「星」(デスクの上・隠し要素つき) ----------
// クリック数は clicks.hoshi として oshiri_clicks に永続化。セリフ本体はhoshi.jsのHOSHI_LINES
// ヒント: 対象別の専用の言い回し(必要回数は教えない)
const HINT_LINES = {
  trash: "そこのゴミ箱、もっと叩いてみろよ。なんか出るかもな。",
  boxes: "あの段ボールの山、気にならねえか?オレは気になるね。",
  locker: "ロッカーってのは、しつこく開けたがるやつに応えるもんだぜ。",
  fridge: "あの冷蔵庫、何入ってんだろうな?なあ?",
  muscle: "警備員のキャリーちゃん、しつこくつついたら何かくれそうだぜ。自己責任な。",
  musicposter: "あのポスターのやつの曲、聴きたくなってきただろ?",
  records: "レコードの山ってのは、掘るためにあるんだぜ。",
  umbrella: "壁の傘、突っついてみろよ。雨の日だけの道具じゃねーぜ。",
  safe: "あの金庫、何入ってんだろうな。開けたくならねえか?",
  pet100: "あのクマ、もっとかわいがってやれよ。妬いてねーし。",
  pet1000: "クマを撫で続けたやつだけが見られる景色があるらしいぜ。",
  hoshi300: "オレ様を構い続けたやつには、いい曲を聴かせてやるよ。",
  hoshi500: "オレ様をもっとクリックしろよ。いいことあるぜ、たぶんな。",
  hoshi1000: "オレ様を愛し続けたやつには…最強のご褒美だ。F**k yeah!",
};
// おじさんへの質問ネタ振り(dialog.jsの全キーワードエントリを網羅)
// 「〜について質問」が自然な話題キーワード
const QUESTION_TOPICS = [
  "名前", "仕事", "掃除", "尻", "音楽", "疲れ", "ビール", "家族", "ラーメン",
  "天気", "休み", "上司", "ゴルフ", "野球", "パチンコ", "カラオケ", "若い頃",
  "給料", "結婚", "ダイエット", "健康診断", "腰痛", "スマホ", "星", "宇宙",
  "ロケット", "夢", "好物", "タバコ", "ペット", "老後", "ダジャレ",
  "アヒル", "バゲット", "ギター", "トロフィー", "フィーバー", "椅子",
];
const QUESTION_HINT_TEMPLATES = [
  (t) => `おっさんに「${t}」について質問してみ?たぶん面白いぜ。`,
  (t) => `ヒマなら、おっさんに「${t}」の話でも聞いてやれよ。`,
  (t) => `おっさんな、「${t}」って言われると喋りだすぜ。試してみな。`,
];
// そのまま声をかける形が自然な言葉
const SAY_TOPICS = ["こんにちは", "おはよう", "ありがとう", "ばか", "がんばれ", "かわいい", "帰りたい"];
const SAY_HINT_TEMPLATES = [
  (t) => `おっさんに「${t}」って言ってやれよ。`,
  (t) => `試しにおっさんに「${t}」って言ってみな。反応が笑えるぜ。`,
];
function lockedHintPool() {
  const pool = [];
  for (const [cid, cfgOrList] of Object.entries(CLICK_UNLOCKS)) {
    const anyLocked = [].concat(cfgOrList).some((cfg) => {
      const key = (cfg.kind === "item" ? "item:" : cfg.kind === "costume" ? "cos:" : "bgm:") + cfg.id;
      return !dropped.has(key);
    });
    if (anyLocked && HINT_LINES[cid]) pool.push(HINT_LINES[cid]);
  }
  if (!dropped.has("cos:bear")) pool.push(HINT_LINES.pet100);
  else if (!dropped.has("cos:gold")) pool.push(HINT_LINES.pet1000);
  if (!dropped.has("bgm:zoo")) pool.push(HINT_LINES.hoshi300);
  else if (!dropped.has("cos:hoshi")) pool.push(HINT_LINES.hoshi500);
  else if (!dropped.has("item:starrod")) pool.push(HINT_LINES.hoshi1000);
  // カードゲーム未解禁(スターター未受取)のうちはHELL 9000のヒントも混ぜる
  if (!collection.unlocked()) pool.push("後ろのガチャガチャみてーなロボット、なんか売ってくれるらしいぜ。話しかけてみな。");
  return pool;
}
function hoshiLineOnClick() {
  // 喋るのは2割のクリックのみなので、喋る時のヒント率は3割(=クリック全体の約6%)
  // 半々で隠し要素ヒント/おじさんへの質問ネタ振り
  if (Math.random() < 0.3) {
    const pool = lockedHintPool();
    if (pool.length > 0 && Math.random() < 0.5) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (Math.random() < SAY_TOPICS.length / (SAY_TOPICS.length + QUESTION_TOPICS.length)) {
      const t = SAY_TOPICS[Math.floor(Math.random() * SAY_TOPICS.length)];
      return SAY_HINT_TEMPLATES[Math.floor(Math.random() * SAY_HINT_TEMPLATES.length)](t);
    }
    const t = QUESTION_TOPICS[Math.floor(Math.random() * QUESTION_TOPICS.length)];
    return QUESTION_HINT_TEMPLATES[Math.floor(Math.random() * QUESTION_HINT_TEMPLATES.length)](t);
  }
  return HOSHI_LINES[Math.floor(Math.random() * HOSHI_LINES.length)];
}
function hoshiSound() {
  const ac = ctx();
  const t = ac.currentTime;
  ding(ac, t, 1760, 0.1, 0.14);
  ding(ac, t + 0.06, 2349, 0.14, 0.12);
}
function checkHoshiUnlocks(announce) {
  const n = clicks.hoshi || 0;
  if (n >= 300 && !dropped.has("bgm:zoo")) {
    dropped.add("bgm:zoo");
    if (announce) {
      playDropSound();
      toast("🎵 新しいBGM『To the zoo』を獲得!レコードプレイヤーで切替できます");
      sayHoshi("……『To the zoo』やるよ。オレ様の秘蔵コレクションだ。感謝して聴けよな。", 5500);
    }
  }
  if (n >= 500 && !dropped.has("cos:hoshi")) {
    dropped.add("cos:hoshi");
    items.spawn("costume", "hoshi");
    if (announce) {
      playDropSound();
      toast("⭐ 隠し衣装『星の着ぐるみ』がハンガーに出現!");
      sayHoshi("おっさんをオレ様にしてやれ。光栄だろ?That's me!", 5500);
    }
  }
  if (n >= 1000 && !dropped.has("item:starrod")) {
    dropped.add("item:starrod");
    items.spawn("item", "starrod");
    if (announce) {
      playDropSound();
      toast("⭐ 隠しアイテム『星の本気棒』が棚に出現!(+10000pt)");
      sayHoshi("オレ様の力、貸してやるよ。F**k yeah!", 5500);
    }
  }
}
function onHoshiClick() {
  clicks.hoshi = (clicks.hoshi || 0) + 1;
  bumpTaps();
  saveClicks();
  hoshi.react();
  hoshiSound();
  checkHoshiUnlocks(true);
  if (Math.random() < 0.2 && canSpeak("hoshi")) sayHoshi(hoshiLineOnClick()); // 80%は無言(リアクションのみ)
  if (clicks.hoshi % 10 === 0) {
    toast(`⭐ 星: ${clicks.hoshi}回目`);
  }
}
checkHoshiUnlocks(false); // 保存済みクリック数ぶんを起動時に復元

// ---------- フィーバータイム ----------
// 500pt以降、前回終了から2分経過後に毎秒約1/70の確率で発動(平均3〜4分に1回)。
// 15秒間ポイント3倍+ミラーボール+フィーバー曲+おじさんはパターン移動(5種からランダム)
const feverBanner = document.getElementById("fever-banner");
const feverSecEl = document.getElementById("fever-sec");
const slapCounterBox = document.getElementById("slap-counter");
const FEVER_DURATION = 15;
const FEVER_COOLDOWN = 75;   // この秒数は絶対に発生しない
const FEVER_MULT = 3;        // フィーバー中のポイント倍率
const FEVER_MEAN_WAIT = 45;  // クールダウン明けからの平均待ち秒数(合計で平均2分に1回)
let feverActive = false;
let feverEndsAt = 0;
let lastFeverEnd = 0;
let feverStartPoints = 0;
const FEVER_START_LINES = [
  "フィ、フィーバーじゃとぉ!?体が勝手に動くんじゃー!",
  "ミラーボール!?ワシの時代が来たのう!",
  "うおお、血が騒ぐ!ディスコの記憶が蘇るんじゃ!",
];
const FEVER_END_LINES = [
  "はぁ、はぁ…楽しかったのう…",
  "ふう、ええ汗かいたわい!",
  "まだ踊り足りん気もするがのう…",
];
function startFeverTime(pattern) {
  if (feverActive || ending) return;
  feverActive = true;
  feverEndsAt = clock.elapsedTime + FEVER_DURATION;
  feverStartPoints = points;
  ojisan.setFever(pattern || 1 + Math.floor(Math.random() * 5));
  bgm.startFever();
  office.setFever(true);
  animal.setProgress(1); // クマと星もダンス最高潮
  hoshi.setProgress(1);
  feverBanner.classList.add("show");
  slapCounterBox.classList.add("fever");
  say(FEVER_START_LINES[Math.floor(Math.random() * FEVER_START_LINES.length)], 4500);
}
function endFeverTime(silent) {
  if (!feverActive) return;
  feverActive = false;
  lastFeverEnd = clock.elapsedTime;
  ojisan.setFever(0);
  bgm.stopFever();
  office.setFever(false);
  applyProgress(); // クマ・星のテンションを進行度相応に戻す
  hoshi.group.position.y = 0.745; // 星をデスクに着地させる
  feverBanner.classList.remove("show");
  slapCounterBox.classList.remove("fever");
  if (!silent) {
    toast(`🕺 フィーバー終了! +${(points - feverStartPoints).toLocaleString()}pt`);
    say(FEVER_END_LINES[Math.floor(Math.random() * FEVER_END_LINES.length)], 4500);
  }
}
function updateFever(dt) {
  if (ending || !gameMode) return;
  // HELL 9000のメニュー中(購入・構築・対戦)はフィーバーを起こさない
  if (hellShop.isOpen || cardBattle.isOpen) return;
  if (feverActive) {
    const remain = feverEndsAt - clock.elapsedTime;
    feverSecEl.textContent = Math.max(0, Math.ceil(remain));
    // 星はデスクの上でぴょんぴょん跳ねる
    hoshi.group.position.y = 0.745 + Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.25;
    if (remain <= 0) endFeverTime(false);
  } else if (
    points >= 500 && points < TOTAL_POINTS &&
    clock.elapsedTime - lastFeverEnd > FEVER_COOLDOWN &&
    Math.random() < dt / FEVER_MEAN_WAIT
  ) {
    startFeverTime();
  }
}

// ---------- クリック処理(尻叩き / アイテム拾い / 着せ替え) ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;
let bgmStarted = false;

renderer.domElement.addEventListener("pointerdown", (e) => {
  downPos = [e.clientX, e.clientY];
});
// タップ/クリックのたびに音声を解錠(iOS対策)
// iOSはタッチ開始ではオーディオ許可が下りないことがあるため、
// bgm.start()を毎回呼ぶ(再生中なら内部でresumeだけ行い二重再生はしない)
function unlockAudio() {
  bgmStarted = true;
  bgm.start();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
document.addEventListener("pointerdown", unlockAudio);
document.addEventListener("touchend", unlockAudio, { passive: true });
document.addEventListener("click", unlockAudio);
// クリック/タップ/Shiftキー共通のゲーム内クリック処理(cssX/cssYはCSSピクセル座標)
function handleGameClick(cssX, cssY) {
  if (!gameMode || ending) return; // スタート画面中は無効
  // 対戦後の寄り演出中は部屋のクリック無効
  // (カメラがHELL 9000に寄っている時にタップするとショップが開いてしまう)
  if (cine) return;
  if (photo.isOpen) return; // 写真モード中の3Dクリックはphoto.js側が処理する
  tapCount++; // 発言クールダウン用(叩く・撫でる・オブジェクトクリック・空振り すべて1タップ)
  pointer.set((cssX / innerWidth) * 2 - 1, -(cssY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // FPSモードは目の前まで近づかないとクリックできない
  const inReach = (hit) => gameMode !== "fps" || hit.distance <= INTERACT_RANGE;

  // 1) 動物(撫でる — 装備に関係なく手で)
  const animalHits = raycaster.intersectObjects(animal.clickableMeshes, true);
  if (animalHits.length > 0 && inReach(animalHits[0])) {
    onPetAnimal(animalHits[0].point);
    return;
  }

  // 1.2) 星(デスクのマスコット)
  const hoshiHits = raycaster.intersectObjects(hoshi.clickableMeshes, true);
  if (hoshiHits.length > 0 && inReach(hoshiHits[0])) {
    onHoshiClick();
    return;
  }

  // 1.5) 部屋のクリックギミック(段ボール/ゴミ箱/ロッカー/冷蔵庫/警備員)
  const officeHits = raycaster.intersectObjects(office.clickables, true);
  if (officeHits.length > 0 && officeHits[0].object.userData.clickId && inReach(officeHits[0])) {
    onObjectClick(officeHits[0].object.userData.clickId);
    return;
  }

  // 2) アイテム / 衣装
  const itemHits = raycaster.intersectObjects(items.clickableMeshes(), true);
  if (itemHits.length > 0 && inReach(itemHits[0])) {
    const ud = itemHits[0].object.userData;
    if (ud.kind === "item") {
      const def = SLAP_ITEMS.find((s) => s.id === ud.id);
      if (def && def.id !== equipped.id) equip(def);
      return;
    }
    if (ud.kind === "costume") {
      const cur = ojisan.getCostume();
      const next = ud.id === cur ? "suit" : ud.id;
      ojisan.setCostume(next);
      items.setWornCostume(next);
      const def = COSTUMES.find((c) => c.id === next);
      toast(`👔 ${def ? def.name : next} にお着替え!`);
      say(next === "suit" ? "ふう、やっぱりスーツが落ち着くわい。" : "は、恥ずかしいのう…似合っとるか?", 4500);
      return;
    }
  }

  // 3) 尻叩き
  const hits = raycaster.intersectObjects(ojisan.buttMeshes, false);
  if (hits.length === 0 || !inReach(hits[0])) return;

  slapCount++;
  bumpTaps();
  if (equipped.id !== "hand") onlyHandUsed = false;
  const gain = equipped.points * (feverActive ? FEVER_MULT : 1);
  points = Math.min(points + gain, TOTAL_POINTS);
  totalEarned += gain;
  lifetimePt += gain;
  storage.setItem(LIFE_KEY, lifetimePt);
  lifetimeSlaps++;
  storage.setItem(SLAPS_KEY, lifetimeSlaps);
  slapItemCounts[equipped.id] = (slapItemCounts[equipped.id] || 0) + 1;
  storage.setItem(SLAPITEMS_KEY, JSON.stringify(slapItemCounts));
  slapper.swing(equipped.id, hits[0].point, camera.position);
  ojisan.slap();
  playItemSound(equipped.sound);
  const voiceLine = canSpeak("ojisan") ? maybeSlapVoice(ojisan.getCostume(), points / TOTAL_POINTS) : null;
  if (voiceLine) say(voiceLine, 15000);
  applyProgress();
  checkUnlocks(true);

  const pop = document.createElement("div");
  pop.className = "slap-pop";
  pop.textContent = ["スパーン!", "ペチーン!", "バチーン!", "パァン!"][Math.floor(Math.random() * 4)];
  pop.style.left = cssX + "px";
  pop.style.top = cssY + "px";
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 750);

  if (points >= TOTAL_POINTS) {
    showEndChoice(); // 飛ばすか、なでなでして落ち着かせるかを選ぶ
    return;
  }
  const newStage = currentStage(points);
  if (newStage !== stage) {
    stage = newStage;
    flashStage();
    say(getStageLine(stage), 6500);
  } else if (slapCount % 5 === 0 && canSpeak("ojisan")) {
    say(getSlapLine(slapCount), 5000);
  }
}
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!downPos || Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 6) return;
  handleGameClick(e.clientX, e.clientY);
});
// 画面中央(照準)をクリック扱いにする。FPS・神様モードの両方で使える
function overlayOpen() {
  return endChoiceOpen ||
    helpOverlay.classList.contains("show") ||
    document.getElementById("settings-overlay").classList.contains("show") ||
    document.getElementById("zukan-overlay").classList.contains("show") ||
    document.getElementById("board-overlay").classList.contains("show");
}

// ---------- エンディング選択(100万pt到達時) ----------
// 飛ばすとエンディング、なでなでするとポイントだけ0に戻して続行。
// 累計お尻たたきポイント(lifetimePt)・アイテム/衣装の解禁(totalEarned基準)は影響を受けない
const endChoiceEl = document.getElementById("end-choice");
let endChoiceOpen = false;
function showEndChoice() {
  if (endChoiceOpen || ending) return;
  endChoiceOpen = true;
  endChoiceEl.classList.add("show");
}
document.getElementById("end-launch").addEventListener("click", () => {
  endChoiceOpen = false;
  endChoiceEl.classList.remove("show");
  startEnding();
});
document.getElementById("end-soothe").addEventListener("click", () => {
  endChoiceOpen = false;
  endChoiceEl.classList.remove("show");
  points = 0;
  stage = 0;
  applyProgress();
  toast("🖐 なでなでで落ち着いた!ポイントは0に(累計とアイテムはそのまま)");
  say("ふう…なでなでされたら急に冷静になったわい。尻が地球に帰ってきよった…", 6500);
});
function clickAtCrosshair() {
  if (!gameMode || ending || overlayOpen()) return;
  handleGameClick(innerWidth / 2, innerHeight / 2);
}
// PC: Spaceキー。押しっぱなしの連射は無効
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
  e.preventDefault();
  clickAtCrosshair();
});
// スマホ: スパンキングボタン(画面右下の大きいボタン)。連打できるようpointerdownで反応
const spankBtn = document.getElementById("spank-btn");
spankBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  clickAtCrosshair();
});
spankBtn.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------- エンディング ----------
const endingEl = document.getElementById("ending");
const endingStats = document.getElementById("ending-stats");
document.getElementById("restart-btn").addEventListener("click", () => {
  location.href = location.pathname;
});
const startedAt = Date.now();
let endingPhase = 0;
let endingT = 0;
// エンディング分岐: 到着先はコンプ率で決定(素手のみクリアは別エンド)、クマ/星は重ねがけ演出
let endingDest = "moon"; // "cloud" | "moon" | "butt" | "star"
let bearEscort = false;
let starEscort = false;
let arrivalT = 0;
let bigStarBuilt = false;
let starTransformT = 0; // 素手エンドの変身タイマー
let glowMats = null; // 変身時に発光させるおじさんのマテリアル
let endBigStar = null; // 変身後の星(飛行を続けるため保持)
let starFlightY = 0; // 変身後の飛行高度
const DEST_LABELS = { cloud: "雲の上", moon: "月面", butt: "おしり星", star: "星になった" };

function startEnding() {
  endFeverTime(true); // フィーバー中なら静かに終了
  ending = true;
  endingPhase = 1;
  // 到着先の決定: コンプ率(アイテム12+衣装11+BGM6=29種)。素手のみクリアは星になる
  const got = items.spawnedIds();
  const rate = (got.items.length + got.costumes.length + availableTracks().length) /
    (SLAP_ITEMS.length + COSTUMES.length + TRACKS.length);
  endingDest = (onlyHandUsed ? "star" : rate >= 1 ? "butt" : rate >= 0.5 ? "moon" : "cloud");
  bearEscort = petCount >= 1000;
  starEscort = (clicks.hoshi || 0) >= 1000;
  endFx.begin(endingDest, { bearEscort, starEscort });
  if (gameMode === "fps") {
    storage.setItem("oshiri_god", "1"); // FPSモードクリアで神様モード解禁
    fps.disable(); // エンディングはシネマティックカメラに切替
  }
  spankBtn.classList.remove("show");
  fps.setCrosshairVisible(false);
  slapCountEl.textContent = TOTAL_POINTS.toLocaleString();
  slapBarFill.style.width = "100%";
  flashStage();
  say(getEndingLine(endingDest), 6000);
  controls.enabled = false;
  office.openRoof();
  setTimeout(() => {
    endingPhase = 2;
    playRocketSound();
    say(screamVoice(ojisan.getCostume()), 4000);
    if (starEscort) sayHoshi("……ついてこいよ、f**kin'相棒。今日だけは離れねえ。", 5000);
    ojisan.launch();
  }, 2000);
}

function updateEnding(dt) {
  endingT += dt;
  // 到着処理: 到着面(雲/月/おしり星)でy固定。素手エンドは昇り続けて星になる
  if (endingPhase >= 2) {
    if (endingDest !== "star" && ojisan.group.position.y >= PLATFORM_TOP_Y) {
      ojisan.group.position.y = PLATFORM_TOP_Y;
      arrivalT += dt;
    } else if (endingDest === "star" && ojisan.group.position.y > 70) {
      // 変身演出: ピカーッと発光 → ホワイトアウト → 白が明けると肌色の星に
      starTransformT += dt;
      if (!bigStarBuilt) {
        ojisan.group.position.y = 70.5; // 変身中はその場で停止
        if (!glowMats) {
          glowMats = [];
          ojisan.group.traverse((o) => {
            if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.emissive) {
              if (!glowMats.includes(o.material)) glowMats.push(o.material);
            }
          });
        }
        const glow = Math.min(starTransformT / 1.4, 1);
        for (const m of glowMats) {
          m.emissive.setRGB(1, 1, 1);
          m.emissiveIntensity = glow * 2.2;
        }
        if (starTransformT > 1.0) stageFlash.classList.add("whiteout");
        if (starTransformT > 2.1) {
          bigStarBuilt = true;
          ojisan.group.visible = false; // おじさんは星になった
          endBigStar = endFx.buildBigStar(ojisan.group.position.clone());
        }
      } else {
        stageFlash.classList.remove("whiteout"); // 白がゆっくり明けて星が現れる
        // 星になった後も宇宙を飛び続ける
        // (launch()が毎フレームy=80を書き戻すため、専用の高度で上書きする)
        starFlightY = Math.max(starFlightY, ojisan.group.position.y) + dt * 3.5;
        ojisan.group.position.y = starFlightY;
        if (endBigStar) endBigStar.group.position.y = starFlightY;
        arrivalT += dt;
      }
    }
  }
  const y = ojisan.group.position.y;
  // クマ護衛: おじさんに被らないよう、画面奥を並走して飛ぶ
  if (bearEscort && endingPhase >= 2 && y > 1) {
    animal.group.position.set(
      ojisan.group.position.x - 1.8,
      y - 1.4,
      ojisan.group.position.z + 3.2
    );
  }
  // 星の仲間・おじさん星人・大星のアニメーション
  endFx.update(clock.elapsedTime, dt, ojisan.group.position);
  const target = new THREE.Vector3(0, 0.9 + y, 0);
  controls.target.lerp(target, 0.08);
  const wantPos = new THREE.Vector3(2.0, y + 1.8, -2.4);
  camera.position.lerp(wantPos, 0.04);
  camera.lookAt(controls.target);
  // 星も一緒に飛んでいく(少し遅れてついてきて、くるくる回る)
  if (y > 2.5) {
    hoshi.group.position.y = 0.745 + (y - 2.5);
    hoshi.group.rotation.y += dt * 4;
  }
  const spaceMix = Math.min(y / 45, 1);
  if (endingDest === "butt") {
    // おしり星は宇宙ではなく、雲の浮かぶ青空の惑星
    scene.background.lerpColors(new THREE.Color(0x2a2a35), new THREE.Color(0x7ec8f0), spaceMix);
    starField.visible = false;
  } else {
    scene.background.lerpColors(new THREE.Color(0x2a2a35), new THREE.Color(0x000005), spaceMix);
    starField.visible = true;
    starField.material.opacity = spaceMix;
    starField.position.y = y * 0.5;
  }
  if (scene.fog) scene.fog.far = 16 + spaceMix * 200;
  const arrived = endingPhase === 2 && arrivalT > (endingDest === "star" ? 3 : 4);
  if (arrived) {
    endingPhase = 3;
    // 到着先別のエンディングテキスト+衣装別ひとこと
    document.getElementById("ending-text").innerHTML =
      (ENDING_TEXTS[endingDest] || ENDING_TEXTS.moon) +
      `<br><span style="opacity:.75;font-size:13px">${getCostumeEndLine(ojisan.getCostume())}</span>`;
    bgm.playEnding(); // エンディング曲(Brooklyn Network)に切替
    if (starEscort) endFx.showStarFriends(); // 星の仲間たちはこのタイミングで登場
    const sec = Math.round((Date.now() - startedAt) / 1000);
    const got = items.spawnedIds();
    const bgmGot = availableTracks();
    // コレクション達成度カード
    const mkCard = (icon, label, gotN, total, extra) => {
      const comp = gotN >= total;
      return `<div class="end-card">` +
        `<div class="end-label">${icon} ${label}</div>` +
        `<div class="end-big">${gotN}<small> / ${total}</small></div>` +
        `<div class="end-note${comp ? " comp" : ""}">${comp ? "コンプリート!" : `未入手 ${total - gotN}`}${extra || ""}</div>` +
        `</div>`;
    };
    const petNote = petCount >= 1000 ? "限界突破!" : petCount >= 100 ? "なかよし" : "もっと撫でてあげて";
    const clickRows = Object.keys(CLICK_NAMES)
      .map((id) => `<span>${CLICK_NAMES[id]} <b>×${count(clicks[id])}</b></span>`)
      .join("");
    endingStats.innerHTML =
      `<div class="end-summary">` +
      `<span>🚀 <b>${DEST_LABELS[endingDest]}</b></span>` +
      `<span>👋 <b>${slapCount.toLocaleString()}</b> 発</span>` +
      `<span>🏆 <b>${TOTAL_POINTS.toLocaleString()}</b> pt</span>` +
      `<span>⏱ <b>${Math.floor(sec / 60)}</b> 分 <b>${sec % 60}</b> 秒</span>` +
      `<span>⚔️ <b>${cardWinCount()}</b> / ${OPPONENTS.length} 人</span>` +
      `</div>` +
      `<div class="end-cards">` +
      mkCard("🎁", "アイテム", got.items.length, SLAP_ITEMS.length) +
      mkCard("👗", "衣装", got.costumes.length, COSTUMES.length) +
      mkCard("🎵", "BGM", bgmGot.length, TRACKS.length, `<br>${bgmGot.map(trackTitle).join("、")}`) +
      `<div class="end-card"><div class="end-label">🐻 なでなで</div>` +
      `<div class="end-big">${petCount.toLocaleString()}<small> 回</small></div>` +
      `<div class="end-note">${petNote}</div></div>` +
      `</div>` +
      `<div class="end-section-title">⚔️ カードバトルの戦績</div>` +
      `<div class="end-clicks">${OPPONENTS.map((o) => {
        const w = collection.winCount(o.key);
        const name = o.key === "oshiriseijin" && collection.winCount("ojisan") === 0 ? "???" : o.label;
        return `<span>${name} <b>${w ? w + "勝" : "—"}</b></span>`;
      }).join("")}</div>` +
      `<div class="end-section-title">👆 クリック探索のきろく</div>` +
      `<div class="end-clicks">${clickRows}</div>`;
    // 結果画面の下からゲーム中UIが透けないよう隠す
    for (const id of ["controls", "slap-counter", "toast-area", "bubble", "hoshi-bubble", "carrie-bubble", "fever-banner", "title-bar", "help-btn", "settings-btn", "zukan-btn", "photo-btn"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
    endingEl.classList.add("show");
    requestAnimationFrame(() => endingEl.classList.add("visible"));
  }
}

// ---------- スタート画面 / モード管理 ----------
const INTERACT_RANGE = 2.2; // FPSモードの近接クリック射程(m)
let gameMode = null; // null=スタート画面 | "fps" | "god"
const startScreenEl = document.getElementById("start-screen");
const modeFpsBtn = document.getElementById("mode-fps");
const modeGodBtn = document.getElementById("mode-god");
const godUnlocked = storage.getItem("oshiri_god") === "1";
if (godUnlocked) {
  modeGodBtn.textContent = "👼 神様モードで始める";
  document.getElementById("mode-god-hint").style.display = "none";
} else {
  modeGodBtn.classList.add("locked");
}
controls.enabled = false; // スタート画面の間はカメラ操作なし

function beginGame(mode) {
  gameMode = mode;
  startScreenEl.style.display = "none";
  bgm.start(); // ボタン押下=正式なユーザー操作なので確実に再生できる
  bgmStarted = true;
  if (mode === "fps") {
    fps.enable();
  } else {
    controls.enabled = true;
    // 神様モードでもFPSと同じ照準を出す(Space/スパンキングボタンの狙い先)
    fps.setCrosshairVisible(true);
  }
  // スパンキングボタンはタッチ端末のみ。FPS・神様モードの両方で使える
  if ("ontouchstart" in window) spankBtn.classList.add("show");
  // PC向けの操作説明はモードで内容が違う
  const keyHint = document.getElementById("key-hint");
  keyHint.textContent = mode === "fps"
    ? "W・S 前後 / A・D 左右 / 矢印キーかドラッグで視点 / Space か クリックで叩く"
    : "ドラッグで視点をまわす / ホイールで寄り引き / クリックで叩く(Spaceは画面中央)";
  say("おお、いらっしゃい。散らかっとるが、まあゆっくりしていきなさい。", 6000);
}
// ヘルプ(操作説明のオーバーレイ)
const helpOverlay = document.getElementById("help-overlay");
document.getElementById("help-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  helpOverlay.classList.add("show");
});
helpOverlay.addEventListener("click", () => helpOverlay.classList.remove("show"));


// ---------- 設定パネル(音量・感度・移動速度) ----------
const SETTINGS_KEY = "oshiri_settings";
// 初期値: 効果音30% / 視点70% / スティック70% / 移動60%(2026-08-12調整。保存済み設定が優先)
let settings = normalizeSettings(readJSON(SETTINGS_KEY, {}));
function applySettings() {
  bgm.setVolume(settings.bgm);
  if (sfxGain) sfxGain.gain.value = settings.sfx;
  setVoicesEnabled(settings.voice);
  fps.setSensitivity({ look: settings.look, stick: settings.stick, move: settings.move });
}
function saveSettings() { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

// 対戦画面の🔊ボタン用。BGMと効果音をまとめて消す(消す前の音量は覚えておく)
let soundMuted = settings.bgm === 0 && settings.sfx === 0;
let soundBefore = { bgm: settings.bgm || 1, sfx: settings.sfx || 1 };
function setSoundMuted(on) {
  if (on) {
    soundBefore = { bgm: settings.bgm, sfx: settings.sfx };
    settings.bgm = 0;
    settings.sfx = 0;
  } else {
    settings.bgm = soundBefore.bgm || 1;
    settings.sfx = soundBefore.sfx || 1;
  }
  soundMuted = on;
  applySettings();
  saveSettings();
  // 設定パネルのスライダーも合わせる
  for (const [id, key] of [["set-bgm", "bgm"], ["set-sfx", "sfx"]]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = Math.round(settings[key] * 100);
    const val = document.getElementById(id + "-val");
    if (val) val.textContent = el.value;
  }
}
const settingsOverlay = document.getElementById("settings-overlay");
document.getElementById("settings-btn").addEventListener("click", () => settingsOverlay.classList.add("show"));
document.getElementById("settings-close").addEventListener("click", () => settingsOverlay.classList.remove("show"));
function bindSlider(id, key) {
  const el = document.getElementById(id);
  const val = document.getElementById(id + "-val");
  el.value = Math.round(settings[key] * 100);
  if (val) val.textContent = el.value;
  el.addEventListener("input", () => {
    settings[key] = el.value / 100;
    if (val) val.textContent = el.value;
    applySettings();
    saveSettings();
  });
}
bindSlider("set-bgm", "bgm");
bindSlider("set-sfx", "sfx");
bindSlider("set-look", "look");
bindSlider("set-stick", "stick");
bindSlider("set-move", "move");
{
  const vc = document.getElementById("set-voice");
  vc.checked = settings.voice;
  vc.addEventListener("change", () => { settings.voice = vc.checked; applySettings(); saveSettings(); });
}
if (!("ontouchstart" in window)) {
  for (const el of document.querySelectorAll(".touch-only")) el.style.display = "none";
}
applySettings();
storage.setItem("oshiri_save_version", "1");
document.getElementById("reset-save").addEventListener("click", () => {
  if (!confirm("このゲームのカード・記録・設定を、このブラウザから削除します。元に戻せません。削除しますか？")) return;
  if (clearGameData()) location.reload();
  else alert("保存領域にアクセスできず、完全には削除できませんでした。ブラウザのサイトデータ設定から削除してください。");
});

// ---------- 図鑑(コレクション+きろく) ----------
/** カードバトルで1勝以上している相手の人数 */
function cardWinCount() {
  return OPPONENTS.filter((o) => collection.winCount(o.key) > 0).length;
}

const zukanOverlay = document.getElementById("zukan-overlay");
const zukanContent = document.getElementById("zukan-content");
const zkTabCol = document.getElementById("zk-tab-col");
const zkTabRec = document.getElementById("zk-tab-rec");
let zkTab = "col";
function renderZukan() {
  if (zkTab === "col") {
    const got = items.spawnedIds();
    const gotItems = new Set(got.items);
    const gotCos = new Set(got.costumes);
    const gotBgm = new Set(availableTracks());
    const row = (list, gotSet, nameOf) => list.map((x) => {
      const ok = gotSet.has(x.id);
      return `<span class="zk${ok ? "" : " zk-miss"}">${ok ? nameOf(x) : "???"}</span>`;
    }).join("");
    zukanContent.innerHTML =
      `<div class="zk-section-title">🎁 アイテム(${gotItems.size}/${SLAP_ITEMS.length})</div><div class="zk-grid">${row(SLAP_ITEMS, gotItems, (x) => x.name)}</div>` +
      `<div class="zk-section-title">👗 衣装(${gotCos.size}/${COSTUMES.length})</div><div class="zk-grid">${row(COSTUMES, gotCos, (x) => x.name)}</div>` +
      `<div class="zk-section-title">🎵 BGM(${gotBgm.size}/${TRACKS.length})</div><div class="zk-grid">${row(TRACKS, gotBgm, (x) => x.title)}</div>` +
      `<div class="zk-section-title">⚔️ カードバトル勝利(${cardWinCount()}/${OPPONENTS.length})</div>` +
      `<div class="zk-grid">${OPPONENTS.map((o) => {
        const w = collection.winCount(o.key);
        return `<span class="zk${w ? "" : " zk-miss"}">${w ? o.label : "???"}</span>`;
      }).join("")}</div>`;
  } else {
    zukanContent.replaceChildren();
    const section = (title, entries) => {
      const heading = document.createElement("div");
      heading.className = "zk-section-title";
      heading.textContent = title;
      const list = document.createElement("div");
      list.className = "zk-rec";
      for (const [label, value] of entries) {
        const row = document.createElement("span");
        row.append(document.createTextNode(label + " "));
        const number = document.createElement("b");
        number.textContent = String(value);
        row.append(number); list.append(row);
      }
      zukanContent.append(heading, list);
    };
    section("今回のプレイ", [["ポイント", points.toLocaleString()], ["叩いた数", slapCount]]);
    section(`⚔️ カードバトル(${cardWinCount()}/${OPPONENTS.length}人に勝利)`, OPPONENTS.map((o) => {
      const name = o.key === "oshiriseijin" && collection.winCount("ojisan") === 0 ? "???" : o.label;
      const wins = collection.winCount(o.key);
      return [name, wins ? wins + "勝" : "—"];
    }));
    section("つうさん", [["🐻 なでなで", "×" + petCount], ...Object.keys(CLICK_NAMES).map((id) =>
      [CLICK_NAMES[id].replace("警備員キャリーちゃん", "キャリーちゃん"), "×" + count(clicks[id])])]);
  }
  zkTabCol.classList.toggle("active", zkTab === "col");
  zkTabRec.classList.toggle("active", zkTab === "rec");
}
document.getElementById("zukan-btn").addEventListener("click", () => { renderZukan(); zukanOverlay.classList.add("show"); });
document.getElementById("zukan-close").addEventListener("click", () => zukanOverlay.classList.remove("show"));
zkTabCol.addEventListener("click", () => { zkTab = "col"; renderZukan(); });
zkTabRec.addEventListener("click", () => { zkTab = "rec"; renderZukan(); });

// ---------- スマホ: 質問ウィンドウの折りたたみ(スティックとの被り対策) ----------
const controlsBox = document.getElementById("controls");
if ("ontouchstart" in window) controlsBox.classList.add("collapsed");
document.getElementById("chat-toggle").addEventListener("click", () => controlsBox.classList.toggle("collapsed"));

modeFpsBtn.addEventListener("click", () => beginGame("fps"));
modeGodBtn.addEventListener("click", () => {
  if (godUnlocked) beginGame("god");
});

// FPSモード: 照準の射程内ハイライト用に全クリック対象をレイキャスト
const _center = new THREE.Vector2(0, 0);
let crosshairTick = 0;
function updateCrosshair() {
  if ((++crosshairTick % 6) !== 0) return;
  raycaster.setFromCamera(_center, camera);
  const targets = [
    ...ojisan.buttMeshes,
    ...animal.clickableMeshes,
    ...hoshi.clickableMeshes,
    ...office.clickables,
    ...items.clickableMeshes(),
  ];
  const hits = raycaster.intersectObjects(targets, true);
  // 神様モードは距離制限がないので、当たっていれば光らせる
  const inRange = hits.length > 0 && (gameMode !== "fps" || hits[0].distance <= INTERACT_RANGE);
  fps.setInRange(inRange);
}

// ---------- ループ ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  // おしり星人戦の宇宙ステージ(表示中だけ動かし、肌の緑を毎フレーム上書き)
  if (alienStage && alienStage.group.visible) {
    alienStage.api.update(clock.elapsedTime, dt);
    for (const m of alienStage.skinMats) m.color.copy(ALIEN_GREEN);
  }
  const photoOn = photo && photo.isOpen;
  // 写真モード中は ojisan.update() を止める(photoPose の静的ポーズを維持するため)
  if (!photoOn) ojisan.update(clock.elapsedTime, dt);
  office.update(clock.elapsedTime, dt);
  items.update(clock.elapsedTime, dt);
  slapper.update(clock.elapsedTime, dt);
  animal.update(clock.elapsedTime, dt);
  hoshi.update(clock.elapsedTime, dt);
  if (!ending && !photoOn) updateBearGrowth(dt); // エンディング/写真中はクマの位置制御を優先
  if (!photoOn) updateFever(dt);
  if (ending) {
    updateEnding(dt);
  } else if (photoOn) {
    photo.update(dt);
  } else if (cine) {
    // 寄り演出。操作は受け付けず、決めた位置へ滑らかに寄る
    if (cine.follow) {
      // 歩き回るキャラは毎フレーム狙いを取り直して、必ず画に収める
      const f = cine.follow();
      cine.look.copy(f.at);
      cine.camPos.copy(f.at).add(f.front.clone().normalize().multiplyScalar(cine.dist));
      cine.camPos.y = f.at.y + 0.05;
    }
    camera.position.lerp(cine.camPos, cine.speed);
    camera.lookAt(cine.look);
  } else if (fps.enabled) {
    fps.update(dt);
    updateCrosshair();
  } else {
    controls.update();
    if (gameMode === "god") updateCrosshair(); // 神様モードも照準の当たり判定を見る
  }
  if (!photoOn) updateBubblePos(); // 写真モードは photo.update() が吹き出しを置く
  syncStickVisibility(); // オーバーレイ中は仮想スティックを引っこめる
  renderer.render(scene, camera);
});
