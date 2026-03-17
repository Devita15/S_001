const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create company logos directory if it doesn't exist
const companyLogosDir = 'uploads';
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
if (!fs.existsSync(companyLogosDir)) {
  fs.mkdirSync(companyLogosDir);
}

// Configure storage for company logos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, companyLogosDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const companyId = req.params.id || 'new';
    const ext = path.extname(file.originalname);
    cb(null, `company-${companyId}-${uniqueSuffix}${ext}`);
  }
});

// File filter for company logos
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WEBP images are allowed.'), false);
  }
};

const uploadCompanyLogo = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

module.exports = uploadCompanyLogo;