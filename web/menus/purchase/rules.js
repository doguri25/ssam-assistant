/* 품의 계산·점검 규칙 (화면 없음 — Node 시험에서도 씀).
   금액은 원 단위 정수. 품의 사유의 가~라 줄과 산출 내역 숫자는 AI가 아니라 여기서 만든다 */

const ex = (project, purpose, date, target, place, items) => ({ project, purpose, date, target, place, items: items.map(([name, spec, qty, price]) => ({ name, spec, qty, price })) });

/* 예시는 모두 지어낸 것 */
export const TYPES = [
  { id: 'goods', label: '물품 구입', hint: '수업·업무에 쓸 물품을 살 때 써요. 견적서를 올리면 품목 표가 채워져요.',
    example: ex('5학년 과학 실험 재료 구입', '용해와 용액 단원 모둠 실험', '2026-11-10', '5학년 4개 반 학생 100명', '과학실',
      [['비커', '500ml', 8, 4500], ['유리 막대', '30cm', 8, 1200], ['전자저울', '0.1g 단위', 4, 23000]]) },
  { id: 'lecturer', label: '강사 수당', hint: '외부 강사를 부를 때 써요. 주민번호·계좌번호는 넣지 않아요(행정실에서 따로 받아요).',
    example: ex('진로 체험 특강', '직업 세계 이해와 진로 탐색', '2026-11-18 5~6교시', '6학년 학생 90명', '시청각실',
      [['강사 수당(외부 강사)', '2시간', 1, 200000]]) },
  { id: 'event', label: '행사 운영', hint: '학교 행사를 운영할 때 써요. 행사계획에서 「품의로 이어 가기」를 누르면 칸이 채워져요.',
    example: ex('가을 학교 축제', '학생 자치 역량 강화와 공동체 의식 함양', '2026-11-20', '전교생 420명', '운동장·강당',
      [['현수막', '5m×0.9m', 2, 45000], ['체험 부스 재료 꾸러미', '부스당 1세트', 12, 30000], ['간식', '1인분', 420, 2500]]) },
  { id: 'meeting', label: '협의회', hint: '협의회·교내 연수 운영비를 쓸 때 써요.',
    example: ex('학년 교육과정 협의회', '2학기 평가 계획 협의', '2026-11-12 15:00', '5학년 담임 교사 4명', '5학년 연구실',
      [['다과', '1인분', 4, 8000], ['자료 인쇄', 'A4 컬러', 40, 300]]) }
];

export const emptyItem = () => ({ name: '', spec: '', qty: '', price: '' });

export function emptyForm(type = 'goods') {
  return { type, project: '', purpose: '', date: '', target: '', place: '', budget: '', budgetUnknown: false, total: '', memo: '', items: [emptyItem()] };
}

const blank = v => String(v == null ? '' : v).trim() === '';
const won = n => Number(n).toLocaleString('ko-KR');

/* 「12,000원」「 2.5 」 → 숫자. 못 읽으면 0 */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v == null ? '' : v).replace(/[,\s원₩]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export const itemAmount = it => Math.round(toNumber(it.qty) * toNumber(it.price));

/* 품명이 빈 줄은 빼고, 수량 빈칸은 1 */
export function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter(it => it && !blank(it.name))
    .map(it => ({ ...it, name: String(it.name).trim(), spec: String(it.spec == null ? '' : it.spec).trim(), qty: blank(it.qty) ? 1 : it.qty }));
}

export const sumItems = items => cleanItems(items).reduce((s, it) => s + itemAmount(it), 0);

/* 개인정보 모양: 주민번호(6자리-7자리), 계좌번호(은행 이름 + 숫자 10~16개).
   「우리·하나·기업」처럼 흔한 말은 「은행」이 붙어야 은행으로 봄. 휴대전화 번호는 계좌로 보지 않음 */
