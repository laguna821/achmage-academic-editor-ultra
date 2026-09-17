import {SYMBOL_MAP} from './symbolMapping.generated';

/** Only an unambiguous public Unicode mapping may replace a legacy glyph. */
export function symbolUnicode(font:string,hex:string):string|undefined{
  if(!/^(symbol|symbolmt)$/i.test(font.trim())||!/^[0-9a-f]{2,4}$/i.test(hex))return;
  const encoded=parseInt(hex,16),code=encoded>=0xF000&&encoded<=0xF0FF?encoded-0xF000:encoded;
  if(code<0||code>255)return;
  return SYMBOL_MAP[code];
}
