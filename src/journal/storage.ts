import {prepareBrandAssets} from './brandAssets';
import JSZip from "jszip";
import type { DataAdapter } from "obsidian";
import { safeProjectPath, validateProject } from "./project";
import { newId, type BinaryStore, type JournalProject } from "./types";

export async function digestBytes(bytes: Uint8Array): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, "0")).join("");
}
export const jsonBytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value, null, 2));
type Adapter = Pick<DataAdapter, "exists" | "mkdir" | "readBinary" | "writeBinary" | "read" | "write" | "rename" | "list">;
interface Head { version: 1; revision: string; sha256: string; parent: string | null }
interface Revision { version: 1; parent: string | null; project: JournalProject }
export class JournalConflictError extends Error {
  constructor(public readonly copyPath: string) { super(`외부 수정과 충돌했습니다. 현재 편집본을 ${copyPath}에 보존했습니다.`); }
}

/** Immutable revisions survive interrupted writes and racing synchronizers. */
export class JournalStore implements BinaryStore {
  private head: Head | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly adapter: Adapter, readonly root: string) {
    if (!safeProjectPath(root)) throw new Error("잘못된 프로젝트 폴더입니다.");
  }
  private resolve(path: string): string {
    if (!safeProjectPath(path)) throw new Error("프로젝트 외부 경로입니다.");
    return `${this.root}/${path}`;
  }
  private async ensureDirectory(path: string): Promise<void> {
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!await this.adapter.exists(current)) {
        try { await this.adapter.mkdir(current); } catch (error) { if (!await this.adapter.exists(current)) throw error; }
      }
    }
  }
  async get(path: string): Promise<Uint8Array | null> {
    const full = this.resolve(path);
    return await this.adapter.exists(full) ? new Uint8Array(await this.adapter.readBinary(full)) : null;
  }
  async put(path: string, bytes: Uint8Array): Promise<void> {
    const full = this.resolve(path);
    await this.ensureDirectory(full.slice(0, full.lastIndexOf("/")));
    await this.adapter.writeBinary(full, bytes.slice().buffer);
  }
  private async readHead(): Promise<Head | null> {
    const raw = await this.get("project.json");
    if (!raw) return null;
    const value = JSON.parse(new TextDecoder().decode(raw)) as Partial<Head>;
    if (value.version !== 1 || !value.revision || !safeProjectPath(value.revision) || !value.sha256) throw new Error("프로젝트 인덱스가 손상됐습니다.");
    return value as Head;
  }
  async load(): Promise<JournalProject> {
    let head: Head | null = null;
    try { head = await this.readHead(); } catch { /* Recover a valid immutable revision below. */ }
    if (head) {
      const raw = await this.get(head.revision);
      if (raw && await digestBytes(raw) === head.sha256) {
        const revision = JSON.parse(new TextDecoder().decode(raw)) as Revision;
        this.head = head;
        return validateProject(revision.project);
      }
    }
    const path = `${this.root}/revisions`;
    if (!await this.adapter.exists(path)) throw new Error("복구할 저널 프로젝트가 없습니다.");
    const { files } = await this.adapter.list(path);
    for (const file of files.filter(f => f.endsWith(".json")).sort().reverse()) {
      try {
        const raw = new Uint8Array(await this.adapter.readBinary(file));
        const revision = JSON.parse(new TextDecoder().decode(raw)) as Revision;
        const project = validateProject(revision.project);
        project.issues.push({ id: "storage-recovered", code: "storage-recovered", severity: "warning", message: "마지막 정상 프로젝트 기록에서 복구했습니다. 내용을 확인한 뒤 새 프로젝트로 저장하세요." });
        this.head = null;
        return project;
      } catch { /* A partial revision cannot displace the last valid revision. */ }
    }
    throw new Error("정상 프로젝트 기록을 찾지 못했습니다.");
  }
  save(project: JournalProject): Promise<void> {
    const snapshot = validateProject(project);
    const operation = this.queue.then(() => this.saveSnapshot(snapshot));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private async saveSnapshot(project: JournalProject): Promise<void> {
    const previous = this.head;
    const revisionPath = `revisions/${Date.now()}-${newId("r")}.json`;
    const raw = jsonBytes({ version: 1, parent: previous?.revision ?? null, project } satisfies Revision);
    await this.put(revisionPath, raw);
    let remote: Head | null;
    try { remote = await this.readHead(); } catch { throw new JournalConflictError(`${this.root}/${revisionPath}`); }
    if ((remote?.sha256 ?? null) !== (previous?.sha256 ?? null)) throw new JournalConflictError(`${this.root}/${revisionPath}`);
    const head: Head = { version: 1, revision: revisionPath, sha256: await digestBytes(raw), parent: previous?.revision ?? null };
    await this.put("project.json", jsonBytes(head));
    const written = await this.readHead();
    if (written?.sha256 !== head.sha256) throw new JournalConflictError(`${this.root}/${revisionPath}`);
    this.head = head;
  }
}

export async function exportJournalArchive(project: JournalProject, store: BinaryStore): Promise<Uint8Array> {
  await prepareBrandAssets(project,store);
  const zip = new JSZip();
  zip.file("journal.json", JSON.stringify(validateProject(project), null, 2));
  const paths = new Set([...project.sources, ...project.assets, ...project.fonts,...project.markdown?.dependencies??[]].map(a => a.path));
  for (const path of paths) {
    const bytes = await store.get(path);
    if (!bytes) throw new Error(`프로젝트 파일이 없습니다: ${path}`);
    zip.file(path, bytes);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function importJournalArchive(bytes: Uint8Array, store: BinaryStore): Promise<JournalProject> {
  if (bytes.length > 256 * 1024 * 1024) throw new Error("프로젝트 ZIP이 256MB를 초과합니다.");
  const zip = await JSZip.loadAsync(bytes);
  if (Object.keys(zip.files).length > 4000) throw new Error("프로젝트에 파일이 너무 많습니다.");
  const file = zip.file("journal.json");
  if (!file) throw new Error("저널 프로젝트 ZIP이 아닙니다.");
  const text = await file.async("string");
  if (text.length > 20 * 1024 * 1024) throw new Error("프로젝트 데이터가 너무 큽니다.");
  const parsed: unknown = JSON.parse(text);
  const project = validateProject(parsed);
  let total = 0;
  const paths = new Map([...project.sources, ...project.assets, ...project.fonts,...project.markdown?.dependencies??[]].map(a => [a.path, a.sha256]));
  for (const [path, hash] of paths) {
    const entry = zip.file(path);
    if (!entry) throw new Error(`프로젝트 파일 누락: ${path}`);
    const content = await entry.async("uint8array");
    total += content.length;
    if (total > 512 * 1024 * 1024) throw new Error("프로젝트 해제 크기가 512MB를 초과합니다.");
    if (await digestBytes(content) !== hash) throw new Error(`프로젝트 파일 해시 불일치: ${path}`);
    await store.put(path, content);
  }
  project.id = newId("journal"); project.revision = 0; project.modified = new Date().toISOString();
  return project;
}
