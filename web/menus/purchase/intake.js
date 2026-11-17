/* 품의 「아무거나 넣기」: 엑셀·견적서 파일, 장바구니·견적 캡처, 대충 쓴 줄글 → 품목과 빈 칸 (스펙 4.0).
   줄글은 먼저 앱이 규칙으로 읽고, 못 읽은 줄이 있으면 AI가 글 전체를 읽음. 캡처는 AI. 주문자·주소·전화는 받지 않음 */
import * as ai from '../../core/ai.js';
import { emptyItem, findPersonal, toNumber, plainItemName, plainOfficial, PER_UNIT } from './rules.js';
import { readQuote } from './quote.js';
import { findItems, isTotalName, totalKey } from '../../core/sheet.js';
import { readText } from '../../core/files.js';
import { nameCell, staffName, MASK, maskContacts } from '../../core/privacy.js';

// 세는 말: 없는 말(「체육복 30벌」「간식 420인분」)은 수량 1로 읽혀 합계가 크게 줄었음. 「회·일·단」은 날짜·차례(「제3회」「12일」)와 헷갈려 넣지 않음
const UNITS = '박스|상자|개|권|자루|세트|장|통|묶음|팩|병|봉|봉지|EA|ea|Ea|명|인분|시간|차시|식|건|매|롤|켤레|벌|쌍|대|부|kg|g|L|ml|m|판|타|다스|캔|포|입|갑|곽|송이|다발|그루|마리|포기|줄|잔';
const QTY = new RegExp(`(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(${UNITS})(?![가-힣A-Za-z])`, 'g');
const blank = v => String(v == null ? '' : v).trim() === '';
const money = (n, man) => Math.round(Number(String(n).replace(/,/g, '')) * (man ? 10000 : 1));
/* 전화번호(휴대전화·지역번호)·이메일 모양 — AI 답에 있으면 그 글은 넣지 않음 */
const CONTACT = /(?:^|[^\d])01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)|(?:^|[^\d])0(?:2|[3-6]\d)[-.)\s]\d{3,4}[-.\s]\d{4}(?!\d)|[\w.+-]+@[\w-]+\.[\w.]+/;
export const hasContact = v => CONTACT.test(String(v == null ? '' : v));

/* 줄 하나 → { it, stated } 또는 null. stated: 「총 N원」으로 적은 금액(수량으로 나눠 단가를 냄) */
const WON = /([\d,]*\d(?:\.\d+)?)\s*(?:(만)\s*원|(만)(?![가-힣])|원)/g;
const MEASURE = /^(g|kg|ml|L|m|매|입|줄)$/; // 규격에 가까운 단위(100매·80g) — 포장 단위가 따로 있으면 수량이 아님
const SHIP = /^(배송비|택배비|운송비|배달비)$/;
/* 「알코올램프 10개 5,000원, 다음 주 화요일 과학실 실험」: 쉼표로 이은 조각 중 수량·금액이 없는 조각(일시·장소·목적)은 품명에서 뺌.
   숫자 속 쉼표(5,000)·괄호 속 쉼표(볼펜(검정, 빨강))는 나누지 않음. 일시·장소·목적은 AI가 넣기 글 전체에서 따로 채움 */
const hasNumber = p => new RegExp(QTY.source).test(p) || new RegExp(WON.source).test(p) || /[×xX*]\s*[\d,]+/.test(p) || /(?:^|\s)[\d,]{2,}\s*$/.test(p.trim());
/* 쉼표·쌍반점으로 나눈 조각(숫자 속·괄호 속 쉼표는 나누지 않음) */
function clauses(s) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{（'.includes(c)) depth++;
    else if (')]}）'.includes(c)) depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,，;]/.test(c) && !(/\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || ''))) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}
function dropContext(s) {
  const parts = clauses(s);
  if (parts.length < 2) return s;
  const keep = parts.filter(hasNumber);
  return keep.length && keep.length < parts.length ? keep.join(', ') : s;
}
/* 「천·백」이 든 한글 금액·「만」 뒤에 붙은 숫자 → 원: 「2만 5천원」「1만2천」→ 25000원·12000원, 「3천 500원」「2천5백원」→ 3500원·2500원,
   「1만 5000원」→ 15000원 (WON은 「2만(원)」만 읽어 「2만 5천원」이 2만 원·품명 「5천원」이 되고 「2천원」은 못 읽었음).
   「2만(원)」 하나는 그대로(WON이 읽음), 단위 뒤에(띄어 써도) 한글·영문이 오면(「3천명」「1백 명」「1천 장」) 금액 아님 */
