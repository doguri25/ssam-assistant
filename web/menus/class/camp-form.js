/* 기초학력 캠프 › 학교 한글 양식(.hwpx) 표 채우기 (스펙 2026-11-11 「학교 한글 양식 표 채우기」).
   core/hwpx-table.js(readTables·pickTable·fillTable)가 들어오면 여기서 채움. 그전까지는 code 'NOT_READY'를 던지고,
   화면(camp.js)은 「학교 한글 양식 채우기는 준비 중이에요…」라고 알린 뒤 기본 양식으로 내려받음.

   약속(camp.js가 부르는 꼴):
     fillCampForm(docId, camp, formBytes) → Promise<{ bytes: Uint8Array, warn?: string[] }>  (Uint8Array만 돌려줘도 됨)
     - docId: 'confirm'(수업 확인서) | 'attend'(출석부: camp.unit 'period'면 교시형, 'day'면 날짜형) | 'observe'(관찰 기록부) | 'report'(결과 보고서)
     - camp: camp-model.js normCamp 꼴(학생 이름 포함 — 이 컴퓨터 안에서만 씀)
     - formBytes: 넣은 .hwpx 파일(Uint8Array)
     - 채울 값은 camp-docs.js의 표 조각을 그대로 쓰면 됨: confirmTable(camp) · attendTable(camp) → { head, rows, footer }(footer 「계」 줄, 날짜형은 null),
       observePages(camp) → [[{ id, name, text }] × 5명씩], hoursText(camp) → 「지도 시간: 총 ( n )시간」, docTitle(docId, camp), camp.teacher
     - 결재란은 그대로 두고, 확인(서명) 칸은 비워 둠. 양식이 맞지 않으면 code가 있는 Error를 던짐(화면은 기본 양식으로 내려받음) */
export async function fillCampForm(docId, camp, formBytes) { // eslint-disable-line no-unused-vars
  const e = new Error('학교 한글 양식 채우기는 준비 중이에요');
  e.code = 'NOT_READY';
  throw e;
}
