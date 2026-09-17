import fs from 'node:fs';
import {MARKDOWN_PROPERTIES,manuscriptTemplate} from '../src/journal/markdownProperties';
fs.mkdirSync('templates',{recursive:true});
fs.writeFileSync('templates/journal-manuscript.md',manuscriptTemplate());
fs.writeFileSync('docs/markdown-properties.md','# Markdown 속성 매핑\n\n`aaeu-schema: 1`. 빈 값은 템플릿 또는 본문 값을 상속합니다. `*-hide: true`는 의도적으로 숨깁니다. 반복 속성의 `{n}`은 1–999 정수이며 숫자 순으로 처리됩니다. 날짜와 선언문은 확인한 내용만 입력하세요. `{page}`는 AF의 동적 페이지 번호로 유지됩니다.\n\n| 속성 | 형식 | 용도 |\n|---|---|---|\n'+MARKDOWN_PROPERTIES.map(s=>`| \`${s.key}\` | ${s.kind} | ${s.label} |`).join('\n')+'\n');
