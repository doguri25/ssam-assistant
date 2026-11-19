/* 품의 「아무거나 넣기」: 엑셀·견적서 파일, 장바구니·견적 캡처, 대충 쓴 줄글 → 품목과 빈 칸 (스펙 4.0).
   줄글은 먼저 앱이 규칙으로 읽고, 못 읽은 줄이 있으면 AI가 글 전체를 읽음. 캡처는 AI. 주문자·주소·전화는 받지 않음 */
import * as ai from '../../core/ai.js';
import { emptyItem, findPersonal, toNumber, plainItemName, plainOfficial, PER_UNIT } from './rules.js';
import { readQuote } from './quote.js';
import { findItems, isTotalName, totalKey } from '../../core/sheet.js';
import { readText } from '../../core/files.js';
import { nameCell, staffName, MASK, maskContacts, peopleNames, RRN_RE } from '../../core/privacy.js';
import { makeRedactor } from '../../core/redact.js';
import { maskPersons, GIVEN } from '../../core/chat-names.js';

// 세는 말: 없는 말(「체육복 30벌」「간식 420인분」)은 수량 1로 읽혀 합계가 크게 줄었음. 「회·일·단」은 날짜·차례(「제3회」「12일」)와 헷갈려 넣지 않음
const UNITS = '박스|상자|개|권|자루|세트|장|통|묶음|팩|병|봉|봉지|EA|ea|Ea|명|인분|시간|차시|식|건|매|롤|켤레|벌|쌍|대|부|kg|g|L|ml|m|판|타|다스|캔|포|입|갑|곽|송이|다발|그루|마리|포기|줄|잔|BOX|Box|box|SET|Set|set|PCS|Pcs|pcs|포대|덩이';
const QTY = new RegExp(`(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(${UNITS})(?![가-힣A-Za-z])`, 'g');
const blank = v => String(v == null ? '' : v).trim() === '';
const money = (n, man) => Math.round(Number(String(n).replace(/,/g, '')) * (man ? 10000 : 1));
/* 전화번호(휴대전화·지역번호)·이메일 모양 — AI 답에 있으면 그 글은 넣지 않음 */
const CONTACT = /(?:^|[^\d])01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)|(?:^|[^\d])0(?:2|[3-6]\d)[-.)\s]\d{3,4}[-.\s]\d{4}(?!\d)|[\w.+-]+@[\w-]+\.[\w.]+/;
export const hasContact = v => CONTACT.test(String(v == null ? '' : v));

/* 산출 근거 꼴 「품명 단가원*수량단위(*수량단위)=금액원」 → 품목들(2026-11-17 선생님: 계획서 예산 표의 산출 근거 칸).
   한 칸·한 줄에 여러 개(「인화지 37,000원*8개=296,000원 전시 용품 11,000원*31학급=341,000원」)도 나눔. 단위는 아무 말이나(학급·식·세트).
   글이 이 꼴로만 되어 있을 때만(남는 글에 숫자가 없을 때) 품목들, 아니면 null. 품명이 없으면(「4,500원×8개=36,000원」) name(줄의 품명) */
