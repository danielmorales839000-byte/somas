/** Deterministic, lightweight, independently trainable agent policy + bounded spec editing.
 *  No imported dependencies; tested with node --test and deployable in Workers.
 */
export const CORE_ROLES = Object.freeze(['manager', 'assistant', 'virtual_customer']);
export const CLASS_LABELS = Object.freeze({
  manager: ['content','design','bug','feature','research'],
  assistant: ['explain','clarify','relay'],
  virtual_customer: ['navigation','accessibility','conversion']
});
const SPECIALIST_LABELS=['execute','research','verify','escalate'];
export function labelsForRole(role){return CLASS_LABELS[role] || (/^[a-z_]{3,35}$/.test(role)?SPECIALIST_LABELS:null);}
const DIM = 48;
const CLAMP = (n, a, b) => Math.max(a, Math.min(b, n));
export function words(text) { return String(text || '').toLowerCase().match(/[a-z0-9]{2,}/g) || []; }
function hashWord(word) { let h=2166136261; for(let i=0;i<word.length;i++) { h^=word.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
export function features(text) {
  const v = Array(DIM).fill(0);
  for(const w of words(text).slice(0,100)) { const h=hashWord(w); v[h%DIM] += (h & 128) ? 1 : -1; }
  const norm = Math.sqrt(v.reduce((s,x)=>s+x*x,0)) || 1;
  return v.map(x=>x/norm);
}
export function newPolicy(role) {
  const labels = labelsForRole(role); if(!labels) throw new Error('unknown_role');
  return {version:1, role, labels:[...labels], dim:DIM, samples:0,
    weights:labels.map(()=>Array(DIM).fill(0)), bias:labels.map(()=>0)};
}
export function scorePolicy(policy, text) {
  const v=features(text);
  const logits=policy.weights.map((row,i)=>row.reduce((s,w,j)=>s+w*v[j],policy.bias[i]));
  const maximum=Math.max(...logits);
  const exps=logits.map(x=>Math.exp(x-maximum)); const denom=exps.reduce((a,b)=>a+b,0);
  return policy.labels.map((label,i)=>({label, probability:exps[i]/denom})).sort((a,b)=>b.probability-a.probability);
}
export function trainVerified(policy, input, correctLabel, learningRate=0.12) {
  const index=policy.labels.indexOf(correctLabel); if(index===-1) throw new Error('invalid_label');
  if (!input || words(input).length===0) throw new Error('empty_training_example');
  if (!Number.isFinite(learningRate) || learningRate<=0 || learningRate>0.3) throw new Error('invalid_learning_rate');
  const vec=features(input); const probabilities=scorePolicy(policy,input);
  const byLabel=Object.fromEntries(probabilities.map(p=>[p.label,p.probability]));
  const updated=structuredClone(policy);
  updated.labels.forEach((label,i)=>{
    const delta=(label===correctLabel?1:0)-byLabel[label];
    updated.weights[i]=updated.weights[i].map((w,j)=>CLAMP(w+learningRate*delta*vec[j],-4,4));
    updated.bias[i]=CLAMP(updated.bias[i]+learningRate*delta,-4,4);
  });
  updated.version+=1; updated.samples+=1; return updated;
}
export function normalizeInput(text) {
  if(typeof text!=='string' || text.trim().length<8 || text.length>2500) throw new Error('description_must_be_8_to_2500_chars');
  return text.trim().replace(/\s+/g,' ');
}
export function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35) || 'project';
}
export function initialSpec(title, purpose, template='business') {
  if (!['business','portfolio','store'].includes(template)) throw new Error('invalid_template');
  const t=String(title).trim().slice(0,90), goal=normalizeInput(purpose);
  if(t.length<2) throw new Error('title_too_short');
  return {schema:1, template, title:t, tagline:goal.slice(0,185),
    theme:'indigo', cta:{label:template==='store'?'Explore products':'Contact us',href:'#contact'},
    sections:[{id:'intro',heading:'Welcome',body:goal},
      {id:'benefits',heading:'What we offer',body:'Explore our services and learn how we can help.'}],
    faq:[], contactEmail:'', updatedAt:new Date().toISOString()};
}
export function validateSpec(spec) {
  if(!spec || spec.schema!==1 || !['business','portfolio','store'].includes(spec.template)) throw new Error('invalid_site_spec');
  if(typeof spec.title!=='string'||spec.title.length<2||spec.title.length>90) throw new Error('invalid_site_title');
  if(typeof spec.tagline!=='string'||spec.tagline.length>700) throw new Error('invalid_tagline');
  if(!['indigo','forest','sunset'].includes(spec.theme)) throw new Error('invalid_theme');
  if(!Array.isArray(spec.sections)||spec.sections.length>12) throw new Error('too_many_sections');
  for(const s of spec.sections) { if(typeof s.id!=='string'||!/^[a-z0-9-]{1,32}$/.test(s.id)||typeof s.heading!=='string'||s.heading.length>110||typeof s.body!=='string'||s.body.length>1500) throw new Error('invalid_section'); }
  if(!spec.cta||typeof spec.cta.label!=='string'||spec.cta.label.length>90||!['#contact','#top'].includes(spec.cta.href)) throw new Error('invalid_cta');
  if(!Array.isArray(spec.faq)||spec.faq.length>8||spec.faq.some(x=>typeof x.q!=='string'||typeof x.a!=='string'||x.q.length>180||x.a.length>900)) throw new Error('invalid_faq');
  if(typeof spec.contactEmail!=='string'||spec.contactEmail.length>150) throw new Error('invalid_contact_email');
  return spec;
}
export function classifyRequest(text) {
  const t=String(text).toLowerCase();
  if(/\b(bug|broken|error|fix|crash|not working)\b/.test(t)) return 'bug';
  if(/\b(research|study|search|find out|latest|news)\b/.test(t)) return 'research';
  if(/\b(theme|color|design|layout|appearance)\b/.test(t)) return 'design';
  if(/\b(feature|payment|checkout|login|api|database|cart|upload|integrat)\w*\b/.test(t)) return 'feature';
  return 'content';
}
export function chooseTeam(request, activeManagerPolicy=null) {
  const baseline=classifyRequest(request);
  const scores=activeManagerPolicy?.samples>=5 ? scorePolicy(activeManagerPolicy,request) : [];
  const candidate=scores[0];
  const category=candidate?.probability>=0.48 && ['content','design','bug','feature','research'].includes(candidate.label)
    ? candidate.label : baseline;
  const specialists={
    content:['content_editor','quality_reviewer'],
    design:['design_specialist','quality_reviewer'],
    bug:['diagnostic_specialist','quality_reviewer'],
    feature:['software_architect','developer','quality_reviewer'],
    research:['research_specialist','source_reviewer']
  };
  return {category, selection:category===baseline?'heuristic':'verified_neural_policy', core:['manager','assistant','virtual_customer'], specialists:specialists[category]};
}
export function proposeRevision(spec, request) {
  const text=normalizeInput(request); const next=structuredClone(validateSpec(spec));
  let supported=true, reason='';
  const title=text.match(/(?:change|set|update)\s+(?:the\s+)?(?:site\s+)?title\s+to\s+["']?([^"']+)["']?$/i);
  const tagline=text.match(/(?:change|set|update)\s+(?:the\s+)?(?:tagline|description|subtitle)\s+to\s+["']?([^"']+)["']?$/i);
  const color=text.match(/(?:theme|color)\s+(?:to\s+)?(forest|indigo|sunset)\b/i);
  const section=text.match(/add (?:a |new )?section (?:called|titled|named)\s+["']?([^"']+?)["']?(?:\s+with (?:text|content)\s+["']?(.+?)["']?)?$/i);
  const faq=text.match(/add (?:an? )?faq\s*:\s*(.+?)\s*\|\s*(.+)$/i);
  if(title) {next.title=title[1].trim().slice(0,90); reason='Update the public page title';}
  else if(tagline) {next.tagline=tagline[1].trim().slice(0,700); reason='Update the page description';}
  else if(color) {next.theme=color[1].toLowerCase(); reason='Apply a supported visual theme';}
  else if(section) { next.sections.push({id:slugify(section[1]).slice(0,25)+'-'+Math.random().toString(36).slice(2,5),heading:section[1].trim().slice(0,110),body:(section[2]||'New information coming soon.').trim().slice(0,1500)});reason='Add a structured content section'; }
  else if(faq) {next.faq.push({q:faq[1].trim().slice(0,180),a:faq[2].trim().slice(0,900)});reason='Add a frequently asked question';}
  else {supported=false;reason='This change requires a coding or integration runner. It has been recorded, not deployed.';}
  if(supported) { next.updatedAt=new Date().toISOString();validateSpec(next); }
  return {supported,reason,nextSpec:supported?next:null,classification:classifyRequest(text)};
}
export function virtualCustomerHeuristics(spec) {
  validateSpec(spec);
  const findings=[];
  if(!spec.contactEmail) findings.push({severity:'medium',kind:'usability_hypothesis',title:'No contact email configured',evidence:'contactEmail is blank; visitor cannot see a direct support address.'});
  if(spec.sections.length<2) findings.push({severity:'medium',kind:'usability_hypothesis',title:'Limited content',evidence:'Fewer than two informational sections.'});
  if(spec.cta.label.length<4) findings.push({severity:'low',kind:'usability_hypothesis',title:'Unclear primary CTA',evidence:'Primary action label is very short.'});
  if(spec.template==='store') findings.push({severity:'low',kind:'coverage_gap',title:'Store checkout not implemented',evidence:'Starter store is a marketing template, not an operational checkout; payment and inventory require future integrations.'});
  return findings;
}
export function htmlEscape(v) {return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function renderSite(spec, slug) {
  validateSpec(spec);
  const e=htmlEscape; const palette={indigo:['#151b35','#6661ea'],forest:['#12352c','#32a880'],sunset:['#44221a','#e76c4b']}[spec.theme];
  const sections=spec.sections.map(s=>`<section class="section"><h2>${e(s.heading)}</h2><p>${e(s.body)}</p></section>`).join('');
  const faq=spec.faq.map(s=>`<details><summary>${e(s.q)}</summary><p>${e(s.a)}</p></details>`).join('');
  const email=spec.contactEmail?`<a href="mailto:${e(spec.contactEmail)}">${e(spec.contactEmail)}</a>`:'Contact information will be available soon.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(spec.title)}</title><meta name="description" content="${e(spec.tagline)}"><style>:root{--dark:${palette[0]};--accent:${palette[1]}}*{box-sizing:border-box}body{margin:0;color:#192137;font-family:system-ui,-apple-system,sans-serif;background:#f7f8fc}header{padding:18px max(6vw,20px);display:flex;justify-content:space-between;align-items:center;background:#fff;border-bottom:1px solid #e3e5ed}header b{letter-spacing:.02em}header a{font-size:.85rem;color:#4b587b}main{max-width:960px;margin:0 auto;padding:0 20px 70px}.hero{margin:40px 0 24px;padding:65px 6%;border-radius:20px;background:var(--dark);color:white}.hero h1{font-size:clamp(2rem,6vw,3.8rem);margin:0 0 16px;max-width:780px}.hero p{font-size:1.15rem;line-height:1.65;opacity:.86;max-width:740px}.button{display:inline-block;background:var(--accent);color:#fff;padding:14px 24px;border-radius:9px;text-decoration:none;font-weight:700}.section,details,.contact{background:white;border:1px solid #e6e8f0;border-radius:14px;margin:16px 0;padding:28px}h2{margin-top:0}p{line-height:1.7}details summary{font-weight:600;cursor:pointer}.contact{margin-top:30px}footer{text-align:center;color:#6a7286;font-size:.8rem;padding:20px}a{overflow-wrap:anywhere}</style></head><body><header><b>${e(spec.title)}</b><a href="/">Powered by SOMAS</a></header><main id="top"><div class="hero"><h1>${e(spec.title)}</h1><p>${e(spec.tagline)}</p><a class="button" href="${e(spec.cta.href)}">${e(spec.cta.label)}</a></div>${sections}${faq?`<h2>Common questions</h2>${faq}`:''}<section class="contact" id="contact"><h2>Contact</h2><p>${email}</p></section></main><footer>Powered by SOMAS · <a href="/s/${e(slug)}/manage">Owner's SOMAS Assistant</a></footer></body></html>`;
}
