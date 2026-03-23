// services/resumeParserService.js
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

class ResumeParserService {
  
  // Parse resume file
  async parseResume(filePath) {
    try {
      const fileExtension = filePath.split('.').pop().toLowerCase();
      let text = '';

      if (fileExtension === 'pdf') {
        text = await this.parsePDF(filePath);
      } else if (fileExtension === 'docx') {
        text = await this.parseDocx(filePath);
      } else {
        text = '';
      }

      // Extract structured data from text
      const parsedData = this.extractData(text);

      return parsedData;
    } catch (error) {
      console.error('Resume parsing error:', error);
      // Return default structure even if parsing fails
      return {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        skills: [],
        education: [],
        experience: []
      };
    }
  }

  // Parse PDF file
  async parsePDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('PDF parsing error:', error);
      return '';
    }
  }

  // Parse DOCX file
  async parseDocx(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      console.error('DOCX parsing error:', error);
      return '';
    }
  }

  // Extract structured data from text
  extractData(text) {
    const data = {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      skills: [],
      education: [],
      experience: []
    };

    if (!text) return data;

    // Extract email
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const emailMatch = text.match(emailRegex);
    if (emailMatch) {
      data.email = emailMatch[0];
    }

    // Extract phone (Indian format)
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const phoneMatch = text.match(phoneRegex);
    if (phoneMatch) {
      data.phone = phoneMatch[0].replace(/[^0-9]/g, '').slice(0, 10);
    }

    // Extract name (simplified)
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const nameLine = lines[0].trim();
      // Remove common non-name patterns
      if (!nameLine.toLowerCase().includes('resume') && 
          !nameLine.toLowerCase().includes('cv') &&
          !nameLine.toLowerCase().includes('curriculum')) {
        const nameParts = nameLine.split(' ');
        if (nameParts.length >= 2) {
          data.firstName = nameParts[0];
          data.lastName = nameParts.slice(1).join(' ');
        }
      }
    }

    // Extract skills
    const commonSkills = [
      'JavaScript', 'Python', 'Java', 'C++', 'Ruby', 'PHP', 'Swift',
      'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask',
      'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Oracle',
      'AWS', 'Azure', 'Docker', 'Kubernetes', 'Jenkins',
      'Git', 'JIRA', 'Confluence', 'Agile', 'Scrum',
      'Lathe operation', 'Welding', 'Quality control', 'CNC', 'Milling',
      'Machine Operation', 'Manufacturing', 'Production'
    ];

    commonSkills.forEach(skill => {
      if (text.toLowerCase().includes(skill.toLowerCase())) {
        data.skills.push(skill);
      }
    });

    return data;
  }
}

module.exports = new ResumeParserService();