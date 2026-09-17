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
