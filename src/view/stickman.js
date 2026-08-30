import { visualFor } from '../data/character-visuals.js';

// 数据驱动的程序化角色渲染器。选角预览与战斗共用这一入口。
const palCache=new Map();

function palette(hex='#fff'){
  if(palCache.has(hex)) return palCache.get(hex);
  const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)||['','ff','ff','ff'];
  const rgb=[1,2,3].map(i=>parseInt(m[i],16));
  const mix=(to,k)=>`rgb(${rgb.map((v,i)=>Math.round(v+(to[i]-v)*k)).join(',')})`;
  const p={ base:hex, light:mix([255,255,255],.46), rim:mix([190,255,245],.62),
    shade:mix([25,24,34],.52), dark:mix([10,11,18],.76), glow:mix([255,235,170],.28) };
  palCache.set(hex,p); return p;
}

const point=(x,y)=>({x,y});

function limb(ctx,a,b,wa,wb,color){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  ctx.fillStyle=color; ctx.beginPath();
  ctx.moveTo(a.x+nx*wa,a.y+ny*wa); ctx.lineTo(b.x+nx*wb,b.y+ny*wb);
  ctx.lineTo(b.x-nx*wb,b.y-ny*wb); ctx.lineTo(a.x-nx*wa,a.y-ny*wa); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(a.x,a.y,wa,0,Math.PI*2); ctx.arc(b.x,b.y,wb,0,Math.PI*2); ctx.fill();
}

function poseOf(v,state,t,w,h,facing){
  const idle=state==='idle'||state==='stun';
  const breath=idle?Math.sin(t*.28)*h*.008:0;
  // 非待机状态也保留一个动作循环，方便验收板直接看清完整幅度。
  const attack=state==='attack' ? .82+.18*Math.sin(t*.22) : 0;
  const hurt=state==='hurt' ? .88+.12*Math.sin(t*.28) : 0;
  const stance={
    forward:{lean:.025,crouch:0,spread:.13}, upright:{lean:0,crouch:-.01,spread:.10},
    low:{lean:.015,crouch:.035,spread:.17}, crouch:{lean:.07,crouch:.045,spread:.15},
    back:{lean:-.025,crouch:.01,spread:.13}, float:{lean:0,crouch:-.035,spread:.08},
    draw:{lean:-.015,crouch:.04,spread:.16}, open:{lean:0,crouch:.02,spread:.18},
    side:{lean:.045,crouch:.025,spread:.09}
  }[v.stance]||{lean:0,crouch:0,spread:.12};
  const actionLean={dash:.22,bash:.17,lunge:.24,smash:.15,drawCut:.25,counter:-.15,combo:.19,reap:.19,beat:.12}[v.attack]||.12;
  const cx=w*(.5+(stance.lean+attack*actionLean-hurt*.17)*facing);
  const hipY=h*(.65+stance.crouch+hurt*.07-attack*.018)+breath;
  const neckY=h*(.35+stance.crouch*.55+hurt*.105-attack*.035)+breath;
  const float=v.stance==='float'?Math.sin(t*.18)*h*.018:0;
  const shoulder=point(cx-w*.01*facing,neckY+float), hip=point(cx,hipY+float);
  const armReach=attack?(['cast','curse','ritual','shoot'].includes(v.attack)?.20:.25):.14;
  return {cx,shoulder,hip,float,
    head:point(cx-w*(.005+hurt*.09)*facing,neckY-h*(.125+hurt*.035)+float),
    elbowFar:point(cx-w*(.10+hurt*.08)*facing,neckY+h*(.10-hurt*.12)+float),
    handFar:point(cx-w*(.15+hurt*.18)*facing,neckY+h*(.19-hurt*.23)+float),
    elbowNear:point(cx+w*(attack?armReach*.58:.09-hurt*.13)*facing,neckY+h*(attack?.045:.10-hurt*.15)+float),
    handNear:point(cx+w*(attack?armReach:.14-hurt*.23)*facing,neckY+h*(attack?-.005:.19-hurt*.28)+float),
    kneeFar:point(cx-w*(stance.spread*.55+hurt*.08)*facing,h*(.79+hurt*.035)+float),
    footFar:point(cx-w*(stance.spread+hurt*.12)*facing,h*(v.stance==='float'?.88:.92)+float),
    kneeNear:point(cx+w*(stance.spread*.5-hurt*.05)*facing,h*(.79+hurt*.06)+float),
    footNear:point(cx+w*(stance.spread-hurt*.08)*facing,h*(v.stance==='float'?.88:.92)+float)
  };
}

