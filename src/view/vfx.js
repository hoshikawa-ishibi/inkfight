import { clamp } from '../core/state.js';

export function getUnitScreenPos(u){
  const el=document.getElementById('unit-'+u.id);
  if(!el) return null;
  const r=el.getBoundingClientRect();
  return {x:r.left+r.width/2,y:r.top+70};
}

let fxItems=[],fxLoopRunning=false;
function fxLoop(){
  const cv=document.getElementById('fx-canvas');
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  const now=performance.now();
  fxItems=fxItems.filter(it=>now<it.endAt);
  fxItems.forEach(it=>it.draw(ctx,now));
  if(fxItems.length>0) requestAnimationFrame(fxLoop);
  else fxLoopRunning=false;
}
export function pushFx(it){
  fxItems.push(it);
  if(!fxLoopRunning){ fxLoopRunning=true; requestAnimationFrame(fxLoop); }
}

export function playSkillVfx(actor,target,skill,onHit){
  const vfx=skill.vfx||'projectile';
  const a=getUnitScreenPos(actor),b=target?getUnitScreenPos(target):null;
  if(!a||(target&&!b)){ onHit&&onHit(); return; }
  switch(vfx){
    case 'slash': vfxSlash(a,b,actor.color,onHit); break;
    case 'whirl': vfxWhirl(a,b,actor.color,onHit); break;
    case 'pierce': vfxPierce(a,b,'#ffd54f',onHit); break;
    case 'orb': vfxOrb(a,b,actor.color,onHit); break;
    case 'flood': vfxFlood(a,b,'#0288d1',onHit); break;
    case 'lightning': vfxLightning(a,b,'#ffd54f',onHit); break;
    case 'shadowstrike': vfxShadowStrike(a,b,'#7e57c2',onHit); break;
    case 'poison': vfxPoison(a,b,'#9ccc65',onHit); break;
    case 'bash': vfxBash(a,b,actor.color,onHit); break;
    case 'arrow': vfxArrow(a,b,'#ffd54f',onHit); break;
    case 'pierceArrow': vfxArrow(a,b,'#ff7043',onHit); break;
    case 'bindArrow': vfxArrow(a,b,'#a1887f',onHit); break;
    case 'light': vfxLight(a,b,'#fff8c4',onHit); break;
    case 'shadowOrb': vfxOrb(a,b,'#7e57c2',onHit); break;
    case 'soulSteal': vfxSoulSteal(a,b,'#ce93d8',onHit); break;
    case 'smash': vfxSmash(a,b,actor.color,onHit); break;
    case 'drain': vfxDrain(a,b,'#b71c1c',onHit); break;
    default: vfxOrb(a,b,actor.color,onHit);
  }
}

