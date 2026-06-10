import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE = path.join(process.cwd(), '.data', 'storage');

export async function storeBuffer(relativePath: string, content: Buffer): Promise<string> {
  const target = path.join(BASE, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  return target;
}

export async function readBuffer(absolutePath: string): Promise<Buffer> {
  return fs.readFile(absolutePath);
}
