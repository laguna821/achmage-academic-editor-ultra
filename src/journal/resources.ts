import {decodePacked} from './resourceCodec';
import {digestBytes} from './storage';

export interface PackedResource {codec:'br'|'gzip';data:string;bytes:number;sha256:string}
/** Verify the original bytes, independently of the chosen build-time codec. */
export async function unpackResource(resource:PackedResource):Promise<Uint8Array>{
  if(resource.codec!=='br'&&resource.codec!=='gzip')throw new Error('지원하지 않는 내장 리소스 압축 형식입니다.');
  const bytes=await decodePacked(resource.codec,resource.data);
  if(bytes.length!==resource.bytes||await digestBytes(bytes)!==resource.sha256)throw new Error('내장 리소스 검증에 실패했습니다.');
  return bytes;
}
