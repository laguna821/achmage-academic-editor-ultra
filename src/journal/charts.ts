import type {ChartData} from "./types";
const escape=(s:string):string=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
/** Supported, data-preserving vector charts. Labels are real SVG text. */
export function chartSvg(chart:ChartData,color="#00663e"):Uint8Array {
  if(chart.horizontal)throw new Error("가로 막대 차트는 원본 그림으로 배치하거나 지원 형식으로 명시적으로 변경하세요.");
  const w=720,h=420,left=64,top=34,right=22,bottom=86,pw=w-left-right,ph=h-top-bottom;
  const values=chart.series.flatMap(s=>s.values.flatMap((v,i)=>[v-(s.errors?.[i]??0),v+(s.errors?.[i]??0)]));
  if(!values.length||values.some(v=>!Number.isFinite(v)))throw new Error("차트 데이터가 올바르지 않습니다.");
  const min=chart.yMin??Math.min(0,...values),max=chart.yMax??Math.max(0,...values),range=max-min||1;
  const y=(v:number):number=>top+ph-(v-min)/range*ph;
  const count=Math.max(chart.categories.length,...chart.series.map(s=>s.values.length));
  const xs=chart.series.flatMap(s=>s.x??[]),xmin=xs.length?Math.min(...xs):0,xmax=xs.length?Math.max(...xs):count-1;
  const x=(v:number):number=>left+(v-xmin)/(xmax-xmin||1)*pw;
  const colors=[color,"#365b83","#b86639","#715b88","#42756e"];
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" font-size="14" fill="#172b24">`];
  for(let i=0;i<=4;i++){const v=min+i*range/4,py=y(v);out.push(`<path d="M${left},${py}H${w-right}" stroke="#d6ddd9" stroke-width="0.8"/><text x="${left-8}" y="${py+5}" text-anchor="end">${escape(Number(v.toPrecision(4)).toString())}</text>`);}
  out.push(`<path d="M${left},${top}V${top+ph}H${w-right}" fill="none" stroke="#263e33" stroke-width="1.2"/>`);
  chart.series.forEach((series,si)=>{
    const c=colors[si%colors.length],points:string[]=[];
    series.values.forEach((value,i)=>{
      const px=chart.type==="bar"?left+(i+.5)*pw/count:chart.type==="scatter"?x(series.x?.[i]??i):left+i*pw/Math.max(1,count-1),py=y(value);
      if(chart.type==="bar") {const bw=pw/count*.75/chart.series.length,bx=px-pw/count*.375+si*bw,zero=y(0);out.push(`<rect x="${bx}" y="${Math.min(py,zero)}" width="${bw}" height="${Math.abs(zero-py)}" fill="${c}"/>`);}
      else {points.push(`${px},${py}`);out.push(`<circle cx="${px}" cy="${py}" r="3.5" fill="${c}"/>`);}
      const error=series.errors?.[i];if(error!==undefined){const a=y(value-error),b=y(value+error);out.push(`<path d="M${px},${a}V${b}M${px-4},${a}H${px+4}M${px-4},${b}H${px+4}" fill="none" stroke="${c}" stroke-width="1.2"/>`);}
    });
    if(chart.type==="line")out.push(`<polyline points="${points.join(" ")}" fill="none" stroke="${c}" stroke-width="1.8"/>`);
    out.push(`<rect x="${left+si*155}" y="${h-24}" width="12" height="3" fill="${c}"/><text x="${left+18+si*155}" y="${h-18}">${escape(series.name)}</text>`);
  });
  if(chart.type!=="scatter")chart.categories.forEach((name,i)=>{const px=chart.type==="bar"?left+(i+.5)*pw/count:left+i*pw/Math.max(1,count-1);out.push(`<text x="${px}" y="${top+ph+22}" text-anchor="middle">${escape(name)}</text>`);});
  else for(let i=0;i<=4;i++){const value=xmin+i*(xmax-xmin)/4;out.push(`<text x="${x(value)}" y="${top+ph+22}" text-anchor="middle">${escape(Number(value.toPrecision(4)).toString())}</text>`);}
  if(chart.title)out.push(`<text x="${w/2}" y="20" text-anchor="middle" font-weight="bold">${escape(chart.title)}</text>`);
  if(chart.xTitle)out.push(`<text x="${w/2}" y="${h-43}" text-anchor="middle">${escape(chart.xTitle)}</text>`);
  if(chart.yTitle)out.push(`<text transform="translate(17,${top+ph/2}) rotate(-90)" text-anchor="middle">${escape(chart.yTitle)}</text>`);
  out.push("</g></svg>");return new TextEncoder().encode(out.join(""));
}
