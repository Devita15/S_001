const Bom = require('../../models/BOM/Bom');
const BomRevision = require('../../models/BOM/BomRevision');

/**
 * Generate unique BOM ID
 * Format: BOM-YYYYMM-XXXX (e.g., BOM-202503-0081)
 */
async function generateBomId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `BOM-${year}${month}`;
  
  // Find the highest sequence number for this month
  const lastBom = await Bom.findOne(
    { bom_id: new RegExp(`^${prefix}`) },
    { bom_id: 1 }
  ).sort({ bom_id: -1 });
  
  let sequence = 1;
  if (lastBom) {
    const lastSeq = parseInt(lastBom.bom_id.split('-').pop());
    sequence = lastSeq + 1;
  }
  
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Generate revision ID
 * Format: REV-BOMID-XXX (e.g., REV-BOM-202503-0081-001)
 */
async function generateRevisionId(bomId, revisionNo) {
  const prefix = `REV-${bomId}`;
  return `${prefix}-${String(revisionNo).padStart(3, '0')}`;
}

/**
 * Calculate component quantity with scrap
 */
function calculateQuantityWithScrap(baseQuantity, scrapPercent) {
  return baseQuantity * (1 + (scrapPercent || 0) / 100);
}

/**
 * Format BOM for export
 */
function formatBOMForExport(bom) {
  return {
    bom_id: bom.bom_id,
    parent_item: {
      part_no: bom.parent_part_no,
      description: bom.parent_item_id?.part_description
    },
    version: bom.bom_version,
    type: bom.bom_type,
    is_default: bom.is_default,
    batch_size: bom.batch_size,
    yield_percent: bom.yield_percent,
    components: bom.components.map(comp => ({
      level: comp.level,
      part_no: comp.component_part_no,
      description: comp.component_desc,
      quantity_per: comp.quantity_per,
      unit: comp.unit,
      scrap_percent: comp.scrap_percent,
      is_phantom: comp.is_phantom,
      is_subcontract: comp.is_subcontract
    })),
    status: bom.status,
    created_at: bom.created_at,
    approved_at: bom.approved_at
  };
}

/**
 * Validate component level hierarchy
 */
function validateLevelHierarchy(components) {
  const levels = new Set(components.map(c => c.level || 1));
  const sortedLevels = Array.from(levels).sort((a, b) => a - b);
  
  // Check for gaps in levels
  for (let i = 0; i < sortedLevels.length - 1; i++) {
    if (sortedLevels[i + 1] - sortedLevels[i] > 1) {
      return {
        valid: false,
        message: `Level gap detected: ${sortedLevels[i]} to ${sortedLevels[i + 1]}`
      };
    }
  }
  
  return { valid: true };
}

module.exports = {
  generateBomId,
  generateRevisionId,
  calculateQuantityWithScrap,
  formatBOMForExport,
  validateLevelHierarchy
};