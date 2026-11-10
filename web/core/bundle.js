/* 한꺼번에 넣기 (스펙 3장): 문서 안 학생용·교사용 나누기, 스캔 쪽 표시(정답·교사용 / 빈 활동지 / 학생), 확인 카드.
   활동지·단원평가·평가지 채점이 같이 씀. 이 파일의 규칙 함수는 화면 없이도 돌아감(시험) */
import { nameCell, stripNames, MASK } from './privacy.js';
import { maskPersons } from './chat-names.js';

export const ROLE_NAME = { teacher: '정답·교사용', blank: '빈 활동지', student: '학생' };
const ROLES = Object.keys(ROLE_NAME);

/* ---------- 문서 안 나누기 ---------- */
// 줄 머리의 교사용·(예시)·예시 답안·모범 답안·[정답]·정답(및 해설)·채점 기준, 또는 이름 칸 끝의 「교사용」
const MARK = /^\s*(\|\s*)*(교사용|\(예시\)|예시\s*답안|모범\s*답안|\[정답\]|정답(\s*및\s*해설지?)?|채점\s*기준)\s*(\||$)/;
const NAME_TEACHER = /이름\s*:?.*교사용\s*\)?\s*$/;
const cut = (lines, at, how) => ({ student: lines.slice(0, at).join('\n').trim(), teacher: lines.slice(at).join('\n').trim(), how });

/* → { student, teacher, how: 'marker'|'repeat'|'none' }. 표시가 있으면 그 줄(바로 앞 8줄 안에 첫 머리 줄이 다시 나오면 그 머리 줄)에서,
   표시 없이 첫 머리 줄이 다시 나오면 거기서 나눔(학생용 쪽 다음 같은 양식의 교사용 쪽) */
export function splitDoc(text) {
  const src = String(text || '').trim();
  if (!src) return { student: '', teacher: '', how: 'none' };
  const lines = src.split('\n');
  const head = (lines.find(l => l.trim().length >= 4) || '').trim();
  const isHead = l => !!head && l.trim() === head;
  const m = lines.findIndex((l, i) => i > 0 && (MARK.test(l) || NAME_TEACHER.test(l)));
  if (m > 0) {
    let at = m;
    for (let j = m; j >= Math.max(1, m - 8); j--) if (isHead(lines[j])) { at = j; break; }
    return cut(lines, at, 'marker');
  }
  const r = lines.findIndex((l, i) => i > 0 && isHead(l));
  if (r > 0) return cut(lines, r, 'repeat');
  return { student: src, teacher: '', how: 'none' };
}

/* 파일 하나가 정답·교사용인지: 이름에 교사용·정답·해설·예시·모범 답안, 첫 줄이 표시, 앞 8줄 안에 「이름: 교사용」 */
export function teacherFile(name, text) {
  if (/교사용|정답|해설|예시|모범\s*답안|채점\s*기준/.test(String(name || ''))) return true;
  const ls = String(text || '').split('\n').filter(l => l.trim()).slice(0, 8);
  return !!ls.length && (MARK.test(ls[0]) || ls.some(l => NAME_TEACHER.test(l)));
}
/* 따로 넣은 교사용·정답 파일은 통째로 교사용. 다만 그 파일 안에서 나뉠 때 교사용 쪽이 같은 머리 줄로 다시 시작하거나(학생용 쪽 + 같은 양식의 교사용 쪽)
   앞쪽(학생용)이 8줄을 넘으면 한 파일에 둘 다 든 것(그대로 나눔) */
