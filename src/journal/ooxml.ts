import { DOMParser } from "@xmldom/xmldom";
export function xml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("외부 XML 엔터티는 허용하지 않습니다.");
  const errors: string[] = [];
  const doc = new DOMParser({ errorHandler: { warning: () => undefined, error: (m: string) => errors.push(m), fatalError: (m: string) => errors.push(m) } }).parseFromString(text, "application/xml");
  if (errors.length || !doc.documentElement) throw new Error("DOCX XML을 읽을 수 없습니다.");
  return doc;
}
export const local = (node: Node): string => node.nodeName.split(":").pop() || "";
export function children(root: Node, name?: string): Element[] {
  const result: Element[] = [];
  for (let node = root.firstChild; node; node = node.nextSibling) if (node.nodeType === 1 && (!name || local(node) === name)) result.push(node as Element);
  return result;
}
export function descendants(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter(e => local(e) === name);
}
export const first = (root: Document | Element, name: string): Element | undefined => descendants(root, name)[0];
export function attr(element: Element | undefined, name: string): string {
  if (!element) return "";
  for (let i = 0; i < element.attributes.length; i++) { const a = element.attributes.item(i); if (a && local(a) === name) return a.value; }
  return "";
}
export function relPath(base: string, target: string): string {
  const parts = base.split("/").slice(0, -1);
  for (const part of target.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("DOCX 관계 경로가 패키지를 벗어납니다."); parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}
export const textOf = (root: Document | Element, name: string): string => first(root, name)?.textContent ?? "";
