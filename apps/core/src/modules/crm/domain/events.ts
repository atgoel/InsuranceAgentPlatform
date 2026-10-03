/**
 * Event type constants for CRM domain events.
 * Observability §9: domain events with ids and enums only.
 */

export const CRM_EVENTS = {
  LEAD_CREATED: 'crm.lead.created',
  LEAD_ROUTED: 'crm.lead.routed',
  LEAD_UNASSIGNED: 'crm.lead.unassigned',
  LEAD_ASSIGNED: 'crm.lead.assigned',
  LEAD_STAGE_CHANGED: 'crm.lead.stage_changed',
  LEAD_CONVERTED: 'crm.lead.converted',
  LEAD_SLA_BREACHED: 'crm.lead.sla_breached',
  LEAD_PARTY_LINKED: 'crm.lead.party_linked',

  ACTIVITY_LOGGED: 'crm.activity.logged',

  TASK_ESCALATED: 'crm.task.escalated',

  OPPORTUNITY_CREATED: 'crm.opportunity.created',
  OPPORTUNITY_ISSUED: 'crm.opportunity.issued',
  OPPORTUNITY_LOST: 'crm.opportunity.lost',

  ROUTING_RULES_UPDATED: 'crm.routing.rules_updated',
} as const;

export type CrmEventType = (typeof CRM_EVENTS)[keyof typeof CRM_EVENTS];
