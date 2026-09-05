import { MusicEngine } from './music-engine.js';
import { musicIntensity } from '../core/music-score.js';
import { gameState } from '../core/state.js';

// 静音状态持久化到 localStorage：刷新页面后仍然保持，不必每次重新点静音。
const MUTE_KEY = 'inkfight_muted';
function loadMuted(){
  try{ return localStorage.getItem(MUTE_KEY) === '1'; }catch(e){ return false; }
}
export function saveMuted(m){
  try{ localStorage.setItem(MUTE_KEY, m ? '1' : '0'); }catch(e){}
}

export const Audio = {
  ctx:null, master:null, bgmGain:null, sfxGain:null, muted:loadMuted(), music:null,
  _bgmKind:null, _bgmScene:null,
  init(){
    if(this.ctx) return;
    try{
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;   // 尊重上次保存的静音状态
      this.limiter=this.ctx.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.ratio.value=12;
      this.master.connect(this.limiter);this.limiter.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = 0.35; this.bgmGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.6; this.sfxGain.connect(this.master);
    }catch(e){ console.warn('AudioContext init failed', e); }
  },
  setBgmVol(v){ if(this.bgmGain) this.bgmGain.gain.value = v; },
  setSfxVol(v){ if(this.sfxGain) this.sfxGain.gain.value = v; },
  setMuted(m){
    this.muted=m;if(this.master)this.master.gain.value=m?0:1;
    if(m){this.music?.stop();this.music=null;}else this.resumeMusic();
  },
  tone(freq, dur, type='sine', vol=0.3, attack=0.005, release=0.05, dest=null){
    if(!this.ctx||this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime+attack);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime+attack+dur+release);
    o.connect(g); g.connect(dest||this.sfxGain);
    o.start(); o.stop(this.ctx.currentTime+attack+dur+release+0.05);
  },
  noise(dur, vol=0.3, filterFreq=2000, dest=null){
    if(!this.ctx||this.muted) return;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate*dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1-i/data.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=filterFreq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(dest||this.sfxGain);
    src.start();
  },
  resumeMusic(){
    if(!this.ctx||this.muted||document.hidden||!this._bgmKind||this.music)return;
    this.ctx.resume().catch(()=>{});
    this.music=new MusicEngine(this.ctx,this.bgmGain);
    this.music.start(this._bgmKind==='menu'?'menu':this._bgmScene?.id||'void',
      ()=>this._bgmKind==='menu'?0:musicIntensity(gameState));
  },
  startMenuBgm(){this.stopBgm();this._bgmKind='menu';this._bgmScene=null;this.resumeMusic();},
  startBgm(scene){this.stopBgm();this._bgmKind='battle';this._bgmScene=scene;this.resumeMusic();},
  stopBgm(){this.music?.stop();this.music=null;this._bgmKind=null;},
  pauseForHidden(){this.music?.stop();this.music=null;},
  resumeFromHidden(){this.resumeMusic();}

};

export const SFX = {
  click(){ Audio.tone(660, 0.05, 'sine', 0.12); },
  confirm(){ Audio.tone(523, 0.08, 'triangle', 0.2); setTimeout(()=>Audio.tone(784, 0.1, 'triangle', 0.2), 60); },
  hover(){ Audio.tone(880, 0.03, 'sine', 0.08); },
  select(){ Audio.tone(440, 0.05, 'triangle', 0.12); setTimeout(()=>Audio.tone(660, 0.05, 'square', 0.15), 40); },
  slash(){ Audio.noise(0.15, 0.4, 4000); Audio.tone(180, 0.08, 'sawtooth', 0.2); },
  hit(){ Audio.noise(0.1, 0.35, 1500); Audio.tone(120, 0.08, 'square', 0.25); },
  crit(){ Audio.tone(800, 0.05, 'square', 0.3); setTimeout(()=>{ Audio.noise(0.2, 0.5, 6000); Audio.tone(1200, 0.1, 'sawtooth', 0.3); }, 30); },
  fire(){ Audio.noise(0.3, 0.4, 800); Audio.tone(80, 0.2, 'sawtooth', 0.3); },
  ice(){ Audio.tone(2000, 0.15, 'sine', 0.2); Audio.tone(2400, 0.2, 'sine', 0.15); },
  thunder(){ Audio.noise(0.08, 0.5, 8000); setTimeout(()=>Audio.noise(0.15, 0.4, 3000), 50); Audio.tone(60, 0.3, 'sawtooth', 0.4); },
  arrow(){ Audio.tone(1200, 0.08, 'sine', 0.2); Audio.tone(800, 0.05, 'sine', 0.15); },
  shadow(){ Audio.tone(110, 0.3, 'sawtooth', 0.25); Audio.tone(165, 0.3, 'sine', 0.15); },
  heal(){ Audio.tone(523, 0.15, 'sine', 0.2); setTimeout(()=>Audio.tone(659, 0.15, 'sine', 0.2), 80); setTimeout(()=>Audio.tone(784, 0.2, 'sine', 0.2), 160); },
  shield(){ Audio.tone(220, 0.1, 'square', 0.2); setTimeout(()=>Audio.tone(440, 0.15, 'triangle', 0.2), 50); },
  buff(){ Audio.tone(523, 0.1, 'triangle', 0.2); setTimeout(()=>Audio.tone(784, 0.1, 'triangle', 0.2), 60); setTimeout(()=>Audio.tone(1047, 0.15, 'triangle', 0.2), 120); },
  debuff(){ Audio.tone(330, 0.15, 'sawtooth', 0.2); setTimeout(()=>Audio.tone(220, 0.2, 'sawtooth', 0.2), 80); },
  stun(){ Audio.tone(1000, 0.05, 'square', 0.2); for(let i=1;i<5;i++) setTimeout(()=>Audio.tone(800-i*100, 0.05, 'triangle', 0.15), i*60); },
  miss(){ Audio.tone(400, 0.08, 'sine', 0.1); Audio.tone(300, 0.08, 'sine', 0.1); },
  death(){ Audio.tone(220, 0.3, 'sawtooth', 0.3); setTimeout(()=>Audio.tone(110, 0.5, 'sawtooth', 0.3), 100); Audio.noise(0.4, 0.3, 500); },
  victory(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>Audio.tone(f, 0.2, 'triangle', 0.3), i*120)); },
  defeat(){ [523,440,330,220].forEach((f,i)=>setTimeout(()=>Audio.tone(f, 0.3, 'sawtooth', 0.25), i*150)); }
};

export function playSfx(name){ Audio.init(); if(SFX[name]) SFX[name](); }
export function toggleMute(){
  Audio.muted=!Audio.muted; Audio.setMuted(Audio.muted);
  saveMuted(Audio.muted);
  syncMuteButton();
}

// 页面加载时把按钮图标同步到已保存的静音状态
export function syncMuteButton(){
  const btn = document.getElementById('btn-mute');
  if(btn) btn.textContent = Audio.muted ? '🔕' : '🔔';
}
