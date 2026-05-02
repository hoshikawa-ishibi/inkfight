import { Audio } from './audio.js';

let sceneBgAnim = null;
let sceneFxAnim = null;
let sceneParticles = [];

let menuBgAnim = null;
let menuParticles = [];

export function startMenuBackground() {
  const cv = document.getElementById('scene-bg-canvas');
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const ctx = cv.getContext('2d');
  document.getElementById('scene-bg').style.background =
    'radial-gradient(ellipse at 50% 40%, #0d0d2b 0%, #05050d 70%)';

  menuParticles = Array.from({length: 60}, () => makeMenuParticle(cv));
  if (menuBgAnim) cancelAnimationFrame(menuBgAnim);
  let t = 0;
  function loop() {
    t += 0.004;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // flowing ink waves
    ctx.strokeStyle = 'rgba(233,69,96,.07)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      for (let x = 0; x <= cv.width; x += 10)
        ctx.lineTo(x, cv.height * (0.3 + i * 0.12) + Math.sin(x * 0.008 + t + i) * 18);
      ctx.stroke();
    }
    // ink particles
    menuParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.a -= 0.0015;
      if (p.a <= 0) Object.assign(p, makeMenuParticle(cv));
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    menuBgAnim = requestAnimationFrame(loop);
  }
  loop();
}

export function stopMenuBackground() {
  if (menuBgAnim) { cancelAnimationFrame(menuBgAnim); menuBgAnim = null; }
  const cv = document.getElementById('scene-bg-canvas');
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
}

function makeMenuParticle(cv) {
  const colors = ['rgba(233,69,96,', 'rgba(22,199,154,', 'rgba(79,195,247,', 'rgba(200,200,255,'];
  const c = colors[Math.floor(Math.random() * colors.length)];
  return {
    x: Math.random() * cv.width, y: Math.random() * cv.height,
    vx: (Math.random() - 0.5) * 0.4, vy: -0.2 - Math.random() * 0.4,
    r: 0.8 + Math.random() * 2.5,
    a: 0.2 + Math.random() * 0.5,
    color: c + (0.6 + Math.random() * 0.4) + ')'
  };
}

export function applySceneBackground(scene) {
  document.getElementById('scene-bg').style.background = scene.bg;
  startSceneBgLayers(scene);
  startSceneFx(scene);
}

export function drawScenePreview(cv, scene) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  if (scene.id === 'void') {
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(155,155,207,${0.3 + Math.random() * 0.7})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  } else if (scene.id === 'lava') {
    ctx.fillStyle = '#3a0a0a'; ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.fillStyle = '#ff5722';
    for (let i = 0; i < 5; i++) ctx.fillRect(i * 40, h * 0.6 + Math.sin(i) * 4, 30, 4);
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = `rgba(255,112,67,${Math.random()})`;
      ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h * 0.6, 1 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.strokeStyle = 'rgba(79,195,247,.6)'; ctx.lineWidth = 1;
    for (let y = 10; y < h; y += 12) {
      ctx.beginPath();
      for (let x = 0; x < w; x += 4) ctx.lineTo(x, y + Math.sin((x + y) * 0.2) * 3);
      ctx.stroke();
    }
  }
}

