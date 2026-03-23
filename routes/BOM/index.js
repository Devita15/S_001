const express = require('express');
const router = express.Router();

// Import sub-routers
const bomRoutes = require('./bomRoutes');
const bomRevisionRoutes = require('./bomRevisionRoutes');
const bomCostRoutes = require('./bomCostRoutes');
const routingRoutes = require('./routingRoutes');
const machineRoutes = require('./machineRoutes');
const processMasterRoutes = require('./processMasterRoutes');

// Mount routes - ORDER MATTERS!
// 1. First mount the base BOM routes (handles /, /:id, etc.)
router.use('/', bomRoutes);

// 2. Mount revision routes that need :id parameter (handles /:id/revisions/*)
router.use('/:id/revisions', bomRevisionRoutes);

// 3. Mount cost routes - these need to be accessible at /:id/cost-rollup
// Since bomCostRoutes has routes like /:id/cost-rollup, we mount it directly under the main router
// This will make the full path: /api/boms/:id/cost-rollup
router.use('/', bomCostRoutes);

// 4. Mount other independent modules
router.use('/routings', routingRoutes);
router.use('/machines', machineRoutes);
router.use('/process-master', processMasterRoutes);

module.exports = router;