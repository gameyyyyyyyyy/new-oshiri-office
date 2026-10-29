// 写真モード: スクショ用の画面を組み立てるモード。
// 背景・巨大カード(所持枚数まで複数可)・キャラ(おじさん/星/クマ/キャリー/HELL/おしり星人を
// 自由に追加/削除)・衣装・ポーズ・照明・カメラ・フィルターを選べる。
// キャラとカードはタップで選択→ドラッグで移動(上下左右)・ボタンで奥行き/大きさ/削除/コメント変更。
// 全キャラに吹き出しが常時付く。ロゴと累計ptテロップもドラッグ移動/±拡縮。
// 保存(PNG合成)と共有(Web Share API)つき。
//
// 実装方針(CLAUDE.md参照):
// - 写真モード中は main が ojisan.update() を呼ばない → ojisan.photoPose() の静的ポーズが維持される
// - 主役おじさんはゲーム実体を借用(削除もできる。終了時に必ず部屋へ戻す)。
//   キャリー/HELLの1体目も実体借用、2体目以降はクローン(キャリーはSkeletonUtils.clone)
// - 星/クマ/追加おじさん/おしり星人はこのモジュール専用インスタンス(プール再利用)
// - 宇宙/月面/お尻星は部屋の遥か上空 y=80 に自前ステージを組む(alienStage方式)
// - 巨大カードは renderCard のDOMを SVG foreignObject 経由でcanvasに焼いて実物と同じ見た目にする
//   (XMLSerializer必須・*{box-sizing:border-box}リセット同梱必須)
// - フィルターは renderer.domElement への CSS filter(保存時は ctx.filter で同じ式を適用)
// - 吹き出しはキャラごとに .ph-bub 要素を動的生成(ゲームの#bubble等は写真モードでは使わない)

import * as THREE from "three";
import { CARDS, OPPONENTS } from "./carddata.js";
import { COSTUMES, SLAP_ITEMS } from "./items.js";
import { createOjisan } from "./ojisan.js";
import { greenifySkin } from "./ending.js";
import { createHoshi, HOSHI_LINES } from "./hoshi.js";
import { createAnimal } from "./animal.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { renderCard } from "./cards.js";
import * as collection from "./collection.js";

const STAGE_Y = 80;
const shareUrl = new URL("../", import.meta.url);
const SHARE_TEXT = "おしりオフィスで撮った1枚 #おしりオフィス" +
  (shareUrl.protocol === "https:" && !["localhost", "127.0.0.1"].includes(shareUrl.hostname) ? " " + shareUrl.href : "");
const MAX_CHARS = 16;

const BGS = [
  { id: "office", name: "オフィス" },
  { id: "space", name: "宇宙" },
  { id: "moon", name: "月面" },
  { id: "butt", name: "お尻星" },
];

const POSES = [
  { id: "stand", name: "立つ" },
  { id: "sit", name: "すわる" },
  { id: "banzai", name: "バンザイ" },
  { id: "oshiri", name: "おしりドン" },
  { id: "jump", name: "ジャンプ" },
];

const LIGHT_LEVELS = [
  { name: "よわめ", v: 0.75 },
  { name: "ふつう", v: 1.4 },
  { name: "つよめ", v: 2.3 },
];
// 色は変化がはっきり分かるよう濃いめにしてある
const LIGHT_COLORS = [
  { name: "白", c: 0xffffff },
  { name: "夕日", c: 0xffbe72 },
  { name: "ピンク", c: 0xff96c8 },
  { name: "青", c: 0x86b4ff },
  { name: "ミント", c: 0x8fffba },
];

const FX = [
  { id: "none", name: "なし" },
  { id: "clones", name: "おじさん増殖" },
];

// 画面フィルター(3D画面だけに掛かる。ロゴ・吹き出し・テロップは素のまま)
const FILTERS = [
  { name: "なし", css: "" },
  { name: "ノワール(白黒)", css: "grayscale(1) contrast(1.4) brightness(1.05)" },
  { name: "ネガ", css: "invert(1) hue-rotate(180deg)" },
  { name: "バッドトリップ", css: "saturate(3.2) hue-rotate(115deg) contrast(1.35)" },
];

// カメラ調整
const CAM_ZOOMS = [
  { name: "どアップ", v: 0.62 },
  { name: "近い", v: 0.8 },
  { name: "標準", v: 1.0 },
  { name: "遠い", v: 1.25 },
  { name: "すごく遠い", v: 1.55 },
];
const CAM_HEIGHTS = [
  { name: "ローアングル", y: -0.62 },
  { name: "標準", y: 0 },
  { name: "俯瞰", y: 0.85 },
];
const CAM_SIDES = [
  { name: "左から", x: 1.0 }, // カメラは+zを見る=画面右がワールド-x
  { name: "正面", x: 0 },
  { name: "右から", x: -1.0 },
];

// ---------------------------------------------------------------------------
// セリフ(写真モード用・大量)
// ---------------------------------------------------------------------------
const OJISAN_PHOTO_LINES = [
  "ワシ、写真写りには自信があるんじゃ。尻のな。",
  "はいチーズ…って、どこ撮っとるんじゃ!",
  "この尻、加工なしじゃぞ。",
  "SNS映え?ワシの時代は年賀状じゃった。",
  "プロフィール写真にしてもええぞ。",
  "宇宙をバックに尻を撮る日が来るとはのう…",
  "ええか、シャッターチャンスは一瞬じゃ。尻と同じでな。",
  "ワシの背中、哀愁あるじゃろ。",
  "この会社、写真部あったんか?",
  "もっとワシの尻を大きく写すんじゃ!",
  "家族には見せられん写真じゃな…",
  "決まっとるか?ネクタイ曲がっとらんか?",
  "笑顔?ワシは常に真顔が営業スマイルじゃ。",
  "この角度がワシのベストアングルじゃ。多分な。",
  "現像したら課長に一枚くれんかの。",
  "履歴書に使えるかの、これ。",
  "ワシ、盛れとる?盛れとるか?",
  "フラッシュはやめてくれ。ハゲが光る。",
  "むしろハゲを照明として活用せい。",
  "被写体としてのギャラはコーヒー1杯でええぞ。",
  "この写真、後世に残るんじゃろか…",
  "遺影には…せんでくれよ?",
  "ワシの尻、レンズに収まっとるか?",
  "パシャパシャ撮るでない。尻が照れる。",
  "インフルエンサーってやつになれるかのう。",
  "バズったら会社辞めてええかの。",
  "いいねの数だけ尻を叩いてええぞ。",
  "ワシのフォロワーはまだ星とクマだけじゃ。",
  "写真より実物の方が尻はデカいぞ。",
  "念のため言うとくが、ワシは真面目に働いとる。",
  "この瞬間を切り取るとは、おぬしセンスあるのう。",
  "壁紙にしてもええが、家族の誤解は自己責任じゃ。",
  "ワシ、昔はイケメンと呼ばれ…とらんかったわ。",
  "背筋を伸ばすと腰にくるんじゃ。年じゃな。",
  "この後、残業なんじゃけどな…",
  "撮影ついでに肩も揉んでくれんかの。",
  "ワシの営業スマイル、単価高いぞ。",
  "尻のツヤ、ちゃんと写っとるか?",
  "奇跡の一枚を頼むぞ。奇跡のな。",
  "証明写真のつもりが、何の証明にもならん写真じゃ。",
  "月まで来て撮る写真が、ワシの尻でええんか?",
  "地球は青かった。ワシの尻は赤かった。",
  "宇宙服なしで平気なワシ、実はすごくないか?",
  "この星、Wi-Fi飛んどるかの。",
  "カードの前で撮ると、ワシが景品みたいじゃな。",
  "ワシより目立つ背景は許さんぞ。いや、許すが。",
  "何枚でも撮ってええが、尻の減りは早うなるぞ。",
  "ベストショットは一生もの。尻は一瞬もの。",
  "アイドルみたいじゃろ。中年の。",
  "写真の中のワシは、永遠に働かんでええんじゃな…ええのう。",
  "撮り直しは何回でも付き合うぞ。ヒマじゃからな。",
  "この表情は「給料日前」の顔じゃ。",
  "これは「金曜の夕方」の顔じゃ。ええ顔じゃろ。",
  "ワシの尻が世界に発信される…責任重大じゃな。",
  "肖像権はスパンキングポイントで支払われるんかの。",
  "ええか、これは芸術じゃ。断じて悪ふざけではない。",
  "母さんには内緒じゃぞ。",
  "ワシのポーズ、キレてるか?キレてるか!?",
  "たるんどるのは尻だけで十分じゃ。シャキッと撮れい。",
  "この一枚で会社のホームページに載れんかのう。",
  "ワシが2人おっても、給料は1人分なんじゃろな…",
  "分身しても仕事は減らんかったわい。",
];