function startSceneBgLayers(scene) {
  const cv = document.getElementById('scene-bg-canvas');
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const ctx = cv.getContext('2d');
  if (sceneBgAnim) cancelAnimationFrame(sceneBgAnim);
  let t = 0;
  function loop() {
    t += 0.005;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (scene.id === 'void') {
      const grad = ctx.createRadialGradient(cv.width/2, cv.height/2, 50, cv.width/2, cv.height/2, Math.max(cv.width, cv.height) * 0.7);
      grad.addColorStop(0, 'rgba(80,80,140,.25)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(15,15,40,.7)';
      ctx.beginPath(); ctx.moveTo(0, cv.height);
      for (let x = 0; x <= cv.width; x += 20) ctx.lineTo(x, cv.height - 80 - Math.sin(x * 0.01) * 20 - Math.cos(x * 0.005 + t) * 10);
      ctx.lineTo(cv.width, cv.height); ctx.fill();
      ctx.fillStyle = 'rgba(25,25,55,.85)';
      ctx.beginPath(); ctx.moveTo(0, cv.height);
      for (let x = 0; x <= cv.width; x += 15) ctx.lineTo(x, cv.height - 40 - Math.sin(x * 0.015 + 1) * 12);
      ctx.lineTo(cv.width, cv.height); ctx.fill();
    } else if (scene.id === 'lava') {
      ctx.fillStyle = 'rgba(60,15,15,.7)';
      ctx.beginPath(); ctx.moveTo(0, cv.height);
      ctx.lineTo(cv.width*0.2, cv.height-120); ctx.lineTo(cv.width*0.35, cv.height-90);
      ctx.lineTo(cv.width*0.55, cv.height-150); ctx.lineTo(cv.width*0.75, cv.height-100);
      ctx.lineTo(cv.width, cv.height-130); ctx.lineTo(cv.width, cv.height); ctx.fill();
      const lavaY = cv.height - 50;
      const lavaGrad = ctx.createLinearGradient(0, lavaY, 0, cv.height);
      lavaGrad.addColorStop(0, '#ff5722'); lavaGrad.addColorStop(.5, '#d32f2f'); lavaGrad.addColorStop(1, '#3a0a0a');
      ctx.fillStyle = lavaGrad;
      ctx.beginPath(); ctx.moveTo(0, lavaY);
      for (let x = 0; x <= cv.width; x += 10) ctx.lineTo(x, lavaY + Math.sin(x * 0.02 + t * 5) * 4);
      ctx.lineTo(cv.width, cv.height); ctx.lineTo(0, cv.height); ctx.fill();
      ctx.fillStyle = 'rgba(255,193,100,.4)';
      for (let x = 0; x < cv.width; x += 30)
        ctx.fillRect(x + Math.sin(t*3+x)*5, lavaY + Math.sin(x*0.02+t*5)*4 - 2, 15, 2);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
      grad.addColorStop(0, 'rgba(15,74,106,0)'); grad.addColorStop(1, 'rgba(15,74,106,.6)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(79,195,247,.25)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        const yBase = cv.height * (0.4 + i * 0.1);
        for (let x = 0; x <= cv.width; x += 8) ctx.lineTo(x, yBase + Math.sin(x*0.012+t*2+i)*8);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(10,40,60,.7)';
      [0.15, 0.5, 0.85].forEach((p, i) => {
        const x = cv.width*p, baseY = cv.height-60, hh = 80+i*20;
        ctx.fillRect(x-12, baseY-hh, 24, hh);
        ctx.beginPath(); ctx.moveTo(x-18, baseY-hh); ctx.lineTo(x, baseY-hh-20); ctx.lineTo(x+18, baseY-hh); ctx.fill();
      });
    }
    const floorGrad = ctx.createLinearGradient(0, cv.height-80, 0, cv.height);
    floorGrad.addColorStop(0, 'rgba(0,0,0,0)'); floorGrad.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = floorGrad; ctx.fillRect(0, cv.height-80, cv.width, 80);
    sceneBgAnim = requestAnimationFrame(loop);
  }
  loop();
}

function startSceneFx(scene) {
  const cv = document.getElementById('scene-fx');
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const ctx = cv.getContext('2d');
  sceneParticles = [];
  for (let i = 0; i < 80; i++) sceneParticles.push(makeParticle(scene, cv));
  if (sceneFxAnim) cancelAnimationFrame(sceneFxAnim);
  function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    sceneParticles.forEach(p => {
      p.life = (p.life || 0) + 1;
      p.x += p.vx; p.y += p.vy;
      if (p.y < -10 || p.y > cv.height+10 || p.x < -10 || p.x > cv.width+10)
        Object.assign(p, makeParticle(scene, cv, true));
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.hue;
      if (scene.fxKind === 'rune') {
        ctx.fillRect(p.x, p.y, p.r, p.r);
        ctx.globalAlpha = p.a * 0.4;
        ctx.fillRect(p.x-1, p.y-1, p.r+2, p.r+2);
      } else if (scene.fxKind === 'ember') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*3);
        g.addColorStop(0, 'rgba(255,200,100,'+p.a+')'); g.addColorStop(1, 'rgba(255,87,34,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r*3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = p.hue; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = p.a * 0.3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r*2.5, 0, Math.PI*2); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    sceneFxAnim = requestAnimationFrame(loop);
  }
  loop();
}

function makeParticle(scene, cv, recycle) {
  return {
    x: Math.random() * cv.width,
    y: recycle ? (scene.fxKind === 'ember' ? cv.height+10 : Math.random()*cv.height) : Math.random()*cv.height,
    vx: (Math.random()-0.5)*0.5,
    vy: scene.fxKind === 'ember' ? -(0.4+Math.random()*0.9) : (Math.random()-0.5)*0.7,
    r: 1+Math.random()*2.5,
    a: 0.3+Math.random()*0.6,
    hue: scene.fxColor
  };
}

window.addEventListener('resize', () => {
  ['scene-fx','fx-canvas','scene-bg-canvas'].forEach(id => {
    const c = document.getElementById(id);
    c.width = window.innerWidth; c.height = window.innerHeight;
  });
});
