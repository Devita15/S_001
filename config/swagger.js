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
        url: 'http://codiantsolutions.com/suyash-enterprises',
        description: 'Main server'
      },
      {
        url: 'http://localhost:5010',
        description: 'Local server'
      },
      {
        url: 'http://{ip}:5010',
        description: 'Network access',
        variables: {
          ip: {
            default: getLocalIp(),
            description: 'Your IP address'
          }
        }
      }
    ]
  },
  apis: ['./routes/*.js']
};

// Generate Swagger specification
const specs = swaggerJsdoc(options);

// Swagger UI configuration
const swaggerUiOptions = {
  customSiteTitle: "Employee & Quotation System API Docs",
  customCss: '.swagger-ui .topbar { display: none }',
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

  // CRITICAL FIX: Serve static assets with correct MIME types
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

  // Remove problematic CSP headers or adjust them
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