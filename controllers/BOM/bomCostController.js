const Bom = require('../../models/BOM/Bom');
const Item = require('../../models/CRM/Item');  // ✅ CORRECTED PATH
const RmRate = require('../../models/CRM/RawMaterial');
const mongoose = require('mongoose');

// @desc    Calculate BOM cost rollup
// @route   GET /api/boms/:id/cost-rollup
// @access  All roles
exports.costRollup = async (req, res) => {
  try {
    const { quantity = 1, as_of_date = new Date() } = req.query;

    const bom = await Bom.findById(req.params.id)
      .populate('parent_item_id')
      .populate({
        path: 'components.component_item_id',
        select: 'part_no part_description item_category rm_grade density unit'
      });

    if (!bom) {
      return res.status(404).json({
        success: false,
        message: 'BOM not found'
      });
    }

    // Get current RM rates
    const rmRates = await getCurrentRMRates(as_of_date);

    // Calculate costs recursively
    const costResult = await calculateCostRecursive(bom, parseFloat(quantity), rmRates, new Set());

    res.status(200).json({
      success: true,
      data: {
        bom_id: bom.bom_id,
        parent_item: {
          part_no: bom.parent_part_no,
          description: bom.parent_item_id.part_description
        },
        requested_quantity: parseFloat(quantity),
        total_cost: costResult.total_cost,
        cost_breakdown: costResult.breakdown,
        summary: {
          total_material_cost: costResult.summary.material_cost,
          total_process_cost: costResult.summary.process_cost || 0,
          total_subcontract_cost: costResult.summary.subcontract_cost || 0,
          cost_per_unit: costResult.total_cost / parseFloat(quantity)
        }
      }
    });

  } catch (error) {
    console.error('Cost rollup error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Calculate cost for single component
// @route   POST /api/boms/calculate-component-cost
// @access  All roles
exports.calculateComponentCost = async (req, res) => {
  try {
    const { component_item_id, quantity, scrap_percent = 0 } = req.body;

    if (!component_item_id || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Component item ID and quantity are required'
      });
    }

    const item = await Item.findById(component_item_id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Get current RM rate
    const rmRate = await RmRate.findOne({
      Grade: item.rm_grade,
      IsActive: true
    }).sort('-DateEffective');

    if (!rmRate) {
      return res.status(404).json({
        success: false,
        message: `No RM rate found for grade ${item.rm_grade}`
      });
    }

    // Calculate cost
    const baseQuantity = parseFloat(quantity);
    const quantityWithScrap = baseQuantity * (1 + scrap_percent / 100);
    const materialCost = quantityWithScrap * rmRate.EffectiveRate;

    res.status(200).json({
      success: true,
      data: {
        item: {
          part_no: item.part_no,
          description: item.part_description,
          rm_grade: item.rm_grade,
          density: item.density
        },
        rm_rate: {
          rate_per_kg: rmRate.RatePerKG,
          effective_rate: rmRate.EffectiveRate,
          effective_from: rmRate.DateEffective,
          source: rmRate.MaterialName
        },
        quantity: {
          base: baseQuantity,
          with_scrap: quantityWithScrap,
          scrap_percent
        },
        material_cost: materialCost,
        cost_per_unit: materialCost / baseQuantity
      }
    });

  } catch (error) {
    console.error('Calculate component cost error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to get current RM rates
async function getCurrentRMRates(as_of_date) {
  const rates = await RmRate.find({
    IsActive: true
  }).lean();

  // Create map by rm_grade
  const rateMap = new Map();
  rates.forEach(rate => {
    rateMap.set(rate.Grade, rate);
  });

  return rateMap;
}

// Recursive cost calculation function
async function calculateCostRecursive(bom, quantity, rmRates, visited, level = 0) {
  const result = {
    total_cost: 0,
    breakdown: [],
    summary: {
      material_cost: 0,
      process_cost: 0,
      subcontract_cost: 0
    }
  };

  // Check for circular reference
  const bomKey = bom._id.toString();
  if (visited.has(bomKey)) {
    throw new Error(`Circular reference detected in BOM: ${bom.bom_id}`);
  }
  visited.add(bomKey);

  // For each component
  for (const component of bom.components) {
    const componentItem = component.component_item_id;
    const componentQty = component.quantity_per * quantity * (1 + component.scrap_percent / 100);

    let componentCost = 0;
    let costDetails = {
      part_no: component.component_part_no,
      description: component.component_desc,
      level: component.level || 1,
      base_quantity: component.quantity_per * quantity,
      quantity_with_scrap: componentQty,
      scrap_percent: component.scrap_percent,
      unit: component.unit,
      cost_breakdown: {}
    };

    // Check if component is a sub-assembly (has its own BOM)
    const childBom = await Bom.findOne({
      parent_item_id: component.component_item_id,
      is_default: true,
      is_active: true,
      status: 'Active'
    }).populate('components.component_item_id');

    if (childBom && !component.is_phantom) {
      // Recursively calculate sub-assembly cost
      const childResult = await calculateCostRecursive(
        childBom, 
        componentQty, 
        rmRates, 
        new Set(visited),
        level + 1
      );
      
      componentCost = childResult.total_cost;
      costDetails.cost_breakdown = {
        type: 'sub-assembly',
        child_bom_id: childBom.bom_id,
        child_cost: childResult.total_cost,
        components: childResult.breakdown
      };
      
      result.summary.process_cost += childResult.summary.process_cost;
      result.summary.subcontract_cost += childResult.summary.subcontract_cost;
    } else if (component.is_subcontract) {
      // Subcontract cost - estimate from process master or fixed rate
      const subcontractRate = 50; // Placeholder - get from Process Master
      componentCost = componentQty * subcontractRate;
      costDetails.cost_breakdown = {
        type: 'subcontract',
        rate_per_unit: subcontractRate,
        vendor: component.subcontract_vendor
      };
      result.summary.subcontract_cost += componentCost;
    } else {
      // Raw material cost
      const rmRate = rmRates.get(componentItem.rm_grade);
      if (!rmRate) {
        throw new Error(`No RM rate found for grade ${componentItem.rm_grade} (${component.component_part_no})`);
      }
      
      componentCost = componentQty * rmRate.EffectiveRate;
      costDetails.cost_breakdown = {
        type: 'raw_material',
        rm_grade: componentItem.rm_grade,
        rate_per_kg: rmRate.RatePerKG,
        effective_rate: rmRate.EffectiveRate,
        source: rmRate.MaterialName
      };
      result.summary.material_cost += componentCost;
    }

    result.total_cost += componentCost;
    costDetails.total_cost = componentCost;
    result.breakdown.push(costDetails);
  }

  // Apply yield loss at this level
  if (bom.yield_percent && bom.yield_percent < 100) {
    const yieldFactor = 100 / bom.yield_percent;
    result.total_cost *= yieldFactor;
    
    result.breakdown.forEach(item => {
      item.quantity_with_scrap *= yieldFactor;
      item.total_cost *= yieldFactor;
    });
  }

  visited.delete(bomKey);
  return result;
}