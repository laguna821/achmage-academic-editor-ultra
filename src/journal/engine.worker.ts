import init, { TypstCompilerBuilder, type TypstCompiler } from "@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs";

interface EngineMessage { id: number; kind: "init" | "sync" | "compile"; wasm?: Uint8Array; fonts?: Uint8Array[]; source?: string; files?: { path: string; bytes: Uint8Array }[]; removed?:string[]; query?: string; pdf?: boolean }
interface Artifact { result?: Uint8Array; diagnostics?: unknown[] }
interface Compilation { hasError?: boolean; diagnostics?: unknown[] }
interface WorkerHost { onmessage: ((event: MessageEvent<EngineMessage>) => void) | null; postMessage(message: unknown, transfer?: Transferable[]): void }
// This is a dedicated Worker; it has no window or DOM.
const host = self as unknown as WorkerHost;
let compiler: TypstCompiler | null = null;
let work = Promise.resolve();
host.onmessage = event => {
  work = work.then(async () => {
    const message = event.data;
    try {
      if (message.kind === "init") {
        if (!message.wasm) throw new Error("WASM bytes missing");
        await init({ module_or_path: message.wasm.slice().buffer });
        compiler?.free();
        const builder = new TypstCompilerBuilder();
        await builder.set_access_model({}, () => 0, () => false, (path: string) => path, () => { throw new Error("Only project-supplied files are available"); });
        for (const bytes of message.fonts ?? []) await builder.add_raw_font(bytes);
        compiler = await builder.build();
        host.postMessage({ id: message.id, fonts: compiler.get_loaded_fonts() });
        return;
      }
      if(message.kind==="sync"){
        if(!compiler)throw new Error("Compiler not initialized");
        for(const path of message.removed??[])compiler.unmap_shadow(path);
        for(const file of message.files??[])compiler.map_shadow(file.path,file.bytes);
        host.postMessage({id:message.id,metadata:[],diagnostics:[]});return;
      }
      if (!compiler || message.source === undefined) throw new Error("Compiler not initialized");
      compiler.add_source("/main.typ", message.source);
      const world = compiler.snapshot(undefined, "/main.typ", []);
      let failure:unknown;
      let reply:{id:number;pdf?:Uint8Array;metadata:unknown;diagnostics:unknown[]}|undefined;
      try {
        const compiled = world.compile(0, 3) as Compilation;
        if (compiled.hasError) throw new Error(JSON.stringify(compiled.diagnostics));
        const metadata: unknown = JSON.parse(world.query(0, message.query ?? "metadata", "value"));
        const artifact = message.pdf === false ? {} : world.get_artifact(1, 3) as Artifact;
        const pdf = artifact.result?.slice();
        reply={ id: message.id, pdf, metadata, diagnostics: [...(compiled.diagnostics ?? []), ...(artifact.diagnostics ?? [])] };
      } catch(error){failure=error;}
      try{world.free();}catch(error){failure??=error;}
      if(failure)throw failure instanceof Error?failure:new Error(typeof failure==='string'?failure:JSON.stringify(failure));
      if(reply)host.postMessage(reply,reply.pdf?[reply.pdf.buffer]:[]);
    } catch (error) { host.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) }); }
  });
};
