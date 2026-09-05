import * as T from '../../vendor/three/three.module.min.js';
import { visualFor } from '../data/character-visuals.js';

// 原创几何模型。关节、披风和武器保留独立节点，可用于实时动作和 GLB 导出。
const mesh = (parent, geometry, material, pos=[0,0,0], rot=[0,0,0]) => {
  const m=new T.Mesh(geometry,material); m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
};
const box=(g,m,size,pos,rot)=>mesh(g,new T.BoxGeometry(...size),m,pos,rot);
const ball=(g,m,r,pos,scale=[1,1,1])=>{ const a=mesh(g,new T.IcosahedronGeometry(r,1),m,pos); a.scale.set(...scale); return a; };
const cone=(g,m,r1,r2,h,pos,rot)=>mesh(g,new T.CylinderGeometry(r1,r2,h,8),m,pos,rot);
const ring=(g,m,r,t,pos,rot)=>mesh(g,new T.TorusGeometry(r,t,5,24),m,pos,rot);
const joint=(g,name,pos)=>{ const j=new T.Group(); j.name=name; j.position.set(...pos); g.add(j); return j; };

function cloth(parent,material,width,length,depth){
  const vertices=[], indices=[];
  for(let y=0;y<=5;y++){
    const t=y/5, w=width*(.64+t*.36);
    for(let x=0;x<=4;x++){
      const s=x/4;
      vertices.push((s-.5)*w,-t*length,depth+t*t*.27+Math.sin(s*Math.PI*4)*t*.05);
      if(y<5 && x<4){const a=y*5+x; indices.push(a,a+1,a+5,a+1,a+6,a+5);}
    }
  }
  const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geo.setIndex(indices); geo.computeVertexNormals(); return mesh(parent,geo,material);
}

function blade(parent,m,length=.95,curve=false){
  const shape=new T.Shape(); shape.moveTo(-.055,0); shape.lineTo(.055,0);
  shape.lineTo(curve?.15:.04,length*.85); shape.lineTo(curve?.2:0,length);
  shape.lineTo(curve?.05:-.055,length*.85); shape.closePath();
  const sword=mesh(parent,new T.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false}),m.steel,[0,.12,0]);
  sword.name='blade'; box(parent,m.gold,[.3,.045,.1],[0,.1,0]);
  cone(parent,m.dark,.035,.035,.23,[0,-.025,0]);
}

