import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.min.js';
import { CHARACTERS } from '../src/data/data.js';
import { createFighter, poseFighter, disposeModel } from '../src/view/fighter-model.js';
import { exportModelGlb } from '../src/view/model-export.js';
import { MUSIC_THEMES, scoreStep, musicIntensity } from '../src/core/music-score.js';
import { audioBufferWav } from '../src/view/music-engine.js';

test('16 个角色在待机、攻击、倒地时具有有限的三维边界；各自武器节点存在',()=>{
  for(const c of CHARACTERS){
    const model=createFighter(c);assert.ok(model.getObjectByName(`weapon-${c.weapon}`),c.id);
    for(const pose of [{},{attack:.5},{dead:true}]){
      poseFighter(model,2,pose);model.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());
      assert.ok([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>.1&&n<5),`${c.id}: ${size.toArray()}`);
    }
    disposeModel(model);
  }
});
test('每个 GLB 自包含，节点、三角索引和属性都在二进制缓冲范围内',()=>{
  for(const c of CHARACTERS){
    const model=createFighter(c),raw=exportModelGlb(model),view=new DataView(raw);
    assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(4,true),2);assert.equal(view.getUint32(8,true),raw.byteLength);
    const jsonLength=view.getUint32(12,true),g=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,20,jsonLength)));
    const binStart=28+jsonLength,binSize=view.getUint32(20+jsonLength,true);
    assert.equal(binStart+binSize,raw.byteLength);assert.equal(g.asset.version,'2.0');assert.ok(g.nodes.some(n=>n.name===`weapon-${c.weapon}`));
    for(const node of g.nodes){assert.ok(node.matrix.every(Number.isFinite));for(const child of node.children||[])assert.ok(child<g.nodes.length);}
    for(const a of g.accessors){
      const b=g.bufferViews[a.bufferView],width={5123:2,5125:4,5126:4}[a.componentType],arity={SCALAR:1,VEC3:3}[a.type];
      assert.equal(b.byteOffset%4,0);assert.equal(a.count*width*arity,b.byteLength);assert.ok(b.byteOffset+b.byteLength<=binSize);
    }
    for(const mesh of g.meshes)for(const p of mesh.primitives){
      const positions=g.accessors[p.attributes.POSITION];assert.ok(positions.min.every(Number.isFinite));
      if(p.indices!==undefined){
        const a=g.accessors[p.indices],b=g.bufferViews[a.bufferView];
        const indexes=a.componentType===5123?new Uint16Array(raw,binStart+b.byteOffset,a.count):new Uint32Array(raw,binStart+b.byteOffset,a.count);
        assert.equal(indexes.length%3,0);assert.ok(indexes.every(i=>i<positions.count));
      }
    }
    disposeModel(model);
  }
});
test('三层配器只随战况变化，乐谱生成不消耗游戏的随机数',()=>{
  const unit={hp:100,maxHp:100,alive:true};const state={p1Units:[{...unit}],p2Units:[{...unit}],round:1};
  assert.equal(musicIntensity(state),0);state.round=7;assert.equal(musicIntensity(state),1);state.round=18;assert.equal(musicIntensity(state),2);
  state.round=1;state.p1Units[0].hp=state.p2Units[0].hp=30;assert.equal(musicIntensity(state),2);
  const random=Math.random;Math.random=()=>{throw new Error('Music must not consume combat RNG');};
  try{
    for(const theme of Object.keys(MUSIC_THEMES)){
      const layers=[0,1,2].map(level=>Array.from({length:128},(_,step)=>scoreStep(theme,step,level)).flat());
      for(const event of layers.flat())assert.ok(Number.isFinite(event.midi)&&event.duration>0&&event.velocity>0&&event.velocity<1);
      if(theme!=='menu'){assert.ok(layers[2].length>layers[1].length);assert.ok(layers[1].length>layers[0].length);}
    }
  }finally{Math.random=random;}
});
test('WAV 导出为可解码的 16 位双声道 PCM，样本按声道交错',()=>{
  const wav=audioBufferWav({numberOfChannels:2,length:2,sampleRate:44100,getChannelData:c=>c?new Float32Array([.5,-.5]):new Float32Array([1,-1])});
  const v=new DataView(wav);assert.equal(wav.byteLength,52);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint32(24,true),44100);
  assert.equal(v.getInt16(44,true),32767);assert.equal(v.getInt16(46,true),16383);assert.equal(v.getInt16(48,true),-32768);assert.equal(v.getInt16(50,true),-16384);
});
