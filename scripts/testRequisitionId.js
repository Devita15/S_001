// scripts/testRequisitionId.js
const mongoose = require('mongoose');
const Requisition = require('../models/Requisition');
require('dotenv').config();

const testRequisitionId = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Test generating ID
    const generateId = async () => {
      const year = new Date().getFullYear();
      const count = await Requisition.countDocuments({
        requisitionId: new RegExp(`REQ-${year}-`, 'i')
      });
      return `REQ-${year}-${(count + 1).toString().padStart(4, '0')}`;
    };

    const id = await generateId();
    console.log('Generated requisitionId:', id);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

testRequisitionId();