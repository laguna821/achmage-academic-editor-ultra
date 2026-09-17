# HanMark Research Register

- 최종 갱신: 2026-09-15
- 현재 개발 기준: HanMark 2.5.6 공개 HEAD, commit 11649b84ef5983f78ec3a4cc1ed69ab7bd86e651 (핵심 PDF 파일 5개 원격 일치 확인)
- 현재 연구 대상: 2.6.1 정식 Release와 Community 업데이트 게시
- 다음 문서 번호: R-018

이 파일은 HanMark 개발에서 조사 근거가 채팅 기록과 함께 사라지지 않도록 유지하는 연구 장부다. 구현 계획, 코드 변경, 테스트 변경, 릴리스 설명은 관련 R 문서를 먼저 읽고 그 문서의 사실·결정·미해결 항목을 따라야 한다.

## 1. 의무 사용 규칙

1. 개발을 시작하기 전에 이 Register와 작업 범위에 해당하는 모든 R 문서를 읽는다.
2. 구현 계획과 변경 설명에는 참조한 R 번호를 적는다. 예: Research: R-002, R-004, R-006.
3. 기존 문서와 materially 다른 질문, 가정, 증거, 사용자 요구, 보안·호환성 위험이 생기면 다음 R 번호로 새 문서를 만들고 이 표를 같은 변경에서 갱신한다.
4. 같은 질문의 오탈자나 출처 보강은 기존 문서의 변경 이력에 남길 수 있다. 결론을 뒤집거나 범위를 크게 바꾸는 경우에는 새 문서가 기존 문서를 supersede하도록 한다.
5. CONFIRMED는 관찰·소스·재현으로 확인된 사실, PROPOSED는 아직 구현 결정 전인 설계안, REQUIRED는 구현 시 반드시 통과해야 하는 게이트, SUPERSEDED는 더 최신 문서로 대체된 기록을 뜻한다.
6. 관찰 사실과 제안은 한 문단 안에서 섞지 않는다. 추론에는 근거와 한계를 함께 적는다.
7. 사용자 파일의 개인 경로, 원문 내용, 비밀값은 저장소에 복사하지 않는다. 필요한 경우 해시, 크기, 익명화한 관찰값만 기록한다.
8. 관련 REQUIRED 항목을 충족하지 못한 상태에서 기능을 완료로 표시하지 않는다.

## 2. 문서 목록

