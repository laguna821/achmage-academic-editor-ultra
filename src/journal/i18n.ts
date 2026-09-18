import {getLanguage} from 'obsidian';
import {EN} from './i18n.generated';

export function uiLanguage(): 'en'|'ko' {return getLanguage().toLowerCase().startsWith('ko')?'ko':'en';}
export function translate(text:string,language:string):string{return language.toLowerCase().startsWith('ko')?text:EN[text]??text;}
/** Translate UI labels only. Manuscript text and saved field keys never pass through this function. */
export function t(text:string,values:Record<string,string|number>={}):string{return translate(text,uiLanguage()).replace(/\{(\w+)\}/g,(token,key:string)=>values[key]===undefined?token:String(values[key]));}