export function teacherOnly(name, text) {
  if (!teacherFile(name, text)) return false;
  const d = splitDoc(text);
  if (d.how === 'none') return true;
  const head = (String(text).split('\n').find(l => l.trim().length >= 4) || '').trim();
  const again = !!head && (d.teacher.split('\n').find(l => l.trim()) || '').trim() === head;
  return !(again || d.student.split('\n').filter(l => l.trim()).length > 8);
}
/* 학생 손글씨를 글자 인식한 스캔 묶음인지(복사기 「검색 가능 PDF」): 쪽마다 학생 이름이 적힘(두 쪽 이상), 또는 6쪽 이상에 같은 머리가 되풀이 */
const FILLED_NAME = /이\s*름\s*[:：]\s*(?!교사용|학생용)[가-힣]{2,4}(?![가-힣])/;
// 한글·글 파일(타자로 친 글)용: 이름 칸과 같은 줄에서만(빈 「이름:」 다음 줄의 「다음 글을…」·옆 칸 「점수:」는 이름이 아님), 양식 낱말은 뺌.
// 글자 인식된 스캔(PDF 글자층)은 「이름:」과 이름이 다른 줄로 나뉘기도 해서 위 FILLED_NAME을 그대로 씀
const FILLED_LINE = /이[ \t\u3000]*름[ \t\u3000]*[:：][ \t\u3000]*(?!교사용|학생용|다음|번호|점수|확인|날짜|학년|학번|서명|과목|교과|단원|평가|정답|문제|채점)[가-힣]{2,4}(?![가-힣:：])/;
// 쌍점 없이 「이름 김민수」: 사람 이름 모양(흔한 성 + 두 글자 등)일 때만 (「이름 날짜」 같은 인쇄 머리는 아님)
const BARE_NAME = /이\s*름\s+([가-힣]{2,4})(?![가-힣])/g;
export const filledName = t => FILLED_NAME.test(t) || [...String(t).matchAll(BARE_NAME)].some(m => nameCell(m[1]));
export const filledNameLine = t => FILLED_LINE.test(t) || [...String(t).matchAll(BARE_NAME)].some(m => nameCell(m[1]));
const headOf = t => String(t || '').trim().split(/\s+/).slice(0, 4).join(' ');
export function scanLike(pages) {
  const ps = pages || [];
  if (ps.filter(p => filledName(p.text || '')).length >= 2) return true;
  if (ps.length < 6) return false;
  const h = headOf(ps[0].text);
  return !!h && ps.filter(p => headOf(p.text) === h).length >= Math.max(3, Math.ceil(ps.length / 3));
}
/* 교사용 글 = 문서에서 나눈 교사용 + 정답·교사용 표시인 쪽의 글 (카드에서 표시를 바꾸면 다시 맞춤) */
export const teacherOf = b => [b.doc && b.doc.docTeacher, ...(b.pages || []).filter((p, i) => b.roles[i] === 'teacher' && hasText(p)).map(p => p.text)]
  .filter(t => String(t || '').trim()).join('\n').trim();

/* ---------- 스캔 쪽 표시 ---------- */
/* 정답·교사용 쪽은 보통 맨 앞이나 맨 뒤: 앞 2쪽·뒤 2쪽 */
export function edgeIdx(n) {
  const out = [];
  for (const i of [0, 1, n - 2, n - 1]) if (i >= 0 && i < n && !out.includes(i)) out.push(i);
  return out.sort((a, b) => a - b);
}

export function pageRolesPrompt(k) {
  return ['[쪽 나누기]',
    `첨부한 그림 ${k}장은 한 반의 활동지·평가지를 스캔한 묶음에서 고른 쪽입니다(차례대로 0번부터). 이름 칸은 가려져 있을 수 있습니다.`,
    '쪽마다 아래 셋 중 하나를 고릅니다.',
    '- teacher: 정답·예시 답안·교사용으로 인쇄된 쪽(손글씨 없이 답이 인쇄되어 있음)',
    '- blank: 아무것도 쓰지 않은 빈 활동지·평가지',
    '- student: 학생이 손으로 쓴 답·그림이 있는 쪽',
    '', '[출력] JSON 하나만 출력합니다.', '{"pages":[{"i":0,"role":"teacher|blank|student"}]}'].join('\n');
}
/* AI 답 → 길이 k의 표시 배열(범위 밖·모르는 표시는 버림, 없으면 학생) */
export function normPageRoles(v, k) {
  const out = Array.from({ length: k }, () => 'student');
  const list = Array.isArray(v) ? v : v && Array.isArray(v.pages) ? v.pages : [];
  for (const x of list) {
    const i = Number(x && x.i);
    if (Number.isInteger(i) && i >= 0 && i < k && ROLES.includes(x.role)) out[i] = x.role;
  }
  return out;
}
/* 글자 인식된 스캔 쪽 글에 교사용·정답 표시가 있는지(PDF 쪽 글은 줄 없이 이어져 있어 낱말로 봄) */
export const teacherText = t => /교사용|\(\s*예시\s*\)|예시\s*답안?|모범\s*답안|\[\s*정답\s*\]|정답\s*및\s*해설|채점\s*기준/.test(String(t || ''));
/* 쪽마다 표시: 글자 인식된 학생 스캔 쪽(ocr)은 교사용·정답 표시가 있거나 정답·교사용 이름의 파일에서 온 쪽(keyFile)일 때만 정답·교사용,
   스캔 사이 글자층 쪽(인쇄본)이 30자 이상이면 정답·교사용, 아니면 AI 답({쪽 번호: 표시}), 아니면 학생 */
