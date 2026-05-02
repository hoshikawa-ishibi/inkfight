export const SCENES = [
  { id:'void', name:'墨色虚空', desc:'纯净的墨色之境，无任何加成，考验真实战力。',
    buff:null, buffText:'无场景效果',
    bg:'radial-gradient(ellipse at center, #2a2a4a 0%, #0d0d1a 85%)',
    fxColor:'#9b9bcf', fxKind:'rune' },
  { id:'lava', name:'赤焰熔岩', desc:'炽热的火山战场，所有人攻击欲望被点燃。',
    buff:'damageUp', buffText:'场景效果：所有伤害技能 +15%',
    bg:'radial-gradient(ellipse at bottom, #7a1f1a 0%, #2a0808 70%, #100404 100%)',
    fxColor:'#ff7043', fxKind:'ember' },
  { id:'spring', name:'碧蓝灵泉', desc:'充满灵能的清泉之地，灵能持续涌动。',
    buff:'spRegen', buffText:'场景效果：每回合开始所有单位额外 +5 SP',
    bg:'radial-gradient(ellipse at center, #0f4a6a 0%, #06121e 80%)',
    fxColor:'#4fc3f7', fxKind:'flow' }
];

export const CHARACTERS = [
  { id:'swordsman', name:'剑士', role:'均衡输出', hp:125, sp:80, atk:18, def:6, crit:10, dodge:5, spRegen:8, color:'#e94560', weapon:'sword',
    passive:{ name:'剑意', desc:'暴击后回复 8 SP', trigger:'onCrit', effect:'spGain', value:8 },
    skills:[
      { name:'斩击', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'⚔️', iconColor:'#e94560', sfx:'slash', vfx:'slash' },
      { name:'旋风斩', type:'damage', cost:25, power:1.7, desc:'消耗25SP，170%伤害', icon:'🌀', iconColor:'#ff7043', sfx:'slash', vfx:'whirl' },
      { name:'剑气', type:'healSp', cost:0, hpCost:18, spGain:22, desc:'消耗18HP回复22SP', icon:'✨', iconColor:'#4fc3f7', sfx:'buff', vfx:'aura' },
      { name:'破甲突刺', type:'damage', cost:35, power:1.8, debuff:'defDown', debuffDur:2, desc:'180%伤害，减防2回合', icon:'🗡️', iconColor:'#ffd54f', sfx:'crit', vfx:'pierce' }
    ]},
  { id:'mage', name:'法师', role:'高爆发/控制', hp:92, sp:130, atk:15, def:3, crit:15, dodge:6, spRegen:11, color:'#4fc3f7', weapon:'staff',
    passive:{ name:'法力涌动', desc:'回合开始时 SP≥80%，下次技能伤害+20%', trigger:'onTurnStart', effect:'overchargeBuff' },
    skills:[
      { name:'墨弹', type:'damage', cost:0, power:1.5, desc:'基础攻击', icon:'🔵', iconColor:'#4fc3f7', sfx:'arrow', vfx:'orb' },
      { name:'墨之洪流', type:'damage', cost:35, power:3.1, desc:'消耗35SP，310%伤害', icon:'🌊', iconColor:'#0288d1', sfx:'fire', vfx:'flood' },
      { name:'灵能过载', type:'stun', cost:20, basePct:30, spScale:35, desc:'眩晕概率随目标SP上升', icon:'⚡', iconColor:'#ffd54f', sfx:'thunder', vfx:'lightning' },
      { name:'冥想', type:'healSp', cost:0, hpCost:0, spGain:30, desc:'恢复30SP', icon:'🧘', iconColor:'#16c79a', sfx:'buff', vfx:'aura' }
    ]},
  { id:'guardian', name:'守卫', role:'坦克/反制', hp:155, sp:65, atk:14, def:9, crit:5, dodge:2, spRegen:8, color:'#8d6e63', weapon:'shield',
    passive:{ name:'铁甲反弹', desc:'受到伤害时反弹伤害的 10% 给攻击者', trigger:'onTakeDamage', effect:'reflect', value:0.10 },
    skills:[
      { name:'盾击', type:'damage', cost:0, power:1.2, desc:'基础攻击，120%伤害', icon:'🛡️', iconColor:'#8d6e63', sfx:'hit', vfx:'bash' },
      { name:'铁壁', type:'shield', cost:20, shieldAmt:45, desc:'获得45护盾', icon:'🏰', iconColor:'#90caf9', sfx:'shield', vfx:'shield' },
      { name:'嘲讽', type:'taunt', cost:15, dur:2, desc:'嘲讽敌方2回合', icon:'😡', iconColor:'#f5a623', sfx:'debuff', vfx:'taunt' },
      { name:'盾墙反击', type:'damage', cost:30, power:2.2, selfHeal:15, desc:'200%伤害+回15HP', icon:'⚒️', iconColor:'#ffd54f', sfx:'hit', vfx:'bash' }
    ]},
  { id:'assassin', name:'刺客', role:'高伤/脆皮', hp:95, sp:100, atk:18, def:3, crit:18, dodge:10, spRegen:9, color:'#ab47bc', weapon:'dagger',
    passive:{ name:'暴击蓄能', desc:'暴击后额外回复 8 SP', trigger:'onCrit', effect:'spGain', value:8 },
    skills:[
      { name:'匕首', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'🗡️', iconColor:'#ab47bc', sfx:'slash', vfx:'slash' },
      { name:'暗影突袭', type:'damage', cost:30, power:1.8, crit:40, desc:'180%伤害，40%暴击', icon:'💀', iconColor:'#7e57c2', sfx:'shadow', vfx:'shadowstrike' },
      { name:'毒刃', type:'damage', cost:20, power:1.2, dot:8, dotDur:3, desc:'120%伤害+中毒3回合', icon:'☠️', iconColor:'#9ccc65', sfx:'slash', vfx:'poison' },
      { name:'消失', type:'dodge', cost:25, dur:1, desc:'下回合闪避所有攻击', icon:'💨', iconColor:'#fff', sfx:'buff', vfx:'smoke' }
    ]},
  { id:'priest', name:'牧师', role:'治疗/辅助', hp:108, sp:115, atk:10, def:5, crit:5, dodge:5, spRegen:11, color:'#66bb6a', weapon:'cross',
    passive:{ name:'圣光庇护', desc:'回合开始时，若任意友方 HP<30% 则自动治疗其 12 HP', trigger:'onTurnStart', effect:'allyHeal', value:12 },
    skills:[
      { name:'光击', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'✨', iconColor:'#66bb6a', sfx:'arrow', vfx:'light' },
      { name:'治愈之光', type:'heal', cost:25, healAmt:48, desc:'治疗友方48HP', icon:'💚', iconColor:'#16c79a', sfx:'heal', vfx:'heal' },
      { name:'净化', type:'cleanse', cost:20, desc:'清除友方负面状态', icon:'🕊️', iconColor:'#fff', sfx:'heal', vfx:'cleanse' },
      { name:'祝福', type:'buff', cost:35, buffType:'atkUp', dur:2, desc:'友方攻击+30% 2回合', icon:'🌟', iconColor:'#ffd54f', sfx:'buff', vfx:'bless' }
    ]},
  { id:'berserker', name:'狂战士', role:'越残越强', hp:140, sp:70, atk:19, def:4, crit:10, dodge:3, spRegen:7, color:'#ff7043', weapon:'axe',
    passive:{ name:'血怒', desc:'HP<40% 时受击，获得额外 10% 攻击加成（最多叠加 3 层）', trigger:'onTakeDamage', effect:'bloodRage', value:0.1, maxStacks:3 },
    skills:[
      { name:'重击', type:'damage', cost:0, power:1.0, desc:'基础攻击(HP越低伤害越高)', icon:'🪓', iconColor:'#ff7043', sfx:'hit', vfx:'smash' },
      { name:'狂暴', type:'selfBuff', cost:25, buffType:'berserk', dur:3, desc:'攻+40%/回合-8HP', icon:'🔥', iconColor:'#ff5722', sfx:'buff', vfx:'rage' },
      { name:'鲜血之力', type:'drain', cost:25, power:1.4, drainPct:30, desc:'140%伤害，吸血30%', icon:'🩸', iconColor:'#b71c1c', sfx:'hit', vfx:'drain' },
      { name:'不屈', type:'revive', cost:30, hpRestore:50, desc:'下次致死保留50HP(一次)', icon:'💀', iconColor:'#ffd54f', sfx:'buff', vfx:'aura' }
    ]},
  { id:'archer', name:'弓手', role:'远程/灵活', hp:105, sp:90, atk:19, def:4, crit:15, dodge:9, spRegen:9, color:'#ffd54f', weapon:'bow',
    passive:{ name:'鹰眼', desc:'每回合开始暴击率+3%（最多叠加 4 层）', trigger:'onTurnStart', effect:'critStack', value:3, maxStacks:4 },
    skills:[
      { name:'射击', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'🏹', iconColor:'#ffd54f', sfx:'arrow', vfx:'arrow' },
      { name:'穿透箭', type:'damageAll', cost:28, power:1.6, desc:'对所有敌人160%伤害', icon:'🎯', iconColor:'#ff7043', sfx:'arrow', vfx:'pierceArrow' },
      { name:'集中', type:'healSp', cost:0, hpCost:0, spGain:20, buffType:'atkUp1', dur:1, desc:'回20SP+下次攻击+20%', icon:'👁️', iconColor:'#4fc3f7', sfx:'buff', vfx:'aura' },
      { name:'束缚箭', type:'stun', cost:25, basePct:35, spScale:30, desc:'眩晕1回合', icon:'🪢', iconColor:'#a1887f', sfx:'arrow', vfx:'bindArrow' }
    ]},
  { id:'warlock', name:'术士', role:'腐化/爆发', hp:100, sp:120, atk:14, def:4, crit:12, dodge:5, spRegen:12, color:'#7e57c2', weapon:'orb',
    passive:{ name:'腐化侵蚀', desc:'对有腐化层的目标造成伤害时，额外造成 层数×8 伤害', trigger:'onDamageDealt', effect:'corruptBonus' },
    skills:[
      { name:'暗影弹', type:'damage', cost:0, power:1.1, corrupt:1, desc:'110%伤害，施加1层腐化', icon:'🌑', iconColor:'#7e57c2', sfx:'shadow', vfx:'shadowOrb' },
      { name:'腐化爆发', type:'corruptBurst', cost:30, dmgPerStack:22, desc:'消耗所有敌人腐化层，每层造成22伤害', icon:'💀', iconColor:'#ce93d8', sfx:'thunder', vfx:'shockwave' },
      { name:'瘟疫', type:'plague', cost:15, corrupt:2, dot:7, dotDur:3, desc:'对所有敌人施加2层腐化+中毒3回合', icon:'☣️', iconColor:'#9ccc65', sfx:'debuff', vfx:'curse' },
      { name:'灵魂收割', type:'drain', cost:25, power:2.2, drainPct:40, corrupt:2, desc:'220%伤害+吸血40%+施加2层腐化', icon:'👁️‍🗨️', iconColor:'#f5a623', sfx:'shadow', vfx:'soulSteal' }
    ]}
];
