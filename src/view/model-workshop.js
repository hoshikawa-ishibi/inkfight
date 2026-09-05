import { CHARACTERS } from '../data/data.js';
import { ArenaScene } from './arena3d.js';
import { createFighter, disposeModel } from './fighter-model.js';
import { exportModelGlb } from './model-export.js';
import { MUSIC_THEMES } from '../core/music-score.js';
import { renderMusicPreview, audioBufferWav } from './music-engine.js';

const $=id=>document.getElementById(id);
const NOTES={
  swordsman:'赤色围巾，利刃出鞘。以最干净的姿态，正面破局。',
  mage:'冠环承光，蓝晶悬于杖端。长袍里的风暴，正在凝聚。',
  guardian:'重甲、棱盾与横向肩线。站在那里，就是一道防线。',
  assassin:'兜帽掩面，双刃藏锋。低下重心，等待破绽。',
  priest:'光环悬于头顶，十字杖照亮身前。温和，也有自己的重量。',
  berserker:'赤发如焰，战斧沉重。宽肩与破损战衣，把力量写在轮廓里。',
  archer:'弓弦绷紧，箭筒背负。轻装身形，给一击留下余地。',
  warlock:'弯角、暗袍、悬浮法球。紫色微光，在指尖生长。',
  bladedancer:'长发束起，粉色衣带垂落。窄长曲刃，为下一次拔刀蓄势。',
  onmyoji:'高冠、符纸与咒印。紫衣之间，秩序与诡秘并存。',
  artificer:'护目镜映出金属光，齿轮紧扣机匣。让机械，也有温度。',
  drummer:'双髻、暖金衣裙与战鼓。小小的身形，带起整支队伍的节拍。',
  herbalist:'草叶簪发，灵葫收于手边。一抹青绿，留住回春的可能。',
  shadow:'半面白甲，双持短刃。灰蓝衣带，把身影分成两道。',
  monk:'念珠绕肩，拳甲护手。没有长兵器，拳脚自成章法。',
  raven:'羽兜、层叠黑羽与长柄镰。把最后一线光，留在刃口。'
};
let selected=CHARACTERS[0],arena=null,track='spring',musicUrl=null;
try{arena=new ArenaScene($('model-viewer'),{solo:true});arena.resetCamera();}
catch(e){$('model-status').textContent='此设备无法启用 3D 预览，仍可选择角色下载模型。';console.warn(e);}
const roster=$('roster');
for(const c of CHARACTERS){
  const button=document.createElement('button');button.textContent=c.name;button.dataset.character=c.id;
  button.style.setProperty('--accent',c.color);button.addEventListener('click',()=>select(c));roster.appendChild(button);
}
function select(c){
  selected=c;$('model-name').textContent=c.name;$('model-role').textContent=c.role;$('model-note').textContent=NOTES[c.id];
  $('model-number').textContent=String(CHARACTERS.indexOf(c)+1).padStart(2,'0')+' / 16';
  for(const button of roster.children)button.setAttribute('aria-pressed',String(button.dataset.character===c.id));
  if(arena){
    arena.setUnits([{id:'showcase',charId:c.id,player:1,hp:c.hp,maxHp:c.hp,alive:true}]);arena.start();
    $('model-status').textContent='模型就绪 · 拖动查看背面与武器细节';
  }
}
select(selected);
$('spin').onclick=()=>{if(!arena)return;arena.autoRotate=!arena.autoRotate;$('spin').setAttribute('aria-pressed',String(arena.autoRotate));};
$('reset').onclick=()=>arena?.resetCamera();
$('attack').onclick=()=>arena?.animateUnit('showcase','attack');
for(const b of document.querySelectorAll('[data-scene]'))b.onclick=()=>{
  arena?.setEnvironment(b.dataset.scene);for(const a of document.querySelectorAll('[data-scene]'))a.setAttribute('aria-pressed',String(a===b));
};
$('export-model').onclick=()=>{
  const model=createFighter(selected);
  try{
    const raw=exportModelGlb(model),url=URL.createObjectURL(new Blob([raw],{type:'model/gltf-binary'}));
    const a=document.createElement('a');a.href=url;a.download=`inkfight-${selected.id}.glb`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    $('model-status').textContent=`${selected.name}模型已导出 · ${(raw.byteLength/1024).toFixed(0)} KB`;
  }catch(e){$('model-status').textContent='导出失败：'+e.message;}finally{disposeModel(model);}
};
for(const b of document.querySelectorAll('[data-track]'))b.onclick=()=>{
  track=b.dataset.track;for(const a of document.querySelectorAll('[data-track]'))a.setAttribute('aria-pressed',String(a===b));
  $('render-music').textContent=`生成《${MUSIC_THEMES[track].name}》试听`;
};
$('render-music').onclick=async()=>{
  const button=$('render-music'),chosen=track;button.disabled=true;$('music-status').textContent='正在合成完整试听片段…';
  $('music-preview').pause();
  try{
    const buffer=await renderMusicPreview(chosen),wav=audioBufferWav(buffer);
    if(musicUrl)URL.revokeObjectURL(musicUrl);musicUrl=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
    const audio=$('music-preview');audio.src=musicUrl;audio.hidden=false;
    const download=$('download-music');download.href=musicUrl;download.download=`inkfight-${chosen}.wav`;download.hidden=false;
    $('music-status').textContent=`《${MUSIC_THEMES[chosen].name}》已就绪 · 32 秒 · 点击播放器试听`;
    // 便于开发时核验离线输出；不改变播放器音量，也不自动播放。
    let peak=0,squares=0;const data=buffer.getChannelData(0);
    for(const v of data){peak=Math.max(peak,Math.abs(v));squares+=v*v;}
    audio.dataset.peak=peak.toFixed(5);audio.dataset.rms=Math.sqrt(squares/data.length).toFixed(5);
  }catch(e){$('music-status').textContent='生成失败：'+e.message;}finally{button.disabled=false;}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)$('music-preview').pause();});
window.addEventListener('pagehide',()=>{arena?.dispose();if(musicUrl)URL.revokeObjectURL(musicUrl);});