export function pickRoles(pages, ai) {
  return (pages || []).map((p, i) => {
    if (p && p.ocr) return p.keyFile || teacherText(p.text) ? 'teacher' : 'student';
    if (p && String(p.text || '').replace(/\s/g, '').length >= 30) return 'teacher';
    const r = ai && ai[i];
    return ROLES.includes(r) ? r : 'student';
  });
}
/* 나눌 것이 있을 때만 확인 카드(학생 스캔만이면 바로 넣음) */
export const needsCard = ({ doc, roles } = {}) => !!(doc && String(doc.teacher || '').trim()) || (roles || []).some(r => r !== 'student');

/* ---------- 이름 칸만 가리기 ---------- */
/* 정답·기준 글(학생마다 채점 요청에 실려 감)과 행특 메모: 「이름: 김민수」「5번 이름 김민수」「성명 김철수」「이름 | 김민수」 같은 이름 칸만 ○○○로.
   정답 속 인물 이름(안중근)·도형 이름(오각형)·큰 수·번호 줄은 그대로 둠(stripNames를 통째로 걸면 정답이 망가짐).
   「도형의 이름: 오각형」「문화재 이름: 경복궁」「산 이름: 한라산」「과학자 이름: 장영실」처럼 앞말이 꾸미는 이름은 정답 낱말이라 이름 칸이 아님.
   앞말이 없거나 숫자·「5번」「2반」「5일」, 사람 쪽 말(학생·짝·발표자·이끔이·동생…), 양식 제목(「[독서록]」「감상문」「활동지」「서술형 평가」…)이거나
   「과목: 국어 이름:」「단원: 3. 이야기 이름:」처럼 앞 칸의 값일 때는 이름 칸 */
