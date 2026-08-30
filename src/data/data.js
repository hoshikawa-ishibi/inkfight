export const SCENES = [
  { id:'void', name:'墨色虚空', desc:'纯净的墨色之境，无任何加成，考验真实战力。',
    buff:null, buffText:'无场景效果',
    bg:'radial-gradient(ellipse at center, #2a2a4a 0%, #0d0d1a 85%)',
    art:{ image:'assets/scenes/void.webp', position:'50% 44%',
      overlay:'linear-gradient(180deg, rgba(6,6,14,.08) 0%, rgba(5,5,13,.18) 58%, rgba(5,5,13,.72) 100%)',
      preview:['#494858','#090910'], motion:'voidDrift',
      particles:{ kind:'rune', color:'#b8b5d6', count:42, alpha:[.16,.46], radius:[.7,1.9], speed:[.08,.28] } } },
  { id:'lava', name:'赤焰熔岩', desc:'炽热的火山战场，所有人攻击欲望被点燃。',
    buff:'damageUp', buffText:'场景效果：所有伤害技能 +15%',
    bg:'radial-gradient(ellipse at bottom, #7a1f1a 0%, #2a0808 70%, #100404 100%)',
    art:{ image:'assets/scenes/lava.webp', position:'50% 45%',
      overlay:'linear-gradient(180deg, rgba(22,5,3,.03) 0%, rgba(16,4,3,.12) 55%, rgba(6,3,3,.72) 100%)',
      preview:['#8c3c26','#120706'], motion:'heatVeil',
      particles:{ kind:'ember', color:'#ff7043', count:55, alpha:[.2,.65], radius:[.8,2.1], speed:[.35,.9] } } },
  { id:'spring', name:'碧蓝灵泉', desc:'充满灵能的清泉之地，灵能持续涌动。',
    buff:'spRegen', buffText:'场景效果：每回合开始所有单位额外 +5 SP',
    bg:'radial-gradient(ellipse at center, #0f4a6a 0%, #06121e 80%)',
    art:{ image:'assets/scenes/spring.webp', position:'50% 45%',
      overlay:'linear-gradient(180deg, rgba(2,18,24,.02) 0%, rgba(2,14,20,.1) 55%, rgba(3,9,15,.7) 100%)',
      preview:['#75aaa4','#071820'], motion:'waterFlow',
      particles:{ kind:'wisp', color:'#67d9e5', count:38, alpha:[.12,.4], radius:[.8,2.2], speed:[.08,.3] } } }
];

