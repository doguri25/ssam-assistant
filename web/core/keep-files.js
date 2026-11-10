/* 화면을 다시 그려도 파일 칸(input[type=file], id 있는 것)은 그 칸 그대로 둠.
   파일 고르기 창(과 시험의 setInputFiles)은 누를 때의 파일 칸을 붙잡고 있어서, 그사이 다시 그려 칸이 바뀌면
   고른 파일이 떨어져 나간 칸에 들어가 document의 change를 타지 못하고 조용히 사라짐(결과 보고 사진·가정통신문 양식이 가끔 안 들어가던 까닭) */
export function keepFiles(box, draw) {
  const old = box ? [...box.querySelectorAll('input[type="file"][id]')] : [];
  const r = draw();
  for (const o of old) {
    const n = box.querySelector(`#${CSS.escape(o.id)}`);
    if (n && n !== o && n.type === 'file') n.replaceWith(o);
  }
  return r;
}
