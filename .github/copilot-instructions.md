<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Proxy App with Custom Headers

This is an Electron application with React that serves as a proxy server for adding custom headers to website requests. The app allows users to:

1. Enter a target website URL
2. Add custom headers 
3. Choose a port to run the proxy server on
4. View the proxy URL to use on mobile devices
5. Start and stop the proxy server

Key technologies:
- Electron for cross-platform desktop app
- React for UI
- Node.js/Express for the proxy server functionality
- http-proxy-middleware for request proxying with custom headers
