import { MUSIC_THEMES, midiHz, scoreStep } from '../core/music-score.js';

function randomNoise(length,seed){
  let x=seed||1;const a=new Float32Array(length);
  for(let i=0;i<length;i++){x^=x<<13;x^=x>>>17;x^=x<<5;a[i]=((x>>>0)/4294967296)*2-1;}
  return a;
}
export class MusicEngine {
  constructor(ctx,destination){
    this.ctx=ctx;this.nodes=new Set();this.step=0;this.timer=null;
    this.bus=ctx.createGain();this.bus.gain.value=.8;
    this.compressor=ctx.createDynamicsCompressor();this.compressor.threshold.value=-14;this.compressor.ratio.value=3;
    this.bus.connect(this.compressor);this.compressor.connect(destination);
    this.delay=ctx.createDelay(1);this.delay.delayTime.value=.24;
    this.feedback=ctx.createGain();this.feedback.gain.value=.23;
    this.wet=ctx.createGain();this.wet.gain.value=.22;
    this.bus.connect(this.delay);this.delay.connect(this.feedback);this.feedback.connect(this.delay);this.delay.connect(this.wet);this.wet.connect(this.compressor);
    this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);this.noise.copyToChannel(randomNoise(ctx.sampleRate,1729),0);
  }
  track(source,gain,extra=[]){
    this.nodes.add(source);
    source.onended=()=>{source.disconnect();gain.disconnect();extra.forEach(n=>n.disconnect());this.nodes.delete(source);};
  }
  schedule(event,at){
    const {ctx}=this;const {instrument,midi,duration,velocity}=event;
    const freq=midiHz(midi),gain=ctx.createGain();gain.connect(this.bus);
    const attack=instrument==='pad'?.4:instrument==='flute'?.08:.004;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(velocity,at+attack);
    gain.gain.exponentialRampToValueAtTime(.0001,at+Math.max(attack+.02,duration));
    if(instrument==='pluck'){
      // 衰减的基音加高次泛音，比方波短循环更接近拨弦。
      for(const [multiple,amp] of [[1,1],[2,.32],[3,.11]]){
        const o=ctx.createOscillator(),partial=ctx.createGain();o.type='sine';o.frequency.value=freq*multiple;
        partial.gain.value=amp;o.connect(partial);partial.connect(gain);o.start(at);o.stop(at+duration+.02);this.track(o,partial);
      }
      // 包络节点在声音结束后断开，避免长局留下失联节点。
      const cleanup=ctx.createOscillator();cleanup.connect(gain);cleanup.frequency.value=0;
      cleanup.start(at);cleanup.stop(at+duration+.03);this.track(cleanup,gain);return;
    }
    if(instrument==='tick'){
      const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter();noise.buffer=this.noise;
      filter.type='highpass';filter.frequency.value=4800;noise.connect(filter);filter.connect(gain);
      noise.start(at);noise.stop(at+duration);this.track(noise,gain,[filter]);return;
    }
    const o=ctx.createOscillator();o.type=instrument==='bass'?'triangle':'sine';o.frequency.setValueAtTime(freq,at);
    if(instrument==='drum')o.frequency.exponentialRampToValueAtTime(38,at+.18);
    if(instrument==='gong')o.frequency.setValueAtTime(freq*.501,at);
    if(instrument==='flute'){
      const vibrato=ctx.createOscillator(),depth=ctx.createGain();vibrato.frequency.value=4.7;depth.gain.value=3;
      vibrato.connect(depth);depth.connect(o.frequency);vibrato.start(at);vibrato.stop(at+duration);
      this.track(vibrato,depth);
    }
    if(instrument==='pad')o.detune.value=midi%2?5:-5;
    o.connect(gain);o.start(at);o.stop(at+duration+.02);this.track(o,gain);
  }
  scheduleStep(id,step,level,at){for(const e of scoreStep(id,step,level))this.schedule(e,at);}
  start(id,getIntensity=()=>0){
    this.id=id;this.step=0;this.nextAt=this.ctx.currentTime+.04;
    const duration=30/(MUSIC_THEMES[id]||MUSIC_THEMES.void).bpm;
    const tick=()=>{
      // 后台或设备休眠后丢弃积压拍点，绝不把几分钟的音符一次堆出来。
      if(this.nextAt<this.ctx.currentTime-.3)this.nextAt=this.ctx.currentTime+.04;
      while(this.nextAt<this.ctx.currentTime+.14){
        this.scheduleStep(id,this.step++,getIntensity(),this.nextAt);this.nextAt+=duration;
      }
    };
    tick();this.timer=setInterval(tick,25);
  }
  stop(){
    clearInterval(this.timer);this.timer=null;
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);this.bus.gain.setTargetAtTime(0,this.ctx.currentTime,.035);
    for(const source of this.nodes){try{source.stop(this.ctx.currentTime+.15);}catch{}}
    setTimeout(()=>{this.bus.disconnect();this.delay.disconnect();this.feedback.disconnect();this.wet.disconnect();this.compressor.disconnect();},200);
  }
}

export async function renderMusicPreview(theme='spring',seconds=32){
  const ctx=new OfflineAudioContext(2,Math.ceil(seconds*44100),44100);
  const music=new MusicEngine(ctx,ctx.destination),stepTime=30/MUSIC_THEMES[theme].bpm;
  for(let step=0,at=0;at<seconds-3;step++,at+=stepTime){
    const level=at<seconds/3?0:at<seconds*2/3?1:2;
    music.scheduleStep(theme,step,level,at);
  }
  music.bus.gain.setValueAtTime(.8,seconds-3);
  music.bus.gain.linearRampToValueAtTime(0,seconds-.8);
  return ctx.startRendering();
}

export function audioBufferWav(buffer){
  const channels=buffer.numberOfChannels,frames=buffer.length;
  const raw=new ArrayBuffer(44+frames*channels*2),view=new DataView(raw);
  const text=(p,s)=>{for(let i=0;i<s.length;i++)view.setUint8(p+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,raw.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);
  view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,raw.byteLength-44,true);
  const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  for(let f=0,p=44;f<frames;f++)for(let c=0;c<channels;c++,p+=2){const n=Math.max(-1,Math.min(1,samples[c][f]));view.setInt16(p,n<0?n*32768:n*32767,true);}
  return raw;
}
