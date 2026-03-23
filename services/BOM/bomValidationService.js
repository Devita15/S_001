const Item = require('../../models/CRM/Item');  // ✅ CORRECTED PATH
const Bom = require('../../models/BOM/Bom');

/**
 * Validate BOM components
 * @param {Array} components - Array of component objects
 * @param {Array} componentItems - Array of populated component items
 * @returns {Object} Validation result
 */
async function validateComponents(components, componentItems) {
  const errors = [];
  const itemMap = new Map(componentItems.map(item => [item._id.toString(), item]));

  // Check each component
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const item = itemMap.get(comp.component_item_id.toString());

    if (!item) {
      errors.push(`Component ${i + 1}: Item not found`);
      continue;
    }

    // Validate quantity
    if (!comp.quantity_per || comp.quantity_per <= 0) {
      errors.push(`Component ${item.part_no}: Invalid quantity ${comp.quantity_per}`);
    }

    // Validate unit matches item
    if (comp.unit && item.unit && comp.unit !== item.unit) {
      errors.push(`Component ${item.part_no}: Unit mismatch. Item unit is ${item.unit}, provided ${comp.unit}`);
    }

    // Validate scrap percent
    if (comp.scrap_percent && (comp.scrap_percent < 0 || comp.scrap_percent > 100)) {
      errors.push(`Component ${item.part_no}: Scrap percent must be between 0 and 100`);
    }

    // Validate level
    if (comp.level && comp.level < 0) {
      errors.push(`Component ${item.part_no}: Level must be >= 0`);
    }
  }

  // Check for duplicate components at same level
  const seen = new Map();
  for (const comp of components) {
    const key = `${comp.level || 1}-${comp.component_part_no}`;
    if (seen.has(key)) {
      errors.push(`Duplicate component ${comp.component_part_no} at level ${comp.level || 1}`);
    }
    seen.set(key, true);
  }

  return {
    valid: errors.length === 0,
    errors,
    message: errors.length > 0 ? 'Validation failed' : 'Validation passed'
  };
}

/**
 * Check for circular references in BOM
 * @param {String} bomId - BOM ID to check
 * @returns {Object} Circular reference check result
 */
async function checkCircularReferences(bomId) {
  const visited = new Set();
  const path = [];

  async function dfs(currentBomId) {
    if (visited.has(currentBomId.toString())) {
      return {
        hasCycle: true,
        path: [...path, currentBomId]
      };
    }

    visited.add(currentBomId.toString());
    path.push(currentBomId);

    const bom = await Bom.findById(currentBomId).populate('components.component_item_id');
    if (!bom) return { hasCycle: false };

    for (const comp of bom.components) {
      // Check if component is a sub-assembly (has its own BOM)
      const childBom = await Bom.findOne({
        parent_item_id: comp.component_item_id,
        is_active: true
      });

      if (childBom) {
        const result = await dfs(childBom._id);
        if (result.hasCycle) return result;
      }
    }

    path.pop();
    visited.delete(currentBomId.toString());
    return { hasCycle: false };
  }

  return await dfs(bomId);
}

module.exports = {
  validateComponents,
  checkCircularReferences
};