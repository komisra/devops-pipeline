const http = require('http');
const httpProxy = require('http-proxy');
const axios = require('axios');

// is this supposed to be local host here? or the deployment server ip
const BLUE = 'http://localhost:5001';
const GREEN = 'http://localhost:5002';
let TARGET = BLUE;

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  proxy.web(req, res, { target: TARGET }, (error) => {
    console.error(`Proxy error: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  });
});

server.listen(80);

async function healthCheck() {
  try {
    await axios.get(GREEN);
    TARGET = GREEN;
    console.log('Targeting GREEN server');
  } catch (err) {
    console.log('GREEN is down');
    try {
      await axios.get(BLUE);
      TARGET = BLUE;
      console.log('Targeting BLUE server');
    } catch (err) {
      console.log('BLUE is also down');
    }
  }
}


(async () => {
  setInterval(healthCheck, 1000);
})();