// Reusable 54-Bone Seamless SkinnedMesh Base Person Character (Three.js / R3F + Smooth Cel Shading)
// Shared across the entire film: BasePerson4K standing T-pose showcase & Bottomless4K Acts I, II, IV, VI.
// Features:
// - Real 54-bone THREE.Skeleton + seamless continuous SkinnedMeshes (zero bumpy sphere joints or gaps!)
// - Smooth cel shading + clean BackSide silhouette ink outline (zero dots, zero internal seam smudges!)
// - Vibrant RED ribbed knit beanie, blank smooth porcelain face, shorter connected neck
// - Slim athletic green hoodless crewneck shirt with real 3D winking Ember print
// - Sleek aligned yellow jeans, firmly attached continuous hands & 5 fingers, grounded socks or trainers

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { continueRender, delayRender, staticFile } from "remotion";
import { useThree } from "@react-three/fiber";
import {
  type BodyShapeSettings,
  type FootwearMode,
  type PersonPoseMode,
  evaluateBasePersonPose,
  phoneScreenFlicker,
  phoneThumbScrollSignal,
} from "./basePersonRig";
import {
  applyPoseToSkeleton,
  buildBasePersonRig,
} from "./basePersonGeometry";
import type { HalftonePalette } from "../shared/halftoneMaterial";
import {
  createSkinnedOutlineMaterial,
  createSmoothCelMaterial,
  syncSmoothCelUniforms,
} from "../shared/smoothCelMaterial";

export interface BasePersonProps {
  tSec: number;
  pose?: PersonPoseMode;
  shape?: Partial<BodyShapeSettings>;
  footwear?: FootwearMode;
  holdPhone?: boolean;
  lookUpOverride?: number;
  palette?: HalftonePalette;
  width?: number;
  height?: number;
  cmykSplit?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  showContactShadow?: boolean;
  /** Optional external screen texture (e.g., Shot 11-14 Comments / Likes / Time Limit Reached) bound directly onto his real hand-held phone! */
  customScreenTexture?: THREE.Texture | null;
  /** 0 = gripping phone firmly, 1 = fingers opened wide for catching or releasing phone */
  handGripRelax?: number;
  /** 0..1 double-tap thumb pulse over the front screen */
  doubleTapPulse?: number;
  /** 0 = normal standing phone grip facing his eyes, 1 = arm extended forward catching phone facing +Z */
  catchOut?: number;
}

const DEFAULT_STUDIO_PALETTE: HalftonePalette = {
  paperColor: new THREE.Color("#f6f2ea"),
  fogColor: new THREE.Color("#cfc9be"),
  fogDensity: 0.010,
  lightDir: new THREE.Vector3(-0.28, 0.84, 0.62).normalize(),
  keyColor: new THREE.Color("#fffaf0"),
  fillColor: new THREE.Color("#aebcd6"),
  pointPos: new THREE.Vector3(0.0, 2.38, 0.65),
  pointColor: new THREE.Color("#fff3dc"),
  pointIntensity: 1.25,
};

function createBoundSkinnedMesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.bind(skeleton);
  return mesh;
}

const PHONE_FEED_THEMES = [
  { top: "#0f2247", bottom: "#071024", accent: "#4ad8ff" },
  { top: "#241645", bottom: "#0c091c", accent: "#ff72b6" },
  { top: "#103242", bottom: "#06151f", accent: "#56f0c8" },
  { top: "#2c1b36", bottom: "#100816", accent: "#ffb86c" },
] as const;

