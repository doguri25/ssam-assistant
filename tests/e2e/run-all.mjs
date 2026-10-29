// tests/e2e/ 안의 화면 시험을 모두 차례로 돌림
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && !['helpers.mjs', 'run-all.mjs'].includes(f)).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [dir + f], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(bad ? `화면 시험 ${bad}개 파일 실패` : `화면 시험 ${files.length}개 파일 모두 통과`);
process.exit(bad ? 1 : 0);
