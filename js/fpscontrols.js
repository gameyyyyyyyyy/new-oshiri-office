import * as THREE from "three";

// FPS movement + look controls (keyboard + mobile virtual sticks) + crosshair UI.
// Self-contained module: injects its own DOM/CSS, owns yaw/pitch state.

const EYE_HEIGHT = 1.5;
const MOVE_SPEED = 2.2; // m/s
const YAW_SPEED = 1.9; // rad/s (keyboard)
const PITCH_SPEED = 1.3; // rad/s (keyboard)
const PITCH_LIMIT = THREE.MathUtils.degToRad(60);
const WALL_LIMIT = 2.7;
const START_POS = new THREE.Vector3(0, EYE_HEIGHT, -2.2);
const FOV = 42;

const LOOK_PITCH_DEG_PER_PX = 0.3;
const LOOK_YAW_DEG_PER_PX = 0.2;
const TAP_MAX_MS = 200;
const TAP_MAX_MOVE = 10;

export function createFPSControls(camera, domElement) {
  let enabled = false;
  // 設定パネルから変更できる感度倍率
  const sens = { look: 1, stick: 1, move: 1 };
  function setSensitivity(v) {
    if (v.look) sens.look = v.look;
    if (v.stick) sens.stick = v.stick;
    if (v.move) sens.move = v.move;
  }
  let previousFov = camera.fov;

  let yaw = 0;
  let pitch = 0;

  const keys = new Set();

  const isTouchDevice = "ontouchstart" in window;

  // ---------------------------------------------------------------------
  // DOM / CSS setup
  // ---------------------------------------------------------------------

  const style = document.createElement("style");
  style.textContent = `
    .fpsc-crosshair {
      position: fixed;
      top: 50%;
      left: 50%;
      width: 18px;
      height: 18px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      display: none;
      z-index: 1000;
      transition: color 0.15s ease, transform 0.15s ease;
      color: rgba(255, 255, 255, 0.7);
    }
    .fpsc-crosshair.fpsc-hot {
      color: rgba(255, 32, 96, 0.95);
      transform: translate(-50%, -50%) scale(1.25);
    }
    .fpsc-crosshair svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .fpsc-stick-outer {
      position: fixed;
      left: 24px;
      bottom: 24px;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
      border: 2px solid rgba(255, 255, 255, 0.25);
      touch-action: none;
      display: none;
      z-index: 1000;
    }
    .fpsc-stick-inner {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 52px;
      height: 52px;
      margin-left: -26px;
      margin-top: -26px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.35);
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);

  const crosshair = document.createElement("div");
  crosshair.className = "fpsc-crosshair";
  crosshair.innerHTML = `
    <svg viewBox="0 0 18 18">
      <line x1="9" y1="0" x2="9" y2="6" stroke="currentColor" stroke-width="1.5"/>
      <line x1="9" y1="12" x2="9" y2="18" stroke="currentColor" stroke-width="1.5"/>
      <line x1="0" y1="9" x2="6" y2="9" stroke="currentColor" stroke-width="1.5"/>
      <line x1="12" y1="9" x2="18" y2="9" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="9" cy="9" r="1.2" fill="currentColor"/>
    </svg>
  `;
  document.body.appendChild(crosshair);

  const stickOuter = document.createElement("div");
  stickOuter.className = "fpsc-stick-outer";
  const stickInner = document.createElement("div");
  stickInner.className = "fpsc-stick-inner";
  stickOuter.appendChild(stickInner);
  document.body.appendChild(stickOuter);

  // ---------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------

  const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

  function isTypingTarget() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA";
  }

  function onKeyDown(e) {
    if (!enabled) return;
    if (isTypingTarget()) return;
    if (ARROW_KEYS.has(e.code) || ARROW_KEYS.has(e.key)) {
      e.preventDefault();
    }
    keys.add(e.code || e.key);
  }

  function onKeyUp(e) {
    keys.delete(e.code || e.key);
  }

  function onBlur() {
    keys.clear();
  }

  // ---------------------------------------------------------------------
  // Virtual stick (movement + rotate)
  // ---------------------------------------------------------------------

  let uiHidden = false;
  let crosshairForced = false; // 神様モードで照準だけ出しているか
  let stickTouchId = null;
  let stickCenter = { x: 0, y: 0 };
  let stickVec = { x: 0, y: 0 }; // normalized -1..1

  const STICK_RADIUS = 60;

  function stickReset() {
    stickTouchId = null;
    stickVec.x = 0;
    stickVec.y = 0;
    stickInner.style.transform = "translate(0px, 0px)";
  }

  function updateStickVisual(dx, dy) {
    const dist = Math.min(Math.hypot(dx, dy), STICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * dist;
    const clampedY = Math.sin(angle) * dist;
    stickInner.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    stickVec.x = clampedX / STICK_RADIUS;
    stickVec.y = clampedY / STICK_RADIUS;
  }

  function onStickTouchStart(e) {
    if (stickTouchId !== null) return;
    const touch = e.changedTouches[0];
    stickTouchId = touch.identifier;
    const rect = stickOuter.getBoundingClientRect();
    stickCenter.x = rect.left + rect.width / 2;
    stickCenter.y = rect.top + rect.height / 2;
    updateStickVisual(touch.clientX - stickCenter.x, touch.clientY - stickCenter.y);
    e.preventDefault();
  }

  function onStickTouchMove(e) {
    if (stickTouchId === null) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === stickTouchId) {
        updateStickVisual(touch.clientX - stickCenter.x, touch.clientY - stickCenter.y);
        e.preventDefault();
        break;
      }
    }
  }

  function onStickTouchEnd(e) {
    if (stickTouchId === null) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === stickTouchId) {
        stickReset();
        e.preventDefault();
        break;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Look (window-level): swipe anywhere = look, quick tap = click (pass through)
  // 以前は右半分に透明レイヤーを重ねていたが、タップがゲームに届かなくなるため
  // windowレベルで監視する方式に変更(スティック・UI上のタッチは除外)
  // ---------------------------------------------------------------------

  let lookTouchId = null;
  let lookStart = { x: 0, y: 0, t: 0 };
  let lookLast = { x: 0, y: 0 };
  let lookIsDrag = false;

  function isUiTarget(t) {
    if (!t || !t.closest) return false;
    // 質問ウィンドウ(#controls)は、畳んでいる間は空の領域が残るだけなので
    // スワイプ視線を通す(💬ボタン自体は下の button 判定で除外される)
    const controls = t.closest("#controls");
    if (controls && !controls.classList.contains("collapsed")) return true;
    return !!t.closest(
      ".fpsc-stick-outer, button, input, #ending, #start-screen," +
      // 上に乗るオーバーレイの中では視点を動かさない。
      // ここを外すと touchmove の preventDefault で手札の横スクロールまで止まる
      "#battle-overlay, #hell-overlay, #rules-overlay, #zukan-overlay," +
      "#settings-overlay, #help-overlay, #board-overlay, #cine-caption, .bt-intro"
    );
  }

  function onLookTouchStart(e) {
    if (!enabled || uiHidden) return;
    if (lookTouchId !== null) return;
    const touch = e.changedTouches[0];
    if (touch.identifier === stickTouchId) return; // スティック操作中の指は無視
    if (isUiTarget(e.target)) return;
    lookTouchId = touch.identifier;
    lookStart.x = touch.clientX;
    lookStart.y = touch.clientY;
    lookStart.t = performance.now();
    lookLast.x = touch.clientX;
    lookLast.y = touch.clientY;
    lookIsDrag = false;
    // Do not preventDefault here: allow a plain tap to pass through.
  }

  function onLookTouchMove(e) {
    if (lookTouchId === null) return;
    let touch = null;
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) {
        touch = t;
        break;
      }
    }
    if (!touch) return;

    const dxTotal = touch.clientX - lookStart.x;
    const dyTotal = touch.clientY - lookStart.y;

    if (!lookIsDrag) {
      if (Math.hypot(dxTotal, dyTotal) > TAP_MAX_MOVE) {
        lookIsDrag = true;
      }
    }

    if (lookIsDrag) {
      const dx = touch.clientX - lookLast.x;
      const dy = touch.clientY - lookLast.y;
      yaw -= THREE.MathUtils.degToRad(dx * LOOK_YAW_DEG_PER_PX * sens.look);
      pitch += THREE.MathUtils.degToRad(-dy * LOOK_PITCH_DEG_PER_PX * sens.look);
      pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
      e.preventDefault();
    }

    lookLast.x = touch.clientX;
    lookLast.y = touch.clientY;
  }

  function onLookTouchEnd(e) {
    if (lookTouchId === null) return;
    let matched = false;
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) {
        matched = true;
        break;
      }
    }
    if (!matched) return;

    const elapsed = performance.now() - lookStart.t;
    const wasTap = !lookIsDrag && elapsed < TAP_MAX_MS;

    if (!wasTap && lookIsDrag) {
      e.preventDefault();
    }
    // If wasTap, do not preventDefault so a synthesized click / the game's
    // own pointerup handler can still fire for tap-to-slap interactions.

    lookTouchId = null;
    lookIsDrag = false;
  }

  // ---------------------------------------------------------------------
  // Mouse drag (PC): drag on the canvas to look around
  // ---------------------------------------------------------------------

  let mouseDragging = false;
  const mouseLast = { x: 0, y: 0 };

  function onMouseDown(e) {
    if (!enabled) return;
    if (e.button !== 0) return;
    if (e.pointerType === "touch") return; // タッチはスワイプ処理側で扱う
    mouseDragging = true;
    mouseLast.x = e.clientX;
    mouseLast.y = e.clientY;
  }

  function onMouseMove(e) {
    if (!mouseDragging) return;
    if (e.pointerType === "touch") return;
    const dx = e.clientX - mouseLast.x;
    const dy = e.clientY - mouseLast.y;
    yaw -= THREE.MathUtils.degToRad(dx * LOOK_YAW_DEG_PER_PX * sens.look);
    pitch += THREE.MathUtils.degToRad(-dy * LOOK_PITCH_DEG_PER_PX * sens.look);
    pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
    mouseLast.x = e.clientX;
    mouseLast.y = e.clientY;
  }

  function onMouseUp() {
    mouseDragging = false;
  }

  // ---------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------

  function applyKeyboard(dt) {
    if (isTypingTarget()) return;

    // 矢印キー = 視点(←→ 回転 / ↑↓ 見上げ・見下ろし)
    if (keys.has("ArrowLeft")) yaw += YAW_SPEED * sens.look * dt;
    if (keys.has("ArrowRight")) yaw -= YAW_SPEED * sens.look * dt;
    if (keys.has("ArrowUp")) pitch += PITCH_SPEED * sens.look * dt;
    if (keys.has("ArrowDown")) pitch -= PITCH_SPEED * sens.look * dt;
    pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);

    // W/S = 前後移動, A/D = 左右平行移動
    let moveDir = 0;
    if (keys.has("KeyW")) moveDir += 1;
    if (keys.has("KeyS")) moveDir -= 1;
    let strafeDir = 0;
    if (keys.has("KeyD")) strafeDir += 1;
    if (keys.has("KeyA")) strafeDir -= 1;

    if (moveDir !== 0 || strafeDir !== 0) {
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      // yaw=0 faces +z; forward = (sin(yaw), 0, cos(yaw)), right = (-cos(yaw), 0, sin(yaw))
      camera.position.x += (sinYaw * moveDir - cosYaw * strafeDir) * MOVE_SPEED * sens.move * dt;
      camera.position.z += (cosYaw * moveDir + sinYaw * strafeDir) * MOVE_SPEED * sens.move * dt;
    }
  }

  function applyStick(dt) {
    if (stickTouchId === null) return;
    // Vertical axis: up (negative screen dy) = forward.
    const forwardAmount = -stickVec.y; // -1..1
    const yawAmount = -stickVec.x; // horizontal drag rotates yaw

    yaw += yawAmount * YAW_SPEED * sens.stick * dt;

    if (Math.abs(forwardAmount) > 0.001) {
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      camera.position.x += sinYaw * forwardAmount * MOVE_SPEED * sens.move * dt;
      camera.position.z += cosYaw * forwardAmount * MOVE_SPEED * sens.move * dt;
    }
  }

  function update(dt) {
    if (!enabled) return;

    applyKeyboard(dt);
    applyStick(dt);

    pitch = THREE.MathUtils.clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -WALL_LIMIT, WALL_LIMIT);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -WALL_LIMIT, WALL_LIMIT);
    camera.position.y = EYE_HEIGHT;

    // 中央デスクの衝突(すり抜け防止)。デスクAABBをプレイヤー半径ぶん拡張し、
    // 侵入していたら食い込みが浅い軸方向へ押し出す
    {
      const minX = -1.0, maxX = 1.0, minZ = 0.05, maxZ = 1.45;
      const px = camera.position.x, pz = camera.position.z;
      if (px > minX && px < maxX && pz > minZ && pz < maxZ) {
        const pushLeft = px - minX;
        const pushRight = maxX - px;
        const pushFront = pz - minZ;
        const pushBack = maxZ - pz;
        const m = Math.min(pushLeft, pushRight, pushFront, pushBack);
        if (m === pushLeft) camera.position.x = minX;
        else if (m === pushRight) camera.position.x = maxX;
        else if (m === pushFront) camera.position.z = minZ;
        else camera.position.z = maxZ;
      }
    }

    const euler = new THREE.Euler(pitch, yaw + Math.PI, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
  }

  // ---------------------------------------------------------------------
  // Enable / disable
  // ---------------------------------------------------------------------

  function attachListeners() {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    domElement.addEventListener("pointerdown", onMouseDown);
    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerup", onMouseUp);

    if (isTouchDevice) {
      stickOuter.addEventListener("touchstart", onStickTouchStart, { passive: false });
      stickOuter.addEventListener("touchmove", onStickTouchMove, { passive: false });
      stickOuter.addEventListener("touchend", onStickTouchEnd, { passive: false });
      stickOuter.addEventListener("touchcancel", onStickTouchEnd, { passive: false });

      window.addEventListener("touchstart", onLookTouchStart, { passive: true });
      window.addEventListener("touchmove", onLookTouchMove, { passive: false });
      window.addEventListener("touchend", onLookTouchEnd, { passive: false });
      window.addEventListener("touchcancel", onLookTouchEnd, { passive: false });
    }
  }

  function removeListeners() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);

    domElement.removeEventListener("pointerdown", onMouseDown);
    window.removeEventListener("pointermove", onMouseMove);
    window.removeEventListener("pointerup", onMouseUp);

    if (isTouchDevice) {
      stickOuter.removeEventListener("touchstart", onStickTouchStart);
      stickOuter.removeEventListener("touchmove", onStickTouchMove);
      stickOuter.removeEventListener("touchend", onStickTouchEnd);
      stickOuter.removeEventListener("touchcancel", onStickTouchEnd);

      window.removeEventListener("touchstart", onLookTouchStart);
      window.removeEventListener("touchmove", onLookTouchMove);
      window.removeEventListener("touchend", onLookTouchEnd);
      window.removeEventListener("touchcancel", onLookTouchEnd);
    }
  }

  function enable() {
    if (enabled) return;
    enabled = true;

    previousFov = camera.fov;
    camera.fov = FOV;
    camera.updateProjectionMatrix();

    camera.position.copy(START_POS);
    yaw = 0;
    pitch = 0;
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw + Math.PI, 0, "YXZ"));

    keys.clear();
    stickReset();
    lookTouchId = null;
    lookIsDrag = false;

    crosshair.style.display = "block";
    crosshair.classList.remove("fpsc-hot");

    if (isTouchDevice) {
      stickOuter.style.display = uiHidden ? "none" : "block";
      domElement.style.touchAction = "none"; // スワイプ中のスクロール/バウンス防止
    }

    attachListeners();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;

    camera.fov = previousFov;
    camera.updateProjectionMatrix();

    crosshair.style.display = crosshairForced ? "block" : "none";
    crosshair.classList.remove("fpsc-hot");
    stickOuter.style.display = "none";
    domElement.style.touchAction = "";

    keys.clear();
    stickReset();
    lookTouchId = null;
    lookIsDrag = false;
    mouseDragging = false;

    removeListeners();
  }

  function setInRange(inRange) {
    if (inRange) {
      crosshair.classList.add("fpsc-hot");
    } else {
      crosshair.classList.remove("fpsc-hot");
    }
  }

  /**
   * FPSを有効にせず、照準だけ出す(神様モードで使う)。
   * enable/disable は自前で display を上書きするので、その値も覚えておく。
   */
  function setCrosshairVisible(on) {
    crosshairForced = !!on;
    crosshair.style.display = enabled || crosshairForced ? "block" : "none";
  }

  /** オーバーレイ表示中など、一時的にスティックを隠す(操作も止める) */
  function setUiHidden(hidden) {
    uiHidden = !!hidden;
    // クラス側の既定が display:none なので、戻すときは block を明示する
    stickOuter.style.display = uiHidden || !enabled || !isTouchDevice ? "none" : "block";
    if (uiHidden) stickReset();
  }

  return {
    enable,
    disable,
    update,
    setInRange,
    setSensitivity,
    setUiHidden,
    setCrosshairVisible,
    get enabled() {
      return enabled;
    },
  };
}
