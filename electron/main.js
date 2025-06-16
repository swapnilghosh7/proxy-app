const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const ip = require('ip');
const tcpPortUsed = require('tcp-port-used');
const find = require('find-process');
const { exec } = require('child_process');

let mainWindow;
let proxyServer;
let expressApp;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    resizable: true,
    autoHideMenuBar: true, // Hide the menu bar for a cleaner UI
  });

  // Load the app
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Don't open DevTools automatically
  
  mainWindow.on('closed', () => (mainWindow = null));
  
  // Make sure to stop proxy server when window is closed
  mainWindow.on('close', () => {
    if (proxyServer) {
      proxyServer.close();
      proxyServer = null;
    }
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle proxy server start/stop
ipcMain.on('start-proxy', (event, { targetUrl, headers, port }) => {
  if (proxyServer) {
    event.reply('proxy-status', { 
      status: 'error', 
      message: 'Proxy server is already running' 
    });
    return;
  }

  if (!targetUrl) {
    event.reply('proxy-status', { 
      status: 'error', 
      message: 'Target URL is required' 
    });
    return;
  }

  if (!port || isNaN(port) || port < 1 || port > 65535) {
    event.reply('proxy-status', { 
      status: 'error', 
      message: 'Invalid port number. Please enter a valid port between 1-65535.' 
    });
    return;
  }
  try {    // Create Express app
    expressApp = express();
    
    // Enable CORS with options
    expressApp.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Custom-Header-Proxy', 'x-nv-security-magic'],
      exposedHeaders: ['*'],
      credentials: true
    }));
    
    // Log all incoming requests in dev mode
    if (isDev) {
      expressApp.use((req, res, next) => {
        console.log(`Incoming request: ${req.method} ${req.url}`);
        console.log('Request headers:', req.headers);
        next();
      });
    }    // Add custom middleware to ensure headers are added
    expressApp.use((req, res, next) => {
      // Add custom headers to all outgoing requests
      Object.keys(headers).forEach(key => {
        req.headers[key.toLowerCase()] = headers[key];
      });
      
      // Add identification header
      req.headers['x-custom-header-proxy'] = 'true';
      
      if (isDev) {
        console.log('Modified request headers in middleware:', req.headers);
      }
      
      next();
    });

    // Add a route for basic health check and debugging
    expressApp.get('/__proxy_health', (req, res) => {
      // Log the request headers for debugging
      if (isDev) {
        console.log('Health check request headers:', req.headers);
      }
      
      res.send({
        status: 'ok',
        target: targetUrl,
        headerCount: Object.keys(headers).length,
        configuredHeaders: headers,
        requestHeaders: req.headers,
        timestamp: new Date().toISOString()
      });
    });

    // Add a test endpoint to verify header forwarding
    expressApp.get('/__test_headers', (req, res) => {
      res.send({
        received: true,
        headers: req.headers,
        forwardedHeaders: Object.keys(headers).reduce((acc, key) => {
          acc[key] = req.headers[key.toLowerCase()];
          return acc;
        }, {})
      });
    });

    // Set up proxy middleware
    const proxyOptions = {
      target: targetUrl,
      changeOrigin: true,
      followRedirects: true,
      secure: false, // Allow self-signed certificates
      headers: headers, // Set headers directly on the options
      onProxyReq: (proxyReq) => {
        // Force-clear any existing headers with the same names to avoid conflicts
        Object.keys(headers).forEach(key => {
          proxyReq.removeHeader(key);
          // Now set the header
          proxyReq.setHeader(key, headers[key]);
          
          // Log in dev mode to confirm headers are being set
          if (isDev) {
            console.log(`Setting header: ${key}: ${headers[key]}`);
          }
        });
        
        // Add identification header
        proxyReq.setHeader('X-Custom-Header-Proxy', 'true');
        
        // Log headers being sent (if in dev mode)
        if (isDev) {
          console.log('Proxying request with headers:', headers);
          console.log('Full request headers:', proxyReq.getHeaders ? proxyReq.getHeaders() : 'Headers not available');
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Log response status (if in dev mode)
        if (isDev) {
          console.log(`Response from ${targetUrl}${req.url}: ${proxyRes.statusCode}`);
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'text/html'
          });
          res.end(`<h1>Proxy Error</h1>
                  <p>Error connecting to target: ${targetUrl}</p>
                  <p>${err.message}</p>
                  <p>Check if the target URL is correct and accessible.</p>`);
        }
      },
      logLevel: isDev ? 'debug' : 'silent'
    };    // Apply proxy middleware to all routes
    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      followRedirects: true,
      secure: false,
      headers: headers,
      onProxyReq: (proxyReq, req, res) => {
        // Force set headers on each request
        Object.keys(headers).forEach(key => {
          proxyReq.removeHeader(key);
          proxyReq.setHeader(key, headers[key]);
          
          if (isDev) {
            console.log(`Setting header on proxy request: ${key}: ${headers[key]}`);
          }
        });
        
        // Add identification header
        proxyReq.setHeader('X-Custom-Header-Proxy', 'true');
        
        if (isDev) {
          console.log('Final proxy request headers:', proxyReq.getHeaders ? proxyReq.getHeaders() : 'Headers not available');
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Log response status (if in dev mode)
        if (isDev) {
          console.log(`Response from ${targetUrl}${req.url}: ${proxyRes.statusCode}`);
          console.log('Response headers:', proxyRes.headers);
        }
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'text/html'
          });
          res.end(`<h1>Proxy Error</h1>
                  <p>Error connecting to target: ${targetUrl}</p>
                  <p>${err.message}</p>
                  <p>Check if the target URL is correct and accessible.</p>`);
        }
      },
      logLevel: isDev ? 'debug' : 'silent'
    });
    
    expressApp.use('/', proxy);
    proxyServer = expressApp.listen(port);
    
    proxyServer.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        event.reply('proxy-status', { 
          status: 'error', 
          message: `Port ${port} is already in use. Please choose a different port.` 
        });
      } else {
        event.reply('proxy-status', { 
          status: 'error', 
          message: `Server error: ${error.message}` 
        });
      }
      proxyServer = null;
    });    proxyServer.on('listening', () => {
      const localIp = ip.address();
      const proxyUrl = `http://${localIp}:${port}`;
      
      event.reply('proxy-status', { 
        status: 'running', 
        message: `Proxy server started at ${proxyUrl}`,
        proxyUrl
      });
      
      // Log server startup info in dev mode
      if (isDev) {
        console.log(`Proxy server running at ${proxyUrl}`);
        console.log(`Proxying requests to ${targetUrl}`);
        console.log(`With headers:`, headers);
      }
    });

  } catch (error) {
    event.reply('proxy-status', { 
      status: 'error', 
      message: `Failed to start proxy: ${error.message}` 
    });
  }
});

