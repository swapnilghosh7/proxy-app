# Custom Header Proxy App

A cross-platform desktop application (Windows/macOS) that runs a proxy server with custom request headers. This tool is especially useful for testing websites on mobile devices with custom headers that can't be set directly on mobile browsers.

## Features

- Start a proxy server on your local network
- Add custom headers to all requests
- Configure the port for the proxy server
- View the proxy URL to use on mobile devices
- Test websites with custom headers on any device

## Development

### Prerequisites

- Node.js (v14+)
- npm (v6+)

### Setup

1. Clone the repository
2. Install dependencies:
```
npm install
```

### Running in Development Mode

```
npm run dev
```

### Building for Production

For Windows:
```
npm run build:win
```

For macOS:
```
npm run build:mac
```

For both platforms:
```
npm run build
```

## How to Use

1. Enter the target website URL that requires custom headers
2. Add the required custom headers (name-value pairs)
3. Choose a port to run the proxy server on (default: 3000)
4. Click "Start Proxy"
5. Use the displayed proxy URL on your mobile device
6. When finished, click "Stop Proxy"

## Technology Stack

- Electron
- React
- Node.js/Express
- http-proxy-middleware