| ID | 상태 | 제목 | 기준/날짜 | 한 줄 결론 |
|---|---|---|---|---|
| [R-001](R-001-editorial-pdf-output-baseline.md) | CONFIRMED | 첨부 Editorial PDF 출력 기준선 | 2.5.5 / 2026-08-10 | 현재 A4 23쪽 출력, 고정 문구, 실제 색과 반복 장식을 측정했다. |
| [R-002](R-002-editorial-pdf-code-architecture.md) | CONFIRMED | 2.5.5 PDF 코드 구조 | commit 728b2b3 | PDF 설정 계층은 없고 문구·색상이 editorialPdf.ts에 고정돼 있다. |
| [R-003](R-003-novice-pdf-customization-requirements.md) | CONFIRMED | 초보자용 사용자 요구와 UX 계약 | 사용자 피드백 / 2026-08-10 | 요소별 색상 편집이 아니라 키 컬러와 자동 대비, 빈칸 가능한 문구가 핵심이다. |
| [R-004](R-004-safe-semantic-color-system.md) | PROPOSED | 안전한 의미 기반 색상 시스템 | WCAG 2.2, CSS Color 4 | 사용자가 고른 색 하나를 여러 안전 토큰으로 파생해야 한다. |
| [R-005](R-005-256-implementation-blueprint.md) | PROPOSED | 2.5.6 구현 청사진 | R-001~R-004 | 순수 템플릿 모듈, 설정 v9, draft 위저드, 렌더러 주입 경계를 제안한다. |
| [R-006](R-006-verification-and-risk-gates.md) | REQUIRED | 검증·위험·완료 게이트 | 2.5.6 구현 전 필수 | 기본 출력 보존, 대비, 빈 문구, 주입 방지, 인쇄 생명주기 회귀를 검증한다. |
| [R-007](R-007-current-palette-wcag-contrast-audit.md) | CONFIRMED | 현재 팔레트 WCAG 대비 감사 | 첨부 PDF / 2026-08-10 | 핵심 텍스트 조합은 AAA이나 청록/흰색은 2.56:1이며 전체 PDF 접근성 준수와 색 대비는 별개다. |
| [R-008](R-008-named-pdf-theme-product-contract.md) | CONFIRMED | 이름 있는 PDF 테마 라이브러리 제품 계약 | 사용자 결정 / 2026-08-10 | 내장 기본과 여러 사용자 테마, JSON 공유, 경고 후 허용하는 세 색 override를 확정했다. |
| [R-009](R-009-256-release-community-review-gate.md) | REQUIRED | 2.5.6 릴리스와 Community Review 게이트 | 공개 Scorecard / 2026-08-10 | 신규 Warning 0과 Review 3/4 이상을 tag·default branch 변경의 하드 게이트로 삼는다. |
| [R-010](R-010-preview-fidelity-and-boundary-contrast.md) | REQUIRED | PDF 테마 미리보기 충실도와 경계 대비 표현 | 2.5.6 실제 테스트 / 2026-08-10 | 실제 renderer와 미리보기 구조·굵은 글자색을 맞추고 4.5 부근을 최소 통과 구간으로 정확히 안내한다. |
| [R-011](R-011-polarity-and-perceptual-contrast-divergence.md) | CONFIRMED | `#D709D1`의 WCAG·체감 대비 역전과 대비 극성 | 실제 12px glyph / 2026-08-10 | WCAG는 검정을 근소하게 높게 판정하지만 캡처 sRGB의 흰 획은 약 3.5~3.8배 큰 상대 휘도 edge를 만들며, 규범 임계값과 화면 지각 순위를 분리해야 한다. |
| [R-012](R-012-perceptual-on-key-auto-resolution-contract.md) | CONFIRMED | 지각 신호를 고려한 결정적 `onKey` 자동 추천 계약 | 사용자 승인 / 2026-08-10 | WCAG 4.5:1을 하드 게이트로 유지하면서 제한된 `edgeSignal` 조건에서만 색차 0.02 이내의 글자 면을 어둡게 파생하고, 실패하면 exact 면의 기존 안전 후보로 돌아간다. |
| [R-013](R-013-macos-pdf-and-two-column-plan.md) | PROPOSED | macOS PDF 저장과 2단 편집 A/B 구현 계획 | 2.5.6 / 2026-09-15 | macOS 수정 선행, 170mm 본문·10mm 단 간격, B 공통 흐름 뒤 A 전체 폭 그림, 실제 출력 검증을 제안한다. |
| [R-014](R-014-pdf-output-and-floating-layout.md) | REQUIRED | 직접 저장·그림 재배치 구현 계약 | 2.6.0 / 2026-09-15 | 사용자 결정과 실제 출력 검증, 미완료 플랫폼 게이트. |
| [R-015](R-015-dependency-audit-refresh.md) | REQUIRED | 의존성 감사 갱신 | 2.6.0 / 2026-09-15 | 호환 계열 보안 갱신, 배포 의존성 감사 0건. |

| [R-016](R-016-adaptive-table-width.md) | CONFIRMED | 2.6.1 표 자동 폭과 배포 후보 | 사용자 승인 / 2026-09-15 | 표 폭 분리·설정 v11·44개 출력 검증; macOS 실기 생략, 동일 SHA 원격 검사. |
| [R-017](R-017-261-publication-contract.md) | REQUIRED | 2.6.1 정식 배포 계약 | 사용자 승인·공식 가이드 / 2026-09-15 | 최종 SHA 검사 → annotated tag → Actions의 3개 자산·증명 → 기본 브랜치·Community 반영. |

