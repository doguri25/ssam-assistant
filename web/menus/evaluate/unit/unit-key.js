/* 단원평가: 정답지(「문항 이원 분류 및 모범 답안」 표)와 평가지 글을 AI 없이 읽기 (스펙 1, 3.1)
   글은 core/files.js의 readText 결과: 표는 줄마다 「칸 | 칸」 */

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
const SYMBOLS = '㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭';
const MARK = /^[○◯OoVv✓✔●◎]$/;
const cells = line => line.split('|').map(c => c.replace(/\s+/g, ' ').trim());
// 「5」·「5점」·「4.5」 → 앞의 수, 수가 아니면 0
const num = s => { const m = /^\s*(\d+(?:\.\d+)?)\s*(점)?\s*$/.exec(String(s)); return m ? Number(m[1]) : 0; };
// 문항 번호 칸: 「1」·「1.」·「1번」
const itemNo = s => { const m = /^(\d{1,2})\s*(?:\.|번)?$/.exec(String(s).trim()); return m ? Number(m[1]) : null; };

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
  const pi = next.findIndex(c => /^(배\s*점|점\s*수)/.test(c));
  if (pi >= 0 && !/^\d+$/.test(next[0])) {
    start = h + 2;
    if (next[0] && next.length < head.length) {
      // 칸을 합친 머리(한글 파일 그대로): 둘째 머리 줄에서 「배점」 앞 칸이 행동 영역 이름
      domains = next.slice(0, pi).filter(Boolean);
      const D = pi;
      col = { dom: Array.from({ length: D }, (_, j) => 2 + j), answer: 2 + D, points: 3 + D, criteria: 4 + D, pages: 5 + D };
    } else {
      // 칸을 합치지 않았거나 합친 칸을 풀어 쓴 머리: 둘째 머리 줄의 칸 자리가 곧 열 자리
      const dom = next.map((c, i) => (c && i < pi && c !== head[i] && !/정답|채점|문항|내용|쪽/.test(c) ? i : -1)).filter(i => i >= 0);
      domains = dom.map(i => next[i]);
      col = { dom, answer: head.findIndex(c => /정답/.test(c)), points: pi, criteria: next.findIndex(c => /채점/.test(c)), pages: head.findIndex(c => /쪽/.test(c)) };
    }
  } else {
    const at = re => head.findIndex(c => re.test(c));
    col = { dom: [], answer: at(/정답/), points: at(/배점/), criteria: at(/채점\s*기준/), pages: at(/쪽/) };
  }
  const items = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    const c = cells(line);
    const get = k => (col[k] >= 0 && c[col[k]] != null ? c[col[k]] : '');
    if (itemNo(c[0]) != null) {
      const dom = domains.filter((_, j) => MARK.test(c[col.dom[j]] || ''));
      items.push({ no: itemNo(c[0]), content: c[1] || '', domain: dom.join('·'), type: '', answer: get('answer'), points: num(get('points')), criteria: get('criteria'), pages: get('pages') });
    } else if (!c[0] && items.length) {
      // 첫 칸이 빈 줄: 앞 문항의 칸에 이어 붙임
      const last = items[items.length - 1];
      for (const k of ['answer', 'criteria', 'pages']) { const v = get(k); if (v) last[k] = (last[k] ? last[k] + ' ' : '') + v; }
    }
  }
  // 정답이나 배점이 빈 문항이 절반을 넘으면 표 모양을 잘못 읽은 것: AI로 읽게 null
  if (!items.length || items.filter(i => !i.answer || !i.points).length > items.length / 2) return null;
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
