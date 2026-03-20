'use strict';

const auditEntry = (userId, field, oldVal, newVal) => ({
  changed_by: userId, field_changed: field,
  old_value: oldVal, new_value: newVal, changed_at: new Date(),
});

const diffAudit = (userId, doc, updates, fields) =>
  fields
    .filter(f => updates[f] !== undefined && String(doc[f]) !== String(updates[f]))
    .map(f => auditEntry(userId, f, doc[f], updates[f]));

module.exports = { auditEntry, diffAudit };