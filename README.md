# 쌤비서

평가·연수·계획·학급·품의 업무를 왼쪽 세로 메뉴 하나에 모으고, AI가 초안을 쓰면 교사는 확인·수정만 하는 교사용 업무 앱입니다. 2026 한국형-AI 기반 교사개발자 연수(3기-4조) 출품작입니다.

- 기획과 요구사항: [docs/PRD.md](docs/PRD.md)
- 구현 계획: [docs/superpowers/plans/](docs/superpowers/plans/)
- 출발점: 평어 만들기 1.8.0 (교과 평어·창의적 체험활동·행동특성·평가지 채점)

> 지금은 개발 중입니다. 기능이 갖춰지는 대로 설치 파일과 웹판 주소를 여기에 적어요.

## 개발

```bash
npm install
npm run web          # web/ → dist/
npm test             # 함수 시험 (node --test)
npm run e2e          # 화면 시험 (Playwright)
npm run tauri build -- --bundles nsis   # Windows 앱 (Windows에서)
```

자료는 쓰는 사람의 컴퓨터에만 저장되고, AI 요청은 그 컴퓨터에서 AI 회사로 바로 갑니다. AI 키는 레포에 들어가지 않습니다.

만든이: 도구리 · 연락처: raccoon@ai.cne.go.kr
