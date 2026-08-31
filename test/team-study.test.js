import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { allFourMemberTeams, teamKey, wilsonLower, buildTeamStudyReport, recordMirroredResult } from '../tools/team-study.js';

describe('4v4 配队研究',()=>{
  test('16 人恰好产生 1820 种不重复四人队',()=>{
    const teams=allFourMemberTeams(Array.from({length:16},(_,i)=>`c${i}`));
    assert.equal(teams.length,1820);
    assert.equal(new Set(teams.map(teamKey)).size,1820);
    assert.ok(teams.every(t=>t.length===4 && new Set(t).size===4));
  });

  test('Wilson 下界会惩罚小样本虚高胜率',()=>{
    assert.ok(wilsonLower(60,100)>wilsonLower(1,1));
    assert.ok(wilsonLower(600,1000)>wilsonLower(60,100));
  });

  test('报告只输出压缩后的推荐结果',()=>{
    const a=['swordsman','mage','guardian','assassin'];
    const b=['priest','berserker','archer','warlock'];
    const scenes={void:{wins:6,games:10},lava:{wins:6,games:10},spring:{wins:6,games:10}};
    const scoutStats=new Map([[teamKey(a),{ids:a,wins:20,games:40,scenes}],[teamKey(b),{ids:b,wins:20,games:40,scenes}]]);
    const finalStats=new Map([[teamKey(a),{ids:a,wins:18,games:30,scenes}],[teamKey(b),{ids:b,wins:12,games:30,scenes}]]);
    const key=[teamKey(a),teamKey(b)].sort();
    const matchups=new Map([[`${key[0]}::${key[1]}`,{a:key[0],b:key[1],aWins:key[0]===teamKey(a)?18:12,games:30}]]);
    const report=buildTeamStudyReport({totalBattles:10000,scoutBattles:7000,scoutStats,finalStats,matchups});
    assert.equal(report.recommendations[0].ids.join(','),a.join(','));
    assert.equal(report.recommendations[0].winRate,60);
    assert.equal(report.teamCount,2);
    assert.equal('rawBattles' in report,false);
  });

  test('并行返回的正反手结果按同一口径汇总',()=>{
    const a=['a','b','c','d'], b=['e','f','g','h'];
    const stats=new Map(), matchups=new Map();
    // 第一局 A 先手胜，第二局 B 先手但 A 后手胜：A 应为 2/2。
    recordMirroredResult(stats,matchups,a,b,'void',1,2);
    assert.deepEqual({wins:stats.get(teamKey(a)).wins,games:stats.get(teamKey(a)).games},{wins:2,games:2});
    assert.deepEqual({wins:stats.get(teamKey(b)).wins,games:stats.get(teamKey(b)).games},{wins:0,games:2});
  });
});
