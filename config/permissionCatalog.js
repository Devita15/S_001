// config/permissionCatalog.js
//
// ⚠️  DO NOT change module keys or page names here without syncing with frontend:
//     src/utils/modulePermissions.js → MODULES and PAGES constants
//
// Frontend MODULES keys  →  used as `module` field in Permission docs
// Frontend PAGES values  →  used as `page`   field in Permission docs
// Frontend ACTIONS       →  VIEW | CREATE | UPDATE | DELETE | EXPORT | IMPORT | PRINT | APPROVE | REJECT

module.exports = {
  modules: [

    // ─────────────────────────────────────────────────────────────────────────
    // DASHBOARD
    // ─────────────────────────────────────────────────────────────────────────
    {
      key: 'DASHBOARD',
      page: 'Dashboard',
      category: 'Dashboard',
      actions: ['VIEW']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // USER / ROLE MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    {
      key: 'USERS',
      page: 'Users',
      category: 'Administration',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'ROLES',
      page: 'Roles',
      category: 'Administration',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // QUOTATION MASTER
    // ─────────────────────────────────────────────────────────────────────────
    {
      key: 'COMPANY_MASTER',
      page: 'Organization / Company',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'CUSTOMER_MASTER',
      page: 'Customer Master',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'LEAD_MASTER',
      page: 'Lead Master',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'SUPPLIER_MASTER',
      page: 'Supplier',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'TAX_MASTER',
      page: 'Tax Configuration / Tax Rule',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'TERMS_CONDITIONS_MASTER',
      page: 'Terms And Conditions',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'ITEM_MASTER',
      page: 'Product / Item Catalog',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'PROCESS_MASTER',
      page: 'Manufacturing Process',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'DIMENSION_MASTER',
      page: 'Product Specifications',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'MATERIAL_MASTER',
      page: 'Material Catalog',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT']
    },
    {
      key: 'RAW_MATERIAL_MASTER',
      page: 'Raw Material',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT']
    },
    {
      key: 'QUOTATION_MASTER',
      page: 'Quotation',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE', 'REJECT']
    },
    {
      key: 'COSTING_MASTER',
      page: 'Costing Master',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'OPERATION_MASTER',
      page: 'Operation Master',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'PROCESS_DETAILS_MASTER',
      page: 'Process Details Master',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'COMPANY_FINANCIAL_MASTER',
      page: 'Company Financial Master',
      category: 'Quotation Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // PROCUREMENT MASTER
    // ─────────────────────────────────────────────────────────────────────────
    {
      key: 'GRN_MASTER',
      page: 'GRN Master',
      category: 'Procurement Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE', 'REJECT']
    },
    {
      key: 'PURCHASE_ORDER_MASTER',
      page: 'Purchase Order Master',
      category: 'Procurement Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE', 'REJECT']
    },
    {
      key: 'PURCHASE_REQUISITION_MASTER',
      page: 'Purchase Requisition Master',
      category: 'Procurement Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE', 'REJECT']
    },
    {
      key: 'RFQ_MASTER',
      page: 'RFQ Master',
      category: 'Procurement Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE', 'REJECT']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // HR MASTER
    // ─────────────────────────────────────────────────────────────────────────
    {
      key: 'DEPARTMENT_MASTER',
      page: 'Department Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'DESIGNATION_MASTER',
      page: 'Designation Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'EMPLOYEE_MASTER',
      page: 'Employee Registry',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'LEAVE_TYPE_MASTER',
      page: 'Leave Policies',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'SHIFT_MASTER',
      page: 'Shift Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'ACCIDENT_MASTER',
      page: 'Accident Reporting',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'REQUISITION_MASTER',
      page: 'Hiring Requests',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT']
    },
    {
      key: 'JOB_OPENING_MASTER',
      page: 'Career Opportunities',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'CANDIDATE_MASTER',
      page: 'Candidate Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'IMPORT', 'PRINT']
    },
    {
      key: 'INTERVIEW_MASTER',
      page: 'Interview Scheduling',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT']
    },
    {
      key: 'SELECTED_CANDIDATES_MASTER',
      page: 'Selected Candidate',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'SALARY_MASTER',
      page: 'Salary Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'APPROVE']
    },
    {
      key: 'PIECE_RATE_MASTER',
      page: 'Piece Rate Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE']
    },
    {
      key: 'REGULARIZATION_MASTER',
      page: 'Attendance Regularization',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT']
    },
    {
      key: 'EMPLOYEE_LEAVE_MASTER',
      page: 'Employee Leave Records',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'ADMIN_LEAVE_MASTER',
      page: 'Leave Administration',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'EXPORT']
    },
    {
      key: 'PRODUCTION_MASTER',
      page: 'Production Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'TERMINATION_MASTER',
      page: 'Termination Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT']
    },
    {
      key: 'EMPLOYEE_BEHAVIOR_MASTER',
      page: 'Behavior Monitoring',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'MEDICLAIM_MASTER',
      page: 'Mediclaim Master',
      category: 'HR Master',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']
    },
    {
      key: 'LEAVE_APPROVAL',
      page: 'Leave Approval',
      category: 'HR Master',
      actions: ['VIEW', 'APPROVE', 'REJECT']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // REPORTS
    // ─────────────────────────────────────────────────────────────────────────
    {
      key: 'REPORTS',
      page: 'Recruitment Report',
      category: 'Reports',
      actions: ['VIEW', 'EXPORT', 'PRINT']
    },
    {
      key: 'REPORTS',
      page: 'Employee Report',
      category: 'Reports',
      actions: ['VIEW', 'EXPORT', 'PRINT']
    },
    {
      key: 'REPORTS',
      page: 'Interview Report',
      category: 'Reports',
      actions: ['VIEW', 'EXPORT', 'PRINT']
    }
  ]
};