const KO_UNIT = { 만: 10000, 천: 1000, 백: 100 };
const KO_AMT = /(\d+(?:\.\d+)?\s*[만천백](?:\s*\d+(?:\.\d+)?\s*[천백])*)(?:\s*(\d,\d{3}|\d{1,4})(?=\s*원))?(?:\s*원|(?!\s*[가-힣A-Za-z]))/g;
const koWon = s => String(s).replace(KO_AMT, (m, head, tail) => {
  const parts = [...head.matchAll(/(\d+(?:\.\d+)?)\s*([만천백])/g)];
  if (parts.length === 1 && !tail && parts[0][2] === '만') return m;
  let n = 0, last = Infinity;
  for (const [, v, u] of parts) { if (KO_UNIT[u] >= last) return m; last = KO_UNIT[u]; n += v * KO_UNIT[u]; }
  if (tail) { const t = +tail.replace(',', ''); if (t >= last) return m; n += t; }
  return `${Math.round(n)}원`;
});
function parseLine(raw) {
  // 줄 머리: 「-」「1.」「1)」「(1)」, 계획·공문에서 옮긴 「가.」「나)」「(다)」「①」(뒤에 빈칸이 올 때만 — 「가위」「나무」는 이름)
  let s = dropContext(String(raw).replace(/^\s*(?:[-•·*▪◦]|\d+[).]|\(\d+\)|[가-하][.)](?=\s)|\([가-하]\)|[①-⑳])\s*/, '').trim());
  if (!s) return null;
  let price = null, total = null;
  const tot = /(?:총|합계|전체)\s*(?:금액)?\s*:?\s*([\d,]+(?:\.\d+)?)\s*(만)?\s*원?/.exec(s);
  if (tot) { total = money(tot[1], tot[2]); s = s.replace(tot[0], ' '); }
  let amounts = null;
  // 총액이 있어도 같이 적은 단가(「개당 1,200원 총 12,000원」)는 품명에서 뺌(단가는 총액 ÷ 수량)
  if (total != null) for (const m of [...s.matchAll(WON)]) s = s.replace(m[0], ' ');
  if (total == null) {
    const wons = [...s.matchAll(WON)];
    const times = /[×xX*]\s*([\d,]+(?:\.\d+)?)\s*(만)?\s*원?/.exec(s);
    if (wons.length) {
      amounts = wons.map(m => money(m[1], m[2] || m[3]));
      price = amounts[amounts.length - 1];
      for (const m of wons) s = s.replace(m[0], ' ');
    } else if (times) { price = money(times[1], times[2]); s = s.replace(times[0], ' '); }
  }
  const qs = [...s.matchAll(QTY)];
  const pack = qs.filter(m => !MEASURE.test(m[2]));
  const q = (pack.length ? pack : qs).at(-1);
  let qty = 1, unit = '', spec = '';
  if (q) {
    qty = Number(String(q[1]).replace(/,/g, '')); unit = q[2];
    if (pack.length) spec = qs.filter(m => MEASURE.test(m[2])).map(m => m[0].replace(/\s+/g, '')).join(' ');
    for (const m of [...qs].reverse()) if (m === q || (pack.length && MEASURE.test(m[2]))) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  }
  if (price == null && total == null) {
    const bare = /(?:^|\s)([\d,]{2,})\s*$/.exec(s);
    if (bare) { price = money(bare[1]); s = s.slice(0, bare.index); }
  }
  if (total != null) price = Math.round(total / (qty || 1));
  // 「1,200원 = 12,000원」처럼 단가와 금액이 같이 있으면 단가
  if (amounts && amounts.length >= 2 && qty > 1) {
    const lo = Math.min(...amounts), hi = Math.max(...amounts);
    if (Math.abs(lo * qty - hi) <= Math.max(1, hi * 0.001)) price = lo;
  }
  // 「강사 시간당 5만원」「다과 1인당 5천원」처럼 수량이 없으면 「~당」의 단위를 단위 칸에(인 → 명). 「~당」 말은 품명에서 뺌(plainItemName)
  const per = new RegExp(`(?:^|\\s|\\()\\s*(?:\\d+\\s*)?(${PER_UNIT})\\s*당`).exec(s);
  if (!unit && per) unit = per[1] === '인' ? '명' : per[1];
  // 「내가 필요한 책」·「A4 용지 사주세요」 같은 1인칭·구어는 품명에서 뺌, 금액 뒤 「짜리」(「5천원짜리 공책」)도
  const name = plainItemName(s.replace(/[=@×*]|\(\s*\)|\[\s*\]/g, ' ').replace(/(^|\s)(?:x|X|각|개당|단가|금액|씩|짜리)(?=\s|$)/g, ' ')
    .replace(/(^|\s)[,，;]+(?=\s|$)/g, ' ').replace(/[,:\-–·]+\s*$/, '').replace(/\s+/g, ' ').trim());
  if (!name || price == null || !Number.isFinite(price)) return null;
  if (!unit && SHIP.test(name)) unit = '건';
  return { it: { ...emptyItem(), name, spec, unit, qty: String(qty), price: String(price) }, stated: total };
}

