"""Package the user-supplied synthetic archive as bounded, browser-loadable static records.
Never connects to a database. Usage: python scripts/build-exhibition-dataset.py source.zip
"""
import json,sys,zipfile,hashlib
from pathlib import Path
from collections import Counter
out=Path(__file__).resolve().parents[1]/'public/exhibition/dataset'
out.mkdir(parents=True,exist_ok=True)
def save(name,data):
 p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False))
def read(z,name):
 with z.open('dataset/'+name) as f:
  for line in f:
   r=json.loads(line)
   if r.get('record_mode')!='SIMULATED':raise ValueError('Non-simulated row in '+name)
   yield r
with zipfile.ZipFile(sys.argv[1]) as z:
 manifest=json.loads(z.read('dataset/manifest.json')); units={r['id']:{'organization':r,'agents':[],'tasks':[],'events':[],'claims':[]} for r in read(z,'demo_somases.jsonl')}
 user_index=[];user_page=[];owners={u['organization']['owner_user_id']:u for u in units.values() if u['organization']['owner_user_id']};counts={};issues=Counter()
 for i,u in enumerate(read(z,'demo_users.jsonl')):
  user_index.append([u['name'],u['country'],u['account_status']]);user_page.append(u)
  if u['id'] in owners:owners[u['id']]['owner']=u
  if len(user_page)==1000:save(f'users/{i//1000:03d}.json',{'record_mode':'SIMULATED','rows':user_page});user_page=[]
 if user_page:save(f'users/{len(user_index)//1000:03d}.json',{'record_mode':'SIMULATED','rows':user_page})
 counts['users']=len(user_index);save('users-index.json',{'record_mode':'SIMULATED','rows':user_index})
 tasks={}
 for key,name in [('agents','demo_agents.jsonl'),('tasks','demo_tasks.jsonl'),('events','demo_events.jsonl'),('claims','demo_verification_claims.jsonl')]:
  n=0
  for r in read(z,name):
   unit=units.get(r['somas_id'])
   if unit is None:raise ValueError('Missing organization '+r['somas_id'])
   unit[key].append(r);n+=1
   if key=='tasks':tasks[r['id']]=r['somas_id']
   if key in ['events','claims'] and tasks.get(r['task_id'])!=r['somas_id']:issues[key+'_task_organization_mismatch']+=1
  counts[key]=n
 index=[]
 for id,u in units.items():
  r=u['organization'];index.append([id,r['name'],r['domain'],r['state'],r['owner_user_id'],r['created_at'],r['learning_value'],r['goal']]);u['record_mode']='SIMULATED';u['relationship_notice']='Source references are synthetic. A shared task ID does not establish verified evidence; task/organization joins may differ.'
  save('organizations/'+id+'.json',u)
 counts['somas']=len(units);save('organizations-index.json',{'record_mode':'SIMULATED','rows':index})
 blocks=list(read(z,'demo_blocks.jsonl'));counts['blocks']=len(blocks)
 for i in range(0,len(blocks),100):save('blocks/'+str(i//100)+'.json',{'record_mode':'SIMULATED','rows':blocks[i:i+100]})
 for k,v in counts.items():
  if v!=manifest['files'][k]['rows']:raise ValueError('Count mismatch '+k)
 summary={'record_mode':'SIMULATED','description':manifest['description'],'seed':manifest['seed'],'counts':counts,'domains':dict(Counter(r[2] for r in index)),'states':dict(Counter(r[3] for r in index)),'countries':dict(Counter(r[1] for r in user_index)),'source_archive_sha256':hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest(),'relationship_checks':dict(issues),'page_size':1000,'disclaimers':manifest['disclaimers']}
 save('manifest.json',summary)
 print(json.dumps(summary,indent=2))