## 3. 이번 연구의 의존 관계

    R-001 실제 출력 ─┐
                     ├─> R-003 사용자 계약 ─┐
    R-002 코드 구조 ─┘                      ├─> R-005 구현 청사진 ─> R-006 검증 게이트
    R-004 색상 안전성 ──────────────────────┘
    R-007 현 팔레트 감사 ────────────────> R-004·R-006의 기준선 보강
    R-008 최종 제품 계약 ───────────────> R-005의 단일 테마 안 대체
    R-009 배포 게이트 ──────────────────> 2.5.6 tag·Release·default branch
    R-010 실제 사용성 회귀 ──────────────> 미리보기·대비 문구 수정 ─> R-006 재검증
    R-011 대비 극성·래스터 분석 ────────> R-012 지각 보정 제품 계약 ──> R-010·R-006 재검증
    R-012 최종 자동색 계약 ─────────────────────────────────────────> R-009 새 SHA 배포 게이트

- R-001과 R-002는 구현 전 기준선이다. 기본 프로필의 호환 여부는 이 둘로 판단한다.
- R-003은 사용자가 요구한 범위다. 기능을 더 복잡하게 만드는 변경은 이 문서와 충돌 여부를 먼저 검토한다.
- R-004와 R-005는 현재 제안이다. 구현 중 다른 결정을 내릴 수 있지만, 그 이유와 대체안을 새 R 문서에 남겨야 한다.
- R-006은 구현을 시작하는 순간 필수 게이트가 된다.
- R-008은 다중 테마와 수동 저대비 override에 관해 R-004·R-005의 상충 제안을 대체한다.
- R-009는 2.5.6 태그와 기본 브랜치 변경 전에 반드시 완료해야 한다.
- R-010은 실제 사용자 테스트로 확인한 preview fidelity와 경계 대비 표현을 수정·재검증하는 필수 게이트다.
- R-011은 WCAG 통과값과 실제 화면 지각 순위가 다를 수 있음을 확인한 사실 근거다. 자동 검정을 “가장 잘 보이는 색”으로 설명하지 않는 해석 계약은 유지한다.
- R-012는 사용자 승인에 따라 R-011의 후속 설계 후보를 최종 resolver 계약으로 확정한다. R-010의 exact 면에서 검정을 최종 자동값으로 고정한 결정은 제한적 `keyTextSurface` 보정으로 대체하되, WCAG 4.5:1·저장 seed·수동 override·내장 출력 불변은 유지한다.
- R-013은 후속 사용자 요청에 따라 PDF 출력 경계와 본문 배치 확장을 제안한다. R-002의 2.5.5 구조와 R-009의 과거 배포 상태를 현재 사실로 혼동하지 않으며, R-008/012의 테마 계약은 보존한다. macOS 재현·구현·2단 실제 출력 검증은 아직 완료되지 않았다.

## 4. 새 문서를 만드는 기준

다음 중 하나라도 해당하면 새 R 문서를 만든다.

- 별도의 사용자 문제나 사용 흐름을 다룬다.
- 새로운 외부 표준, 브라우저 제약, Obsidian API 제약이 설계를 바꾼다.
- 설정 스키마, 렌더링 경계, 보안 모델, 접근성 계약을 바꾼다.
- 기존 결론을 반박하는 재현 결과가 나온다.
- 2.5.6 범위에서 제외한 기능을 다음 버전에 포함하려 한다.

단순 구현 진행 상황, 파일명 변경, 오탈자 수정은 새 번호가 필요하지 않다.

## 5. 문서 작성 형식

새 문서는 [R-TEMPLATE.md](R-TEMPLATE.md)를 복사해 작성한다. 최소한 다음 내용을 포함한다.