/* 「색종이 10묶음 3,000원, 풀 20개 500원」: 쉼표로 이은 조각 중 숫자가 있는 조각이 둘 이상이고 모두 품명과 금액을 갖춘 품목이면 조각마다 한 품목
   (한 품목으로 읽으면 앞 품목의 수량·단가가 사라져 합계가 틀렸음). 「A4 용지 5박스, 2만원」「간식 2,500원, 420명」처럼 품목 하나를 나눠 쓴 줄과
   숫자 없는 조각(일시·장소·목적)만 붙은 줄은 그대로 한 줄 */
function itemClauses(line) {
  const nums = clauses(line).filter(hasNumber);
  return nums.length >= 2 && nums.every(p => parseLine(p)) ? nums : [line];
}
/* 합계·소계·세액·할인만 적은 줄(「합계 36,000원」「총 결제금액: 78,000원」「계 1,140,000원」「합계 36,000원(VAT 포함)」「총액은 3만원 정도」):
   품목으로 읽으면 소요 예산에 합계가 한 번 더 들어갔음. 이름은 core/sheet.js isTotalName(견적서 표와 같은 말)으로 봄.
   합계·총액 → 총액 칸(total), 소계·공급가액·세액 → 버림(품목 금액에 이미 들어 있음, part), 할인·빼는 금액 → 못 읽은 줄(off — AI가 되면 할인 뒤 단가로 다시 읽음) */
const SUM_LINE = /^\s*(?:[-•·*▪◦]\s*|\d+[).]\s*|\(\d+\)\s*|[가-하][.)]\s+|\([가-하]\)\s*|[①-⑳]\s*)?((?:[^\d\n(（]|[(（][^)）\n]*[)）])*?)\s*(?:[:：=]|[-–](?!\d))?\s*([-−－](?=\d))?\s*([\d,]+(?:\.\d+)?)\s*(만)?\s*원?\s*(?:[(（][^)）\n]*[)）])?\s*(?:정도|쯤|가량|내외|이내|입니다|이에요|예요|임)?\s*[.。]?\s*$/;
function sumLine(line) {
  const m = SUM_LINE.exec(line);
  if (!m) return null;
  // 빼는 금액(「배송비 할인 -3,000원」「쿠폰 -2,000원」)은 사는 물품이 아님
  if (m[2]) return { kind: 'off' };
  if (!isTotalName(m[1])) return null;
  const k = totalKey(m[1]);
  const kind = /할인|쿠폰|적립|포인트/.test(k) ? 'off'
    : /공급|세액|부가세|부가가치세|VAT|소계/i.test(k) && !/포함|총계|총액|결제|합계금액/.test(k) ? 'part' : 'total';
  return { kind, amount: money(m[3], m[4]) };
}
export function parseLines(text) {
  const items = [], missed = [];
  let said = null, sum = 0, inexact = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    // 「₩3,000」「￦3,000」은 「3,000원」으로
    const line = koWon(raw.replace(/[₩￦]\s*(\d[\d,]*(?:\.\d+)?)/g, '$1원')), t = sumLine(line);
    if (t) { if (t.kind === 'total') said = t.amount; else if (t.kind === 'off') missed.push(raw.trim()); continue; }
    const parts = itemClauses(line);
    for (const part of parts) {
      const p = parseLine(part);
      if (!p || findPersonal(p.it.name)) { missed.push((parts.length > 1 ? part : raw).trim()); continue; }
      items.push(p.it);
      const q = toNumber(p.it.qty) || 1, amt = Math.round(q * toNumber(p.it.price));
      if (p.stated != null) { sum += p.stated; if (p.stated !== amt) inexact = true; } else sum += amt;
    }
  }
  // 「총 1만원」을 3개로 나누면 9,999원이 되니 적은 총액을 총액 칸에(확인 목록이 다르다고 알려 줌)
  const fields = said != null ? { total: String(said) } : inexact ? { total: String(sum) } : {};
  return { items, fields, missed };
}

