"""Aggregate the supplied static corpus; never touches the production database."""
import json
from pathlib import Path
from collections import Counter, defaultdict
base=Path(__file__).resolve().parents[1]/'public/exhibition/dataset'
days=defaultdict(lambda: {'tasks':0,'events':0,'claims':0,'approved':0,'rejected':0,'pending':0,'tokens':0,'estimated_usd':0})
learning=Counter()
for f in (base/'organizations').glob('*.json'):
 d=json.loads(f.read_text());v=d['organization'].get('learning_value',0);learning[str(min(9,int(v*10)))]+=1
 for t in d['tasks']:
  day=days[t['created_at'][:10]];day['tasks']+=1;day['tokens']+=t.get('token_count',0);day['estimated_usd']+=t.get('estimated_usd',0)
 for e in d['events']:days[e['occurred_at'][:10]]['events']+=1
 for c in d['claims']:
  day=days[c['recorded_at'][:10]];day['claims']+=1;k=c['decision'];day[k if k in ('approved','rejected','pending') else 'pending']+=1
out={'source':'simulated','definition':'Daily source-record timestamps; task counts are submitted records, not completed executions. Approval decisions retain source mismatches and are not verified facts.','days':[{'date':k,**{a:round(b,4) if a=='estimated_usd' else b for a,b in v.items()}} for k,v in sorted(days.items())], 'learning_bins':dict(sorted(learning.items()))}
(base/'analytics.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(len(out['days']),'daily buckets')
