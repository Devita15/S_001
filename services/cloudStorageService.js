// services/cloudStorageService.js
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class CloudStorageService {
  
  constructor() {
    // Base upload directory
    this.uploadDir = path.join(__dirname, '../uploads');
    this.baseUrl = process.env.BASE_URL || 'http://localhost:5009';
    
    // Create upload directories if they don't exist
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [
      this.uploadDir,
      path.join(this.uploadDir, 'appointment-letters'),
      path.join(this.uploadDir, 'appointment-letters', 'signed'),
      path.join(this.uploadDir, 'temp')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
  }

  // Upload file directly
  async uploadFile(filePath, folder) {
    try {
      // Read the file
      const fileContent = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      
      // Create destination path
      const destFolder = path.join(this.uploadDir, folder);
      if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
      }

      // Generate unique filename
      const ext = path.extname(filename);
      const newFilename = `${Date.now()}-${uuidv4()}${ext}`;
      const destPath = path.join(destFolder, newFilename);

      // Write file
      fs.writeFileSync(destPath, fileContent);

      // Generate URL
      const fileUrl = `${this.baseUrl}/uploads/${folder}/${newFilename}`;

      return {
        key: `${folder}/${newFilename}`,
        fileUrl: fileUrl,
        etag: null,
        localPath: destPath
      };
    } catch (error) {
      console.error('Upload file error:', error);
      throw error;
    }
  }

  // Generate presigned URL (for local, just return the file URL)
  async generatePresignedUploadUrl(folder, filename, contentType) {
    try {
      const ext = path.extname(filename);
      const newFilename = `${Date.now()}-${uuidv4()}${ext}`;
      const key = `${folder}/${newFilename}`;
      
      return {
        url: `${this.baseUrl}/api/upload/local/${key}`, // You'd need to create this endpoint
        key: key,
        fileUrl: `${this.baseUrl}/uploads/${key}`
      };
    } catch (error) {
      console.error('Generate presigned URL error:', error);
      throw error;
    }
  }

  // Generate download URL
  async generatePresignedDownloadUrl(key, expiresIn = 3600) {
    try {
      return `${this.baseUrl}/uploads/${key}`;
    } catch (error) {
      console.error('Generate download URL error:', error);
      throw error;
    }
  }

  // Delete file
  async deleteFile(key) {
    try {
      const filePath = path.join(this.uploadDir, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }

  // Get file URL
  getFileUrl(key) {
    return `${this.baseUrl}/uploads/${key}`;
  }

  // Get content type from filename
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.txt': 'text/plain'
    };
    return types[ext] || 'application/octet-stream';
  }
}

module.exports = new CloudStorageService();