// キャラ共通の写真セリフ(キャラ固有セリフに混ぜて使う)
const PARTNER_PHOTO_LINES = [
  "いい笑顔ですね(棒読み)",
  "はい、チーズ!",
  "おじさんの隣、けっこう緊張する…",
  "この写真、あとで送ってね!",
  "ベストポジションは譲らないよ。",
  "映り込みじゃなくて、ちゃんと出演です。",
  "ギャラの話はまだ聞いてない。",
  "次は私をセンターにして。",
  "おじさんの尻、影がデカい…",
  "記念日でもないのに記念写真?最高じゃん。",
  "SNSに載せるときはタグ付けよろしく。",
  "この現場、楽しいから好き。",
  "笑いが止まらないんだけど、この構図。",
  "宇宙まで来て集合写真て。",
  "あとでプリントしてオフィスに貼ろう。",
  "アルバムのタイトルは『尻と仲間たち』で。",
  "ちょっと、尻がこっち向いてる!",
  "カメラ目線でいいの?尻目線?",
  "何枚撮っても事故写真になる気がする。",
  "奇跡の一枚、狙っていこう。",
  "こんな平和な残業なら毎日でもいい。",
  "膝が笑ってきた。早く撮って。",
  "背景のカード、デカすぎない?",
  "はい、いい表情いただきましたー!",
];
const KUMA_LINES = [
  "🐻💕", "🐻🎵", "がおー(照)", "🐻✨", "くまー!", "🐻👍",
  "🐻📷", "がおがお!", "🐻🌟", "くま…(感動)", "🐻🍯", "がう?",
];