ipcMain.on('stop-proxy', (event) => {
  if (proxyServer) {
    proxyServer.close(() => {
      proxyServer = null;
      event.reply('proxy-status', { 
        status: 'stopped', 
        message: 'Proxy server stopped' 
      });
    });
  } else {
    event.reply('proxy-status', { 
      status: 'error', 
      message: 'No proxy server is running' 
    });
  }
});

// Get local IP address
ipcMain.handle('get-local-ip', async () => {
  return ip.address();
});

// Check if a port is in use and return process details
ipcMain.handle('check-port-availability', async (event, port) => {
  if (!port || isNaN(port) || port < 1 || port > 65535) {
    return { available: false, error: 'Invalid port number' };
  }

  try {
    const inUse = await tcpPortUsed.check(parseInt(port, 10));
    
    if (inUse) {
      // Find process using this port
      const processes = await find('port', parseInt(port, 10));
      if (processes && processes.length > 0) {
        return { 
          available: false, 
          process: {
            pid: processes[0].pid,
            name: processes[0].name,
            cmd: processes[0].cmd
          }
        };
      } else {
        return { available: false, process: null };
      }
    } else {
      return { available: true };
    }
  } catch (error) {
    console.error('Error checking port:', error);
    return { available: false, error: error.message };
  }
});

// Kill a process using a specific port
ipcMain.on('kill-port-process', async (event, { port, pid }) => {
  try {
    if (process.platform === 'win32') {
      // Windows
      exec(`taskkill /F /PID ${pid}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error killing process: ${error.message}`);
          event.reply('port-check-result', { 
            success: false, 
            message: `Failed to kill process: ${error.message}` 
          });
          return;
        }
        event.reply('port-check-result', { 
          success: true, 
          message: `Process killed successfully` 
        });
      });
    } else {
      // macOS/Linux
      exec(`kill -9 ${pid}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error killing process: ${error.message}`);
          event.reply('port-check-result', { 
            success: false, 
            message: `Failed to kill process: ${error.message}` 
          });
          return;
        }
        event.reply('port-check-result', { 
          success: true, 
          message: `Process killed successfully` 
        });
      });
    }
  } catch (error) {
    console.error('Error killing process:', error);
    event.reply('port-check-result', { 
      success: false, 
      message: `Error: ${error.message}` 
    });
  }
});

// Make sure to stop the proxy server before quitting the app
app.on('before-quit', () => {
  if (proxyServer) {
    proxyServer.close();
    proxyServer = null;
  }
});
