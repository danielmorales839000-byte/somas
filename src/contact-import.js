import {requireThat} from './community.js';
export const MAX_UPLOAD=2*1024*1024,MAX_CONTACTS=1000;
const decode=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
export const maskEmail=s=>s[0]+'•••@'+s.split('@')[1];
async function documentText(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 requireThat(end>=0,'invalid_docx');const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
 requireThat(!v.getUint16(end+4,true)&&!v.getUint16(end+6,true)&&count===v.getUint16(end+8,true)&&count<=2000&&start+size<=end,'invalid_docx');let p=start,total=0,target;const names=new Set();
 for(let i=0;i<count;i++){
  requireThat(p+46<=end&&v.getUint32(p,true)===0x02014b50,'invalid_docx');const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),packed=v.getUint32(p+20,true),raw=v.getUint32(p+24,true),n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
  requireThat(p+46+n+extra+comment<=end,'invalid_docx');const name=decode(bytes.slice(p+46,p+46+n));requireThat(!names.has(name)&&!name.includes('..')&&!name.startsWith('/')&&!name.includes('\\')&&!(flags&1)&&!(/vbaProject|\.bin$/i.test(name)),'unsafe_archive');names.add(name);total+=raw;requireThat(total<=8*1024*1024,'document_expansion_limit');if(name==='word/document.xml')target={method,packed,raw,offset};p+=46+n+extra+comment;
 }
 requireThat(target&&names.has('[Content_Types].xml')&&target.raw<=MAX_UPLOAD&&[0,8].includes(target.method),'invalid_docx');const {method,packed,raw,offset}=target;
 requireThat(offset+30<=start&&v.getUint32(offset,true)===0x04034b50,'invalid_docx');const len=v.getUint16(offset+26,true),data=offset+30+len+v.getUint16(offset+28,true);
 requireThat(decode(bytes.slice(offset+30,offset+30+len))==='word/document.xml'&&v.getUint16(offset+8,true)===method&&data+packed<=start,'invalid_docx');let result=bytes.slice(data,data+packed);
 if(method===8){const reader=new Blob([result]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const parts=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;requireThat(size<=MAX_UPLOAD&&size<=raw,'document_expansion_limit');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}result=new Uint8Array(size);let i=0;for(const b of parts){result.set(b,i);i+=b.length;}}
 requireThat(result.length===raw,'invalid_docx');const xml=decode(result);requireThat(!/<!DOCTYPE|<!ENTITY/i.test(xml),'unsafe_document');
 return [...xml.replace(/<\/(?:\w+:)?p>/g,'<w:t>\n</w:t>').matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')).join('');
}
export async function parseContacts(bytes,name,mime=''){
 requireThat(bytes.length>0&&bytes.length<=MAX_UPLOAD,'upload_size_limit',413);const ext=name.split('.').pop().toLowerCase(),types={docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],csv:['text/csv','text/plain','application/vnd.ms-excel'],txt:['text/plain']};requireThat(types[ext]&&(!mime||types[ext].includes(mime)),'unsupported_file_type',415);
 try{const text=ext==='docx'?await documentText(bytes):decode(bytes),candidates=text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi)||[];const found=[],invalid=[];for(const x of candidates){const email=x.toLowerCase().replace(/[.,;:]+$/,'');if(email.length<=180&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(email))found.push(email);else invalid.push('Malformed email-like text');}const emails=[...new Set(found)].sort();requireThat(emails.length>0,'no_valid_addresses');requireThat(emails.length<=MAX_CONTACTS,'too_many_contacts');return {emails,detected:found.length,unique:emails.length,duplicates:found.length-emails.length,invalid:invalid.length};}catch(e){if(e.status)throw e;throw Object.assign(Error('invalid_document'),{status:400});}
}
