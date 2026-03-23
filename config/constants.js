/**
 * Application Constants
 * Single source of truth for all enums and constants
 */

module.exports = {
    // Lead Sources
    LEAD_SOURCES: [
      'WEBSITE', 'EMAIL', 'WHATSAPP', 'PHONE', 'EXHIBITION',
      'REFERRAL', 'COLD_OUTREACH', 'WALK_IN', 'LINKEDIN', 'OTHER'
    ],
  
    // Lead Status Pipeline
    LEAD_STATUS: {
      NEW: 'NEW',
      CONTACTED: 'CONTACTED',
      QUALIFIED: 'QUALIFIED',
      PROPOSAL_SENT: 'PROPOSAL_SENT',
      NEGOTIATION: 'NEGOTIATION',
      WON: 'WON',
      LOST: 'LOST',
      JUNK: 'JUNK'
    },
  
    // Valid Status Transitions Matrix
    VALID_STATUS_TRANSITIONS: {
      NEW: ['CONTACTED', 'JUNK'],
      CONTACTED: ['QUALIFIED', 'JUNK'],
      QUALIFIED: ['PROPOSAL_SENT', 'JUNK'],
      PROPOSAL_SENT: ['NEGOTIATION', 'WON', 'LOST', 'JUNK'],
      NEGOTIATION: ['WON', 'LOST', 'JUNK'],
      WON: [],
      LOST: [],
      JUNK: []
    },
  
    // Priority Levels
    PRIORITY: {
      HIGH: 'HIGH',
      MEDIUM: 'MEDIUM',
      LOW: 'LOW'
    },
  
    // Company Sizes
    COMPANY_SIZES: {
      STARTUP: 'STARTUP',
      SME: 'SME',
      MID_MARKET: 'MID_MARKET',
      ENTERPRISE: 'ENTERPRISE',
      UNKNOWN: 'UNKNOWN'
    },
  
    // Follow-up Channels
    FOLLOW_UP_CHANNELS: {
      CALL: 'CALL',
      EMAIL: 'EMAIL',
      VISIT: 'VISIT',
      WHATSAPP: 'WHATSAPP',
      MEETING: 'MEETING',
      OTHER: 'OTHER'
    },
  
    // Feasibility Status
    FEASIBILITY_STATUS: {
      PENDING: 'PENDING',
      FEASIBLE: 'FEASIBLE',
      NOT_FEASIBLE: 'NOT_FEASIBLE',
      CONDITIONALLY_FEASIBLE: 'CONDITIONALLY_FEASIBLE'
    },
  
    // Industries
    INDUSTRIES: [
      'AUTOMOTIVE', 'SWITCHGEAR', 'EV', 'MACHINE_BUILDER', 'DEFENCE',
      'ELECTRONICS', 'RAILWAYS', 'RENEWABLE_ENERGY', 'TRANSFORMER',
      'GENERAL_ENGINEERING', 'OTHER'
    ],
  
    // User Roles
    ROLES: {
      SALES: 'SALES',
      MANAGER: 'MANAGER',
      PRODUCTION: 'PRODUCTION',
      ADMIN: 'ADMIN'
    },
  
    // File Upload
    ALLOWED_DRAWING_MIME_TYPES: [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/dxf',
      'application/step',
      'application/iges',
      'application/octet-stream' // for .step, .iges files
    ],
    MAX_DRAWING_SIZE: 25 * 1024 * 1024, // 25MB
  
    // Pagination
    DEFAULT_PAGE_LIMIT: 20,
    MAX_PAGE_LIMIT: 100
  };