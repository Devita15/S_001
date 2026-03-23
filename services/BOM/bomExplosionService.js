const Bom = require('../../models/BOM/Bom');

/**
 * Recursively explode BOM to get all components with quantities
 * @param {Object} bom - BOM document with populated references
 * @param {Number} quantity - Required quantity of parent item
 * @param {Date} effectiveDate - Date for effective BOM version
 * @param {Set} visited - Set for circular reference detection
 * @param {Number} level - Current explosion level
 * @returns {Object} Exploded components with quantities
 */
async function explodeBOM(bom, quantity, effectiveDate = new Date(), visited = new Set(), level = 0) {
  const result = {
    components: [],
    summary: {
      total_components: 0,
      total_unique_components: 0,
      total_quantity_by_unit: {}
    }
  };

  // Check for circular reference
  const bomKey = bom._id.toString();
  if (visited.has(bomKey)) {
    throw new Error(`Circular reference detected in BOM: ${bom.bom_id}`);
  }
  visited.add(bomKey);

  // Track unique components for summary
  const uniqueComponents = new Map();

  // Process each component
  for (const component of bom.components) {
    const componentQty = component.quantity_per * quantity * (1 + component.scrap_percent / 100);
    
    // Get component item details
    const componentItem = component.component_item_id;
    
    // Create component entry
    const componentEntry = {
      level: component.level || level + 1,
      part_no: component.component_part_no,
      description: component.component_desc,
      quantity: componentQty,
      unit: component.unit,
      scrap_percent: component.scrap_percent,
      is_phantom: component.is_phantom,
      is_subcontract: component.is_subcontract,
      reference_designator: component.reference_designator,
      remarks: component.remarks
    };

    // Add to summary tracking
    const uniqueKey = `${component.component_part_no}-${component.unit}`;
    if (uniqueComponents.has(uniqueKey)) {
      uniqueComponents.get(uniqueKey).quantity += componentQty;
    } else {
      uniqueComponents.set(uniqueKey, {
        part_no: component.component_part_no,
        description: component.component_desc,
        quantity: componentQty,
        unit: component.unit
      });
    }

    // Check if component is a phantom and needs further explosion
    if (component.is_phantom) {
      try {
        // Find the phantom's own BOM (default version)
        const phantomBom = await Bom.findOne({
          parent_item_id: component.component_item_id,
          is_default: true,
          is_active: true,
          status: 'Active',
          $or: [
            { effective_from: { $lte: effectiveDate } },
            { effective_from: null }
          ],
          $and: [
            { $or: [
              { effective_to: { $gte: effectiveDate } },
              { effective_to: null }
            ]}
          ]
        }).populate('components.component_item_id');

        if (phantomBom) {
          // Recursively explode phantom BOM
          const phantomResult = await explodeBOM(phantomBom, componentQty, effectiveDate, visited, level + 1);
          
          // Add phantom's components to result
          result.components.push(...phantomResult.components);
          
          // Merge summary from phantom
          for (const [key, value] of phantomResult.summary.total_quantity_by_unit) {
            if (result.summary.total_quantity_by_unit[key]) {
              result.summary.total_quantity_by_unit[key] += value;
            } else {
              result.summary.total_quantity_by_unit[key] = value;
            }
          }
          
          continue; // Skip adding phantom itself
        }
      } catch (error) {
        console.warn(`Error exploding phantom component ${component.component_part_no}:`, error.message);
        // Fall through - add phantom as regular component
      }
    }

    // Add regular component (not phantom or phantom without BOM)
    result.components.push(componentEntry);
  }

  // Update summary
  result.summary.total_components = result.components.length;
  result.summary.total_unique_components = uniqueComponents.size;
  
  // Calculate total quantity by unit
  result.summary.total_quantity_by_unit = {};
  for (const [key, value] of uniqueComponents) {
    if (!result.summary.total_quantity_by_unit[value.unit]) {
      result.summary.total_quantity_by_unit[value.unit] = 0;
    }
    result.summary.total_quantity_by_unit[value.unit] += value.quantity;
  }

  visited.delete(bomKey);
  return result;
}

module.exports = { explodeBOM };