const FIELD = /(이\s?름|성\s?명|학생명)(\s*[:：(（[|]\s*|\s+)([가-힣]{2,6})(?![가-힣])/g;
// 사람 쪽 앞말: 학생·역할·가족(「과학자·화가·작가·인물·위인·임금」처럼 정답 쪽 사람 말은 넣지 않음)
const WHO = new RegExp('^(?:' + [
  '번호|학번|학생|아동|어린이|본인|나|내|제|저|한글|한자|친구|짝|짝꿍|단짝|상대|상대방|대상|롤모델|반장|부반장|회장|부회장|모둠장|모둠원|조장|조원|팀장|팀원|리더|이끔이|도우미|멘토|멘티',
  '발표자|기록자|기록이|사회자|참가자|참여자|참석자|응답자|평가자|관찰자|면담자|면접자|피면접자|상담자|채점자|확인자|서명자|신청자|대표자|질문자|답변자|응시자|수험자|지원자|후보자',
  '추천인|추천자|조사자|실험자|측정자|진행자|담당자|작성자|제출자|보호자|글쓴이|쓴이|그린이',
  '학부모|부모|부모님|가족|어머니|아버지|어머님|아버님|엄마|아빠|할머니|할아버지|동생|형|언니|누나|오빠|담임|담임교사|교사|선생님|날짜|요일|[반월일]'
].join('|') + ')$|(?:학년|번)$');
// 양식 제목으로 끝나는 앞말(「독서 감상문 이름:」「수행평가 활동지 이름:」「나의 꿈 발표하기 이름:」)
const TITLE = /(?:평가|평가지|시험지|활동지|학습지|독서록|감상문|보고서|계획서|일기|편지|기록|기록장|기록지|관찰지|익힘|쓰기|하기|읽기|과제|숙제)$/;
// 앞 칸의 값(「과목: 국어 이름:」「날짜: 11월 5일 이름:」「단원: 3. 이야기 이름:」)
const HEAD_VAL = /(?:과목|교과|단원|날짜|일시|학교|학급|학년|반|번호|번|학번|모둠)\s*[:：][^:：|]{0,30}$/;
export function maskNameFields(text) {
  return String(text || '').split('\n').map(line => line.replace(FIELD, (m, lab, sep, w, off) => {
    const tok = (line.slice(0, off).match(/(\S{1,10})\s*$/) || ['', ''])[1];
    // 「이름」 바로 앞 한글 낱말(「학생의」는 「학생」으로): 사람·양식 쪽 말이 아니면 이름 칸 아님. 괄호로 싼 제목(「[독서록]」「(서술형 평가)」)은 양식 제목
    const word = tok.replace(/[^가-힣]+$/, '').match(/[가-힣]*$/)[0].replace(/(.)의$/, '$1');
    if (word && !WHO.test(word) && !TITLE.test(word) && !/[\])>）】」』〉》]$/.test(tok) && !HEAD_VAL.test(line.slice(0, off))) return m;
    // 사람 이름인지는 privacy.js의 이름 칸 규칙으로(쌍점·「5번」 뒤면 두 글자도, 「이름 정답」「모둠 이름」은 아님). 표 칸(|)은 띄어 쓴 칸처럼
    const s = /[|]/.test(sep) ? ' ' : sep, tail = line.slice(off + m.length, off + m.length + 3).replace(/[|]/g, ' ');
    const run = head => { const r = stripNames(head + w + tail); return !r.dropped && r.text.startsWith(head) && r.text.endsWith(tail) ? r.text.slice(head.length, r.text.length - tail.length) : null; };
    const got = run(`${tok} ${lab}${s}`) ?? run(lab + s); // 앞말까지 바뀌면(드묾) 이름 칸만 다시 봄
    return got == null || got === w || !got.startsWith(MASK) ? m : lab + sep + got;
  })).join('\n');
}
/* 행특 메모 한꺼번에 넣기: 줄마다 { no(앞 번호, 없으면 null), memo }. 엑셀에서 번호·이름·메모 칸을 함께 복사하면 이름 칸은 빼고(names: 뺀 수),
   머리 줄(번호·이름·메모)은 넣지 않음. 이름 칸은 머리에 「이름」이 있거나, 칸이 둘 이상인 줄의 첫 칸이 대부분 사람 이름 모양일 때만 */
const NAME_HEAD = /^(이\s?름|성\s?명|학생명|학생\s?이름)$/;
const nameLike = c => nameCell(c) && !/[함임음됨]$/.test(c);
/* 띄어 쓴 이름 칸(「1 김민수 발표 잘함」 — PDF·글에서 복사): 낱말 전체가 사람 이름(chat-names 규칙 — 「조용히」「박물관」은 아님)일 때만 */
const wholeName = w => /^[가-힣]{2,5}$/.test(w) && maskPersons(w, { memo: true }).text === MASK;
const leadName = s => { const m = /^([가-힣]{2,5})[ 　]+(?=\S)/.exec(s); return m && wholeName(m[1]) ? m[0] : ''; };
/* 엑셀에서 복사한 글: 칸 안 줄바꿈(Alt+Enter)·따옴표가 든 칸은 「"…"」로 감싸 옴(안의 「"」는 「""」). 감싼 칸은 한 칸으로 풀어 줄을 이어 붙임
   (줄마다 학생 한 명이라 그대로 두면 칸의 둘째 줄이 다음 학생 메모가 됨). 닫는 따옴표 바로 뒤가 칸 끝일 때만 — 손으로 친 「"성실함" 친구를 도움」은 그대로 */
