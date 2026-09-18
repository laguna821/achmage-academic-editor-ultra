# Markdown 속성 매핑

`aaeu-schema: 1`. 빈 값은 템플릿 또는 본문 값을 상속합니다. `*-hide: true`는 의도적으로 숨깁니다. 반복 속성의 `{n}`은 1–999 정수이며 숫자 순으로 처리됩니다. 날짜와 선언문은 확인한 내용만 입력하세요. `{page}`는 AF의 동적 페이지 번호로 유지됩니다.

| 속성 | 형식 | 용도 | 구분 | 출력 위치 | 안내·예시 |
|---|---|---|---|---|---|
| `aaeu-schema` | integer | 속성 형식 버전 | optional | 첫 페이지 제목·저자 영역 | 속성 형식 버전에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-template` | text | 저널 템플릿 ID | optional | 첫 페이지 제목·저자 영역 | 저널 템플릿 ID에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-title` | text | 논문 제목 | required | 첫 페이지 제목·저자 영역 | 논문 제목에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. AI와 함께 생각하기 |
| `aaeu-running-title` | text | 머리말 축약 제목 | recommended | 두 번째 페이지부터 머리말·쪽번호 | 머리말 축약 제목에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. AI and Learning |
| `aaeu-running-authors` | text | 머리말 저자 | optional | 두 번째 페이지부터 머리말·쪽번호 | 머리말 저자에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. Kim et al. |
| `aaeu-doi` | text | DOI | required | 첫 페이지 발행정보 | DOI에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. 10.1234/example.2026.001 |
| `aaeu-year` | text | 발행 연도 | required | 첫 페이지 발행정보 | 발행 연도에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. 2026 |
| `aaeu-volume` | text | 권 | optional | 첫 페이지 발행정보 | 권에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-issue` | text | 호 | optional | 첫 페이지 발행정보 | 호에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-received` | text | 접수일 | required | 첫 페이지 초록 오른쪽 | 접수일에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. September 1, 2026 |
| `aaeu-revised` | text | 수정일 | required | 첫 페이지 초록 오른쪽 | 수정일에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. September 10, 2026 |
| `aaeu-accepted` | text | 승인일 | required | 첫 페이지 초록 오른쪽 | 승인일에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. September 18, 2026 |
| `aaeu-copyright-year` | text | 판권 연도 | optional | 첫 페이지 발행정보 | 판권 연도에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. 2026 |
| `aaeu-first-page` | integer | 시작 페이지 | optional | 첫 페이지 발행정보 | 시작 페이지에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-publication-mode` | mode | 발행 상태 | optional | 첫 페이지 발행정보 | 발행 상태에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-abstract` | long | 초록 | required | 첫 페이지 초록 영역 | 길이에 맞춰 초록 상자의 높이가 자동 조정됩니다. 빈 줄로 문단을 나눌 수 있습니다. 연구 목적, 방법, 결과를 여러 문단으로 입력할 수 있습니다. |
| `aaeu-keywords` | list | 키워드 | recommended | 첫 페이지 초록 영역 | 키워드에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. AI, 학습, 글쓰기 |
| `aaeu-reference-checks` | boolean | 참고문헌 검사 | optional | 첫 페이지 제목·저자 영역 | 참고문헌 검사에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-publication-text` | text | publication 문구 (빈 값: 템플릿 상속) | optional | 첫 페이지 왼쪽 상단 | 비우면 템플릿 문구를 사용합니다. 직접 입력한 문구는 템플릿을 바꿔도 유지됩니다. {year}, {page} 등의 변수를 사용할 수 있습니다.  |
| `aaeu-publication-hide` | boolean | publication 의도적으로 숨김 | optional | 첫 페이지 왼쪽 상단 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-copyright-text` | long | copyright 문구 (빈 값: 템플릿 상속) | optional | 첫 페이지 하단 | 비우면 템플릿 문구를 사용합니다. 직접 입력한 문구는 템플릿을 바꿔도 유지됩니다. {year}, {page} 등의 변수를 사용할 수 있습니다.  |
| `aaeu-copyright-hide` | boolean | copyright 의도적으로 숨김 | optional | 첫 페이지 하단 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-header-even-text` | text | header-even 문구 (빈 값: 템플릿 상속) | optional | 두 번째 페이지부터 머리말·쪽번호 | 비우면 템플릿 문구를 사용합니다. 직접 입력한 문구는 템플릿을 바꿔도 유지됩니다. {year}, {page} 등의 변수를 사용할 수 있습니다. {journal} {year} |
| `aaeu-header-even-hide` | boolean | header-even 의도적으로 숨김 | optional | 두 번째 페이지부터 머리말·쪽번호 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-header-odd-text` | text | header-odd 문구 (빈 값: 템플릿 상속) | optional | 두 번째 페이지부터 머리말·쪽번호 | 비우면 템플릿 문구를 사용합니다. 직접 입력한 문구는 템플릿을 바꿔도 유지됩니다. {year}, {page} 등의 변수를 사용할 수 있습니다.  |
| `aaeu-header-odd-hide` | boolean | header-odd 의도적으로 숨김 | optional | 두 번째 페이지부터 머리말·쪽번호 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-folio-text` | text | folio 문구 (빈 값: 템플릿 상속) | optional | 두 번째 페이지부터 머리말·쪽번호 | 비우면 템플릿 문구를 사용합니다. 직접 입력한 문구는 템플릿을 바꿔도 유지됩니다. {year}, {page} 등의 변수를 사용할 수 있습니다. {page} |
| `aaeu-folio-hide` | boolean | folio 의도적으로 숨김 | optional | 두 번째 페이지부터 머리말·쪽번호 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-sidebar-order` | list | 오른쪽 정보 순서 | optional | 첫 페이지 초록 오른쪽 | 오른쪽 정보 순서에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-sidebar-received-hide` | boolean | received 숨김 | optional | 첫 페이지 초록 오른쪽 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-sidebar-revised-hide` | boolean | revised 숨김 | optional | 첫 페이지 초록 오른쪽 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-sidebar-accepted-hide` | boolean | accepted 숨김 | optional | 첫 페이지 초록 오른쪽 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-sidebar-correspondence-hide` | boolean | correspondence 숨김 | optional | 첫 페이지 초록 오른쪽 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-author-{n}-name` | text | 저자 {n} name | recommended | 첫 페이지 제목·저자 영역 | 저자 {n} name에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-author-{n}-affiliations` | list | 저자 {n} affiliations | optional | 첫 페이지 제목·저자 영역 | 이 저자가 속한 소속의 번호를 입력합니다. 소속 추가 후 해당 번호를 선택하세요.  |
| `aaeu-author-{n}-email` | text | 저자 {n} email | optional | 첫 페이지 제목·저자 영역 | 저자 {n} email에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. name@example.org |
| `aaeu-author-{n}-address` | long | 저자 {n} address | optional | 첫 페이지 제목·저자 영역 | 저자 {n} address에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-author-{n}-corresponding` | boolean | 저자 {n} 교신저자 | optional | 첫 페이지 제목·저자 영역 | 저자 {n} 교신저자에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-affiliation-{n}-text` | long | 소속 {n} | recommended | 첫 페이지 제목·저자 영역 | 소속 {n}에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-corresponding-name` | text | 별도 교신저자 name | required | 첫 페이지 초록 오른쪽 | 별도 교신저자 name에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. Min Kim |
| `aaeu-corresponding-email` | text | 별도 교신저자 email | required | 첫 페이지 초록 오른쪽 | 별도 교신저자 email에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. editor@example.org |
| `aaeu-corresponding-address` | long | 별도 교신저자 address | optional | 첫 페이지 초록 오른쪽 | 별도 교신저자 address에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다. Department, University, City, Country |
| `aaeu-sidebar-{n}-label` | text | 사용자 정보 {n} 표제 | optional | 첫 페이지 초록 오른쪽 | 사용자 정보 {n} 표제에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-sidebar-{n}-text` | long | 사용자 정보 {n} 내용 | optional | 첫 페이지 초록 오른쪽 | 사용자 정보 {n} 내용에 사용할 실제 정보를 입력하세요. 글꼴·색·배치는 선택한 저널 템플릿이 적용합니다.  |
| `aaeu-sidebar-{n}-hide` | boolean | 사용자 정보 {n} 숨김 | optional | 첫 페이지 초록 오른쪽 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-data-text` | long | Data availability statement | required | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-data-hide` | boolean | Data availability statement 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-data-omission-reason` | text | Data availability statement 제외 사유 (필수 항목을 숨길 때) | optional | 참고문헌 직전 | 저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.  |
| `aaeu-funding-text` | long | Funding Information | required | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-funding-hide` | boolean | Funding Information 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-funding-omission-reason` | text | Funding Information 제외 사유 (필수 항목을 숨길 때) | optional | 참고문헌 직전 | 저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.  |
| `aaeu-conflict-text` | long | Conflict of Interest | required | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-conflict-hide` | boolean | Conflict of Interest 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-conflict-omission-reason` | text | Conflict of Interest 제외 사유 (필수 항목을 숨길 때) | optional | 참고문헌 직전 | 저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.  |
| `aaeu-acknowledgments-text` | long | Acknowledgments | optional | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-acknowledgments-hide` | boolean | Acknowledgments 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-acknowledgments-omission-reason` | text | Acknowledgments 제외 사유 (필수 항목을 숨길 때) | optional | 참고문헌 직전 | 저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.  |
| `aaeu-ethics-text` | long | Ethics statement | optional | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-ethics-hide` | boolean | Ethics statement 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-ethics-omission-reason` | text | Ethics statement 제외 사유 (필수 항목을 숨길 때) | optional | 참고문헌 직전 | 저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.  |
| `aaeu-contributions-text` | long | Author Contributions | optional | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-contributions-hide` | boolean | Author Contributions 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
| `aaeu-contributions-omission-reason` | text | Author Contributions 제외 사유 (필수 항목을 숨길 때) | optional | 참고문헌 직전 | 저널에서 요구하는 항목을 생략한 이유를 기록합니다. 출력 본문에는 들어가지 않습니다.  |
| `aaeu-statement-{n}-title` | text | 추가 말미 정보 {n} 제목 | optional | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-statement-{n}-text` | long | 추가 말미 정보 {n} 내용 | optional | 참고문헌 직전 | 실제 원고에 맞는 내용을 입력하세요. 자동으로 사실을 가정하거나 선언문을 채우지 않습니다.  |
| `aaeu-statement-{n}-hide` | boolean | 추가 말미 정보 {n} 숨김 | optional | 참고문헌 직전 | 켜면 해당 정보와 표제를 출력하지 않습니다. 입력한 값은 보존됩니다.  |