/* 엑셀·한글 표에서 복사한 칸(탭으로 나뉜 글): 머리줄이 있으면 그 열대로, 없으면 칸 모양으로(글 = 품명·규격, 단위, 수 = 수량·단가·금액) */
const UNIT_CELL = new RegExp(`^(${UNITS})$`);
const NUM_CELL = /^[₩￦\\\s]*\d[\d,]*(?:\.\d+)?\s*원?$/;
function rowItem(cells) {
  const at = cells.findIndex(c => c && !NUM_CELL.test(c) && !UNIT_CELL.test(c));
  if (at < 0) return null;
  const rest = cells.slice(at + 1).filter(Boolean);
  const name = cells[at], texts = rest.filter(c => !NUM_CELL.test(c) && !UNIT_CELL.test(c));
  const unit = rest.find(c => UNIT_CELL.test(c)) || '', nums = rest.filter(c => NUM_CELL.test(c)).map(toNumber);
  if (!nums.length) return null;
  const [qty, price] = nums.length >= 2 ? [nums[0], nums[1]] : [1, nums[0]];
  return { ...emptyItem(), name, spec: texts[0] || '', unit, qty: String(qty > 0 ? qty : 1), price: String(Math.round(price)) };
}
export function tableItems(text) {
  const rows = String(text || '').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(c => c.trim()));
  const head = findItems(rows);
  if (head.length) return { items: head.map(it => ({ ...emptyItem(), name: it.name, spec: it.spec || '', unit: it.unit || '', qty: String(it.qty), price: String(it.price) })), fields: {}, missed: [] };
  const items = [], missed = [];
  for (const cells of rows) {
    const it = rowItem(cells);
    if (it && (TOTAL.test(it.name) || isTotalName(it.name))) continue;
    if (it) items.push(it); else missed.push(cells.filter(Boolean).join(' '));
  }
  return { items, fields: {}, missed };
}

export function intakePrompt(kind, text = '') {
  return ['[품의 넣기]',
    kind === 'image' ? '첨부한 이미지는 학교에서 물품을 사려고 찍은 장바구니·견적서·주문서 화면입니다.' : '아래 글은 선생님이 품의(물품 구입)를 쓰려고 대충 적은 메모입니다.',
    '사려는 물품을 줄마다 뽑습니다.',
    '- name: 상품 이름만 짧게(「내가 필요한」「제가 쓸」「사 주세요」 같은 1인칭·구어는 빼기), spec: 옵션·규격, unit: 수량 단위(개·박스·세트 등), qty: 수량(숫자), price: 1개를 실제로 결제하는 단가(할인 뒤, 숫자·쉼표 없이)',
    '- vendor: 판매처(쇼핑몰·업체 이름). 모르면 빈 글.',
    '- 배송비는 품목에 넣지 말고 shipping에 판매처별로 넣습니다(무료면 0).',
    '- 합계·소계·부가세·공급가액·할인 줄은 품목이 아닙니다.',
    '- fields: 글에 있을 때만 related(관련)·project(사업명)·purpose(목적)·target(대상)·date(일시)·place(장소)·budget(예산 과목). 없으면 빼고, 지어내지 않습니다.',
    '- related(관련): 넣은 것이 계획서·공문이면 그 문서 제목을 그대로(예: 2026학년도 학교폭력 예방 캠페인 운영 계획). purpose(목적)는 계획서면 그 「목적」 항목의 내용을 짧게 쓰고, 계획서 제목을 옮기지 않습니다.',
    '- 주문자·받는 사람 이름, 주소, 전화번호, 이메일, 결제 수단, 주민번호·계좌번호는 절대 쓰지 않습니다.',
    ...(kind === 'text' ? ['', '[메모]', String(text).slice(0, 8000)] : []),
    '', '[출력] JSON 하나만 출력합니다.',
    '{"items":[{"name":"…","spec":"","unit":"개","qty":1,"price":0,"vendor":""}],"shipping":[{"vendor":"","fee":0}],"fields":{"purpose":"…"}}'].join('\n');
}

