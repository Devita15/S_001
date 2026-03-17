const fs = require('fs');
const path = require('path');

console.log('🔍 Scanning for incorrect paths...\n');

let fixedCount = 0;
let scannedCount = 0;

// Function to fix file content
function fixFileContent(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;
        
        // Fix model paths in controllers
        content = content.replace(
            /require\(['"]\.\.\/\.\.\/models\/user & setting's\/([^'"]+)['"]\)/g,
            "require('../../models/user\\'s & setting\\'s/$1')"
        );
        
        // Fix controller paths in routes
        content = content.replace(
            /require\(['"]\.\.\/\.\.\/controllers\/user & setting's\/([^'"]+)['"]\)/g,
            "require('../../controllers/user\\'s & setting\\'s/$1')"
        );
        
        // Fix routes paths in server.js
        content = content.replace(
            /require\(['"]\.\/routes\/user & setting's\/([^'"]+)['"]\)/g,
            "require('./routes/user\\'s & setting\\'s/$1')"
        );
        
        // Fix any paths with double quotes
        content = content.replace(
            /require\(["']\.\.\/\.\.\/models\/user & setting's\/([^"']+)["']\)/g,
            'require("../../models/user\'s & setting\'s/$1")'
        );
        
        content = content.replace(
            /require\(["']\.\.\/\.\.\/controllers\/user & setting's\/([^"']+)["']\)/g,
            'require("../../controllers/user\'s & setting\'s/$1")'
        );
        
        content = content.replace(
            /require\(["']\.\/routes\/user & setting's\/([^"']+)["']\)/g,
            'require("./routes/user\'s & setting\'s/$1")'
        );
        
        // Also fix any require statements that might have the pattern without proper escaping
        content = content.replace(
            /require\(['"]\.\.\/\.\.\/models\/user & setting\\'s\/([^'"]+)['"]\)/g,
            "require('../../models/user\\'s & setting\\'s/$1')"
        );
        
        content = content.replace(
            /require\(['"]\.\.\/\.\.\/controllers\/user & setting\\'s\/([^'"]+)['"]\)/g,
            "require('../../controllers/user\\'s & setting\\'s/$1')"
        );
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        }
        return false;
    } catch (err) {
        console.error(`❌ Error reading ${filePath}:`, err.message);
        return false;
    }
}

// Walk through directories recursively
function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat && stat.isDirectory()) {
            // Skip node_modules and .git
            if (!filePath.includes('node_modules') && !filePath.includes('.git')) {
                results = results.concat(walkDir(filePath));
            }
        } else {
            if (file.endsWith('.js')) {
                results.push(filePath);
            }
        }
    });
    
    return results;
}

// Get all JS files (excluding node_modules)
console.log('📁 Scanning all JavaScript files...');
const allJsFiles = walkDir(__dirname).filter(file => 
    !file.includes('node_modules') && 
    !file.includes('.git') &&
    !file.includes('fix-all-paths.js') // Don't fix itself
);

console.log(`Found ${allJsFiles.length} JavaScript files to check.\n`);

// Fix each file
allJsFiles.forEach(filePath => {
    const relativePath = path.relative(__dirname, filePath);
    scannedCount++;
    
    if (fixFileContent(filePath)) {
        console.log(`✅ Fixed: ${relativePath}`);
        fixedCount++;
    } else {
        // Uncomment to see all files checked
        // console.log(`⏭️  No changes: ${relativePath}`);
    }
});

console.log(`\n✨ Done! Scanned ${scannedCount} files, fixed ${fixedCount} files.`);
console.log('\n🚀 Now run: npm run dev');