import {journalStyles} from "./master";
import {registerFont} from "./fonts";
import {discoverSystemFonts,readSystemFont,type FontCatalog} from "./systemFonts";
import {nodeText,inlineText,type BinaryStore,type JournalProject} from "./types";

export function requiredFontFamilies(p:JournalProject):string[]{
  return [...new Set([...Object.values(journalStyles(p.preset)).map(s=>s.font),...(p.preset.fallbackFonts??[])])];
}
/** One saved family is immutable; do not mix newly installed faces into an older snapshot. */
export async function ensureProjectFonts(p:JournalProject,store:BinaryStore,catalog?:FontCatalog):Promise<string[]>{
  {
    // Recheck scripts after every source revision, even when an earlier Latin
    // manuscript already populated the font snapshot.
    const text=[p.document.title,...p.document.abstract.map(n=>inlineText(n.content)),...p.document.blocks.map(nodeText),JSON.stringify(p.document.authors),JSON.stringify(p.document.journalMetadata)].join("\n");
    const scripts:[RegExp,string[]][]=[[/\p{Script=Hangul}/u,["Malgun Gothic","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR"]],[/\p{Script=Han}/u,["SimSun","Songti SC","Noto Serif CJK SC","Noto Sans CJK SC"]],[/\p{Extended_Pictographic}/u,["Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji"]]];
    for(const [pattern,names]of scripts)if(pattern.test(text)){
      catalog??=await discoverSystemFonts();const family=names.find(name=>catalog!.fonts.some(f=>f.family===name));
      if(family)p.preset.fallbackFonts=[...new Set([...(p.preset.fallbackFonts??[]),family])];
    }
  }
  const needed=requiredFontFamilies(p).filter(name=>!p.fonts.some(f=>f.family.toLowerCase()===name.toLowerCase()));
  if(!needed.length)return [];
  const system=catalog??await discoverSystemFonts(),missing:string[]=[];
  for(const family of needed){
    const matches=system.fonts.filter(f=>f.family.toLowerCase()===family.toLowerCase()),basic=matches.filter(f=>/^(regular|normal|roman|book|bold|italic|oblique|bold italic|bold oblique|collection)$/i.test(f.style)),candidates=basic.length?basic:matches,styles=new Set<string>(),loaded=new Set<string>();let success=false;
    for(const font of candidates){
      if(loaded.has(font.path)||styles.has(font.style.toLowerCase()))continue;loaded.add(font.path);
      try{const value=await readSystemFont(font.id);await registerFont(p,store,value.name,value.bytes);styles.add(font.style.toLowerCase());success=true;}catch{/* Offer substitution if none of the installed files can be read. */}
    }
    if(!success)missing.push(family);
  }
  return missing;
}
