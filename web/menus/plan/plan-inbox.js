/* 떠 있는 버튼 › 올해 지침·공문: 연간·행사·학급운영 계획 중 골라 그 계획의 지침(참고 자료)으로 */
import { registerInbox } from '../../core/inbox.js';
import { yearGuide } from './year.js';
import { eventGuide } from './event.js';
import { classGuide } from './classplan.js';

const TARGETS = [yearGuide, eventGuide, classGuide];
const NONE = '지침을 넣을 계획이 없어요. 연간·행사·학급운영 계획을 먼저 만들어 주세요.';
const options = () => TARGETS.flatMap(t => { const c = t.current(); return c ? [[`${t.key}:${c.id}`, `${t.label} 「${c.title}」`]] : []; });

registerInbox('guide', {
  act: () => (options().length ? '고른 계획의 지침·참고 자료로 넣기' : NONE),
  fields: () => { const o = options(); return o.length ? [{ key: 'target', label: '어느 계획에 넣을까요', type: 'select', options: o, value: o[0][0], required: true }] : []; },
  async run(files, v, opts) {
    const [key, id] = String(v.target || '').split(':');
    const t = TARGETS.find(x => x.key === key);
    return t ? t.add(id, files, opts) : NONE;
  }
});
