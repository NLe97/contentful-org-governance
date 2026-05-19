export const GOVERNANCE_CONFIG_TYPE = "governanceConfig";
export const SPACE_STATE_TYPE = "spaceState";
export const AUDIT_EVENT_TYPE = "auditEvent";

export const GOVERNANCE_CONFIG_SCHEMA = {
  name: "Governance Config",
  description: "Singleton org-wide governance settings",
  displayField: "orgAdminsTeamId",
  fields: [
    { id: "orgAdminsTeamId", name: "Org Admins Team ID", type: "Symbol", required: false },
    { id: "frozenRoleName", name: "Frozen Role Name", type: "Symbol", required: true,
      defaultValue: { "en-US": "Space Admin (frozen)" } },
    { id: "enforcementEnabled", name: "Enforcement Enabled", type: "Boolean", required: true,
      defaultValue: { "en-US": true } }
  ]
};

export const SPACE_STATE_SCHEMA = {
  name: "Space State",
  description: "Per-space governance state",
  displayField: "spaceName",
  fields: [
    { id: "spaceId", name: "Space ID", type: "Symbol", required: true },
    { id: "spaceName", name: "Space Name", type: "Symbol", required: false },
    { id: "freezeStatus", name: "Freeze Status", type: "Symbol", required: true,
      validations: [{ in: ["OFF", "FROZEN", "TRANSITIONING_ON", "TRANSITIONING_OFF", "DEGRADED"] }],
      defaultValue: { "en-US": "OFF" } },
    { id: "frozenAt", name: "Frozen At", type: "Date", required: false },
    { id: "frozenBy", name: "Frozen By", type: "Symbol", required: false },
    { id: "substitutions", name: "Substitutions", type: "Object", required: false },
    { id: "customFrozenRoleId", name: "Custom Frozen Role ID", type: "Symbol", required: false },
    { id: "lastReconciledAt", name: "Last Reconciled At", type: "Date", required: false }
  ]
};

export const AUDIT_EVENT_SCHEMA = {
  name: "Audit Event",
  description: "Append-only governance audit log",
  displayField: "eventType",
  fields: [
    { id: "eventType", name: "Event Type", type: "Symbol", required: true,
      validations: [{ in: [
        "FREEZE_TOGGLED", "TEAM_ATTACHED", "TEAM_REMOVED_DETECTED", "RECONCILE_RUN",
        "SUBSTITUTION_APPLIED", "SUBSTITUTION_REVERTED", "WEBHOOK_SECRET_ROTATED", "ERROR"
      ] }] },
    { id: "spaceId", name: "Space ID", type: "Symbol", required: false },
    { id: "actorUserId", name: "Actor User ID", type: "Symbol", required: false },
    { id: "details", name: "Details", type: "Object", required: false },
    { id: "timestamp", name: "Timestamp", type: "Date", required: true }
  ]
};