const BODY={
  light:{shoulder:.075,hip:.05,limb:.032,head:.082}, balanced:{shoulder:.095,hip:.06,limb:.04,head:.088},
  heavy:{shoulder:.145,hip:.085,limb:.052,head:.086}, athletic:{shoulder:.12,hip:.07,limb:.048,head:.085},
  robe:{shoulder:.095,hip:.12,limb:.035,head:.087}, wideRobe:{shoulder:.13,hip:.18,limb:.038,head:.086},
  tall:{shoulder:.09,hip:.055,limb:.036,head:.079},
  petite:{shoulder:.078,hip:.055,limb:.03,head:.103},
  petiteRobe:{shoulder:.092,hip:.13,limb:.031,head:.105}
};

function drawBody(ctx,P,b,p,w,h){
  limb(ctx,P.hip,P.kneeFar,w*b.limb,w*b.limb*.75,p.dark);
  limb(ctx,P.kneeFar,P.footFar,w*b.limb*.75,w*b.limb*.52,p.dark);
  limb(ctx,P.shoulder,P.elbowFar,w*b.limb*.88,w*b.limb*.68,p.dark);
  limb(ctx,P.elbowFar,P.handFar,w*b.limb*.68,w*b.limb*.48,p.dark);
  ctx.fillStyle=p.base; ctx.beginPath();
  ctx.moveTo(P.shoulder.x-w*b.shoulder,P.shoulder.y); ctx.lineTo(P.shoulder.x+w*b.shoulder,P.shoulder.y);
  ctx.lineTo(P.hip.x+w*b.hip,P.hip.y); ctx.lineTo(P.hip.x-w*b.hip,P.hip.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle=p.shade; ctx.beginPath();
  ctx.moveTo(P.shoulder.x-w*b.shoulder,P.shoulder.y); ctx.lineTo(P.shoulder.x,P.shoulder.y);
  ctx.lineTo(P.hip.x,P.hip.y); ctx.lineTo(P.hip.x-w*b.hip,P.hip.y); ctx.closePath(); ctx.fill();
  limb(ctx,P.hip,P.kneeNear,w*b.limb*1.05,w*b.limb*.78,p.base);
  limb(ctx,P.kneeNear,P.footNear,w*b.limb*.78,w*b.limb*.54,p.base);
  limb(ctx,P.shoulder,P.elbowNear,w*b.limb,w*b.limb*.72,p.base);
  limb(ctx,P.elbowNear,P.handNear,w*b.limb*.72,w*b.limb*.48,p.base);
  ctx.strokeStyle=p.rim; ctx.globalAlpha=.62; ctx.lineWidth=Math.max(1,w*.012); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(P.shoulder.x+w*b.shoulder*.85,P.shoulder.y+h*.01);
  ctx.lineTo(P.hip.x+w*b.hip*.85,P.hip.y); ctx.stroke(); ctx.globalAlpha=1;
}

function drawHead(ctx,P,b,p,w,h,v,facing,t,state){
  const r=h*b.head,x=P.head.x,y=P.head.y;
  ctx.fillStyle=p.shade; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=p.base; ctx.beginPath(); ctx.arc(x,y-r*.08,r*.94,Math.PI,0); ctx.fill();
  ctx.fillStyle=p.light; ctx.globalAlpha=.55; ctx.beginPath(); ctx.ellipse(x+r*.25*facing,y-r*.33,r*.34,r*.23,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  drawHeadgear(ctx,v.head,x,y,r,p,facing,t);
  if(state==='hurt'){
    ctx.strokeStyle='#17151d';ctx.lineWidth=Math.max(1,w*.014);ctx.beginPath();
    ctx.moveTo(x-r*.5,y);ctx.lineTo(x-r*.2,y+r*.18);ctx.moveTo(x+r*.2,y);ctx.lineTo(x+r*.5,y+r*.18);ctx.stroke();
  }else if(v.face==='cute'){
    ctx.fillStyle='#17151d';ctx.beginPath();ctx.ellipse(x-r*.32,y+r*.04,r*.11,r*.17,-.12,0,Math.PI*2);ctx.ellipse(x+r*.32,y+r*.04,r*.11,r*.17,.12,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#5b2538';ctx.lineWidth=Math.max(1,w*.01);ctx.beginPath();ctx.arc(x,y+r*.28,r*.2,.15,Math.PI-.15);ctx.stroke();
    ctx.fillStyle='rgba(255,150,170,.55)';ctx.beginPath();ctx.ellipse(x-r*.58,y+r*.26,r*.2,r*.1,0,0,Math.PI*2);ctx.ellipse(x+r*.58,y+r*.26,r*.2,r*.1,0,0,Math.PI*2);ctx.fill();
  }else if(v.face==='cheerful'){
    ctx.strokeStyle='#17151d';ctx.lineWidth=Math.max(1,w*.015);ctx.beginPath();ctx.arc(x-r*.32,y+r*.05,r*.16,.15,Math.PI-.15);ctx.arc(x+r*.32,y+r*.05,r*.16,.15,Math.PI-.15);ctx.stroke();
    ctx.beginPath();ctx.arc(x,y+r*.2,r*.26,.12,Math.PI-.12);ctx.stroke();
    ctx.fillStyle='rgba(255,145,120,.6)';ctx.beginPath();ctx.ellipse(x-r*.6,y+r*.27,r*.22,r*.11,0,0,Math.PI*2);ctx.ellipse(x+r*.6,y+r*.27,r*.22,r*.11,0,0,Math.PI*2);ctx.fill();
  }else{
    ctx.fillStyle='#17151d';ctx.beginPath();ctx.ellipse(x-r*.32,y+r*.05,r*.12,r*.16,0,0,Math.PI*2);ctx.ellipse(x+r*.32,y+r*.05,r*.12,r*.16,0,0,Math.PI*2);ctx.fill();
  }
}

function drawHeadgear(ctx,type,x,y,r,p,facing,t){
  ctx.fillStyle=p.dark;ctx.strokeStyle=p.rim;ctx.lineWidth=Math.max(1,r*.12);ctx.lineCap='round';
  switch(type){
    case'headband':ctx.fillRect(x-r,y-r*.25,r*2,r*.24);ctx.beginPath();ctx.moveTo(x-r*.8*facing,y-r*.15);ctx.lineTo(x-r*(1.5+.15*Math.sin(t*.2))*facing,y+r*.1);ctx.stroke();break;
    case'circlet':ctx.beginPath();ctx.arc(x,y-r*.1,r*.9,Math.PI*1.08,Math.PI*1.92);ctx.stroke();ctx.fillStyle=p.glow;ctx.beginPath();ctx.arc(x,y-r*.82,r*.14,0,Math.PI*2);ctx.fill();break;
    case'helmet':ctx.beginPath();ctx.arc(x,y,r*.98,Math.PI,0);ctx.fill();ctx.fillRect(x-r*.98,y-r*.05,r*1.96,r*.5);ctx.strokeStyle='#161821';ctx.beginPath();ctx.moveTo(x-r*.62,y+r*.08);ctx.lineTo(x+r*.62,y+r*.08);ctx.stroke();break;
    case'hood':ctx.beginPath();ctx.moveTo(x,y-r*1.35);ctx.lineTo(x-r*1.05,y+r*.65);ctx.lineTo(x+r*1.05,y+r*.65);ctx.closePath();ctx.fill();break;
    case'halo':ctx.strokeStyle=p.glow;ctx.globalAlpha=.8;ctx.beginPath();ctx.ellipse(x,y-r*1.2,r*.72,r*.2,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;break;
    case'mane':for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(x-r*.7+i*r*.35,y-r*.55);ctx.lineTo(x-r*.8+i*r*.4,y-r*(1.25+.2*Math.sin(t*.2+i)));ctx.lineTo(x-r*.25+i*r*.22,y-r*.6);ctx.fill();}break;
    case'ponytail':ctx.beginPath();ctx.arc(x-r*.6*facing,y-r*.45,r*.35,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(x-r*.7*facing,y-r*.3);ctx.quadraticCurveTo(x-r*(1.5+.18*Math.sin(t*.2))*facing,y,x-r*1.25*facing,y+r*.8);ctx.lineWidth=r*.32;ctx.strokeStyle=p.dark;ctx.stroke();break;
    case'hornCollar':ctx.beginPath();ctx.moveTo(x-r*.9,y+r*.5);ctx.lineTo(x-r*1.25,y-r*.65);ctx.lineTo(x-r*.45,y-r*.15);ctx.lineTo(x+r*.45,y-r*.15);ctx.lineTo(x+r*1.25,y-r*.65);ctx.lineTo(x+r*.9,y+r*.5);ctx.fill();break;
    case'longKnot':ctx.beginPath();ctx.arc(x-r*.42*facing,y-r*.82,r*.34,0,Math.PI*2);ctx.fill();ctx.strokeStyle=p.dark;ctx.lineWidth=r*.38;ctx.beginPath();ctx.moveTo(x-r*.55*facing,y-r*.65);ctx.quadraticCurveTo(x-r*1.25*facing,y+r*.35,x-r*(1.15+.12*Math.sin(t*.2))*facing,y+r*1.35);ctx.stroke();ctx.fillStyle=p.light;ctx.beginPath();ctx.moveTo(x-r*.6*facing,y-r*.82);ctx.lineTo(x-r*1.08*facing,y-r*.98);ctx.lineTo(x-r*.82*facing,y-r*.52);ctx.closePath();ctx.fill();break;
    case'highCrown':ctx.fillRect(x-r*.38,y-r*1.35,r*.76,r*.72);ctx.beginPath();ctx.moveTo(x-r*.5,y-r*.65);ctx.lineTo(x,y-r*1.55);ctx.lineTo(x+r*.5,y-r*.65);ctx.closePath();ctx.fill();break;
    case'goggles':ctx.strokeStyle=p.glow;ctx.beginPath();ctx.arc(x-r*.38,y-r*.08,r*.28,0,Math.PI*2);ctx.arc(x+r*.38,y-r*.08,r*.28,0,Math.PI*2);ctx.stroke();break;
    case'doubleBun':ctx.beginPath();ctx.arc(x-r*.72,y-r*.62,r*.43,0,Math.PI*2);ctx.arc(x+r*.72,y-r*.62,r*.43,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.light;for(const s of[-1,1]){ctx.beginPath();ctx.arc(x+s*r*.73,y-r*.64,r*.15,0,Math.PI*2);ctx.fill();}break;
    case'herbPin':ctx.strokeStyle=p.rim;ctx.beginPath();ctx.moveTo(x+r*.2,y-r*.8);ctx.lineTo(x+r*.75,y-r*1.25);ctx.stroke();ctx.fillStyle=p.rim;ctx.beginPath();ctx.ellipse(x+r*.68,y-r*1.22,r*.28,r*.12,-.5,0,Math.PI*2);ctx.fill();break;
    case'halfMask':ctx.fillStyle=p.dark;ctx.beginPath();ctx.arc(x,y+r*.18,r*.82,0,Math.PI);ctx.fill();break;
    case'bare':ctx.strokeStyle=p.rim;ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(x,y,r*.92,Math.PI*1.05,Math.PI*1.75);ctx.stroke();ctx.globalAlpha=1;break;
    case'featherHood':ctx.beginPath();ctx.moveTo(x-r*.95,y+r*.45);ctx.lineTo(x-r*.55,y-r*1.1);ctx.lineTo(x,y-r*.65);ctx.lineTo(x+r*.55,y-r*1.1);ctx.lineTo(x+r*.95,y+r*.45);ctx.closePath();ctx.fill();break;
  }
}

function drawOuterBack(ctx,type,P,p,w,h,facing,t){
  ctx.fillStyle=p.dark;ctx.strokeStyle=p.rim;ctx.lineWidth=Math.max(1,w*.012);ctx.lineCap='round';
  switch(type){
    case'scarf':case'splitScarf':{const n=type==='splitScarf'?2:1;for(let i=0;i<n;i++){ctx.strokeStyle=p.shade;ctx.lineWidth=w*.035;ctx.beginPath();ctx.moveTo(P.shoulder.x-w*.04*facing,P.shoulder.y);ctx.quadraticCurveTo(P.cx-w*.22*facing,P.hip.y-h*.02,P.cx-w*(.31+i*.06+.02*Math.sin(t*.2+i))*facing,P.hip.y+h*(.03+i*.08));ctx.stroke();}}break;
    case'wideSleeves':ctx.globalAlpha=.9;ctx.beginPath();ctx.moveTo(P.shoulder.x-w*.08,P.shoulder.y);ctx.lineTo(P.handFar.x-w*.06,P.handFar.y+h*.12);ctx.lineTo(P.elbowFar.x+w*.04,P.elbowFar.y);ctx.closePath();ctx.fill();ctx.globalAlpha=1;break;
    case'warRags':for(let i=0;i<3;i++){ctx.strokeStyle=p.dark;ctx.lineWidth=w*.025;ctx.beginPath();ctx.moveTo(P.hip.x-w*.04+i*w*.04,P.hip.y);ctx.lineTo(P.hip.x-w*(.14-i*.09)+Math.sin(t*.18+i)*2,P.hip.y+h*(.2+i*.035));ctx.stroke();}break;
    case'quiver':ctx.save();ctx.translate(P.cx-w*.09*facing,P.shoulder.y+h*.13);ctx.rotate(-.25*facing);ctx.fillRect(-w*.035,-h*.12,w*.07,h*.3);ctx.strokeStyle=p.light;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*w*.025,-h*.1);ctx.lineTo(i*w*.04,-h*.22);ctx.stroke();}ctx.restore();break;
    case'orbital':for(let i=0;i<2;i++){const a=t*.12+i*Math.PI;ctx.fillStyle=p.rim;ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(P.cx+Math.cos(a)*w*.18,P.shoulder.y+Math.sin(a)*h*.12,w*.025,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;break;
    case'sash':ctx.strokeStyle=p.shade;ctx.lineWidth=w*.035;ctx.beginPath();ctx.moveTo(P.hip.x-w*.04*facing,P.hip.y);ctx.quadraticCurveTo(P.cx-w*.18*facing,P.hip.y+h*.1,P.cx-w*(.3+.03*Math.sin(t*.2))*facing,P.hip.y+h*.06);ctx.stroke();break;
    case'gearPack':ctx.fillStyle='#3d4650';ctx.fillRect(P.cx-w*.13*facing,P.shoulder.y+h*.05,w*.17,h*.28);for(let i=0;i<2;i++){ctx.strokeStyle=p.rim;ctx.beginPath();ctx.arc(P.cx-w*(.12+i*.05)*facing,P.shoulder.y+h*(.12+i*.11),w*.045,0,Math.PI*2);ctx.stroke();}break;
    case'gourd':ctx.fillStyle=p.glow;ctx.beginPath();ctx.arc(P.cx-w*.14*facing,P.shoulder.y+h*.16,w*.055,0,Math.PI*2);ctx.arc(P.cx-w*.14*facing,P.shoulder.y+h*.24,w*.085,0,Math.PI*2);ctx.fill();break;
    case'featherCape':for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(P.cx-w*(.08+i*.035)*facing,P.shoulder.y+h*(.10+i*.07),w*.08,h*.13,-.25*facing,0,Math.PI*2);ctx.fill();}break;
  }
}

function drawOuterFront(ctx,type,P,p,w,h,facing,t,state){
  ctx.fillStyle=p.dark;ctx.strokeStyle=p.rim;ctx.lineWidth=Math.max(1,w*.014);ctx.lineJoin='round';
  switch(type){
    case'shield':drawShield(ctx,P.handNear,w,h,facing,state==='attack');break;
    case'twinBlades':drawWeapon(ctx,P.handFar.x,P.handFar.y,'dagger',p.light,facing,false);break;
    case'mantle':ctx.beginPath();ctx.roundRect(P.shoulder.x-w*.14,P.shoulder.y-h*.02,w*.28,h*.11,w*.03);ctx.fill();break;
    case'talismans':for(let i=0;i<3;i++){const x=P.cx+w*(.14+i*.055)*facing,y=P.shoulder.y+h*(.02+i*.08);ctx.fillStyle=p.light;ctx.fillRect(x-w*.025,y,w*.05,h*.12);ctx.strokeStyle=p.shade;ctx.beginPath();ctx.moveTo(x-w*.015,y+h*.04);ctx.lineTo(x+w*.015,y+h*.07);ctx.stroke();}break;
    case'warDrum':ctx.fillStyle=p.shade;ctx.beginPath();ctx.ellipse(P.cx,P.hip.y-h*.035,w*.165,h*.17,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=p.rim;ctx.lineWidth=w*.018;ctx.stroke();ctx.fillStyle=p.glow;for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.arc(P.cx+Math.cos(a)*w*.14,P.hip.y-h*.035+Math.sin(a)*h*.145,w*.012,0,Math.PI*2);ctx.fill();}ctx.beginPath();ctx.moveTo(P.cx-w*.1,P.hip.y-h*.13);ctx.lineTo(P.cx+w*.1,P.hip.y+h*.06);ctx.moveTo(P.cx+w*.1,P.hip.y-h*.13);ctx.lineTo(P.cx-w*.1,P.hip.y+h*.06);ctx.stroke();break;
    case'beads':for(let i=0;i<7;i++){const a=Math.PI*.15+i*Math.PI*.7/6;ctx.fillStyle=p.glow;ctx.beginPath();ctx.arc(P.cx+Math.cos(a)*w*.1,P.shoulder.y+h*.06+Math.sin(a)*h*.1,w*.018,0,Math.PI*2);ctx.fill();}break;
  }
}

function drawShield(ctx,hand,w,h,facing,attack){
  const x=hand.x+w*.035*facing,y=hand.y+h*.035,sw=w*.24,sh=h*.43;
  ctx.save();ctx.translate(x,y);ctx.scale(facing,1);ctx.fillStyle='#303742';ctx.strokeStyle='#a9d7d2';ctx.lineWidth=Math.max(1.2,w*.018);
  ctx.beginPath();ctx.moveTo(0,-sh*.48);ctx.lineTo(sw*.5,-sh*.3);ctx.lineTo(sw*.43,sh*.26);ctx.quadraticCurveTo(0,sh*.55,-sw*.43,sh*.26);ctx.lineTo(-sw*.5,-sh*.3);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='rgba(169,215,210,.5)';ctx.beginPath();ctx.moveTo(0,-sh*.4);ctx.lineTo(0,sh*.38);ctx.moveTo(-sw*.38,-sh*.22);ctx.lineTo(sw*.38,-sh*.22);ctx.stroke();ctx.restore();
}

function drawAccent(ctx,v,P,p,w,h,facing,t,state){
  ctx.strokeStyle=p.rim;ctx.fillStyle=p.glow;ctx.lineCap='round';
  if(state==='attack'){
    ctx.globalAlpha=.5;ctx.lineWidth=w*.025;
    if(['dash','lunge','drawCut','counter','reap'].includes(v.attack)){ctx.beginPath();ctx.arc(P.handNear.x-w*.08*facing,P.handNear.y,w*.27,-1.1,1.1);ctx.stroke();}
    if(['cast','curse','ritual'].includes(v.attack)){ctx.beginPath();ctx.arc(P.handNear.x,P.handNear.y,w*.1,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(P.handNear.x,P.handNear.y,w*.04,0,Math.PI*2);ctx.fill();}
    if(v.attack==='bash'){for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(P.handNear.x+w*.13*facing,P.handNear.y+(i-1)*h*.04);ctx.lineTo(P.handNear.x+w*.2*facing,P.handNear.y+(i-1)*h*.06);ctx.stroke();}}
    if(v.attack==='beat'){ctx.beginPath();ctx.arc(P.cx,P.hip.y-h*.05,w*.25,0,Math.PI*2);ctx.stroke();}
    if(v.attack==='combo'){for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(P.handNear.x+i*w*.045*facing,P.handNear.y-i*h*.025,w*.025,0,Math.PI*2);ctx.fill();}}
    ctx.globalAlpha=1;
  }
  if(state==='stun'){
    ctx.fillStyle='#f5c45d';for(let i=0;i<3;i++){const a=t*.25+i*Math.PI*2/3;ctx.beginPath();ctx.arc(P.head.x+Math.cos(a)*w*.12,P.head.y-h*.11+Math.sin(a)*h*.025,w*.018,0,Math.PI*2);ctx.fill();}
  }
}

function drawDead(ctx,w,h){
  ctx.globalAlpha=.55;ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(w*.5,h*.91,w*.34,h*.025,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#4b4d59';ctx.lineWidth=w*.055;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(w*.34,h*.82);ctx.lineTo(w*.76,h*.86);ctx.stroke();ctx.fillStyle='#4b4d59';ctx.beginPath();ctx.arc(w*.27,h*.81,h*.07,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
}

export function drawStickman(canvas,unit,state='idle',t=0){
  if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if(state==='dead'){drawDead(ctx,w,h);return;}
  const v=visualFor(unit.charId||unit.id),p=palette(unit.color||'#fff'),facing=unit.player===2?-1:1,b=BODY[v.body]||BODY.balanced,P=poseOf(v,state,t||0,w,h,facing);
  ctx.fillStyle='rgba(0,0,0,.48)';ctx.beginPath();ctx.ellipse(P.cx,h*.945,w*(v.body==='heavy'?.31:.25),h*.022,0,0,Math.PI*2);ctx.fill();
  drawOuterBack(ctx,v.outer,P,p,w,h,facing,t||0);drawBody(ctx,P,b,p,w,h);drawHead(ctx,P,b,p,w,h,v,facing,t||0,state);
  drawOuterFront(ctx,v.outer,P,p,w,h,facing,t||0,state);
  if(v.outer!=='shield'&&v.outer!=='warDrum')drawWeapon(ctx,P.handNear.x,P.handNear.y,unit.weapon||'sword',p.light,facing,state==='attack');
  drawAccent(ctx,v,P,p,w,h,facing,t||0,state);
}

export function drawWeapon(ctx,x,y,type,color,facing,isAttack){
  ctx.save();ctx.translate(x,y);ctx.scale(facing,1);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';
  const a=isAttack?-5:7;
  switch(type){
    case'sword':case'katana':ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(type==='katana'?25:21,a);ctx.stroke();ctx.beginPath();ctx.moveTo(3,-3);ctx.lineTo(3,4);ctx.stroke();break;
    case'staff':case'cross':ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(5,-22);ctx.stroke();if(type==='cross'){ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(10,-13);ctx.stroke();}else{ctx.beginPath();ctx.arc(6,-24,4,0,Math.PI*2);ctx.stroke();}break;
    case'axe':ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(16,-13);ctx.stroke();ctx.beginPath();ctx.moveTo(13,-16);ctx.quadraticCurveTo(24,-16,20,-5);ctx.lineTo(14,-9);ctx.closePath();ctx.fill();break;
    case'bow':ctx.beginPath();ctx.arc(4,0,16,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(4,-16);ctx.lineTo(4,16);ctx.stroke();break;
    case'dagger':case'kunai':ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(13,-5);ctx.stroke();ctx.beginPath();ctx.moveTo(13,-5);ctx.lineTo(9,-8);ctx.lineTo(16,-6);ctx.lineTo(11,-2);ctx.closePath();ctx.fill();break;
    case'orb':ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(8,-5,6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;break;
    case'ofuda':ctx.fillRect(3,-12,8,17);ctx.strokeStyle='rgba(20,20,30,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(5,-8);ctx.lineTo(9,0);ctx.stroke();break;
    case'gear':ctx.beginPath();ctx.arc(8,-4,6,0,Math.PI*2);ctx.stroke();for(let i=0;i<6;i++){const q=i*Math.PI/3;ctx.beginPath();ctx.moveTo(8+Math.cos(q)*6,-4+Math.sin(q)*6);ctx.lineTo(8+Math.cos(q)*9,-4+Math.sin(q)*9);ctx.stroke();}break;
    case'drum':ctx.beginPath();ctx.ellipse(8,-3,8,11,0,0,Math.PI*2);ctx.stroke();break;
    case'gourd':ctx.beginPath();ctx.arc(7,-7,4,0,Math.PI*2);ctx.arc(7,0,6,0,Math.PI*2);ctx.fill();break;
    case'fist':ctx.beginPath();ctx.arc(4,-2,4,0,Math.PI*2);ctx.fill();break;
    case'scythe':ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(17,-18);ctx.stroke();ctx.beginPath();ctx.moveTo(16,-18);ctx.quadraticCurveTo(29,-19,27,-7);ctx.quadraticCurveTo(23,-12,16,-12);ctx.fill();break;
    case'shield':break;
    default:ctx.beginPath();ctx.arc(5,-3,3,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
