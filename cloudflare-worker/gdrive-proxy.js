/**
 * Cloudflare Worker: Google Drive CORS Proxy
 *
 * Deploy this worker at Cloudflare Dashboard → Workers & Pages → Create Worker
 * Then replace the placeholder URL in frontend/src/player.js with your worker URL.
 *
 * Free tier: 100,000 requests/day — more than enough for a music archive.
 *
 * Usage: https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/?id=GOOGLE_DRIVE_FILE_ID
 */

const ALLOWED_ORIGINS = [
  "https://alptugan.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const isAllowed = ALLOWED_ORIGINS.includes(origin);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, isAllowed),
      });
    }

    // Only allow GET requests
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Extract Google Drive file ID
    const fileId = url.searchParams.get("id");
    if (!fileId || !/^[\w-]+$/.test(fileId)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'id' parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      // Fetch from Google Drive
      const gdriveUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;

      // Forward Range header for seeking support
      const fetchHeaders = { "User-Agent": "Mozilla/5.0" };
      const rangeHeader = request.headers.get("Range");
      if (rangeHeader) {
        fetchHeaders["Range"] = rangeHeader;
      }

      const response = await fetch(gdriveUrl, { headers: fetchHeaders });

      if (!response.ok && response.status !== 206) {
        return new Response(
          JSON.stringify({ error: `Google Drive returned ${response.status}` }),
          {
            status: response.status,
            headers: { "Content-Type": "application/json", ...corsHeaders(origin, isAllowed) },
          }
        );
      }

      // Build response headers — stream the body through
      const responseHeaders = new Headers();

      // Preserve important headers from Google Drive
      const passthroughHeaders = [
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
      ];
      for (const header of passthroughHeaders) {
        const value = response.headers.get(header);
        if (value) responseHeaders.set(header, value);
      }

      // Ensure audio content type if Google Drive doesn't set it
      if (!responseHeaders.has("Content-Type")) {
        responseHeaders.set("Content-Type", "audio/mpeg");
      }

      // Add CORS headers
      if (isAllowed) {
        responseHeaders.set("Access-Control-Allow-Origin", origin);
      }
      responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "Range");
      responseHeaders.set(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Range, Content-Type, Accept-Ranges"
      );

      // Cache audio for 1 hour at the edge to save Google Drive requests
      responseHeaders.set("Cache-Control", "public, max-age=3600");

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch from Google Drive", details: err.message }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders(origin, isAllowed) },
        }
      );
    }
  },
};

/**
 * Build CORS headers object.
 */
function corsHeaders(origin, isAllowed) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
