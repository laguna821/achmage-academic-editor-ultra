export const pdfMeasurePath=(a:{path:string}):string=>'/'+a.path+'.measure.svg';
/** Inspect embedded bytes: OOXML image part names need not have image extensions. */
export interface ImageInfo { extension:string; mime:string; widthPx?:number; heightPx?:number;aspectRatio?:number }
export function imageInfo(bytes:Uint8Array,name:string,declaredMime?:string):ImageInfo {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(/\.svg$/i.test(name)||declaredMime==='image/svg+xml'){
    const head=new TextDecoder().decode(bytes.subarray(0,4096)),v=head.match(/\bviewBox=["']([^"']+)["']/i)?.[1].trim().split(/[\s,]+/).map(Number);
    const w=v?.[2]??Number(head.match(/\bwidth=["']([\d.]+)/i)?.[1]),h=v?.[3]??Number(head.match(/\bheight=["']([\d.]+)/i)?.[1]);
    return {extension:'svg',mime:'image/svg+xml',aspectRatio:w>0&&h>0&&Number.isFinite(w/h)?w/h:undefined};
  }
  // EMF frame units are hundredths of a millimetre, not raster pixels. Keep
  // their aspect ratio separate so a vector diagram gets no false DPI warning.
  if(bytes.length>=44&&view.getUint32(0,true)===1&&view.getUint32(40,true)===0x464d4520){
    let w=view.getInt32(32,true)-view.getInt32(24,true),h=view.getInt32(36,true)-view.getInt32(28,true);
    if(w<=0||h<=0){w=view.getInt32(16,true)-view.getInt32(8,true);h=view.getInt32(20,true)-view.getInt32(12,true);}
    return {extension:'emf',mime:declaredMime??'image/emf',aspectRatio:w>0&&h>0?w/h:undefined};
  }
  if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return {extension:"png",mime:"image/png",widthPx:view.getUint32(16),heightPx:view.getUint32(20)};
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255){
    let p=2;
    while(p+1<bytes.length){
      if(bytes[p++]!==255)break;
      while(bytes[p]===255)p++;
      const marker=bytes[p++];
      if(marker===217||marker===218)break;
      if(marker===1||(marker>=208&&marker<=215))continue;
      if(p+2>bytes.length)break;
      const size=view.getUint16(p);
      if(size<2||p+size>bytes.length)break;
      if(size>=8&&[192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {extension:"jpg",mime:"image/jpeg",heightPx:view.getUint16(p+3),widthPx:view.getUint16(p+5)};
      p+=size;
    }
    return {extension:"jpg",mime:"image/jpeg"};
  }
  const ext=name.split(".").pop()?.toLowerCase()??"";
  const types:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",svg:"image/svg+xml",gif:"image/gif",webp:"image/webp",tif:"image/tiff",tiff:"image/tiff",emf:"image/emf",wmf:"image/wmf",pdf:"application/pdf"};
  const mime=declaredMime??types[ext]??"application/octet-stream";
  return {extension:types[ext]?ext:Object.keys(types).find(k=>types[k]===mime)??"bin",mime};
}
