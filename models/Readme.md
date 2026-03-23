# Permissions System — Backend

Full RBAC aligned with `src/utils/modulePermissions.js` on the frontend.

---

## How it maps to the frontend

```
Backend Permission doc       Frontend constant
─────────────────────        ─────────────────────────────────────────────────
permission.module      ←→   MODULES.COMPANY_MASTER  = "COMPANY_MASTER"
permission.page        ←→   PAGES.COMPANY_MASTER    = "Organization / Company"
permission.action      ←→   ACTIONS.VIEW            = "VIEW"
```

When `login` or `getMe` returns `user.permissions`, the frontend stores it in
`localStorage` and all helpers work immediately:

```js
// Frontend — works with no changes
hasSafePagePermission(permissions, 'COMPANY_MASTER', 'Organization / Company', 'VIEW')
canViewPage(permissions, 'EMPLOYEE_MASTER', 'Employee Registry')
canCreateInPage(permissions, 'QUOTATION_MASTER', 'Quotation')
```

---

## SuperAdmin

Set `isSuperAdmin: true` on a Role → every user with that role automatically
receives **all active permissions** in `getAllPermissions()`. No permission list
is stored or maintained. Adding new permissions to the catalog instantly gives
SuperAdmins access without any DB migration.

---

## Setup

### 1 — Seed permissions (run once, idempotent)
```bash
node scripts/bootstrapPermissions.js          # add missing
node scripts/bootstrapPermissions.js --check  # dry-run
node scripts/bootstrapPermissions.js --list   # print all in DB
```

### 2 — Create SuperAdmin role + user (seed script)
```js
const role = await Role.create({ RoleName: 'SuperAdmin', isSuperAdmin: true, IsActive: true });
await User.create({
  Username: 'superadmin', Email: 'admin@company.com',
  PasswordHash: 'secret123', RoleID: role._id
});
```

### 3 — Create a normal role
```http
POST /api/roles
Authorization: Bearer <superadmin_token>
{
  "RoleName": "HR Manager",
  "moduleAccess": {
    "EMPLOYEE_MASTER": true,
    "DEPARTMENT_MASTER": true,
    "DESIGNATION_MASTER": true,
    "REQUISITION_MASTER": true,
    "INTERVIEW_MASTER": true
  },
  "pageAccess": {
    "EMPLOYEE_MASTER": {
      "Employee Registry": ["VIEW", "CREATE", "UPDATE", "EXPORT", "PRINT"]
    },
    "DEPARTMENT_MASTER": {
      "Department Master": ["VIEW", "CREATE", "UPDATE"]
    },
    "DESIGNATION_MASTER": {
      "Designation Master": ["VIEW", "CREATE", "UPDATE"]
    },
    "REQUISITION_MASTER": {
      "Hiring Requests": ["VIEW", "CREATE", "UPDATE", "APPROVE", "REJECT"]
    },
    "INTERVIEW_MASTER": {
      "Interview Scheduling": ["VIEW", "CREATE", "UPDATE", "APPROVE"]
    }
  }
}
```

---

## Route guards (backend)

```js
const { protect, can, authorize, requireSuperAdmin } = require('./middleware/authMiddleware');

// mirrors: canViewPage(permissions, 'COMPANY_MASTER', 'Organization / Company')
router.get('/company',  protect, can('COMPANY_MASTER', 'Organization / Company', 'VIEW'), handler);

// mirrors: canCreateInPage(permissions, 'EMPLOYEE_MASTER', 'Employee Registry')
router.post('/employee', protect, can('EMPLOYEE_MASTER', 'Employee Registry', 'CREATE'), handler);

// mirrors: hasSafePagePermission(permissions, 'QUOTATION_MASTER', 'Quotation', 'APPROVE')
router.patch('/quotation/:id/approve', protect, can('QUOTATION_MASTER', 'Quotation', 'APPROVE'), handler);
```

---

## Adding new modules / pages / actions

1. Add to `src/utils/modulePermissions.js` → `MODULES`, `PAGES`, route maps
2. Add to `config/permissionCatalog.js`
3. Run `node scripts/bootstrapPermissions.js`
4. Done — no model changes, no enum updates.

---

## API

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| POST | `/auth/login` | — | Login + returns full permissions array |
| GET  | `/auth/me`    | protect | Refresh permissions |
| POST | `/auth/logout` | protect | Clear refresh token |
| PUT  | `/auth/change-password` | protect | Change password |
| POST | `/auth/register` | SuperAdmin | Create user |
| PATCH | `/auth/users/:id/permissions` | SuperAdmin | Grant/revoke direct perms |
| GET  | `/roles` | ROLES.VIEW | List roles |
| POST | `/roles` | ROLES.CREATE | Create role |
| PATCH | `/roles/:id` | ROLES.UPDATE | Update + regenerate permissions |
| DELETE | `/roles/:id` | ROLES.DELETE | Delete (if no active users) |
| GET  | `/roles/permissions` | SuperAdmin | All Permission docs |
| GET  | `/roles/sidebar-structure` | SuperAdmin | Catalog for role-builder UI |
| GET  | `/users` | USERS.VIEW | List users |
| GET  | `/users/:id` | USERS.VIEW | User + effective permissions |
| PUT  | `/users/:id` | USERS.UPDATE | Update user |
| DELETE | `/users/:id` | USERS.DELETE | Soft-delete |
| GET  | `/users/:id/permissions` | USERS.VIEW | Resolved permissions |
| POST | `/users/:id/permissions/grant` | SuperAdmin | Grant direct permissions |
| POST | `/users/:id/permissions/revoke` | SuperAdmin | Revoke direct permissions |