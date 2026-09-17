/** Translate block-edge spacing into baseline-based native paragraph spacing.
 * Output-only: original runs, paragraphs and linked-frame geometry stay intact.
 */
export function nativeParagraphPlan(paragraphs,styles){
  const groups=[];
  for(const p of paragraphs){
    if(p.continued&&groups.length)groups.at(-1).push(p);
    else groups.push([p]);
  }
  const result=[];
  for(const group of groups){
    const first=styles[group[0].style],last=styles[group.at(-1).style];
    let part={style:{...first,after:last.after},runs:[],softContinuation:false,breakBefore:group[0].breakBefore,sourceIds:group.map(p=>p.id)};
    for(const p of group)for(const run of p.runs){
      // Affinity justifies a U+2028 line even when it contains only a short
      // label. A zero-gap, zero-indent paragraph continuation reproduces the
      // source's non-justifying forced line break while remaining editable.
      const pieces=run.text.replace(/\r\n?/g,'\n').replace(/\u2028/g,'\n').split('\n');
      for(const [i,value]of pieces.entries()){
        if(i){
          part.style.after=0;part.style.keepNext=true;result.push(part);
          part={style:{...first,before:0,after:last.after,indent:0},runs:[],softContinuation:true,sourceIds:group.map(p=>p.id)};
        }
        if(value||run.imageId)part.runs.push({run:{...run,text:value},style:styles[p.style]});
      }
    }
    result.push(part);
  }
  for(const [i,p]of result.entries()){
    const next=result[i+1];
    if(next&&!next.softContinuation&&p.style.blockBottom!==undefined&&next.style.blockTop!==undefined){
      // Source baseline delta: bottom edge + block gap + next top edge.
      // Native baseline delta: next leading + before/after paragraph spacing.
      const after=(p.style.after??0)+p.style.blockBottom+next.style.blockTop-next.style.leading;
      // Native paragraph spacing clamps a negative after value to zero.
      // Consume the next before-space first (e.g. abstract -> keywords).
      // Any remaining deficit cannot be represented without changing leading;
      // report it instead of shrinking type or pretending exact fidelity.
      p.style.after=Math.max(0,after);
      if(after<0){
        const before=(next.style.before??0)+after;
        next.style.before=Math.max(0,before);
        if(before < -1e-9)p.spacingFloorPt=-before;
      }
      if(Math.abs(p.style.after)<1e-9)p.style.after=0;
    }
  }
  return result;
}