export const CHARACTERS = [
  { id:'swordsman', name:'剑士', role:'均衡输出', hp:135, sp:80, atk:20, def:6, crit:10, dodge:5, spRegen:10, color:'#e94560', weapon:'sword',
    passive:{ name:'剑意', desc:'暴击后回复 8 SP', trigger:'onCrit', effect:'spGain', value:8 },
    skills:[
      { name:'斩击', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'⚔️', iconColor:'#e94560', sfx:'slash', vfx:'slash' },
      { name:'旋风斩', type:'damage', cost:22, power:1.8, desc:'消耗25SP，170%伤害', icon:'🌀', iconColor:'#ff7043', sfx:'slash', vfx:'whirl' },
      { name:'剑气', type:'healSp', cost:0, hpCost:18, spGain:22, desc:'消耗18HP回复22SP', icon:'✨', iconColor:'#4fc3f7', sfx:'buff', vfx:'aura' },
      { name:'破甲突刺', type:'damage', cost:30, power:2.2, debuff:'defDown', debuffDur:2, desc:'210%伤害，减防2回合', icon:'🗡️', iconColor:'#ffd54f', sfx:'crit', vfx:'pierce' }
    ]},
  { id:'mage', name:'法师', role:'高爆发/控制', hp:112, sp:130, atk:18, def:3, crit:15, dodge:6, spRegen:11, color:'#4fc3f7', weapon:'staff',
    passive:{ name:'法力涌动', desc:'回合开始时 SP≥80%，下次技能伤害+20%', trigger:'onTurnStart', effect:'overchargeBuff' },
    skills:[
      { name:'墨弹', type:'damage', cost:0, power:1.5, desc:'基础攻击', icon:'🔵', iconColor:'#4fc3f7', sfx:'arrow', vfx:'orb' },
      { name:'墨之洪流', type:'damage', cost:32, power:3.2, desc:'消耗35SP，310%伤害', icon:'🌊', iconColor:'#0288d1', sfx:'fire', vfx:'flood' },
      { name:'灵能过载', type:'stun', cost:20, power:1.4, spThreshold:0.5, desc:'140%伤害；目标SP过半则扰乱其下一次行动（伤害/治疗-40%）', icon:'⚡', iconColor:'#ffd54f', sfx:'thunder', vfx:'lightning' },
      { name:'冥想', type:'healSp', cost:0, hpCost:0, spGain:30, desc:'恢复30SP', icon:'🧘', iconColor:'#16c79a', sfx:'buff', vfx:'aura' }
    ]},
  { id:'guardian', name:'守卫', role:'坦克/反制', hp:160, sp:65, atk:16, def:9, crit:5, dodge:2, spRegen:8, color:'#8d6e63', weapon:'shield',
    passive:{ name:'铁甲反弹', desc:'受到伤害时反弹伤害的 10% 给攻击者', trigger:'onTakeDamage', effect:'reflect', value:0.10 },
    skills:[
      { name:'盾击', type:'damage', cost:0, power:1.2, desc:'基础攻击，120%伤害', icon:'🛡️', iconColor:'#8d6e63', sfx:'hit', vfx:'bash' },
      { name:'铁壁', type:'shield', cost:20, shieldAmt:45, desc:'获得45护盾', icon:'🏰', iconColor:'#90caf9', sfx:'shield', vfx:'shield' },
      { name:'嘲讽', type:'taunt', cost:15, dur:2, desc:'嘲讽敌方2回合', icon:'😡', iconColor:'#f5a623', sfx:'debuff', vfx:'taunt' },
      { name:'盾墙反击', type:'damage', cost:30, power:2.2, selfHeal:15, desc:'200%伤害+回15HP', icon:'⚒️', iconColor:'#ffd54f', sfx:'hit', vfx:'bash' }
    ]},
  { id:'assassin', name:'刺客', role:'高伤/脆皮', hp:110, sp:100, atk:20, def:3, crit:18, dodge:10, spRegen:9, color:'#ab47bc', weapon:'dagger',
    passive:{ name:'暴击蓄能', desc:'暴击后额外回复 8 SP', trigger:'onCrit', effect:'spGain', value:8 },
    skills:[
      { name:'匕首', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'🗡️', iconColor:'#ab47bc', sfx:'slash', vfx:'slash' },
      { name:'暗影突袭', type:'damage', cost:26, power:2.1, crit:40, desc:'180%伤害，40%暴击', icon:'💀', iconColor:'#7e57c2', sfx:'shadow', vfx:'shadowstrike' },
      { name:'毒刃', type:'damage', cost:20, power:1.2, dot:8, dotDur:3, desc:'120%伤害+中毒3回合', icon:'☠️', iconColor:'#9ccc65', sfx:'slash', vfx:'poison' },
      { name:'消失', type:'dodge', cost:25, dur:1, desc:'下回合闪避所有攻击', icon:'💨', iconColor:'#fff', sfx:'buff', vfx:'smoke' }
    ]},
  { id:'priest', name:'牧师', role:'治疗/辅助', hp:108, sp:115, atk:10, def:5, crit:5, dodge:5, spRegen:11, color:'#66bb6a', weapon:'cross',
    passive:{ name:'圣光庇护', desc:'回合开始时，若任意友方 HP<30% 则自动治疗其 12 HP', trigger:'onTurnStart', effect:'allyHeal', value:12 },
    skills:[
      { name:'光击', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'✨', iconColor:'#66bb6a', sfx:'arrow', vfx:'light' },
      { name:'治愈之光', type:'heal', cost:28, healAmt:42, desc:'治疗友方48HP', icon:'💚', iconColor:'#16c79a', sfx:'heal', vfx:'heal' },
      { name:'净化', type:'cleanse', cost:20, healAmt:20, desc:'清除友方负面状态并治疗20HP', icon:'🕊️', iconColor:'#fff', sfx:'heal', vfx:'cleanse' },
      { name:'祝福', type:'buff', cost:28, buffType:'atkUp', dur:3, buffValue:0.5, desc:'友方攻击+50% 3回合', icon:'🌟', iconColor:'#ffd54f', sfx:'buff', vfx:'bless' }
    ]},
  { id:'berserker', name:'狂战士', role:'越残越强', hp:140, sp:70, atk:19, def:4, crit:10, dodge:3, spRegen:7, color:'#ff7043', weapon:'axe',
    passive:{ name:'血怒', desc:'HP<40% 时受击，获得额外 10% 攻击加成（最多叠加 3 层）', trigger:'onTakeDamage', effect:'bloodRage', value:0.1, maxStacks:3 },
    skills:[
      { name:'重击', type:'damage', cost:0, power:1.0, desc:'基础攻击(HP越低伤害越高)', icon:'🪓', iconColor:'#ff7043', sfx:'hit', vfx:'smash' },
      { name:'狂暴', type:'selfBuff', cost:25, power:0.8, buffType:'berserk', dur:3, buffValue:0.35, selfDmg:6, desc:'80%伤害并进入狂暴：3回合攻+35%，每回合-6HP', icon:'🔥', iconColor:'#ff5722', sfx:'buff', vfx:'rage' },
      { name:'鲜血之力', type:'drain', cost:25, power:1.4, drainPct:30, desc:'140%伤害，吸血30%', icon:'🩸', iconColor:'#b71c1c', sfx:'hit', vfx:'drain' },
      { name:'不屈', type:'revive', cost:30, hpRestore:50, desc:'下次致死保留50HP(一次)', icon:'💀', iconColor:'#ffd54f', sfx:'buff', vfx:'aura' }
    ]},
  { id:'archer', name:'弓手', role:'远程/灵活', hp:105, sp:90, atk:19, def:4, crit:15, dodge:9, spRegen:9, color:'#ffd54f', weapon:'bow',
    passive:{ name:'鹰眼', desc:'每回合开始暴击率+3%（最多叠加 4 层）', trigger:'onTurnStart', effect:'critStack', value:3, maxStacks:4 },
    skills:[
      { name:'射击', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'🏹', iconColor:'#ffd54f', sfx:'arrow', vfx:'arrow' },
      { name:'穿透箭', type:'damageAll', cost:32, power:1.1, desc:'对所有敌人140%伤害', icon:'🎯', iconColor:'#ff7043', sfx:'arrow', vfx:'pierceArrow' },
      { name:'集中', type:'healSp', cost:0, hpCost:0, spGain:20, buffType:'atkUp1', dur:1, desc:'回20SP+下次攻击+20%', icon:'👁️', iconColor:'#4fc3f7', sfx:'buff', vfx:'aura' },
      { name:'束缚箭', type:'stun', cost:25, power:1.3, spThreshold:0.5, desc:'130%伤害；目标SP过半则扰乱其下一次行动（伤害/治疗-40%）', icon:'🪢', iconColor:'#a1887f', sfx:'arrow', vfx:'bindArrow' }
    ]},
  { id:'warlock', name:'术士', role:'腐化/爆发', hp:96, sp:110, atk:13, def:4, crit:12, dodge:5, spRegen:10, color:'#7e57c2', weapon:'orb',
    passive:{ name:'腐化侵蚀', desc:'对有腐化层的目标造成伤害时，额外造成 层数×5 伤害', trigger:'onDamageDealt', effect:'corruptBonus' },
    skills:[
      { name:'暗影弹', type:'damage', cost:0, power:1.1, corrupt:1, desc:'110%伤害，施加1层腐化', icon:'🌑', iconColor:'#7e57c2', sfx:'shadow', vfx:'shadowOrb' },
      { name:'腐化爆发', type:'corruptBurst', cost:32, dmgPerStack:9, desc:'消耗所有敌人腐化层，每层造成12伤害', icon:'💀', iconColor:'#ce93d8', sfx:'thunder', vfx:'shockwave' },
      { name:'瘟疫', type:'plague', cost:30, corrupt:2, dot:4, dotDur:3, desc:'对所有敌人施加2层腐化+中毒3回合', icon:'☣️', iconColor:'#9ccc65', sfx:'debuff', vfx:'curse' },
      { name:'灵魂收割', type:'drain', cost:25, power:2.2, drainPct:40, corrupt:2, desc:'220%伤害+吸血40%+施加2层腐化', icon:'👁️‍🗨️', iconColor:'#f5a623', sfx:'shadow', vfx:'soulSteal' }
    ]}
,

  // ══════════════════════════════════════════════════════════
  // 扩充阵容（ROSTER_PLAN.md）。**每个都占一个老 8 人没占的机制空位**，
  // 不做换皮——深度来自「选项多且互相有差异」，光加数量等于没加。
  // ══════════════════════════════════════════════════════════

  // 机制空位：**暴击蓄能操控**。蓄能条是新机制，之前没人主动玩它。
  { id:'bladedancer', name:'刀娘', role:'暴击流/爆发', hp:108, sp:95, atk:18, def:4, crit:20, dodge:8, spRegen:10, color:'#ff6f91', weapon:'katana',
    passive:{ name:'残心', desc:'暴击后暴击蓄能 +15（可以连着暴）', trigger:'onCrit', effect:'critCharge', value:15 },
    skills:[
      { name:'拔刀', type:'damage', cost:0, power:1.0, critCharge:8, desc:'基础攻击，额外充能8', icon:'🗡️', iconColor:'#ff6f91', sfx:'slash', vfx:'slash' },
      { name:'樱花乱', type:'damage', cost:24, power:1.9, hits:3, desc:'三段共190%伤害，每段各自充能', icon:'🌸', iconColor:'#ff8fab', sfx:'slash', vfx:'whirl' },
      { name:'蓄刃', type:'healSp', cost:0, spGain:14, critCharge:45, desc:'回14SP并大幅充能，为下一刀铺路', icon:'💠', iconColor:'#ffd54f', sfx:'buff', vfx:'aura' },
      { name:'一闪', type:'damage', cost:30, power:2.4, crit:30, desc:'240%伤害，自带30%暴击加成', icon:'⚡', iconColor:'#fff', sfx:'crit', vfx:'pierce' }
    ]},

  // 机制空位：**群体减防**。减防以前只有剑士单体带一手。
  { id:'onmyoji', name:'阴阳师', role:'咒缚/减防', hp:114, sp:120, atk:17, def:5, crit:10, dodge:6, spRegen:11, color:'#b39ddb', weapon:'ofuda',
    passive:{ name:'式神', desc:'回合开始时SP≥80%，下次技能伤害+20%', trigger:'onTurnStart', effect:'overchargeBuff' },
    skills:[
      { name:'符射', type:'damage', cost:0, power:1.1, desc:'基础攻击', icon:'📜', iconColor:'#b39ddb', sfx:'arrow', vfx:'orb' },
      { name:'破魔符', type:'damageAll', cost:24, power:0.9, debuff:'defDown', debuffDur:3, desc:'全体85%伤害并减防3回合', icon:'🎴', iconColor:'#ce93d8', sfx:'debuff', vfx:'pierceArrow' },
      { name:'缚灵', type:'stun', cost:22, power:1.2, spThreshold:0.45, desc:'120%伤害；目标SP过45%则扰乱其下一次行动（伤害/治疗-40%）', icon:'⛓️', iconColor:'#9575cd', sfx:'thunder', vfx:'bindArrow' },
      { name:'咒返', type:'damage', cost:28, power:1.5, dot:8, dotDur:3, desc:'150%伤害+中毒3回合', icon:'🌀', iconColor:'#7e57c2', sfx:'shadow', vfx:'curse' }
    ]},

  // 机制空位：**群体护盾**。护盾以前只有守卫给自己开。
  { id:'artificer', name:'机关师', role:'群体防护', hp:128, sp:100, atk:14, def:7, crit:8, dodge:3, spRegen:10, color:'#90a4ae', weapon:'gear',
    passive:{ name:'自动机括', desc:'受到伤害时自动获得 8 点护盾', trigger:'onTakeDamage', effect:'selfShield', value:8 },
    skills:[
      { name:'齿轮击', type:'damage', cost:0, power:1.1, desc:'基础攻击', icon:'⚙️', iconColor:'#90a4ae', sfx:'hit', vfx:'bash' },
      { name:'铁幕', type:'shieldAll', cost:30, shieldAmt:26, desc:'全队获得26护盾', icon:'🛡️', iconColor:'#90caf9', sfx:'shield', vfx:'shield' },
      { name:'过载', type:'damage', cost:24, power:2.1, hpCost:6, desc:'消耗8HP，190%伤害', icon:'💥', iconColor:'#ff7043', sfx:'fire', vfx:'smash' },
      { name:'检修', type:'healSp', cost:0, spGain:24, desc:'回复24SP', icon:'🔧', iconColor:'#4fc3f7', sfx:'buff', vfx:'aura' }
    ]},

  // 机制空位：**群体增益**。增益以前只有牧师单体。
  { id:'drummer', name:'鼓姬', role:'群体增益', hp:114, sp:110, atk:16, def:5, crit:10, dodge:5, spRegen:11, color:'#ffb74d', weapon:'drum',
    passive:{ name:'战鼓不歇', desc:'回合开始时全队回复 5 SP', trigger:'onTurnStart', effect:'allySp', value:5 },
    skills:[
      { name:'鼓点', type:'damage', cost:0, power:1.1, desc:'基础攻击', icon:'🥁', iconColor:'#ffb74d', sfx:'hit', vfx:'bash' },
      { name:'进军令', type:'buffAll', cost:28, buffType:'atkUp', dur:3, buffValue:0.30, desc:'全队攻击+40% 3回合', icon:'📣', iconColor:'#ffd54f', sfx:'buff', vfx:'bless' },
      { name:'雷鸣震', type:'damageAll', cost:24, power:1.05, desc:'对所有敌人115%伤害', icon:'🌩️', iconColor:'#ffca28', sfx:'thunder', vfx:'shockwave' },
      { name:'振奋', type:'healSp', cost:0, spGain:22, desc:'回复22SP', icon:'🎶', iconColor:'#4fc3f7', sfx:'buff', vfx:'aura' }
    ]},

  // 机制空位：**群体治疗**。治疗以前只有牧师单体。
  { id:'herbalist', name:'医仙', role:'群体治疗', hp:105, sp:125, atk:11, def:5, crit:5, dodge:6, spRegen:12, color:'#81c784', weapon:'gourd',
    passive:{ name:'回春', desc:'回合开始时自身回复 7 HP', trigger:'onTurnStart', effect:'selfHeal', value:7 },
    skills:[
      { name:'银针', type:'damage', cost:0, power:1.0, desc:'基础攻击', icon:'💉', iconColor:'#81c784', sfx:'arrow', vfx:'light' },
      { name:'百草汤', type:'healAll', cost:38, healAmt:18, desc:'全队回复24HP', icon:'🍵', iconColor:'#66bb6a', sfx:'heal', vfx:'heal' },
      { name:'金疮药', type:'heal', cost:20, healAmt:40, desc:'治疗友方40HP', icon:'🧪', iconColor:'#16c79a', sfx:'heal', vfx:'heal' },
      { name:'醒神', type:'cleanse', cost:18, healAmt:16, desc:'清除负面并治疗16HP', icon:'🌿', iconColor:'#fff', sfx:'heal', vfx:'cleanse' }
    ]},

  // 机制空位：**极高闪避 + 受击反击**。守卫的反弹很弱且它是慢速坦克，
  // 这里是「难打死的输出」——减伤高、反弹强，但血薄。
  { id:'shadow', name:'影武者', role:'闪避/反击', hp:104, sp:90, atk:18, def:3, crit:14, dodge:22, spRegen:9, color:'#78909c', weapon:'kunai',
    passive:{ name:'影身', desc:'受到伤害时反弹伤害的 20% 给攻击者', trigger:'onTakeDamage', effect:'reflect', value:0.20 },
    skills:[
      { name:'苦无', type:'damage', cost:0, power:1.1, desc:'基础攻击', icon:'🔪', iconColor:'#78909c', sfx:'slash', vfx:'slash' },
      { name:'残影', type:'dodge', cost:20, dur:1, desc:'下回合闪避所有攻击', icon:'👤', iconColor:'#b0bec5', sfx:'buff', vfx:'smoke' },
      { name:'逆袭', type:'damage', cost:26, power:2.0, crit:20, desc:'200%伤害，20%暴击加成', icon:'🌑', iconColor:'#546e7a', sfx:'shadow', vfx:'shadowstrike' },
      { name:'烟遁', type:'healSp', cost:0, spGain:20, hpCost:0, buffType:'atkUp1', dur:1, desc:'回20SP+下次攻击+20%', icon:'💨', iconColor:'#4fc3f7', sfx:'buff', vfx:'smoke' }
    ]},

  // 机制空位：**多段连击**。全场以前没有一个多段技能，
  // 而多段和暴击蓄能条天然联动（每段各充一次）。
  { id:'monk', name:'拳师', role:'多段连击', hp:128, sp:85, atk:17, def:6, crit:12, dodge:7, spRegen:9, color:'#a1887f', weapon:'fist',
    passive:{ name:'寸劲', desc:'暴击后回复 10 SP', trigger:'onCrit', effect:'spGain', value:10 },
    skills:[
      { name:'直拳', type:'damage', cost:0, power:1.2, hits:2, desc:'两段共100%伤害', icon:'👊', iconColor:'#a1887f', sfx:'hit', vfx:'bash' },
      { name:'连环崩拳', type:'damage', cost:24, power:2.5, hits:4, desc:'四段共210%伤害，充能极快', icon:'💢', iconColor:'#ff7043', sfx:'hit', vfx:'smash' },
      { name:'铁山靠', type:'damage', cost:22, power:1.5, debuff:'defDown', debuffDur:2, desc:'150%伤害，减防2回合', icon:'🪨', iconColor:'#8d6e63', sfx:'hit', vfx:'bash' },
      { name:'调息', type:'healSp', cost:0, spGain:26, desc:'回复26SP', icon:'🧘', iconColor:'#16c79a', sfx:'buff', vfx:'aura' }
    ]},

  // 机制空位：**极端玻璃大炮**。刺客是中毒流（105血/19攻），
  // 这个是纯爆发：全场最高攻击、最低血，抢在对面之前把人带走。
  { id:'raven', name:'墨鸦', role:'极限爆发/易碎', hp:92, sp:95, atk:24, def:2, crit:16, dodge:12, spRegen:10, color:'#5c6bc0', weapon:'scythe',
    passive:{ name:'不祥', desc:'暴击后回复 12 SP', trigger:'onCrit', effect:'spGain', value:12 },
    skills:[
      { name:'啄', type:'damage', cost:0, power:1.2, desc:'基础攻击', icon:'🪶', iconColor:'#5c6bc0', sfx:'slash', vfx:'slash' },
      { name:'断魂爪', type:'damage', cost:28, power:2.6, desc:'全场最高倍率：260%伤害', icon:'🦅', iconColor:'#3f51b5', sfx:'crit', vfx:'shadowstrike' },
      { name:'蚀骨', type:'damage', cost:22, power:1.2, dot:12, dotDur:3, desc:'120%伤害+重度中毒3回合', icon:'☠️', iconColor:'#7986cb', sfx:'shadow', vfx:'poison' },
      { name:'夜幕', type:'dodge', cost:20, dur:1, desc:'下回合闪避所有攻击', icon:'🌌', iconColor:'#fff', sfx:'buff', vfx:'smoke' }
    ]}
];
