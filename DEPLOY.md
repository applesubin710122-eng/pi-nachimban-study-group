# π 나침반 실서비스 배포

1. 이 폴더 전체를 GitHub 저장소에 업로드합니다.
2. Render에서 New → Blueprint를 선택하고 해당 저장소를 연결합니다.
3. `render.yaml`이 Web Service와 PostgreSQL을 함께 만듭니다.
4. 배포가 완료되면 생성된 `onrender.com` 주소로 접속합니다.
5. 대표 로그인: `study_47_10` / `123456`

## 중요
- 질문 사진은 PostgreSQL BYTEA로 저장되어 Render 재시작에도 DB 데이터가 유지됩니다.
- 미션 인증 사진은 데이터베이스에서 3일 지난 자료를 삭제할 수 있는 운영 API가 포함되어 있습니다. 운영 자동화가 필요하면 Render Cron Job에서 `/api/cleanup`을 호출하도록 추가하면 됩니다.
- 대표 계정으로 처음 로그인한 뒤 비밀번호를 반드시 변경하세요.
