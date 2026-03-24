# Cloudflare Worker — Google Drive CORS Proxy

This worker proxies audio file requests from Google Drive, adding the proper CORS headers so the browser can fetch them from your GitHub Pages site.

## Deployment (via Cloudflare Dashboard)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **Create** → **Create Worker**
3. Name it something like `gdrive-proxy`
4. Click **Deploy** (deploys the default "Hello World" worker)
5. Click **Edit Code** → replace all content with `gdrive-proxy.js` from this folder
6. Click **Save and Deploy**

Your worker URL will be:
```
https://gdrive-proxy.YOUR-SUBDOMAIN.workers.dev
```

## After Deploying

Update the worker URL in `frontend/src/player.js`:

```javascript
// Replace this placeholder:
const CLOUDFLARE_WORKER_URL = "https://gdrive-proxy.YOUR-SUBDOMAIN.workers.dev";

// With your actual URL, e.g.:
const CLOUDFLARE_WORKER_URL = "https://gdrive-proxy.alptugan.workers.dev";
```

## Testing

```bash
# Test the worker directly
curl -v "https://gdrive-proxy.YOUR-SUBDOMAIN.workers.dev/?id=YOUR_GOOGLE_DRIVE_FILE_ID"
```

## Free Tier Limits

- **100,000 requests/day**
- **10ms CPU time per request** (streaming audio doesn't count against CPU)
- More than enough for a music archive
