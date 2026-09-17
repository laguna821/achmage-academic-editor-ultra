# Academic Editor Ultra 시작하기

## 입구

Obsidian 명령 팔레트에서 **Achmage Academic Editor Ultra: 저널 Markdown 원고 만들기**를 실행하세요. 왼쪽 리본의 **Academic Editor Ultra** 아이콘으로도 열 수 있습니다.

새 플러그인 설치 직후에는 커뮤니티 플러그인 설정에서 **Achmage Academic Editor Ultra**를 켜야 합니다. 기존 HanMark PDF 버튼은 일반 문서 출력용입니다.

## 새 Markdown 원고

1. **새 Markdown 원고**에서 HNMR 또는 일반 출판 템플릿을 선택합니다.
2. 생성된 노트의 YAML에 제목·저자·초록·발행정보를 입력합니다. 긴 초록과 선언문은 `|` 아래에 들여써 여러 줄로 작성할 수 있습니다. Obsidian 속성 화면 대신 소스 모드에서 작성해도 같습니다.
3. 평소처럼 `##` 본문 절, `###` 하위 절, Markdown 표와 이미지를 씁니다. 로컬 이미지와 CMDS Eagle에서 받은 HTTPS/R2 이미지 링크를 그대로 사용합니다.
4. 저널 화면에서 **조판**을 누릅니다. 수정할 내용은 **원문 열기**로 돌아가 고친 뒤 다시 조판합니다.
5. 검사 결과를 확인하고 **검토용 PDF**, **최종 PDF**, **IDML**, **AF** 중 필요한 출력을 선택합니다.

```yaml
aaeu-title: "논문 제목"
aaeu-abstract: |
  초록의 첫 문단입니다.

  둘째 문단도 보존됩니다.
aaeu-received: "2026-09-18"
aaeu-corresponding-name: "교신저자 이름"
aaeu-corresponding-email: "author@example.org"
aaeu-corresponding-address: |
  소속과 주소
aaeu-data-text: |
  실제로 확인한 Data Availability Statement를 입력합니다.
```

날짜와 이메일은 예시입니다. 확인한 값으로 바꾸세요. 전체 항목은 [속성 매핑](markdown-properties.md)과 [전체 템플릿](../templates/journal-manuscript.md)에 있습니다.

## 반복 정보와 문구

- 저자·소속·오른쪽 사용자 정보·추가 선언문은 `-1-` 항목을 복사해 `-2-`, `-3-`으로 늘립니다.
- `aaeu-header-even-text`, `aaeu-header-odd-text`는 2페이지 이후 머리말을 바꿉니다. `aaeu-folio-text`에는 `{page}`를 사용할 수 있습니다.
- `aaeu-publication-mode: aop`는 권호·쪽수 표시를 억제하고 입력값은 보관합니다. 정식 권호 출력은 `issue`와 시작 페이지를 지정합니다.
- 문구를 비우면 템플릿 기본값을 씁니다. 완전히 숨기려면 해당 `-hide: true`를 사용합니다.
- DAS·Funding·Conflict of Interest·Acknowledgments 등은 References 앞에 배치됩니다.
- 초록 옆에는 `aaeu-sidebar-1-label`, `aaeu-sidebar-1-text`로 사용자 정보를 추가합니다. 순서는 `aaeu-sidebar-order`로 지정합니다.

## 기존 원고

기존 Markdown 노트를 열고 **현재 Markdown 원문으로 저널 시작**을 실행하세요. 원래 YAML을 지우지 않으며, 필요할 때 속성 안내에서 `aaeu-*` 항목을 복사해 넣습니다. 이미지 URL의 실제 내용이 바뀌었다면 **원격 이미지 새로고침**을 누릅니다.

저자의 Word는 **새 Word 편집본**에서 시작합니다. 이 경로는 본문 편집기를 사용합니다. **HanMark 프로젝트 복사**는 기존 원고와 템플릿을 별도 폴더로 복사하므로 원본은 유지됩니다. 기존 Markdown 편집본에서 수동 수정한 내용도 자동으로 버리지 않습니다.

AF는 디자인 도구에서 마지막 수정을 이어가기 위한 파일입니다. AF에서 한 수정이 원본 Markdown에 반영되지는 않습니다.
