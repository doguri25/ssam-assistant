/* 평가지 채점(기존 화면 evaluate.js)의 「한꺼번에 넣기」: 칸 그리기와 나누기·확인 카드를 붙여 줌 (활동지 스펙 3.2) */
import { readBundle, openBundleCard, needsCard, bundleBoxHTML, onBundle, bundleMsg, maskNameFields, memoRows, memoForAI } from '../../core/bundle.js';
import { toast } from '../../core/ui.js';
import '../../core/eval-refs.js';

const SS = () => window.SSAM || {};
SS().bundleBoxHTML = bundleBoxHTML;
// 행특 메모 한꺼번에 넣기·AI로 보내는 메모의 이름 칸 빼기(evaluate.js가 씀)
SS().memoNames = { rows: memoRows, forAI: memoForAI };
onBundle('gr', async files => {
  if (!SS().gr) return;
  bundleMsg('gr', '읽는 중…');
  let b;
  // 평가지 채점 묶음에는 한글에서 내보낸 평가지·정답 PDF(글자층)도 들어오므로 expect는 정하지 않음.
  // 글자층이 있는 학생 스캔(복사기 「검색 가능 PDF」)은 scanLike가 「이름 김민수」로 알아봐 쪽으로 남기고, 그래도 문서가 된 글은 아래에서 이름 칸을 가림
  try { b = await readBundle(files, { say: m => bundleMsg('gr', m), mask: SS().gr.mask() }); }
  catch (e) { bundleMsg('gr', ''); toast(e && e.message === 'PDFJS' ? 'PDF를 읽는 도구를 불러오지 못했어요. 인터넷 연결을 확인하거나 사진으로 넣어 주세요.' : '파일을 읽지 못했어요.', 6000); return; }
  bundleMsg('gr', '');
  if (needsCard(b)) { const r = await openBundleCard(b, { what: '평가지 채점' }); if (!r) { SS().files.freePages(b.pages); return; } b = r; }
  // 정답·기준 글은 학생마다 보내는 채점 요청에 모두 실려 AI로 가니 이름 칸(「이름: 김민수」)만 가림. 정답(인물·도형 이름, 큰 수)은 그대로
  const clean = t => maskNameFields(t);
  SS().gr.putBundle({ ...b, doc: { ...b.doc, teacher: clean(b.doc.teacher), student: clean(b.doc.student) } });
});
// 이 모듈이 늦게 불러졌으면 칸·참고 목록이 보이게 다시 그림
if (SS().gr) SS().gr.refresh();
