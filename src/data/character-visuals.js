// 战斗小人的唯一视觉配置。这里只描述轮廓与动作，不放任何战斗数值。
// 新角色优先组合现有部件；确实需要新轮廓时，才去 stickman.js 增加一种部件。
export const CHARACTER_VISUALS = {
  swordsman:   { body:'balanced', stance:'forward', head:'headband', outer:'scarf',      attack:'dash',   accent:'edge' },
  mage:        { body:'robe',     stance:'upright', head:'circlet', outer:'wideSleeves',attack:'cast',   accent:'runes' },
  guardian:    { body:'heavy',    stance:'low',     head:'helmet',  outer:'shield',     attack:'bash',   accent:'bulwark' },
  assassin:    { body:'light',    stance:'crouch',  head:'hood',    outer:'twinBlades', attack:'lunge',  accent:'shadow' },
  priest:      { body:'robe',     stance:'upright', head:'halo',    outer:'mantle',     attack:'cast',   accent:'aureole' },
  berserker:   { body:'heavy',    stance:'forward', head:'mane',    outer:'warRags',    attack:'smash',  accent:'rage' },
  archer:      { body:'light',    stance:'back',    head:'ponytail',outer:'quiver',     attack:'shoot',  accent:'aim' },
  warlock:     { body:'robe',     stance:'float',   head:'hornCollar',outer:'orbital',  attack:'curse', accent:'corrupt' },
  bladedancer: { body:'light',    stance:'draw',    head:'longKnot',outer:'sash',       attack:'drawCut',accent:'petal' },
  onmyoji:     { body:'robe',     stance:'upright', head:'highCrown',outer:'talismans', attack:'ritual', accent:'seal' },
  artificer:   { body:'balanced', stance:'back',    head:'goggles', outer:'gearPack',   attack:'launch', accent:'gear' },
  drummer:     { body:'wideRobe', stance:'open',    head:'doubleBun',outer:'warDrum',   attack:'beat',   accent:'pulse' },
  herbalist:   { body:'robe',     stance:'back',    head:'herbPin', outer:'gourd',      attack:'toss',   accent:'mist' },
  shadow:      { body:'light',    stance:'side',    head:'halfMask',outer:'splitScarf', attack:'counter',accent:'afterimage' },
  monk:        { body:'athletic', stance:'low',     head:'bare',    outer:'beads',      attack:'combo', accent:'impact' },
  raven:       { body:'tall',     stance:'forward', head:'featherHood',outer:'featherCape',attack:'reap',accent:'feathers' }
};

export const DEFAULT_CHARACTER_VISUAL = {
  body:'balanced', stance:'forward', head:'bare', outer:'none', attack:'dash', accent:'edge'
};

export function visualFor(id) {
  return CHARACTER_VISUALS[id] || DEFAULT_CHARACTER_VISUAL;
}
