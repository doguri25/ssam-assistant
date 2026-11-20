// 함께 쓴 공개 소프트웨어 고지 만들기 → web/licenses/THIRD-PARTY-NOTICES.txt, web/licenses/LICENSE.txt(저장소 LICENSE 사본)
// Windows 앱(Tauri)에 들어가는 Rust 라이브러리는 cargo metadata(Windows 대상, 시험 전용 의존 뺌)로 찾고, 라이브러리마다 받은 소스의 라이선스 파일을 그대로 붙임.
// Cargo.lock·web/vendor·web/fonts가 바뀌면 다시 돌림:  node scripts/third-party-notices.mjs   (tests/unit/fix1120-license.test.mjs가 목록이 Cargo.lock과 맞는지 봄)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web', 'licenses');
export const HANCOM = '본 제품은 한글과컴퓨터의 한/글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';

const meta = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--locked', '--manifest-path', join(ROOT, 'src-tauri', 'Cargo.toml'),
  '--filter-platform', 'x86_64-pc-windows-msvc'], { maxBuffer: 256 << 20 }).toString());
const pkgs = new Map(meta.packages.map(p => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map(n => [n.id, n]));
// 앱(ssam)에서 닿는 라이브러리: 보통·빌드 의존(시험 전용 dev는 뺌)
const root = meta.resolve.root, seen = new Set(), stack = [root];
while (stack.length) {
  const id = stack.pop(); if (seen.has(id)) continue; seen.add(id);
  for (const d of nodes.get(id).deps) if (d.dep_kinds.some(k => k.kind !== 'dev')) stack.push(d.pkg);
}
seen.delete(root);
const list = [...seen].map(id => pkgs.get(id)).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }));

const LIC_FILE = /^(licen[cs]e|copying|copyright|notice|unlicense)([-_.].*)?$/i;
const norm = t => t.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const APACHE = norm(readFileSync(join(ROOT, 'web/vendor/pdfjs/LICENSE'), 'utf8'));
const MIT = holder => `MIT License\n\nCopyright (c) ${holder}\n\n` + norm(readFileSync(join(ROOT, 'LICENSE'), 'utf8')).split('\n\n').slice(2, 5).join('\n\n');
function licenseTexts(p) {
  const dir = dirname(p.manifest_path);
  const names = new Set(readdirSync(dir).filter(f => LIC_FILE.test(f) && statSync(join(dir, f)).isFile()));
  if (p.license_file) names.add(p.license_file);
  const got = [...names].sort().map(f => ({ file: f, text: norm(readFileSync(join(dir, f), 'utf8')) })).filter(x => x.text);
  if (got.length) return got;
  // 라이선스 파일 없이 낸 라이브러리: 같은 저장소의 다른 라이브러리 글 → 같은 라이선스 하나만 쓰는 다른 라이브러리 글 → SPDX 표기대로 표준 글
  const spdx = String(p.license || '');
  const kin = (by, why) => {
    for (const q of list) {
      if (q === p || !by(q)) continue;
      const d = dirname(q.manifest_path), fs = readdirSync(d).filter(f => LIC_FILE.test(f) && statSync(join(d, f)).isFile()).sort();
      if (fs.length) return fs.map(f => ({ file: `(${why} ${q.name}의 ${f})`, text: norm(readFileSync(join(d, f), 'utf8')) }));
    }
    return null;
  };
  const same = (p.repository && kin(q => q.repository === p.repository && q.license === p.license, '같은 저장소')) || (/^[\w.-]+$/.test(spdx) && !/^(MIT|Apache-2\.0)$/.test(spdx) && kin(q => q.license === spdx, '같은 라이선스'));
  if (same) return same;
  const out = [];
  if (/\bMIT\b/.test(spdx)) out.push({ file: '(표준 MIT 글)', text: MIT((p.authors || []).join(', ').replace(/\s*<[^>]*>/g, '') || p.name + ' 저작자') });
  if (/Apache-2\.0/.test(spdx)) out.push({ file: '(표준 Apache-2.0 글)', text: APACHE });
  return out;
}
const groups = new Map(); // 글 → 쓰는 라이브러리
for (const p of list) for (const t of licenseTexts(p)) {
  if (!groups.has(t.text)) groups.set(t.text, []);
  groups.get(t.text).push(`${p.name} ${p.version}${t.file.startsWith('(') ? ' ' + t.file : ''}`);
}

const WEB = [
  ['pdf.js 3.11.174', 'Apache-2.0', 'https://github.com/mozilla/pdf.js', 'web/vendor/pdfjs/LICENSE'],
  ['Pretendard 1.3.9 (글꼴)', 'SIL Open Font License 1.1', 'https://github.com/orioncactus/pretendard', 'web/fonts/pretendard/LICENSE.txt'],
  ['SUIT 2.0.5 (글꼴)', 'SIL Open Font License 1.1', 'https://github.com/sun-typeface/SUIT', 'web/fonts/suit/LICENSE.txt']
];
const line = '='.repeat(72);
const out = [
  '쌤비서 — 함께 쓴 공개 소프트웨어 고지',
  `(scripts/third-party-notices.mjs로 만듦 · src-tauri/Cargo.lock 기준)`,
  '',
  '쌤비서는 MIT 라이선스로 공개합니다(licenses/LICENSE.txt). 아래 소프트웨어는 각자의 라이선스를 따릅니다.',
  '',
  '출처 표시',
  `  ${HANCOM}`,
  '',
  line, '1. 웹 화면(웹판·Windows 앱 공통)에 들어 있는 것', line,
  ...WEB.map(([n, l, u, f]) => `- ${n} — ${l} — ${u} (${f})`),
  '- 인터넷에서 불러 쓰는 글꼴(Google Fonts): Gothic A1, IBM Plex Sans KR, Noto Sans KR, Noto Serif KR, Nanum Gothic, Gowun Dodum, Gowun Batang — SIL Open Font License 1.1 / Roboto Mono — Apache-2.0',
  '',
  line, `2. Windows 앱(Tauri 2)에 들어 있는 Rust 라이브러리 ${list.length}개`, line,
  ...list.map(p => `- ${p.name} ${p.version} — ${p.license || '(라이선스 표기 없음 — 아래 라이선스 파일)'}${p.repository ? ' — ' + p.repository : ''}`),
  '',
  line, '3. 라이선스 전문', line,
  ...WEB.flatMap(([n, , , f]) => ['', `--- ${n} (${f}) ---`, '', norm(readFileSync(join(ROOT, f), 'utf8'))]),
  ...[...groups].flatMap(([text, who]) => ['', `--- ${who.join(', ')} ---`, '', text]),
  ''
].join('\n');
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'THIRD-PARTY-NOTICES.txt'), out);
writeFileSync(join(OUT, 'LICENSE.txt'), readFileSync(join(ROOT, 'LICENSE'), 'utf8'));
console.log(`web/licenses/THIRD-PARTY-NOTICES.txt — Rust 라이브러리 ${list.length}개, 라이선스 글 ${groups.size}가지, ${(out.length / 1024).toFixed(0)}KB`);
const none = list.filter(p => !licenseTexts(p).length).map(p => p.name + ' ' + p.version);
if (none.length) console.log('라이선스 글을 못 찾음:', none.join(', '));