const FIELDS = ['related', 'project', 'purpose', 'target', 'date', 'place', 'budget'];
const TOTAL = /^(합\s*계|소\s*계|부\s*가\s*세|공급\s*가|할인|총\s*(결제|금액))/;

/* 넣은 글이 계획서면 → { related(계획서 제목), purpose(「목적」 항목의 첫 내용) }, 아니면 {}.
   품의 사유 첫 문장이 계획서 제목을 그대로 따라 쓰지 않게: 제목은 「1. 관련:」 줄로, 계획서의 목적은 목적 칸으로(초안 AI가 첫 문장에 씀).
   제목: 앞 네 줄 안에서 「… 계획(서)(안)」으로 끝나는 짧은 줄(금액·수량이 든 줄은 아님 — 「수업 계획에 쓸 색종이 3000원」) */
const PLAN_TITLE = /계획\s*서?\s*(?:\(\s*안\s*\))?$/;
const HEAD_NO = /^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.?|\d+\s*[.)]|\(\d+\)|[가-하]\s*[.)]|\([가-하]\)|[○●◦▪■□◆◇※·•\-–*])\s*/;
const PURPOSE = /^목\s*적\s*(?:[:：]\s*(.*))?$/;
const tidyLine = s => String(s || '').replace(HEAD_NO, '').replace(/[.。]\s*$/, '').trim().slice(0, 120);
export function planHead(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s*\|\s*/g, ' ').trim()).filter(Boolean);
  const ti = lines.slice(0, 4).findIndex(l => l.length <= 60 && PLAN_TITLE.test(l.replace(/^[<「『【\[]+|[>」』】\]]+$/g, '').trim()) && !/\d\s*(?:원|개)/.test(l));
  if (ti < 0) return {};
  const out = { related: lines[ti].replace(/^[<「『【\[]+|[>」』】\]]+$/g, '').trim() };
  for (let i = ti + 1; i < lines.length; i++) {
    const m = PURPOSE.exec(lines[i].replace(HEAD_NO, ''));
    if (!m) continue;
    // 「1. 목적: …」 한 줄, 아니면 바로 다음 줄(「가. …」「- …」) — 다음 줄이 다른 큰 항목(「2. 일시: …」)이면 목적 없음
    const body = m[1] && m[1].trim() ? m[1] : (lines[i + 1] && !/^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.?|\d+\s*[.)])\s*\S/.test(lines[i + 1]) ? lines[i + 1] : '');
    if (tidyLine(body)) out.purpose = tidyLine(body);
    break;
  }
  return out;
}
const str = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);
const listOf = (v, k) => (v && Array.isArray(v[k]) ? v[k] : []);

/* AI 답 다듬기: 모양 틀린 것·개인정보 모양은 버리고, 칸은 6개만. 전화번호·이메일이 든 글도 버리고 수(dropped)를 셈.
   캡처(kind 'image')의 장소는 받는 곳 주소일 수 있어 받지 않음 */
