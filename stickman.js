export function drawStickman(canvas,unit,state,t){
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const color=unit.color||'#fff';
  const weapon=unit.weapon||'sword';
  const facing=unit.player===2?-1:1;
  if(state==='dead'){
    ctx.strokeStyle='#555'; ctx.lineWidth=2.5; ctx.lineCap='round';
    ctx.beginPath();
    ctx.arc(w*0.28,h*0.78,h*0.08,0,Math.PI*2);
    ctx.moveTo(w*0.36,h*0.78); ctx.lineTo(w*0.85,h*0.78);
    ctx.moveTo(w*0.5,h*0.78); ctx.lineTo(w*0.55,h*0.85);
    ctx.moveTo(w*0.65,h*0.78); ctx.lineTo(w*0.7,h*0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w*0.24,h*0.74); ctx.lineTo(w*0.28,h*0.78);
    ctx.moveTo(w*0.28,h*0.74); ctx.lineTo(w*0.24,h*0.78);
    ctx.moveTo(w*0.30,h*0.74); ctx.lineTo(w*0.34,h*0.78);
    ctx.moveTo(w*0.34,h*0.74); ctx.lineTo(w*0.30,h*0.78);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(w/2,h*0.95,w*0.30,3,0,0,Math.PI*2); ctx.fill();

  const tt=t||0;
  const breath=state==='idle'?Math.sin(tt*0.3)*1.5:0;
  const lean=state==='attack'?6*facing:state==='hurt'?-4*facing:0;
  const blink = state==='idle' && (tt%40)<2;
  const cx=w/2+lean, headY=h*0.20+breath, headR=h*0.11;

  ctx.fillStyle=color; ctx.globalAlpha=0.4;
  ctx.beginPath();
  const capeWave=Math.sin(tt*0.2)*3;
  ctx.moveTo(cx-facing*4,headY+headR);
  ctx.quadraticCurveTo(cx-facing*(16+capeWave),h*0.55,cx-facing*(10+capeWave),h*0.72);
  ctx.lineTo(cx-facing*2,h*0.66);
  ctx.lineTo(cx,headY+headR);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha=1;

  ctx.fillStyle='#1a1a2e'; ctx.strokeStyle=color; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(cx,headY,headR,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.3)';
  ctx.beginPath(); ctx.arc(cx-headR*0.35,headY-headR*0.35,headR*0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=color; ctx.globalAlpha=0.35;
  ctx.beginPath(); ctx.arc(cx,headY-headR*0.3,headR*0.95,Math.PI,0); ctx.fill();
  ctx.globalAlpha=1;

  const eyeY=headY-1+(state==='hurt'?-1:0);
  if(state==='hurt'){
    ctx.strokeStyle=color; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(cx-headR*0.5,eyeY-2); ctx.lineTo(cx-headR*0.25,eyeY); ctx.lineTo(cx-headR*0.5,eyeY+2);
    ctx.moveTo(cx+headR*0.5,eyeY-2); ctx.lineTo(cx+headR*0.25,eyeY); ctx.lineTo(cx+headR*0.5,eyeY+2);
    ctx.stroke();
  } else if(blink){
    ctx.strokeStyle=color; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(cx-headR*0.55,eyeY); ctx.lineTo(cx-headR*0.25,eyeY);
    ctx.moveTo(cx+headR*0.25,eyeY); ctx.lineTo(cx+headR*0.55,eyeY);
    ctx.stroke();
  } else {
    ctx.fillStyle=color;
    ctx.beginPath();
    ctx.arc(cx-headR*0.4,eyeY,1.7,0,Math.PI*2);
    ctx.arc(cx+headR*0.4,eyeY,1.7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath();
    ctx.arc(cx-headR*0.4+0.6,eyeY-0.4,0.5,0,Math.PI*2);
    ctx.arc(cx+headR*0.4+0.6,eyeY-0.4,0.5,0,Math.PI*2); ctx.fill();
  }

  ctx.strokeStyle=color; ctx.lineWidth=3.5; ctx.lineCap='round';
  const bodyTop=headY+headR, bodyBot=h*0.62;
  ctx.beginPath(); ctx.moveTo(cx,bodyTop); ctx.lineTo(cx+lean*0.3,bodyBot); ctx.stroke();
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.moveTo(cx,bodyTop+5); ctx.lineTo(cx-6,bodyTop+12);
  ctx.lineTo(cx,bodyTop+18); ctx.lineTo(cx+6,bodyTop+12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.6)';
  ctx.beginPath(); ctx.arc(cx,bodyTop+12,1.5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=color; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx-7,bodyBot-4); ctx.lineTo(cx+7,bodyBot-4); ctx.stroke();

  const armY=bodyTop+(bodyBot-bodyTop)*0.25;
  ctx.strokeStyle=color; ctx.lineWidth=3;
  if(state==='attack'){
    ctx.beginPath();
    ctx.moveTo(cx,armY); ctx.lineTo(cx+facing*w*0.32,armY-h*0.1);
    ctx.moveTo(cx,armY); ctx.lineTo(cx-facing*w*0.18,armY+h*0.1);
    ctx.stroke();
    drawWeapon(ctx,cx+facing*w*0.32,armY-h*0.1,weapon,color,facing,true);
  } else {
    ctx.beginPath();
    ctx.moveTo(cx,armY); ctx.lineTo(cx-w*0.22,armY+h*0.13+breath);
    ctx.moveTo(cx,armY); ctx.lineTo(cx+w*0.22,armY+h*0.13-breath);
    ctx.stroke();
    drawWeapon(ctx,cx+facing*w*0.22,armY+h*0.13,weapon,color,facing,false);
  }

  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(cx+lean*0.3,bodyBot); ctx.lineTo(cx-w*0.16,h*0.92);
  ctx.moveTo(cx+lean*0.3,bodyBot); ctx.lineTo(cx+w*0.16,h*0.92);
  ctx.stroke();
  ctx.fillStyle=color;
  ctx.beginPath(); ctx.ellipse(cx-w*0.16,h*0.93,w*0.07,2.5,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+w*0.16,h*0.93,w*0.07,2.5,0,0,Math.PI*2); ctx.fill();

  if(state==='stun'){
    const sa=tt*0.5;
    ctx.fillStyle='#f5a623'; ctx.font='bold 12px sans-serif';
    for(let i=0;i<3;i++){
      const ang=sa+i*Math.PI*2/3;
      ctx.fillText('✦',cx+Math.cos(ang)*headR*1.5,headY-headR*0.8+Math.sin(ang)*4);
    }
  }
  ctx.restore();
}

export function drawWeapon(ctx,x,y,type,color,facing,isAttack){
  ctx.save();
  ctx.translate(x,y); ctx.scale(facing,1);
  ctx.strokeStyle=color; ctx.lineWidth=2.5; ctx.fillStyle=color;
  switch(type){
    case 'sword':
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(isAttack?22:14,isAttack?-6:8); ctx.stroke();
      ctx.lineWidth=3.5;
      ctx.beginPath(); ctx.moveTo(isAttack?-3:-2,isAttack?2:-2); ctx.lineTo(isAttack?5:4,isAttack?-1:4); ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(2,2); ctx.lineTo(isAttack?20:12,isAttack?-4:7); ctx.stroke();
      break;
    case 'axe':
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(14,isAttack?-4:8); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(14,isAttack?-4:8);
      ctx.lineTo(20,isAttack?-10:4); ctx.lineTo(22,isAttack?-2:12); ctx.closePath(); ctx.fill();
      break;
    case 'staff':
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(14,isAttack?-12:14); ctx.stroke();
      ctx.beginPath(); ctx.arc(14,isAttack?-12:14,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(14,isAttack?-12:14,1.8,0,Math.PI*2); ctx.fill();
      break;
    case 'dagger':
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(isAttack?12:8,isAttack?-3:6); ctx.stroke();
      break;
    case 'bow':
      ctx.beginPath(); ctx.arc(8,isAttack?-4:8,8,-Math.PI/2,Math.PI/2); ctx.stroke();
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(8,isAttack?-12:0); ctx.lineTo(8,isAttack?4:16); ctx.stroke();
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(8,isAttack?-8:2); ctx.lineTo(16,isAttack?-4:6);
      ctx.lineTo(16,isAttack?4:14); ctx.lineTo(8,isAttack?8:18); ctx.closePath();
      ctx.fillStyle=color; ctx.fill(); ctx.stroke();
      ctx.fillStyle='rgba(255,255,255,.4)';
      ctx.fillRect(10,isAttack?-6:4,3,isAttack?10:12);
      break;
    case 'cross':
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(12,isAttack?-8:10); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12,isAttack?-8:10);
      ctx.lineTo(8,isAttack?-12:6); ctx.moveTo(12,isAttack?-8:10); ctx.lineTo(16,isAttack?-4:14);
      ctx.stroke();
      break;
    // ── 扩充阵容的武器（ROSTER_PLAN.md） ──────────────────
    case 'katana':            // 刀娘：细长弧刃
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.quadraticCurveTo(isAttack?14:9, isAttack?-8:6, isAttack?26:16, isAttack?-9:11);
      ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.75)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(3,1);
      ctx.quadraticCurveTo(isAttack?14:9, isAttack?-6:7, isAttack?23:14, isAttack?-7:10);
      ctx.stroke();
      break;
    case 'ofuda': {           // 阴阳师：飘着的符纸
      ctx.save(); ctx.translate(isAttack?14:10, isAttack?-10:10);
      ctx.rotate(isAttack?-0.5:0.3);
      ctx.fillStyle='#f5f5f5'; ctx.fillRect(-3,-7,6,14);
      ctx.strokeStyle=color; ctx.lineWidth=1.2; ctx.strokeRect(-3,-7,6,14);
      ctx.beginPath(); ctx.moveTo(0,-4); ctx.lineTo(0,4); ctx.stroke();
      ctx.restore(); break;
    }
    case 'gear': {            // 机关师：齿轮
      const gx=isAttack?15:11, gy=isAttack?-7:11;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(gx,gy); ctx.stroke();
      ctx.beginPath(); ctx.arc(gx,gy,5,0,Math.PI*2); ctx.stroke();
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        ctx.beginPath();
        ctx.moveTo(gx+Math.cos(a)*5, gy+Math.sin(a)*5);
        ctx.lineTo(gx+Math.cos(a)*7.5, gy+Math.sin(a)*7.5);
        ctx.stroke();
      }
      break;
    }
    case 'drum': {            // 鼓姬：鼓 + 鼓槌
      const dx=isAttack?13:10, dy=isAttack?-4:12;
      ctx.beginPath(); ctx.ellipse(dx,dy,7,5,0,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=color+'55'; ctx.fill();
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(dx-4,dy-7); ctx.stroke();
      break;
    }
    case 'gourd': {           // 医仙：药葫芦
      const hx=isAttack?13:10, hy=isAttack?-6:11;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(hx-3,hy-4); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx,hy+3,4.5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx,hy-3,3,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'kunai':             // 影武者：苦无（短、带环）
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(isAttack?11:7,isAttack?-3:6); ctx.stroke();
      ctx.beginPath(); ctx.arc(isAttack?-2:-1, isAttack?1:-1, 2.2, 0, Math.PI*2); ctx.stroke();
      break;
    case 'fist': {            // 拳师：护手（没有武器，画一圈拳套）
      const fx=isAttack?10:6, fy=isAttack?-2:8;
      ctx.beginPath(); ctx.arc(fx,fy,4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(fx,fy,5.5,0,Math.PI*2); ctx.stroke();
      break;
    }
    case 'scythe': {          // 墨鸦：镰
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(isAttack?18:12, isAttack?-14:16); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(isAttack?18:12, isAttack?-14:16);
      ctx.quadraticCurveTo(isAttack?26:20, isAttack?-16:14, isAttack?27:21, isAttack?-8:20);
      ctx.stroke();
      break;
    }
    case 'orb': {
      const og=ctx.createRadialGradient(10,isAttack?-6:10,0,10,isAttack?-6:10,6);
      og.addColorStop(0,'#fff'); og.addColorStop(1,color);
      ctx.fillStyle=og;
      ctx.beginPath(); ctx.arc(10,isAttack?-6:10,5,0,Math.PI*2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}
