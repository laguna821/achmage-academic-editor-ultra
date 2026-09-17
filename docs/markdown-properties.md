# Markdown 속성 매핑

`aaeu-schema: 1`. 빈 값은 템플릿 또는 본문 값을 상속합니다. `*-hide: true`는 의도적으로 숨깁니다. 반복 속성의 `{n}`은 1–999 정수이며 숫자 순으로 처리됩니다. 날짜와 선언문은 확인한 내용만 입력하세요. `{page}`는 AF의 동적 페이지 번호로 유지됩니다.

| 속성 | 형식 | 용도 |
|---|---|---|
| `aaeu-schema` | integer | 속성 형식 버전 |
| `aaeu-template` | text | 저널 템플릿 ID |
| `aaeu-title` | text | 논문 제목 |
| `aaeu-running-title` | text | 머리말 축약 제목 |
| `aaeu-running-authors` | text | 머리말 저자 |
| `aaeu-doi` | text | DOI |
| `aaeu-year` | text | 발행 연도 |
| `aaeu-volume` | text | 권 |
| `aaeu-issue` | text | 호 |
| `aaeu-received` | text | 접수일 |
| `aaeu-revised` | text | 수정일 |
| `aaeu-accepted` | text | 승인일 |
| `aaeu-copyright-year` | text | 판권 연도 |
| `aaeu-first-page` | integer | 시작 페이지 |
| `aaeu-publication-mode` | mode | 발행 상태 |
| `aaeu-abstract` | long | 초록 |
| `aaeu-keywords` | list | 키워드 |
| `aaeu-reference-checks` | boolean | 참고문헌 검사 |
| `aaeu-publication-text` | text | publication 문구 (빈 값: 템플릿 상속) |
| `aaeu-publication-hide` | boolean | publication 의도적으로 숨김 |
| `aaeu-copyright-text` | long | copyright 문구 (빈 값: 템플릿 상속) |
| `aaeu-copyright-hide` | boolean | copyright 의도적으로 숨김 |
| `aaeu-header-even-text` | text | header-even 문구 (빈 값: 템플릿 상속) |
| `aaeu-header-even-hide` | boolean | header-even 의도적으로 숨김 |
| `aaeu-header-odd-text` | text | header-odd 문구 (빈 값: 템플릿 상속) |
| `aaeu-header-odd-hide` | boolean | header-odd 의도적으로 숨김 |
| `aaeu-folio-text` | text | folio 문구 (빈 값: 템플릿 상속) |
| `aaeu-folio-hide` | boolean | folio 의도적으로 숨김 |
| `aaeu-sidebar-order` | list | 오른쪽 정보 순서 |
| `aaeu-sidebar-received-hide` | boolean | received 숨김 |
| `aaeu-sidebar-revised-hide` | boolean | revised 숨김 |
| `aaeu-sidebar-accepted-hide` | boolean | accepted 숨김 |
| `aaeu-sidebar-correspondence-hide` | boolean | correspondence 숨김 |
| `aaeu-author-{n}-name` | text | 저자 {n} name |
| `aaeu-author-{n}-affiliations` | list | 저자 {n} affiliations |
| `aaeu-author-{n}-email` | text | 저자 {n} email |
| `aaeu-author-{n}-address` | long | 저자 {n} address |
| `aaeu-author-{n}-corresponding` | boolean | 저자 {n} 교신저자 |
| `aaeu-affiliation-{n}-text` | long | 소속 {n} |
| `aaeu-corresponding-name` | text | 별도 교신저자 name |
| `aaeu-corresponding-email` | text | 별도 교신저자 email |
| `aaeu-corresponding-address` | long | 별도 교신저자 address |
| `aaeu-sidebar-{n}-label` | text | 사용자 정보 {n} 표제 |
| `aaeu-sidebar-{n}-text` | long | 사용자 정보 {n} 내용 |
| `aaeu-sidebar-{n}-hide` | boolean | 사용자 정보 {n} 숨김 |
| `aaeu-data-text` | long | Data availability statement |
| `aaeu-data-hide` | boolean | Data availability statement 숨김 |
| `aaeu-data-omission-reason` | text | Data availability statement 제외 사유 (필수 항목을 숨길 때) |
| `aaeu-funding-text` | long | Funding Information |
| `aaeu-funding-hide` | boolean | Funding Information 숨김 |
| `aaeu-funding-omission-reason` | text | Funding Information 제외 사유 (필수 항목을 숨길 때) |
| `aaeu-conflict-text` | long | Conflict of Interest |
| `aaeu-conflict-hide` | boolean | Conflict of Interest 숨김 |
| `aaeu-conflict-omission-reason` | text | Conflict of Interest 제외 사유 (필수 항목을 숨길 때) |
| `aaeu-acknowledgments-text` | long | Acknowledgments |
| `aaeu-acknowledgments-hide` | boolean | Acknowledgments 숨김 |
| `aaeu-acknowledgments-omission-reason` | text | Acknowledgments 제외 사유 (필수 항목을 숨길 때) |
| `aaeu-ethics-text` | long | Ethics statement |
| `aaeu-ethics-hide` | boolean | Ethics statement 숨김 |
| `aaeu-ethics-omission-reason` | text | Ethics statement 제외 사유 (필수 항목을 숨길 때) |
| `aaeu-contributions-text` | long | Author Contributions |
| `aaeu-contributions-hide` | boolean | Author Contributions 숨김 |
| `aaeu-contributions-omission-reason` | text | Author Contributions 제외 사유 (필수 항목을 숨길 때) |
| `aaeu-statement-{n}-title` | text | 추가 말미 정보 {n} 제목 |
| `aaeu-statement-{n}-text` | long | 추가 말미 정보 {n} 내용 |
| `aaeu-statement-{n}-hide` | boolean | 추가 말미 정보 {n} 숨김 |