function travel(a,b,dur,drawFn,onDone){
  const start=performance.now();
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=clamp((now-start)/dur,0,1);
      const x=a.x+(b.x-a.x)*t;
      const y=a.y+(b.y-a.y)*t-Math.sin(t*Math.PI)*60;
      drawFn(ctx,x,y,t);
    }
  });
  setTimeout(onDone,dur);
}
function vfxSlash(a,b,color,onHit){
  const start=performance.now(),dur=350;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(-Math.PI/4+t*Math.PI/2);
      ctx.strokeStyle=color; ctx.lineWidth=4*(1-t); ctx.globalAlpha=1-t;
      ctx.beginPath(); ctx.arc(0,0,40,-0.6,0.6); ctx.stroke();
      ctx.lineWidth=1.5; ctx.globalAlpha=(1-t)*0.6;
      ctx.beginPath(); ctx.arc(0,0,32,-0.6,0.6); ctx.stroke();
      ctx.restore();
    }
  });
  setTimeout(onHit,dur*0.6);
}
function vfxWhirl(a,b,color,onHit){
  const start=performance.now(),dur=500;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(t*Math.PI*4);
      for(let i=0;i<6;i++){
        ctx.rotate(Math.PI/3);
        ctx.strokeStyle=color; ctx.globalAlpha=(1-t)*0.7; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(40+t*20,0); ctx.stroke();
      }
      ctx.restore();
    }
  });
  setTimeout(onHit,dur*0.5);
}
function vfxPierce(a,b,color,onHit){
  travel(a,b,300,(ctx,x,y,t)=>{
    ctx.save(); ctx.translate(x,y);
    const ang=Math.atan2(b.y-a.y,b.x-a.x); ctx.rotate(ang);
    ctx.fillStyle=color;
    ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(-8,5); ctx.lineTo(-8,-5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=0.5; ctx.fillRect(-30,-2,30,4);
    ctx.restore();
  },onHit);
}
function vfxOrb(a,b,color,onHit){
  travel(a,b,400,(ctx,x,y,t)=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,18);
    g.addColorStop(0,color); g.addColorStop(1,'transparent');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,18,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
  },onHit);
}
function vfxFlood(a,b,color,onHit){
  const start=performance.now(),dur=550;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle=color; ctx.lineWidth=10*(1-t)+4; ctx.globalAlpha=1-t*0.7;
      ctx.beginPath();
      for(let i=0;i<=20;i++){
        const tt=i/20;
        const x=a.x+(b.x-a.x)*tt;
        const y=a.y+(b.y-a.y)*tt+Math.sin(tt*Math.PI*4+t*10)*15*(1-Math.abs(tt-0.5)*2);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
  });
  setTimeout(onHit,dur*0.7);
}
function vfxLightning(a,b,color,onHit){
  const start=performance.now(),dur=300;
  const segs=[]; const N=8;
  for(let i=0;i<=N;i++){
    const tt=i/N;
    segs.push({x:a.x+(b.x-a.x)*tt+(i&&i<N?(Math.random()-0.5)*40:0),
               y:a.y+(b.y-a.y)*tt+(i&&i<N?(Math.random()-0.5)*40:0)});
  }
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle=color; ctx.lineWidth=3; ctx.globalAlpha=1-t;
      ctx.shadowColor=color; ctx.shadowBlur=20;
      ctx.beginPath(); ctx.moveTo(segs[0].x,segs[0].y);
      for(let i=1;i<segs.length;i++) ctx.lineTo(segs[i].x,segs[i].y);
      ctx.stroke(); ctx.shadowBlur=0;
    }
  });
  setTimeout(onHit,dur*0.4);
}
function vfxShadowStrike(a,b,color,onHit){
  const start=performance.now(),dur=400;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.fillStyle=color; ctx.globalAlpha=(1-t)*0.7;
      for(let i=0;i<8;i++){
        const ang=Math.random()*Math.PI*2, r=t*60;
        ctx.beginPath(); ctx.arc(b.x+Math.cos(ang)*r,b.y+Math.sin(ang)*r,3+Math.random()*3,0,Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.globalAlpha=1-t;
      ctx.beginPath(); ctx.arc(b.x,b.y,t*50,0,Math.PI*2); ctx.stroke();
    }
  });
  setTimeout(onHit,dur*0.4);
}
function vfxPoison(a,b,color,onHit){
  travel(a,b,350,(ctx,x,y,t)=>{
    ctx.fillStyle=color; ctx.globalAlpha=0.9;
    for(let i=0;i<3;i++){
      ctx.beginPath(); ctx.arc(x+(Math.random()-0.5)*8,y+(Math.random()-0.5)*8,3+Math.random()*2,0,Math.PI*2); ctx.fill();
    }
  },onHit);
}
function vfxBash(a,b,color,onHit){
  const start=performance.now(),dur=300;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle=color; ctx.lineWidth=4*(1-t); ctx.globalAlpha=1-t;
      ctx.beginPath(); ctx.arc(b.x,b.y,t*45,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x,b.y,t*30,0,Math.PI*2); ctx.stroke();
    }
  });
  setTimeout(onHit,dur*0.4);
}
function vfxArrow(a,b,color,onHit){
  travel(a,b,300,(ctx,x,y,t)=>{
    ctx.save(); ctx.translate(x,y); ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x));
    ctx.strokeStyle=color; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-15,0); ctx.lineTo(10,0); ctx.stroke();
    ctx.fillStyle=color;
    ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(8,3); ctx.lineTo(8,-3); ctx.closePath(); ctx.fill();
    ctx.restore();
  },onHit);
}
function vfxLight(a,b,color,onHit){
  travel(a,b,350,(ctx,x,y,t)=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,20);
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.5,color); g.addColorStop(1,'transparent');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,20,0,Math.PI*2); ctx.fill();
  },onHit);
}
function vfxSoulSteal(a,b,color,onHit){
  const start=performance.now(),dur=600;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.globalAlpha=1-t;
      for(let i=0;i<4;i++){
        const tt=clamp(t-i*0.1,0,1);
        const x=b.x+(a.x-b.x)*tt, y=b.y+(a.y-b.y)*tt-Math.sin(tt*Math.PI)*30;
        ctx.beginPath(); ctx.arc(x,y,4+i,0,Math.PI*2); ctx.stroke();
      }
    }
  });
  setTimeout(onHit,dur*0.3);
}
function vfxSmash(a,b,color,onHit){
  const start=performance.now(),dur=400;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.fillStyle=color; ctx.globalAlpha=(1-t);
      for(let i=0;i<10;i++){
        const ang=i/10*Math.PI*2, r=t*50;
        ctx.fillRect(b.x+Math.cos(ang)*r-2,b.y+Math.sin(ang)*r-2,4,4);
      }
      ctx.strokeStyle='#fff'; ctx.lineWidth=3*(1-t); ctx.globalAlpha=1-t;
      ctx.beginPath(); ctx.arc(b.x,b.y,t*40,0,Math.PI*2); ctx.stroke();
    }
  });
  setTimeout(onHit,dur*0.4);
}
function vfxDrain(a,b,color,onHit){
  travel(a,b,400,(ctx,x,y,t)=>{
    ctx.fillStyle=color; ctx.globalAlpha=0.8;
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=1; ctx.globalAlpha=0.4;
    ctx.beginPath(); ctx.arc(x,y,12+Math.sin(t*10)*3,0,Math.PI*2); ctx.stroke();
  },onHit);
}