function drawProceduralPhoneScreen(ctx: CanvasRenderingContext2D, W: number, H: number, tSec: number): void {
  const thumb = phoneThumbScrollSignal(tSec);
  const flicker = phoneScreenFlicker(tSec);
  const len = PHONE_FEED_THEMES.length;

  const paintCard = (idx: number, offsetY: number) => {
    const theme = PHONE_FEED_THEMES[((idx % len) + len) % len];
    ctx.save();
    ctx.translate(0, offsetY);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, theme.top);
    bg.addColorStop(1, theme.bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle animated glowing abstract content card
    const pulse = 0.5 + 0.5 * Math.sin(tSec * 2.4 + idx * 1.7);
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.44, W * 0.04, W * 0.5, H * 0.44, W * 0.48);
    glow.addColorStop(0, theme.accent);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = 0.28 + pulse * 0.14;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // Minimal placeholder UI bars at bottom-left
    ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
    ctx.fillRect(W * 0.08, H * 0.80, W * 0.42, H * 0.016);
    ctx.fillStyle = "rgba(255, 255, 255, 0.44)";
    ctx.fillRect(W * 0.08, H * 0.835, W * 0.62, H * 0.012);
    ctx.restore();
  };

  ctx.clearRect(0, 0, W, H);
  const shiftY = -thumb.reelSlide * H;
  paintCard(thumb.reelIndex, shiftY);
  if (thumb.reelSlide > 0.004) {
    paintCard(thumb.reelIndex + 1, shiftY + H);
  }

  // Minimal phone status bar & home indicator
  ctx.fillStyle = "rgba(10, 14, 24, 0.9)";
  ctx.beginPath();
  ctx.roundRect(W * 0.34, H * 0.022, W * 0.32, H * 0.030, H * 0.015);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.beginPath();
  ctx.roundRect(W * 0.32, H * 0.968, W * 0.36, H * 0.008, H * 0.004);
  ctx.fill();

  // Subtle diagonal OLED glass specular reflection
  ctx.save();
  const glare = ctx.createLinearGradient(0, 0, W * 0.88, H * 0.52);
  glare.addColorStop(0, `rgba(180, 235, 255, ${(0.075 * flicker).toFixed(3)})`);
  glare.addColorStop(0.42, "rgba(180, 235, 255, 0.0)");
  glare.addColorStop(1, "rgba(180, 235, 255, 0.0)");
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

interface PhoneAttachment {
  group: THREE.Group;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  screenTex: THREE.CanvasTexture;
  screenMat: THREE.MeshBasicMaterial;
  dispose: () => void;
}