export function normIntake(v, kind = 'text') {
  let dropped = 0;
  const bad = t => findPersonal(t) || hasContact(t);
  const items = [];
  for (const x of listOf(v, 'items')) {
    if (!(x && typeof x === 'object') || blank(x.name) || TOTAL.test(str(x.name)) || isTotalName(x.name)) continue;
    const it = { name: plainItemName(str(x.name, 120)), spec: str(x.spec, 80), unit: str(x.unit, 10), qty: String(toNumber(x.qty) > 0 ? toNumber(x.qty) : 1), price: String(Math.max(0, Math.round(toNumber(x.price)))), vendor: str(x.vendor, 40) };
    if (bad(it.name) || ['spec', 'unit', 'vendor'].some(k => findPersonal(it[k]))) { dropped++; continue; }
    for (const k of ['spec', 'unit', 'vendor']) if (hasContact(it[k])) { it[k] = ''; dropped++; }
    items.push(it);
  }
  const shipping = listOf(v, 'shipping').filter(x => x && typeof x === 'object').map(x => ({ vendor: hasContact(x.vendor) ? '' : str(x.vendor, 40), fee: Math.max(0, Math.round(toNumber(x.fee))) }));
  // AI가 배송비를 품목(items)에도 넣고 배송비(shipping)에도 넣으면 두 번 더해졌음: 같은 판매처(한쪽이 비어도)·같은 금액인 배송비 품목은 뺌(배송비 줄 하나만)
  for (const s of shipping) {
    if (!(s.fee > 0)) continue;
    const i = items.findIndex(it => SHIP.test(it.name.replace(/\s/g, '')) && Math.round(toNumber(it.qty) * toNumber(it.price)) === s.fee
      && (!(it.vendor || it.spec) || !s.vendor || (it.vendor || it.spec) === s.vendor));
    if (i >= 0) items.splice(i, 1);
  }
  const fields = {};
  const f = v && v.fields && typeof v.fields === 'object' ? v.fields : {};
  for (const k of FIELDS) {
    const t = str(f[k]);
    if (!t || (k === 'place' && kind === 'image')) continue;
    if (bad(t)) { dropped++; continue; }
    fields[k] = k === 'project' || k === 'purpose' ? plainOfficial(t) : t;
  }
  return { items, shipping, fields, ...(dropped ? { dropped } : {}) };
}

/* 배송비 → 품목 줄(0원·무료는 빼고) */
export const shippingItems = shipping => (shipping || []).filter(s => s && toNumber(s.fee) > 0)
  .map(s => ({ ...emptyItem(), name: '배송비', spec: str(s.vendor, 40), unit: '건', qty: '1', price: String(Math.round(toNumber(s.fee))), vendor: str(s.vendor, 40) }));

/* 빈 칸만 채움 (선생님이 쓴 칸은 그대로). 총액은 줄글의 합계 줄에서만 옴 */
export function fillEmpty(form, fields) {
  const out = { ...form };
  for (const k of [...FIELDS, 'total']) if (fields && !blank(fields[k]) && blank(out[k])) out[k] = fields[k];
  return out;
}
/* [바꾸기]: 예전 품의의 글 칸(관련·사업명·목적·일시·대상·장소·예산 과목·총액·메모)과 「AI가 채움」 표시는 지우고 새로 읽은 칸만 넣음.
   종류·부가세·소득 구분·붙임 같은 설정은 그대로(품목은 mergeItems 'replace') */
const CONTENT = [...FIELDS, 'total', 'memo'];
export function replaceForm(form, fields) {
  const out = { ...form, budgetUnknown: false, guessed: [] };
  for (const k of CONTENT) out[k] = '';
  return fillEmpty(out, fields);
}

const emptyRow = x => !x || ['name', 'spec', 'qty', 'price'].every(k => blank(x[k]));
export function mergeItems(items, add, how) {
  if (how === 'replace') return add.length ? add.slice() : [emptyItem()];
  const out = (items || []).slice();
  for (const it of add) { const i = out.findIndex(emptyRow); if (i >= 0) out[i] = it; else out.push(it); }
  return out;
}

