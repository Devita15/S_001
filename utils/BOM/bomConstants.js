module.exports = {
  BOM_TYPES: ['Manufacturing', 'Subcontract', 'Phantom', 'Variant'],
  
  BOM_STATUS: ['Draft', 'Active', 'Cancelled', 'Archived'],
  
  COMPONENT_UNITS: ['Nos', 'Kg', 'Meter', 'Sheet', 'Roll'],
  
  // Default values
  DEFAULTS: {
    YIELD_PERCENT: 100,
    SCRAP_PERCENT: 0,
    BATCH_SIZE: 1,
    LEVEL: 1
  },
  
  // Error messages
  ERRORS: {
    CIRCULAR_REFERENCE: 'Circular reference detected in BOM structure',
    COMPONENT_NOT_FOUND: 'Component item not found',
    PARENT_NOT_FOUND: 'Parent item not found',
    DUPLICATE_VERSION: 'BOM version already exists for this item',
    NOT_APPROVED: 'BOM must be approved before setting as default',
    CANCELLED: 'Cannot modify cancelled BOM'
  }
};