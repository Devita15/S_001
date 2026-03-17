const fs = require('fs');
const path = require('path');
console.log('🔧 Starting complete path fix...\n');
// Define the correct base paths based on your structure
const basePaths = {
    controllers: './controllers',
    models: './models',
    routes: './routes',
    services: './services',
    middleware: './middleware',
    utils: './utils',
    config: './config'
};

// Define subdirectories
const subdirs = {
    controllers: ['CRM', 'HR', 'user & setting\'s'],
    models: ['CRM', 'HR', 'user\'s & setting\'s'],
    routes: ['CRM', 'HR', 'user\'s & setting\'s']
};

// Function to get correct relative path
function getCorrectRelativePath(fromFile, toType, toSubdir = '', toFile = '') {
    const fromDir = path.dirname(fromFile);
    const fromParts = fromDir.split(path.sep);
    
    // Calculate relative path based on file location
    if (fromParts.includes('controllers')) {
        if (toType === 'models') return `../../models/${toSubdir}/${toFile}`;
        if (toType === 'services') return `../../services/${toFile}`;
        if (toType === 'utils') return `../../utils/${toFile}`;
        if (toType === 'config') return `../../config/${toFile}`;
    } else if (fromParts.includes('routes')) {
        if (toType === 'controllers') return `../../controllers/${toSubdir}/${toFile}`;
        if (toType === 'models') return `../../models/${toSubdir}/${toFile}`;
        if (toType === 'middleware') return `../../middleware/${toFile}`;
        if (toType === 'services') return `../../services/${toFile}`;
        if (toType === 'utils') return `../../utils/${toFile}`;
    } else if (fromParts.includes('services')) {
        if (toType === 'models') return `../models/${toSubdir}/${toFile}`;
        if (toType === 'utils') return `../utils/${toFile}`;
        if (toType === 'config') return `../config/${toFile}`;
    }
    
    return '';
}

// Function to update file paths
function updateFilePaths(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;
        let updated = false;
        
        const fileDir = path.dirname(filePath);
        
        // Update controller imports in route files
        if (filePath.includes('routes')) {
            // Match require statements for controllers
            const controllerRegex = /require\(['"]\.\.\/controllers\/([^'"]+)['"]\)/g;
            content = content.replace(controllerRegex, (match, controllerPath) => {
                // Check if the controller path already has the correct subdirectory
                const controllerParts = controllerPath.split('/');
                if (controllerParts.length === 1) {
                    // Just the filename without subdirectory
                    // Try to find which subdirectory it belongs to
                    for (const subdir of subdirs.controllers) {
                        const fullPath = path.join(basePaths.controllers, subdir, controllerParts[0] + '.js');
                        if (fs.existsSync(fullPath)) {
                            updated = true;
                            return `require('../../controllers/${subdir}/${controllerParts[0]}')`;
                        }
                    }
                }
                return match;
            });
            
            // Match require statements for models in routes
            const modelRegex = /require\(['"]\.\.\/models\/([^'"]+)['"]\)/g;
            content = content.replace(modelRegex, (match, modelPath) => {
                const modelParts = modelPath.split('/');
                if (modelParts.length === 1) {
                    for (const subdir of subdirs.models) {
                        const fullPath = path.join(basePaths.models, subdir, modelParts[0] + '.js');
                        if (fs.existsSync(fullPath)) {
                            updated = true;
                            return `require('../../models/${subdir}/${modelParts[0]}')`;
                        }
                    }
                }
                return match;
            });
            
            // Update middleware imports
            const middlewareRegex = /require\(['"]\.\.\/middleware\/([^'"]+)['"]\)/g;
            content = content.replace(middlewareRegex, (match, middlewareFile) => {
                const fullPath = path.join(basePaths.middleware, middlewareFile + '.js');
                if (fs.existsSync(fullPath)) {
                    return match; // Already correct
                }
                updated = true;
                return `require('../../middleware/${middlewareFile}')`;
            });
        }
        
        // Update imports in controller files
        if (filePath.includes('controllers')) {
            // Update model imports in controllers
            const modelRegex = /require\(['"]\.\.\/models\/([^'"]+)['"]\)/g;
            content = content.replace(modelRegex, (match, modelPath) => {
                const modelParts = modelPath.split('/');
                if (modelParts.length === 1) {
                    for (const subdir of subdirs.models) {
                        const fullPath = path.join(basePaths.models, subdir, modelParts[0] + '.js');
                        if (fs.existsSync(fullPath)) {
                            updated = true;
                            return `require('../../models/${subdir}/${modelParts[0]}')`;
                        }
                    }
                }
                return match;
            });
            
            // Update service imports in controllers
            const serviceRegex = /require\(['"]\.\.\/services\/([^'"]+)['"]\)/g;
            content = content.replace(serviceRegex, (match, serviceFile) => {
                const fullPath = path.join(basePaths.services, serviceFile + '.js');
                if (fs.existsSync(fullPath)) {
                    return `require('../services/${serviceFile}')`;
                }
                return match;
            });
            
            // Update utils imports in controllers
            const utilsRegex = /require\(['"]\.\.\/utils\/([^'"]+)['"]\)/g;
            content = content.replace(utilsRegex, (match, utilsFile) => {
                const fullPath = path.join(basePaths.utils, utilsFile + '.js');
                if (fs.existsSync(fullPath)) {
                    return `require('../utils/${utilsFile}')`;
                }
                return match;
            });
        }
        
        // Update imports in service files
        if (filePath.includes('services')) {
            // Update model imports in services
            const modelRegex = /require\(['"]\.\.\/models\/([^'"]+)['"]\)/g;
            content = content.replace(modelRegex, (match, modelPath) => {
                const modelParts = modelPath.split('/');
                if (modelParts.length === 1) {
                    for (const subdir of subdirs.models) {
                        const fullPath = path.join(basePaths.models, subdir, modelParts[0] + '.js');
                        if (fs.existsSync(fullPath)) {
                            updated = true;
                            return `require('../models/${subdir}/${modelParts[0]}')`;
                        }
                    }
                }
                return match;
            });
        }
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated: ${filePath}`);
            return true;
        }
    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
    }
    return false;
}

// Function to scan directories recursively
function scanDirectory(directory) {
    if (!fs.existsSync(directory)) {
        console.log(`⚠️  Directory not found: ${directory}`);
        return;
    }
    
    const items = fs.readdirSync(directory);
    
    items.forEach(item => {
        const itemPath = path.join(directory, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            // Skip node_modules and other unnecessary directories
            if (!itemPath.includes('node_modules') && !itemPath.includes('.git') && !itemPath.includes('.cache')) {
                scanDirectory(itemPath);
            }
        } else if (item.endsWith('.js') || item.endsWith('.mjs') || item.endsWith('.cjs')) {
            updateFilePaths(itemPath);
        }
    });
}
// Start scanning from root directories
const rootDirs = ['controllers', 'routes', 'services', 'middleware', 'utils', 'config', 'models'];

rootDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    console.log(`📁 Scanning: ${fullPath}`);
    scanDirectory(fullPath);
});

console.log('\n✨ Complete path fix completed!');