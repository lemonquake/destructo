import { describe, expect, it } from 'vitest';
import { CASINO_BETS, CASINO_GAMES, CASINO_RARE_PRIZES, playCasinoGame } from '../src/data/casinoData.js';

const sequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
};

describe('Destructo Casino', () => {
  it('offers three games, fixed Chip bets, and visible payout rules', () => {
    expect(CASINO_GAMES).toHaveLength(3);
    expect(new Set(CASINO_GAMES.map(game => game.id)).size).toBe(3);
    expect(CASINO_GAMES.every(game => game.odds.length >= 4)).toBe(true);
    expect(CASINO_BETS).toEqual([50, 100, 250]);
    expect(CASINO_RARE_PRIZES).toHaveLength(5);
  });

  it('pays the advertised 20x Reactor Slots premium triple', () => {
    const result = playCasinoGame('reactor-slots', 100, { random: sequence(.999, .999, .999, .5) });
    expect(result.symbols.map(symbol => symbol.id)).toEqual(['lemon', 'lemon', 'lemon']);
    expect(result.multiplier).toBe(20);
    expect(result.payout).toBe(2000);
  });

  it('can award a permanent mythic prize from Reactor Slots', () => {
    const result = playCasinoGame('reactor-slots', 50, { random: sequence(0, .4, .6, 0, 0) });
    expect(result.prize).toEqual(CASINO_RARE_PRIZES[0]);
    expect(result.headline).toBe('MYTHIC SIGNAL!');
  });

  it('honors each Vault Breach payout band', () => {
    expect(playCasinoGame('vault-breach', 100, { random: sequence(.57), choice: 2 }).multiplier).toBe(1);
    expect(playCasinoGame('vault-breach', 100, { random: sequence(.37), choice: 1 }).multiplier).toBe(2);
    expect(playCasinoGame('vault-breach', 100, { random: sequence(.11), choice: 0 }).multiplier).toBe(5);
    const mythic = playCasinoGame('vault-breach', 100, { random: sequence(.01, .99), choice: 9 });
    expect(mythic.multiplier).toBe(8);
    expect(mythic.prize).toEqual(CASINO_RARE_PRIZES.at(-1));
    expect(mythic.choice).toBe(2);
  });

  it('resolves Rivet Dice totals and its double-six mythic chance', () => {
    const result = playCasinoGame('rivet-dice', 250, { random: sequence(.999, .999, 0, 0, 0, .25) });
    expect(result.playerTotal).toBe(12);
    expect(result.houseTotal).toBe(2);
    expect(result.payout).toBe(500);
    expect(result.prize).toEqual(CASINO_RARE_PRIZES[1]);
  });

  it('rejects unknown games and off-menu stakes', () => {
    expect(() => playCasinoGame('reactor-slots', 75)).toThrow(RangeError);
    expect(() => playCasinoGame('unknown', 100)).toThrow(RangeError);
  });
});
