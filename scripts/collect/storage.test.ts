import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic, writeJsonAtomic } from './storage';

describe('writeFileAtomic', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'coin-sim-storage-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('없는 폴더를 만들고 쓰며, 임시 파일을 남기지 않는다', async () => {
    const path = join(dir, 'a', 'b', 'file.txt');
    await writeFileAtomic(path, 'hello');
    expect(await readFile(path, 'utf8')).toBe('hello');
    expect(await readdir(join(dir, 'a', 'b'))).toEqual(['file.txt']);
  });

  it('기존 파일을 덮어쓴다', async () => {
    const path = join(dir, 'file.txt');
    await writeFileAtomic(path, 'old');
    await writeFileAtomic(path, 'new');
    expect(await readFile(path, 'utf8')).toBe('new');
  });

  it('JSON은 들여쓰기 2칸과 마지막 줄바꿈', async () => {
    const path = join(dir, 'x.json');
    await writeJsonAtomic(path, { a: 1 });
    expect(await readFile(path, 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});