function weapon(g,type,m){
  g.name=`weapon-${type}`;
  const shaft=(h=1.5)=>cone(g,m.dark,.035,.045,h,[0,h/2-.25,0]);
  const gem=(pos=[0,1.3,0],r=.16)=>mesh(g,new T.OctahedronGeometry(r),m.glow,pos);
  switch(type){
    case 'sword': blade(g,m); break;
    case 'katana': blade(g,m,1.12,true); break;
    case 'dagger': case 'kunai': blade(g,m,.5,type==='kunai'); break;
    case 'axe':
      shaft(1.3); box(g,m.steel,[.75,.32,.11],[0,1,0],[0,0,.15]);
      mesh(g,new T.ConeGeometry(.24,.4,4),m.steel,[.45,1,0],[0,0,-Math.PI/2]); break;
    case 'shield':
      box(g,m.dark,[.65,.95,.12],[0,.25,0]); box(g,m.gold,[.57,.85,.14],[0,.25,0]);
      box(g,m.color,[.49,.76,.17],[0,.25,0]); box(g,m.gold,[.07,.75,.2],[0,.25,0]);
      gem([0,.25,.16],.12); break;
    case 'bow':
      mesh(g,new T.TorusGeometry(.5,.035,6,24,Math.PI),m.gold,[0,.35,0],[0,0,-Math.PI/2]);
      box(g,m.steel,[.012,1,.012],[0,.35,0]); box(g,m.dark,[.045,.07,.8],[0,.35,.18]); break;
    case 'staff': case 'cross':
      shaft(1.6); ring(g,m.gold,.22,.035,[0,1.35,0]); gem([0,1.35,0]);
      if(type==='cross') box(g,m.gold,[.5,.07,.09],[0,1.45,0]); break;
    case 'scythe':
      shaft(1.8); box(g,m.steel,[.9,.13,.07],[-.35,1.45,0],[0,0,.25]);
      mesh(g,new T.ConeGeometry(.09,.55,4),m.steel,[-.9,1.18,0],[0,0,-.6]); break;
    case 'orb': gem([0,.4,0],.27); ring(g,m.gold,.35,.02,[0,.4,0],[.7,.4,.2]); break;
    case 'ofuda':
      for(let i=0;i<3;i++){
        const card=joint(g,'talisman',[.12*(i-1),.38+.04*i,0]); card.rotation.z=(i-1)*.3;
        box(card,m.paper,[.18,.4,.035],[0,0,0]); box(card,m.color,[.035,.24,.04],[0,0,.02]);
      } break;
    case 'gear':
      cone(g,m.gold,.25,.25,.12,[0,.3,0],[Math.PI/2,0,0]);
      for(let i=0;i<8;i++){const a=i*Math.PI/4; box(g,m.gold,[.13,.13,.1],[Math.cos(a)*.28,.3+Math.sin(a)*.28,0],[0,0,a]);}
      gem([0,.3,.1],.12); break;
    case 'drum':
      cone(g,m.color,.34,.34,.35,[0,.25,0],[Math.PI/2,0,0]);
      cone(g,m.paper,.31,.31,.37,[0,.25,0],[Math.PI/2,0,0]);
      ring(g,m.gold,.34,.035,[0,.25,.2]); break;
    case 'gourd': ball(g,m.gold,.19,[0,.18,0]); ball(g,m.color,.13,[0,.43,0]); cone(g,m.gold,.045,.05,.1,[0,.56,0]); break;
    case 'fist': box(g,m.gold,[.24,.24,.3],[0,.03,.08]); ring(g,m.glow,.15,.018,[0,.03,.25]); break;
    default: blade(g,m,.6);
  }
}

