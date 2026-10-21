/** Limit remote document payload sizes even when Content-Length is absent or dishonest. */
export async function readBoundedText(response,maxBytes=130000){
  if(!response.body)throw new Error('empty_external_response');
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let consumed=0, text='';
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      consumed+=value.byteLength;
      if(consumed>maxBytes)throw new Error('external_source_too_large');
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    return text;
  }finally{await reader.cancel().catch(()=>{});}
}
