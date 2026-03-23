// final-test.js
console.log('1. Testing models path...');
try {
  const Shift = require('./models/HR/Shift');
  const EmployeeShift = require('./models/HR/EmployeeShift');
  console.log('✅ Models loaded');
} catch (e) {
  console.error('❌ Models error:', e.message);
}

console.log('\n2. Testing controller...');
try {
  const shiftController = require('./controllers/HR/shiftController');
  console.log('✅ Controller loaded');
  console.log('Methods found:', Object.keys(shiftController));
} catch (e) {
  console.error('❌ Controller error:', e.message);
}

console.log('\n3. Testing route import...');
try {
  const shiftRoutes = require('./routes/HR/shiftRoutes');
  console.log('✅ Routes loaded');
} catch (e) {
  console.error('❌ Routes error:', e.message);
  console.error('Stack:', e.stack);
}