/** Only static classifications enter logs/responses. Never log exception messages. */
export function classifyFailure(error){
  if(error?.message==='missing_database_url')return {code:'database_not_configured',status:503};
  if(error?.message==='password_hash_runtime_unsupported')return {code:'password_hash_runtime_unsupported',status:503};
  if(['42P01','42703','3F000'].includes(error?.code))return {code:'database_schema_unavailable',status:503};
  if(['28P01','28000','42501'].includes(error?.code))return {code:'database_access_unavailable',status:503};
  if(['08000','08001','08003','08006','53300','57P01','57P03'].includes(error?.code)||['NeonDbError','AbortError','TimeoutError'].includes(error?.name))return {code:'database_unavailable',status:503};
  return {code:'internal_server_error',status:500};
}

export function reportFailure(error,stage){
  const failure=classifyFailure(error),requestId=crypto.randomUUID();
  console.error(JSON.stringify({event:'somas_request_failure',requestId,stage,code:failure.code}));
  return {...failure,requestId};
}