- 조사 질문과 범위
- 기준 버전·커밋
- 증거와 재현 방법
- 확인된 사실
- 해석 또는 제안
- 반대안·한계·미해결 질문
- 구현과 테스트에 미치는 영향
- 출처와 변경 이력

## 6. 과거 조사

- [2026-07-26 Preview Import/KAMI 조사](2026-07-26-preview-import-kami-investigation.ko.md)는 R 체계 도입 이전의 legacy 연구다. 해당 주제를 다시 변경할 때 새 R 번호로 핵심 근거를 이관하고 이 Register에 등록한다.

## 7. Register 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-10 | R 체계 도입. 2.5.6 Editorial PDF 연구 R-001~R-006 등록. |
| 2026-08-10 | 사용자 제공 팔레트 평가를 공식 계산과 실제 출력 역할로 재검증한 R-007 등록. |
| 2026-08-10 | 다중 PDF 테마 제품 계약 R-008과 2.5.6 Community 배포 게이트 R-009 등록. |
| 2026-08-10 | 실제 2.5.6 테스트에서 확인한 미리보기 불일치와 경계 대비 안내를 R-010으로 등록. |
| 2026-08-10 | `#D709D1`의 WCAG 판정과 화면 체감 역전을 대비 극성·실제 glyph 픽셀로 검증한 R-011 등록. |
| 2026-08-10 | WCAG hard gate와 지각 edge 조건을 함께 쓰는 제한적 `keyTextSurface` 자동 보정 계약을 R-012로 확정하고 다음 번호를 R-013으로 갱신. |
| 2026-09-15 | 공개 2.5.6 기준 확인과 macOS PDF 저장·2단 A/B 계획 R-013 등록. 다음 번호 R-014. |
| 2026-09-15 | R-014–R-016 구현·후보 검증과 후속 정식 배포 승인 R-017을 등록. 다음 번호 R-018. |

## 3.0.0 journal workspace

R-018: PDF corpus and APA research (CONFIRMED observations / PROPOSED design).
R-019: Accepted journal editor, free layout and tracked-change implementation contract (REQUIRED; in progress).

R-020: [HNMR master, typography and micro-spacing](R-020-hnmr-master-and-spacing.md). Measured first-page geometry, paired abstract/sidebar panels, real font roles, first-line indents and float clearances; remaining editorial quality gates stated explicitly.

R-021: [Original-manuscript-only fidelity](R-021-manuscript-only-fidelity.md). Strict separation of generation inputs and publication oracles, 22-source intake and remaining fidelity gaps.

R-022: [Reference verification and correction](R-022-reference-verification-and-correction.md). Token-free Crossref metadata comparison and human-reviewed correction queue; expanded implementation pending.

R-023: [Publication review and heading transitions](R-023-publication-review-and-heading-transitions.md). Preview hotspots, AOP/issue workflow, metadata confirmation and measured consecutive-heading controls.

R-024: [APA tables and source cleaning](R-024-apa-tables-and-source-cleaning.md). Uniform rules, attached notes, measured cell widths and reviewable reconstruction of packed statistical rows.

R-025: [Table note grammar and readable statistical values](R-025-table-note-grammar-and-readable-values.md). APA note categories, measured paragraph leading, original-source coverage, numeric units and review findings.

R-026: [Source coverage and bounded composition](R-026-source-coverage-and-bounded-composition.md). Independent DOCX/model/PDF checks, content-aligned publication comparison, bounded typography/float/balance rules, APA bibliography and an untouched holdout protocol. Supersedes interpreting the earlier internal 22-document checks as complete source coverage.

R-027: [Reviewable cleaning and shared journal input](R-027-reviewable-cleaning-and-shared-journal-input.md). Reversible source cleanup, placement numbering, local OCR with confirmed cropping, end-matter review, Markdown import/reimport and region-edge heading alignment. Development regression evidence and unresolved source artwork are reported separately.

