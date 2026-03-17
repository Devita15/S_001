const AuditLog = require('../models/HR/AuditLog');

class AuditService {
  
  async log(action, entityType, entityId, user, changes = null, req = null) {
    try {
      const auditLog = new AuditLog({
        action,
        entityType,
        entityId,
        userId: user._id,
        userName: user.Username || `${user.FirstName} ${user.LastName}`,
        userRole: user.RoleName || 'Unknown',
        changes,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.get('User-Agent'),
        timestamp: new Date()
      });

      await auditLog.save();
      return auditLog;
    } catch (error) {
      console.error('Audit log error:', error);
      // Don't throw - we don't want audit failures to break main flow
    }
  }

  async getEntityAuditLogs(entityType, entityId, page = 1, limit = 50) {
    const query = { entityType, entityId };
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'Username Email');

    const total = await AuditLog.countDocuments(query);

    return {
      logs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    };
  }

  async getUserAuditLogs(userId, page = 1, limit = 50) {
    const query = { userId };
    
    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await AuditLog.countDocuments(query);

    return {
      logs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    };
  }
}

module.exports = new AuditService();