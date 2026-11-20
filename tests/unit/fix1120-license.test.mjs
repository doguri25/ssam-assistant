// 라이선스·출처 고지(2026-11-20 「고쳐야 할 것·보완하면 좋을 것 수정해서 커밋 릴리즈해줘」 — 저작권 점검):
// LICENSE(MIT)와 앱 안 사본, 한컴 HWP 공개 문서 출처 문구, 함께 쓴 공개 소프트웨어 고지(web/licenses)가 Cargo.lock과 맞는지, 라이선스 표기, 설정 › 정보 탭·안내
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchGuide, guideText } from '../../web/core/chat-knowledge.js';

const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const HANCOM = '본 제품은 한글과컴퓨터의 한/글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
const NOTICES = read('web/licenses/THIRD-PARTY-NOTICES.txt');

test('LICENSE는 MIT이고, 앱이 보여 주는 web/licenses/LICENSE.txt는 그 사본', () => {
  const lic = read('LICENSE');
  assert.match(lic, /^MIT License\n\nCopyright \(c\) 2026 /);
  assert.ok(lic.includes('Permission is hereby granted, free of charge'));
  assert.equal(read('web/licenses/LICENSE.txt'), lic, 'LICENSE를 고치면 node scripts/third-party-notices.mjs');
  // MIT가 아닌 것(pdf.js·글꼴·Rust 라이브러리)은 따로 밝힘
  for (const s of ['web/vendor/pdfjs/', 'web/fonts/pretendard/', 'web/fonts/suit/', 'THIRD-PARTY-NOTICES.txt']) assert.ok(lic.includes(s), s);
});

test('한컴 출처 문구: LICENSE·README·고지 파일·설정 › 정보·「쌤」 안내에 그대로', () => {
  for (const [f, t] of [['LICENSE', read('LICENSE')], ['README.md', read('README.md')], ['고지 파일', NOTICES], ['settings.js', read('web/menus/settings/settings.js')], ['안내', guideText()]])
    assert.ok(t.includes(HANCOM), f);
});

test('고지 파일: Cargo.lock의 라이브러리·버전과 맞고(낡은 줄 없음), 앱 핵심 라이브러리와 웹 쪽 라이선스 전문을 담음', () => {
  const lock = read('src-tauri/Cargo.lock');
  const inLock = new Set([...lock.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`));
  const sec = NOTICES.split('2. Windows 앱(Tauri 2)에 들어 있는 Rust 라이브러리')[1].split('3. 라이선스 전문')[0];
  const listed = [...sec.matchAll(/^- (\S+) (\S+) — /gm)].map(m => `${m[1]} ${m[2]}`);
  const n = +sec.match(/^ (\d+)개/)[1];
  assert.equal(listed.length, n, '머리 수와 목록 수');
  assert.ok(n >= 200, `라이브러리 ${n}개`);
  const stale = listed.filter(x => !inLock.has(x));
  assert.deepEqual(stale, [], 'Cargo.lock에 없는 줄 — node scripts/third-party-notices.mjs로 다시 만들기');
  for (const name of ['tauri', 'tauri-runtime-wry', 'reqwest', 'serde', 'sha2', 'arboard', 'tauri-plugin-global-shortcut', 'windows'])
    assert.ok(listed.some(x => x.startsWith(name + ' ') && inLock.has(x)), name);
  // 라이브러리마다 라이선스 글이 있음(목록의 이름이 전문 머리에 한 번 이상)
  const texts = NOTICES.split('3. 라이선스 전문')[1];
  const heads = [...texts.matchAll(/^--- (.+) ---$/gm)].map(m => m[1]).join(', ');
  for (const x of listed) assert.ok(heads.includes(x), `${x} 라이선스 글`);
  assert.ok(texts.includes('Apache License') && texts.includes('SIL OPEN FONT LICENSE'), 'pdf.js·글꼴 전문');
  assert.ok(NOTICES.includes('Google Fonts') && NOTICES.includes('pdf.js 3.11.174'));
});

test('라이선스 표기: package.json·package-lock·Cargo.toml이 MIT', () => {
  assert.equal(JSON.parse(read('package.json')).license, 'MIT');
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].license, 'MIT');
  assert.match(read('src-tauri/Cargo.toml'), /^license = "MIT"$/m);
});

test('설정 › 정보 탭과 「쌤」 안내: 라이선스·저작권을 물으면 라이선스 안내가 먼저', () => {
  assert.ok(read('web/core/shell.js').includes("['purchase', '품의 기준'], ['about', '정보']"));
  const s = read('web/menus/settings/settings.js');
  assert.ok(s.includes("about: () =>") && s.includes("licenses/LICENSE.txt") && s.includes("licenses/THIRD-PARTY-NOTICES.txt"));
  for (const q of ['라이선스가 뭐야?', '저작권 문제없어?', '오픈소스로 가져다 써도 돼?']) assert.equal((searchGuide(q)[0] || {}).id, 'license', q);
  assert.ok(guideText().includes('MIT 라이선스'));
});
