import { runSimulation } from './sim.js';

const ROUNDS = Number(process.argv[2] || 4000);

runSimulation(ROUNDS, ()=>{}, (charStats, meta) => {
  const rows = Object.entries(charStats)
    .map(([id, s]) => ({ id, name:s.name, games:s.games, wins:s.wins, wr: s.wins/s.games*100 }))
    .sort((a,b) => b.wr - a.wr);

  const gamesList = rows.map(r=>r.games);
  const spread = Math.max(...gamesList) - Math.min(...gamesList);
  const avgGames = gamesList.reduce((a,b)=>a+b,0)/gamesList.length;

  console.log(`\n对局数 ${ROUNDS}   AI：hard（与玩家在困难难度下面对的完全一致）`);
  console.log(`采样均匀度：参战次数 ${Math.min(...gamesList)}~${Math.max(...gamesList)}，极差 ${spread}（${(spread/avgGames*100).toFixed(1)}% of 均值）`);
  console.log(`节奏：平均 ${meta.avgRounds.toFixed(1)} 回合分出胜负，${meta.timeoutPct.toFixed(1)}% 打满 上限回合按血量判定\n`);
  console.log('  角色      胜率     参战    偏离50%');
  console.log('  ' + '─'.repeat(42));
  for(const r of rows){
    const dev = r.wr - 50;
    const bar = '█'.repeat(Math.round(Math.abs(dev)/1.5));
    const flag = Math.abs(dev) >= 8 ? '  ⚠' : '';
    console.log(`  ${r.name.padEnd(6)}  ${r.wr.toFixed(1).padStart(5)}%  ${String(r.games).padStart(5)}   ${dev>=0?'+':''}${dev.toFixed(1).padStart(5)} ${bar}${flag}`);
  }
  console.log();
});