const vendorOf = it => str(it.vendor) || (str(it.name) === '배송비' ? str(it.spec) : '');
export function vendorsOf(items) {
  const out = [];
  for (const it of items || []) { const v = vendorOf(it); if (v && !out.includes(v)) out.push(v); }
  return out;
}
/* 구입처별로 품의 나누기: 첫 구입처(와 구입처 없는 품목)가 [0] */
export function splitByVendor(form) {
  const vs = vendorsOf(form.items);
  if (vs.length < 2) return [form];
  return vs.map((v, i) => ({ ...form, items: form.items.filter(it => (vendorOf(it) || (i === 0 ? v : '')) === v && !emptyRow(it)) }));
}

/* AI로 보내는 글의 사람 이름: 「김철수 강사」「이영희 선생님」 → 「○○○ 강사」, 「강사 김철수」「외부강사: 박하늘」 → 「강사 ○○○」.
   이름 모양(흔한 성 + 세 글자, 두 글자 성 + 두 글자)만 가림 — 「담임교사」「체육 강사님」은 그대로 */
const ROLE_AFTER = /(^|[^가-힣])([가-힣]{3,4})(\s*)(강사님|강사|선생님|선생|교수님|교수|교사|님|씨)(?=[^가-힣]|$|께|이|가|은|는|을|를|의|과|와)/g;
const ROLE_BEFORE = /(강사님?|선생님|교수님?|교사)(\s*[:：]\s*|\s+)([가-힣]{3,4})(?![가-힣])/g;
/* 학생·보호자 이름도: 「김하늘 학생」「한가람 학생의」「이바다 어머니」「학생 이바다」 → ○○○ (학생 이름은 AI로 보내지 않음).
   「성실한·신청한 학생」 같은 꾸미는 말, 「학생 인솔비」 같은 「~비·~회·~생」 낱말은 이름이 아님(core/privacy.js의 홀로 쓴 이름 규칙과 같게) */
const KIN_AFTER = /(^|[^가-힣○])([가-힣]{2,4})(\s*)(학생|학부모|어머니|어머님|아버지|아버님|부모님|보호자)(?=$|[^가-힣]|[은는이가을를과와의에도께랑만한님])/g;
const KIN_BEFORE = /((?:학생|학부모|보호자)(?:\s*[:：]\s*|\s+))([가-힣]{3,4})(?![가-힣])/g;
const NOT_NAME_END = /[도감력화회권별제법실부생들표단방작비장품물집책판함증점식터반란이가는을를의에만와과로한할된던운간친른막움님기상왕년자]$/;
// 성씨 글자로 시작하지만 이름이 아닌 낱말(「유치원 학부모」「학생 한마당」「이번주 학생」 — 「~원」은 김지원 같은 이름이 있어 끝 글자로 거르지 않음)
const KIN_WORD = new Set(['유치원', '한마당', '인원수', '문화원', '이번주', '이번달', '지난주', '지난달', '정원외', '장학금', '마스크', '안전모', '전학년', '한학기', '기숙사', '도서관']);
// 두 글자는 「김솔 학생」처럼 이름 뒤에서만, 흔한 낱말(전체·우수·장애·전학 학생 …)은 빼고
const KIN_TWO = new Set(['장애', '전학', '임원', '도움', '소수', '육상', '진급', '우수', '신입', '모범', '유학', '지각', '조퇴', '정원', '구매', '해당', '대상', '참가', '희망', '일반', '수상', '입상', '선수', '부진', '결석', '탈북', '귀국', '다문', '저소', '위기', '관심', '상담', '교내', '교외', '기숙', '통학', '도보', '급식', '방학', '학년', '학급', '체험', '참여', '모집', '선착', '신청', '지역', '마을', '인근', '근처', '소속', '재학', '졸업', '입학', '예비', '성인', '학부', '한반']);
const kinName = n => !KIN_WORD.has(n) && (n.length === 2 ? staffName(n) && !KIN_TWO.has(n) : nameCell(n) && !NOT_NAME_END.test(n));
export const maskNames = t => String(t || '')
  .replace(ROLE_AFTER, (m, pre, n, sp, role) => (nameCell(n) ? `${pre}${MASK}${sp || ' '}${role}` : m))
  .replace(ROLE_BEFORE, (m, role, sp, n) => (nameCell(n) ? `${role}${sp}${MASK}` : m))
  .replace(KIN_AFTER, (m, pre, n, sp, who) => (kinName(n) ? `${pre}${MASK}${sp || ' '}${who}` : m))
  .replace(KIN_BEFORE, (m, pre, n) => (kinName(n) ? `${pre}${MASK}` : m));

