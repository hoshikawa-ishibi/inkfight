// 原创主题及分层配器；实时播放与离线试听读取同一份音符事件。
export const MUSIC_THEMES={
  menu:{name:'墨起',bpm:76,root:50,mode:'air'},
  spring:{name:'听泉破阵',bpm:96,root:50,mode:'water'},
  void:{name:'悬墨',bpm:100,root:48,mode:'air'},
  lava:{name:'赤烬行',bpm:112,root:46,mode:'fire'},
};
const SCALE=[0,3,5,7,10,12,15,17];
const MELODY=[
  [0,null,2,null,3,2,0,null,4,null,3,2,0,null,null,null],
  [2,null,3,4,5,null,4,null,3,2,0,null,2,null,null,null],
  [3,null,5,null,6,5,3,null,2,null,3,2,0,null,null,null],
  [2,null,0,null,2,3,4,null,3,null,2,null,0,null,null,null],
];
const CHORDS=[0,0,-5,-5,3,3,-2,-2];
export const midiHz=n=>440*2**((n-69)/12);
export function musicIntensity(state){
  if(!state?.p1Units?.length)return 0;
  const units=[...state.p1Units,...state.p2Units];
  const hp=units.reduce((s,u)=>s+u.hp,0), max=units.reduce((s,u)=>s+u.maxHp,0);
  if(state.round>=18 || hp/max<.38)return 2;
  return state.round>=7 || units.some(u=>!u.alive) || hp/max<.72?1:0;
}
export function scoreStep(themeId,step,intensity=0){
  const theme=MUSIC_THEMES[themeId]||MUSIC_THEMES.void;
  const bar=Math.floor(step/16)%8, pos=step%16, level=Math.max(0,Math.min(2,intensity));
  const events=[], root=theme.root, chord=root+CHORDS[bar];
  const note=(instrument,midi,duration,velocity)=>events.push({instrument,midi,duration,velocity});
  if(pos===0){
    note('pad',chord,7,.07);note('pad',chord+7,7,.035);
    note('bass',chord-12,3.3,.15);
  }
  const melody=MELODY[Math.floor(bar/2)][pos];
  if(melody!==null){
    note('pluck',root+12+SCALE[melody],1.6,.16);
    if(bar%2===1 && pos%4===0)note('flute',root+12+SCALE[melody],.85,.085);
  }
  if(themeId!=='menu'){
    if(pos===0 || pos===8 || (level>=1&&pos===6) || (level===2&&[10,14].includes(pos)))note('drum',chord-12,.6,pos===0?.25:.15);
    if(level>=1&&pos%4===2)note('tick',root+24,.08,.06);
    if(level===2&&pos%2===1)note('pluck',chord+7+(pos%4===1?12:0),.6,.085);
    if(level===2&&pos===12)note('gong',root,2.6,.1);
  }
  return events;
}
