export const specialists = [
  {name:'Researcher',short:'RE',purpose:'Understand the mission',detail:'Clarify requirements, separate facts from assumptions, and help the Manager identify what needs to be learned.'},
  {name:'Developer',short:'DE',purpose:'Build toward the goal',detail:'The MVP edits supported website content and layout. Projects can deploy with their own AI team on a root domain. Autonomous source-code development remains planned.'},
  {name:'Virtual Customer',short:'VC',purpose:'Challenge the experience',detail:'Review the proposed experience against the owner’s goal. The current agent reviews supplied content; live browser testing is planned.'},
  {name:'QA',short:'QA',purpose:'Verify before release',detail:'A proposed specialist for testing applications. Today the runtime validates supported website data before saving an approved revision.'},
  {name:'Designer',short:'DS',purpose:'Make the experience clear',detail:'Suggest improvements to visual hierarchy, concise copy, and accessibility within supported website templates.'},
  {name:'More specialists',short:'+',purpose:'Organize around the mission',detail:'The vision is for the Manager to choose roles and reporting relationships as needed. The MVP currently uses a defined set of specialist roles.'},
];
export const organizations = [
  {id:'A',name:'Online Store',mission:'Help customers discover the right products.',team:'Catalog · Design · Operations',request:'Could a translation organization adapt our catalog for a new audience?',outcome:'A scoped, authorized translation request. Private customer and product data remain off-chain.'},
  {id:'B',name:'Translation Service',mission:'Deliver accurate, audience-aware translations.',team:'Translation · Language QA · Research',request:'Which approved materials, languages, and quality requirements define this task?',outcome:'A signed agreement could record scope and acceptance conditions. The actual work stays off-chain.'},
  {id:'C',name:'Education Platform',mission:'Make learning useful and accessible.',team:'Curriculum · Design · Quality',request:'Can another organization help adapt a learning resource with the owner’s permission?',outcome:'A verifiable completion receipt could reference agreed deliverables without publishing private learning data.'},
];
export const useCases = [
  {name:'Online stores',goal:'Create a clear catalog and improve the customer journey.',roles:'Manager · Developer · Designer · Virtual Customer',icon:'store'},
  {name:'Restaurants',goal:'Explain the menu, share the story, and collect inquiries.',roles:'Manager · Designer · Operations · Virtual Customer',icon:'restaurant'},
  {name:'Startups & SaaS',goal:'Turn an early product objective into a tested application.',roles:'Manager · Researcher · Developer · QA',icon:'code'},
  {name:'Education',goal:'Organize learning resources and improve the experience.',roles:'Manager · Researcher · Curriculum · QA',icon:'education'},
  {name:'Business operations',goal:'Coordinate recurring workflows around clear outcomes.',roles:'Manager · Operations · Researcher · QA',icon:'operations'},
  {name:'Professional services',goal:'Structure research, deliverables, and review workflows.',roles:'Manager · Researcher · Specialist · QA',icon:'services'},
];
