import {createHash} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Exact, visible helpers: the exception is confined to user-triggered editor
// events and a detached HTML document, never ambient clipboard reads or live HTML.
export const JOURNAL_EDITOR_BOUNDARY = [
  'const __hanmarkEditorClipboard = (event) => event.isTrusted ? event.clipboardData : null;',
  'const __hanmarkEditorReadHtml = (element) => element.innerHTML;',
  'const __hanmarkEditorWriteHtml = (element, value) => { if (element.ownerDocument.defaultView !== null) throw new Error("Editor paste must use a detached document"); element.innerHTML = value; };'
].join("\n");
export function withoutJournalEditorBoundary(code) {
  if(!code.includes(JOURNAL_EDITOR_BOUNDARY))throw new Error("Reviewed editor boundary is missing or changed");
  return code.replace(JOURNAL_EDITOR_BOUNDARY,"");
}
export const journalEditorBoundaryPlugin={
  name:"reviewed-journal-editor-boundary",
  setup(build){
    build.onLoad({filter:/@codemirror[\\/]lang-markdown[\\/]dist[\\/]index.js$/},async args=>{
      const source=await fs.readFile(args.path,'utf8');
      if(createHash('sha256').update(source).digest('hex')!=='55d8cfa46628ca5cc907d1a991ed81c6872b392a17673c0b8cde396100b216b7')throw Error('Markdown paste source changed; review the boundary');
      return {contents:source.replaceAll('event.clipboardData','__hanmarkEditorClipboard(event)'),loader:'js',resolveDir:path.dirname(args.path)};
    });
    build.onLoad({filter:/yaml[\\/](?:browser[\\/])?dist[\\/]schema[\\/]yaml-1.1[\\/]binary.js$/},async args=>{
      const source=await fs.readFile(args.path,'utf8');
      if(!['ad5b0407d199dda7bc4fbacaee90d2a2a99540c8ced44c13bdf6974cb6dc3ef1','15d7b0b8516c8190b191ec9a0adaab16808d09751ef534d7829512944072011f'].includes(createHash('sha256').update(source).digest('hex')))throw Error('YAML binary codec changed; review the boundary');
      return {contents:source.replace(/\batob\(/g,'globalThis.atob(').replace(/\bbtoa\(/g,'globalThis.btoa('),loader:'js',resolveDir:path.dirname(args.path)};
    });
    build.onLoad({filter:/prosemirror-view[\\/]dist[\\/]index.js$/},async args=>{
      let source=await fs.readFile(args.path,"utf8");
      if(createHash("sha256").update(source).digest("hex")!=="1016bf2aa59e6446f170dada0f98779d3f8e73f75cb2003bf8bf5ce30242451f")throw new Error("ProseMirror clipboard source changed; review the boundary");
      source=source.replace("elt.innerHTML = maybeWrapTrusted(html);","__hanmarkEditorWriteHtml(elt, maybeWrapTrusted(html));")
        .replaceAll("dom.innerHTML","__hanmarkEditorReadHtml(dom)").replaceAll("target.innerHTML","__hanmarkEditorReadHtml(target)")
        .replaceAll("event.clipboardData","__hanmarkEditorClipboard(event)")
        .replaceAll("clipboardData","clipboard");
      return {contents:source,loader:"js",resolveDir:path.dirname(args.path)};
    });
  }
};