export function createFighter(character){
  const v=visualFor(character.id), body=v.body;
  const heavy=body==='heavy', petite=body.startsWith('petite');
  const robe=body==='robe'||body==='petiteRobe';
  const color=new T.Color(character.color);
  const material=(c,extra={})=>new T.MeshStandardMaterial({color:c,roughness:.75,metalness:.12,flatShading:true,...extra});
  const m={color:material(color), dark:material('#17232f'), gold:material('#d4af67',{metalness:.6,roughness:.38}),
    steel:material('#c9dce2',{metalness:.65,roughness:.3}), skin:material('#d6b497'),
    hair:material(['guardian','priest','bladedancer','onmyoji'].includes(character.id)?'#d9c498':'#1a2130'),
    paper:material('#e8ddc0'), glow:material(color,{emissive:color,emissiveIntensity:1.8}),
    cloth:material(color.clone().multiplyScalar(.5),{side:T.DoubleSide})};
  const root=new T.Group(); root.name=character.id;
  const rig=joint(root,'rig',[0,0,0]);
  const width=heavy?.63:petite?.41:.47;
  // 带膝关节的双腿，裙摆下仍有完整的几何结构。
  const legs=[];
  for(const s of [-1,1]){
    const leg=joint(rig,`leg-${s}`, [s*.145,.77,0]);
    cone(leg,m.dark,.105,.085,.36,[0,-.16,0]);
    const knee=joint(leg,`knee-${s}`,[0,-.34,0]); cone(knee,m.dark,.082,.07,.33,[0,-.15,0]);
    box(knee,m.dark,[.18,.12,.32],[0,-.31,.065]);
    if(!robe) box(knee,m.gold,[.11,.21,.035],[0,-.13,.09]);
    legs.push(leg);
  }
  const torso=joint(rig,'torso',[0,.78,0]);
  cone(torso,m.dark,width*.51,width*.41,.55,[0,.25,0]);
  cone(torso,m.color,width*.52,width*.44,.42,[0,.29,.015]);
  box(torso,m.gold,[width*.95,.09,.3],[0,.06,.01]);
  box(torso,m.gold,[.045,.46,.035],[-width*.17,.29,.23],[0,0,-.4]);
  if(robe){
    cone(rig,m.cloth,width*.44,width*.77,.69,[0,.42,0]);
    for(const s of [-1,1]) box(rig,m.gold,[.025,.57,.018],[s*.17,.44,.24],[0,0,s*-.14]);
  } else {
    for(const s of [-1,1]){const panel=cloth(torso,m.cloth,.23,.38,.06); panel.position.set(s*.17,0,.06); panel.rotation.z=s*.15;}
  }
  const neck=joint(torso,'neck',[0,.59,0]);
  cone(neck,m.skin,.07,.08,.1,[0,.015,0]);
  const head=joint(neck,'head',[0,.18,0]);
  ball(head,m.skin,.225,[0,0,0],[.85,1.06,.87]);
  ball(head,m.hair,.23,[0,.09,-.035],[.91,.79,.92]);
  for(const s of [-1,1]){
    box(head,m.dark,[.075,.027,.028],[s*.082,.014,.184]);
    box(head,m.glow,[.04,.014,.029],[s*.082,.019,.189]);
    mesh(head,new T.ConeGeometry(.065,.24,4),m.hair,[s*.155,-.01,-.015],[0,0,s*.18]);
  }
  const back=joint(torso,'cape',[0,.5,-.16]);
  const cape=cloth(back,m.cloth,heavy?.83:.66,robe?1.08:.88,-.04); cape.rotation.x=-.07;
  const arms=[];
  for(const s of [-1,1]){
    const arm=joint(torso,`shoulder-${s}`, [s*(width*.5+.07),.48,0]);
    ball(arm,heavy?m.gold:m.color,heavy?.2:.13,[0,-.03,0],[1,1,.95]);
    cone(arm,robe?m.color:m.dark,robe?.14:.085,.075,.3,[0,-.18,0]);
    const elbow=joint(arm,`elbow-${s}`,[0,-.32,0]);
    cone(elbow,m.dark,.078,.066,.28,[0,-.13,0]);
    box(elbow,m.gold,[.13,.17,.15],[0,-.15,0]);
    const hand=joint(elbow,`hand-${s}`,[0,-.28,0]); ball(hand,m.skin,.075,[0,0,0]);
    arm.rotation.z=s*.14; elbow.rotation.x=-.35;
    arms.push({arm,elbow,hand});
  }
  const grip=joint(arms[1].hand,'grip',[0,0,.045]); grip.rotation.x=.25;
  weapon(grip,character.weapon,m);
  if(['dagger','kunai','fist'].includes(character.weapon)) weapon(arms[0].hand,character.weapon,m);
  // 每个角色的视觉身份证延续二维版本：头饰、背饰、武器互相区分。
  switch(v.head){
    case 'headband': box(head,m.color,[.41,.045,.38],[0,.095,0]); break;
    case 'helmet': cone(head,m.gold,.22,.25,.2,[0,.18,0]); box(head,m.gold,[.045,.35,.3],[0,.19,0]); break;
    case 'hood': case 'featherHood': ball(head,m.cloth,.275,[0,.065,-.095],[1,1.1,1]); break;
    case 'halo': ring(head,m.glow,.3,.022,[0,.37,0],[Math.PI/2,0,0]); break;
    case 'highCrown': box(head,m.dark,[.29,.32,.25],[0,.29,0]); box(head,m.gold,[.025,.27,.26],[0,.3,0]); break;
    case 'goggles': for(const s of [-1,1]) ring(head,m.gold,.075,.024,[s*.095,.12,.205]); break;
    case 'doubleBun': for(const s of [-1,1]) ball(head,m.hair,.11,[s*.23,.16,-.02]); break;
    case 'mane': for(let i=0;i<7;i++) mesh(head,new T.ConeGeometry(.11,.27,4),m.hair,[(i-3)*.05,.27,-.09],[0,0,(i-3)*.16]); break;
    case 'ponytail': case 'longKnot': {
      const hair=cloth(head,m.hair,.23,.72,-.2); hair.position.y=.17; hair.rotation.x=-.16; break;
    }
    case 'circlet': ring(head,m.gold,.21,.023,[0,.15,0],[Math.PI/2,0,0]); break;
    case 'halfMask': box(head,m.paper,[.22,.13,.05],[.05,-.06,.19]); break;
    case 'herbPin': mesh(head,new T.ConeGeometry(.09,.35,4),m.color,[.2,.24,0],[0,0,-.6]); break;
    case 'hornCollar': for(const s of [-1,1]) mesh(head,new T.ConeGeometry(.055,.28,5),m.gold,[s*.21,.22,-.09],[0,0,-s*.3]); break;
  }
  if(v.outer==='scarf'||v.outer==='splitScarf'){
    cone(neck,m.color,.16,.18,.09,[0,-.01,0]);
    const scarf=cloth(neck,m.color,.19,.6,-.2); scarf.rotation.set(-.6,0,-.5);
  }
  if(v.outer==='featherCape') for(let i=0;i<10;i++){
    const f=mesh(back,new T.ConeGeometry(.09,.55,4),m.dark,[(i-4.5)*.095,-.45,-.12],[0,0,Math.PI+(i-4.5)*.1]); f.name='feather';
  }
  if(v.outer==='quiver') cone(back,m.dark,.12,.11,.6,[.13,-.22,-.14],[0,0,.2]);
  if(v.outer==='gearPack') box(back,m.gold,[.5,.42,.28],[0,-.2,-.08]);
  if(v.outer==='beads') for(let i=0;i<10;i++){const a=i/10*Math.PI*2; ball(neck,m.gold,.032,[Math.cos(a)*.2,-.08,Math.sin(a)*.18]);}
  if(v.outer==='talismans') for(const s of [-1,1]) box(back,m.paper,[.12,.43,.03],[s*.25,-.25,-.12],[0,0,s*.2]);
  if(petite) rig.scale.setScalar(.93);
  if(body==='tall') rig.scale.y=1.08;
  root.userData.rig={rig,torso,head,back,arms,legs,materials:m};
  root.userData.characterId=character.id;
  return root;
}

