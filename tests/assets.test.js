import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const textures=['grass','dirt','stone','water','metal','wood','uniform'];

describe('generated texture deliverables',()=>{
  it.each(textures)('%s is a substantial square PNG in the project',(name)=>{
    const path=resolve(`public/assets/textures/${name}.png`),data=readFileSync(path);
    expect(data.subarray(1,4).toString()).toBe('PNG');expect(data.readUInt32BE(16)).toBe(1254);expect(data.readUInt32BE(20)).toBe(1254);expect(statSync(path).size).toBeGreaterThan(1_000_000);
  });
});
