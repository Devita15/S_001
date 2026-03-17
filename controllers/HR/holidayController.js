// controllers/holidayController.js
const Holiday = require('../models/Holiday');

class HolidayController {
  
  // Create holiday
  async createHoliday(req, res) {
    try {
      const holidayData = req.body;
      
      // Check if holiday already exists for the date
      const existingHoliday = await Holiday.findOne({
        Date: new Date(holidayData.Date),
        IsActive: true
      });
      
      if (existingHoliday) {
        return res.status(400).json({
          success: false,
          message: 'Holiday already exists for this date'
        });
      }
      
      const holiday = new Holiday(holidayData);
      await holiday.save();
      
      return res.status(201).json({
        success: true,
        message: 'Holiday created successfully',
        data: holiday
      });
      
    } catch (error) {
      console.error('Error in createHoliday:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Get all holidays
  async getHolidays(req, res) {
    try {
      const { year, type, isActive } = req.query;
      
      let query = {};
      
      if (year) {
        query.Year = parseInt(year);
      }
      
      if (type) {
        query.Type = type;
      }
      
      if (isActive !== undefined) {
        query.IsActive = isActive === 'true';
      }
      
      const holidays = await Holiday.find(query).sort({ Date: 1 });
      
      return res.json({
        success: true,
        count: holidays.length,
        data: holidays
      });
      
    } catch (error) {
      console.error('Error in getHolidays:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Update holiday
  async updateHoliday(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const holiday = await Holiday.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
      
      if (!holiday) {
        return res.status(404).json({
          success: false,
          message: 'Holiday not found'
        });
      }
      
      return res.json({
        success: true,
        message: 'Holiday updated successfully',
        data: holiday
      });
      
    } catch (error) {
      console.error('Error in updateHoliday:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Delete holiday
  async deleteHoliday(req, res) {
    try {
      const { id } = req.params;
      
      const holiday = await Holiday.findByIdAndDelete(id);
      
      if (!holiday) {
        return res.status(404).json({
          success: false,
          message: 'Holiday not found'
        });
      }
      
      return res.json({
        success: true,
        message: 'Holiday deleted successfully'
      });
      
    } catch (error) {
      console.error('Error in deleteHoliday:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Check if date is holiday
  async checkHoliday(req, res) {
    try {
      const { date } = req.params;
      
      const holiday = await Holiday.findOne({
        Date: new Date(date),
        IsActive: true
      });
      
      return res.json({
        success: true,
        isHoliday: !!holiday,
        data: holiday
      });
      
    } catch (error) {
      console.error('Error in checkHoliday:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = new HolidayController();