export function poseFighter(model,time,{attack=0,hit=0,dead=false,selected=false}={}){
  const {rig,torso,head,back,arms,legs,materials}=model.userData.rig;
  rig.rotation.z=dead?-1.4:0; rig.position.y=dead?.16:Math.sin(time*2)*.025;
  torso.rotation.y=Math.sin(attack*Math.PI)*-.55;
  head.rotation.y=Math.sin(time*.55)*.08;
  back.rotation.x=.08+Math.sin(time*2.4)*.07+Math.sin(attack*Math.PI)*.3;
  arms.forEach(({arm,elbow},i)=>{
    arm.rotation.x=-.08+Math.sin(time*2+i)*.025-(i?Math.sin(attack*Math.PI)*1.7:0);
    elbow.rotation.x=-.35-Math.sin(attack*Math.PI)*.7;
  });
  legs[0].rotation.x=Math.sin(attack*Math.PI)*.35;
  legs[1].rotation.x=-Math.sin(attack*Math.PI)*.35;
  materials.color.emissive.copy(materials.color.color);
  materials.color.emissiveIntensity=hit>0?hit*1.6:selected?.25:0;
  model.visible=true;
}

export function disposeModel(root){
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o.geometry) geometries.add(o.geometry); if(o.material) materials.add(o.material);});
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
}
