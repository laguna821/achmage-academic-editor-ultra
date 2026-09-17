declare module "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs" {
  export * from "@myriaddreamin/typst-ts-web-compiler";
  export { default } from "@myriaddreamin/typst-ts-web-compiler";
}
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
declare module 'tesseract.js-core/tesseract-core-lstm.js' {
  const factory:(options:Record<string,unknown>)=>Promise<unknown>;
  export default factory;
}
declare module 'tesseract.js/src/worker-script/index.js' {
  export function setAdapter(adapter:Record<string,unknown>):void;
  export function dispatchHandlers(packet:unknown,send:(packet:unknown)=>void):void;
}