export function excelFlat(text) {
  const s = String(text || '');
  if (!s.includes('"')) return s;
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || s[i - 1] === '\t' || s[i - 1] === '\n')) {
      let j = i + 1, cell = '', closed = false;
      while (j < s.length) {
        if (s[j] === '"') { if (s[j + 1] === '"') { cell += '"'; j += 2; continue; } closed = true; j++; break; }
        cell += s[j++];
      }
      if (closed && (j >= s.length || /[\t\r\n]/.test(s[j]))) {
        out += cell.split(/\r?\n/).map(l => l.trim()).filter(Boolean).reduce((a, l) => (a ? a + (/[.,!?。]$/.test(a) ? ' ' : ', ') + l : l), '');
        i = j; continue;
      }
    }
    out += s[i++];
  }
  return out;
}
export function memoRows(text) {
  // 엑셀 칸 안 줄바꿈을 먼저 풂. 줄 앞뒤 빈칸만 뗌(탭은 엑셀 칸 자리라 남김). 끝의 빈 줄(엑셀 복사 끝 줄바꿈)은 버림
  const all = excelFlat(text).split('\n').map(l => l.replace(/^[ \r\u3000]+|[ \r\u3000]+$/g, ''));
  while (all.length && !all[all.length - 1].trim()) all.pop();
  const numbered = all.some(l => /^\d{1,2}\s*번?(?:[\s.)\-:]|$)/.test(l));
  let lines = numbered ? all.filter(l => l.trim()) : all;
  if (!numbered) {
    // 번호 없이 붙이면 가운데 빈 줄도 한 학생 자리(엑셀 한 칸 복사의 빈 셀). 앞 빈 줄은 버리고,
    // 빈 줄이 메모 줄 사이마다 같은 수로 끼어 있으면(빈 줄로 띄워 친 글) 빈 줄은 자리가 아님
    while (lines.length && !lines[0].trim()) lines = lines.slice(1);
    const at = lines.map((l, i) => (l ? i : -1)).filter(i => i >= 0), gaps = at.slice(1).map((v, i) => v - at[i]);
    if (gaps.length && gaps[0] > 1 && gaps.every(g => g === gaps[0])) lines = lines.filter(Boolean);
  }
  let nameAt = -1;
  const rows = [];
  for (const l of lines) {
    // 번호만 있는 줄(엑셀 「4⇥」: 메모 칸이 빔)은 그 번호의 빈 메모
    const e = l.match(/^(\d{1,2})\s*번?\s*[.)\-:]?$/);
    if (e) { rows.push({ no: +e[1], cells: [] }); continue; }
    const m = l.match(/^(\d{1,2})\s*(?:번)?[\s\t.)\-:]+(.+)$/);
    // 칸 자리를 지킴(「2⇥김솔⇥」처럼 메모 칸이 비어도 이름 칸을 알아봄)
    const raw = (m ? m[2] : l).split('\t').map(c => c.trim()), cells = raw.some(Boolean) ? raw : [];
    const head = m ? -1 : (/^(번호|번)$/.test(cells[0]) ? cells.slice(1) : cells).findIndex(c => NAME_HEAD.test(c));
    if (head >= 0) { nameAt = head; continue; }
    rows.push({ no: m ? +m[1] : null, cells });
  }
  if (nameAt < 0) {
    const two = rows.filter(r => r.cells.filter(Boolean).length >= 2), hit = two.filter(r => nameLike(r.cells[0])).length;
    if (hit && hit >= two.length * 0.6) nameAt = 0;
  }
  // 탭 없이 띄어 쓴 이름 칸: 낱말이 둘 이상인 한 칸 줄의 대부분(두 줄 이상)이 이름으로 시작할 때만
  let spaced = false;
  if (nameAt < 0) {
    const one = rows.filter(r => r.cells.length === 1 && /\S\s+\S/.test(r.cells[0])), hit = one.filter(r => leadName(r.cells[0])).length;
    spaced = hit >= 2 && hit >= one.length * 0.6;
  }
  let names = 0;
  const out = [];
  for (const r of rows) {
    // 칸이 하나뿐인 줄은 그 칸이 이름 모양일 때만 뺌(메모 한 칸은 그대로)
    if (nameAt >= 0 && r.cells.length > nameAt && (r.cells.length >= 2 || nameLike(r.cells[nameAt]))) { if (r.cells[nameAt]) names++; r.cells.splice(nameAt, 1); }
    else if (spaced && r.cells.length === 1) {
      const c = r.cells[0], n = leadName(c);
      if (n) { names++; r.cells = [c.slice(n.length).trim()]; } else if (wholeName(c)) { names++; r.cells = []; }
    }
    const memo = r.cells.filter(Boolean).join(', ').trim();
    // 메모가 빈 줄도 남김(그 학생 메모는 바꾸지 않고 자리만 셈). 번호도 메모도 없는 줄은 번호 붙인 붙여넣기에서는 버림
    if (memo || r.no != null || !numbered) out.push({ no: r.no, memo });
  }
  return { rows: out, names };
}
/* AI로 보내는 행특 메모: 예전에 붙여넣은 「김민수⇥메모」「김민수 메모」의 앞 이름 칸을 빼고 이름 칸을 가림 */
export const memoForAI = memo => maskNameFields(String(memo || '').replace(/^\s*([가-힣]{2,4})\t+/, (m, n) => (nameLike(n) ? '' : m))
  .replace(/^\s*([가-힣]{2,5})[ 　]+(?=\S)/, (m, n) => (wholeName(n) ? '' : m))).trim();

