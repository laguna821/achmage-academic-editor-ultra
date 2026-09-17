import JSZip from "jszip";
import {validateEditableLayout,type EditableLayoutSnapshot,type EditParagraph,type EditStyle,type EditTable,type IdmlExportResult} from "./editableLayout";

const NS="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging",XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
// eslint-disable-next-line no-control-regex -- XML 1.0 excludes these controls; retain tab, LF and CR.
const esc=(s:unknown):string=>String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const num=(n:number):string=>String(Math.round(n*10000)/10000);
const date=new Date("2000-01-01T00:00:00Z");
const pkg=(kind:string,body:string):string=>`${XML}<idPkg:${kind} xmlns:idPkg="${NS}" DOMVersion="8.0">${body}</idPkg:${kind}>`;
const label=(id:string):string=>`<Label><KeyValuePair Key="HanMarkSource" Value="${esc(id)}"/></Label>`;
const geometry=(w:number,h:number):string=>`<PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${[[0,0],[0,h],[w,h],[w,0]].map(p=>`<PathPointType Anchor="${p.map(num).join(" ")}" LeftDirection="${p.map(num).join(" ")}" RightDirection="${p.map(num).join(" ")}"/>`).join("")}</PathPointArray></GeometryPathType></PathGeometry>`;
const zeroInsets='<Properties><InsetSpacing type="list">'+Array.from({length:4},()=>'<ListItem type="unit">0</ListItem>').join('')+'</InsetSpacing></Properties>';

