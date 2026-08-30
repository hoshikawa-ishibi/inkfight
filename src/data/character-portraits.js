// 立绘资产独立于战斗数据；允许逐批补齐，未配置角色由档案页显示占位状态。
// **提交前必须压到显示尺寸**（webp，768px 宽）：AI 出图是 1024×1536 的 PNG，
// 一张 2~3MB，而档案页一次只显示一张——原图等于让每次点角色都下 2.5MB。
// 体积上限由 test/character-portraits.test.js 守着，和场景图那条规则一致。
export const CHARACTER_PORTRAITS={
  swordsman:'assets/portraits/concepts/swordsman-v1.webp',
  mage:'assets/portraits/concepts/mage-v1.webp',
  guardian:'assets/portraits/concepts/guardian-v1.webp',
  assassin:'assets/portraits/concepts/assassin-v1.webp',
  priest:'assets/portraits/concepts/priest-v1.webp',
  berserker:'assets/portraits/concepts/berserker-v1.webp',
  archer:'assets/portraits/concepts/archer-v1.webp',
  warlock:'assets/portraits/concepts/warlock-v1.webp',
  bladedancer:'assets/portraits/concepts/bladedancer-v1.webp',
  onmyoji:'assets/portraits/concepts/onmyoji-v1.webp',
  artificer:'assets/portraits/concepts/artificer-v1.webp',
  drummer:'assets/portraits/concepts/drummer-v1.webp',
  herbalist:'assets/portraits/concepts/herbalist-v1.webp',
  shadow:'assets/portraits/concepts/shadow-v1.webp',
  monk:'assets/portraits/concepts/monk-v1.webp',
  raven:'assets/portraits/concepts/raven-v1.webp'
};

export const portraitFor=id=>CHARACTER_PORTRAITS[id]||null;
