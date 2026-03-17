const mongoose = require('mongoose');
const dotenv = require('dotenv');
const seedTemplates = require('./createTemplates');

dotenv.config();

const runSeed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');
    
    await seedTemplates();
    
    console.log('✨ Template seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('💥 Seeding error:', error);
    process.exit(1);
  }
};

runSeed();