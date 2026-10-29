/* 단원평가: 정답지(「문항 이원 분류 및 모범 답안」 표)와 평가지 글을 AI 없이 읽기 (스펙 1, 3.1)
   글은 core/files.js의 readText 결과: 표는 줄마다 「칸 | 칸」 */

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
const SYMBOLS = '㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭';
const MARK = /^[○◯OoVv✓✔●◎]$/;
const cells = line => line.split('|').map(c => c.replace(/\s+/g, ' ').trim());
const num = s => (/^\d+(\.\d+)?$/.test(String(s).trim()) ? Number(s) : 0);

/* 문항 유형 짐작 (스펙 3.1 차례) */
export function itemType(answer, criteria) {
  const a = String(answer || '').trim();
  if (/^\(\s*예\s*\)/.test(a) || String(criteria || '').trim()) return 'essay';
  const bare = a.replace(/[\s,·/]|및/g, '');
  if (bare && [...bare].every(c => CIRCLED.includes(c))) return 'choice';
  if (/^(\(\s*\d+\s*\)\s*[○◯Oo]\s*)+$/.test(a)) return 'choice';
  if (/^\(\s*\d+\s*\)\s*[-–—~]/.test(a)) return 'match';
  if (bare && [...bare].every(c => SYMBOLS.includes(c))) return 'symbol';
  return 'short';
}

export const keyTotal = items => (items || []).reduce((s, i) => s + (Number(i.points) || 0), 0);

function keyMeta(lines) {
  const t = lines.join(' ');
  const m = (re, f = Number) => { const x = re.exec(t); return x ? f(x[1]) : null; };
  return {
    term: m(/([12])\s*학기/),
    grade: m(/\(\s*(\d)\s*\)\s*학년/) ?? m(/(\d)\s*학년/),
    subject: m(/\(\s*([가-힣]+)\s*\)\s*과/, String) || '',
    unitNo: m(/(\d+)\s*단원/),
    round: m(/\(\s*(\d+)\s*회\s*\)/) ?? m(/(\d+)\s*회/)
  };
}

export function parseKey(text) {
  const lines = String(text || '').split('\n');
  const h = lines.findIndex(l => l.includes('|') && cells(l).some(c => /문항/.test(c)) && cells(l).some(c => /정답/.test(c)));
  if (h < 0) return null;
  const head = cells(lines[h]);
  const next = lines[h + 1] ? cells(lines[h + 1]) : [];
  let col, domains = [], start = h + 1;
  const pi = next.findIndex(c => c === '배점');
  if (pi >= 0 && !/^\d+$/.test(next[0])) {
    // 둘째 머리 줄: 「배점」 앞 칸이 행동 영역 이름
    domains = next.slice(0, pi).filter(Boolean);
    const D = pi;
    col = { dom: 2, answer: 2 + D, points: 3 + D, criteria: 4 + D, pages: 5 + D };
    start = h + 2;
  } else {
    const at = re => head.findIndex(c => re.test(c));
    col = { dom: 2, answer: at(/정답/), points: at(/배점/), criteria: at(/채점\s*기준/), pages: at(/쪽/) };
  }
  const items = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    const c = cells(line);
    const get = k => (col[k] >= 0 && c[col[k]] != null ? c[col[k]] : '');
    if (/^\d{1,2}$/.test(c[0])) {
      const dom = domains.filter((_, j) => MARK.test(c[col.dom + j] || ''));
      items.push({ no: Number(c[0]), content: c[1] || '', domain: dom.join('·'), type: '', answer: get('answer'), points: num(get('points')), criteria: get('criteria'), pages: get('pages') });
    } else if (!c[0] && items.length) {
      // 첫 칸이 빈 줄: 앞 문항의 칸에 이어 붙임
      const last = items[items.length - 1];
      for (const k of ['answer', 'criteria', 'pages']) { const v = get(k); if (v) last[k] = (last[k] ? last[k] + ' ' : '') + v; }
    }
  }
  if (!items.length) return null;
  items.forEach(it => { it.type = itemType(it.answer, it.criteria); });
  return { meta: keyMeta(lines.slice(0, h)), domains, items };
}

export function parsePaper(text) {
  const lines = String(text || '').split('\n').map(l => l.trim());
  const head = lines.slice(0, 4).join(' ');
  const sg = /([가-힣]+)\s*(\d)\s*-\s*([12])/.exec(head);
  const un = /(\d+)\.\s*([^|(]+?)\s*\(\s*(\d+)\s*회\s*\)/.exec(head);
  const meta = {
    subject: sg ? sg[1] : '', grade: sg ? Number(sg[2]) : null, term: sg ? Number(sg[3]) : null,
    unitNo: un ? Number(un[1]) : null, unitName: un ? un[2].trim() : '', round: un ? Number(un[3]) : null
  };
  const questions = {};
  let expect = 1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== String(expect)) continue;
    let j = i + 1;
    while (j < lines.length && (!lines[j] || lines[j].startsWith('※'))) j++;
    if (j < lines.length) questions[expect] = lines[j].slice(0, 200);
    expect++;
  }
  return { meta, questions };
}
