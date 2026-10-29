import * as THREE from "three";

// ---- colors ----
const BROWN = 0x8a5a34;
const BROWN_DARK = 0x6e4526;
const TAN = 0xdba36a;
const TAN_LIGHT = 0xe9c093;
const PINK = 0xf3a8b6;
const DARK = 0x2a1c14;
const WHITE = 0xffffff;
const HEART = 0xff5c8a;

function mat(color, roughness = 0.75, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function ease(x) {
  return x * x * (3 - 2 * x);
}

export function createAnimal(scene) {
  const group = new THREE.Group();
  group.position.set(2.2, 0, 0.8);
  group.rotation.y = -Math.PI / 2; // face -x, toward the room center
  scene.add(group);

  const clickableMeshes = [];

  function addMesh(geo, material, parent, pos, scaleV) {
    const m = new THREE.Mesh(geo, material);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scaleV) m.scale.set(scaleV[0], scaleV[1], scaleV[2]);
    parent.add(m);
    clickableMeshes.push(m);
    return m;
  }

  // dancer: local root for stepping/bouncing/spinning, always near "home"
  const dancer = new THREE.Group();
  group.add(dancer);

  // ---- materials ----
  const bodyMat = mat(BROWN);
  const bellyMat = mat(TAN_LIGHT, 0.8);
  const earOuterMat = mat(BROWN_DARK);
  const earInnerMat = mat(PINK, 0.6);
  const muzzleMat = mat(TAN);
  const noseMat = mat(DARK, 0.4, 0.1);
  const mouthMat = mat(DARK, 0.4, 0.1);
  const eyeMat = mat(DARK, 0.3, 0.1);
  const highlightMat = mat(WHITE, 0.2, 0);
  const pawPadMat = mat(TAN, 0.7);
  const tailMat = mat(BROWN_DARK);
  const heartMat = mat(HEART, 0.4, 0.1);
  heartMat.transparent = true;

  // ================= HIPS (lower torso) =================
  const hips = new THREE.Group();
  hips.position.set(0, 0.3, 0);
  dancer.add(hips);

  function makeLeg(xSign) {
    const pivot = new THREE.Group();
    pivot.position.set(xSign * 0.15, 0, 0.01);
    hips.add(pivot);
    const leg = addMesh(new THREE.CapsuleGeometry(0.09, 0.09, 4, 12), bodyMat, pivot, [0, -0.135, 0]);
    const foot = addMesh(new THREE.SphereGeometry(0.1, 16, 12), bodyMat, pivot, [0, -0.27, 0.03]);
    foot.scale.set(1.1, 0.55, 1.35);
    const pad = addMesh(new THREE.SphereGeometry(0.05, 12, 10), pawPadMat, pivot, [0, -0.3, 0.09]);
    pad.scale.set(1, 0.4, 0.8);
    return { pivot, leg, foot, pad };
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // ================= TORSO (upper body, twists opposite to hips) =================
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.09, 0);
  hips.add(torsoPivot);

  const torso = addMesh(new THREE.SphereGeometry(0.24, 24, 20), bodyMat, torsoPivot, [0, 0.16, 0]);
  torso.scale.set(1, 1.15, 0.92);

  const belly = addMesh(new THREE.SphereGeometry(0.18, 20, 16), bellyMat, torsoPivot, [0, 0.12, 0.19]);
  belly.scale.set(0.95, 1.05, 0.65);

  const tail = addMesh(new THREE.SphereGeometry(0.055, 14, 10), tailMat, torsoPivot, [0, 0.05, -0.24]);

  // ---- arms (children of torso) ----
  function makeArm(xSign) {
    const shoulder = new THREE.Group();
    shoulder.position.set(xSign * 0.24, 0.2, 0);
    torsoPivot.add(shoulder);
    const upperArm = addMesh(new THREE.CapsuleGeometry(0.06, 0.14, 4, 10), bodyMat, shoulder, [0, -0.1, 0]);
    const paw = addMesh(new THREE.SphereGeometry(0.06, 16, 12), bodyMat, shoulder, [0, -0.2, 0]);
    const pad = addMesh(new THREE.SphereGeometry(0.028, 10, 8), pawPadMat, shoulder, [0, -0.2, 0.045]);
    const baseZ = xSign * -0.3;
    shoulder.rotation.z = baseZ;
    return { shoulder, upperArm, paw, pad, baseZ };
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ---- head (child of torso) ----
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.43, 0.02);
  torsoPivot.add(headPivot);

  const head = addMesh(new THREE.SphereGeometry(0.19, 24, 20), bodyMat, headPivot, [0, 0, 0]);

  function makeEar(xSign) {
    const outer = addMesh(new THREE.SphereGeometry(0.075, 16, 12), earOuterMat, headPivot, [xSign * 0.14, 0.13, 0.02]);
    const inner = addMesh(new THREE.SphereGeometry(0.045, 14, 10), earInnerMat, headPivot, [xSign * 0.14, 0.13, 0.06]);
    return { outer, inner };
  }
  const earL = makeEar(-1);
  const earR = makeEar(1);

  const muzzle = addMesh(new THREE.SphereGeometry(0.1, 18, 14), muzzleMat, headPivot, [0, -0.03, 0.15]);
  muzzle.scale.set(1, 0.85, 0.9);

  const nose = addMesh(new THREE.SphereGeometry(0.032, 12, 10), noseMat, headPivot, [0, 0.02, 0.24]);

  // permanent smile: thin dark torus arc, always visible
  const mouth = addMesh(new THREE.TorusGeometry(0.055, 0.008, 8, 24, Math.PI), mouthMat, headPivot, [0, -0.06, 0.2]);
  mouth.rotation.x = Math.PI / 2 + 0.35;
  mouth.rotation.z = Math.PI;

  function makeEye(xSign) {
    const grp = new THREE.Group();
    grp.position.set(xSign * 0.075, 0.05, 0.155);
    headPivot.add(grp);
    const ball = addMesh(new THREE.SphereGeometry(0.032, 16, 12), eyeMat, grp, [0, 0, 0]);
    const hl = addMesh(new THREE.SphereGeometry(0.01, 8, 8), highlightMat, grp, [0.012, 0.012, 0.026]);
    // happy closed-eye arc, hidden until pet()
    const happy = addMesh(new THREE.TorusGeometry(0.026, 0.007, 8, 16, Math.PI), mouthMat, grp, [0, 0, 0.01]);
    happy.rotation.x = Math.PI / 2;
    happy.rotation.z = Math.PI;
    happy.visible = false;
    return { grp, ball, hl, happy };
  }
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);

  // ---- heart (pet reaction, hidden by default) ----
  const heart = new THREE.Group();
  heart.position.set(0, 1.15, 0.05);
  heart.visible = false;
  dancer.add(heart);
  const heartL = addMesh(new THREE.SphereGeometry(0.045, 14, 10), heartMat, heart, [-0.03, 0.02, 0]);
  const heartR = addMesh(new THREE.SphereGeometry(0.045, 14, 10), heartMat, heart, [0.03, 0.02, 0]);
  const heartBox = addMesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), heartMat, heart, [0, -0.025, 0]);
  heartBox.rotation.z = Math.PI / 4;

  // ================= animation state =================
  let beatPhase = 0;
  let curP = 0;
  let targetP = 0;

  const PET_DURATION = 1.2;
  let petActive = false;
  let petTimer = 0;

  function update(t, dtIn) {
    const dt = clamp(dtIn || 0.016, 0, 0.05);

    // ease current dance progress toward the target (smooth crossfade, no snapping)
    curP += (targetP - curP) * Math.min(1, dt * 3);

    // internal tempo, rises with progress: ~90 -> ~160 BPM
    const bpm = 90 + curP * 70;
    beatPhase += ((bpm / 60) * Math.PI * 2) * dt;

    // smooth per-stage weights that crossfade across the p ranges
    const w0 = 1 - smoothstep(0.12, 0.22, curP);
    const w1 = smoothstep(0.12, 0.22, curP) - smoothstep(0.38, 0.48, curP);
    const w2 = smoothstep(0.38, 0.48, curP) - smoothstep(0.63, 0.73, curP);
    const w3 = smoothstep(0.63, 0.73, curP) - smoothstep(0.85, 0.93, curP);
    const w4 = smoothstep(0.85, 0.93, curP);

    // freeze the dance while being petted (fades out, then back in)
    let danceScale = 1;
    if (petActive) {
      const pp = clamp(petTimer / PET_DURATION, 0, 1);
      danceScale = pp < 0.5 ? 1 - smoothstep(0, 0.15, pp) : smoothstep(0.85, 1, pp);
    }

    // ---- body movement ----
    let bounceY =
      danceScale *
      (w0 * 0.008 * Math.abs(Math.sin(beatPhase * 0.5)) +
        w1 * 0.02 * Math.abs(Math.sin(beatPhase)) +
        w3 * 0.07 * Math.abs(Math.sin(beatPhase)) +
        w4 * (0.05 * Math.abs(Math.sin(beatPhase * 1.5)) + 0.05 * Math.max(0, Math.sin(beatPhase * 3))));

    let stepX = danceScale * (w1 * 0.16 * Math.sin(beatPhase) + w3 * 0.05 * Math.sin(beatPhase * 0.5));
    let stepZ = danceScale * (w1 * 0.02 * Math.cos(beatPhase * 2));
    const offLen = Math.hypot(stepX, stepZ);
    if (offLen > 0.4) {
      const s = 0.4 / offLen;
      stepX *= s;
      stepZ *= s;
    }

    // occasional full spin during the groove stage
    let spinY = 0;
    const spinCycle = Math.PI * 8;
    const cyclePos = beatPhase % spinCycle;
    const spinWindow = Math.PI * 2;
    if (cyclePos < spinWindow) {
      spinY = danceScale * w3 * ease(cyclePos / spinWindow) * Math.PI * 2;
    }

    dancer.position.set(stepX, bounceY, stepZ);
    dancer.rotation.y = spinY;

    // hip sway / twist
    const swayZ = danceScale * (w0 * 0.18 * Math.sin(beatPhase * 0.6) + w2 * 0.05 * Math.sin(beatPhase * 1.5));
    const hipTwistY = danceScale * w2 * 0.4 * Math.sin(beatPhase * 1.5);
    hips.rotation.z = swayZ;
    hips.rotation.y = hipTwistY;

    // torso counter-twist
    torsoPivot.rotation.y = danceScale * w2 * -0.55 * Math.sin(beatPhase * 1.5);

    // head bob / tilt
    headPivot.rotation.x = 0;
    headPivot.rotation.z = danceScale * (w0 * 0.1 * Math.sin(beatPhase * 0.6 + 0.3) + w2 * 0.08 * Math.sin(beatPhase * 1.5));
    headPivot.rotation.y = danceScale * w2 * 0.15 * Math.sin(beatPhase * 1.5 + 0.5);

    // ---- arms ----
    const armSwingL_X =
      danceScale * (w1 * 0.9 * Math.sin(beatPhase) + w2 * 0.35 * Math.sin(beatPhase * 1.5) + w3 * 0.7 * Math.sin(beatPhase * 1.3));
    const armSwingR_X = danceScale * (-w1 * 0.9 * Math.sin(beatPhase) + w3 * 0.7 * Math.sin(beatPhase * 1.3 + Math.PI));

    const armRaiseL_Z = danceScale * (w0 * 0.55 * Math.sin(beatPhase * 0.6) + w4 * (1.3 + 0.4 * Math.sin(beatPhase * 3)));
    const armRaiseR_Z =
      danceScale * (-w0 * 0.55 * Math.sin(beatPhase * 0.6 + Math.PI) - w2 * 1.7 - w4 * (1.3 + 0.4 * Math.sin(beatPhase * 3 + Math.PI)));

    armL.shoulder.rotation.x = armSwingL_X;
    armR.shoulder.rotation.x = armSwingR_X;
    armL.shoulder.rotation.z = armL.baseZ + armRaiseL_Z;
    armR.shoulder.rotation.z = armR.baseZ + armRaiseR_Z;

    // ---- legs (small steps) ----
    const legLiftL = danceScale * (w1 * Math.max(0, Math.sin(beatPhase)) * 0.35 + w4 * Math.max(0, Math.sin(beatPhase * 3)) * 0.3);
    const legLiftR = danceScale * (w1 * Math.max(0, -Math.sin(beatPhase)) * 0.35 + w4 * Math.max(0, -Math.sin(beatPhase * 3)) * 0.3);
    legL.pivot.rotation.x = -legLiftL;
    legR.pivot.rotation.x = -legLiftR;

    // ---- pet reaction ----
    if (petActive) {
      petTimer += dt;
      const pp = clamp(petTimer / PET_DURATION, 0, 1);

      eyeL.ball.visible = eyeL.hl.visible = false;
      eyeR.ball.visible = eyeR.hl.visible = false;
      eyeL.happy.visible = eyeR.happy.visible = true;

      const tiltIn = smoothstep(0, 0.2, pp) - smoothstep(0.85, 1, pp);
      headPivot.rotation.x -= 0.25 * tiltIn;
      headPivot.rotation.z += 0.3 * tiltIn;

      // delighted wiggle, decaying
      const wiggle = Math.sin(petTimer * 26) * 0.28 * (1 - pp);
      dancer.rotation.y += wiggle * 0.3;
      hips.rotation.z += wiggle * 0.5;

      // heart: pop in, float up, fade out
      const scaleIn = smoothstep(0, 0.2, pp);
      const floatY = smoothstep(0.15, 1, pp) * 0.55;
      const fadeOut = 1 - smoothstep(0.55, 1, pp);
      heart.visible = scaleIn > 0.01;
      heart.scale.setScalar(scaleIn);
      heart.position.set(0, 1.15 + floatY, 0.05);
      heartMat.opacity = fadeOut;

      if (petTimer >= PET_DURATION) {
        petActive = false;
        heart.visible = false;
      }
    } else {
      eyeL.ball.visible = eyeL.hl.visible = true;
      eyeR.ball.visible = eyeR.hl.visible = true;
      eyeL.happy.visible = eyeR.happy.visible = false;
      heart.visible = false;
    }
  }

  function setProgress(p) {
    targetP = clamp(p, 0, 1);
  }

  function pet() {
    petActive = true;
    petTimer = 0;
    heartMat.opacity = 1;
  }

  return { group, clickableMeshes, update, setProgress, pet };
}