R-028: [Offline journal size and performance refactor](R-028-offline-journal-refactor.md). Immutable 3.0.0 baseline, lossless resource compression, worker file synchronization, exact-input measurement reuse and output/performance regression.

R-029: [Installed fonts and journal appearance templates](R-029-system-fonts-and-journal-templates.md). Read-only desktop font discovery, project font snapshots, a bounded appearance wizard, general-publication policies and output regression.

R-030: [Editable output and Affinity native evidence](R-030-editable-export-and-affinity-native.md). In-progress IDML handoff, eight read-only native `.af` inspections, source-of-truth boundaries and actual Affinity compatibility gaps.

R-031: [Affinity-informed composition refactor](R-031-affinity-informed-composition-refactor.md). Proposed shared resolved rules/float plans, dependency-aware reuse, measured size limits and the unused typography-cache finding. Implementation and performance claims remain gated.

R-032: [Independent AF writer and composition reuse](R-032-independent-af-writer-and-composition-reuse.md). Native container/text-edit experiments, actual save/reopen validation, exact typography reuse, packed worker, and explicit limits on fresh AF document creation.

R-033: [Fresh AF authoring and 3.2.0 gates](R-033-fresh-af-authoring-and-3.2.0-gates.md). Independent new documents; native text/flow/tables and bounded vector/original-resource/relocation/hyperlink checks verified. Editable-AF integrity is separated from the native-only reproducible PDF color discrepancy; shared-snapshot/exporter implementation may proceed. Representative document/object validation and product integration remain pending.

R-034: [Finalized editable layout capture](R-034-finalized-editable-layout-capture.md). Composition-time body fragments and typography, explicit frame ranges/links, measured table/image/figure-note geometry, IDML fixes and 28-project exact PDF regression. Native AF product integration and host acceptance remain pending.

R-035: [Native manuscript and continuous text flow](R-035-native-manuscript-and-continuous-text-flow.md). Independent real-manuscript AF authoring; 13-page/26-frame body flow verified by native insertion/removal and save/close/reopen. Complete stored body preserved; native PDF tail overset, broader artwork coverage and product controls remain pending.

R-036: [Native paragraph metrics and visible capacity](R-036-native-paragraph-metrics-and-overset.md). Source spacing/hyphenation/heading mapping; complete original tail and 33 table cells visible, 26-frame native reflow and pixel-identical edit-removal/save/reopen. Stored integrity and overset capacity reported separately; product controls and broader coverage remain pending.

R-037: [Journal AF product export and continuation capacity](R-037-journal-af-product-export.md). Journal toolbar/dialog, registered fonts/artwork, shared native writer, asynchronous archive, cancellation/stale-result guards and optional linked pages. Isolated Obsidian export and native save/reopen/extended text flow validated. Ordinary PDF AF integration and broader artwork coverage remain pending.

R-038: [Live manuscript metadata and figure export](R-038-live-manuscript-metadata-and-figure-export.md). Readable missing metadata, direct correction controls, source-ordered caption attachment and missing-figure placeholders in editable exports. Live DOCX/PDF/AF regression and author-input limits recorded.

R-039: [Vector artwork, native masters and frame capacity](R-039-vector-artwork-native-masters-and-frame-capacity.md). Source PDF preservation, official vector Crossmark, editable native masters and page fields, full column workspaces, and the first-in-place-save archive boundary defect with native reproduction and regression checks.

R-040: [Facing spreads and a paired native master](R-040-facing-spreads-and-paired-master.md). Journal AF defaults to paired pages and one two-page master; single-page option, original numbering, continuous body flow and repeat native save/reopen checks.

Next document: R-041. Current development branch: 3.2.0 (in progress); preserved development baseline 3.0.2; published baseline remains 2.6.1 a31a191d21cbb21e45d6ce76bdf187ca5b2502ff.

- [R-041 — 독립 플러그인과 Markdown 원문 워크플로우](R-041-independent-markdown-editor.md)
