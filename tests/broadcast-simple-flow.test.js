import test from 'node:test';
import assert from 'node:assert/strict';
import {adminMarkup} from '../public/exhibition/admin-ui.js';
import {startDocumentBroadcast} from '../public/exhibition/document-broadcasts-ui.js';
test('admin navigation has only Broadcasts and no separate imported contacts tab',()=>{const html=adminMarkup();assert.match(html,/data-admin-tab="broadcasts"/);assert.doesNotMatch(html,/data-admin-tab="contacts"|Imported Contacts/);});
test('one Broadcast action analyzes document and starts its campaign without a review step',async()=>{
 const calls=[],file=new File(['a@gmail.com\na@gmail.com'],'contacts.txt',{type:'text/plain'});
 const result=await startDocumentBroadcast(file,'Subject','Message',{upload:async(path,options)=>{calls.push('analyze');assert.equal(path,'/api/admin/contacts/import/preview');assert.equal(options.body.get('file').name,'contacts.txt');return Response.json({token:'sealed-preview',sender:'owner'});},request:async(path,method,body)=>{calls.push(path);if(path==='/api/admin/document-broadcasts'){assert.deepEqual(body,{subject:'Subject',body:'Message',token:'sealed-preview',sender:'owner'});return {id:'campaign'};}assert.deepEqual(body,{confirm:true});return {queued:true};}});
 assert.equal(result.id,'campaign');assert.deepEqual(calls,['analyze','/api/admin/document-broadcasts','/api/admin/document-broadcasts/campaign/send']);
});
test('an analysis failure never creates or sends a campaign',async()=>{let writes=0;await assert.rejects(()=>startDocumentBroadcast(new File(['bad'],'bad.txt'),'S','M',{upload:async()=>Response.json({error:'no_valid_addresses'},{status:400}),request:async()=>{writes++;}}),/no valid addresses/);assert.equal(writes,0);});
