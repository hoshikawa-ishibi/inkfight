// 配队研究后台线程：只并行调用正式模拟器，不在这里实现任何战斗或统计规则。
import { SCENES } from '../src/data/data.js';
import { simOneBattle } from './sim.js';

const scenes=Object.fromEntries(SCENES.map(s=>[s.id,s]));

self.onmessage=e=>{
  const results=e.data.matches.map(({a,b,sceneId})=>({
    a,b,sceneId,
    firstWinner:simOneBattle(a,b,scenes[sceneId]).winner,
    secondWinner:simOneBattle(b,a,scenes[sceneId]).winner
  }));
  self.postMessage({results});
};
