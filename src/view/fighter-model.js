import * as T from "../../vendor/three/three.module.min.js";
import { visualFor } from "../data/character-visuals.js";

// 原创几何模型。关节、披风和武器保留独立节点，可用于实时动作和 GLB 导出。
const mesh = (parent, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new T.Mesh(geometry, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
const box = (g, m, size, pos, rot) =>
  mesh(g, new T.BoxGeometry(...size), m, pos, rot);
const ball = (g, m, r, pos, scale = [1, 1, 1]) => {
  const a = mesh(g, new T.IcosahedronGeometry(r, 1), m, pos);
  a.scale.set(...scale);
  return a;
};
const cone = (g, m, r1, r2, h, pos, rot) =>
  mesh(g, new T.CylinderGeometry(r1, r2, h, 8), m, pos, rot);
const ring = (g, m, r, t, pos, rot) =>
  mesh(g, new T.TorusGeometry(r, t, 5, 24), m, pos, rot);
const joint = (g, name, pos) => {
  const j = new T.Group();
  j.name = name;
  j.position.set(...pos);
  g.add(j);
  return j;
};

function cloth(parent, material, width, length, depth) {
  const vertices = [],
    indices = [];
  for (let y = 0; y <= 5; y++) {
    const t = y / 5,
      w = width * (0.64 + t * 0.36);
    for (let x = 0; x <= 4; x++) {
      const s = x / 4;
      vertices.push(
        (s - 0.5) * w,
        -t * length,
        depth + t * t * 0.27 + Math.sin(s * Math.PI * 4) * t * 0.05,
      );
      if (y < 5 && x < 4) {
        const a = y * 5 + x;
        indices.push(a, a + 1, a + 5, a + 1, a + 6, a + 5);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return mesh(parent, geo, material);
}

function blade(parent, m, length = 0.95, curve = false) {
  const shape = new T.Shape();
  shape.moveTo(-0.055, 0);
  shape.lineTo(0.055, 0);
  shape.lineTo(curve ? 0.15 : 0.04, length * 0.85);
  shape.lineTo(curve ? 0.2 : 0, length);
  shape.lineTo(curve ? 0.05 : -0.055, length * 0.85);
  shape.closePath();
  const sword = mesh(
    parent,
    new T.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }),
    m.steel,
    [0, 0.12, 0],
  );
  sword.name = "blade";
  box(parent, m.gold, [0.3, 0.045, 0.1], [0, 0.1, 0]);
  cone(parent, m.dark, 0.035, 0.035, 0.23, [0, -0.025, 0]);
}

function weapon(g, type, m) {
  g.name = `weapon-${type}`;
  const shaft = (h = 1.5) =>
    cone(g, m.dark, 0.035, 0.045, h, [0, h / 2 - 0.25, 0]);
  const gem = (pos = [0, 1.3, 0], r = 0.16) =>
    mesh(g, new T.OctahedronGeometry(r), m.glow, pos);
  switch (type) {
    case "sword":
      blade(g, m);
      break;
    case "katana":
      blade(g, m, 1.12, true);
      break;
    case "dagger":
    case "kunai":
      blade(g, m, 0.5, type === "kunai");
      break;
    case "axe":
      shaft(1.3);
      box(g, m.steel, [0.75, 0.32, 0.11], [0, 1, 0], [0, 0, 0.15]);
      mesh(
        g,
        new T.ConeGeometry(0.24, 0.4, 4),
        m.steel,
        [0.45, 1, 0],
        [0, 0, -Math.PI / 2],
      );
      break;
    case "shield":
      box(g, m.dark, [0.65, 0.95, 0.12], [0, 0.25, 0]);
      box(g, m.gold, [0.57, 0.85, 0.14], [0, 0.25, 0]);
      box(g, m.color, [0.49, 0.76, 0.17], [0, 0.25, 0]);
      box(g, m.gold, [0.07, 0.75, 0.2], [0, 0.25, 0]);
      gem([0, 0.25, 0.16], 0.12);
      break;
    case "bow":
      mesh(
        g,
        new T.TorusGeometry(0.5, 0.035, 6, 24, Math.PI),
        m.gold,
        [0, 0.35, 0],
        [0, 0, -Math.PI / 2],
      );
      box(g, m.steel, [0.012, 1, 0.012], [0, 0.35, 0]);
      box(g, m.dark, [0.045, 0.07, 0.8], [0, 0.35, 0.18]);
      break;
    case "staff":
    case "cross":
      shaft(1.6);
      ring(g, m.gold, 0.22, 0.035, [0, 1.35, 0]);
      gem([0, 1.35, 0]);
      if (type === "cross") box(g, m.gold, [0.5, 0.07, 0.09], [0, 1.45, 0]);
      break;
    case "scythe":
      shaft(1.8);
      box(g, m.steel, [0.9, 0.13, 0.07], [-0.35, 1.45, 0], [0, 0, 0.25]);
      mesh(
        g,
        new T.ConeGeometry(0.09, 0.55, 4),
        m.steel,
        [-0.9, 1.18, 0],
        [0, 0, -0.6],
      );
      break;
    case "orb":
      gem([0, 0.4, 0], 0.27);
      ring(g, m.gold, 0.35, 0.02, [0, 0.4, 0], [0.7, 0.4, 0.2]);
      break;
    case "ofuda":
      for (let i = 0; i < 3; i++) {
        const card = joint(g, "talisman", [0.12 * (i - 1), 0.38 + 0.04 * i, 0]);
        card.rotation.z = (i - 1) * 0.3;
        box(card, m.paper, [0.18, 0.4, 0.035], [0, 0, 0]);
        box(card, m.color, [0.035, 0.24, 0.04], [0, 0, 0.02]);
      }
      break;
    case "gear":
      cone(g, m.gold, 0.25, 0.25, 0.12, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        box(
          g,
          m.gold,
          [0.13, 0.13, 0.1],
          [Math.cos(a) * 0.28, 0.3 + Math.sin(a) * 0.28, 0],
          [0, 0, a],
        );
      }
      gem([0, 0.3, 0.1], 0.12);
      break;
    case "drum":
      cone(g, m.color, 0.34, 0.34, 0.35, [0, 0.25, 0], [Math.PI / 2, 0, 0]);
      cone(g, m.paper, 0.31, 0.31, 0.37, [0, 0.25, 0], [Math.PI / 2, 0, 0]);
      ring(g, m.gold, 0.34, 0.035, [0, 0.25, 0.2]);
      break;
    case "gourd":
      ball(g, m.gold, 0.19, [0, 0.18, 0]);
      ball(g, m.color, 0.13, [0, 0.43, 0]);
      cone(g, m.gold, 0.045, 0.05, 0.1, [0, 0.56, 0]);
      break;
    case "fist":
      box(g, m.gold, [0.24, 0.24, 0.3], [0, 0.03, 0.08]);
      ring(g, m.glow, 0.15, 0.018, [0, 0.03, 0.25]);
      break;
    default:
      blade(g, m, 0.6);
  }
}

export function createFighter(character) {
  const v = visualFor(character.id),
    body = v.body;
  const heavy = body === "heavy",
    petite = body.startsWith("petite");
  const robe = body === "robe" || body === "petiteRobe";
  const color = new T.Color(character.color);
  const material = (c, extra = {}) =>
    new T.MeshStandardMaterial({
      color: c,
      roughness: 0.75,
      metalness: 0.12,
      flatShading: true,
      ...extra,
    });
  const m = {
    color: material(color),
    dark: material("#17232f"),
    gold: material("#d4af67", { metalness: 0.6, roughness: 0.38 }),
    steel: material("#c9dce2", { metalness: 0.65, roughness: 0.3 }),
    skin: material("#d6b497"),
    hair: material(
      ["guardian", "priest", "bladedancer", "onmyoji"].includes(character.id)
        ? "#d9c498"
        : "#1a2130",
    ),
    paper: material("#e8ddc0"),
    glow: material(color, { emissive: color, emissiveIntensity: 1.8 }),
    cloth: material(color.clone().multiplyScalar(0.5), { side: T.DoubleSide }),
  };
  const root = new T.Group();
  root.name = character.id;
  const rig = joint(root, "rig", [0, 0, 0]);
  const width = heavy ? 0.63 : petite ? 0.41 : 0.47;
  // 带膝关节的双腿，裙摆下仍有完整的几何结构。
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = joint(rig, `leg-${s}`, [s * 0.145, 0.77, 0]);
    cone(leg, m.dark, 0.105, 0.085, 0.36, [0, -0.16, 0]);
    const knee = joint(leg, `knee-${s}`, [0, -0.34, 0]);
    cone(knee, m.dark, 0.082, 0.07, 0.33, [0, -0.15, 0]);
    box(knee, m.dark, [0.18, 0.12, 0.32], [0, -0.31, 0.065]);
    if (!robe) box(knee, m.gold, [0.11, 0.21, 0.035], [0, -0.13, 0.09]);
    legs.push(leg);
  }
  const torso = joint(rig, "torso", [0, 0.78, 0]);
  cone(torso, m.dark, width * 0.51, width * 0.41, 0.55, [0, 0.25, 0]);
  cone(torso, m.color, width * 0.52, width * 0.44, 0.42, [0, 0.29, 0.015]);
  box(torso, m.gold, [width * 0.95, 0.09, 0.3], [0, 0.06, 0.01]);
  box(
    torso,
    m.gold,
    [0.045, 0.46, 0.035],
    [-width * 0.17, 0.29, 0.23],
    [0, 0, -0.4],
  );
  if (robe) {
    cone(rig, m.cloth, width * 0.44, width * 0.77, 0.69, [0, 0.42, 0]);
    for (const s of [-1, 1])
      box(
        rig,
        m.gold,
        [0.025, 0.57, 0.018],
        [s * 0.17, 0.44, 0.24],
        [0, 0, s * -0.14],
      );
  } else {
    for (const s of [-1, 1]) {
      const panel = cloth(torso, m.cloth, 0.23, 0.38, 0.06);
      panel.position.set(s * 0.17, 0, 0.06);
      panel.rotation.z = s * 0.15;
    }
  }
  const neck = joint(torso, "neck", [0, 0.59, 0]);
  cone(neck, m.skin, 0.07, 0.08, 0.1, [0, 0.015, 0]);
  const head = joint(neck, "head", [0, 0.18, 0]);
  ball(head, m.skin, 0.225, [0, 0, 0], [0.85, 1.06, 0.87]);
  ball(head, m.hair, 0.23, [0, 0.09, -0.035], [0.91, 0.79, 0.92]);
  for (const s of [-1, 1]) {
    box(head, m.dark, [0.075, 0.027, 0.028], [s * 0.082, 0.014, 0.184]);
    box(head, m.glow, [0.04, 0.014, 0.029], [s * 0.082, 0.019, 0.189]);
    mesh(
      head,
      new T.ConeGeometry(0.065, 0.24, 4),
      m.hair,
      [s * 0.155, -0.01, -0.015],
      [0, 0, s * 0.18],
    );
  }
  const back = joint(torso, "cape", [0, 0.5, -0.16]);
  const cape = cloth(
    back,
    m.cloth,
    heavy ? 0.83 : 0.66,
    robe ? 1.08 : 0.88,
    -0.04,
  );
  cape.rotation.x = -0.07;
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = joint(torso, `shoulder-${s}`, [
      s * (width * 0.5 + 0.07),
      0.48,
      0,
    ]);
    ball(
      arm,
      heavy ? m.gold : m.color,
      heavy ? 0.2 : 0.13,
      [0, -0.03, 0],
      [1, 1, 0.95],
    );
    cone(
      arm,
      robe ? m.color : m.dark,
      robe ? 0.14 : 0.085,
      0.075,
      0.3,
      [0, -0.18, 0],
    );
    const elbow = joint(arm, `elbow-${s}`, [0, -0.32, 0]);
    cone(elbow, m.dark, 0.078, 0.066, 0.28, [0, -0.13, 0]);
    box(elbow, m.gold, [0.13, 0.17, 0.15], [0, -0.15, 0]);
    const hand = joint(elbow, `hand-${s}`, [0, -0.28, 0]);
    ball(hand, m.skin, 0.075, [0, 0, 0]);
    arm.rotation.z = s * 0.14;
    elbow.rotation.x = -0.35;
    arms.push({ arm, elbow, hand });
  }
  const grip = joint(arms[1].hand, "grip", [0, 0, 0.045]);
  grip.rotation.x = 0.25;
  weapon(grip, character.weapon, m);
  if (["dagger", "kunai", "fist"].includes(character.weapon))
    weapon(arms[0].hand, character.weapon, m);
  // 每个角色的视觉身份证延续二维版本：头饰、背饰、武器互相区分。
  switch (v.head) {
    case "headband":
      box(head, m.color, [0.41, 0.045, 0.38], [0, 0.095, 0]);
      break;
    case "helmet":
      cone(head, m.gold, 0.22, 0.25, 0.2, [0, 0.18, 0]);
      box(head, m.gold, [0.045, 0.35, 0.3], [0, 0.19, 0]);
      break;
    case "hood":
    case "featherHood":
      ball(head, m.cloth, 0.275, [0, 0.065, -0.095], [1, 1.1, 1]);
      break;
    case "halo":
      ring(head, m.glow, 0.3, 0.022, [0, 0.37, 0], [Math.PI / 2, 0, 0]);
      break;
    case "highCrown":
      box(head, m.dark, [0.29, 0.32, 0.25], [0, 0.29, 0]);
      box(head, m.gold, [0.025, 0.27, 0.26], [0, 0.3, 0]);
      break;
    case "goggles":
      for (const s of [-1, 1])
        ring(head, m.gold, 0.075, 0.024, [s * 0.095, 0.12, 0.205]);
      break;
    case "doubleBun":
      for (const s of [-1, 1])
        ball(head, m.hair, 0.11, [s * 0.23, 0.16, -0.02]);
      break;
    case "mane":
      for (let i = 0; i < 7; i++)
        mesh(
          head,
          new T.ConeGeometry(0.11, 0.27, 4),
          m.hair,
          [(i - 3) * 0.05, 0.27, -0.09],
          [0, 0, (i - 3) * 0.16],
        );
      break;
    case "ponytail":
    case "longKnot": {
      const hair = cloth(head, m.hair, 0.23, 0.72, -0.2);
      hair.position.y = 0.17;
      hair.rotation.x = -0.16;
      break;
    }
    case "circlet":
      ring(head, m.gold, 0.21, 0.023, [0, 0.15, 0], [Math.PI / 2, 0, 0]);
      break;
    case "halfMask":
      box(head, m.paper, [0.22, 0.13, 0.05], [0.05, -0.06, 0.19]);
      break;
    case "herbPin":
      mesh(
        head,
        new T.ConeGeometry(0.09, 0.35, 4),
        m.color,
        [0.2, 0.24, 0],
        [0, 0, -0.6],
      );
      break;
    case "hornCollar":
      for (const s of [-1, 1])
        mesh(
          head,
          new T.ConeGeometry(0.055, 0.28, 5),
          m.gold,
          [s * 0.21, 0.22, -0.09],
          [0, 0, -s * 0.3],
        );
      break;
  }
  if (v.outer === "scarf" || v.outer === "splitScarf") {
    cone(neck, m.color, 0.16, 0.18, 0.09, [0, -0.01, 0]);
    const scarf = cloth(neck, m.color, 0.19, 0.6, -0.2);
    scarf.rotation.set(-0.6, 0, -0.5);
  }
  if (v.outer === "featherCape")
    for (let i = 0; i < 10; i++) {
      const f = mesh(
        back,
        new T.ConeGeometry(0.09, 0.55, 4),
        m.dark,
        [(i - 4.5) * 0.095, -0.45, -0.12],
        [0, 0, Math.PI + (i - 4.5) * 0.1],
      );
      f.name = "feather";
    }
  if (v.outer === "quiver")
    cone(back, m.dark, 0.12, 0.11, 0.6, [0.13, -0.22, -0.14], [0, 0, 0.2]);
  if (v.outer === "gearPack")
    box(back, m.gold, [0.5, 0.42, 0.28], [0, -0.2, -0.08]);
  if (v.outer === "beads")
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ball(neck, m.gold, 0.032, [Math.cos(a) * 0.2, -0.08, Math.sin(a) * 0.18]);
    }
  if (v.outer === "talismans")
    for (const s of [-1, 1])
      box(
        back,
        m.paper,
        [0.12, 0.43, 0.03],
        [s * 0.25, -0.25, -0.12],
        [0, 0, s * 0.2],
      );
  if (petite) rig.scale.setScalar(0.93);
  if (body === "tall") rig.scale.y = 1.08;
  root.userData.rig = { rig, torso, head, back, arms, legs, materials: m };
  root.userData.characterId = character.id;
  return root;
}

