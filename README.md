# shortlinks

self-hosted url shortener for [yxorp](https://yxorp.app) users

## install

```bash
git clone <this-repo> shortlinks
cd shortlinks
node server.js  # runs on port 8765
```

configure in [yxorp](https://yxorp.app): `links.yourdomain.com → localhost:8765`

## what you get

- `/abc123` redirects to your long urls
- web ui to create/edit/delete/search links
- click tracking
- custom short codes
- no database, just json

## optional: keep it running

```bash
# option 1: pm2
npm install -g pm2
pm2 start server.js --name shortlinks
pm2 save

# option 2: systemd, screen, tmux, whatever
```

## security

on first visit, you'll be prompted to create a password. it's hashed (sha256) and stored in `data/password.txt`.

redirects always work without auth. only creating/editing/deleting requires the password.

**reset password:** delete `data/password.txt` and restart the server.

## configuration

```bash
PORT=3456 node server.js                # custom port (default: 8765)
DATA_DIR=~/shortlinks node server.js    # custom data location (default: ./data)
```

## api (optional)

```bash
# create link
curl -X POST http://localhost:8765/api/shorten \
  -d '{"url": "https://example.com", "custom": "my-link"}'

# edit link
curl -X PUT http://localhost:8765/api/links/abc123 \
  -d '{"url": "https://new-url.com"}'

# delete link
curl -X DELETE http://localhost:8765/api/links/abc123

# list all
curl http://localhost:8765/api/links
```

---

4 files. zero dependencies. works forever.