// 단가 뒤 「원」은 없어도 됨(「간식 2,500×120명=300,000원」 — 계획서·메모에 흔함. 예전에는 끝 금액을 단가로 읽어 합계가 120배가 됐음).
// 「원」이 없으면 단가 × 수량(× 수량)이 끝 금액과 맞을 때만(「5×0.9m=45,000원」 같은 규격은 아님)
const BASIS = /(?:([^\s=][^=]*?)\s*)?(?<![\d,.])(\d[\d,]*)\s*(원\s*)?[*×xX✕]\s*(\d[\d,]*(?:\.\d+)?)\s*([가-힣A-Za-z]{0,4})\s*(?:[*×xX✕]\s*(\d[\d,]*(?:\.\d+)?)\s*([가-힣A-Za-z]{0,4})\s*)?=\s*(\d[\d,]*)\s*원/g;
const LEAD = /^[\s,·•\-–/:;+]+|[\s,·:;+]+$/g;
const SIZE = /^\d[\d.,]*\s*(?:ml|mL|L|l|g|kg|mm|cm|m|인치|매|장|호|평)?$/;
export function basisItems(text, name = '') {
  const s = String(text || ''), out = [];
  let left = s;
  for (const m of s.matchAll(BASIS)) {
    // 앞 글이 「500ml」「30cm」 같은 크기뿐이면 품명이 아니라 규격(품명은 줄의 품명)
    const own = String(m[1] || '').replace(LEAD, '').trim(), size = SIZE.test(own);
    const nm = /[가-힣A-Za-z]/.test(own) && !size ? own : String(name || '').trim();
    if (!/[가-힣A-Za-z]/.test(nm)) return null;
    const p = toNumber(m[2]), q1 = toNumber(m[4]), q2 = m[6] ? toNumber(m[6]) : null, times = q2 ? `${m[4]}${m[5]}×${m[6]}${m[7]}` : '';
    if (!m[3]) { const t = toNumber(m[8]), got = p * q1 * (q2 || 1); if (!(t > 0) || Math.abs(got - t) > Math.max(1, t * 0.001)) return null; }
    out.push({ ...emptyItem(), name: plainItemName(nm), spec: [size ? own : '', times].filter(Boolean).join(' '), unit: q2 ? '' : m[5], qty: String((q2 ? q1 * q2 : q1) || 1), price: String(Math.round(p)) });
    left = left.replace(m[0], ' ');
  }
  return out.length && !/\d/.test(left) ? out : null;
}
/* 표·AI가 읽은 품목 가운데 규격(또는 품명) 칸이 산출 근거 꼴이면 그 안의 품목들로 바꿈.
   계획서 예산 표 「항목 | 산출 근거 | 금액」을 읽으면 항목이 품명, 산출 근거 전체가 규격에 들어갔었음(머리줄을 찾으면 산출 근거는 버렸음).
   basis: 표 머리줄이 「산출 근거」인 칸(core/sheet.js findItems) */
export const splitBasis = items => (items || []).flatMap(it => {
  if (!it) return [];
  const { basis, ...row } = it;
  const b = basisItems(basis, row.name) || basisItems(row.spec, row.name) || (blank(row.spec) ? basisItems(row.name) : null);
  return b ? b.map(x => ({ ...x, vendor: String(row.vendor || '') })) : [row];
});

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
/* 크기(「5m×0.9m」「60×180cm」「120x60x75cm」): 규격 하나로 떼어 냄. 예전에는 크기 낱말만 규격으로 뽑고 남은 「( × )」가 품명에 남았고(「현수막( )」),
   수량이 따로 없으면 「0.9m」를 수량으로 읽어 합계가 틀렸음(45,000원 → 40,500원) */
const DIM = /(?<![\d.,])(?:\d[\d,]*(?:\.\d+)?\s*(?:mm|cm|m)?\s*[×xX*✕]\s*)+\d[\d,]*(?:\.\d+)?\s*(?:mm|cm|m)(?![A-Za-z가-힣])/;
/* 단가 뒤 「원」 없이 곱한 수(「다과 5,000×20명」「색연필 @1,000 x 10개」 — × 뒤 수에 세는 말): × 앞 수가 단가, × 뒤가 수량.
   예전에는 × 뒤 수를 단가로 읽어(20원 × 5,000명) 산출 근거 글이 틀렸음 */
