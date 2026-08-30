// 立绘资产独立于战斗数据；允许逐批补齐，未配置角色由档案页显示占位状态。
export const CHARACTER_PORTRAITS={
  swordsman:'assets/portraits/concepts/swordsman-v1.png',
  mage:'assets/portraits/concepts/mage-v1.png',
  guardian:'assets/portraits/concepts/guardian-v1.png',
  assassin:'assets/portraits/concepts/assassin-v1.png',
  priest:'assets/portraits/concepts/priest-v1.png',
  berserker:'assets/portraits/concepts/berserker-v1.png',
  archer:'assets/portraits/concepts/archer-v1.png',
  warlock:'assets/portraits/concepts/warlock-v1.png',
  bladedancer:'assets/portraits/concepts/bladedancer-v1.png',
  onmyoji:'assets/portraits/concepts/onmyoji-v1.png',
  artificer:'assets/portraits/concepts/artificer-v1.png',
  drummer:'assets/portraits/concepts/drummer-v1.png',
  herbalist:'assets/portraits/concepts/herbalist-v1.png',
  shadow:'assets/portraits/concepts/shadow-v1.png',
  monk:'assets/portraits/concepts/monk-v1.png',
  raven:'assets/portraits/concepts/raven-v1.png'
};

export const portraitFor=id=>CHARACTER_PORTRAITS[id]||null;
