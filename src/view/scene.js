let sceneBgAnim = null;
let sceneFxAnim = null;
let sceneParticles = [];
let menuBgAnim = null;
let menuParticles = [];
const previewImages = new Map();

export function startMenuBackground() {
  const cv = document.getElementById('scene-bg-canvas');
  resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  const bg = document.getElementById('scene-bg');
  bg.style.background = 'radial-gradient(ellipse at 50% 40%, #0d0d2b 0%, #05050d 70%)';
  bg.style.backgroundImage = '';
  menuParticles = Array.from({length:60}, () => makeMenuParticle(cv));
  stopSceneAnimations();
  if (menuBgAnim) cancelAnimationFrame(menuBgAnim);
  let t = 0;
  function loop() {
    t += .004;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = 'rgba(233,69,96,.07)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      for (let x = 0; x <= cv.width; x += 10)
        ctx.lineTo(x, cv.height * (.3 + i * .12) + Math.sin(x * .008 + t + i) * 18);
      ctx.stroke();
    }
    menuParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.a -= .0015;
      if (p.a <= 0) Object.assign(p, makeMenuParticle(cv));
      ctx.globalAlpha = p.a; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    menuBgAnim = requestAnimationFrame(loop);
  }
  loop();
}

export function stopMenuBackground() {
  if (menuBgAnim) { cancelAnimationFrame(menuBgAnim); menuBgAnim = null; }
  clearCanvas('scene-bg-canvas');
}

function makeMenuParticle(cv) {
  const colors = ['rgba(233,69,96,', 'rgba(22,199,154,', 'rgba(79,195,247,', 'rgba(200,200,255,'];
  const c = colors[Math.floor(Math.random() * colors.length)];
  return { x:Math.random()*cv.width, y:Math.random()*cv.height,
    vx:(Math.random()-.5)*.4, vy:-.2-Math.random()*.4,
    r:.8+Math.random()*2.5, a:.2+Math.random()*.5,
    color:c+(.6+Math.random()*.4)+')' };
}

export function applySceneBackground(scene) {
  const bg = document.getElementById('scene-bg');
  const art = scene.art || {};
  bg.style.background = scene.bg;
  bg.style.backgroundImage = [art.overlay, art.image && `url("${art.image}")`].filter(Boolean).join(', ');
  bg.style.backgroundSize = 'cover';
  bg.style.backgroundPosition = art.position || 'center';
  startSceneBgLayers(scene);
  startSceneFx(scene);
}

export function drawScenePreview(cv, scene) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  drawPreviewFallback(ctx, cv, scene);
  const src = scene.art?.image;
  if (!src) return;
  let image = previewImages.get(src);
  if (!image) {
    image = new Image();
    previewImages.set(src, image);
    image.src = src;
  }
  const paint = () => {
    drawCover(ctx, image, cv.width, cv.height, scene.art?.previewFocus ?? .5);
    const shade = ctx.createLinearGradient(0, 0, 0, cv.height);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, cv.width, cv.height);
  };
  if (image.complete && image.naturalWidth) paint();
  else image.addEventListener('load', paint, {once:true});
}

function drawPreviewFallback(ctx, cv, scene) {
  const colors = scene.art?.preview || ['#24243d', '#080812'];
  const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
  grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, cv.width, cv.height);
}