const BARE_PQ = new RegExp(`(^|[\\s@(（:：])@?\\s*(\\d[\\d,]*)\\s*[×xX*✕]\\s*(?=((?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?))\\s*(?:${UNITS})(?![가-힣A-Za-z]))`);
const near = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.001);
function parseLine(raw) {
  // 줄 머리: 「-」「1.」「1)」「(1)」, 계획·공문에서 옮긴 「가.」「나)」「(다)」「①」(뒤에 빈칸이 올 때만 — 「가위」「나무」는 이름)
  let s = dropContext(String(raw).replace(/^\s*(?:[-•·*▪◦]|\d+[).]|\(\d+\)|[가-하][.)](?=\s)|\([가-하]\)|[①-⑳])\s*/, '').trim());
  if (!s) return null;
  let dims = '';
  const dm = DIM.exec(s);
  if (dm) { dims = dm[0].replace(/\s+/g, '').replace(/[xX*✕]/g, '×'); s = `${s.slice(0, dm.index)} ${s.slice(dm.index + dm[0].length)}`; }
  let price = null, total = null, bareP = null;
  const bp = BARE_PQ.exec(s);
  if (bp) {
    // 「간식 2,500×120명=300,000원」(쉼표로 이은 조각 안에서도): 산출 근거 꼴로 읽음
    const b = basisItems(s);
    if (b && b.length === 1) return { it: { ...b[0], spec: [dims, b[0].spec].filter(Boolean).join(' ') }, stated: null };
    const p0 = toNumber(bp[2]), q0 = toNumber(bp[3]), eq = /=\s*(\d[\d,]*)\s*(?:원(?![가-힣]))?/.exec(s);
    const wons = [...s.slice(0, eq ? eq.index : s.length).matchAll(WON)].map(m => money(m[1], m[2] || m[3]));
    // 단가 × 수량이 적은 금액과 맞지 않으면(「… = 310,000원」) 어느 수가 단가인지 몰라 못 읽은 줄로(AI·선생님이 봄)
    if (eq && !near(p0 * q0, toNumber(eq[1]))) return null;
    if (wons.length && !wons.some(w => near(p0 * q0, w) || near(p0, w))) return null;
    if (p0 >= 10) {
      bareP = p0;
      if (eq) s = s.slice(0, eq.index) + ' ' + s.slice(eq.index + eq[0].length);
      s = s.slice(0, bp.index) + bp[1].replace(/@/g, ' ') + ' ' + s.slice(bp.index + bp[0].length);
    }
  }
  // 「볼펜 총 30자루 15,000원」: 수량 앞 「총」은 모두 합한 수량(총액이 아님) — 그 줄에 금액이 하나면 그 금액이 총액(단가 = 금액 ÷ 수량)
  // 「간식 전체 420명 2,500원」의 「전체」는 수량을 꾸미는 말(총액도, 모두 합한 수량도 아님 — 2,500원은 단가)이라 빼기만 함
  const all = new RegExp(`(?:^|\\s)총\\s*(?=(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})(?![가-힣A-Za-z]))`).exec(s);
  if (all) s = `${s.slice(0, all.index)} ${s.slice(all.index + all[0].length)}`;
  s = s.replace(new RegExp(`(^|\\s)전체\\s*(?=(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})(?![가-힣A-Za-z]))`), '$1');
  // 총액 뒤에 세는 말(「합계 420명」)이 오면 총액이 아님
  const tot = new RegExp(`(?:총|합계|전체)\\s*(?:금액)?\\s*:?\\s*([\\d,]+(?:\\.\\d+)?)(?![\\d,.]|\\s*(?:${UNITS})(?![가-힣A-Za-z]))\\s*(만)?\\s*원?`).exec(s);
  if (tot) { total = money(tot[1], tot[2]); s = s.replace(tot[0], ' '); }
  let amounts = null, times0 = 0;
  // 총액이 있어도 같이 적은 단가(「개당 1,200원 총 12,000원」)는 품명에서 뺌(단가는 총액 ÷ 수량)
  if (total != null) for (const m of [...s.matchAll(WON)]) s = s.replace(m[0], ' ');
  if (total == null) {
    const wons = [...s.matchAll(WON)];
    // × 뒤 수에 세는 말이 붙으면(「×20명」) 단가가 아니라 수량(QTY가 읽음)
    const times = new RegExp(`[×xX*]\\s*([\\d,]+(?:\\.\\d+)?)(?![\\d,.])(?!\\s*(?:${UNITS})(?![가-힣A-Za-z]))\\s*(만)?\\s*원?`).exec(s);
    if (bareP != null) { for (const m of wons) s = s.replace(m[0], ' '); price = bareP; }
    else if (wons.length) {
      // 「현수막 45,000원 × 2」「현수막 2 × 45,000원」: 세는 말 없이 금액에 바로 곱한 수(금액 바로 뒤·앞만 — 「30x40」「30 x 40」 같은 규격은 아님)
      const ta = /(원)\s*[×xX*✕]\s*(\d[\d,]*(?:\.\d+)?)(?![\d,.]|\s*[가-힣A-Za-z%])/.exec(s)
        || /(?:^|\s)(\d[\d,]*(?:\.\d+)?)\s*[×xX*✕]\s*(?=\d[\d,]*(?:\.\d+)?\s*(?:만\s*)?원)/.exec(s);
      if (ta && toNumber(ta[2] || ta[1]) > 0) { times0 = toNumber(ta[2] || ta[1]); s = s.slice(0, ta.index) + (ta[2] ? '원 ' : ' ') + s.slice(ta.index + ta[0].length); }
      const wons = [...s.matchAll(WON)];
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
  if (!q && times0) qty = times0;
  if (dims) spec = [dims, spec].filter(Boolean).join(' ');
  if (price == null && total == null) {
    const bare = /(?:^|\s)([\d,]{2,})\s*$/.exec(s);
    if (bare) { price = money(bare[1]); s = s.slice(0, bare.index); }
  }
  if (all && total == null && amounts && amounts.length === 1) total = amounts[0];
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
  // 기호를 먼저 지우고 빈 괄호를 지움(한 번에 하면 「( × )」가 「( )」로 품명에 남았음)
  const name = plainItemName(s.replace(/[=@×*✕]/g, ' ').replace(/(^|\s)(?:x|X|각|개당|단가|금액|씩|짜리)(?=\s|$)/g, ' ').replace(/\(\s*\)|（\s*）|\[\s*\]/g, ' ')
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
    const b = basisItems(line);
    if (b) { for (const it of b) { if (findPersonal(it.name)) { missed.push(raw.trim()); continue; } items.push(it); sum += Math.round(toNumber(it.qty) * toNumber(it.price)); } continue; }
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
// 수에 포장 단위가 붙은 칸(「10묶음」「8개」 — 규격 단위 500ml·80g은 규격): 그 칸이 수량, 남은 수 칸은 단가(·금액)
const QTY_UNIT_CELL = new RegExp(`^(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${UNITS})$`);
const packCell = c => { const m = QTY_UNIT_CELL.exec(c); return m && !MEASURE.test(m[2]) ? m : null; };
function rowItem(cells) {
  const at = cells.findIndex(c => c && !NUM_CELL.test(c) && !UNIT_CELL.test(c) && !packCell(c));
  if (at < 0) return null;
  const rest = cells.slice(at + 1).filter(Boolean);
  const nums = rest.filter(c => NUM_CELL.test(c)).map(toNumber);
  if (!nums.length) return null;
  // 포장 단위 칸을 수량으로 보는 것은 남은 수가 단가 하나일 때(「색종이 | 10묶음 | 3,000」)나 그 수 × 단가가 금액과 대충 맞을 때
  // (「현수막 | 2개 | 45,000 | 90,000」 — 부가세 포함·할인·끝수로 금액이 딱 맞지 않는 「2개 | 45,000 | 99,000」「3세트 | 3,333 | 10,000」도).
  // 「품명 | 규격 | 수량 | 단가」의 규격 칸이 「12자루」「1000개」「1식」이면(「색연필 | 12자루 | 30 | 4,500」) 그 칸은 규격, 수 둘이 수량·단가.
  // 수가 셋 넘게 있으면(「면장갑 | 10켤레 | 3 | 8,000 | 24,000」) 수량 × 단가가 금액과 맞는 쪽으로
  const qc0 = rest.map(packCell).find(Boolean), q0 = qc0 ? toNumber(qc0[1]) : 0;
  const near = (a, b, tol) => Math.abs(a - b) <= Math.max(1, tol * Math.abs(b));
  const packFit = nums.length >= 2 && near(q0 * nums[0], nums[1], 0.2), specFit = nums.length >= 3 && near(nums[0] * nums[1], nums[2], 0.2);
  const qc = qc0 && (nums.length === 1 || (packFit && !(specFit && !near(q0 * nums[0], nums[1], 0))) || (nums.length >= 3 && !specFit)) ? qc0 : null;
  const pack = c => qc && packCell(c);
  const name = cells[at], texts = rest.filter(c => !NUM_CELL.test(c) && !UNIT_CELL.test(c) && !pack(c));
  const unit = rest.find(c => UNIT_CELL.test(c)) || (qc ? qc[2] : '');
  const [qty, price] = qc ? [q0, nums[0]] : nums.length >= 2 ? [nums[0], nums[1]] : [1, nums[0]];
  return { ...emptyItem(), name, spec: texts[0] || '', unit, qty: String(qty > 0 ? qty : 1), price: String(Math.round(price)) };
}
export function tableItems(text) {
  const rows = String(text || '').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(c => c.trim()));
  const head = findItems(rows);
  if (head.length) return { items: splitBasis(head.map(it => ({ ...emptyItem(), name: it.name, spec: it.spec || '', unit: it.unit || '', qty: String(it.qty), price: String(it.price), basis: it.basis }))), fields: {}, missed: [] };
  const items = [], missed = [];
  for (const cells of rows) {
    const it = rowItem(cells);
    if (it && (TOTAL.test(it.name) || isTotalName(it.name))) continue;
    // 금액이 없는 줄(계획서 본문·날짜·제목·머리줄)은 품목을 못 읽은 줄로 세지 않음 — 계획서를 넣으면 「못 읽은 줄 44개」가 떴음
    if (it) items.push(it); else if (cells.some(c => /\d\s*원|\d,\d{3}/.test(c))) missed.push(cells.filter(Boolean).join(' '));
  }
  return { items: splitBasis(items), fields: {}, missed };
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
    '- 계획서 예산 표의 산출 근거(「인화지 37,000원*8개=296,000원 전시 용품 11,000원*31학급=341,000원」)는 그 안의 품목마다 한 줄씩(name은 그 품목, unit은 「개·학급·식」, qty·price는 숫자). 표의 「항목」 이름(행사·활동 이름)은 품명으로 쓰지 않습니다.',
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
  // AI가 계획서 표를 「항목 = 품명, 산출 근거 = 규격」으로 읽어 와도 산출 근거 안의 품목들로(splitBasis)
  for (const x of splitBasis(listOf(v, 'items').filter(x => x && typeof x === 'object').map(x => ({ ...x, name: str(x.name, 120), spec: String(x.spec == null ? '' : x.spec) })))) {
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

/* AI로 보내는 글의 사람 이름(줄을 넘지 않음 — 「… 학생\n한라봉 2박스」의 품목은 아님): 「김철수 강사」「이영희 선생님」 → 「○○○ 강사」, 「강사 김철수」「외부강사: 박하늘」 → 「강사 ○○○」.
   이름 모양(흔한 성 + 세 글자, 두 글자 성 + 두 글자)만 가림 — 「담임교사」「체육 강사님」은 그대로 */
const ROLE_AFTER = /(^|[^가-힣])([가-힣]{3,4})([ \t]*)(강사님|강사|선생님|선생|교수님|교수|교사|님|씨)(?=[^가-힣]|$|께|이|가|은|는|을|를|의|과|와)/g;
const ROLE_BEFORE = /(강사님?|선생님|교수님?|교사)([ \t]*[:：][ \t]*|[ \t]+)([가-힣]{3,4})(?![가-힣])/g;
/* 학생·보호자 이름도: 「김하늘 학생」「한가람 학생의」「이바다 어머니」「학생 이바다」 → ○○○ (학생 이름은 AI로 보내지 않음).
   「성실한·신청한 학생」 같은 꾸미는 말, 「학생 인솔비」 같은 「~비·~회·~생」 낱말은 이름이 아님(core/privacy.js의 홀로 쓴 이름 규칙과 같게) */
const KIN_AFTER = /(^|[^가-힣○])([가-힣]{2,4})([ \t]*)(학생|학부모|어머니|어머님|아버지|아버님|부모님|보호자)(?=$|[^가-힣]|[은는이가을를과와의에도께랑만한님])/g;
const KIN_BEFORE = /((?:학생|학부모|보호자)(?:[ \t]*[:：][ \t]*|[ \t]+))([가-힣]{3,4})(?![가-힣])/g;
const NOT_NAME_END = /[도감력화회권별제법실부생들표단방작비장품물집책판함증점식터반란이가는을를의에만와과로한할된던운간친른막움님기상왕년자]$/;
// 성씨 글자로 시작하지만 이름이 아닌 낱말(「유치원 학부모」「학생 한마당」「이번주 학생」 — 「~원」은 김지원 같은 이름이 있어 끝 글자로 거르지 않음)
const KIN_WORD = new Set(['유치원', '한마당', '인원수', '문화원', '이번주', '이번달', '지난주', '지난달', '정원외', '장학금', '마스크', '안전모', '전학년', '한학기', '기숙사', '도서관']);
// 두 글자는 「김솔 학생」처럼 이름 뒤에서만, 흔한 낱말(전체·우수·장애·전학 학생 …)은 빼고
const KIN_TWO = new Set(['장애', '전학', '임원', '도움', '소수', '육상', '진급', '우수', '신입', '모범', '유학', '지각', '조퇴', '정원', '구매', '해당', '대상', '참가', '희망', '일반', '수상', '입상', '선수', '부진', '결석', '탈북', '귀국', '다문', '저소', '위기', '관심', '상담', '교내', '교외', '기숙', '통학', '도보', '급식', '방학', '학년', '학급', '체험', '참여', '모집', '선착', '신청', '지역', '마을', '인근', '근처', '소속', '재학', '졸업', '입학', '예비', '성인', '학부', '한반']);
const kinName = n => !KIN_WORD.has(n) && (n.length === 2 ? staffName(n) && !KIN_TWO.has(n) : nameCell(n) && !NOT_NAME_END.test(n));
/* 쇼핑몰 주문서·장바구니를 복사하면 딸려 오는 「주문자 남다율」「수령인: 박솔빛」「받는 분 탁보결」「신청자: 탁보결」「구매 요청: 탁보결」:
   이 머리 말 뒤의 이름 모양 낱말 하나도 가림(흔한 이름 목록에 없는 이름도 — 예전에는 그대로 AI로 갔음). 두 글자(「주문자 정보」)는 쌍점 뒤만 */
const ORDER_HEAD = /(^|[^가-힣])((?:주문|구매|구입|신청|요청)(?:자|인)|주문하신[ \t]*분|수령(?:인|자)|받(?:는|으시는|으실)[ \t]*(?:사람|분)|보내(?:는|시는)[ \t]*(?:사람|분)|(?:구입|구매)[ \t]*요청(?:자|인)?)((?:[ \t]*(?:명|성명|이름))?)([ \t]*[:：][ \t]*|[ \t]+)([가-힣]{2,4}?)(?=(?:님|씨)?(?![가-힣]))/g;
// 쌍점 없이 띄어 쓴 꼴은 품목 줄(「신청자 안내문 10장 500원」)이 아닐 때만, 「~문·~란」 같은 낱말 끝은 아님.
// 쌍점 뒤라도 곳·무리·부서 끝말(「수령인: 도서실」「신청자: 전교생」「신청자: 전학년」「수령인: 지원청」「신청자: 연구부」)은 이름이 아님 — 흔한 이름(김은실)은 이름
const ORDER_NOT = new Set(['정보', '이름', '성명', '주소', '연락처', '전화', '확인', '명단', '전원', '배송', '수령']);
const ORDER_PLACE = /[실생년청반부]$/;
const orderName = (n, colon, rest) => !ORDER_NOT.has(n) && (n.length === 2 ? colon && staffName(n)
  : nameCell(n) && (colon ? !ORDER_PLACE.test(n) || GIVEN.has(n.slice(1)) : (!NOT_NAME_END.test(n) && !/문$/.test(n) && !new RegExp(`${QTY.source}|\\d\\s*(?:만\\s*)?원`).test(rest))));
export const maskNames = t => String(t || '')
  .replace(ORDER_HEAD, (m, pre, head, suf, sp, n, at, all) => (orderName(n, /[:：]/.test(sp), all.slice(at + m.length).split('\n')[0]) ? `${pre}${head}${suf}${sp}${MASK}` : m))
  .replace(ROLE_AFTER, (m, pre, n, sp, role) => (nameCell(n) ? `${pre}${MASK}${sp || ' '}${role}` : m))
  .replace(ROLE_BEFORE, (m, role, sp, n) => (nameCell(n) ? `${role}${sp}${MASK}` : m))
  .replace(KIN_AFTER, (m, pre, n, sp, who) => (kinName(n) ? `${pre}${MASK}${sp || ' '}${who}` : m))
  .replace(KIN_BEFORE, (m, pre, n) => (kinName(n) ? `${pre}${MASK}` : m));
/* AI로 가는 품의 글: maskNames(직함·학생 옆 이름) 다음 core/redact.js 가리개(쉼표·가운뎃점으로 이은 이름, 「수상자: …」 목록, 맡은 일 말 앞 이름, 명단 줄 빼기)를 한 번 더.
   자리 표시는 ○○○로(답을 되돌리지 않음). 가리개가 보내지 않는 줄이라도 수량·금액이 있는 품목 줄(「이순신 장영실 정약용 위인전 3권 36,000원」
   「상품번호 1234-5678-9012 색연필 10개」)은 빼지 않고 그 줄의 이름 모양 낱말·긴 번호만 ○○○ — AI 답이 규칙으로 읽은 품목을 통째로 대신해서, 줄을 빼면 그 품목이 조용히 사라졌음.
   주민번호·계좌 말(계좌·예금주)·연락처가 있는 줄은 그대로 뺌.
   물건 머리 줄(「내용: 6학년 1반 김민준 이서연 박지훈 체험학습비 45,000원」「품목: 남다율 탁보결 한가람 상장 …」)의 이름은 「쌤」 채팅 규칙(chat-names maskPersons —
   흔한 이름 목록·빈칸으로 이은 이름)으로 한 번 더 가림. 물건 머리 줄의 이름 모양 낱말을 모두(peopleNames weak) 가리면 품목 이름(현수막·마이크·안전모·도화지·지점토)이
   ○○○이 되고, 가린 뒤 명단 줄로 다시 빼면(stripNames) 「지우개, 우드락, 고무판 …」 품목 줄이 통째로 사라졌음(초안·검토 AI의 「- 품목:」 줄도) */
const LONG_NO = /(?<![\d-])\d{2,6}(?:-\d{2,8}){2,3}(?![\d-])/g;
const ITEM_LINE = new RegExp(`${QTY.source}|\\d\\s*(?:만\\s*)?원`);
export const maskForAI = t => {
  const ls = maskNames(t).split('\n'), rd = makeRedactor(), out = rd.lines(ls);
  return out.map((x, k) => {
    if (x) return x.text;
    const l = ls[k];
    if (RRN_RE.test(l) || /계좌|예금주/.test(l) || hasContact(l) || !ITEM_LINE.test(l)) return null;
    const weak = [], ns = [...new Set([...peopleNames(l, { weak }), ...rd.names])].filter(n => /^[가-힣]{2,4}$/.test(n)).sort((a, b) => b.length - a.length);
    let v = maskPersons(ns.reduce((v, n) => v.split(n).join(MASK), l.replace(LONG_NO, m => (m.replace(/\D/g, '').length >= 10 ? MASK : m)))).text;
    // 물건 머리 줄의 이름 모양 낱말(weak)은 가린 이름과 빈칸·쉼표로 바로 이어질 때만(「품목: 김하늘 이바다 박솔빛 상장」의 박솔빛 — 「현수막 1개, 마이크 2개」는 아님)
    for (let k = 0; k < weak.length; k++) {
      const w = weak.find(x => new RegExp(`(?<=${MASK}[ \\t,，·、]+)${x}(?![가-힣])|(?<![가-힣])${x}(?=[ \\t,，·、]+${MASK})`).test(v));
      if (!w) break;
      v = v.replace(new RegExp(`(?<=${MASK}[ \\t,，·、]+)${w}(?![가-힣])|(?<![가-힣])${w}(?=[ \\t,，·、]+${MASK})`, 'g'), MASK);
    }
    return v;
  }).filter(x => x != null).join('\n').replace(/〔이름\d+〕|\{\{\d+\}\}/g, MASK);
};

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
    return { items: splitBasis(q.items.map(it => ({ ...emptyItem(), name: it.name, spec: it.spec || '', unit: it.unit || '', qty: String(it.qty), price: String(it.price), vendor: it.vendor || '', basis: it.basis }))), fields: { ...(q.fields || {}), ...head }, by: q.by, missed: [] };
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
    try { return withHead({ ...(await aiRead('text', { text: maskContacts(maskForAI(safe)) })), personal }); }
    catch (e) { if (!r.items.length) throw e; }
  }
  return withHead({ ...r, by: 'rule', personal });
}