/* ---------- 파일 읽기 ---------- */
const DOC = /\.(hwpx?|txt)$/i;
const hasText = p => String((p && p.text) || '').replace(/\s/g, '').length >= 30;
const SS = () => globalThis.window && window.SSAM || {};
/* AI에 보내는 작은 그림(긴 변 512px): 정한 이름 칸과 맨 위 띠(이름 칸이 흔히 있는 곳)를 흰색으로 */
async function smallImage(page, mask) {
  const img = await SS().files.pageImage(page, [...(mask || []), { x: 0, y: 0, w: 1, h: 0.18 }]);
  const bmp = await createImageBitmap(img.blob);
  const s = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  return { mime: 'image/jpeg', blob, b64 };
}

/* 파일 여러 개 → { doc: { student, teacher, docTeacher, how, names }, pages, roles, skipped, seen }
   한글·txt는 글(따로 넣은 교사용·정답 파일은 통째로 교사용), PDF·사진은 쪽. 모든 쪽에 글자층이 있는 PDF는 문서로(쪽은 버림) —
   다만 글자 인식된 학생 스캔 묶음(scanLike)이거나 학생 스캔을 받는 곳(expect: 'student')이면 쪽으로 두고 쪽 글로 표시(ocr).
   스캔 사이 글자층 쪽은 정답·교사용 쪽(글은 교사용 글로). 글자층 없는 스캔이 3쪽 이상이고 AI가 되면 앞 2쪽·뒤 2쪽을 한 번 보냄(실패하면 모두 학생) */
export async function readBundle(files, { say = () => {}, mask = null, expect = '' } = {}) {
  const { readText } = await import('./files.js');
  const ai = await import('./ai.js');
  const list = [...files].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko', { numeric: true }));
  const docTexts = [], teacherDocs = [], names = [], skipped = [], pages = [];
  const addDoc = (name, text) => { (teacherOnly(name, text) ? teacherDocs : docTexts).push(text); names.push(name); };
  for (const f of list) {
    if (DOC.test(f.name || '')) {
      try { say(`「${f.name}」 읽는 중`); addDoc(f.name, await readText(f)); } catch (e) { skipped.push(f.name); }
      continue;
    }
    let r;
    try { r = await SS().files.readPages([f], say); } catch (e) { if (e && e.message === 'PDFJS') throw e; skipped.push(f.name); continue; }
    skipped.push(...(r.skipped || []));
    const allText = r.pages.length && r.pages.every(hasText);
    if (allText && expect !== 'student' && !scanLike(r.pages)) { addDoc(f.name, r.pages.map(p => p.text).join('\n')); SS().files.freePages(r.pages); continue; }
    // 학생 스캔을 받는 곳이면 글자층 쪽도 학생 스캔(교사용·정답 표시가 있거나 「정답」·「교사용」 같은 이름의 파일일 때만 정답·교사용)
    const key = teacherFile(f.name);
    for (const p of r.pages) { if (allText || (expect === 'student' && hasText(p))) { p.ocr = true; if (key) p.keyFile = true; } pages.push(p); }
  }
  const d = splitDoc(docTexts.join('\n'));
  const docTeacher = [d.teacher, ...teacherDocs].filter(t => String(t).trim()).join('\n').trim();
  const doc = { student: d.student, teacher: '', docTeacher, how: d.how, names };
  let aiRoles = null;
  if (pages.length >= 3 && !pages.some(hasText) && ai.ready()) {
    const idx = edgeIdx(pages.length);
    try {
      say('정답·교사용 쪽을 찾는 중');
      const images = [];
      for (const i of idx) images.push(await smallImage(pages[i], mask));
      const v = await ai.generateJSON(pageRolesPrompt(idx.length), { images, task: 'grade', valid: x => !!x && (Array.isArray(x) || Array.isArray(x.pages)) });
      const rs = normPageRoles(v, idx.length);
      aiRoles = Object.fromEntries(idx.map((pi, k) => [pi, rs[k]]));
    } catch (e) { aiRoles = null; }
  }
  // seen: AI가 표시를 본 쪽 번호(나머지 쪽의 「학생」은 근거 없이 둔 표시 — 단원평가 [답안 넣기]가 이름대로 넣을 때 씀)
  const b = { doc, pages, roles: pickRoles(pages, aiRoles), skipped, seen: aiRoles ? Object.keys(aiRoles).map(Number) : [] };
  b.doc.teacher = teacherOf(b);
  if (b.doc.teacher && !d.teacher) b.doc.how = 'marker';
  return b;
}

