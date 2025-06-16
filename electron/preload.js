const { contextBridge, ipcRenderer, clipboard } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send: (channel, data) => {
      // whitelist channels
      const validChannels = ['start-proxy', 'stop-proxy', 'kill-port-process'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = ['proxy-status', 'port-check-result'];
      if (validChannels.includes(channel)) {
        // Remove old listeners
        ipcRenderer.removeAllListeners(channel);
        // Add new listener
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    invoke: (channel, data) => {
      const validChannels = ['get-local-ip', 'check-port-availability'];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, data);
      }
    },
    removeAllListeners: (channel) => {
      const validChannels = ['proxy-status'];
      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    }  },  clipboard: {
    writeText: (text) => {
      try {
        if (!clipboard) {
          console.error('Clipboard API not available');
          return false;
        }
        clipboard.writeText(text);
        return true;
      } catch (error) {
        console.error('Error writing to clipboard:', error);
        return false;
      }
    },
    readText: () => {
      try {
        if (!clipboard) {
          console.error('Clipboard API not available');
          return '';
        }
        return clipboard.readText();
      } catch (error) {
        console.error('Error reading from clipboard:', error);
        return '';
      }
    }
  }
});