function buildPhoneAttachment(): PhoneAttachment {
  const group = new THREE.Group();
  group.name = "hand-smartphone";

  const canvas = document.createElement("canvas");
  canvas.width = 540;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (ctx) drawProceduralPhoneScreen(ctx, canvas.width, canvas.height, 0);

  const screenTex = new THREE.CanvasTexture(canvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.magFilter = THREE.LinearFilter;

  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(obj: T): T => {
    disposables.push(obj);
    return obj;
  };

  // 1. Matte dark-titanium primary chassis
  const bodyGeo = track(new THREE.BoxGeometry(0.077, 0.158, 0.0088));
  const bodyMat = track(
    new THREE.MeshStandardMaterial({ color: "#151a28", roughness: 0.28, metalness: 0.82 }),
  );
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  // 2. Chamfered brushed-titanium metallic bezel rim (catches cyan screen glow!)
  const bezelGeo = track(new THREE.BoxGeometry(0.0805, 0.1615, 0.0062));
  const bezelMat = track(
    new THREE.MeshStandardMaterial({
      color: "#2b3954",
      emissive: "#1b84bd",
      emissiveIntensity: 0.34,
      roughness: 0.22,
      metalness: 0.90,
    }),
  );
  group.add(new THREE.Mesh(bezelGeo, bezelMat));

  // 3. Subtle dark comic ink hull outline around chassis
  const rimGeo = track(new THREE.BoxGeometry(0.083, 0.164, 0.011));
  const rimMat = track(new THREE.MeshBasicMaterial({ color: "#0a0e1b", side: THREE.BackSide }));
  group.add(new THREE.Mesh(rimGeo, rimMat));

  // 4. Tactile metallic side power & volume buttons
  const sideBtnMat = track(
    new THREE.MeshStandardMaterial({ color: "#4e6285", roughness: 0.22, metalness: 0.92 }),
  );
  const powerBtnGeo = track(new THREE.BoxGeometry(0.0028, 0.020, 0.0038));
  const powerBtn = new THREE.Mesh(powerBtnGeo, sideBtnMat);
  powerBtn.position.set(0.0412, 0.022, 0);
  group.add(powerBtn);

  const volBtnGeo = track(new THREE.BoxGeometry(0.0028, 0.014, 0.0038));
  const volUp = new THREE.Mesh(volBtnGeo, sideBtnMat);
  volUp.position.set(-0.0412, 0.032, 0);
  group.add(volUp);
  const volDn = new THREE.Mesh(volBtnGeo, sideBtnMat);
  volDn.position.set(-0.0412, 0.012, 0);
  group.add(volDn);

  // 5. Recessed glossy black front glass plate + razor-sharp glowing 432x768 live Reels screen (+Z facing eyes!)
  const glassFrameGeo = track(new THREE.PlaneGeometry(0.074, 0.154));
  const glassFrameMat = track(
    new THREE.MeshStandardMaterial({ color: "#05070e", roughness: 0.12, metalness: 0.25 }),
  );
  const glassFrame = new THREE.Mesh(glassFrameGeo, glassFrameMat);
  glassFrame.position.set(0, 0, 0.0046);
  group.add(glassFrame);

  const screenGeo = track(new THREE.PlaneGeometry(0.070, 0.146));
  const screenMat = track(new THREE.MeshBasicMaterial({ map: screenTex }));
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(0, 0, 0.0051);
  group.add(screenMesh);

  // 6. Top micro earpiece speaker slit
  const earGeo = track(new THREE.BoxGeometry(0.015, 0.0016, 0.0012));
  const earMat = track(new THREE.MeshBasicMaterial({ color: "#1d273c" }));
  const earMesh = new THREE.Mesh(earGeo, earMat);
  earMesh.position.set(0, 0.0752, 0.0048);
  group.add(earMesh);

  // 7. Rear triple-lens glass camera module (-Z back of phone)
  const camIslandGeo = track(new THREE.BoxGeometry(0.030, 0.034, 0.0034));
  const camIslandMat = track(
    new THREE.MeshStandardMaterial({ color: "#0b0f1b", roughness: 0.20, metalness: 0.85 }),
  );
  const camIsland = new THREE.Mesh(camIslandGeo, camIslandMat);
  camIsland.position.set(-0.016, 0.052, -0.0056);
  group.add(camIsland);

  const lensRingGeo = track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.0024, 14));
  const lensRingMat = track(
    new THREE.MeshStandardMaterial({ color: "#3d5278", roughness: 0.18, metalness: 0.92 }),
  );
  const lensGlassGeo = track(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0026, 12));
  const lensGlassMat = track(
    new THREE.MeshStandardMaterial({
      color: "#091830",
      emissive: "#1a4880",
      emissiveIntensity: 0.35,
      roughness: 0.08,
      metalness: 0.4,
    }),
  );
  const lensCoords: [number, number][] = [
    [-0.023, 0.059],
    [-0.023, 0.045],
    [-0.009, 0.052],
  ];
  for (const [lx, ly] of lensCoords) {
    const ring = new THREE.Mesh(lensRingGeo, lensRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(lx, ly, -0.0074);
    group.add(ring);
    const glass = new THREE.Mesh(lensGlassGeo, lensGlassMat);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(lx, ly, -0.0076);
    group.add(glass);
  }

  // Nestled snugly & DEAD-UPRIGHT portrait inside his right palm (zero rightward tilt!):
  group.position.set(-0.010, -0.052, 0.020);
  group.rotation.set(0.0, 0.0, Math.PI / 2 + 0.64);

  return {
    group,
    canvas,
    ctx,
    screenTex,
    screenMat,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      screenTex.dispose();
    },
  };
}

