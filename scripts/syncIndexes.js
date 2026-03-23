// scripts/syncIndexes.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Explicitly load .env

// Debug: Check if env vars are loaded
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Found' : '❌ Not found');

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected');
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const syncIndexes = async () => {
  try {
    await connectDB();
    
    // Import models
    const Notification = require('../models/Notification');
    const JobOpening = require('../models/JobOpening');
    const Candidate = require('../models/Candidate');
    const Application = require('../models/Application');
    const Requisition = require('../models/Requisition');
    const User = require('../models/User');
    const Role = require('../models/Role');
    const Interview = require('../models/Interview');
    
    const models = [
      { name: 'Notification', model: Notification },
      { name: 'JobOpening', model: JobOpening },
      { name: 'Candidate', model: Candidate },
      { name: 'Application', model: Application },
      { name: 'Requisition', model: Requisition },
      { name: 'User', model: User },
      { name: 'Role', model: Role },
      { name: 'Interview', model: Interview }
    ];
    
    for (const { name, model } of models) {
      try {
        await model.syncIndexes();
        console.log(`✅ Synced indexes for ${name}`);
      } catch (err) {
        console.error(`❌ Failed to sync indexes for ${name}:`, err.message);
      }
    }
    
    console.log('\n✅ All indexes synced successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error syncing indexes:', error);
    process.exit(1);
  }
};

syncIndexes();