const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const express = require('express');
const os = require('os');

// Function to get local IP address
const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

// Swagger configuration
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Employee Management & Quotation System API',
      version: '1.0.0',
      description: 'API documentation'
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }],
    servers: [
      {
        url: 'https://codiantsolutions.com/suyash-enterprises',
        description: 'Main server'
      },
      {
        url: `http://localhost:${process.env.PORT || 5009}`,
        description: 'Local server'
      },
      {
        url: 'http://{ip}:{port}',
        description: 'Network access',
        variables: {
          ip: {
            default: getLocalIp(),
            description: 'Your IP address'
          },
          port: {
            default: '5009',
            description: 'Port number'
          }
        }
      }
    ]
  },
  // This catches all .js files in routes and subdirectories
    apis: ['./routes/*.js',
    './routes/CRM/*.js' ,
    './routes/HR/*.js' ,
    './routes/Quality/*.js' ,
    './routes/Procurement/*.js',
    "./routes/user's & setting's/*.js",
  ]
};

// Generate Swagger specification
const specs = swaggerJsdoc(options);

// Log to verify it's working
console.log(' Swagger JSDoc initialized');
console.log(' Looking for route files in:', options.apis);
console.log(' Found endpoints:', Object.keys(specs.paths || {}).length);

// Swagger UI configuration with JAKARTA FONT
const swaggerUiOptions = {
  customSiteTitle: "Employee & Quotation System API Docs",
  customCss: `
    /* Import Jakarta Font */
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
    
    /* Hide topbar */
    .swagger-ui .topbar { display: none; }
    
    /* Apply Jakarta Font to everything */
    .swagger-ui,
    .swagger-ui .info .title,
    .swagger-ui .info li,
    .swagger-ui .info p,
    .swagger-ui .info h1,
    .swagger-ui .info h2,
    .swagger-ui .info h3,
    .swagger-ui .opblock-tag,
    .swagger-ui .opblock .opblock-summary-path,
    .swagger-ui .opblock .opblock-summary-description,
    .swagger-ui .tab li,
    .swagger-ui .response-col_status,
    .swagger-ui .response-col_description,
    .swagger-ui .btn,
    .swagger-ui .parameter__name,
    .swagger-ui .parameter__type,
    .swagger-ui .parameter__in,
    .swagger-ui .parameters-col_name,
    .swagger-ui .parameters-col_description,
    .swagger-ui .responses-header td,
    .swagger-ui .response-col_links,
    .swagger-ui .scheme-container,
    .swagger-ui .auth-wrapper,
    .swagger-ui .auth-container,
    .swagger-ui .dialog-ux,
    .swagger-ui .modal-ux,
    .swagger-ui .models {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    }
    
    /* Different font weights for better hierarchy */
    .swagger-ui .info .title {
      font-weight: 700 !important;
      font-size: 2.5rem !important;
      letter-spacing: -0.02em !important;
    }
    
    .swagger-ui .opblock-tag {
      font-weight: 600 !important;
      font-size: 1.3rem !important;
    }
    
    .swagger-ui .opblock .opblock-summary-path {
      font-weight: 600 !important;
      font-size: 1rem !important;
    }
    
    .swagger-ui .btn {
      font-weight: 500 !important;
    }
    
    /* Monospace font for code (keep this separate) */
    .swagger-ui code,
    .swagger-ui pre,
    .swagger-ui .opblock-body pre,
    .swagger-ui .response-col_description__inner pre,
    .swagger-ui .highlight-code,
    .swagger-ui .microlight,
    .swagger-ui .example {
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace !important;
      font-size: 13px !important;
    }
    
    /* Better spacing */
    .swagger-ui .info {
      margin: 30px 0 !important;
    }
    
    .swagger-ui .opblock {
      border-radius: 8px !important;
      margin: 0 0 20px 0 !important;
    }
    
    /* Jakarta Font also for authorize button and modals */
    .swagger-ui .auth-btn-wrapper button,
    .swagger-ui .modal-ux-content input,
    .swagger-ui .modal-ux-content label,
    .swagger-ui .auth-container select,
    .swagger-ui .auth-container input {
      font-family: 'Plus Jakarta Sans', sans-serif !important;
    }
    
    /* Make everything look cleaner */
    .swagger-ui .wrapper {
      padding: 0 30px !important;
    }
    
    /* Improve table readability */
    .swagger-ui table {
      font-family: 'Plus Jakarta Sans', sans-serif !important;
    }
    
    .swagger-ui .parameter__name {
      font-weight: 600 !important;
      font-size: 1rem !important;
    }
    
    .swagger-ui .parameter__type {
      color: #7c7c7c !important;
      font-size: 0.9rem !important;
    }
    
    /* Better button styling with Jakarta */
    .swagger-ui .btn.execute {
      background-color: #47b784 !important;
      font-weight: 600 !important;
      letter-spacing: 0.3px !important;
    }
    
    .swagger-ui .btn.authorize {
      border-color: #47b784 !important;
      color: #47b784 !important;
      font-weight: 600 !important;
    }
    
    .swagger-ui .btn.authorize svg {
      fill: #47b784 !important;
    }
  `,
  swaggerOptions: {
    validatorUrl: null,
    persistAuthorization: true,
    supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
    docExpansion: 'list',
    filter: true,
    showRequestDuration: true
  }
};

// Setup Swagger middleware
const setupSwagger = (app) => {
  // Serve swagger.json
  app.get('/api-docs/swagger.json', (req, res) => {
    const dynamicSpecs = {
      ...specs,
      servers: [
        {
          url: `${req.protocol}://${req.get('host')}`,
          description: 'Current server'
        }
      ]
    };
    res.setHeader('Content-Type', 'application/json');
    res.send(dynamicSpecs);
  });

  // Serve static assets with correct MIME types
  const swaggerUiPath = path.dirname(require.resolve('swagger-ui-dist'));
  app.use('/api-docs/assets', express.static(swaggerUiPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/' + filePath.split('.').pop());
      }
    }
  }));

  // Setup Swagger UI with Jakarta font
  app.use('/api-docs',
    swaggerUi.serve,
    (req, res, next) => {
      // Less restrictive CSP for Swagger UI
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src 'self' http: https:;"
      );
      next();
    },
    swaggerUi.setup(null, {
      ...swaggerUiOptions,
      explorer: true,
      swaggerUrl: '/api-docs/swagger.json'
    })
  );
};

module.exports = {
  setupSwagger,
  getLocalIp
};