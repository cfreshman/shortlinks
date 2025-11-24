#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8765;
const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = path.join(DATA_DIR, 'shortlinks.json');
const PASSWORD_FILE = path.join(DATA_DIR, 'password.txt');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let passwordHash = null;

// Load password hash from file
if (fs.existsSync(PASSWORD_FILE)) {
  try {
    passwordHash = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
  } catch (e) {
    console.error('Error loading password file:', e.message);
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password) {
  if (!passwordHash) return false;
  return hashPassword(password) === passwordHash;
}

// Initialize data store
let links = {};
try {
  if (fs.existsSync(DATA_FILE)) {
    links = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) {
  console.error('Error loading data:', e.message);
  links = {};
}

function saveLinks() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
}

function generateShortCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (links[code]);
  return code;
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function serveFile(filePath, contentType, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
}

function checkAuth(req) {
  if (!passwordHash) return true; // No password set, allow all
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  return verifyPassword(token);
}

function requireAuth(req, res) {
  if (!checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Serve static files
  if (url.pathname === '/' && req.method === 'GET') {
    serveFile('index.html', 'text/html', res);
    return;
  }
  
  if (url.pathname === '/styles.css' && req.method === 'GET') {
    serveFile('styles.css', 'text/css', res);
    return;
  }
  
  if (url.pathname === '/client.js' && req.method === 'GET') {
    serveFile('client.js', 'application/javascript', res);
    return;
  }
  
  // API: Check auth status
  if (url.pathname === '/api/auth' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      needsSetup: !passwordHash,
      requiresAuth: !!passwordHash,
      authenticated: checkAuth(req)
    }));
    return;
  }
  
  // API: Setup password (only if none exists)
  if (url.pathname === '/api/setup' && req.method === 'POST') {
    if (passwordHash) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password already set' }));
      return;
    }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body);
        
        if (!password || password.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password must be at least 4 characters' }));
          return;
        }
        
        passwordHash = hashPassword(password);
        fs.writeFileSync(PASSWORD_FILE, passwordHash);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  
  // API: Create short link
  if (url.pathname === '/api/shorten' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { url, custom } = JSON.parse(body);
        
        if (!url || !isValidUrl(url)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL' }));
          return;
        }
        
        let code;
        if (custom) {
          if (!/^[a-zA-Z0-9_-]+$/.test(custom)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Custom code can only contain letters, numbers, dashes, and underscores' }));
            return;
          }
          if (links[custom]) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Custom code already exists' }));
            return;
          }
          code = custom;
        } else {
          code = generateShortCode();
        }
        
        links[code] = {
          url,
          code,
          clicks: 0,
          created: new Date().toISOString()
        };
        
        saveLinks();
        
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code, url }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  
  // API: Get all links
  if (url.pathname === '/api/links' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    
    const linkArray = Object.values(links).sort((a, b) => 
      new Date(b.created) - new Date(a.created)
    ).slice(0, 50);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ links: linkArray }));
    return;
  }
  
  // API: Delete link
  if (url.pathname.startsWith('/api/links/') && req.method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    
    const code = url.pathname.split('/')[3];
    if (links[code]) {
      delete links[code];
      saveLinks();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Link not found' }));
    }
    return;
  }
  
  // API: Update link
  if (url.pathname.startsWith('/api/links/') && req.method === 'PUT') {
    if (!requireAuth(req, res)) return;
    
    const code = url.pathname.split('/')[3];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { url: newUrl } = JSON.parse(body);
        
        if (!links[code]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Link not found' }));
          return;
        }
        
        if (!newUrl || !isValidUrl(newUrl)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL' }));
          return;
        }
        
        links[code].url = newUrl;
        saveLinks();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, link: links[code] }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
    });
    return;
  }
  
  // Redirect short link
  const code = url.pathname.slice(1);
  if (code && links[code]) {
    links[code].clicks++;
    saveLinks();
    
    res.writeHead(302, { 'Location': links[code].url });
    res.end();
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🔗 shortlinks running on http://localhost:${PORT}`);
  console.log(`📁 Data stored in ${path.resolve(DATA_DIR)}`);
  if (passwordHash) {
    console.log(`🔒 Admin password required`);
  } else {
    console.log(`⚠️  No password set - first visitor will set password`);
  }
});

