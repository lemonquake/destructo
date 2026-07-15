export const CASINO_BETS = Object.freeze([50,100,250]);

export const CASINO_RARE_PRIZES = Object.freeze([
  Object.freeze({id:'lemonquake-idol',name:'Lemon-Quake Idol',rarity:'MYTHIC',icon:'⚡'}),
  Object.freeze({id:'worldbreaker-greaves',name:'Worldbreaker Greaves',rarity:'MYTHIC',icon:'⟰'}),
  Object.freeze({id:'creator-thunder',name:'Creator Thunder',rarity:'MYTHIC',icon:'☄'}),
  Object.freeze({id:'gaia-heartpack',name:'Heart of Gaia Pack',rarity:'MYTHIC',icon:'⚙'}),
  Object.freeze({id:'creator-chrome',name:'Creator Chrome',rarity:'MYTHIC',icon:'◈'}),
]);

export const CASINO_GAMES = Object.freeze([
  Object.freeze({id:'reactor-slots',name:'Reactor Slots',kicker:'THREE-CORE SPINNER',icon:'◫',description:'Synchronize three unstable reactor reels.',odds:Object.freeze(['PAIR · 2× RETURN','TRIPLE · 8× RETURN','TRIPLE CROWN/LEMON · 20×','MYTHIC ARTIFACT BONUS · 1%'])}),
  Object.freeze({id:'vault-breach',name:'Vault Breach',kicker:'PICK A CONTAINMENT CRATE',icon:'▣',description:'Choose a sealed crate and breach its prize core.',odds:Object.freeze(['REFUND CORE · 20%','DOUBLE CORE · 26%','5× JACKPOT · 10%','MYTHIC VAULT · 2%'])}),
  Object.freeze({id:'rivet-dice',name:'Rivet Dice',kicker:'SQUAD TOTAL VS HOUSE',icon:'⚄',description:'Roll two demolition dice against Major Rivet.',odds:Object.freeze(['HIGHER TOTAL · 2× RETURN','TIE · BET REFUNDED','LOWER TOTAL · SCRAPPED','DOUBLE SIX · 25% MYTHIC CHANCE'])}),
]);

const SYMBOLS=Object.freeze([
  Object.freeze({id:'bolt',label:'BOLT',icon:'ϟ',weight:.30}),Object.freeze({id:'crate',label:'CRATE',icon:'▣',weight:.25}),
  Object.freeze({id:'shield',label:'SHIELD',icon:'⬡',weight:.20}),Object.freeze({id:'skull',label:'SCRAP',icon:'☠',weight:.14}),
  Object.freeze({id:'crown',label:'CROWN',icon:'♛',weight:.08}),Object.freeze({id:'lemon',label:'LEMON',icon:'◆',weight:.03}),
]);

const unitRandom=random=>Math.min(.999999,Math.max(0,Number(random())||0));
const pickPrize=random=>CASINO_RARE_PRIZES[Math.floor(unitRandom(random)*CASINO_RARE_PRIZES.length)];
const pickSymbol=random=>{let roll=unitRandom(random);for(const symbol of SYMBOLS){roll-=symbol.weight;if(roll<0)return symbol}return SYMBOLS.at(-1)};
const rollDie=random=>1+Math.floor(unitRandom(random)*6);

function reactorSlots(bet,random){
  const symbols=[pickSymbol(random),pickSymbol(random),pickSymbol(random)],counts=new Map();for(const symbol of symbols)counts.set(symbol.id,(counts.get(symbol.id)||0)+1);
  const triple=counts.size===1,pair=[...counts.values()].some(value=>value===2),premium=triple&&['crown','lemon'].includes(symbols[0].id),multiplier=premium?20:triple?8:pair?2:0;
  const prize=unitRandom(random)<.01?pickPrize(random):null;
  return{gameId:'reactor-slots',bet,payout:bet*multiplier,multiplier,prize,symbols:symbols.map(symbol=>({id:symbol.id,label:symbol.label,icon:symbol.icon})),headline:prize?'MYTHIC SIGNAL!':premium?'CORE OVERLOAD!':triple?'TRIPLE SYNC!':pair?'PAIR LOCKED!':'REACTOR MISFIRE'};
}

function vaultBreach(bet,random,choice=0){
  const roll=unitRandom(random);let multiplier=0,prize=null,headline='EMPTY CONTAINMENT';
  if(roll<.02){multiplier=8;prize=pickPrize(random);headline='MYTHIC VAULT BREACHED!'}else if(roll<.12){multiplier=5;headline='BLACKSITE JACKPOT!'}else if(roll<.38){multiplier=2;headline='CHARGED CORE!'}else if(roll<.58){multiplier=1;headline='BET RECOVERED'}
  return{gameId:'vault-breach',bet,payout:bet*multiplier,multiplier,prize,choice:Math.max(0,Math.min(2,Math.floor(choice))),headline};
}

function rivetDice(bet,random){
  const player=[rollDie(random),rollDie(random)],house=[rollDie(random),rollDie(random)],playerTotal=player[0]+player[1],houseTotal=house[0]+house[1],multiplier=playerTotal>houseTotal?2:playerTotal===houseTotal?1:0;
  const prize=playerTotal===12&&unitRandom(random)<.25?pickPrize(random):null;
  return{gameId:'rivet-dice',bet,payout:bet*multiplier,multiplier,prize,player,house,playerTotal,houseTotal,headline:prize?'DOUBLE-SIX MYTHIC!':multiplier===2?'RIVET BEATEN!':multiplier===1?'ARMOR TIE':'HOUSE HOLDS'};
}

export function playCasinoGame(gameId,bet,{random=Math.random,choice=0}={}){
  const stake=Math.round(Number(bet));if(!CASINO_BETS.includes(stake))throw new RangeError('Invalid casino stake.');
  if(gameId==='reactor-slots')return reactorSlots(stake,random);
  if(gameId==='vault-breach')return vaultBreach(stake,random,choice);
  if(gameId==='rivet-dice')return rivetDice(stake,random);
  throw new RangeError('Unknown casino game.');
}
