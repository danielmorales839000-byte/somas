/** In-memory Neon HTTP protocol fixture. It is NOT a PostgreSQL/Neon integration. */
export function neonFixture(){
  const state={users:[],workspaces:[],subscriptions:[],sessions:[],queries:[],failCode:null};
  const result=rows=>{
    const names=Object.keys(rows[0]||{});
    return {fields:names.map(name=>({name,dataTypeID:25})),rows:rows.map(row=>names.map(name=>row[name]??null)),rowCount:rows.length};
  };
  function execute({query,params=[]}){
    const q=query.replace(/\s+/g,' ').trim();state.queries.push({query:q,params});
    if(state.failCode)throw Object.assign(new Error('private upstream details'),{code:state.failCode});
    if(q.startsWith('INSERT INTO users')){
      if(state.users.some(u=>u.email===params[1]))throw Object.assign(new Error('private email'),{code:'23505'});
      state.users.push({id:params[0],email:params[1],password_hash:params[2]});return result([]);
    }
    if(q.startsWith('INSERT INTO workspaces')){state.workspaces.push({id:params[0],owner_id:params[1]});return result([]);}
    if(q.startsWith('INSERT INTO subscriptions')){state.subscriptions.push({workspace_id:params[0],plan:'free',status:'trial'});return result([]);}
    if(q.startsWith('INSERT INTO sessions')){state.sessions.push({token_hash:params[0],user_id:params[1]});return result([]);}
    if(q.startsWith('DELETE FROM sessions')){state.sessions=state.sessions.filter(s=>s.token_hash!==params[0]);return result([]);}
    if(q.includes('FROM users WHERE email='))return result(state.users.filter(u=>u.email===params[0]));
    if(q.includes('FROM sessions s JOIN users')){
      const session=state.sessions.find(s=>s.token_hash===params[0]);
      return result(state.users.filter(u=>u.id===session?.user_id).map(({id,email})=>({id,email})));
    }
    if(q.includes('FROM subscriptions s JOIN workspaces'))return result(state.subscriptions.filter(s=>state.workspaces.some(w=>w.id===s.workspace_id&&w.owner_id===params[0])));
    if(q.includes('FROM usage_counters'))return result([]);
    if(q.includes('FROM projects p JOIN workspaces')){
      // Verify the authorization predicate is present, even for an empty fixture.
      if(!q.includes('w.owner_id='))throw new Error('unscoped_project_query');
      return result([]);
    }
    throw new Error('unsupported_fixture_query');
  }
  async function fetch(_url,options){
    const body=JSON.parse(options.body);
    const snapshot=structuredClone({users:state.users,workspaces:state.workspaces,subscriptions:state.subscriptions,sessions:state.sessions});
    try{return Response.json(body.queries?{results:body.queries.map(execute)}:execute(body));}
    catch(error){if(body.queries)Object.assign(state,snapshot);return Response.json({message:error.message,code:error.code},{status:400});}
  }
  return {state,fetch};
}
