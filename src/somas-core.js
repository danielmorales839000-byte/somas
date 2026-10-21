/**
 * SOMAS v2 shared organizational engine.
 * Root and customer units execute EXACTLY the same planner/evolution contract.
 * Mission and authority are immutable server-derived context, never model output.
 * Planning is not execution: no browser activity, code changes or deployment here.
 */
import {CORE_ROLES, chooseTeam, normalizeInput} from './agents.js';

export const ROOT_ID = 'somas-root';
export const UNIT_KINDS = Object.freeze({ROOT: 'root', CUSTOMER: 'customer'});
export const CHANGE_KINDS = Object.freeze(['software', 'intelligence', 'organization', 'business']);
export const ROOT_MISSION = 'Operate, secure, develop, evaluate and improve the SOMAS service, including onboarding, billing, instance provisioning, AI gateway, deployment tooling, and its own agent organization.';

const ROOT_TARGET = 'somas_platform';
const CUSTOMER_TARGET = 'customer_application';
const SAFE_ID = /^[a-z0-9-]{1,80}$/i;
// Bounded bootstrap capabilities, selected from task context rather than fixed organization templates.
const DOMAIN_CAPABILITIES = Object.freeze([
  [/\b(billing|subscriptions?|invoices?)\b/i,'billing_specialist'],
  [/\b(deploy(?:ment|ments|ed|ing)?|hosting|dns)\b/i,'deployment_specialist'],
  [/\b(access|security|authorization|password)\b/i,'security_specialist'],
  [/\b(database|migration|postgres|neon)\b/i,'database_specialist'],
  [/\b(bookings?|reservations?)\b/i,'reservation_specialist'],
  [/\b(checkout|orders?|cart)\b/i,'commerce_specialist'],
  [/\b(agent|neural|training|evaluation)\b/i,'learning_specialist'],
  [/\b(analytics|metrics|observability|reliability)\b/i,'analytics_specialist']
]);
function contextualSpecialists(instruction, existing) {
  return DOMAIN_CAPABILITIES.filter(([pattern])=>pattern.test(instruction))
    .map(([,role])=>role).filter(role=>!existing.includes(role)).slice(0,3);
}


export function validateUnit(unit) {
  if (!unit || ![UNIT_KINDS.ROOT, UNIT_KINDS.CUSTOMER].includes(unit.kind)) throw new Error('invalid_somas_unit_kind');
  if (typeof unit.id !== 'string' || !SAFE_ID.test(unit.id)) throw new Error('invalid_somas_unit_id');
  if (unit.kind === UNIT_KINDS.ROOT) {
    if (unit.id !== ROOT_ID || unit.project_id != null || unit.workspace_id != null || unit.parent_id != null) throw new Error('invalid_root_boundary');
    if (unit.mission !== ROOT_MISSION) throw new Error('invalid_root_boundary');
  } else {
    if (!SAFE_ID.test(unit.project_id || '') || !SAFE_ID.test(unit.workspace_id || '') || unit.parent_id !== ROOT_ID || unit.id !== `customer-${unit.project_id}`) throw new Error('invalid_customer_boundary');
  }
  if (typeof unit.mission !== 'string' || unit.mission.trim().length < 8 || unit.mission.length > 2500) throw new Error('invalid_unit_mission');
  return unit;
}

export function rootDescriptor() {
  return Object.freeze({id: ROOT_ID, kind: UNIT_KINDS.ROOT, parent_id: null,
    workspace_id: null, project_id: null, mission: ROOT_MISSION});
}

export function customerDescriptor(project) {
  if (!project || !SAFE_ID.test(project.id || '') || !SAFE_ID.test(project.workspace_id || '')) throw new Error('project_context_required');
  return validateUnit({id: `customer-${project.id}`, kind: UNIT_KINDS.CUSTOMER,
    parent_id: ROOT_ID, workspace_id: project.workspace_id, project_id: project.id,
    mission: `Develop, operate and improve this customer's application: ${normalizeInput(project.purpose).slice(0,2200)}`});
}

export function targetFor(unit) {
  validateUnit(unit);
  return unit.kind === UNIT_KINDS.ROOT ? ROOT_TARGET : CUSTOMER_TARGET;
}

/**
 * External agent suggestions MUST be checked against the unit's fixed target.
 * If omitted, target is derived from the authenticated instance context.
 */
export function authorizeEvolution(unit, claimedTarget) {
  const expected = targetFor(unit);
  if (claimedTarget !== undefined && claimedTarget !== expected) throw new Error('cross_scope_evolution_forbidden');
  return expected;
}

export function planEvolution(unit, instruction, options = {}) {
  const target = authorizeEvolution(unit, options.target);
  const message = normalizeInput(instruction);
  const kind = options.changeKind || 'software';
  if (!CHANGE_KINDS.includes(kind)) throw new Error('invalid_evolution_kind');
  const team = chooseTeam(message, options.managerPolicy || null);
  // Same bounded capability selector for Root and Customer, with no fixed corporate roles.
  const missionExperts = kind==='intelligence' ? ['training_specialist','policy_evaluator'] :
    kind==='organization' ? ['organization_designer'] :
    kind==='business' ? ['business_analyst'] :
    team.category==='content' && /\b(improve|build|develop|implement|integrate|modernize)\b/i.test(message)
      ? ['software_architect','quality_reviewer'] : [];
  const specialists = [...new Set([...missionExperts, ...team.specialists, ...contextualSpecialists(message,team.specialists)])].slice(0,7);
  // Core roles are present in every unit. Specialists selected per request.
  const agents = [...CORE_ROLES, ...specialists];
  const steps = [
    {key:'understand',responsible:'assistant',action:'Clarify objective and constraints; record owner intent'},
    {key:'design',responsible:'manager',action:'Validate mission scope; assign task-specific specialists'},
    {key:'investigate',responsible:specialists[0] || 'manager',action:'Collect trustworthy evidence and proposed solution'},
    {key:'implement',responsible:specialists.find(r => /developer|editor|specialist|architect/.test(r)) || 'manager',action:'Prepare a candidate change in an isolated execution environment'},
    {key:'evaluate',responsible:'virtual_customer',action:'Collect independent regression, experience and/or neural policy evaluations'},
    {key:'authorize',responsible:'manager',action:'Submit validated change for external authorization, never self-approve'},
  ];
  return {
    unitId: unit.id, unitKind: unit.kind, mission: unit.mission, target,
    changeKind: kind, instruction: message,
    team: {core: [...CORE_ROLES], specialists:[...specialists], selection:team.selection, category:team.category, agents},
    steps, status:'proposed', implementationStatus:'not_executed',
    requiresHumanApproval:true, automaticDeployment:false,
    limitations:'Planning only. A sandbox runner, independent evaluator and approval gate are required to execute.'
  };
}

/** Web content, prompts and individual policies cannot grant platform privileges. */
export function permissionsFor(unit) {
  return Object.freeze({
    target: targetFor(unit), canPlan:true, canMutateOtherUnits:false,
    canModifyPlatform: unit.kind === UNIT_KINDS.ROOT,
    canModifyCustomerApplication:unit.kind === UNIT_KINDS.CUSTOMER,
    canDeployWithoutApproval:false, canWriteSecrets:false,
    canCreateSubinstancesWithoutApproval:false
  });
}
