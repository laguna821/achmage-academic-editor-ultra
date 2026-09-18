import {DIAGNOSTIC_EN} from './i18n.diagnostics';
import {EDITOR_EN} from './i18n.editor';
import {getLanguage} from 'obsidian';
import {EN} from './i18n.generated';

export function uiLanguage(): 'en'|'ko' {return getLanguage().toLowerCase().startsWith('ko')?'ko':'en';}
const catalog={...EN,...EDITOR_EN,...DIAGNOSTIC_EN};
const phrases=Object.entries(catalog).filter(([key])=>/[가-힣]/.test(key)&&!key.includes('{')).sort((a,b)=>b[0].length-a[0].length);
export function translate(text:string,language:string):string{
  if(language.toLowerCase().startsWith('ko'))return text;
  if(catalog[text])return catalog[text];
  if(!/[가-힣]/.test(text))return text;
  // Older projects retain diagnostic messages in their original language.
  let result=text;for(const [key,value]of phrases)if(key.length>8&&result.includes(key))result=result.split(key).join(value);
  return result;
}
/** Translate UI labels only. Manuscript text and saved field keys never pass through this function. */
export function t(text:string,values:Record<string,string|number|undefined>={}):string{return translate(text,uiLanguage()).replace(/\{(\w+)\}/g,(token,key:string)=>values[key]===undefined?token:String(values[key]));}