/* ---------- 확인 카드 ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NEXT = { student: 'teacher', teacher: 'blank', blank: 'student' };
export function bundleSummary(b) {
  const parts = [];
  if (b.doc && b.doc.teacher) parts.push(b.doc.student ? '문서를 학생용 · 교사용으로 나눴어요' : '정답·교사용 문서');
  else if (b.doc && b.doc.student) parts.push(`문서 ${Math.max(1, (b.doc.names || []).length)}개`);
  const n = r => (b.roles || []).filter(x => x === r).length;
  for (const r of ['teacher', 'blank', 'student']) if (n(r)) parts.push(`${ROLE_NAME[r]} ${n(r)}쪽`);
  return parts.join(' · ') || '넣을 것이 없어요';
}
/* 나눈 결과를 보여 주고 확인받음 → 고친 b, 취소면 null */
export function openBundleCard(b, { what = '' } = {}) {
  return new Promise(resolve => {
    const cur = { ...b, doc: { ...b.doc }, roles: [...(b.roles || [])] };
    let done = false;
    const finish = v => { if (done) return; done = true; obs.disconnect(); resolve(v); };
    const docHTML = () => (cur.doc.teacher && cur.doc.student
      ? `<div class="bundle-doc"><span><b>학생용</b> ${cur.doc.student.split('\n').length}줄 · <b>교사용</b> ${cur.doc.teacher.split('\n').length}줄</span><button class="btn text tiny" type="button" id="bundleNoSplit">나누지 않기</button></div>` : '');
    const pagesHTML = () => (cur.pages && cur.pages.length
      ? `<div class="bundle-pages">${cur.pages.map((p, i) => `<button type="button" class="bundle-pg role-${cur.roles[i]}" data-bundle-page="${i}" aria-label="${i + 1}쪽 ${ROLE_NAME[cur.roles[i]]}"><img src="${esc(p.thumb || p.url)}" alt=""><span>${i + 1}쪽 · ${ROLE_NAME[cur.roles[i]]}</span></button>`).join('')}</div>
        <p class="muted" style="margin:0">쪽을 누르면 학생 → 정답·교사용 → 빈 활동지로 바뀌어요. 정답·교사용·빈 쪽은 채점 기준으로만 쓰고 학생으로 세지 않아요.</p>
        ${cur.roles.includes('blank') ? '<p class="act-warn" id="bundleBlankNote" style="margin:0">「빈 활동지」로 본 쪽에 학생 이름이 적혀 있으면 눌러서 「학생」으로 바꿔 주세요. AI는 이름 칸을 가린 그림만 봐서 이름만 쓰고 비운 쪽을 빈 활동지로 볼 수 있어요.</p>' : ''}` : '');
    const draw = sh => {
      sh.querySelector('#bundleSum').textContent = bundleSummary(cur);
      sh.querySelector('#bundleBody').innerHTML = docHTML() + pagesHTML();
    };
    SS().openSheet(`<div id="bundleCard" class="bundle-card"><h3>${esc(what ? `${what}에 이렇게 넣을까요?` : '이렇게 나눠 넣을까요?')}</h3>
      <p class="muted" id="bundleSum" style="margin:0"></p><div id="bundleBody"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="bundleOk">이대로 넣기</button></div></div>`, sh => {
      sh.classList.add('wide');
      draw(sh);
      sh.addEventListener('click', e => {
        const pg = e.target.closest('[data-bundle-page]');
        if (pg) { const i = +pg.dataset.bundlePage; cur.roles[i] = NEXT[cur.roles[i]] || 'student'; draw(sh); return; }
        if (e.target.closest('#bundleNoSplit')) { cur.doc = { ...cur.doc, student: [cur.doc.student, cur.doc.docTeacher].filter(Boolean).join('\n'), docTeacher: '', how: 'none' }; cur.doc.teacher = teacherOf(cur); draw(sh); return; }
        if (e.target.closest('#bundleOk')) { const v = { ...cur, doc: { ...cur.doc } }; v.doc.teacher = teacherOf(v); SS().closeSheet(); finish(v); }
      });
    });
    const root = document.getElementById('sheetRoot');
    const obs = new MutationObserver(() => { if (!root.querySelector('#bundleCard')) finish(null); });
    obs.observe(root, { childList: true, subtree: true });
  });
}

