// services/documentService.js
const fs = require('fs');
const path = require('path');

class DocumentService {
  
  constructor() {
    this.uploadDir = path.join(__dirname, '../uploads');
    this.ensureUploadDir();
  }

  ensureUploadDir() {
    const dirs = [
      this.uploadDir,
      path.join(this.uploadDir, 'resumes'),
      path.join(this.uploadDir, 'signatures'),
      path.join(this.uploadDir, 'requisitions'),
      path.join(this.uploadDir, 'documents'),
      path.join(this.uploadDir, 'profile-pictures')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Upload attachment
  async uploadAttachment(file, folder = 'documents') {
    try {
      if (!file) {
        throw new Error('No file provided');
      }

      const fileName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const filePath = path.join(this.uploadDir, folder, fileName);
      
      // Save file
      if (file.buffer) {
        fs.writeFileSync(filePath, file.buffer);
      } else if (file.path) {
        // If file was saved by multer, move it
        fs.renameSync(file.path, filePath);
      } else {
        throw new Error('Invalid file object');
      }

      // Return file info
      return {
        filename: file.originalname,
        fileUrl: `/uploads/${folder}/${fileName}`,
        size: file.size || 0,
        path: filePath
      };
    } catch (error) {
      console.error('Upload attachment error:', error);
      throw error;
    }
  }

  // Save base64 signature
  async saveSignature(base64Signature, fileName) {
    try {
      // Remove data:image/png;base64, prefix if present
      const base64Data = base64Signature.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      const filePath = path.join(this.uploadDir, 'signatures', fileName);
      
      fs.writeFileSync(filePath, buffer);
      
      return `/uploads/signatures/${fileName}`;
    } catch (error) {
      console.error('Save signature error:', error);
      throw error;
    }
  }

  // Delete file
  deleteFile(fileUrl) {
    try {
      const fileName = path.basename(fileUrl);
      const filePath = path.join(this.uploadDir, fileName);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Delete file error:', error);
      return false;
    }
  }
}

module.exports = new DocumentService();