import * as T from "../../vendor/three/three.module.min.js";
import { CHARACTERS } from "../data/data.js";
import { createFighter, poseFighter, disposeModel } from "./fighter-model.js";

const PALETTES = {
  spring: {
    sky: 0x122c38,
    ground: 0x355661,
    edge: 0x6caaa4,
    glow: 0x72e9d0,
    key: 0xffeccb,
  },
  lava: {
    sky: 0x23191e,
    ground: 0x423038,
    edge: 0x8b5146,
    glow: 0xff7d3d,
    key: 0xffc98d,
  },
  void: {
    sky: 0x171e33,
    ground: 0x384258,
    edge: 0x74758d,
    glow: 0xaba0ff,
    key: 0xdae5ff,
  },
};
const NS = "http://www.w3.org/2000/svg";
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.body?.classList.contains("reduced-motion");

export class ArenaScene {
  constructor(container, { onSelect = () => {}, solo = false } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.solo = solo;
    this.models = new Map();
    this.yaw = 0;
    this.pitch = 0.38;
    this.zoom = 1;
    this.cameraMode = "wide";
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "arena-canvas";
    this.canvas.setAttribute(
      "aria-label",
      solo
        ? "可拖动旋转的三维角色模型"
        : "三维战场：拖动转动视角，点击人物选择",
    );
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.stop();
      this.onContextLost?.();
    });
    container.prepend(this.canvas);
    this.labels = new Map();
    this.labelLayer = document.createElement("div");
    this.labelLayer.className = "arena-labels";
    container.appendChild(this.labelLayer);
    this.world = new T.Group();
    this.scene.add(this.world);
    this.actors = new T.Group();
    this.scene.add(this.actors);
    this.scene.add(new T.HemisphereLight(0xd4efff, 0x303043, 1.6));
    this.key = new T.DirectionalLight(0xffe2bb, 2.8);
    this.key.position.set(-4, 9, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, {
      left: -9,
      right: 9,
      top: 9,
      bottom: -9,
      near: 1,
      far: 30,
    });
    this.key.shadow.normalBias = 0.035;
    this.scene.add(this.key);
    const rim = new T.DirectionalLight(0x7dbdff, 2.2);
    rim.position.set(4, 6, -6);
    this.scene.add(rim);
    this.raycaster = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.projection = new T.Vector3();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bindInput();
    this.setEnvironment("spring");
    this.resize();
    this.visibilityHandler = () => {
      if (document.hidden) {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else if (this.wanted) this.start();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }
  mat(color, emissive = false) {
    return new T.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.88,
      metalness: 0.1,
      ...(emissive ? { emissive: color, emissiveIntensity: 1.3 } : {}),
    });
  }
  add(
    geometry,
    material,
    pos = [0, 0, 0],
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
  ) {
    const m = new T.Mesh(geometry, material);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.rotation.set(...rotation);
    m.receiveShadow = true;
    m.castShadow = true;
    this.world.add(m);
    return m;
  }
  setEnvironment(id) {
    if (this.environment === id) return;
    this.environment = id;
    const p = PALETTES[id] || PALETTES.void;
    disposeModel(this.world);
    this.world.clear();
    this.scene.background = new T.Color(p.sky);
    this.scene.fog = new T.Fog(p.sky, 18, 48);
    this.key.color.set(p.key);
    const stone = this.mat(p.ground),
      edge = this.mat(p.edge),
      dark = this.mat(0x17232c),
      light = this.mat(p.glow, true);
    const radius = this.solo ? 2.2 : 6.9;
    this.add(
      new T.CylinderGeometry(radius, radius * 0.9, 0.45, 12),
      stone,
      [0, -0.24, 0],
    );
    this.add(
      new T.CylinderGeometry(radius * 0.98, radius * 0.43, 1.5, 7),
      dark,
      [0, -1.12, 0],
    );
    this.add(
      new T.TorusGeometry(radius * 0.94, 0.028, 5, 72),
      light,
      [0, 0.01, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
    this.add(
      new T.TorusGeometry(radius * 0.7, 0.025, 5, 64),
      edge,
      [0, 0.016, 0],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
    // 圆盘刻度与层叠碎岩。固定序列使场景切换不消耗战斗随机数。
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2,
        r = radius * 0.86;
      this.add(
        new T.BoxGeometry(0.035, 0.016, i % 3 === 0 ? 0.35 : 0.15),
        edge,
        [Math.sin(a) * r, 0.026, Math.cos(a) * r],
        [1, 1, 1],
        [0, a, 0],
      );
    }
    if (!this.solo) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2,
          r = radius + 1 + (i % 3) * 0.4;
        const rock = this.add(
          new T.DodecahedronGeometry(0.5 + (i % 4) * 0.18),
          stone,
          [Math.cos(a) * r, -0.8 - (i % 3) * 0.4, Math.sin(a) * r],
          [1, 0.6 + (i % 3) * 0.3, 1],
        );
        rock.rotation.set(i * 0.7, i * 0.4, 0.3);
      }
      for (const s of [-1, 1]) {
        this.add(new T.CylinderGeometry(0.24, 0.4, 3.5, 6), stone, [
          s * 5.3,
          1.7,
          -3.6,
        ]);
        this.add(new T.BoxGeometry(1, 0.18, 1), edge, [s * 5.3, 3.5, -3.6]);
        this.add(new T.OctahedronGeometry(0.18), light, [s * 5.3, 3.85, -3.6]);
      }
      this.add(
        new T.TorusGeometry(2.15, 0.14, 7, 44, Math.PI * 1.55),
        edge,
        [0, 2.15, -5.3],
        [1, 1, 1],
        [0, 0, -0.5],
      );
      for (let i = 0; i < 6; i++)
        this.add(
          new T.BoxGeometry(0.16, 0.35, 0.2),
          light,
          [(i - 2.5) * 0.38, 0.06, -5.1],
          [1, 1, 1],
          [0, 0, 0.15],
        );
      if (id === "spring") {
        const water = this.mat(0x09242e);
        water.metalness = 0.15;
        water.roughness = 0.6;
        this.add(
          new T.CircleGeometry(24, 64),
          water,
          [0, -2.2, 0],
          [1, 1, 1],
          [-Math.PI / 2, 0, 0],
        );
      }
      if (id === "lava")
        for (let i = 0; i < 9; i++) {
          this.add(
            new T.BoxGeometry(0.045, 0.02, 2.4),
            light,
            [(i - 4) * 1.2, 0.018, Math.sin(i) * 2],
            [1, 1, 1],
            [0, i * 0.7, 0],
          );
        }
    }
    const points = [];
    for (let i = 0; i < 65; i++)
      points.push(
        Math.sin(i * 7.3) * 10,
        Math.cos(i * 4.7) * 3 + 3,
        Math.sin(i * 3.9) * 8,
      );
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(points, 3));
    this.dust = new T.Points(
      geo,
      new T.PointsMaterial({
        color: p.glow,
        size: 0.045,
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.world.add(this.dust);
  }
  setUnits(units) {
    const signature = units.map((u) => `${u.id}:${u.charId}`).join("|");
    if (signature !== this.signature) {
      this.models.forEach((m) => disposeModel(m));
      this.models.clear();
      this.actors.clear();
      this.signature = signature;
      this.labels.clear();
      this.labelLayer.replaceChildren();
      const counts = {
        1: units.filter((u) => u.player === 1).length,
        2: units.filter((u) => u.player === 2).length,
      };
      const slots = { 1: 0, 2: 0 };
      for (const u of units) {
        const c = CHARACTERS.find((c) => c.id === u.charId);
        if (!c) continue;
        const model = createFighter(c),
          slot = slots[u.player]++,
          n = counts[u.player];
        const side = u.player === 1 ? -1 : 1;
        // Keep each side in a compact two-by-two line. The old 9-unit span
        // forced the camera back so far that the figures became thumbnails.
        const x = this.solo ? 0 : side * (1.55 + (slot % 2) * 1.72);
        const z = this.solo
          ? 0
          : n <= 2
            ? 0
            : Math.floor(slot / 2) * 2.65 - 1.325;
        if (!this.solo) model.scale.setScalar(1.52);
        model.position.set(x, 0, z);
        model.rotation.y = this.solo ? -0.35 : side * -0.62;
        model.userData.home = model.position.clone();
        model.userData.unitId = u.id;
        model.userData.facing = model.rotation.y;
        model.userData.event = null;
        const ring = new T.Mesh(
          new T.RingGeometry(0.56, 0.62, 40),
          new T.MeshBasicMaterial({
            color: u.player === 1 ? 0x7ae3cf : 0xffb88c,
            side: T.DoubleSide,
            transparent: true,
            opacity: 0.5,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        model.add(ring);
        model.userData.marker = ring;
        const sprite = new T.Group();
        sprite.position.set(0, 2.04, 0);
        const backing = new T.Mesh(
          new T.PlaneGeometry(0.9, 0.065),
          new T.MeshBasicMaterial({ color: 0x172332 }),
        );
        sprite.add(backing);
        const hp = new T.Mesh(
          new T.PlaneGeometry(0.86, 0.04),
          new T.MeshBasicMaterial({
            color: u.player === 1 ? 0x8de3c4 : 0xf4ab91,
          }),
        );
        hp.position.z = 0.003;
        sprite.add(hp);
        sprite.visible = !this.solo;
        model.add(sprite);
        model.userData.health = { sprite, hp };
        this.actors.add(model);
        this.models.set(u.id, model);
        if (!this.solo) {
          const label = document.createElement("button");
          label.type = "button";
          label.className = `arena-name side-${u.player}`;
          label.textContent = c.name;
          label.setAttribute("aria-label", `模型：玩家${u.player} ${c.name}`);
          label.onclick = () => this.onSelect(u.id);
          this.labelLayer.appendChild(label);
          this.labels.set(u.id, label);
        }
      }
    }
    this.units = units;
  }
  setState(state) {
    this.state = state;
    this.setUnits([...state.p1Units, ...state.p2Units]);
    this.setEnvironment(state.scene?.id || "void");
  }
  animateUnit(id, kind, targetId) {
    const model = this.models.get(id);
    if (!model) return;
    model.userData.event = { kind, at: performance.now(), targetId };
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }
  updateCamera() {
    const fit = this.solo ? 1 : Math.max(0.86, 1.25 / this.camera.aspect);
    const base = this.solo ? 5.5 : this.cameraMode === "close" ? 10.8 : 12.2;
    const d = (base * fit) / this.zoom;
    // Aim slightly above the platform center so the enlarged rear-row models
    // keep their heads and weapon tips inside the panoramic frame.
    const target = 1.35;
    this.camera.position.set(
      Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      Math.sin(this.pitch) * d + target,
      Math.cos(this.yaw) * Math.cos(this.pitch) * d,
    );
    this.camera.lookAt(0, target, 0);
    this.camera.updateMatrixWorld();
  }
  resetCamera() {
    this.yaw = this.solo ? 0.2 : 0;
    this.pitch = this.solo ? 0.22 : 0.38;
    this.zoom = 1;
    this.cameraMode = "wide";
    this.updateCamera();
  }
  toggleCamera() {
    this.cameraMode = this.cameraMode === "wide" ? "close" : "wide";
    this.updateCamera();
    return this.cameraMode;
  }
  bindInput() {
    let drag = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.lastX) * 0.006;
      this.pitch = T.MathUtils.clamp(
        this.pitch + (e.clientY - drag.lastY) * 0.004,
        0.08,
        1.15,
      );
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      this.updateCamera();
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) {
        const r = this.canvas.getBoundingClientRect();
        this.pointer.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(
          [...this.models.values()],
          true,
        );
        if (hits[0]) {
          let obj = hits[0].object;
          while (obj && !obj.userData.unitId) obj = obj.parent;
          if (obj) {
            this.container.dataset.lastPick = obj.userData.unitId;
            this.onSelect(obj.userData.unitId);
          }
        }
      }
      drag = null;
    });
    this.canvas.addEventListener("pointercancel", () => {
      drag = null;
    });
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = T.MathUtils.clamp(
          this.zoom * Math.exp(-e.deltaY * 0.001),
          0.65,
          1.7,
        );
        this.updateCamera();
      },
      { passive: false },
    );
  }
  anchor(id) {
    const model = this.models.get(id);
    if (!model) return null;
    const r = this.canvas.getBoundingClientRect();
    model.localToWorld(this.projection.set(0, 1.15, 0));
    this.projection.project(this.camera);
    return {
      x: r.left + ((this.projection.x + 1) * r.width) / 2,
      y: r.top + ((1 - this.projection.y) * r.height) / 2,
    };
  }
  drawIntent() {
    const svg = this.container.querySelector(".arena-intent");
    if (!svg) return;
    svg.replaceChildren();
    const it = this.state?.enemyIntent;
    if (!it?.targetId) return;
    const a = this.anchor(it.unitId),
      b = this.anchor(it.targetId);
    if (!a || !b) return;
    const r = this.canvas.getBoundingClientRect(),
      path = document.createElementNS(NS, "path");
    path.setAttribute(
      "d",
      `M${a.x - r.left},${a.y - r.top - 20} Q${(a.x + b.x) / 2 - r.left},${Math.min(a.y, b.y) - r.top - 65} ${b.x - r.left},${b.y - r.top - 20}`,
    );
    svg.appendChild(path);
  }
  render(now) {
    const t = now / 1000;
    const reduce = reducedMotion();
    if (this.autoRotate && !reduce) {
      this.yaw +=
        Math.min(0.05, (now - (this.lastRender || now)) / 1000) * 0.22;
      this.updateCamera();
    }
    this.lastRender = now;
    for (const u of this.units || []) {
      const model = this.models.get(u.id);
      if (!model) continue;
      const event = model.userData.event;
      const progress = event ? Math.min(1, (now - event.at) / 650) : 1;
      const attacking = event?.kind === "attack" && progress < 1;
      const selected =
        u.id === (this.state?.previewUnitId || this.state?.activeUnitId);
      model.position.copy(model.userData.home);
      if (attacking && !reduce) {
        const target = this.models.get(event.targetId)?.userData.home;
        const direction = target
          ? new T.Vector3().subVectors(target, model.userData.home).normalize()
          : new T.Vector3(u.player === 1 ? 1 : -1, 0, 0);
        model.position.addScaledVector(
          direction,
          Math.sin(progress * Math.PI) * 0.75,
        );
      }
      poseFighter(model, reduce ? 0 : t, {
        attack: attacking && !reduce ? progress : 0,
        hit: event?.kind === "hit" ? 1 - progress : 0,
        dead: u.alive === false,
        selected,
      });
      model.userData.marker.material.opacity = selected ? 0.95 : 0.35;
      model.userData.marker.material.color.set(
        selected
          ? 0xffde99
          : this.state?.enemyIntent?.targetId === u.id
            ? 0xff9983
            : u.player === 1
              ? 0x7ae3cf
              : 0xffb88c,
      );
      model.userData.health.sprite.quaternion
        .copy(this.camera.quaternion)
        .premultiply(model.quaternion.clone().invert());
      const ratio = Math.max(0, u.hp / u.maxHp);
      model.userData.health.hp.scale.x = ratio;
      model.userData.health.hp.position.x = (ratio - 1) * 0.43;
      const label = this.labels.get(u.id);
      if (label) {
        model.updateMatrixWorld(true);
        model.localToWorld(this.projection.set(0, 2.28, 0));
        this.projection.project(this.camera);
        label.style.left = `${(this.projection.x + 1) * 50}%`;
        label.style.top = `${(1 - this.projection.y) * 50}%`;
        label.hidden = u.alive === false || this.projection.z > 1;
        label.classList.toggle("selected", selected);
      }
    }
    if (this.dust && !reduce) this.dust.rotation.y = t * 0.015;
    this.renderer.render(this.scene, this.camera);
    this.drawIntent();
    this.container.dataset.drawCalls = String(this.renderer.info.render.calls);
    this.container.dataset.triangles = String(
      this.renderer.info.render.triangles,
    );
    this.container.dataset.frame = String(
      (Number(this.container.dataset.frame) || 0) + 1,
    );
  }
  start() {
    this.wanted = true;
    if (this.frame || document.hidden) return;
    const loop = (now) => {
      this.frame = 0;
      if (!this.wanted || document.hidden) return;
      this.render(now);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }
  stop() {
    this.wanted = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  dispose() {
    this.stop();
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    disposeModel(this.world);
    this.models.forEach((m) => disposeModel(m));
    this.renderer.dispose();
    this.canvas.remove();
    this.labelLayer.remove();
  }
}