function drawCover(ctx, image, width, height, focusY=.5) {
  const scale = Math.max(width/image.naturalWidth, height/image.naturalHeight);
  const sw = width/scale, sh = height/scale;
  const sx = (image.naturalWidth-sw)/2;
  const sy = Math.max(0, Math.min(image.naturalHeight-sh, (image.naturalHeight-sh)*focusY));
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

const motionRenderers = {
  voidDrift(ctx, cv, t) {
    ctx.strokeStyle = 'rgba(184,181,214,.055)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y = cv.height*(.28+i*.16);
      for (let x = 0; x <= cv.width; x += 18)
        ctx.lineTo(x, y+Math.sin(x*.004+t+i*1.7)*12);
      ctx.stroke();
    }
  },
  heatVeil(ctx, cv, t) {
    const y = cv.height*.49;
    const glow = ctx.createLinearGradient(0, y-30, 0, y+55);
    glow.addColorStop(0, 'rgba(255,80,35,0)');
    glow.addColorStop(.5, 'rgba(255,80,35,.055)');
    glow.addColorStop(1, 'rgba(255,80,35,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, y-30+Math.sin(t)*3, cv.width, 85);
  },
  waterFlow(ctx, cv, t) {
    ctx.strokeStyle = 'rgba(103,217,229,.12)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const y = cv.height*(.43+i*.07);
      for (let x = 0; x <= cv.width; x += 12)
        ctx.lineTo(x, y+Math.sin(x*.009+t*1.4+i)*5);
      ctx.stroke();
    }
  }
};

function startSceneBgLayers(scene) {
  const cv = document.getElementById('scene-bg-canvas');
  resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  if (sceneBgAnim) cancelAnimationFrame(sceneBgAnim);
  const render = motionRenderers[scene.art?.motion];
  let t = 0;
  function loop() {
    t += .008;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (render) render(ctx, cv, t);
    sceneBgAnim = requestAnimationFrame(loop);
  }
  loop();
}

function startSceneFx(scene) {
  const cv = document.getElementById('scene-fx');
  resizeCanvas(cv);
  const ctx = cv.getContext('2d');
  const recipe = scene.art?.particles;
  sceneParticles = recipe ? Array.from({length:recipe.count||40}, () => makeParticle(recipe, cv)) : [];
  if (sceneFxAnim) cancelAnimationFrame(sceneFxAnim);
  function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    sceneParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -10 || p.y > cv.height+10 || p.x < -10 || p.x > cv.width+10)
        Object.assign(p, makeParticle(recipe, cv, true));
      drawParticle(ctx, p);
    });
    ctx.globalAlpha = 1;
    sceneFxAnim = requestAnimationFrame(loop);
  }
  loop();
}

function makeParticle(recipe, cv, recycle=false) {
  const [minA,maxA] = recipe.alpha || [.2,.5];
  const [minR,maxR] = recipe.radius || [1,2.5];
  const [minS,maxS] = recipe.speed || [.1,.5];
  const speed = minS+Math.random()*(maxS-minS);
  const upward = recipe.kind === 'ember' || recipe.kind === 'wisp';
  return { kind:recipe.kind, color:recipe.color,
    x:Math.random()*cv.width,
    y:recycle&&upward ? cv.height+8 : Math.random()*cv.height,
    vx:(Math.random()-.5)*speed*.45,
    vy:upward ? -speed : (Math.random()-.5)*speed,
    r:minR+Math.random()*(maxR-minR), a:minA+Math.random()*(maxA-minA) };
}

function drawParticle(ctx, p) {
  ctx.globalAlpha = p.a; ctx.fillStyle = p.color;
  if (p.kind === 'rune') {
    ctx.fillRect(p.x, p.y, p.r, p.r);
    ctx.globalAlpha = p.a*.3;
    ctx.fillRect(p.x-1, p.y-1, p.r+2, p.r+2);
    return;
  }
  const radius = p.kind === 'ember' ? p.r*3 : p.r*2.2;
  const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  glow.addColorStop(0, p.color); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI*2); ctx.fill();
}

function stopSceneAnimations() {
  if (sceneBgAnim) cancelAnimationFrame(sceneBgAnim);
  if (sceneFxAnim) cancelAnimationFrame(sceneFxAnim);
  sceneBgAnim = null; sceneFxAnim = null;
  clearCanvas('scene-fx');
}

function resizeCanvas(cv) {
  cv.width = window.innerWidth; cv.height = window.innerHeight;
}

function clearCanvas(id) {
  const cv = document.getElementById(id);
  if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

window.addEventListener('resize', () => {
  ['scene-fx','fx-canvas','scene-bg-canvas'].forEach(id => {
    const c = document.getElementById(id);
    if (c) resizeCanvas(c);
  });
});
