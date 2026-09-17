import type {ArticleDocument, FigureNode} from './types';

// Review placeholders use the journal's Latin fonts. They never become source metadata.
export const reviewTitle=(d:ArticleDocument):string=>d.title.trim()||'[Title not supplied]';
export const MISSING_CORRESPONDENCE='[Corresponding author details not supplied]';
export const missingFigureSvg=():Uint8Array=>new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect x="1" y="1" width="478" height="158" fill="#fff7f3" stroke="#aa3020"/><text x="24" y="76" font-family="Arial" font-size="20" fill="#aa3020">Figure image required</text></svg>');
export const missingFigureMessage=(n:FigureNode):string=>`${n.caption?.number?'Figure '+n.caption.number:n.id}: ${n.sourceObject?.description||'그림 원본이 없습니다.'} 개체 패널의 ‘원본 그림 연결’에서 파일을 지정하세요. 편집용 출력에는 교체할 자리를 남깁니다.`;
