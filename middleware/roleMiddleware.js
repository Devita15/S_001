const authorize = (...roles) => {
    return (req, res, next) => {
      if (!req.user || !req.user.RoleID) {
        return res.status(401).json({ 
          message: 'Not authorized to access this route' 
        });
      }
  
      const userRole = req.user.RoleID.RoleName;
      
      if (!roles.includes(userRole)) {
        return res.status(403).json({ 
          message: `Role ${userRole} is not authorized to access this route` 
        });
      }
  
      next();
    };
  };
  
  // Check specific permission
  const hasPermission = (permission, module) => {
    return async (req, res, next) => {
      try {
        const user = req.user;
        
        if (!user || !user.RoleID) {
          return res.status(401).json({ message: 'Not authorized' });
        }
  
        const role = user.RoleID;
        
        // Check if user has the required permission for the module
        const modulePermission = role.Permissions?.find(p => p.module === module);
        
        if (!modulePermission || !modulePermission[permission]) {
          return res.status(403).json({ 
            message: `You don't have permission to ${permission} ${module}` 
          });
        }
  
        next();
      } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
      }
    };
  };
  
  module.exports = { authorize, hasPermission };