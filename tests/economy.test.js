import { describe, expect, it, beforeEach } from 'vitest';
import { SaveSystem } from '../src/game/SaveSystem.js';
import { GEAR } from '../src/data/gameData.js';

describe('economy system - tickets and gear', () => {
  beforeEach(() => {
    const memory = new Map();
    globalThis.localStorage = {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
      clear: () => memory.clear()
    };
  });

  it('initializes DEFAULT_SAVE with tickets and expanded equipped slots', () => {
    const save = new SaveSystem();
    expect(save.data.tickets).toBe(0);
    expect(save.data.equipped).toEqual({
      hat: null,
      skin: null,
      boots: null,
      attachment: null,
      projectile: null,
      deathEffect: null,
      killEffect: null,
      customCrate: null,
      crateTextures: { brown: null, yellow: null, blue: null, red: null },
      crateModel: null,
      teamBase: null
    });
  });

  it('migrates legacy saves, defaulting tickets to 0 and merging equipped slots', () => {
    localStorage.setItem(
      'destructo-save-v1',
      JSON.stringify({
        chips: 1000,
        equipped: { hat: 'crown', skin: 'tiger' }
      })
    );

    const save = new SaveSystem();
    expect(save.data.tickets).toBe(0);
    expect(save.data.chips).toBe(1000);
    expect(save.data.equipped).toEqual({
      hat: 'crown',
      skin: 'tiger',
      boots: null,
      attachment: null,
      projectile: null,
      deathEffect: null,
      killEffect: null,
      customCrate: null,
      crateTextures: { brown: null, yellow: null, blue: null, red: null },
      crateModel: null,
      teamBase: null
    });
  });

  it('earns tickets correctly', () => {
    const save = new SaveSystem();
    expect(save.data.tickets).toBe(0);

    save.earnTickets(10);
    expect(save.data.tickets).toBe(10);

    save.earnTickets(-5);
    expect(save.data.tickets).toBe(10);

    save.earnTickets(4.6);
    expect(save.data.tickets).toBe(15);

    save.earnTickets(0.2);
    expect(save.data.tickets).toBe(15);
  });

  it('spends tickets correctly', () => {
    const save = new SaveSystem();
    save.earnTickets(50);

    const success1 = save.spendTickets(20);
    expect(success1).toBe(true);
    expect(save.data.tickets).toBe(30);

    const success2 = save.spendTickets(40);
    expect(success2).toBe(false);
    expect(save.data.tickets).toBe(30);

    const success3 = save.spendTickets(30);
    expect(success3).toBe(true);
    expect(save.data.tickets).toBe(0);
  });

  it('buys gear with chips', () => {
    const save = new SaveSystem();
    save.data.chips = 2000;
    save.data.gear = [];

    const magnetGear = GEAR.find(g => g.id === 'magnet');
    expect(magnetGear.currency).toBe('chips');

    const success = save.buyGear(magnetGear.id, magnetGear.price);
    expect(success).toBe(true);
    expect(save.data.gear).toContain(magnetGear.id);
    expect(save.data.chips).toBe(2000 - magnetGear.price);

    const successDuplicate = save.buyGear(magnetGear.id, magnetGear.price);
    expect(successDuplicate).toBe(false);
  });

  it('buys gear with tickets', () => {
    const save = new SaveSystem();
    save.data.gear = [];
    save.earnTickets(150);

    const jetpackGear = GEAR.find(g => g.id === 'jetpack');
    expect(jetpackGear.currency).toBe('tickets');

    const successFail = save.buyGearWithTickets(jetpackGear.id, 200);
    expect(successFail).toBe(false);
    expect(save.data.gear).not.toContain(jetpackGear.id);

    const success = save.buyGearWithTickets(jetpackGear.id, jetpackGear.price);
    expect(success).toBe(true);
    expect(save.data.gear).toContain(jetpackGear.id);
    expect(save.data.tickets).toBe(150 - jetpackGear.price);

    const successDuplicate = save.buyGearWithTickets(jetpackGear.id, jetpackGear.price);
    expect(successDuplicate).toBe(false);
  });

  it('grants a Casino cosmetic prize once without spending currency', () => {
    const save = new SaveSystem();
    expect(save.grantCasinoPrize('creator-thunder')).toBe(true);
    expect(save.data.cosmetics).toContain('creator-thunder');
    expect(save.data.chips).toBe(750);
    expect(save.grantCasinoPrize('creator-thunder')).toBe(false);
    expect(save.data.cosmetics.filter(id => id === 'creator-thunder')).toHaveLength(1);
  });

  describe('server-verified PayPal receipts', () => {
    it('credits a completed order exactly once', () => {const save=new SaveSystem(),receipt={orderId:'ORDER-123',captureId:'CAPTURE-123',tickets:170,status:'COMPLETED'};expect(save.grantTicketPurchase(receipt)).toBe(true);expect(save.data.tickets).toBe(170);expect(save.grantTicketPurchase(receipt)).toBe(false);expect(save.data.tickets).toBe(170)});
    it('rejects incomplete or malformed receipts', () => {const save=new SaveSystem();expect(save.grantTicketPurchase({orderId:'ORDER-1',tickets:100,status:'APPROVED'})).toBe(false);expect(save.grantTicketPurchase({orderId:'ORDER-2',tickets:-5,status:'COMPLETED'})).toBe(false);expect(save.data.tickets).toBe(0)});
  });
});