const RRN = /\d{6}\s*-\s*\d{7}/;
const BANK = /은행|국민|신한|농협|카카오뱅크|토스뱅크|케이뱅크|우체국|새마을금고|신협|수협|SC제일|씨티|KB|NH|IBK/i;
const PHONE = /^01[016-9]-?\d{3,4}-?\d{4}$/;
export function findPersonal(text) {
  const s = String(text == null ? '' : text);
  if (RRN.test(s)) return 'rrn';
  if (BANK.test(s)) {
    for (const tok of s.match(/\d[\d-]*\d/g) || []) {
      const digits = tok.replace(/-/g, '').length;
      if (digits >= 10 && digits <= 16 && !PHONE.test(tok)) return 'account';
    }
  }
  return null;
}

const TEXT_FIELDS = ['project', 'purpose', 'date', 'target', 'place', 'budget', 'memo'];

/* 확인 목록 (P-6·P-7). missing·personal은 칸 이름 */
export function checkPurchase(form, { limit } = {}) {
  const f = form || {};
  const items = cleanItems(f.items);
  const missing = ['purpose', 'date', 'target'].filter(k => blank(f[k]));
  if (!items.length) missing.push('items');
  const personal = TEXT_FIELDS.filter(k => findPersonal(f[k]));
  if ((Array.isArray(f.items) ? f.items : []).some(it => it && (findPersonal(it.name) || findPersonal(it.spec)))) personal.push('items');
  const total = sumItems(f.items);
  const warnings = [], oks = [];
  if (!blank(f.total)) {
    const want = toNumber(f.total);
    if (want !== total) warnings.push(`품목 금액의 합(${won(total)}원)과 총액(${won(want)}원)이 달라요`);
    else oks.push('품목 금액의 합과 총액이 같아요');
  }
  if (f.budgetUnknown || blank(f.budget)) warnings.push('예산 과목 · 행정실 확인 필요');
  if (limit > 0 && total > limit) warnings.push(`별도 계약 절차 확인 필요 (합계 ${won(total)}원 > 기준 ${won(limit)}원)`);
  if (!personal.length) oks.push('주민번호·계좌번호가 들어 있지 않아요');
  return { missing, personal, warnings, oks, total, canDraft: !missing.length && !personal.length };
}

/* 산출 내역을 탭으로 나눈 글로 (에듀파인·엑셀에 붙여넣기). 숫자는 쉼표 없이 */
export function itemsTSV(items) {
  const rows = cleanItems(items).map(it => [it.name, it.spec, toNumber(it.qty), toNumber(it.price), itemAmount(it)].join('\t'));
  return ['품명\t규격\t수량\t단가\t금액', ...rows, `합계\t\t\t\t${sumItems(items)}`].join('\n');
}

/* 품의 사유: 첫 문장 + 가. 목적 / 나. 일시 / 다. 대상 / 라. 장소(있을 때) */
export function composeReason({ intro, purpose, date, target, place }) {
  const lines = [['가', '목적', purpose], ['나', '일시', date], ['다', '대상', target], ['라', '장소', place]]
    .filter(([, , v]) => !blank(v)).map(([k, l, v]) => `${k}. ${l}: ${String(v).trim()}`);
  return `${String(intro || '').trim()}\n\n${lines.join('\n')}`;
}

/* 한글 파일(.hwpx)로 내보낼 문서: 제목, 1. 품의 사유, 2. 산출 내역 표, 예산 과목 */
export function purchaseDoc(form, draft) {
  const f = form || {}, d = draft || {};
  const items = cleanItems(f.items);
  const rows = [['품명', '규격', '수량', '단가', '금액'],
    ...items.map(it => [it.name, it.spec, String(toNumber(it.qty)), won(toNumber(it.price)), won(itemAmount(it))]),
    ['합계', '', '', '', won(sumItems(f.items))]];
  const budget = f.budgetUnknown || blank(f.budget) ? '행정실 확인 필요' : String(f.budget).trim();
  return {
    title: String(d.title || f.project || '품의').trim(),
    blocks: [
      { type: 'h', text: '1. 품의 사유' }, { type: 'p', text: d.reason || '' },
      { type: 'h', text: '2. 산출 내역' }, { type: 'table', head: true, rows },
      { type: 'p', text: `예산 과목: ${budget}` }
    ]
  };
}
