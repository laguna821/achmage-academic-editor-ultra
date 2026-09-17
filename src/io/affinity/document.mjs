/** Native AF object graph from the finalized editable snapshot. */
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {NativeRegistry,nativeFields as F} from './native.mjs';
import {nativeMasters} from './masters.mjs';
import {nativeParagraphPlan} from './paragraphs.mjs';
import * as layoutModule from '../editableLayout.ts';
// tsx's Node runner exposes TypeScript as CJS; esbuild uses named exports.
const {validateEditableLayout}='default' in layoutModule?Reflect.get(layoutModule,'default'):layoutModule;
const {field,text,int,real,bool,ref,refs,dbls,rect,local,localArray}=F;
const count=s=>Array.from(s).length;
const hash=b=>createHash('sha256').update(b).digest('hex');
/**
 * @param {import('../editableLayout').EditableLayoutSnapshot} s
 * @param {import('./types').AfResource[]} resources
 * @param {import('./types').AfFont[]} fonts
 * @returns {import('./types').AfDocumentResult}
 */
export function createSnapshotDocument(s,resources,fonts,{dpi=300,pageLayout='single'}={}){
  resources=resources.map(a=>({...a,bytes:Buffer.from(a.bytes)}));
  if(s.version!==2||s.issues.some(i=>i.severity==='error'))throw Error('A validated version-2 layout is required');
  const errors=validateEditableLayout(s).filter(i=>i.severity==='error');
  if(errors.length)throw Error('Invalid editable layout: '+errors.map(i=>i.code+': '+(i.sourceId??'document')).join(', '));
  if(!Number.isFinite(dpi)||dpi<=0||dpi>1200)throw Error('Invalid document DPI');
  if(!['single','facing'].includes(pageLayout))throw Error('Invalid page layout');
  const facing=pageLayout==='facing';
  const scale=dpi/72,r=new NativeRegistry(),object=(t,f)=>r.object(t,f),assets=[],report={stories:[],flows:[],frames:[],tables:[],images:[],shapes:[],fonts:[]};
  const node=(name,x=0,y=0)=>[field('Xfrm',40,[1,0,x*scale,0,1,y*scale]),text('Desc',name),bool('Visi',true),field('Opac',9,1),field('FOpc',9,1),bool('Edtb',true),bool('MEtb',true),int('TrCn',18)];
  const fills=new Map();
  const color=hex=>{if(!/^#[\da-f]{6}$/i.test(hex))throw Error('Unsupported color '+hex);const b=Buffer.alloc(16);[1,3,5].forEach((at,i)=>b.writeFloatLE(parseInt(hex.slice(at,at+2),16)/255,i*4));b.writeFloatLE(1,12);return object(['RGBA'],[field('_col',68,b)]);};
  const fill=hex=>{if(!fills.has(hex))fills.set(hex,object(['FDsc'],[ref('FDeF',object(['FilS','Fill'],[ref('Colr',color(hex))]))]));return fills.get(hex);};
  const none=object(['FDsc'],[ref('FDeF',object(['FilN','Fill'],[]))]);
  const line=(weight)=>{const data=Buffer.alloc(12);data.writeDoubleLE(4);data[9]=1;data[10]=1;return object(['LDsc'],[ref('LDeL',object(['LSty'],[field('Data',44,data),real('Wght',weight*scale),bool('DBal',true)])),bool('LIAh',true)]);};
  const noLine=line(0),links=new Map();
  const hyperlink=url=>{if(!links.has(url))links.set(url,object(['HlkD'],[field('Type',42,2),text('Path',url),int('Page',0),int('Chpt',0),int('Sect',0),bool('IGen',false),bool('IFEx',false)]));return links.get(url);};
  const glyphs=new Map(),paragraphStyles=new Map();
  const glyph=(st,run={})=>{
    if(run.imageId)throw Error('Inline image authoring has not been accepted: '+run.imageId);
    if(run.superscript&&run.subscript)throw Error('Conflicting script positions');
    const bold=!!(run.bold??st.bold),italic=!!(run.italic??st.italic),family=st.font;
    const font=fonts.find(f=>f.family===family&&f.bold===bold&&f.italic===italic);
    if(!font)throw Error(`Exact native font face unavailable: ${family} bold=${bold} italic=${italic}`);
    const key=JSON.stringify([st,run.bold,run.italic,run.href,run.color,run.underline,run.strike,run.superscript,run.subscript]);if(glyphs.has(key))return glyphs.get(key);
    const values=[st.size*scale,0,0,0,st.tracking??0,0,0,0,0,0,st.horizontalScale??1,1,0,st.leading*scale];
    const objects=[fill(run.color??st.color)];
    if(run.href||run.underline||run.strike)objects.push(none,noLine,none,none,fill(run.color??st.color),fill(run.color??st.color),object(['OtAt'],[]),object(['OpAA'],[]),object(['HlkA'],run.href?[ref('Data',hyperlink(run.href))]:[]));
    const locale=new Intl.Locale(st.language??'en').maximize();
    const g=object(['GAtt'],[field('Ints',7,[run.underline?1:0,run.strike?1:0,run.superscript?1:run.subscript?2:0,0,1,0xffffffff,0xffffffff,0,0,0],true),dbls('Doub',values),field('Stri',43,['',[locale.language,locale.region].filter(Boolean).join('-'),'',''],true),refs('Objs',objects),local('DFnt','Font',[text('Post',font.post),text('Famy',font.family),text('Ribi',font.family),int('Wegt',bold?700:400),bool('Ital',italic),int('Widh',5)])]);
    glyphs.set(key,g);if(!report.fonts.includes(font.post))report.fonts.push(font.post);return g;
  };
  const para=(st,breakBefore)=>{
    const key=JSON.stringify([st,breakBefore]);if(paragraphStyles.has(key))return paragraphStyles.get(key);
    const ints=[{left:0,center:1,right:2,justify:3}[st.align??'left'],2,breakBefore==='page'?6:breakBefore==='column'?3:0,0,st.keepNext?1:0,st.keepTogether?1:0,0,0,0,st.hyphenate?1:0,5,2,2,3,0,0,0,1,0,0,0,0,1];
    const ws=st.wordSpacing??{min:.8,desired:1,max:1.33};
    if(![ws.min,ws.desired,ws.max].every(n=>Number.isFinite(n)&&n>0)||ws.min>ws.desired||ws.desired>ws.max)throw Error('Invalid word-spacing limits');
    const values=[st.leading/st.size,st.leading*scale,(st.leftIndent??0)*scale,(st.rightIndent??0)*scale,((st.leftIndent??0)+(st.indent??0))*scale,(st.before??0)*scale,(st.after??0)*scale,36*scale,ws.min,ws.desired,ws.max,0,0,0,0,0,0,0,0,0,0];
    const p=object(['PAtt'],[field('Ints',7,ints,true),dbls('Doub',values),field('Stri',43,['HanMark'],true)]);paragraphStyles.set(key,p);return p;
  };
  const runs=(name,kind,values)=>local(name,kind,[localArray('Runs',name==='GAtt'?'GlAR':'PaAR',values)]);
  function content(paragraphs){
    const parts=[],ps=[];let end=0;
    const plan=nativeParagraphPlan(paragraphs,s.styles);
    for(const [i,p]of plan.entries()){
      for(const {run,style}of p.runs){
        if(run.imageId)throw Error('Inline image authoring has not been accepted: '+run.imageId);
        const value=run.text;
        if(value){parts.push({text:value,field:run.field,style:glyph(style,run)});end+=run.field?1:count(value);}
      }
      if(i+1<plan.length){parts.push({text:'\u2029',style:glyph(p.style)});end++;}
      ps.push({end,style:para(p.style,p.breakBefore)});
    }
    if(!parts.length){parts.push({text:'',style:glyph(Object.values(s.styles)[0])});ps.push({end:0,style:para(Object.values(s.styles)[0])});}
    return {parts,ps,softBreakContinuations:plan.filter(p=>p.softContinuation).length,spacingFloors:plan.filter(p=>p.spacingFloorPt).map(p=>({sourceIds:p.sourceIds,extraPt:p.spacingFloorPt}))};
  }
  const makeStory=(id,paragraphs)=>{
    const c=content(paragraphs);c.parts.push({text:'\0',style:c.parts.at(-1).style});c.ps.at(-1).end++;
    let end=0;const gr=c.parts.map(p=>({fields:[int('Indx',end+=p.field?1:count(p.text)),ref('Item',p.style)]}));
    const value=c.parts.map(p=>p.text).join('');
    const glyp=c.parts.some(p=>p.field)?local('Glyp','GStr',[localArray('Mixd','GSSP',c.parts.map(p=>({fields:[refs('Glys',p.field?[object(['PgNG','Glyp'],[int('Type',0),int('PgNm',0)])]:[]),text('Utf8',p.field?'':p.text)]})))]):local('Glyp','GStr',[text('Utf8',value)]);
    const story=object(['Stry'],[refs('Blok',[object(['StBl'],[glyp,runs('GAtt','GlAS',gr),runs('PAtt','PaAS',c.ps.map(p=>({fields:[int('Indx',p.end),ref('Item',p.style)]})))])])]);
    report.stories.push({sourceId:id,nativeId:story.id,text:value,characters:count(value),softBreakContinuations:c.softBreakContinuations,spacingFloors:c.spacingFloors});return story;
  };
  const stories=new Map(s.stories.map(st=>[st.id,makeStory(st.id,st.paragraphs)]));
  const pageItems=Array.from({length:s.pageCount},()=>[]),frameMap=new Map();
  const add=(page,obj,layer='body',group,master)=>{if(!pageItems[page-1])throw Error('Invalid object page');pageItems[page-1].push({obj,layer,group,master});};
  const shape=(item)=>{
    if(item.stroke&&item.strokeWidth)throw Error('Stroked shapes require native mapping');
    const sh=object(['ShpN','VNod','Node'],[...node(item.id,item.x,item.y),ref('Shpe',object(['ShNR','Shpe'],[bool('AbSz',true)])),rect('ShpB',[0,0,item.width*scale,item.height*scale]),field('BFCr',3,0),refs('BFFl',[item.fill?fill(item.fill):none]),bool('ClrF',true),field('Ctrl',3,146)]);
    report.shapes.push({sourceId:item.id,nativeId:sh.id,page:item.page});return sh;
  };
  for(const sh of s.shapes)add(sh.page,shape(sh),sh.layer??'background',sh.group,sh.master);
  for(const f of s.frames){
    if(f.fill)add(f.page,shape({...f,id:f.id+':fill'}),f.layer??'body',f.group);
    const first=s.stories.find(st=>st.id===f.storyId).paragraphs.find(p=>p.id===f.paragraphIds?.[0]);
    const style=s.styles[first?.style],top=style?.blockTop??(style?.size??10)*.8;
    const frame=object(['TxtF','Node'],[ref('StSt',stories.get(f.storyId)),ref('TxtH',object(['CoFr'],[rect('FrmB',[0,0,f.width*scale,f.height*scale]),dbls('ColW',[f.width*scale]),real('MInA',(top+(f.contentInsetTop??0))*scale)])),bool('IgTW',true),...node(f.id,f.x,f.y)]);
    frameMap.set(f.id,frame);add(f.page,frame,f.layer??'body',f.group,f.master);report.frames.push({...f,nativeId:frame.id});
  }
  for(const story of s.stories){
    const chain=s.frames.filter(f=>f.storyId===story.id).sort((a,b)=>a.order-b.order);
    const frames=chain.map(f=>frameMap.get(f.id));
    const flow=object(['TxFl'],[refs('Nods',frames),bool('HOvr',true)]);
    for(const frame of frames)frame.fields.push(ref('Flow',flow));
    report.flows.push({sourceStoryId:story.id,nativeId:flow.id,nativeStoryId:stories.get(story.id).id,
      frames:chain.map(f=>({sourceId:f.id,nativeId:frameMap.get(f.id).id,page:f.page,x:f.x,y:f.y,order:f.order}))});
  }
  for(const t of s.tables){
    const rowCount=t.rows.length,colCount=t.columns.length,ordered=[...t.cells].sort((a,b)=>a.row-b.row||a.column-b.column),mix=[],gr=[],pr=[];let end=0;
    const cellBreak=object(['BrGl','Glyp'],[field('HdBk',42,0x10004)]);
    for(const [index,cell]of ordered.entries()){
      const c=content(cell.paragraphs),start=end;
      if(index)end++;
      for(const part of c.parts){end+=count(part.text);gr.push({fields:[int('Indx',end),ref('Item',part.style)]});}
      for(const p of c.ps)pr.push({fields:[int('Indx',start+(index?1:0)+p.end),ref('Item',p.style)]});
      const last=index===ordered.length-1;let value=c.parts.map(p=>p.text).join('');
      if(last){value+='\0';end++;gr.at(-1).fields[0]=int('Indx',end);pr.at(-1).fields[0]=int('Indx',end);}
      mix.push({fields:[refs('Glys',index?[cellBreak]:[]),text('Utf8',value)]});
    }
    const story=object(['Stry'],[refs('Blok',[object(['StBl'],[local('Glyp','GStr',[localArray('Mixd','GSSP',mix)]),runs('GAtt','GlAS',gr),runs('PAtt','PaAS',pr)])]),bool('iTab',true)]);
    const pos=values=>{let n=0;return [0,...values.map(v=>n+=v*scale)];};
    const edges=new Map(),edge=weight=>{if(!edges.has(weight))edges.set(weight,line(weight));return {fields:[ref('Line',edges.get(weight)),ref('Fill',fill(t.ruleColor))]};};
    const table=object(['Tabl'],[
      local('CPos','TPos',[dbls('Posn',pos(t.columns)),dbls('MSiz',t.columns.map(n=>n*scale))]),
      local('RPos','TPos',[dbls('Posn',pos(t.rows.map(row=>row.height))),dbls('MSiz',t.rows.map(row=>row.height*scale))]),
      local('CEdg','TEds',[field('Size',21,[colCount+1,rowCount]),localArray('Edge','TEdg',Array.from({length:(colCount+1)*rowCount},()=>edge(0)))]),
      local('REdg','TEds',[field('Size',21,[colCount,rowCount+1]),localArray('Edge','TEdg',Array.from({length:colCount*(rowCount+1)},(_,i)=>{const y=Math.floor(i/colCount);return edge(y===0||y===rowCount?t.outerRule:t.ruleMode==='rows'||(t.rows[y-1]?.header&&!t.rows[y]?.header)?t.innerRule:0);}))]),
      local('Cell','TCls',[field('Size',21,[colCount,rowCount]),localArray('Cell','TCel',Array.from({length:colCount*rowCount},(_,i)=>{const y=Math.floor(i/colCount),x=i%colCount,c=ordered.find(c=>y>=c.row&&y<c.row+c.rowspan&&x>=c.column&&x<c.column+c.colspan);if(!c)throw Error('Missing table cell');return {fields:[rect('Inse',[t.padding*scale,(t.paddingY??t.padding)*scale,t.padding*scale,(t.paddingY??t.padding)*scale]),...(x>c.column?[bool('BrLf',true)]:[]),...(y>c.row?[bool('BrTp',true)]:[])]};}))]),rect('Inst',[0,0,0,0])]);
    const frame=object(['TxtT','Node'],[ref('StSt',story),ref('TxtH',object(['TbFr'],[rect('FrmB',[0,0,t.width*scale,t.height*scale]),ref('Tabl',table)])),...node(t.id,t.x,t.y),field('CLiT',42,4)]);
    frame.fields.push(ref('Flow',object(['TxFl'],[refs('Nods',[frame]),bool('HOvr',true)])));add(t.page,frame,'artwork',t.group);report.tables.push({sourceId:t.id,nativeId:frame.id,storyId:story.id,cells:ordered.map(c=>({id:c.id,text:c.paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\u2029')})),rows:rowCount,columns:colCount});
  }
  function bitmap(asset){
    const fields=[],width=asset.previewWidth,height=asset.previewHeight,rgba=asset.preview;
    if(rgba.length!==width*height*4)throw Error('Invalid preview pixel data');
    const nx=Math.ceil(width/256),ny=Math.ceil(height/256);
    for(let channel=1;channel<=4;channel++){
      const tiles=[];
      for(let ty=0;ty<ny;ty++)for(let tx=0;tx<nx;tx++){
        const b=Buffer.alloc(65536);for(let y=0;y<256&&ty*256+y<height;y++)for(let x=0;x<256&&tx*256+x<width;x++)b[y*256+x]=rgba[((ty*256+y)*width+tx*256+x)*4+channel-1];
        const name='d/'+(assets.length+1);assets.push({name,bytes:b});tiles.push(object(['Blck'],[field('Data',51,{kind:'DatI',name})]));
      }
      fields.push(int('TWi'+channel,nx),int('THi'+channel,ny),refs('Idx'+channel,tiles),field('Sta'+channel,1,tiles.map(()=>4),true));
    }
    return object(['DyBm'],[field('Frmt',42,0),int('BmpW',width),int('BmpH',height),bool('DelA',true),field('MipM',42,4),int('LInf',0),int('TInf',0),...fields]);
  }
  for(const image of s.images){
    const a=resources.find(a=>a.id===image.assetId);if(!a||a.mime!=='application/pdf')throw Error('Prepared vector PDF required: '+image.assetId);
    if(image.crop)throw Error('Native asset crop integration requires acceptance');
    const name='edc/'+(assets.length+1),backing=new NativeRegistry(),guid=hash(a.bytes).slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5').toUpperCase();
    assets.push({name,bytes:backing.document([bool('Link',false),field('Size',4,a.bytes.length),field('Data',45,a.bytes),int('TifO',1)],'Blck')});
    const boxes=Array.from({length:9},(_,i)=>[0,0,...([6,8].includes(i)?[0,0]:[a.width,a.height])]);
    const light=object(['EmPL'],[field('PgCt',7,[2],true),field('PgId',43,[guid],true),bool('AFth',true),refs('SCch',[object(['EmSC'],[int('UCol',2),ref('PBBs',object(['PBxR'],[field('rcts',38,boxes,true)])),bool('part',false)])]),int('SpCt',1),field('Form',42,0)]);
    const info=object(['EDCI'],[field('PgId',43,[guid],true)]),container=object(['EmbC'],[text('File',a.name+'.pdf'),field('EmbC',51,{kind:'\0\0\0\0',name:''}),field('PDFD',51,{kind:'Data',name}),field('PThT',42,12),int('OHDP',72),int('ODPI',72),ref('Lwgt',light),ref('ChIN',info)]);
    const resource=object(['EmbR'],[ref('Cach',bitmap(a)),rect('ChBB',[0,0,a.width,a.height]),field('LoMo',42,1),int('back',0),field('PBBx',42,2),bool('EmAC',true),bool('PssT',true),ref('Lwgt',light),ref('EmCn',container),ref('ChIN',info),text('EmSp',guid)]);
    let w=image.width,h=image.height;if(image.fit==='contain'){const factor=Math.min(w/a.width,h/a.height);w=a.width*factor;h=a.height*factor;}
    const x=image.x+(image.width-w)/2,y=image.y+(image.height-h)/2;
    const native=object(['EmbN','Node'],[...node(image.id).filter(f=>f.name!=='Xfrm'),field('Xfrm',40,[w/a.width*scale,0,(x+w/2)*scale,0,h/a.height*scale,(y+h/2)*scale]),ref('IRDS',object(['FlDS','DSrc'],[text('Filn',a.name+'.pdf')])),text('IRFN',a.name+'.pdf'),field('Flsz',4,a.bytes.length),field('MfTm',8,1789516800),text('FTyN','PDF'),local('RPth','PthT',[text('Path',a.name+'.pdf')]),field('FTyp',42,13),field('IPlc',42,1),bool('AlUp',false),ref('Bitm',resource),int('SIdx',0),bool('IsMs',false),int('AIdx',-1),int('ODPI',72),int('OHDP',-1),real('RDPI',72),...(image.href?[ref('Data',hyperlink(image.href))]:[])]);
    add(image.page,native,'artwork',image.group);report.images.push({sourceId:image.id,nativeId:native.id,assetId:a.id,sha256:hash(a.bytes),x,y,width:w,height:h});
  }
  const pageMeta=(count=facing?2:1)=>object(['SpMd'],[int('splc',1),bool('isfp',facing),bool('isvs',false),bool('isdp',facing),refs('PagR',Array.from({length:count},(_,side)=>object(['PgIn'],[rect('rctp',[side*s.pageWidth*scale,0,(side+1)*s.pageWidth*scale,s.pageHeight*scale]),bool('usmg',!!s.pageMargins),rect('mrgn',s.pageMargins?[s.pageMargins.left,s.pageMargins.top,s.pageMargins.right,s.pageMargins.bottom].map(n=>n*scale):[0,0,0,0])])))]);
  // Keep snapshot/report coordinates page-local; native objects use spread coordinates.
  if(facing)for(const [index,items]of pageItems.entries())if(index%2)for(const item of items){
    const transform=item.obj.fields.find(f=>f.name==='Xfrm');
    transform.value=[...transform.value];transform.value[2]+=s.pageWidth*scale;
  }
  const masters=nativeMasters({object,node,pageMeta,pageItems,report,hash,facing});
  const spreadPages=Array.from({length:Math.ceil(s.pageCount/(facing?2:1))},(_,index)=>Array.from({length:Math.min(facing?2:1,s.pageCount-index*(facing?2:1))},(_,side)=>index*(facing?2:1)+side));
  const spreads=spreadPages.map((indices,index)=>{
    const items=indices.flatMap(i=>pageItems[i]);
    const groups=[...(masters.instances.get(index+1)??[])];
    for(const layer of ['background','furniture','body','artwork']){
      const children=[],grouped=new Map();for(const item of items.filter(i=>i.layer===layer)){if(!item.group)children.push(item.obj);else{if(!grouped.has(item.group))grouped.set(item.group,[]);grouped.get(item.group).push(item.obj);}}
      for(const [name,objects]of grouped)children.push(object(['Grup','Node'],[...node(name),refs('Chld',objects)]));
      if(children.length)groups.push(object(['Grup','Node'],[...node('HanMark '+layer),refs('Chld',children)]));
    }
    return object(['Sprd','Node'],[...node('Pages '+indices.map(i=>i+s.firstPage).join('–')),refs('Chld',groups),ref('SpMd',pageMeta(indices.length)),int('fspo',0),int('npct',indices.length),bool('RfPg',true),bool('SprT',false),ref('BgrC',color('#ffffff'))]);
  });
  const version=object(['ApVs'],[int('Majr',3),int('Minr',2),int('Bild',3),int('Revn',4646),text('Prod','HanMark snapshot native-authoring research'),text('Plat','Win32')]);
  const doc=object(['DocN','LogN','Node'],[...node(s.title),refs('Chld',spreads),refs('MpCh',masters.pages),field('DfSz',36,[s.pageWidth*(facing?2:1),s.pageHeight]),ref('spmd',pageMeta()),refs('DSec',[object(['DocS'],[field('StId',3,0),int('NbFr',s.firstPage),bool('InEx',true)])])]);
  const bytes=r.document([ref('OVer',version),ref('NVer',version),ref('DocR',doc),ref('EdRt',spreads[0]),ref('CLyr',spreads[0]),ref('UVCn',object(['UVCn'],[real('UPPI',dpi),real('VDPI',-1)])),field('UntT',1,7)]);
  return {bytes,assets,report:{...report,pages:s.pageCount,pageLayout,spreads:spreadPages.map((indices,i)=>({nativeId:spreads[i].id,pages:indices.map(n=>n+1)})),dpi,sourceFingerprint:s.fingerprint,objects:r.objects.length,seedDocument:false,applicationUsedToGenerate:false,nativeAcceptance:'pending'}};
}
