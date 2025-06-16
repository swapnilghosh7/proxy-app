import React, { useState, useEffect } from 'react';

// Safe way to access electron's IPC
const electronAPI = window.electron;

function App() {
  const [targetUrl, setTargetUrl] = useState('');
  const [headers, setHeaders] = useState([]);
  const [port, setPort] = useState('3000');
  const [proxyStatus, setProxyStatus] = useState({ status: 'stopped' });
  const [localIp, setLocalIp] = useState('localhost');
  const [isStarting, setIsStarting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Track original values for restart detection
  const [originalTargetUrl, setOriginalTargetUrl] = useState('');
  const [originalHeaders, setOriginalHeaders] = useState([]);
  const [originalPort, setOriginalPort] = useState('');
  const [inputsChanged, setInputsChanged] = useState(false);
  
  // Port availability checking
  const [portStatus, setPortStatus] = useState({ available: true });
  const [isCheckingPort, setIsCheckingPort] = useState(false);  const copyToClipboard = (text) => {
    // First try the Electron API
    if (electronAPI && electronAPI.clipboard && typeof electronAPI.clipboard.writeText === 'function') {
      try {
        const success = electronAPI.clipboard.writeText(text);
        setCopySuccess(success);
        if (success) {
          setTimeout(() => setCopySuccess(false), 2000);
        } else {
          console.error('Failed to copy text to clipboard with Electron API');
          // Try the browser API as fallback
          fallbackCopyToClipboard(text);
        }
      } catch (error) {
        console.error('Error copying to clipboard with Electron API:', error);
        // Try the browser API as fallback
        fallbackCopyToClipboard(text);
      }
    } else {
      console.warn('Electron Clipboard API not available, trying browser API');
      fallbackCopyToClipboard(text);
    }
  };
  
  // Modern clipboard API fallback
  const modernClipboardFallback = async (text) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error with modern clipboard API:', error);
      return false;
    }
  };
  
  // Fallback to using browser clipboard API
  const fallbackCopyToClipboard = async (text) => {
    // First try modern clipboard API
    const modernSuccess = await modernClipboardFallback(text);
    if (modernSuccess) return;
    
    try {
      // Create a temporary textarea element
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Make the textarea out of viewport
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      // Execute copy command
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (success) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        setProxyStatus({
          status: 'error',
          message: 'Failed to copy URL to clipboard. Please select and copy manually.'
        });
        setTimeout(() => {
          setProxyStatus(prev => prev.status === 'error' ? { status: 'running' } : prev);
        }, 3000);
      }
    } catch (error) {
      console.error('Error with fallback clipboard method:', error);
      setProxyStatus({
        status: 'error',
        message: 'Error copying URL to clipboard. Please select and copy manually.'
      });
      setTimeout(() => {
        setProxyStatus(prev => prev.status === 'error' ? { status: 'running' } : prev);
      }, 3000);
      
    }
  };
    
  useEffect(() => {
    // Only run Electron-specific code if electronAPI is available
    if (electronAPI) {
      // Get local IP address when component mounts
      const getLocalIp = async () => {
        try {
          const ip = await electronAPI.ipcRenderer.invoke('get-local-ip');
          setLocalIp(ip);
        } catch (error) {
          console.error('Error getting local IP:', error);
        }
      };
      getLocalIp();

      // Listen for proxy status updates
      electronAPI.ipcRenderer.on('proxy-status', (data) => {
        setProxyStatus(data);
        setIsStarting(false); // Always stop loading state when we get a response
      });
      
      // Listen for port check results
      electronAPI.ipcRenderer.on('port-check-result', (data) => {
        setIsCheckingPort(false);
        if (data.success) {
          // Port is now available, update the status
          setPortStatus({ available: true });
        } else {
          // Failed to kill the process
          setProxyStatus({
            status: 'error',
            message: data.message
          });
        }
      });

      // Clean up event listeners on unmount
      return () => {
        electronAPI.ipcRenderer.removeAllListeners('proxy-status');
        electronAPI.ipcRenderer.removeAllListeners('port-check-result');
      };
    } else {
      console.log('Running in browser mode - Electron features disabled');
    }
  }, []);

  const addHeader = () => {
    const newHeaders = [...headers, { key: '', value: '' }];
    setHeaders(newHeaders);
    checkForChanges(targetUrl, newHeaders, port);
  };

  const removeHeader = (index) => {
    const newHeaders = [...headers];
    newHeaders.splice(index, 1);
    setHeaders(newHeaders);
    checkForChanges(targetUrl, newHeaders, port);
  };

  const updateHeader = (index, field, value) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
    checkForChanges(targetUrl, newHeaders, port);
  };

  // Check if any inputs have changed compared to original values
  const checkForChanges = (currentUrl, currentHeaders, currentPort) => {
    if (proxyStatus.status !== 'running') {
      return;
    }
    
    // Compare URL and port
    const urlChanged = currentUrl !== originalTargetUrl;
    const portChanged = currentPort !== originalPort;
    
    // Compare headers (more complex comparison)
    const headersChanged = JSON.stringify(
      currentHeaders.filter(h => h.key.trim() && h.value.trim())
        .map(h => ({ key: h.key.trim(), value: h.value.trim() }))
    ) !== JSON.stringify(originalHeaders);
    
    setInputsChanged(urlChanged || portChanged || headersChanged);
  };

  const startProxy = () => {
    // Validate URL
    if (!targetUrl) {
      setProxyStatus({
        status: 'error',
        message: 'Please enter a target website URL'
      });
      return;
    }

    // Simple URL validation
    try {
      new URL(targetUrl);
    } catch (e) {
      setProxyStatus({
        status: 'error',
        message: 'Please enter a valid URL (e.g., https://example.com)'
      });
      return;
    }

    // Validate port
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setProxyStatus({
        status: 'error',
        message: 'Please enter a valid port number (1-65535)'
      });
      return;
    }    // Convert headers array to object and validate
    const validHeaders = headers.filter(header => header.key.trim() !== '' && header.value.trim() !== '');
    
    if (headers.some(h => h.key.trim() !== '' && h.value.trim() === '') || 
        headers.some(h => h.key.trim() === '' && h.value.trim() !== '')) {
      setProxyStatus({
        status: 'error',
        message: 'Please provide both key and value for all headers or remove incomplete ones'
      });
      return;
    }
    
    const headersObj = {};
    validHeaders.forEach(header => {
      headersObj[header.key.trim()] = header.value.trim();
    });if (electronAPI) {
      setIsStarting(true); // Set loading state
      setProxyStatus({ status: 'starting', message: 'Starting proxy server...' });
      
      // Store original values for detecting changes
      setOriginalTargetUrl(targetUrl);
      setOriginalPort(port);
      setOriginalHeaders(validHeaders.map(h => ({ key: h.key.trim(), value: h.value.trim() })));
      setInputsChanged(false);
      
      electronAPI.ipcRenderer.send('start-proxy', {
        targetUrl,
        headers: headersObj,
        port: parseInt(port, 10)
      });
    } else {
      console.log('Browser mode: Cannot start proxy server');
      alert('This feature requires the Electron app environment. You are currently in browser development mode.');
    }
  };
  const stopProxy = () => {
    if (electronAPI) {
      setIsStarting(true); // Set loading state to prevent multiple clicks
      setProxyStatus({ status: 'stopping', message: 'Stopping proxy server...' });
      electronAPI.ipcRenderer.send('stop-proxy');
      
      // Reset port status to check again after stopping
      setTimeout(() => {
        if (port && !isNaN(port)) {
          checkPortAvailability(parseInt(port, 10));
        }
      }, 1000);
    } else {
      console.log('Browser mode: Cannot stop proxy server');
      alert('This feature requires the Electron app environment. You are currently in browser development mode.');
    }
  };

  const restartProxy = () => {
    if (electronAPI) {
      // First stop the proxy server
      setIsStarting(true);
      setProxyStatus({ status: 'restarting', message: 'Restarting proxy server...' });
      
      // Send stop command to main process
      electronAPI.ipcRenderer.send('stop-proxy');
        // Set a small timeout to ensure the server has fully stopped
      setTimeout(() => {
        // Convert headers array to object and validate
        const validHeaders = headers.filter(header => header.key.trim() !== '' && header.value.trim() !== '');
        
        const headersObj = {};
        validHeaders.forEach(header => {
          headersObj[header.key.trim()] = header.value.trim();
        });
        
        // Store original values for detecting changes
        setOriginalTargetUrl(targetUrl);
        setOriginalPort(port);
        setOriginalHeaders(validHeaders.map(h => ({ key: h.key.trim(), value: h.value.trim() })));
        setInputsChanged(false);
        
        // Start the proxy with new settings
        electronAPI.ipcRenderer.send('start-proxy', {
          targetUrl,
          headers: headersObj,
          port: parseInt(port, 10)
        });
      }, 500);
    } else {
      console.log('Browser mode: Cannot restart proxy server');
      alert('This feature requires the Electron app environment. You are currently in browser development mode.');
    }
  };
  
  // Check if a port is available
  const checkPortAvailability = async (portNum) => {
    if (!electronAPI) return;
    
    // Don't check if the proxy is running or if the port is invalid
    if (proxyStatus.status === 'running' || 
        isNaN(portNum) || 
        portNum < 1 || 
        portNum > 65535) {
      return;
    }
    
    setIsCheckingPort(true);
    try {
      const result = await electronAPI.ipcRenderer.invoke('check-port-availability', portNum);
      setPortStatus(result);
      setIsCheckingPort(false);
    } catch (error) {
      console.error('Error checking port availability:', error);
      setPortStatus({ available: false, error: error.message });
      setIsCheckingPort(false);
    }
  };
  
  // Kill process using the port
  const killPortProcess = () => {
    if (!electronAPI || !portStatus.process) return;
    
    setIsCheckingPort(true);
    electronAPI.ipcRenderer.send('kill-port-process', {
      port: parseInt(port, 10),
      pid: portStatus.process.pid
    });
  };
  
  return (
    <div className="app-container">
      <h1>Custom Header Proxy</h1>
      
      <div className="form-group">
        <label>Target Website URL:</label>
        <input
          type="text"
          placeholder="https://example.com"
          value={targetUrl}
          onChange={(e) => {
            setTargetUrl(e.target.value);
            checkForChanges(e.target.value, headers, port);
          }}
        />
      </div>      <div className="form-group">
        <label>Port:</label>
        <div className="port-input-container">
          <input
            type="text"
            placeholder="3000"
            value={port}
            onChange={(e) => {
              const newPort = e.target.value;
              setPort(newPort);
              checkForChanges(targetUrl, headers, newPort);
              
              // Debounce port checking to avoid too many requests
              if (newPort && !isNaN(newPort)) {
                const portNum = parseInt(newPort, 10);
                // Using setTimeout for a simple debounce
                clearTimeout(window.portCheckTimeout);
                window.portCheckTimeout = setTimeout(() => {
                  checkPortAvailability(portNum);
                }, 500);
              }
            }}
          />
          {isCheckingPort && (
            <div className="port-checking">Checking...</div>
          )}
          {!isCheckingPort && !portStatus.available && portStatus.process && (
            <div className="port-warning">
              <p>Port {port} is in use by {portStatus.process.name} (PID: {portStatus.process.pid})</p>
              <button 
                onClick={killPortProcess} 
                className="kill-process-btn"
              >
                Kill Process
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="form-group">
        <label>Custom Headers:</label>
        {headers.map((header, index) => (
          <div key={index} className="header-row">
            <input
              type="text"
              placeholder="Header Name"
              value={header.key}
              onChange={(e) => updateHeader(index, 'key', e.target.value)}
            />
            <input
              type="text"
              placeholder="Header Value"
              value={header.value}
              onChange={(e) => updateHeader(index, 'value', e.target.value)}
            />
            <button 
              onClick={() => removeHeader(index)}
              className="remove-btn"
            >
              ✕
            </button>
          </div>
        ))}
        <button 
          onClick={addHeader} 
          className="add-btn"
        >
          + Add Header
        </button>
      </div>      <div className="actions">
        {proxyStatus.status !== 'running' ? (
          <button 
            onClick={startProxy} 
            disabled={!targetUrl || isStarting || proxyStatus.status === 'starting' || proxyStatus.status === 'restarting'}
            className="start-btn"
          >
            {isStarting || proxyStatus.status === 'starting' || proxyStatus.status === 'restarting' ? 
              (proxyStatus.status === 'restarting' ? 'Restarting...' : 'Starting...') : 
              'Start Proxy'}
          </button>
        ) : (
          <div className="action-buttons">
            {inputsChanged && (
              <button onClick={restartProxy} className="restart-btn" disabled={isStarting}>
                Restart Proxy
              </button>
            )}
            <button onClick={stopProxy} className="stop-btn" disabled={isStarting}>
              Stop Proxy
            </button>
          </div>
        )}
      </div>      {(proxyStatus.status === 'error' || 
        proxyStatus.status === 'starting' || 
        proxyStatus.status === 'restarting' ||
        proxyStatus.status === 'stopping') && (
        <div className={
          proxyStatus.status === 'error' 
            ? 'error-message' 
            : proxyStatus.status === 'restarting'
              ? 'status-message restarting'
              : proxyStatus.status === 'stopping'
                ? 'status-message stopping'
                : 'status-message'
        }>
          <p>{proxyStatus.message}</p>
        </div>
      )}{proxyStatus.status === 'running' && (
        <div className="proxy-info">          <h3>Proxy URL</h3>          <div 
            className="proxy-url" 
            title="Click to copy to clipboard"
          >
            <span 
              className="proxy-url-text"
              onClick={() => copyToClipboard(proxyStatus.proxyUrl || `http://${localIp}:${port}`)}
            >
              {proxyStatus.proxyUrl || `http://${localIp}:${port}`}
            </span>
            <span className="copy-hint">{copySuccess ? '✓ Copied!' : 'Click to copy'}</span>
            <button 
              className="copy-button"
              onClick={(e) => {
                e.stopPropagation(); // Prevent the div's onClick from firing
                copyToClipboard(proxyStatus.proxyUrl || `http://${localIp}:${port}`);
              }}
              title="Copy to clipboard"
            >
              <span className="copy-icon">📋</span>
            </button>
          </div>
          <p className="instructions">
            Use this URL on your mobile device
          </p>          <p className="target-info">
            Proxying to: <span>{targetUrl}</span>
          </p>
          {headers.filter(h => h.key && h.value).length > 0 && (
            <div className="header-info">
              <p>With {headers.filter(h => h.key && h.value).length} custom header(s):</p>
              <ul className="header-list">
                {headers.filter(h => h.key && h.value).map((header, idx) => (
                  <li key={idx}><strong>{header.key}</strong>: {header.value}</li>
                ))}
              </ul>
            </div>
          )}<div className="debug-actions">
            <button 
              className="debug-btn"
              onClick={() => {
                const url = `http://${localIp}:${port}/__proxy_health`;
                window.open(url, '_blank');
              }}
            >
              Check Proxy Health
            </button>
            <button 
              className="debug-btn"
              style={{ marginLeft: '10px' }}
              onClick={() => {
                const url = `http://${localIp}:${port}/__test_headers`;
                window.open(url, '_blank');
              }}
            >
              Test Headers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
