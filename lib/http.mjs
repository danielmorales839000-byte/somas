// Cloudflare Workers supports manual/follow, but rejects redirect: 'error'.
// Keep credentials on their fixed upstream host without following redirects.
export async function fixedEndpointFetch(fetcher,url,options={}){
 const response=await fetcher(url,{...options,redirect:'manual'});
 if(response.status>=300&&response.status<400){
  const error=new Error('Unexpected upstream redirect.');
  error.code='upstream_redirect';
  throw error;
 }
 return response;
}
