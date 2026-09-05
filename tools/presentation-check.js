import { renderMusicPreview, audioBufferWav } from '../src/view/music-engine.js';
import { MUSIC_THEMES } from '../src/core/music-score.js';
import { Audio } from '../src/view/audio.js';

document.getElementById('run').onclick=async()=>{
  const out=document.getElementById('result'),button=document.getElementById('run');button.disabled=true;
  try{
    const results=[];
    for(const id of Object.keys(MUSIC_THEMES)){
      const buffer=await renderMusicPreview(id);let peak=0,squares=0,invalid=0,tail=0;
      const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++){const v=data[i];if(!Number.isFinite(v))invalid++;peak=Math.max(peak,Math.abs(v));squares+=v*v;if(i>data.length-4410)tail=Math.max(tail,Math.abs(v));}
      if(peak>=1||peak<.01||invalid||tail>.001)throw new Error(`${id}: invalid output / clipping / abrupt tail`);
      results.push({theme:id,seconds:buffer.duration,peak:+peak.toFixed(5),rms:+Math.sqrt(squares/data.length).toFixed(5),tail:+tail.toFixed(6)});
      if(id==='spring'){
        const blob=new Blob([audioBufferWav(buffer)],{type:'audio/wav'}),reader=new FileReader();
        const url=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        const link=document.getElementById('wav');link.href=url;link.hidden=false;
      }
      out.textContent=JSON.stringify(results,null,2);
    }
    Audio.init();Audio.setBgmVol(0);Audio.setSfxVol(0);Audio.setMuted(false);Audio.startMenuBgm();
    const first=Audio.music;if(!first)throw new Error('menu engine did not start');
    Audio.pauseForHidden();if(Audio.music||first.timer)throw new Error('background timer survives');
    Audio.resumeFromHidden();if(!Audio.music||Audio.music===first)throw new Error('resume failed');
    Audio.startBgm({id:'lava'});if(Audio.music.id!=='lava')throw new Error('wrong theme');
    Audio.setMuted(true);if(Audio.music)throw new Error('mute leaves scheduler running');
    Audio.setMuted(false);if(Audio.music?.id!=='lava')throw new Error('unmute lost theme');
    Audio.stopBgm();if(Audio.music||Audio._bgmKind)throw new Error('stop failed');
    Audio.setMuted(true);await Audio.ctx.close();
    out.textContent=JSON.stringify({status:'PASS',themes:results,lifecycle:'menu / hidden / resume / scene / mute / unmute / stop'},null,2);
  }catch(e){out.textContent='FAIL: '+e.stack;}finally{button.disabled=false;}
};
