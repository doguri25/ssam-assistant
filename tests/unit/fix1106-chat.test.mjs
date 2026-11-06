// 2026-11-06 혁신 기능 묶음 검토 고침 — 「쌤」 채팅(순수 함수): 기록·AI 분류 글의 이름·전화번호 가리기(I1 safeText),
// 메뉴에 넘길 글은 줄바꿈을 살림(I2 payload), 번역은 번역을 바라는 말이 있을 때만(I3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeText, isSure, safeText } from '../../web/core/chat-route.js';
import { maskContacts } from '../../web/core/privacy.js';

const sure = (t, intent) => { const r = routeText(t); assert.ok(isSure(r), `${t}: 분명하지 않음 ${JSON.stringify(r)}`); assert.equal(r.intent, intent, t); return r; };

test('I1 채팅 기록: 이름·전화번호를 가린 글(줄을 통째로 빼지 않고 전화번호만), 할 일 낱말은 남음', () => {
  for (const [raw, name, keep] of [['박지훈 결석계 가정통신문', '박지훈', '결석계 가정통신문'], ['김민수 단원평가 다시 채점', '김민수', '단원평가 다시 채점'],
    ['김민수 엄마한테 쪽지', '김민수', '엄마한테 쪽지'], ['이서연이 상장 받은 것 가정통신문', '이서연', '가정통신문']]) {
    const s = safeText(raw);
    assert.ok(!s.includes(name) && s.includes('○○○') && s.includes(keep), `${raw} → ${s}`);
  }
  const g = safeText('공문 처리\n제목: 2026 과학의 날 운영 안내\n담당: 교무부장 (031-123-4567)');
  assert.ok(g.includes('과학의 날 운영 안내') && g.includes('교무부장') && !g.includes('031') && !g.includes('4567'), g);
  assert.ok(!safeText('문의 ssam@school.kr').includes('@'));
  assert.equal(safeText('담임 김철수 010-1234-5678'), '담임 ○○○ ○○○');
});

test('I2 넘길 글: 줄바꿈을 살림(공문·가정통신문·결과 보고·품의), 앞의 「공문 처리」「써 줘:」만 뗌', () => {
  const g = sure('공문 처리\n제목: 2026 과학의 날 운영 안내\n담당: 교무부장 (031-123-4567)', 'gongmun');
  assert.equal(g.payload.text, '제목: 2026 과학의 날 운영 안내\n담당: 교무부장 (031-123-4567)');
  assert.equal(sure('가정통신문 써 줘: 11월 20일 현장체험학습\n준비물: 도시락', 'letter').payload.text, '11월 20일 현장체험학습\n준비물: 도시락');
  assert.equal(sure('결과 보고 써 줘\n과학의 날 행사를 4월 21일에 했어요\n참가 120명', 'report').payload.text, '과학의 날 행사를 4월 21일에 했어요\n참가 120명');
  assert.equal(sure('알코올램프 10개 5,000원\n비커 8개 4,500원 품의', 'purchase').payload.text, '알코올램프 10개 5,000원\n비커 8개 4,500원');
  // 채팅은 넘기기 전에 전화번호만 가림(chat.js) — 가리고 나면 넘길 내용이 없으면 빈칸(그 메뉴로만)
  assert.equal(sure(maskContacts('공문 처리\n031-123-4567'), 'gongmun').payload.text, '');
  assert.equal(sure(maskContacts('공문 처리\n제목: 운영 안내\n담당: 교무부장 (031-123-4567)'), 'gongmun').payload.text, '제목: 운영 안내\n담당: 교무부장 (○○○)');
});

test('I3 번역: 언어 낱말 + 번역·「~어로」·「~문으로」·「~어 번역본」·「~어 가정통신문」만, 그냥 통신문·안내장에 언어 낱말은 가정통신문', () => {
  for (const t of ['영어 캠프 안내 가정통신문 써 줘', '방과후 영어 교실 수강 신청 가정통신문', '중국 문화 체험 행사 안내장', '운영 가정통신문 써 줘', '러시아 문화 주간 안내 가정통신문']) sure(t, 'letter');
  for (const [t, lang] of [['가정통신문 베트남어로', 'vi'], ['영어로 된 가정통신문', 'en'], ['가정통신문 영문으로 바꿔 줘', 'en'], ['베트남어 번역본 만들어 줘', 'vi'],
    ['러시아어 가정통신문', 'ru'], ['중국어판 안내장', 'zh'], ['가정통신문 중국어 번역', 'zh']]) assert.equal(sure(t, 'translate').payload.lang, lang, t);
});