/* ---------- 「한꺼번에 넣기」 칸 ---------- */
// 칸마다 지금 알림(「읽는 중」 등): 읽는 동안 다른 메뉴에 갔다 와서 칸을 다시 그려도 보이게
const msgs = {};
export const bundleBoxHTML = (id, note = '') => `<div class="bundle-box" data-bundle-drop="${esc(id)}">
  <div class="bundle-box-h"><b>한꺼번에 넣기</b><span class="muted">${esc(note || '정답지·교사용·학생 스캔을 한꺼번에 넣으면 알아서 나눠요')}</span></div>
  <div class="row"><button class="btn tonal" type="button" data-bundle-pick="${esc(id)}">파일 고르기</button><span class="muted bundle-msg" data-bundle-msg="${esc(id)}" role="status">${esc(msgs[id] || '')}</span></div>
  <input type="file" id="bundleFile-${esc(id)}" multiple hidden accept=".hwp,.hwpx,.txt,.pdf,.png,.jpg,.jpeg,.webp"></div>`;
/* 칸에 넣은 파일을 받는 곳: 고르기·끌어 놓기·붙여넣기(한 번만 걸어 둠) */
const handlers = {};
let wired = false;
export function onBundle(id, fn) {
  handlers[id] = fn;
  if (wired || !globalThis.document) return;
  wired = true;
  const box = el => el && el.closest && el.closest('[data-bundle-drop]');
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-bundle-pick]'); if (b) { const inp = document.getElementById('bundleFile-' + b.dataset.bundlePick); if (inp) inp.click(); } });
  document.addEventListener('change', e => { const m = /^bundleFile-(.+)$/.exec(e.target.id || ''); if (!m || !handlers[m[1]]) return; const fs = [...e.target.files]; e.target.value = ''; if (fs.length) handlers[m[1]](fs); });
  document.addEventListener('dragover', e => { const b = box(e.target); if (b) { e.preventDefault(); b.classList.add('over'); } });
  document.addEventListener('dragleave', e => { const b = box(e.target); if (b) b.classList.remove('over'); });
  document.addEventListener('drop', e => { const b = box(e.target); if (!b || !handlers[b.dataset.bundleDrop]) return; e.preventDefault(); b.classList.remove('over'); const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (fs.length) handlers[b.dataset.bundleDrop](fs); });
}
export function bundleMsg(id, text) {
  if (text) msgs[id] = text; else delete msgs[id];
  const el = globalThis.document && document.querySelector(`[data-bundle-msg="${id}"]`); if (el) el.textContent = text;
}
