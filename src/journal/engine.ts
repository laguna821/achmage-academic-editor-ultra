import { JOURNAL_WORKER_RESOURCE, JOURNAL_WASM_RESOURCE } from "./embedded.generated";
import { digestBytes } from "./storage";
import {unpackResource} from "./resources";
export interface EngineFile {path:string;bytes:Uint8Array;sha256?:string}

export interface EngineOutput { pdf?: Uint8Array; metadata: unknown; diagnostics: unknown[]; fonts?: string[] }
interface WorkerReply extends EngineOutput { id: number; error?: string }
let wasmPromise: Promise<Uint8Array> | null = null;
let workerPromise: Promise<Uint8Array> | null = null;
async function embeddedWasm(): Promise<Uint8Array> {
  if (!wasmPromise) wasmPromise = unpackResource(JOURNAL_WASM_RESOURCE).catch(error => { wasmPromise = null; throw error; });
  return wasmPromise;
}
export class JournalEngine {
  private worker: Worker | null = null;
  private nextId = 0;
  private files=new Map<string,string>();
  private queue:Promise<unknown>=Promise.resolve();
  readonly stats={compileCalls:0,syncCalls:0,fileBytes:0};
  private pending = new Map<number, { resolve(value: EngineOutput): void; reject(error: Error): void }>();
  private ready: Promise<void> | null = null;
  private generation = 0;
  private fontBytes: Uint8Array[] = [];
  loadedFonts: string[] = [];
  fontFingerprint = "";
  private send(message: Record<string, unknown>): Promise<EngineOutput> {
    return new Promise((resolve, reject) => {
      if (!this.worker) { reject(new Error("조판 엔진이 닫혔습니다.")); return; }
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id });
    });
  }
  async initialize(fonts: Uint8Array[]): Promise<void> {
    this.dispose(); this.fontBytes = fonts;
    const generation = this.generation;
    this.ready = (async () => {
      // Decode only the bundled, hash-verified worker. No external code or new
      // codec dependency; keep the decoded bytes across bounded worker restarts.
      if(!workerPromise)workerPromise=unpackResource(JOURNAL_WORKER_RESOURCE).catch(error=>{workerPromise=null;throw error;});
      const workerBytes=await workerPromise;
      if (generation !== this.generation) throw new Error("조판이 취소됐습니다.");
      const url=URL.createObjectURL(new Blob([workerBytes.slice().buffer],{type:"text/javascript"}));
      try{this.worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
      this.worker.onmessage=(event:MessageEvent<WorkerReply>)=>{
        const message=event.data,pending=this.pending.get(message.id);if(!pending)return;
        this.pending.delete(message.id);
        if(message.error)pending.reject(new Error(message.error));else pending.resolve(message);
      };
      this.worker.onerror=event=>{const error=new Error(event.message||"조판 작업 오류");for(const pending of this.pending.values())pending.reject(error);this.pending.clear();};
      const fingerprint = (await Promise.all(fonts.map(digestBytes))).join(":");
      if (generation !== this.generation) throw new Error("조판이 취소됐습니다.");
      this.fontFingerprint = fingerprint;
      const wasm = await embeddedWasm();
      if (generation !== this.generation) throw new Error("조판이 취소됐습니다.");
      const result = await this.send({ kind: "init", wasm, fonts });
      this.loadedFonts = result.fonts ?? [];
    })();
    return this.ready;
  }
  async compile(source:string,files:EngineFile[]=[],pdf=true):Promise<EngineOutput>{
    const ready=this.ready??this.initialize(this.fontBytes);
    const generation=this.generation;
    const active=():void=>{if(generation!==this.generation)throw new Error("조판이 취소됐습니다.");};
    const job=this.queue.then(async()=>{
      await ready;active();
      const next=new Map<string,string>(),changed:EngineFile[]=[];
      for(const file of files){
        const hash=file.sha256??await digestBytes(file.bytes);active();
        if(next.has(file.path))throw new Error("중복 조판 파일 경로: "+file.path);
        next.set(file.path,hash);if(this.files.get(file.path)!==hash)changed.push(file);
      }
      const removed=[...this.files.keys()].filter(path=>!next.has(path));
      if(changed.length||removed.length){
        await this.send({kind:"sync",files:changed,removed});active();
        this.files=next;this.stats.syncCalls++;this.stats.fileBytes+=changed.reduce((n,f)=>n+f.bytes.byteLength,0);
      }
      this.stats.compileCalls++;
      return this.send({kind:"compile",source,pdf});
    });
    this.queue=job.catch(()=>undefined);
    return job.catch(error=>{
      const message=error instanceof Error?error.message:String(error),match=/"range":"(\d+):/.exec(message),line=match?Number(match[1]):0;
      throw new Error(message+(line?"\n"+source.split("\n").slice(Math.max(0,line-1),line+2).join("\n"):""));
    });
  }
  cancel(): void { this.dispose(); }
  /** Release WASM memoization after a bounded candidate-measurement phase. */
  async restart():Promise<void>{await this.initialize(this.fontBytes);}
  dispose(): void {
    this.generation++;this.files.clear();this.queue=Promise.resolve();
    this.worker?.terminate(); this.worker = null; this.ready = null;
    for (const pending of this.pending.values()) pending.reject(new Error("조판이 취소됐습니다."));
    this.pending.clear();
  }
}
