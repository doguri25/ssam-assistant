// web/ 폴더 전체를 데스크톱 앱이 읽는 dist 폴더로 복사
import { rmSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'dist'), { recursive: true, force: true });
cpSync(join(root, 'web'), join(root, 'dist'), { recursive: true });
console.log('web/ → dist/');