export function poseFighter(
  model,
  time,
  { attack = 0, hit = 0, dead = false, selected = false } = {},
) {
  const { rig, torso, head, back, arms, legs, materials } = model.userData.rig;
  const id = model.userData.characterId;
  rig.rotation.z = dead ? -1.4 : 0;
  rig.position.y = dead ? 0.16 : Math.sin(time * 2) * 0.025;
  // A small, immediate recoil reads better than a shared generic flinch.
  rig.position.x = hit > 0 ? Math.sin(time * 55) * hit * 0.045 : 0;
  torso.rotation.y = Math.sin(attack * Math.PI) * -0.55;
  head.rotation.y = Math.sin(time * 0.55) * 0.08;
  back.rotation.x =
    0.08 + Math.sin(time * 2.4) * 0.07 + Math.sin(attack * Math.PI) * 0.3;
  arms.forEach(({ arm, elbow }, i) => {
    const swing = Math.sin(attack * Math.PI);
    const ranged = [
      "archer",
      "mage",
      "onmyoji",
      "warlock",
      "herbalist",
    ].includes(id);
    const twoHand = ["guardian", "monk", "drummer", "artificer"].includes(id);
    arm.rotation.x =
      -0.08 +
      Math.sin(time * 2 + i) * 0.025 -
      (i
        ? swing * (ranged ? 1.05 : twoHand ? 1.35 : 1.7)
        : swing * (ranged ? 0.35 : twoHand ? 0.75 : 0.25));
    arm.rotation.z =
      (i ? 1 : -1) *
      swing *
      (id === "assassin" || id === "raven" ? 0.35 : 0.12);
    elbow.rotation.x = -0.35 - swing * (ranged ? 0.45 : 0.7);
  });
  legs[0].rotation.x = Math.sin(attack * Math.PI) * 0.35;
  legs[1].rotation.x = -Math.sin(attack * Math.PI) * 0.35;
  materials.color.emissive.copy(materials.color.color);
  materials.color.emissiveIntensity = hit > 0 ? hit * 1.6 : selected ? 0.25 : 0;
  model.visible = !dead;
}

export function disposeModel(root) {
  const geometries = new Set(),
    materials = new Set();
  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