export function createPhotoMode(deps) {
  const { scene, camera, renderer, controls, ojisan, office, getLifetimePt, getSlapStats, carrieLines, cardOutro } = deps;

  const btn = document.getElementById("photo-btn");
  const ui = document.getElementById("photo-ui");
  const peekEl = document.getElementById("photo-peek");

  let open = false;
  const sel = {
    bg: 0, cardType: 0, charType: 0, costume: 0, pose: 0, stampType: 0,
    lightLevel: 1, lightColor: 0, fx: 0, filter: 0,
    camZoom: 2, camHeight: 1, camSide: 1,
  };
  let cardOpts = [];
  let cosOpts = [];
  let charOpts = [];

  let saved = null;
  const borrowed = new Map();

  function borrow(key, obj) {
    if (borrowed.has(key)) return;
    borrowed.set(key, {
      obj, parent: obj.parent,
      pos: obj.position.clone(), rot: obj.rotation.clone(), scale: obj.scale.clone(),
    });
  }
  function giveBack(key) {
    const b = borrowed.get(key);
    if (!b) return;
    if (b.parent) b.parent.add(b.obj);
    else if (b.obj.parent) b.obj.parent.remove(b.obj);
    b.obj.position.copy(b.pos);
    b.obj.rotation.copy(b.rot);
    b.obj.scale.copy(b.scale);
    borrowed.delete(key);
  }
  function returnAll() {
    for (const key of [...borrowed.keys()]) giveBack(key);
  }

  // ---- formation(被写体の配置グループ) ----
  const formation = new THREE.Group();
  // 写真専用の照明リグ(3灯+環境光)。formationごとシーンから外れるので写真モード以外に影響しない
  const lightKey = new THREE.PointLight(0xffffff, 1.9, 16);
  lightKey.position.set(-1.4, 2.6, -2.7);
  const lightFill = new THREE.PointLight(0xffffff, 1.1, 14);
  lightFill.position.set(1.6, 1.3, -2.3);
  const lightRim = new THREE.PointLight(0xffffff, 0.8, 14);
  lightRim.position.set(0.4, 3.0, 1.6);
  const lightAmb = new THREE.AmbientLight(0xffffff, 0.35);
  const rig = [lightKey, lightFill, lightRim, lightAmb];
  for (const l of rig) formation.add(l);
  const RIG_BASE = [1.9, 1.1, 0.8, 0.35];
  function applyLighting() {
    const lv = LIGHT_LEVELS[sel.lightLevel].v;
    const col = LIGHT_COLORS[sel.lightColor].c;
    for (let i = 0; i < rig.length; i++) {
      rig[i].intensity = RIG_BASE[i] * lv;
      rig[i].color.set(col);
    }
  }

  // カメラは-z側から+zを見る=画面右がワールド-x
  const OJI_SPOT = new THREE.Vector3(-0.38, 0, -0.35);
  const CHAR_SPOT = new THREE.Vector3(0.52, 0, -0.15);
  const CARD_SPOT_STAGE = new THREE.Vector3(0, 1.55, 0.95);
  const CARD_SPOT_OFFICE = new THREE.Vector3(0, 1.36, 1.62);
  const CARD_SCALE_OFFICE = 0.85;
  const LOOK_LOCAL = new THREE.Vector3(0, 1.0, -0.15);
  const OFFICE_OFFSET_Z = -0.2;

  function camLocal() {
    const halfW = cardObjs.length ? 1.2 : (chars.length > 1 ? 0.95 : 0.75);
    const aspect = innerWidth / Math.max(1, innerHeight);
    const need = halfW / (Math.tan((camera.fov * Math.PI) / 360) * aspect);
    // 壁margin 0.12: camWorldZ = OFFICE_OFFSET_Z + LOOK_LOCAL.z - d >= -2.88
    const maxD = BGS[sel.bg].id === "office" ? (2.88 + OFFICE_OFFSET_Z + LOOK_LOCAL.z) : 6.2;
    let d = Math.min(Math.max(need + 0.4, 2.2), maxD);
    d = Math.min(Math.max(d * CAM_ZOOMS[sel.camZoom].v, 1.3), maxD);
    return new THREE.Vector3(
      0.02 + CAM_SIDES[sel.camSide].x,
      1.34 + CAM_HEIGHTS[sel.camHeight].y,
      LOOK_LOCAL.z - d
    );
  }

  // ---- 上空ステージ(宇宙/月面/お尻星) ----
  let stage = null;
  function ensureStage() {
    if (stage) return stage;
    const group = new THREE.Group();
    group.position.set(0, STAGE_Y, 0);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(17, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x04060f, side: THREE.BackSide })
    );
    group.add(dome);
    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 380; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 8);
      pos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07 })));
    const pl = new THREE.PointLight(0xfff0e6, 1.7, 30);
    pl.position.set(2.2, 3.4, -2.4);
    group.add(pl);
    group.add(new THREE.AmbientLight(0x9aa4ff, 0.8));

    const floors = {};
    {
      const f = new THREE.Group();
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.5, 0.14, 28),
        new THREE.MeshStandardMaterial({ color: 0x352a5e, emissive: 0x191040, emissiveIntensity: 0.7 })
      );
      disc.position.set(0, -0.07, -0.6);
      f.add(disc);
      floors.space = f;
    }
    {
      const f = new THREE.Group();
      const ground = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 10, 1.4, 28),
        new THREE.MeshStandardMaterial({ color: 0x9a9aa5 })
      );
      ground.position.y = -0.7;
      f.add(ground);
      const cratMat = new THREE.MeshStandardMaterial({ color: 0x7c7c88 });
      for (let i = 0; i < 8; i++) {
        const r = 0.25 + Math.random() * 0.55;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, 0.09, 18), cratMat);
        const a = Math.random() * Math.PI * 2;
        const d = 1.6 + Math.random() * 6;
        c.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
        f.add(c);
      }
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 24, 18),
        new THREE.MeshStandardMaterial({ color: 0x3f86c4, emissive: 0x14304a, emissiveIntensity: 0.6 })
      );
      earth.position.set(5, 6.5, 11); // カメラは+z向きなので画面左上に見える
      f.add(earth);
      floors.moon = f;
    }
    {
      const f = new THREE.Group();
      const ground = new THREE.Mesh(
        new THREE.CylinderGeometry(11, 12, 1.6, 32),
        new THREE.MeshStandardMaterial({ color: 0xe8b48e })
      );
      ground.position.y = -0.8;
      f.add(ground);
      const cratMat = new THREE.MeshStandardMaterial({ color: 0xd394b6 });
      for (let i = 0; i < 9; i++) {
        const r = 0.3 + Math.random() * 0.6;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.12, 0.1, 18), cratMat);
        const a = Math.random() * Math.PI * 2;
        const d = 1.8 + Math.random() * 7;
        c.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
        f.add(c);
      }
      const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff2f7 });
      for (let i = 0; i < 5; i++) {
        const cl = new THREE.Group();
        for (let j = 0; j < 3; j++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.55 + Math.random() * 0.3, 12, 10), cloudMat);
          s.position.set(j * 0.7 - 0.7, Math.random() * 0.2, 0);
          cl.add(s);
        }
        const a = (i / 5) * Math.PI * 2;
        cl.position.set(Math.cos(a) * 9, 3.5 + Math.random() * 3.5, Math.sin(a) * 9);
        f.add(cl);
      }
      floors.butt = f;
    }
    for (const k of Object.keys(floors)) {
      floors[k].visible = false;
      group.add(floors[k]);
    }
    group.visible = false;
    scene.add(group);
    stage = { group, floors };
    return stage;
  }

  // ---- 巨大カード(実物のDOMカードをテクスチャ化。所持枚数まで複数置ける) ----
  const cardObjs = []; // [{ group, id }]
  const cardTexCache = new Map();
  let refreshCardVal = null; // カード行の残数表示を更新する(buildUiでセット)

  async function blobToDataURL(blob) {
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  function collectCardCss() {
    let css = "";
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        // .pip-1〜6(ダイス目)はセレクタに'pcard'を含まないので別途拾う
        if (r.cssText && (r.cssText.includes("pcard") || /\.pip-\d/.test(r.selectorText || ""))) css += r.cssText + "\n";
      }
    }
    return css;
  }

  async function buildExactCardTexture(id) {
    if (cardTexCache.has(id)) return cardTexCache.get(id);
    const def = CARDS[id];
    const el = renderCard(def, id);
    try {
      const resp = await fetch(`assets/cards/${id}.jpeg`);
      if (resp.ok) {
        const dataUrl = await blobToDataURL(await resp.blob());
        const img = el.querySelector("img");
        if (img) {
          img.setAttribute("src", dataUrl);
          img.removeAttribute("loading");
          img.removeAttribute("decoding");
        }
      }
    } catch { /* イラスト無しでも枠と文字は出る */ }
    const vars = getComputedStyle(document.documentElement);
    const varStyle = ["--pk", "--pk-deep", "--pk-pale", "--ink", "--paper"]
      .map((k) => `${k}:${vars.getPropertyValue(k)}`)
      .join(";");
    const wrap = document.createElement("div");
    wrap.setAttribute("style", `width:340px;height:502px;${varStyle}`);
    const styleEl = document.createElement("style");
    // ページ全体のリセットは収集対象外なので自前で足す(無いと.pcardがpadding分はみ出して右下が欠ける)
    styleEl.textContent = "*{margin:0;padding:0;box-sizing:border-box}\n" + collectCardCss();
    wrap.appendChild(styleEl);
    wrap.appendChild(el);
    let xml = new XMLSerializer().serializeToString(wrap);
    if (!/^<div[^>]*xmlns=/.test(xml)) xml = xml.replace(/^<div/, '<div xmlns="http://www.w3.org/1999/xhtml"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="1004" viewBox="0 0 340 502">` +
      `<foreignObject width="340" height="502">${xml}</foreignObject></svg>`;

    const tex = await new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), 4000);
      img.onload = () => {
        clearTimeout(timer);
        const cv = document.createElement("canvas");
        cv.width = 680; cv.height = 1004;
        cv.getContext("2d").drawImage(img, 0, 0, 680, 1004);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    if (tex) cardTexCache.set(id, tex);
    return tex;
  }

  function placedCount(id) { return cardObjs.filter((c) => c.id === id).length; }
  function addCard(id) {
    if (!id) return;
    // 置ける枚数は実際に所持している枚数まで
    if (cardObjs.length >= 32 || placedCount(id) >= (collection.ownedCount(id) || 0)) return;
    const height = 3.0;
    const width = height * (340 / 502);
    const mat = new THREE.MeshBasicMaterial({ color: 0x241a2c });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    const grp = new THREE.Group();
    grp.add(mesh);
    grp.rotation.y = Math.PI;
    const inStage = BGS[sel.bg].id !== "office";
    const base = (inStage ? CARD_SPOT_STAGE : CARD_SPOT_OFFICE).clone();
    const n = cardObjs.length;
    base.x += (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2) * 1.15;
    base.z += n * 0.25;
    grp.position.copy(base);
    grp.scale.setScalar(inStage ? 1 : CARD_SCALE_OFFICE);
    formation.add(grp);
    const entry = { group: grp, id };
    cardObjs.push(entry);
    buildExactCardTexture(id).then((tex) => {
      if (!tex || !cardObjs.includes(entry)) return;
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    });
    setSelected({ type: "card", entry });
    if (refreshCardVal) refreshCardVal();
    return entry;
  }
  function removeCard(entry) {
    const i = cardObjs.indexOf(entry);
    if (i < 0) return;
    formation.remove(entry.group);
    cardObjs.splice(i, 1);
    if (refreshCardVal) refreshCardVal();
  }
  function clearCards() {
    for (const c of [...cardObjs]) removeCard(c);
  }

  // ---- キャラ(おじさん含む全キャラを統一管理) ----
  // 種類: ojisan / hoshi / kuma / carry / hell / oshiriseijin
  // 吹き出しの見た目: w=白(おじさん系) p=ピンク d=ダーク(キャリー)
  const CHAR_DEFS = {
    ojisan: { face: Math.PI, y: 0, s: 1.0, bub: "w" },
    hoshi: { face: 0, y: 0.34, s: 2.2, bub: "p" },
    kuma: { face: Math.PI, y: 1.12, s: 1.0, bub: "p" },
    carry: { face: Math.PI, y: 2.0, s: 1.0, bub: "d" },
    hell: { face: Math.PI / 2, y: 1.65, s: 1.0, bub: "p" },
    oshiriseijin: { face: Math.PI, y: 0, s: 0.9, bub: "p" },
  };
  const chars = []; // [{ type, obj, api?, main?:bool, owned:bool, bubbleEl, line }]
  const charPool = { hoshi: [], kuma: [], ojisan: [], oshiriseijin: [], carry: [], hell: [] };

  function makeOjisanInstance(green, progress = 0.2) {
    const api = createOjisan(scene);
    scene.remove(api.group);
    api.setProgress(green ? 0.07 : progress);
    if (green) greenifySkin(api);
    api.photoPose("stand");
    return api;
  }

  function charLines(type) {
    let base;
    if (type === "ojisan") return OJISAN_PHOTO_LINES;
    if (type === "hoshi") base = HOSHI_LINES;
    else if (type === "kuma") return KUMA_LINES; // クマは絵文字の世界観を守る
    else if (type === "carry") base = carrieLines;
    else {
      const o = cardOutro && cardOutro[type];
      base = o ? [...(o.win || []), ...(o.lose || [])] : [];
    }
    return [...base, ...PARTNER_PHOTO_LINES];
  }

  function makeBubbleEl(kind) {
    const el = document.createElement("div");
    el.className = "ph-bub " + kind;
    document.body.appendChild(el);
    return el;
  }

  function addChar(type, opts = {}) {
    if (!type || chars.length >= MAX_CHARS) return null;
    const def = CHAR_DEFS[type];
    let obj = null, api = null, owned = true;
    if (opts.mainObj) {
      // 主役おじさん(ゲーム実体)。owned=falseで終了時に必ず部屋へ返す
      obj = opts.mainObj;
      api = ojisan;
      owned = false;
    } else if (type === "ojisan") {
      const p = charPool.ojisan.pop();
      api = p ? p.api : makeOjisanInstance(false);
      obj = api.group;
    } else if (type === "hoshi") {
      const p = charPool.hoshi.pop();
      api = p ? p.api : createHoshi();
      obj = api.group;
    } else if (type === "kuma") {
      const p = charPool.kuma.pop();
      api = p ? p.api : (() => { const a = createAnimal(scene); scene.remove(a.group); return a; })();
      obj = api.group;
    } else if (type === "carry" || type === "hell") {
      const real = type === "carry" ? office.photoActors.guard : office.photoActors.hell;
      if (!chars.some((c) => c.type === type && !c.owned)) {
        // 1体目は実体を借用(キャリーはアイドルアニメが動き続ける)
        obj = real;
        owned = false;
        borrow(type, obj);
      } else {
        // 2体目以降はクローン。キャリーはスキンメッシュなのでSkeletonUtils必須
        const p = charPool[type].pop();
        obj = p ? p.obj : (type === "carry" ? SkeletonUtils.clone(real) : real.clone(true));
      }
    } else if (type === "oshiriseijin") {
      const p = charPool.oshiriseijin.pop();
      api = p ? p.api : makeOjisanInstance(true);
      api.photoPose("stand");
      obj = api.group;
    }
    if (!obj) return null;
    formation.add(obj);
    if (opts.pos) {
      obj.position.copy(opts.pos);
    } else {
      const n = chars.length;
      obj.position.set(CHAR_SPOT.x + (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2) * 0.75, 0, CHAR_SPOT.z + (n - 1) * 0.25);
    }
    obj.rotation.set(0, def.face, 0);
    obj.scale.setScalar(opts.mainObj ? obj.scale.x : def.s);
    obj.userData.phY = 0;
    const entry = {
      type, obj, api, owned, main: !!opts.mainObj,
      bubbleEl: makeBubbleEl(def.bub),
      line: "",
    };
    entry.line = pickLine(charLines(type), "");
    entry.bubbleEl.textContent = entry.line;
    chars.push(entry);
    if (!opts.silent) setSelected({ type: "char", entry });
    return entry;
  }
  function removeChar(entry) {
    const i = chars.indexOf(entry);
    if (i < 0) return;
    chars.splice(i, 1);
    entry.bubbleEl.remove();
    if (entry.main) {
      formation.remove(entry.obj); // 実体は終了時にexit()が部屋へ戻す
    } else if (entry.owned) {
      formation.remove(entry.obj);
      if (charPool[entry.type]) charPool[entry.type].push({ api: entry.api, obj: entry.obj });
    } else {
      giveBack(entry.type);
    }
  }
  function clearChars() {
    for (const c of [...chars]) removeChar(c);
  }

  // ---- おじさん増殖(バグみたいにたくさん) ----
  const CLONE_SPOTS = [];
  {
    const rows = [
      { z: -1.5, n: 4, w: 2.6, gap: 1.9 },
      { z: -0.7, n: 4, w: 3.0, gap: 2.0 },
      { z: 0.2, n: 5, w: 3.4, gap: 1.8 },
      { z: 1.1, n: 6, w: 4.2, gap: 0 },
      { z: 2.1, n: 7, w: 5.2, gap: 0 },
      { z: 3.2, n: 8, w: 6.4, gap: 0 },
    ];
    for (const r of rows) {
      for (let i = 0; i < r.n; i++) {
        const x = r.n === 1 ? 0 : -r.w / 2 + (r.w * i) / (r.n - 1);
        if (r.gap && Math.abs(x) < r.gap / 2) continue;
        CLONE_SPOTS.push([x, r.z]);
      }
    }
  }
  const clonePool = [];
  function ensureClones() {
    while (clonePool.length < CLONE_SPOTS.length) {
      const api = createOjisan(scene);
      scene.remove(api.group);
      api.setProgress(0.2);
      clonePool.push(api);
    }
  }
  function applyClones(on, poseId, costumeId) {
    if (!on) {
      for (const c of clonePool) formation.remove(c.group);
      return;
    }
    ensureClones();
    for (let i = 0; i < CLONE_SPOTS.length; i++) {
      const c = clonePool[i];
      const [x, z] = CLONE_SPOTS[i];
      c.setCostume(costumeId);
      c.photoPose(poseId);
      formation.add(c.group);
      c.group.position.set(x + (Math.sin(i * 7.3) * 0.08), 0, z + (Math.cos(i * 5.1) * 0.08));
      c.group.rotation.y = (poseId === "oshiri" ? 0 : Math.PI) + Math.sin(i * 3.7) * 0.25;
      const s = 0.9 + (Math.sin(i * 2.9) + 1) * 0.08;
      c.group.scale.setScalar(s);
      if (poseId === "jump") c.group.position.y = 0.34 * s;
    }
  }

  // ---- 選択とドラッグ ----
  // ドラッグはカメラに正対する縦平面で行い、上下左右のみ動かす(奥行きはボタン)。
  // 床平面方式だと視線と平面が浅く交わって一気に飛ぶため廃止した
  let selected = null; // { type: 'char'|'card', entry }
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4f8b, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  formation.add(ring);

  function selectedObj() {
    if (!selected) return null;
    if (selected.type === "char") return selected.entry.obj;
    if (selected.type === "card") return selected.entry.group;
    return null;
  }
  function charLabel(entry) {
    const names = { ojisan: "おじさん", hoshi: "星", kuma: "クマ", carry: "キャリーちゃん", hell: "HELL 9000", oshiriseijin: "おしり星人" };
    const same = chars.filter((c) => c.type === entry.type);
    const idx = same.indexOf(entry);
    return names[entry.type] + (same.length > 1 ? String(idx + 1) + "号" : "");
  }
  function selectedName() {
    if (!selected) return "";
    if (selected.type === "char") return charLabel(selected.entry);
    if (selected.type === "card") return "カード「" + (CARDS[selected.entry.id] || {}).name + "」";
    if (selected.type === "stamp") {
      const t = STAMP_TYPES.find((s) => s.id === selected.entry.type);
      return "スタンプ「" + (t ? t.name : "?") + "」";
    }
    return "";
  }
  function setSelected(v) {
    selected = v;
    ring.visible = !!v && v.type !== "stamp";
    for (const st of stamps) st.el.classList.toggle("sel", !!v && v.type === "stamp" && v.entry === st);
    refreshSelRow();
  }
  function updateRing() {
    if (!selected || selected.type === "stamp") return;
    const o = selectedObj();
    if (!o) return;
    if (selected.type === "card") {
      ring.position.set(o.position.x, o.position.y - 1.55 * o.scale.x, o.position.z - 0.02);
    } else {
      ring.position.set(o.position.x, o.position.y + 0.02, o.position.z);
    }
    const s = selected.type === "card" ? o.scale.x * 1.4 : o.scale.x;
    ring.scale.setScalar(Math.max(0.6, s));
  }

  const raycaster = new THREE.Raycaster();
  const dragPlane = new THREE.Plane();
  let dragging = null;
  function pickTargets() {
    const t = [];
    for (const c of chars) t.push({ obj: c.obj, sel: { type: "char", entry: c } });
    for (const c of cardObjs) t.push({ obj: c.group, sel: { type: "card", entry: c } });
    return t;
  }
  function rayAt(e) {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera({ x: nx, y: ny }, camera);
    return raycaster;
  }
  function onPointerDown(e) {
    if (!open) return;
    if (e.target !== renderer.domElement) return;
    const rc = rayAt(e);
    let best = null;
    for (const t of pickTargets()) {
      const hits = rc.intersectObject(t.obj, true);
      if (hits.length && (!best || hits[0].distance < best.dist)) best = { ...t, dist: hits[0].distance, point: hits[0].point };
    }
    if (!best) { setSelected(null); return; }
    setSelected(best.sel);
    const obj = best.obj;
    // カメラに正対する平面を対象の位置に張る(動きが1:1になり、暴れない)
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    const objWorld = obj.getWorldPosition(new THREE.Vector3());
    dragPlane.setFromNormalAndCoplanarPoint(normal, objWorld);
    const hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(dragPlane, hit)) return;
    dragging = {
      obj, sel: best.sel,
      startLocal: formation.worldToLocal(hit.clone()),
      startPos: obj.position.clone(),
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const rc = rayAt(e);
    const hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(dragPlane, hit)) return;
    const local = formation.worldToLocal(hit.clone());
    // 差分に係数をかけて、指の動きよりゆっくり動かす
    const K = 0.8;
    const dx = (local.x - dragging.startLocal.x) * K;
    const dy = (local.y - dragging.startLocal.y) * K;
    const o = dragging.obj;
    o.position.x = THREE.MathUtils.clamp(dragging.startPos.x + dx, -4.5, 4.5);
    if (dragging.sel.type === "card") {
      o.position.y = THREE.MathUtils.clamp(dragging.startPos.y + dy, 0.4, 3.4);
    } else {
      // 地面へのめり込みもOK(下限-1.6)
      o.position.y = THREE.MathUtils.clamp(dragging.startPos.y + dy, -1.6, 2.6);
      o.userData.phY = o.position.y - poseBaseY(dragging.sel.entry);
    }
  }
  function onPointerUp() {
    dragging = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  // おじさん系はジャンプポーズで足が浮くぶんの基準高さを持つ
  function poseBaseY(entry) {
    if (entry.type !== "ojisan" && entry.type !== "oshiriseijin") return 0;
    return (POSES[sel.pose].id === "jump" ? 0.34 : 0) * entry.obj.scale.x;
  }

  // ---- 配置の適用 ----
  function arrange() {
    const st = ensureStage();
    const bg = BGS[sel.bg].id;
    const inStage = bg !== "office";
    st.group.visible = inStage;
    for (const k of Object.keys(st.floors)) st.floors[k].visible = inStage && k === bg;

    const wantParent = inStage ? st.group : scene;
    if (formation.parent !== wantParent) wantParent.add(formation);
    formation.position.set(0, 0, inStage ? 0 : OFFICE_OFFSET_Z);
    formation.updateMatrixWorld(true);

    scene.fog = inStage ? null : saved.fog;

    const poseId = POSES[sel.pose].id;
    const costumeId = cosOpts[sel.costume] ? cosOpts[sel.costume].id : "suit";
    // おじさん系キャラ全員に同じポーズ・衣装を適用
    for (const c of chars) {
      if (c.type === "ojisan") {
        c.api.setCostume(costumeId);
        c.api.photoPose(poseId);
        c.obj.rotation.y = poseId === "oshiri" ? 0 : Math.PI;
        c.obj.position.y = poseBaseY(c) + (c.obj.userData.phY || 0);
      } else if (c.type === "oshiriseijin") {
        c.obj.position.y = poseBaseY(c) + (c.obj.userData.phY || 0);
      }
    }

    applyClones(FX[sel.fx].id === "clones", poseId, costumeId);
    applyLighting();
    renderer.domElement.style.filter = FILTERS[sel.filter].css;

    camera.position.copy(formation.localToWorld(camLocal()));
    camera.lookAt(formation.localToWorld(LOOK_LOCAL.clone()));

    refreshCountStamps();
  }

  // ---- 吹き出し(全キャラに常時表示。「コメント変更」で個別に引き直す) ----
  function pickLine(arr, current) {
    if (!arr.length) return "……";
    let s = arr[Math.floor(Math.random() * arr.length)];
    if (arr.length > 1 && s === current) s = arr[(arr.indexOf(s) + 1) % arr.length];
    return s;
  }
  function rerollLine(entry) {
    entry.line = pickLine(charLines(entry.type), entry.line);
    entry.bubbleEl.textContent = entry.line;
  }
  const _v = new THREE.Vector3();
  function charAnchor(entry) {
    if (entry.api && entry.api.headPos) return entry.api.headPos();
    const def = CHAR_DEFS[entry.type] || { y: 1.5 };
    return entry.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, def.y * entry.obj.scale.x, 0));
  }
  function placeAt(el, worldPos) {
    _v.copy(worldPos).project(camera);
    el.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + "px";
    el.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + "px";
  }
  function hideGameBubbles() {
    for (const id of ["bubble", "hoshi-bubble", "carrie-bubble"]) {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    }
  }

  // ---- スタンプ(ロゴ/累計ポイント/お尻/おしり文字1〜4の2Dオーバーレイ) ----
  // ドラッグで移動、大きさと削除は選択中欄で操作。奥行きは無い(常に最前面)
  const STAMP_TYPES = [
    { id: "logo", name: "ロゴ" },
    { id: "count", name: "累計ポイント" },
    { id: "slaps", name: "叩いた回数" },
    { id: "topitem", name: "一番叩いたアイテム" },
    { id: "butt", name: "お尻" },
    { id: "t1", name: "おしり文字1" },
    { id: "t2", name: "おしり文字2" },
    { id: "t3", name: "おしり文字3" },
    { id: "t4", name: "おしり文字4" },
  ];
  const STAMP_TEXTS = { t1: "おしり", t2: "お尻", t3: "しり", t4: "尻" };
  const STAMP_DEFAULT_SIZE = { logo: 190, butt: 140, count: 15, slaps: 15, topitem: 14, t1: 34, t2: 36, t3: 40, t4: 64 };
  const INFO_STAMP_IDS = ["count", "slaps", "topitem"];

  function topItemName() {
    const st = getSlapStats ? getSlapStats() : { byItem: {} };
    let best = null, bc = -1;
    for (const [id, c] of Object.entries(st.byItem || {})) {
      if (c > bc) { bc = c; best = id; }
    }
    const def = SLAP_ITEMS.find((i) => i.id === best);
    return def ? def.name : "まだなし";
  }
  // 情報スタンプ3種(累計pt/叩いた回数/一番叩いたアイテム)の文言と色。
  // CSSの見た目とcanvas描画(drawInfoStamp)の両方がここを参照する
  function infoStampSpec(type) {
    if (type === "count") {
      return { label: "累計スパンキングポイント", value: "pt" + (getLifetimePt() || 0).toLocaleString(), cls: "", color: cssVar("--pk") };
    }
    if (type === "slaps") {
      const n = (getSlapStats ? getSlapStats().slaps : 0) || 0;
      return { label: "👋 おじさんのお尻を叩いた回数", value: n.toLocaleString() + "回", cls: "gold", color: "#ffd76e" };
    }
    return { label: "🏆 おじさんのお尻を\n一番たくさん叩いたアイテム", value: topItemName(), cls: "mint", color: "#8fffba" };
  }
  function infoStampHtml(type) {
    const spec = infoStampSpec(type);
    return `<span class="ph-count1">${spec.label.replace(/\n/g, "<br>")}</span>` +
      `<span class="ph-count2 ${spec.cls}"><b>${spec.value}</b></span>`;
  }
  const stamps = []; // [{ type, el, size }]

  function logoSvgClone(withText) {
    const src = document.getElementById("start-logo");
    if (!src) return null;
    const clone = src.cloneNode(true);
    clone.removeAttribute("id");
    clone.setAttribute("width", "100%");
    clone.removeAttribute("height");
    if (!withText) {
      // 「お尻」スタンプ = ロゴのお尻の絵だけ(文字を除去して絵に寄せたviewBox)
      clone.querySelectorAll("text").forEach((t) => t.parentElement.remove());
      clone.setAttribute("viewBox", "80 -10 300 230");
    }
    return clone;
  }


  function applyStampSize(st) {
    if (st.type === "logo" || st.type === "butt") st.el.style.width = st.size + "px";
    else st.el.style.fontSize = st.size + "px";
  }

  function stampDrag(e, el) {
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.right = "auto";
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const move = (ev) => {
      el.style.left = Math.min(Math.max(ev.clientX - ox, -rect.width * 0.4), innerWidth - rect.width * 0.6) + "px";
      el.style.top = Math.min(Math.max(ev.clientY - oy, -rect.height * 0.3), innerHeight - 30) + "px";
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function addStamp(type, pos) {
    if (stamps.length >= 32) return null;
    const el = document.createElement("div");
    el.className = "ph-stamp " + type;
    if (type === "logo" || type === "butt") {
      const svg = logoSvgClone(type === "logo");
      if (svg) el.appendChild(svg);
    } else if (INFO_STAMP_IDS.includes(type)) {
      el.classList.add("info");
      el.innerHTML = infoStampHtml(type);
    } else {
      el.textContent = STAMP_TEXTS[type];
    }
    const n = stamps.length;
    const p = pos || { left: innerWidth * 0.3 + (n % 5) * 30, top: innerHeight * 0.22 + (n % 5) * 30 };
    el.style.left = p.left + "px";
    el.style.top = p.top + "px";
    document.body.appendChild(el);
    const entry = { type, el, size: STAMP_DEFAULT_SIZE[type] || 30 };
    applyStampSize(entry);
    el.addEventListener("pointerdown", (e) => {
      if (!open) return;
      setSelected({ type: "stamp", entry });
      stampDrag(e, el);
    });
    stamps.push(entry);
    return entry;
  }
  function removeStamp(entry) {
    const i = stamps.indexOf(entry);
    if (i < 0) return;
    entry.el.remove();
    stamps.splice(i, 1);
  }
  function clearStamps() {
    for (const s of [...stamps]) removeStamp(s);
  }
  function refreshCountStamps() {
    for (const st of stamps) if (INFO_STAMP_IDS.includes(st.type)) st.el.innerHTML = infoStampHtml(st.type);
  }

  // ---- UIパネル(サイクル式でコンパクトに) ----
  function cycleRow(label, getName, onCycle, noteText) {
    const row = document.createElement("div");
    row.className = "ph-row";
    const lb = document.createElement("span");
    lb.className = "ph-label";
    lb.textContent = label;
    row.appendChild(lb);
    const box = document.createElement("div");
    box.className = "ph-cycle";
    const prev = document.createElement("button");
    prev.className = "ph-arrow";
    prev.textContent = "◀";
    const val = document.createElement("span");
    val.className = "ph-val";
    const next = document.createElement("button");
    next.className = "ph-arrow";
    next.textContent = "▶";
    const refresh = () => { val.textContent = getName(); };
    prev.addEventListener("click", () => { onCycle(-1); refresh(); });
    next.addEventListener("click", () => { onCycle(1); refresh(); });
    refresh();
    box.appendChild(prev); box.appendChild(val); box.appendChild(next);
    row.appendChild(box);
    if (noteText) {
      const note = document.createElement("div");
      note.className = "ph-note";
      note.textContent = noteText;
      row.appendChild(note);
    }
    return row;
  }
  const step = (key, len) => (d) => { sel[key] = (sel[key] + d + len) % len; arrange(); };

  function rebuildOpts() {
    const ownedCards = collection.ownedKinds()
      .filter((id) => CARDS[id])
      .sort((a, b) => (CARDS[a].no || "").localeCompare(CARDS[b].no || ""));
    cardOpts = ownedCards.map((id) => ({ id, name: CARDS[id].name }));
    if (sel.cardType >= cardOpts.length) sel.cardType = 0;
    const spawned = deps.items.spawnedIds();
    cosOpts = COSTUMES.filter((c) => c.id === "suit" || spawned.costumes.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    if (sel.costume >= cosOpts.length) sel.costume = 0;
    // キャラ: おじさんは常時。ほかはカードバトルで勝った相手だけ(未勝利は🔒)
    charOpts = [{ id: "ojisan", name: "おじさん" }];
    for (const o of OPPONENTS) {
      if (o.key === "ojisan") continue; // おじさんは上と重複するので飛ばす
      const won = collection.winCount(o.key) > 0;
      if (won) charOpts.push({ id: o.key, name: o.label });
      else charOpts.push({ id: null, name: `🔒 ${o.key === "oshiriseijin" ? "???" : o.label}(勝利で解禁)` });
    }
    if (sel.charType >= charOpts.length) sel.charType = 0;
  }

  // 選択中オブジェクトの調整行(選択が変わるたびに中身を作り直す)
  let selRowEl = null;
  function refreshSelRow() {
    if (!selRowEl) return;
    selRowEl.innerHTML = "";
    if (!selected) {
      selRowEl.className = "ph-note";
      selRowEl.textContent = "キャラやカードをタップで選択 → ドラッグで移動(上下左右)できる";
      return;
    }
    selRowEl.className = "ph-row ph-selrow";
    const lb = document.createElement("span");
    lb.className = "ph-label";
    lb.textContent = "選択中";
    selRowEl.appendChild(lb);
    const box = document.createElement("div");
    box.className = "ph-opts";
    const name = document.createElement("span");
    name.className = "ph-selname";
    name.textContent = selectedName();
    box.appendChild(name);
    const mkBtn = (t, fn) => {
      const b = document.createElement("button");
      b.className = "ph-chip";
      b.textContent = t;
      b.addEventListener("click", fn);
      box.appendChild(b);
    };
    if (selected.type === "stamp") {
      // スタンプ: 大きさと削除だけ(奥行きは無い)
      const st = selected.entry;
      const stepOf = { logo: 26, butt: 22, count: 2, slaps: 2, topitem: 2, t1: 4, t2: 4, t3: 4, t4: 6 };
      const minOf = { logo: 110, butt: 80, count: 10, slaps: 10, topitem: 10, t1: 14, t2: 14, t3: 14, t4: 20 };
      const maxOf = { logo: 480, butt: 420, count: 32, slaps: 32, topitem: 32, t1: 110, t2: 110, t3: 110, t4: 160 };
      mkBtn("小さく", () => { st.size = Math.max(minOf[st.type], st.size - stepOf[st.type]); applyStampSize(st); });
      mkBtn("大きく", () => { st.size = Math.min(maxOf[st.type], st.size + stepOf[st.type]); applyStampSize(st); });
      mkBtn("削除", () => { removeStamp(st); setSelected(null); });
      selRowEl.appendChild(box);
      return;
    }
    const obj = selectedObj();
    mkBtn("小さく", () => { const s = Math.max(0.35, obj.scale.x - 0.12); obj.scale.setScalar(s); });
    mkBtn("大きく", () => { const s = Math.min(3.0, obj.scale.x + 0.12); obj.scale.setScalar(s); });
    mkBtn("奥へ", () => { obj.position.z = Math.min(4.5, obj.position.z + 0.3); });
    mkBtn("手前へ", () => { obj.position.z = Math.max(selected.type === "card" ? -1.2 : -1.9, obj.position.z - 0.3); });
    if (selected.type === "char") {
      mkBtn("コメント変更", () => rerollLine(selected.entry));
    }
    mkBtn("削除", () => {
      if (selected.type === "card") removeCard(selected.entry);
      else removeChar(selected.entry);
      setSelected(null);
    });
    selRowEl.appendChild(box);
  }

  function buildUi() {
    ui.innerHTML = "";
    const head = document.createElement("div");
    head.className = "ph-head";
    head.innerHTML = '<span class="ph-title">📷 しゃしんモード</span>';
    const btns = document.createElement("div");
    btns.className = "ph-headbtns";
    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.className = "ph-btn" + (cls ? " " + cls : "");
      b.textContent = label;
      b.addEventListener("click", fn);
      btns.appendChild(b);
      return b;
    };
    mk("📥 保存", "", savePng);
    mk("📤 共有", "", sharePng);
    // 最小化: 背景以下の欄(②③)をたたむ。選択中欄とヘッダは残る
    const miniBtn = mk("最小化", "", () => {
      const mini = ui.classList.toggle("mini");
      miniBtn.textContent = mini ? "全表示" : "最小化";
    });
    // メニューをかくす: すべてのメニューを消す(復帰ボタンも出さない)。画面のどこかをクリックで戻る
    mk("メニューをかくす", "", hideAllUi);
    mk("とじる", "main", exit);
    head.appendChild(btns);
    ui.appendChild(head);

    // 3グループで色分け: ①選択中(ピンク) ②被写体まわり(白) ③カメラ・演出(青)
    const g1 = document.createElement("div");
    g1.className = "ph-group ph-g1";
    const g2 = document.createElement("div");
    g2.className = "ph-group ph-g2";
    const g3 = document.createElement("div");
    g3.className = "ph-group ph-g3";
    ui.appendChild(g1);
    ui.appendChild(g2);
    ui.appendChild(g3);

    // ① 選択中(一番上)
    selRowEl = document.createElement("div");
    g1.appendChild(selRowEl);
    refreshSelRow();

    // ② 背景〜コメント
    g2.appendChild(cycleRow("背景", () => BGS[sel.bg].name, step("bg", BGS.length)));

    // キャラ: 種類を選んで「追加」で1体ずつ置く(未勝利は🔒で追加不可)
    const pRow = document.createElement("div");
    pRow.className = "ph-row";
    const plb = document.createElement("span");
    plb.className = "ph-label";
    plb.textContent = "キャラ";
    pRow.appendChild(plb);
    const pbox = document.createElement("div");
    pbox.className = "ph-cycle";
    const pprev = document.createElement("button");
    pprev.className = "ph-arrow"; pprev.textContent = "◀";
    const pval = document.createElement("span");
    pval.className = "ph-val";
    const pnext = document.createElement("button");
    pnext.className = "ph-arrow"; pnext.textContent = "▶";
    const prefresh = () => { pval.textContent = charOpts[sel.charType].name; };
    pprev.addEventListener("click", () => { sel.charType = (sel.charType - 1 + charOpts.length) % charOpts.length; prefresh(); });
    pnext.addEventListener("click", () => { sel.charType = (sel.charType + 1) % charOpts.length; prefresh(); });
    prefresh();
    const padd = document.createElement("button");
    padd.className = "ph-chip";
    padd.textContent = "＋追加";
    padd.addEventListener("click", () => {
      const id = charOpts[sel.charType].id;
      if (id) { addChar(id); arrange(); }
    });
    const pclear = document.createElement("button");
    pclear.className = "ph-chip";
    pclear.textContent = "全削除";
    pclear.addEventListener("click", () => { clearChars(); setSelected(null); });
    pbox.appendChild(pprev); pbox.appendChild(pval); pbox.appendChild(pnext);
    pRow.appendChild(pbox);
    pRow.appendChild(padd);
    pRow.appendChild(pclear);
    const anyLocked = charOpts.some((o) => o.name.startsWith("🔒"));
    if (anyLocked) {
      const note = document.createElement("div");
      note.className = "ph-note";
      note.textContent = "カードバトルで勝つとキャラに選べるぞ";
      pRow.appendChild(note);
    }
    g2.appendChild(pRow);

    // カード: 種類を選んで「追加」で1枚ずつ置く(所持枚数まで)
    const cardRow = document.createElement("div");
    cardRow.className = "ph-row cardrow";
    const clb = document.createElement("span");
    clb.className = "ph-label";
    clb.textContent = "カード";
    cardRow.appendChild(clb);
    const cbox = document.createElement("div");
    cbox.className = "ph-cycle";
    const cprev = document.createElement("button");
    cprev.className = "ph-arrow"; cprev.textContent = "◀";
    const cval = document.createElement("span");
    cval.className = "ph-val wrap"; // 長いカード名も折り返して全部見せる
    const cnext = document.createElement("button");
    cnext.className = "ph-arrow"; cnext.textContent = "▶";
    // 残り枚数は名前と分けてバッジで出す
    const cleft = document.createElement("span");
    cleft.className = "ph-leftbadge";
    const crefresh = () => {
      if (!cardOpts.length) { cval.textContent = "(未所持)"; cleft.textContent = ""; return; }
      const id = cardOpts[sel.cardType].id;
      const left = (collection.ownedCount(id) || 0) - placedCount(id);
      cval.textContent = cardOpts[sel.cardType].name;
      cleft.textContent = `のこり${left}枚`;
      cleft.classList.toggle("zero", left <= 0);
    };
    refreshCardVal = crefresh;
    cprev.addEventListener("click", () => { if (cardOpts.length) { sel.cardType = (sel.cardType - 1 + cardOpts.length) % cardOpts.length; crefresh(); } });
    cnext.addEventListener("click", () => { if (cardOpts.length) { sel.cardType = (sel.cardType + 1) % cardOpts.length; crefresh(); } });
    crefresh();
    const cadd = document.createElement("button");
    cadd.className = "ph-chip";
    cadd.textContent = "＋追加";
    cadd.addEventListener("click", () => { if (cardOpts.length) { addCard(cardOpts[sel.cardType].id); arrange(); } });
    const cclear = document.createElement("button");
    cclear.className = "ph-chip";
    cclear.textContent = "全削除";
    cclear.addEventListener("click", () => { clearCards(); setSelected(null); arrange(); });
    cbox.appendChild(cprev); cbox.appendChild(cval); cbox.appendChild(cnext);
    cardRow.appendChild(cbox);
    cardRow.appendChild(cleft);
    cardRow.appendChild(cadd);
    cardRow.appendChild(cclear);
    g2.appendChild(cardRow);

    g2.appendChild(cycleRow("衣装", () => cosOpts[sel.costume].name, step("costume", cosOpts.length)));
    g2.appendChild(cycleRow("ポーズ", () => POSES[sel.pose].name, step("pose", POSES.length)));

    // スタンプ: 種類を選んで「追加」で1個ずつ置く(ドラッグ移動・選択中欄で拡縮/削除)
    const sRow = document.createElement("div");
    sRow.className = "ph-row";
    const slb = document.createElement("span");
    slb.className = "ph-label";
    slb.textContent = "スタンプ";
    sRow.appendChild(slb);
    const sbox = document.createElement("div");
    sbox.className = "ph-cycle";
    const sprev = document.createElement("button");
    sprev.className = "ph-arrow"; sprev.textContent = "◀";
    const sval = document.createElement("span");
    sval.className = "ph-val";
    const snext = document.createElement("button");
    snext.className = "ph-arrow"; snext.textContent = "▶";
    const srefresh = () => { sval.textContent = STAMP_TYPES[sel.stampType].name; };
    sprev.addEventListener("click", () => { sel.stampType = (sel.stampType - 1 + STAMP_TYPES.length) % STAMP_TYPES.length; srefresh(); });
    snext.addEventListener("click", () => { sel.stampType = (sel.stampType + 1) % STAMP_TYPES.length; srefresh(); });
    srefresh();
    const sadd = document.createElement("button");
    sadd.className = "ph-chip";
    sadd.textContent = "＋追加";
    sadd.addEventListener("click", () => { const st = addStamp(STAMP_TYPES[sel.stampType].id); if (st) setSelected({ type: "stamp", entry: st }); });
    const sclear = document.createElement("button");
    sclear.className = "ph-chip";
    sclear.textContent = "全削除";
    sclear.addEventListener("click", () => { clearStamps(); setSelected(null); });
    sbox.appendChild(sprev); sbox.appendChild(sval); sbox.appendChild(snext);
    sRow.appendChild(sbox);
    sRow.appendChild(sadd);
    sRow.appendChild(sclear);
    g2.appendChild(sRow);

    // ③ カメラ〜エフェクト
    g3.appendChild(cycleRow("カメラ", () => CAM_ZOOMS[sel.camZoom].name, step("camZoom", CAM_ZOOMS.length)));
    g3.appendChild(cycleRow("アングル", () => CAM_HEIGHTS[sel.camHeight].name, step("camHeight", CAM_HEIGHTS.length)));
    g3.appendChild(cycleRow("向き", () => CAM_SIDES[sel.camSide].name, step("camSide", CAM_SIDES.length)));
    g3.appendChild(cycleRow("照明", () => LIGHT_LEVELS[sel.lightLevel].name, step("lightLevel", LIGHT_LEVELS.length)));
    g3.appendChild(cycleRow("照明の色", () => LIGHT_COLORS[sel.lightColor].name, step("lightColor", LIGHT_COLORS.length)));
    g3.appendChild(cycleRow("フィルター", () => FILTERS[sel.filter].name, step("filter", FILTERS.length)));
    g3.appendChild(cycleRow("エフェクト", () => FX[sel.fx].name, step("fx", FX.length)));

    const hint = document.createElement("div");
    hint.className = "ph-note";
    hint.textContent = "スタンプはドラッグで移動、タップで大きさ変更・削除。キャラ16体・カード32枚・スタンプ32個まで";
    ui.appendChild(hint);
  }

  // ---- 保存/共有(すべてクライアント内で完結。サーバーには何も送らない) ----
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#fff"; }

  function drawSvgStamp(ctx, s, st) {
    const svg = st.el.querySelector("svg");
    if (!svg) return Promise.resolve();
    const withText = st.type === "logo";
    const rect = st.el.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    const map = { "--pk": cssVar("--pk"), "--pk-deep": cssVar("--pk-deep"), "--pk-pale": cssVar("--pk-pale"), "--ink": cssVar("--ink"), "--paper": cssVar("--paper") };
    clone.querySelectorAll("*").forEach((n) => {
      for (const attr of ["fill", "stroke"]) {
        const v = n.getAttribute(attr);
        if (v && v.startsWith("var(")) {
          const key = v.slice(4, -1).trim();
          n.setAttribute(attr, map[key] || "#fff");
        }
      }
    });
    clone.querySelectorAll("text").forEach((t) => t.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, rect.left * s, rect.top * s, rect.width * s, rect.height * s);
        if (withText) {
          // ロゴの文字はフォント未埋め込みでずれるため、canvas側でMochiyを使って描き直す
          const u = (rect.width * s) / 460;
          ctx.save();
          ctx.translate(rect.left * s + 230 * u, rect.top * s + 206 * u);
          ctx.transform(1, 0, Math.tan((-8 * Math.PI) / 180), 1, 0, 0);
          ctx.textAlign = "center";
          ctx.lineJoin = "round";
          ctx.font = `${66 * u}px "Mochiy Pop One", sans-serif`;
          ctx.strokeStyle = map["--ink"];
          ctx.lineWidth = 14 * u;
          ctx.strokeText("おしりオフィス", 0, 0);
          ctx.fillStyle = map["--paper"];
          ctx.fillText("おしりオフィス", 0, 0);
          ctx.font = `${17 * u}px "Mochiy Pop One", sans-serif`;
          ctx.lineWidth = 6 * u;
          const sub = "O S H I R I   O F F I C E";
          ctx.strokeText(sub, 0, 38 * u);
          ctx.fillStyle = map["--pk"];
          ctx.fillText(sub, 0, 38 * u);
          ctx.restore();
        }
        res();
      };
      img.onerror = () => res();
      img.src = url;
    });
  }

  // 情報スタンプ(累計pt/叩いた回数/一番叩いたアイテム)の合成描画。
  // 長いラベルはCSSと同じように文字単位で折り返す
  function drawInfoStamp(ctx, s, st) {
    const spec = infoStampSpec(st.type);
    const rect = st.el.getBoundingClientRect();
    const fs = st.size * s;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 4 * s;
    ctx.shadowOffsetY = 2 * s;
    const x = rect.left * s;
    let y = rect.top * s;
    const maxW = rect.width * s;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fs * 0.8}px "Hiragino Maru Gothic ProN", sans-serif`;
    let line = "";
    for (const ch of spec.label) {
      if (ch === "\n") {
        ctx.fillText(line, x, y);
        y += fs * 1.0;
        line = "";
      } else if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += fs * 1.0;
        line = ch;
      } else line += ch;
    }
    if (line) { ctx.fillText(line, x, y); y += fs * 1.0; }
    ctx.font = `${fs * 1.5}px "Mochiy Pop One", sans-serif`;
    ctx.fillStyle = spec.color;
    const w2 = ctx.measureText(spec.value).width;
    ctx.fillText(spec.value, x + Math.max(0, maxW - w2), y);
    ctx.restore();
  }

  // おしり文字スタンプ(フォント・色はCSSの.ph-stamp.tNと揃えてある)
  const TEXT_STAMP_STYLES = {
    t1: { font: '"Mochiy Pop One", sans-serif', weight: "", fillVar: "--pk", stroke: "#ffffff", lw: 0.16, skew: 0 },
    t2: { font: '"Hiragino Mincho ProN", "Yu Mincho", serif', weight: "800 ", fill: "#c22843", stroke: "#ffffff", lw: 0.12, skew: 0 },
    t3: { font: '"Hiragino Sans", sans-serif', weight: "900 ", fill: "#ffffff", strokeVar: "--ink", lw: 0.14, skew: -10 },
    t4: { font: '"Hiragino Mincho ProN", "Yu Mincho", serif', weight: "900 ", fill: "#ffd76e", stroke: "#3a2408", lw: 0.12, skew: 0 },
  };
  function drawTextStamp(ctx, s, st) {
    const cfg = TEXT_STAMP_STYLES[st.type];
    if (!cfg) return;
    const rect = st.el.getBoundingClientRect();
    const fs = st.size * s;
    ctx.save();
    ctx.translate((rect.left + rect.width / 2) * s, rect.top * s);
    if (cfg.skew) ctx.transform(1, 0, Math.tan((cfg.skew * Math.PI) / 180), 1, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.font = `${cfg.weight}${fs}px ${cfg.font}`;
    ctx.strokeStyle = cfg.strokeVar ? cssVar(cfg.strokeVar) : cfg.stroke;
    ctx.lineWidth = fs * cfg.lw;
    ctx.strokeText(STAMP_TEXTS[st.type], 0, 0);
    ctx.fillStyle = cfg.fillVar ? cssVar(cfg.fillVar) : cfg.fill;
    ctx.fillText(STAMP_TEXTS[st.type], 0, 0);
    ctx.restore();
  }

  function drawBubble(ctx, el, s) {
    if (!el || el.style.display === "none") return;
    const r = el.getBoundingClientRect();
    const x = r.left * s, y = r.top * s, w = r.width * s, h = r.height * s;
    const styles = getComputedStyle(el);
    const bgc = styles.backgroundColor;
    const tail = h * 0.14;
    const body = h - tail;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.4)";
    ctx.shadowOffsetX = 3 * s;
    ctx.shadowOffsetY = 3 * s;
    ctx.fillStyle = bgc;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.01, y + h * 0.06);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w * 0.98, y + body * 0.95);
    ctx.lineTo(x + w * 0.57, y + body);
    ctx.lineTo(x + w * 0.5, y + h);
    ctx.lineTo(x + w * 0.44, y + body);
    ctx.lineTo(x, y + body * 1.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = styles.color;
    const fs = parseFloat(styles.fontSize) * s;
    ctx.font = `${styles.fontWeight} ${fs}px ${styles.fontFamily}`;
    ctx.textBaseline = "top";
    const pad = 13 * s;
    const maxW = w - pad * 2;
    const text = el.textContent;
    let line = "", ty = y + 9 * s;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW) {
        ctx.fillText(line, x + pad, ty);
        ty += fs * 1.45;
        line = ch;
      } else line += ch;
    }
    if (line) ctx.fillText(line, x + pad, ty);
    ctx.restore();
  }

  async function composeShot() {
    const ringWas = ring.visible;
    ring.visible = false; // 選択リングは写さない
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    const ctx = cv.getContext("2d");
    // 画面フィルターは合成側にも同じ式で適用する(CSS filterはcanvas内容に乗らないため)
    const css = FILTERS[sel.filter].css;
    if (css) ctx.filter = css;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    ring.visible = ringWas;
    const s = src.width / innerWidth;
    // 実画面の重なり順に合わせる: 吹き出し(z6)→スタンプ(z23)
    for (const c of chars) drawBubble(ctx, c.bubbleEl, s);
    for (const st of stamps) {
      if (st.type === "logo" || st.type === "butt") await drawSvgStamp(ctx, s, st);
      else if (INFO_STAMP_IDS.includes(st.type)) drawInfoStamp(ctx, s, st);
      else drawTextStamp(ctx, s, st);
    }
    return cv;
  }

  async function savePng() {
    const cv = await composeShot();
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "oshiri_photo.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  }

  async function sharePng() {
    const cv = await composeShot();
    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    if (!blob) return;
    const file = new File([blob], "oshiri_photo.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: SHARE_TEXT });
        return;
      } catch { return; }
    }
    await savePng();
    window.open("https://x.com/intent/post?text=" + encodeURIComponent(SHARE_TEXT), "_blank", "noopener");
  }

  // ---- 入退場 ----
  function enter() {
    if (open) return;
    open = true;
    saved = {
      camPos: camera.position.clone(),
      camQuat: camera.quaternion.clone(),
      target: controls.target.clone(),
      ctrlEnabled: controls.enabled,
      fog: scene.fog,
      fov: camera.fov,
      costume: ojisan.getCostume(),
      ojiPos: ojisan.group.position.clone(),
      ojiRot: ojisan.group.rotation.clone(),
    };
    controls.enabled = false;
    camera.fov = 60;
    camera.updateProjectionMatrix();
    rebuildOpts();
    const ci = cosOpts.findIndex((c) => c.id === ojisan.getCostume());
    if (ci >= 0) sel.costume = ci;
    document.body.classList.add("photo-on");
    document.body.classList.add("photo-edit");
    hideGameBubbles();
    buildUi();
    ui.classList.add("show");
    peekEl.classList.remove("show");
    // デフォルトは主役おじさん1人+ロゴと累計ポイントのスタンプ
    addChar("ojisan", { mainObj: ojisan.group, pos: OJI_SPOT, silent: true });
    addStamp("logo", { left: 12, top: 10 });
    addStamp("count", { left: Math.max(20, innerWidth - 240), top: 16 });
    arrange();
    peekEl.addEventListener("click", onPeek);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
  }

  function onPeek() {
    peekEl.classList.remove("show");
    ui.classList.add("show");
    document.body.classList.add("photo-edit");
  }

  // 「UIをかくす」: パネル・編集ツマミごと全部消し、次の画面クリック1回で復帰する。
  // captureで先取りして、復帰クリックがキャラ選択やドラッグに化けないようにする
  function restoreUi(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    window.removeEventListener("pointerdown", restoreUi, true);
    if (!open) return;
    ui.classList.add("show");
    document.body.classList.add("photo-edit");
  }
  function hideAllUi() {
    ui.classList.remove("show");
    document.body.classList.remove("photo-edit");
    peekEl.classList.remove("show");
    window.addEventListener("pointerdown", restoreUi, true);
  }

  function exit() {
    if (!open) return;
    open = false;
    peekEl.removeEventListener("click", onPeek);
    window.removeEventListener("pointerdown", restoreUi, true);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    onPointerUp();
    ui.classList.remove("show");
    peekEl.classList.remove("show");
    document.body.classList.remove("photo-on");
    document.body.classList.remove("photo-edit");
    renderer.domElement.style.filter = "";

    setSelected(null);
    clearStamps();
    clearChars();
    applyClones(false);
    clearCards();
    if (stage) stage.group.visible = false;

    // 主役おじさんは(写真中に削除されていても)必ず部屋へ戻す
    scene.add(ojisan.group);
    ojisan.group.position.copy(saved.ojiPos);
    ojisan.group.position.y = 0;
    ojisan.group.rotation.copy(saved.ojiRot);
    ojisan.group.scale.setScalar(1);
    ojisan.setCostume(saved.costume);
    if (formation.parent) formation.parent.remove(formation);

    scene.fog = saved.fog;
    camera.fov = saved.fov;
    camera.updateProjectionMatrix();
    camera.position.copy(saved.camPos);
    camera.quaternion.copy(saved.camQuat);
    controls.target.copy(saved.target);
    controls.enabled = saved.ctrlEnabled;
    saved = null;
  }

  function update() {
    camera.position.copy(formation.localToWorld(camLocal()));
    camera.lookAt(formation.localToWorld(LOOK_LOCAL.clone()));
    for (const c of chars) placeAt(c.bubbleEl, charAnchor(c));
    if (selected) updateRing();
  }

  btn.addEventListener("click", () => {
    if (open) exit();
    else if (deps.canOpen ? deps.canOpen() : true) enter();
  });

  return {
    get isOpen() { return open; },
    enter,
    exit,
    update,
    _compose: composeShot, // デバッグ用(合成結果の確認)
  };
}
