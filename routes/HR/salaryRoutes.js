// routes/salaryRoutes.js
const express = require('express');
const router = express.Router();
const salaryController = require('../controllers/salaryController');
const { protect } = require('../../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// ==================== EMPLOYEE SELF-SERVICE ROUTES ====================
router.get('/my-salaries', salaryController.getMySalaries);
router.get('/my-salaries/:id', salaryController.getMySalaryById);

// ==================== ADMIN/HR ROUTES ====================

// Salary creation and management
router.post('/',  salaryController.createSalary);
router.post('/bulk-manual', salaryController.bulkManualPayroll);
router.get('/search', salaryController.searchSalaries);
router.get('/summary', salaryController.getPayrollSummary);
router.get('/department-summary',salaryController.getDepartmentWiseSummary);
router.get('/:id',  salaryController.getSalaryById);
router.put('/:id',  salaryController.updateSalary);
router.delete('/:id',  salaryController.deleteSalary);

// Salary actions
router.put('/:id/approve',  salaryController.approveSalary);
router.put('/:id/mark-paid',  salaryController.markAsPaid);
router.put('/:id/lock',salaryController.lockSalary);
router.put('/:id/unlock', salaryController.unlockSalary);

// Main list route (keep at end to avoid conflicts)
router.get('/',  salaryController.getAllSalaries);

module.exports = router;