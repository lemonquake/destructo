import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const runtimeFiles=['src/game/Game.js','src/game/AIController.js'];

describe('UI Unicode integrity',()=>{
  it('contains no common UTF-8 mojibake markers',()=>{
    for(const file of runtimeFiles){
      const source=readFileSync(file,'utf8');
      expect(source,`${file} contains double-encoded text`).not.toMatch(/[\u00c2\u00e2\u00c3\ufffd]|\u00f0\u0178/);
    }
  });

  it('retains the intended HUD symbols and award emoji',()=>{
    const source=readFileSync('src/game/Game.js','utf8');
    for(const symbol of ['·','—','×','🏆','🔥','☠️','☄️','💥','📦','🐺','🎯'])expect(source).toContain(symbol);
  });
});
