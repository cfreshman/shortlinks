const form = document.getElementById('shortlinkForm');
const result = document.getElementById('result');
const shortUrl = document.getElementById('shortUrl');
const copyBtn = document.getElementById('copyBtn');
const error = document.getElementById('error');
const linksList = document.getElementById('linksList');
const searchInput = document.getElementById('searchInput');

let allLinks = [];
let authToken = localStorage.getItem('shortlinks_auth') || null;

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

async function checkAuth() {
  try {
    const headers = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const res = await fetch('/api/auth', { headers });
    const data = await res.json();
    
    if (data.needsSetup) {
      // First-time setup
      const password = prompt('create admin password (min 4 characters):');
      if (!password || password.length < 4) {
        alert('password must be at least 4 characters');
        await checkAuth();
        return;
      }
      
      const setupRes = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      if (setupRes.ok) {
        authToken = password;
        localStorage.setItem('shortlinks_auth', password);
      } else {
        alert('setup failed');
        await checkAuth();
      }
      return;
    }
    
    if (data.requiresAuth && !data.authenticated) {
      // Wrong password or no password stored
      localStorage.removeItem('shortlinks_auth');
      authToken = null;
      
      const password = prompt('enter admin password:');
      if (password) {
        authToken = password;
        localStorage.setItem('shortlinks_auth', password);
        await checkAuth(); // Verify it works
      } else {
        document.body.innerHTML = `
          <div style="font-family: 'Google Sans Code', monospace; padding: 2rem; text-align: center; max-width: 400px; margin: 0 auto;">
            <div style="font-size: 0.875rem; margin-bottom: 1rem;">incorrect or missing password</div>
            <div style="font-size: 0.75rem; color: #999;">
              <a href="https://github.com/cfreshman/shortlinks" style="color: #000; text-decoration: underline;">github.com/cfreshman/shortlinks</a>
            </div>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.remove('show');
  
  const url = document.getElementById('url').value;
  const custom = document.getElementById('custom').value;
  
  try {
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ url, custom: custom || undefined })
    });
    
    const data = await res.json();
    
    if (res.status === 401) {
      localStorage.removeItem('shortlinks_auth');
      location.reload();
      return;
    }
    
    if (!res.ok) {
      error.textContent = data.error || 'Something went wrong';
      error.classList.add('show');
      return;
    }
    
    const fullUrl = window.location.origin + '/' + data.code;
    shortUrl.textContent = fullUrl;
    result.classList.add('show');
    
    loadLinks();
  } catch (err) {
    error.textContent = 'Network error. Is the server running?';
    error.classList.add('show');
  }
});

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shortUrl.textContent);
  copyBtn.textContent = 'Copied!';
  copyBtn.classList.add('copied');
  setTimeout(() => {
    copyBtn.textContent = 'Copy to Clipboard';
    copyBtn.classList.remove('copied');
  }, 2000);
});

async function deleteLink(code) {
  if (!confirm(`Delete /${code}?`)) return;
  
  try {
    const res = await fetch(`/api/links/${code}`, { 
      method: 'DELETE',
      headers: getHeaders()
    });
    
    if (res.status === 401) {
      localStorage.removeItem('shortlinks_auth');
      location.reload();
      return;
    }
    
    if (res.ok) {
      loadLinks();
    }
  } catch (err) {
    alert('Failed to delete link');
  }
}

async function editLink(code, currentUrl) {
  const newUrl = prompt('Edit destination URL:', currentUrl);
  if (!newUrl || newUrl === currentUrl) return;
  
  try {
    const res = await fetch(`/api/links/${code}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ url: newUrl })
    });
    
    if (res.status === 401) {
      localStorage.removeItem('shortlinks_auth');
      location.reload();
      return;
    }
    
    if (res.ok) {
      loadLinks();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to update link');
    }
  } catch (err) {
    alert('Failed to update link');
  }
}

function renderLinks(links, isFiltered = false) {
  if (links && links.length > 0) {
    linksList.innerHTML = links.map(link => `
      <div class="link-item">
        <div class="link-header">
          <div class="link-short">/${link.code}</div>
          <div class="link-actions">
            <button class="link-btn" onclick="editLink('${link.code}', '${escapeHtml(link.url)}')">edit</button>
            <button class="link-btn delete" onclick="deleteLink('${link.code}')">delete</button>
          </div>
        </div>
        <div class="link-long">${escapeHtml(link.url)}</div>
        <div class="link-stats">
          <span>👁 ${link.clicks} clicks</span>
          <span>📅 ${new Date(link.created).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');
  } else {
    const message = isFiltered ? 'no matching links' : 'no links yet. create your first one above';
    linksList.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

function filterLinks() {
  const query = searchInput.value.toLowerCase().trim();
  
  if (!query) {
    renderLinks(allLinks, false);
    return;
  }
  
  const filtered = allLinks.filter(link => 
    link.code.toLowerCase().includes(query) || 
    link.url.toLowerCase().includes(query)
  );
  
  renderLinks(filtered, true);
}

async function loadLinks() {
  try {
    const res = await fetch('/api/links', {
      headers: getHeaders()
    });
    
    if (res.status === 401) {
      localStorage.removeItem('shortlinks_auth');
      location.reload();
      return;
    }
    
    const data = await res.json();
    allLinks = data.links || [];
    filterLinks();
  } catch (err) {
    console.error('Failed to load links:', err);
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

searchInput.addEventListener('input', filterLinks);

checkAuth().then(() => loadLinks());

