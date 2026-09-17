import type {EditIssue,EditableLayoutSnapshot} from '../editableLayout';
export interface AfFont {family:string;post:string;bold:boolean;italic:boolean}
export interface AfResource {
  id:string;name:string;mime:'application/pdf';bytes:Uint8Array;
  width:number;height:number;preview:Uint8Array;previewWidth:number;previewHeight:number;
}
export interface AfProgress {signal?:AbortSignal;progress?:(message:string)=>void}
export type AfPageLayout='single'|'facing';
export interface AfExportOptions extends AfProgress {pageLayout?:AfPageLayout}
export interface AfDocumentResult {
  bytes:Uint8Array;assets:{name:string;bytes:Uint8Array}[];
  report:{pages:number;objects:number;fonts:string[];stories:{sourceId:string;nativeId:number;text:string;characters:number;softBreakContinuations:number;spacingFloors:{sourceIds:string[];extraPt:number}[]}[];frames:unknown[];flows:unknown[];tables:unknown[];images:unknown[];shapes:unknown[];dpi:number;sourceFingerprint:string;seedDocument:boolean;applicationUsedToGenerate:boolean;nativeAcceptance:string};
}
export interface AfExportResult {af:Uint8Array;package:Uint8Array;issues:EditIssue[];snapshot:EditableLayoutSnapshot}