/* 넣기: { text } | { file } → { items(배송비 줄 포함), fields, by: 'rule'|'table'|'ai', missed }
   noAI: 강사 수당 품의 — 글은 앱 규칙으로만 읽고, 그림·글 없는 PDF는 읽지 않음(강사 이름이 AI로 가지 않게) */
const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
async function aiRead(kind, { images, text } = {}) {
  const v = await ai.generateJSON(intakePrompt(kind, text), { images, task: 'purchase', valid: x => normIntake(x, kind).items.length > 0 });
  const r = normIntake(v, kind);
  return { items: [...r.items, ...shippingItems(r.shipping)], fields: r.fields, by: 'ai', missed: [], dropped: r.dropped || 0 };
}
export async function readIntake({ text, file, noAI = false } = {}) {
  if (file) {
    // 글 파일은 줄글로(탭으로 나뉜 표면 표로)
    if (/\.txt$/i.test(String(file.name || ''))) return readIntake({ text: await readText(file), noAI });
    const isImage = IMAGE.test(String(file.name || '')) || /^image\//.test(String(file.type || ''));
    if (isImage) {
      if (noAI) throw { code: 'NO_AI_LECTURER' };
      if (!ai.ready()) throw { code: 'NO_AI' };
      return aiRead('image', { images: await window.SSAM.files.toImages(file) });
    }
    const q = await readQuote(file, { aiRead: images => { if (noAI) throw { code: 'NO_AI_LECTURER' }; return aiRead('image', { images }); } });
    if (q.by === 'ai' && q.fields) return q;
    // 품명·단가 머리줄이 없는(「물품·가격」처럼 다른 이름인) 엑셀·CSV 표, 한글 파일의 표(칸은 「 | 」)·줄글 목록: 칸 모양·줄글 규칙으로 읽음.
    // 견적서가 아닌 파일(명단 등)을 잘못 넣어도 이름이 가지 않게 AI로는 보내지 않음
    if (!q.items.length && /\.(hwpx?|xlsx|csv)$/i.test(String(file.name || ''))) return readIntake({ text: (await readText(file)).replace(/[ \t]*\|[ \t]*/g, '\t'), noAI: true });
    // 한글·PDF 계획서를 넣으면 표의 품목과 함께 계획서 제목(관련)·목적(planHead)
    const head = /\.(hwpx?|pdf)$/i.test(String(file.name || '')) ? await readText(file).then(planHead, () => ({})) : {};
    return { items: q.items.map(it => ({ ...emptyItem(), name: it.name, spec: it.spec || '', unit: it.unit || '', qty: String(it.qty), price: String(it.price), vendor: it.vendor || '' })), fields: { ...(q.fields || {}), ...head }, by: q.by, missed: [] };
  }
  // 주민번호·계좌 모양이 있는 줄은 읽지 않고(AI로도 보내지 않음) 수만 알려 줌
  const lines = String(text || '').split(/\r?\n/);
  const personal = lines.filter(l => findPersonal(l)).length;
  const safe = lines.filter(l => !findPersonal(l)).join('\n');
  // 계획서 글이면 제목(관련)·목적은 글에 적힌 그대로(AI가 읽은 칸보다 앞섬 — AI는 제목을 목적에 옮기곤 함)
  const head = planHead(safe), withHead = r => ({ ...r, fields: { ...(r.fields || {}), ...head } });
  if (safe.includes('\t')) {
    const t = tableItems(safe);
    if (t.items.length) return withHead({ ...t, by: 'table', personal });
  }
  const r = parseLines(safe);
  if (r.missed.length && !noAI && ai.ready()) {
    // 전화번호·이메일은 그 자리만 가려 보냄(업체 담당·문의 줄의 다른 글은 남김 — 초안 AI와 같게 연락처는 보내지 않음)
    try { return withHead({ ...(await aiRead('text', { text: maskContacts(maskNames(safe)) })), personal }); }
    catch (e) { if (!r.items.length) throw e; }
  }
  return withHead({ ...r, by: 'rule', personal });
}
