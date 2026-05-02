export const Audio = {
  ctx:null, master:null, bgmGain:null, sfxGain:null, muted:false, bgmTimer:null, bgmNodes:[],
  _menuTimer:null, _battlePhase:0, _battleBeat:0,
  init(){
    if(this.ctx) return;
    try{
      this.ctx = new (window.AudioContext||window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = 0.35; this.bgmGain.connect(this.master);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.6; this.sfxGain.connect(this.master);
    }catch(e){ console.warn('AudioContext init failed', e); }
  },
  setBgmVol(v){ if(this.bgmGain) this.bgmGain.gain.value = v; },
  setSfxVol(v){ if(this.sfxGain) this.sfxGain.gain.value = v; },
  setMuted(m){ this.muted=m; if(this.master) this.master.gain.value = m?0:1; },
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
  startMenuBgm(){
    this.stopBgm();
    if(!this.ctx) return;
    // 神秘琶音：Am pentatonic，慢速，带回响
    const scale = [220, 261, 294, 330, 392, 440, 523, 587, 659];
    let step = 0;
    const pattern = [0,2,4,6,5,3,1,4,2,0,3,5,7,6,4,2];
    const playChime = () => {
      if(this.muted||!this.bgmGain) return;
      const freq = scale[pattern[step % pattern.length]];
      step++;
      // 主音
      this.tone(freq, 1.2, 'sine', 0.12, 0.02, 0.8, this.bgmGain);
      // 泛音（高八度，更轻）
      if(step % 3 === 0) this.tone(freq*2, 0.8, 'sine', 0.05, 0.05, 0.6, this.bgmGain);
      // 低音衬底（每4拍）
      if(step % 4 === 0) this.tone(110, 1.5, 'triangle', 0.07, 0.1, 1.0, this.bgmGain);
    };
    playChime();
    this._menuTimer = setInterval(playChime, 480);
    this.bgmTimer = this._menuTimer;
  },
  startBgm(scene){
    this.stopBgm();
    if(!this.ctx) return;
    // 战斗BGM：鼓点 + 旋律，按场景变化音色和调式
    const themes = {
      void: { mel:[220,247,262,294,330,294,262,247], bass:110, color:'sawtooth', drumFreq:80 },
      lava: { mel:[174,196,220,196,174,155,174,196], bass:87,  color:'sawtooth', drumFreq:60 },
      spring:{ mel:[261,294,330,349,392,349,330,294], bass:130, color:'triangle', drumFreq:90 }
    };
    const theme = themes[scene?.id] || themes.void;
    this._battlePhase = 0; this._battleBeat = 0;
    const BPM = 140, beat = 60000/BPM;

    const tick = () => {
      if(this.muted||!this.bgmGain) return;
      const b = this._battleBeat;
      // 鼓点：每拍踢鼓，2/4拍加军鼓
      this.noise(0.08, 0.18, 200, this.bgmGain);
      this.tone(theme.drumFreq, 0.12, 'sine', 0.2, 0.002, 0.05, this.bgmGain);
      if(b % 2 === 1) this.noise(0.06, 0.12, 4000, this.bgmGain);
      // 旋律：每2拍出一个音
      if(b % 2 === 0){
        const melIdx = (b/2) % theme.mel.length;
        const freq = theme.mel[melIdx];
        this.tone(freq, 0.35, theme.color, 0.1, 0.01, 0.2, this.bgmGain);
        // 每8拍加和声
        if(b % 8 === 0) this.tone(freq * 1.5, 0.5, 'sine', 0.05, 0.05, 0.3, this.bgmGain);
      }
      // 低音：每4拍
      if(b % 4 === 0) this.tone(theme.bass, 0.4, 'triangle', 0.12, 0.02, 0.3, this.bgmGain);
      this._battleBeat++;
    };
    tick();
    this.bgmTimer = setInterval(tick, beat);
  },
  stopBgm(){
    if(this.bgmTimer){ clearInterval(this.bgmTimer); this.bgmTimer=null; }
    this._menuTimer = null;
  }
};

export const SFX = {
  click(){ Audio.tone(660, 0.05, 'square', 0.15); },
  confirm(){ Audio.tone(523, 0.08, 'triangle', 0.2); setTimeout(()=>Audio.tone(784, 0.1, 'triangle', 0.2), 60); },
  hover(){ Audio.tone(880, 0.03, 'sine', 0.08); },
  select(){ Audio.tone(440, 0.05, 'square', 0.15); setTimeout(()=>Audio.tone(660, 0.05, 'square', 0.15), 40); },
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
  document.getElementById('btn-mute').textContent = Audio.muted?'🔕':'🔔';
}
