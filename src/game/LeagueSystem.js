const FIRST = ['Nova','Rook','Pixel','Echo','Jinx','Mako','Vex','Orbit','Kite','Blitz','Fable','Drift','Ember','Ghost','Iris','Knox','Lumen','Axel'];
const LAST = ['Circuit','Bravo','Ranger','Vector','Hammer','Quasar','Talon','Glitch','Nomad','Viper','Comet','Forge','Saber','Static','Atlas','Zero','Cipher','Rocket'];
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

export const rankFor = mmr => mmr >= 1800 ? 'GRANDMASTER' : mmr >= 1500 ? 'DIAMOND' : mmr >= 1250 ? 'GOLD' : mmr >= 1000 ? 'SILVER' : 'BRONZE';

export class LeagueSystem {
  constructor(saved = []) { this.profiles = Array.isArray(saved) ? saved.map(p=>({...p})) : []; this.ensure(18); }
  makeProfile(index = this.profiles.length) { const name = `${FIRST[index % FIRST.length]} ${LAST[(index * 7 + 3) % LAST.length]}`; const mmr = 760 + ((index * 137 + 83) % 950); const games = 8 + ((index * 11) % 58), wins = Math.round(games * (.34 + ((index * 17) % 31) / 100)); return { id:`cpu-${index}-${name.toLowerCase().replaceAll(' ','-')}`, name, mmr, wins, losses:games-wins, kills:Math.round(games*(3.2+(index%6)*.7)), streak:0 }; }
  ensure(count) { while(this.profiles.length<count)this.profiles.push(this.makeProfile()); return this.profiles; }
  draw(count, exclude = []) { const blocked=new Set(exclude); return [...this.profiles].filter(p=>!blocked.has(p.id)).sort(()=>Math.random()-.5).slice(0,count); }
  oddsFor(teams, stats = {}, world = null) { const scores=teams.map(t=>{const profile=t.profile||{mmr:1000};const units=stats[t.id]?.units??1;const hp=stats[t.id]?.hp??100;const base=world?.factories?.[t.id];return Math.max(.1,(profile.mmr/1000)*(.55+units*.3)*(hp/100)*(base?.dead?.35:1));}); const total=scores.reduce((a,b)=>a+b,0)||1; return Object.fromEntries(teams.map((t,i)=>[t.id,clamp((total/scores[i])*.88,1.15,9.5)])); }
  settle(winnerId, playerTeamId, teams) { const winner=teams.find(t=>t.id===winnerId),player=teams.find(t=>t.id===playerTeamId); if(!winner)return 0; let delta=0;if(player){const expected=1/(1+Math.pow(10,((winner.profile?.mmr||1000)-(player.profile?.mmr||1000))/400)),won=winnerId===playerTeamId;delta=Math.round(28*((won?1:0)-expected));} for(const t of teams){if(!t.profile)continue;const p=this.profiles.find(x=>x.id===t.profile.id);if(!p)continue;const didWin=t.id===winnerId;p.mmr=Math.max(100,Math.round(p.mmr+(didWin?18:-12)));p[didWin?'wins':'losses']++;p.streak=didWin?Math.max(1,(p.streak||0)+1):Math.min(-1,(p.streak||0)-1);p.kills+=(t.stats?.kills||0);} return delta; }
  leaderboard(player) { return [{id:'you',name:'YOU',mmr:player.mmr||1000,wins:player.rankedWins||0,losses:player.rankedLosses||0,player:true},...this.profiles].sort((a,b)=>b.mmr-a.mmr).slice(0,20); }
}
