/* 떠 있는 버튼 › 교과 평가계획: 옛 평가 화면(evaluate.js)의 SSAM.inbox로 교과 평어 평가계획을 바꿈 */
import { registerInbox } from '../../core/inbox.js';
import { go } from '../../core/shell.js';

registerInbox('eval-plan', {
  one: true,
  act: files => (files.length > 1 ? `교과 평어의 평가계획으로 하나씩 넣기 (평가계획은 하나라 마지막 「${files[files.length - 1].name}」이 남아요)` : '교과 평어의 평가계획으로 넣기 (지금 평가계획을 이 계획으로 바꿔요)'),
  async run(files) {
    const L = window.SSAM && window.SSAM.inbox;
    if (!L) return '';
    go('evaluate', 'pyeongeo');
    await L.evalPlan(files[0]);
    return '';
  }
});