/** Pure IDML writer: no native program, font redistribution, network, or PDF parsing. */
export async function exportIdml(s:EditableLayoutSnapshot,referencePdf:Uint8Array):Promise<IdmlExportResult>{
  const issues=[...s.issues,...validateEditableLayout(s)];
  const errors=issues.filter(i=>i.severity==="error");if(errors.length)throw new Error("IDML 변환 오류: "+errors.map(i=>i.message).join(" / "));
  if(!referencePdf.length)throw new Error("비교용 PDF가 없습니다.");
  const zip=new JSZip(),out=new JSZip();
  const put=(path:string,data:string|Uint8Array,store=false):void=>{zip.file(path,data,{date,compression:store?"STORE":"DEFLATE",createFolders:false});};
  put("mimetype","application/vnd.adobe.indesign-idml-package",true);
  put("META-INF/container.xml",`${XML}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`);
  const ids=new Map<string,string>();let serial=0;const id=(key:string):string=>{let v=ids.get(key);if(!v){v="hm"+(++serial);ids.set(key,v);}return v;};
  const colors=new Map<string,string>();
  const color=(v?:string):string=>{if(!v||v==="transparent"||v==="none")return "Swatch/None";const normalized=/^#[0-9a-f]{6}$/iu.test(v)?v.toLowerCase():"#000000";if(!colors.has(normalized))colors.set(normalized,"Color/HM"+normalized.slice(1));return colors.get(normalized)!;};
  color("#000000");color("#ffffff");
  const assetPaths=new Map<string,string>();
  for(const [index,a]of s.assets.entries()){
    if(!a.bytes.length)throw new Error("빈 그림 파일: "+a.name);
    const ext=({"image/png":"png","image/jpeg":"jpg","image/svg+xml":"svg","application/pdf":"pdf","image/tiff":"tif","image/gif":"gif","image/webp":"webp"} as Record<string,string>)[a.mime];
    if(!ext)throw new Error("IDML에서 지원하지 않는 그림 형식: "+a.mime);
    const path=`Links/asset-${index+1}.${ext}`;assetPaths.set(a.id,path);out.file(path,a.bytes,{date,createFolders:false});
  }
  const styleProps=(st:EditStyle):string=>`<Properties><AppliedFont type="string">${esc(st.font)}</AppliedFont><Leading type="unit">${num(st.leading)}</Leading></Properties>`;
  const styleAttrs=(st:EditStyle):string=>`HorizontalScale="${num((st.horizontalScale??1)*100)}" VerticalScale="100" DesiredGlyphScaling="100" MinimumGlyphScaling="100" MaximumGlyphScaling="100" DesiredWordSpacing="100" MinimumWordSpacing="80" MaximumWordSpacing="133" DesiredLetterSpacing="0" MinimumLetterSpacing="0" MaximumLetterSpacing="0" StrokeWeight="0" StrokeColor="Swatch/None" BaselineShift="0" Skew="0" FillTint="100" Capitalization="Normal" Position="Normal" PointSize="${num(st.size)}" FontStyle="${st.bold?(st.italic?"Bold Italic":"Bold"):(st.italic?"Italic":"Regular")}" FillColor="${esc(color(st.color))}" Justification="${({left:"LeftAlign",right:"RightAlign",center:"CenterAlign",justify:"LeftJustified"})[st.align??"left"]}" FirstLineIndent="${num(st.indent??0)}" LeftIndent="${num(st.leftIndent??0)}" RightIndent="${num(st.rightIndent??0)}" SpaceBefore="${num(st.before??0)}" SpaceAfter="${num(st.after??0)}" Tracking="${num((st.tracking??0)*1000)}" Hyphenation="false" KeepWithNext="${st.keepNext?1:0}"`;
  const paragraph=(p:EditParagraph,fragments:EditParagraph[]=[p]):string=>{
    const st={...s.styles[p.style],after:s.styles[fragments.at(-1)!.style].after};
    const runs=fragments.flatMap(part=>part.runs.map(r=>{
      const st=s.styles[part.style];
      const bold=r.bold??st.bold,italic=r.italic??st.italic;
      const position=r.superscript?' Position="Superscript"':r.subscript?' Position="Subscript"':"";
      const content=r.imageId?imageXml(`inline:${p.id}:${id(JSON.stringify(r))}`,r.imageId,0,0,r.imageWidth??st.size,r.imageHeight??st.leading,true):`<Content>${esc(r.text.replace(/\n/g,"\u2028"))}</Content>`;
      return `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" HorizontalScale="${num((st.horizontalScale??1)*100)}" Tracking="${num((st.tracking??0)*1000)}" PointSize="${num(st.size)}" FontStyle="${bold?(italic?"Bold Italic":"Bold"):(italic?"Italic":"Regular")}"${position}${r.underline?' Underline="true"':""}${r.strike?' StrikeThru="true"':""}${r.color?` FillColor="${esc(color(r.color))}"`:` FillColor="${esc(color(st.color))}"`}>${styleProps(st)}${content}</CharacterStyleRange>`;
    })).join("");
    return `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${id("style:"+p.style)}" ${styleAttrs(st)}${p.breakBefore?` StartParagraph="${p.breakBefore==="page"?"NextPage":"NextColumn"}"`:""}>${styleProps(st)}${runs}<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Br/></CharacterStyleRange></ParagraphStyleRange>`;
  };
  const paragraphsXml=(paragraphs:EditParagraph[]):string=>{
    const groups:EditParagraph[][]=[];
    for(const p of paragraphs){if(p.continued&&groups.length)groups.at(-1)!.push(p);else groups.push([p]);}
    return groups.map(g=>paragraph(g[0],g)).join('');
  };
  const imageXml=(key:string,assetId:string,x:number,y:number,w:number,h:number,inline=false,crop?:{x:number;y:number;width:number;height:number},fit?:"contain"):string=>{
    const a=s.assets.find(a=>a.id===assetId)!;const pdf=a.mime==="application/pdf",tag=pdf?"PDF":"Image";
    const naturalW=a.width??w,naturalH=a.height??h;
    const box=crop??{x:0,y:0,width:1,height:1};let sx=w/(naturalW*box.width),sy=h/(naturalH*box.height);
    if(fit==='contain'&&!crop)sx=sy=Math.min(sx,sy);
    const dx=(w-naturalW*box.width*sx)/2-box.x*naturalW*sx,dy=(h-naturalH*box.height*sy)/2-box.y*naturalH*sy;
    const link=`<Link Self="${id(key+":link")}" LinkResourceURI="file:${esc(assetPaths.get(assetId))}" LinkResourceFormat="${pdf?"PDF":esc(a.mime)}" LinkType="Import"/>`;
    return `<Rectangle Self="${id(key)}" ContentType="GraphicType" ItemLayer="hmArtwork" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${num(x)} ${num(y)}" StrokeWeight="0" FillColor="Swatch/None" StrokeColor="Swatch/None"><Properties>${geometry(w,h)}${label(key)}</Properties>${inline?'<AnchoredObjectSetting AnchoredPosition="InlinePosition"/>':""}<${tag} Self="${id(key+":graphic")}" ItemTransform="${num(sx)} 0 0 ${num(sy)} ${num(dx)} ${num(dy)}"><Properties><GraphicBounds Left="0" Top="0" Right="${num(naturalW)}" Bottom="${num(naturalH)}"/></Properties>${pdf?'<PDFAttribute PageNumber="1" PDFCrop="CropMedia"/>':""}${link}</${tag}></Rectangle>`;
  };
  const frameXml=(key:string,storyId:string,page:number,x:number,y:number,w:number,h:number,prev="n",next="n",fill?:string,inset=0,layer="hmBody",topInset=0):string=>`<TextFrame Self="${id(key)}" ParentStory="${storyId}" PreviousTextFrame="${prev}" NextTextFrame="${next}" ContentType="TextType" ItemLayer="${layer}" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${num(x)} ${num(y)}" StrokeWeight="0" FillColor="${esc(color(fill))}" StrokeColor="Swatch/None"><Properties>${geometry(w,h)}${label(key)}</Properties><TextFramePreference TextColumnCount="1" TextColumnFixedWidth="${num(w)}" FirstBaselineOffset="AscentOffset" MinimumFirstBaselineOffset="${num((s.styles[s.stories.find(st=>id(st.id)===storyId)?.paragraphs[0]?.style??""]?.size??1)*.8)}" VerticalJustification="TopAlign" IgnoreWrap="true">${inset||topInset?'<Properties><InsetSpacing type="list">'+[inset+topInset,inset,inset,inset].map(n=>`<ListItem type="unit">${num(n)}</ListItem>`).join('')+'</InsetSpacing></Properties>':zeroInsets}</TextFramePreference><TextWrapPreference TextWrapMode="None"/></TextFrame>`;
  const storyPaths:string[]=[];
  for(const story of s.stories){const path=`Stories/Story_${id(story.id)}.xml`;storyPaths.push(path);put(path,pkg("Story",`<Story Self="${id(story.id)}" AppliedTOCStyle="n"><StoryPreference OpticalMarginAlignment="false" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>${paragraphsXml(story.paragraphs)}</Story>`));}
  const tableXml=(t:EditTable):string=>{
    const edge=(side:string,weight:number):string=>`${side}EdgeStrokeWeight="${num(weight)}" ${side}EdgeStrokeColor="${esc(color(t.ruleColor))}" ${side}EdgeStrokeType="StrokeStyle/$ID/Solid"`;
    const rows=t.rows.map((r,i)=>`<Row Self="${id(t.id+":row:"+i)}" Name="${i}" SingleRowHeight="${num(r.height)}" MinimumHeight="${num(r.height)}" AutoGrow="true"/>`).join("");
    const columns=t.columns.map((w,i)=>`<Column Self="${id(t.id+":column:"+i)}" Name="${i}" SingleColumnWidth="${num(w)}"/>`).join("");
    const cells=t.cells.map(c=>`<Cell Self="${id(t.id+":cell:"+c.id)}" Name="${c.column}:${c.row}" RowSpan="${c.rowspan}" ColumnSpan="${c.colspan}" CellType="TextTypeCell" TopInset="${num(t.paddingY??t.padding)}" BottomInset="${num(t.paddingY??t.padding)}" LeftInset="${num(t.padding)}" RightInset="${num(t.padding)}" VerticalJustification="TopAlign" FillColor="${esc(color(c.fill))}" ${edge("Top",c.row===0?t.outerRule:0)} ${edge("Bottom",c.row+c.rowspan===t.rows.length?t.outerRule:t.rows[c.row].header||t.ruleMode==="rows"?t.innerRule:0)} ${edge("Left",0)} ${edge("Right",0)}>${paragraphsXml(c.paragraphs)}</Cell>`).join("");
    return `<Table Self="${id(t.id)}" HeaderRowCount="0" FooterRowCount="0" BodyRowCount="${t.rows.length}" ColumnCount="${t.columns.length}" TableDirection="LeftToRightDirection" TopBorderStrokeWeight="0" BottomBorderStrokeWeight="0" LeftBorderStrokeWeight="0" RightBorderStrokeWeight="0" SpaceBefore="0" SpaceAfter="0">${rows}${columns}${cells}</Table>`;
  };
  for(const table of s.tables){const path=`Stories/Story_${id(table.id+":story")}.xml`;storyPaths.push(path);put(path,pkg("Story",`<Story Self="${id(table.id+":story")}"><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/HMTableContainer"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">${tableXml(table)}<Br/></CharacterStyleRange></ParagraphStyleRange></Story>`));}
  const spreadPaths:string[]=[];
  for(let page=1;page<=s.pageCount;page++){
    const items:{xml:string;group?:string}[]=[];
    for(const sh of s.shapes.filter(i=>i.page===page))items.push({group:sh.group,xml:`<Rectangle Self="${id(sh.id)}" ItemLayer="${sh.layer==="furniture"?"hmFurniture":"hmArtwork"}" ContentType="Unassigned" ItemTransform="1 0 0 1 ${num(sh.x)} ${num(sh.y)}" FillColor="${esc(color(sh.fill))}" StrokeColor="${esc(color(sh.stroke))}" StrokeWeight="${num(sh.strokeWidth??0)}"><Properties>${geometry(sh.width,sh.height)}</Properties></Rectangle>`});
    for(const f of s.frames.filter(i=>i.page===page)){
      const chain=s.frames.filter(c=>c.storyId===f.storyId).sort((a,b)=>a.order-b.order),idx=chain.indexOf(f);
      items.push({group:f.group,xml:frameXml(f.id,id(f.storyId),page,f.x,f.y,f.width,f.height,idx?id(chain[idx-1].id):"n",idx+1<chain.length?id(chain[idx+1].id):"n",f.fill,f.inset,f.layer==="furniture"?"hmFurniture":"hmBody",f.contentInsetTop)});
    }
    for(const t of s.tables.filter(i=>i.page===page))items.push({group:t.group,xml:frameXml(t.id+":frame",id(t.id+":story"),page,t.x,t.y,t.width,t.height+2)});
    for(const img of s.images.filter(i=>i.page===page))items.push({group:img.group,xml:imageXml(img.id,img.assetId,img.x,img.y,img.width,img.height,false,img.crop,img.fit)});
    const seen=new Set<string>();const content=items.map(item=>{if(!item.group)return item.xml;if(seen.has(item.group))return "";seen.add(item.group);return `<Group Self="${id("group:"+page+":"+item.group)}" ItemLayer="hmArtwork" ItemTransform="1 0 0 1 0 0"><Properties>${label(item.group)}</Properties>${items.filter(i=>i.group===item.group).map(i=>i.xml).join("")}</Group>`;}).join("");
    const path=`Spreads/Spread_${page}.xml`;spreadPaths.push(path);
    put(path,pkg("Spread",`<Spread Self="hmSpread${page}" PageCount="1" BindingLocation="0" AllowPageShuffle="true"><Page Self="hmPage${page}" Name="${s.firstPage+page-1}" GeometricBounds="0 0 ${num(s.pageHeight)} ${num(s.pageWidth)}" ItemTransform="1 0 0 1 0 0" AppliedMaster="n"><MarginPreference Top="0" Bottom="0" Left="0" Right="0" ColumnCount="1" ColumnGutter="0"/></Page>${content}</Spread>`));
  }
  put("Resources/Styles.xml",pkg("Styles",`<RootCharacterStyleGroup Self="hmCharStyles"><CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/></RootCharacterStyleGroup><RootParagraphStyleGroup Self="hmParaStyles"><ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" ${styleAttrs({font:"Times New Roman",size:11,leading:14,color:"#000000"})}>${styleProps({font:"Times New Roman",size:11,leading:14,color:"#000000"})}</ParagraphStyle><ParagraphStyle Self="ParagraphStyle/HMTableContainer" Name="HM Table container" PointSize="1" SpaceBefore="0" SpaceAfter="0"><Properties><Leading type="unit">1</Leading></Properties></ParagraphStyle>${Object.entries(s.styles).map(([name,st])=>`<ParagraphStyle Self="ParagraphStyle/${id("style:"+name)}" Name="${esc(name)}" ${styleAttrs(st)}>${styleProps(st)}</ParagraphStyle>`).join("")}</RootParagraphStyleGroup><RootObjectStyleGroup Self="hmObjStyles"><ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]"/></RootObjectStyleGroup>`));
  put("Resources/Graphic.xml",pkg("Graphic",`<Swatch Self="Swatch/None" Name="None" ColorEditable="false" ColorRemovable="false"/><StrokeStyle Self="StrokeStyle/$ID/Solid" Name="$ID/Solid"/>${[...colors].map(([hex,key])=>`<Color Self="${key}" Name="${hex}" Model="Process" Space="RGB" ColorValue="${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(" ")}"/>`).join("")}`));
  const families=[...new Set(Object.values(s.styles).map(st=>st.font))];
  put("Resources/Fonts.xml",pkg("Fonts",families.map(f=>`<FontFamily Self="${id("font:"+f)}" Name="${esc(f)}"/>`).join("")));
  put("Resources/Preferences.xml",pkg("Preferences",`<DocumentPreference PageHeight="${num(s.pageHeight)}" PageWidth="${num(s.pageWidth)}" PagesPerDocument="${s.pageCount}" FacingPages="false" DocumentBleedTopOffset="0" DocumentBleedBottomOffset="0" DocumentBleedInsideOrLeftOffset="0" DocumentBleedOutsideOrRightOffset="0"/><TextPreference SmartTextReflow="false"/>`));
  const refs=(kind:string,paths:string[]):string=>paths.map(path=>`<idPkg:${kind} src="${path}"/>`).join("");
  put("designmap.xml",`${XML}<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="8.0(370)"?><Document xmlns:idPkg="${NS}" DOMVersion="8.0" Self="d" Name="${esc(s.title)}" StoryList="${s.stories.map(st=>id(st.id)).concat(s.tables.map(t=>id(t.id+":story"))).join(" ")}" ActiveLayer="hmBody" ZeroPoint="0 0">${["Furniture","Body","Artwork"].map(n=>`<Layer Self="hm${n}" Name="HanMark ${n}" Visible="true" Locked="false" Printable="true"/>`).join("")}<idPkg:Graphic src="Resources/Graphic.xml"/><idPkg:Fonts src="Resources/Fonts.xml"/><idPkg:Styles src="Resources/Styles.xml"/><idPkg:Preferences src="Resources/Preferences.xml"/>${refs("Spread",spreadPaths)}${refs("Story",storyPaths)}</Document>`);
  const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}});
  // eslint-disable-next-line no-control-regex -- Remove controls from the archive's cross-platform filename.
  const title=s.title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu,"_").slice(0,100)||"HanMark";
  out.file(title+".idml",bytes,{date});out.file(title+"_reference.pdf",referencePdf,{date});
  out.file("export-report.html",`<!doctype html><html lang="ko"><meta charset="utf-8"><title>HanMark IDML 검사</title><h1>${esc(s.title)}</h1><p>편집용 IDML · ${s.pageCount}쪽 · 원고 ${esc(s.fingerprint)}</p><p>Affinity에서 줄바꿈과 쪽수가 달라질 수 있습니다. 원본 PDF와 비교하고 텍스트 넘침을 확인하세요. 긴 표는 페이지별 편집 가능한 조각이며 외부에서 자동 재번호·재분할하지 않습니다.</p><h2>필요한 글꼴</h2><ul>${families.map(f=>`<li>${esc(f)}</li>`).join("")}</ul><h2>변환·원고 검사</h2><ul>${issues.map(i=>`<li>${esc(i.sourceSeverity?'원고 '+i.sourceSeverity:i.severity)} · ${esc(i.code)} · ${esc(i.message)}</li>`).join("")||"<li>구조 검사 오류 없음. 외부 프로그램의 조판 결과는 별도 확인이 필요합니다.</li>"}</ul></html>`,{date});
  out.file("README.ko.txt","ZIP을 먼저 폴더에 풉니다. Affinity에서 .idml 파일을 열고 Links 폴더를 함께 보관하세요.\n본문은 연결된 프레임이며 표·캡션은 편집 가능합니다. 글꼴은 이 패키지에 포함되지 않습니다.\n_reference.pdf와 비교하고 넘친 텍스트·그림·표를 확인한 뒤 Affinity 문서로 저장하고 최종 PDF를 출력하세요.\n외부 편집 내용은 HanMark 프로젝트에 자동 반영되지 않습니다.\n",{date});
  return {idml:bytes,package:await out.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}}),issues};
}
