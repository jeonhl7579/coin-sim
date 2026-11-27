// data/raw/ 파일 쓰기. 임시 파일에 쓴 뒤 이름을 바꿔서 중간에 끊겨도 파일이 깨지지 않게 한다 (D-59).

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeFileAtomic(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, path);
}

export function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  return writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}