export const BasePerson: React.FC<BasePersonProps> = ({
  tSec,
  pose = "tpose",
  shape,
  footwear = "socks",
  holdPhone,
  lookUpOverride = 0,
  palette = DEFAULT_STUDIO_PALETTE,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  showContactShadow = true,
  customScreenTexture = null,
  handGripRelax = 0,
  doubleTapPulse = 0,
  catchOut = 0,
}) => {
  const { invalidate } = useThree();
  const heavier = shape?.heavier ?? 0;
  const slimmer = shape?.slimmer ?? 0;
  const broader = shape?.broader ?? 0;
  const curvier = shape?.curvier ?? 0;
  const showPhone = holdPhone ?? (pose === "lyingPhone" || pose === "standingPhone");

  // Smooth cel-shaded materials + crisp inverted-hull outer silhouette outline
  // Green hoodie (with 3D winking Ember print) + Yellow jeans + Red ribbed beanie!
  const materials = useMemo(() => {
    return {
      skin: createSmoothCelMaterial({
        baseColor: "#f2f1ec",
        shadowColor: "#b4bac6",
        highlightColor: "#ffffff",
        rimColor: "#ffffff",
        rimStrength: 0.16,
      }),
      beanieRed: createSmoothCelMaterial({
        baseColor: "#d12a2a",
        shadowColor: "#6e1015",
        highlightColor: "#ee4b45",
        rimColor: "#ffb8b0",
        rimStrength: 0.24,
      }),
      hoodie: createSmoothCelMaterial({
        baseColor: "#2d914e",
        shadowColor: "#144b27",
        highlightColor: "#50be72",
        rimColor: "#c2f7d0",
        rimStrength: 0.22,
      }),
      jeans: createSmoothCelMaterial({
        baseColor: "#e8bc24",
        shadowColor: "#946b0a",
        highlightColor: "#fae06b",
        rimColor: "#fff4bd",
        rimStrength: 0.20,
      }),
      socks: createSmoothCelMaterial({
        baseColor: "#d0d4dc",
        shadowColor: "#858c9a",
        highlightColor: "#eceef4",
        rimStrength: 0.14,
      }),
      trainerUpper: createSmoothCelMaterial({
        baseColor: "#2d3444",
        shadowColor: "#131720",
        highlightColor: "#475269",
        rimStrength: 0.15,
      }),
      trainerSole: createSmoothCelMaterial({
        baseColor: "#f3f2ed",
        shadowColor: "#aeb4c0",
        highlightColor: "#ffffff",
        rimStrength: 0.10,
      }),
      outlineBody: createSkinnedOutlineMaterial("#141722", 0.0040),
      outlineFine: createSkinnedOutlineMaterial("#141722", 0.0014),
    };
  }, []);

  // Load the real 3D transparent-canvas winking Ember screenshot onto the green hoodie chest!
  useEffect(() => {
    let disposed = false;
    let loadedTex: THREE.Texture | null = null;
    const handle = delayRender("Loading 3D winking Ember shirt graphic");
    const loader = new THREE.TextureLoader();

    loader.load(
      staticFile("assets/ember-wink-3d.png"),
      (tex) => {
        if (disposed) {
          tex.dispose();
          continueRender(handle);
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        loadedTex = tex;
        materials.hoodie.uniforms.uDecalMap.value = tex;
        materials.hoodie.uniforms.uHasDecal.value = 1.0;
        materials.hoodie.needsUpdate = true;
        invalidate();
        continueRender(handle);
      },
      undefined,
      () => {
        continueRender(handle);
      },
    );

    return () => {
      disposed = true;
      if (loadedTex) loadedTex.dispose();
    };
  }, [materials, invalidate]);

  useEffect(() => {
    return () => {
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [materials]);

  // Build 54-bone Skeleton + continuous seamless SkinnedMeshes + bone-attached Smartphone
  const rigAssembly = useMemo(() => {
    const rig = buildBasePersonRig({ heavier, slimmer, broader, curvier });
    const container = new THREE.Group();
    container.add(rig.rootBone);

    const { skeleton, geometries } = rig;

    // Color SkinnedMeshes
    const hoodieMesh = createBoundSkinnedMesh(geometries.hoodie, materials.hoodie, skeleton);
    const jeansMesh = createBoundSkinnedMesh(geometries.jeans, materials.jeans, skeleton);
    const headNeckMesh = createBoundSkinnedMesh(geometries.headNeck, materials.skin, skeleton);
    const beanieMesh = createBoundSkinnedMesh(geometries.beanie, materials.beanieRed, skeleton);
    const handsMesh = createBoundSkinnedMesh(geometries.hands, materials.skin, skeleton);

    // Paired clean silhouette-only BackSide outline SkinnedMeshes (zero internal joint lines!)
    const hoodieOutline = createBoundSkinnedMesh(geometries.hoodie, materials.outlineBody, skeleton);
    const jeansOutline = createBoundSkinnedMesh(geometries.jeans, materials.outlineBody, skeleton);
    const headOutline = createBoundSkinnedMesh(geometries.headNeck, materials.outlineBody, skeleton);
    const beanieOutline = createBoundSkinnedMesh(geometries.beanie, materials.outlineBody, skeleton);
    const handsOutline = createBoundSkinnedMesh(geometries.hands, materials.outlineFine, skeleton);

    container.add(
      hoodieMesh,
      hoodieOutline,
      jeansMesh,
      jeansOutline,
      headNeckMesh,
      headOutline,
      beanieMesh,
      beanieOutline,
      handsMesh,
      handsOutline,
    );

    // Footwear groups toggled cleanly without rebuilding the rig!
    const socksGroup = new THREE.Group();
    socksGroup.add(
      createBoundSkinnedMesh(geometries.socks, materials.socks, skeleton),
      createBoundSkinnedMesh(geometries.socks, materials.outlineBody, skeleton),
    );

    const trainersGroup = new THREE.Group();
    trainersGroup.add(
      createBoundSkinnedMesh(geometries.trainersUpper, materials.trainerUpper, skeleton),
      createBoundSkinnedMesh(geometries.trainersUpper, materials.outlineBody, skeleton),
      createBoundSkinnedMesh(geometries.trainersSole, materials.trainerSole, skeleton),
      createBoundSkinnedMesh(geometries.trainersSole, materials.outlineFine, skeleton),
      createBoundSkinnedMesh(geometries.trainersAccent, materials.beanieRed, skeleton),
    );

    container.add(socksGroup, trainersGroup);

    // Bone-attached animated smartphone in right palm (moves locked to handR!)
    const phone = buildPhoneAttachment();
    rig.boneMap.handR.add(phone.group);

    return { rig, container, socksGroup, trainersGroup, phone };
  }, [heavier, slimmer, broader, curvier, materials]);

  useEffect(() => {
    return () => {
      Object.values(rigAssembly.rig.geometries).forEach((g) => g.dispose());
      rigAssembly.phone.dispose();
    };
  }, [rigAssembly]);

  // Toggle footwear & smartphone visibility cleanly
  rigAssembly.socksGroup.visible = footwear === "socks";
  rigAssembly.trainersGroup.visible = footwear === "trainers";
  rigAssembly.phone.group.visible = showPhone;

  // Update live animated Reels screen texture (or external custom scene texture) when holding phone
  if (showPhone) {
    if (customScreenTexture) {
      if (rigAssembly.phone.screenMat.map !== customScreenTexture) {
        rigAssembly.phone.screenMat.map = customScreenTexture;
        rigAssembly.phone.screenMat.needsUpdate = true;
      }
    } else {
      if (rigAssembly.phone.screenMat.map !== rigAssembly.phone.screenTex) {
        rigAssembly.phone.screenMat.map = rigAssembly.phone.screenTex;
        rigAssembly.phone.screenMat.needsUpdate = true;
      }
      if (rigAssembly.phone.ctx) {
        drawProceduralPhoneScreen(
          rigAssembly.phone.ctx,
          rigAssembly.phone.canvas.width,
          rigAssembly.phone.canvas.height,
          tSec,
        );
        rigAssembly.phone.screenTex.needsUpdate = true;
      }
    }
  }

  // Deterministically evaluate all 54 bones & apply to the live THREE.Skeleton every render
  const poseState = evaluateBasePersonPose(
    tSec,
    pose,
    { heavier, slimmer, broader, curvier },
    lookUpOverride,
    handGripRelax,
    doubleTapPulse,
    catchOut,
  );
  applyPoseToSkeleton(rigAssembly.rig, poseState);

  // Sync smooth cel lighting & fog uniforms
  Object.values(materials).forEach((m) => {
    syncSmoothCelUniforms(m, palette);
  });

  return (
    <group position={position} rotation={rotation} scale={[scale, scale, scale]}>
      {/* Soft grounded contact shadow beneath standing feet (y = 0.008, no Z-fighting!) */}
      {showContactShadow && pose !== "falling" && pose !== "lyingPhone" && (
        <mesh position={[poseState.rootOffset[0], 0.008, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.31, 28]} />
          <meshBasicMaterial color="#0e1118" transparent opacity={0.20} depthWrite={false} />
        </mesh>
      )}
      <primitive object={rigAssembly.container} />
    </group>
  );
};
