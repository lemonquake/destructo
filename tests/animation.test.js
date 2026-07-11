import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('unit animation stability', () => {
  const entityFactory = readFileSync(resolve('src/game/EntityFactory.js'), 'utf8');
  const aiController = readFileSync(resolve('src/game/AIController.js'), 'utf8');
  const world = readFileSync(resolve('src/game/World.js'), 'utf8');

  it('contains no bobbing or lateral idle sway implementation', () => {
    const relevantSource = `${entityFactory}\n${aiController}\n${world}`;
    expect(relevantSource).not.toMatch(/bob/i);
    expect(entityFactory).not.toContain('idleStyle');
    expect(entityFactory).not.toMatch(/body\.position\.x\s*=/);
    expect(entityFactory).not.toMatch(/body\.rotation\.z\s*=/);
    expect(entityFactory).not.toMatch(/head\.rotation\.z\s*=/);
    expect(aiController).not.toContain('flank');
  });
});