export function spawnHitBurst(unit,color){
  const p=getUnitScreenPos(unit); if(!p) return;
  const c=color||'#ff5252';
  const start=performance.now(),dur=500;
  const parts=[];
  for(let i=0;i<22;i++){
    const ang=Math.random()*Math.PI*2, sp=2+Math.random()*5;
    parts.push({x:p.x,y:p.y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,r:2+Math.random()*2.5});
  }
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle=c; ctx.lineWidth=3; ctx.globalAlpha=1-t;
      ctx.beginPath(); ctx.arc(p.x,p.y,t*40,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=c;
      parts.forEach(pt=>{
        pt.x+=pt.vx; pt.y+=pt.vy; pt.vy+=0.2;
        ctx.globalAlpha=1-t;
        ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.r,0,Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha=1;
    }
  });
}
export function spawnCritBurst(unit){
  const p=getUnitScreenPos(unit); if(!p) return;
  const start=performance.now(),dur=500;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle='#ffd54f'; ctx.lineWidth=3*(1-t); ctx.globalAlpha=1-t;
      for(let i=0;i<12;i++){
        const ang=i/12*Math.PI*2, r1=10+t*30, r2=30+t*60;
        ctx.beginPath();
        ctx.moveTo(p.x+Math.cos(ang)*r1,p.y+Math.sin(ang)*r1);
        ctx.lineTo(p.x+Math.cos(ang)*r2,p.y+Math.sin(ang)*r2);
        ctx.stroke();
      }
    }
  });
}
export function spawnHealColumn(unit,color){
  const p=getUnitScreenPos(unit); if(!p) return;
  const c=color||'#16c79a';
  const start=performance.now(),dur=800;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      const g=ctx.createLinearGradient(p.x,p.y-80,p.x,p.y+40);
      g.addColorStop(0,'transparent'); g.addColorStop(0.5,c+'aa'); g.addColorStop(1,'transparent');
      ctx.fillStyle=g; ctx.globalAlpha=1-t;
      ctx.fillRect(p.x-25,p.y-80,50,120);
      ctx.strokeStyle=c; ctx.lineWidth=2;
      for(let i=0;i<3;i++){
        const tt=clamp(t-i*0.15,0,1);
        ctx.globalAlpha=(1-tt)*0.7;
        ctx.beginPath(); ctx.arc(p.x,p.y+30,10+tt*50,0,Math.PI*2); ctx.stroke();
      }
    }
  });
}
export function spawnHexShield(unit){
  const p=getUnitScreenPos(unit); if(!p) return;
  const start=performance.now(),dur=900;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle='#90caf9'; ctx.lineWidth=2; ctx.globalAlpha=1-t;
      for(let r=20;r<55;r+=12){
        ctx.beginPath();
        for(let i=0;i<=6;i++){
          const a=i/6*Math.PI*2+t*Math.PI;
          const x=p.x+Math.cos(a)*r, y=p.y+Math.sin(a)*r;
          if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
    }
  });
}
export function spawnAura(unit,color){
  const p=getUnitScreenPos(unit); if(!p) return;
  const start=performance.now(),dur=900;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.globalAlpha=(1-t)*0.8;
      for(let i=0;i<3;i++){
        const tt=clamp(t-i*0.2,0,1);
        ctx.beginPath(); ctx.ellipse(p.x,p.y,20+tt*30,8+tt*12,0,0,Math.PI*2); ctx.stroke();
      }
      for(let i=0;i<6;i++){
        const ang=i/6*Math.PI*2+t*Math.PI*2, r=20+t*30;
        ctx.fillStyle=color; ctx.globalAlpha=1-t;
        ctx.beginPath(); ctx.arc(p.x+Math.cos(ang)*r,p.y+Math.sin(ang)*r-t*20,2,0,Math.PI*2); ctx.fill();
      }
    }
  });
}
export function spawnSmoke(unit){
  const p=getUnitScreenPos(unit); if(!p) return;
  const start=performance.now(),dur=600;
  const parts=[];
  for(let i=0;i<15;i++) parts.push({x:p.x+(Math.random()-0.5)*30,y:p.y+(Math.random()-0.5)*30,r:5+Math.random()*8});
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      parts.forEach(pt=>{
        ctx.fillStyle='rgba(200,200,200,'+(0.6*(1-t))+')';
        ctx.beginPath(); ctx.arc(pt.x,pt.y-t*20,pt.r+t*10,0,Math.PI*2); ctx.fill();
      });
    }
  });
}
export function spawnCurse(unit){
  const p=getUnitScreenPos(unit); if(!p) return;
  const start=performance.now(),dur=900;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle='#7e57c2'; ctx.lineWidth=2; ctx.globalAlpha=1-t;
      for(let i=0;i<5;i++){
        const ang=i/5*Math.PI*2+t*Math.PI*4;
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+Math.cos(ang)*40,p.y+Math.sin(ang)*40); ctx.stroke();
      }
    }
  });
}
export function spawnDrainBeam(from,to){
  const a=getUnitScreenPos(from), b=getUnitScreenPos(to);
  if(!a||!b) return;
  const start=performance.now(),dur=500;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      ctx.strokeStyle='#b71c1c'; ctx.lineWidth=3*(1-t); ctx.globalAlpha=1-t;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      for(let i=0;i<5;i++){
        const tt=(t+i*0.15)%1;
        const x=a.x+(b.x-a.x)*tt, y=a.y+(b.y-a.y)*tt;
        ctx.fillStyle='#ff5252'; ctx.globalAlpha=(1-t);
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      }
    }
  });
}
export function spawnFloatText(unit,text,color,size){
  const p=getUnitScreenPos(unit); if(!p) return;
  const start=performance.now(),dur=1100;
  const offsetX=(Math.random()-0.5)*40;
  const fs=size||18;
  pushFx({
    endAt:start+dur,
    draw:(ctx,now)=>{
      const t=(now-start)/dur;
      const scale=t<0.2?(t/0.2)*1.2:1.2-((t-0.2)/0.8)*0.2;
      ctx.globalAlpha=1-t*t;
      ctx.fillStyle=color||'#fff';
      ctx.font=`bold ${fs*scale}px "Courier New", monospace`;
      ctx.textAlign='center';
      ctx.strokeStyle='rgba(0,0,0,.85)'; ctx.lineWidth=3;
      ctx.strokeText(text,p.x+offsetX,p.y-t*60);
      ctx.fillText(text,p.x+offsetX,p.y-t*60);
      ctx.globalAlpha=1;
    }
  });
}
