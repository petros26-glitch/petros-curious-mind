"use strict";

const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const SITE_URL = "https://petroscuriousmind.name.ng";
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://lysfuszocmawivdlijqy.supabase.co").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function cleanText(value, limit = 300) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function storyImage(path) {
  const fallback = SITE_URL + "/images/logo.png";
  if (typeof path !== "string" || !path.trim()) return fallback;
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : fallback;
    } catch {
      return fallback;
    }
  }
  const encoded = value.split("/").map(encodeURIComponent).join("/");
  return SUPABASE_URL + "/storage/v1/object/public/story-images/" + encoded;
}

function page({ title, description, image, shareUrl, destination, status = 200, noindex = false }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeShareUrl = escapeHtml(shareUrl);
  const safeDestination = escapeHtml(destination);
  const robots = noindex ? "noindex,nofollow" : "index,follow";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${destination === SITE_URL + "/" ? "website" : "article"}">
<meta property="og:site_name" content="Petros Curious Mind">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeShareUrl}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:secure_url" content="${safeImage}">
<meta property="og:image:alt" content="${safeTitle}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<link rel="canonical" href="${safeDestination}">
</head>
<body>
<main>
<h1>${safeTitle}</h1>
<p>${safeDescription}</p>
<p><a href="${safeDestination}">Read this on Petros Curious Mind</a></p>
</main>
</body>
</html>`;
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": noindex ? "no-store" : "public, max-age=60, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY"
    },
    body: html
  };
}

async function queryPublishedStory(field, value) {
  const params = new URLSearchParams({
    select: "id,title,slug,excerpt,content,image_path,published_at",
    [field]: "eq." + value,
    published: "eq.true",
    deleted_at: "is.null",
    limit: "1"
  });
  const response = await fetch(SUPABASE_URL + "/rest/v1/stories?" + params.toString(), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new Error("Supabase story lookup failed (" + response.status + "): " + detail);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findPublishedStory(slug) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is not configured");
  }
  const bySlug = await queryPublishedStory("slug", slug);
  if (bySlug) return bySlug;
  if (/^(?:[0-9a-f]{8}-[0-9a-f-]{27}|[0-9]+)$/i.test(slug)) {
    return queryPublishedStory("id", slug);
  }
  return null;
}

function isPreviewCrawler(userAgent = "") {
  return /bot|crawler|spider|facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterest|skypeuripreview|applebot|snapchat/i.test(userAgent);
}

function allowedImageHost(hostname) {
  return hostname === "blogger.googleusercontent.com" ||
    hostname === "lh3.googleusercontent.com" ||
    hostname === new URL(SUPABASE_URL).hostname;
}

async function proxyStoryImage(slug, req, res) {
  const story = await findPublishedStory(slug);
  if (!story || !story.image_path) {
    res.writeHead(404, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    return res.end();
  }

  const source = storyImage(story.image_path);
  let sourceUrl;
  try {
    sourceUrl = new URL(source);
  } catch {
    res.writeHead(404, { "Cache-Control": "no-store" });
    return res.end();
  }
  if (!["https:"].includes(sourceUrl.protocol) || !allowedImageHost(sourceUrl.hostname)) {
    res.writeHead(415, { "Cache-Control": "no-store" });
    return res.end();
  }

  const upstream = await fetch(sourceUrl, {
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5" },
    signal: AbortSignal.timeout(12000)
  });
  if (!upstream.ok) {
    res.writeHead(502, { "Cache-Control": "no-store" });
    return res.end();
  }

  const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
  if (!allowedTypes.has(contentType)) {
    res.writeHead(415, { "Cache-Control": "no-store" });
    return res.end();
  }

  const maxBytes = 12 * 1024 * 1024;
  const declaredLength = Number(upstream.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    res.writeHead(413, { "Cache-Control": "no-store" });
    return res.end();
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) {
    res.writeHead(bytes.length ? 413 : 502, { "Cache-Control": "no-store" });
    return res.end();
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": bytes.length,
    "Cache-Control": "public, max-age=86400, s-maxage=604800",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*"
  });
  return res.end(req.method === "HEAD" ? undefined : bytes);
}

async function handle(req, res) {
  const requestUrl = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Method not allowed");
  }

  if (requestUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(req.method === "HEAD" ? undefined : "ok");
  }

  const imageMatch = requestUrl.pathname.match(/^\\/image\\/([^/]+)\\/?$/);
  if (imageMatch) {
    let imageSlug;
    try {
      imageSlug = decodeURIComponent(imageMatch[1]).trim();
    } catch {
      res.writeHead(400, { "Cache-Control": "no-store" });
      return res.end();
    }
    if (!imageSlug || imageSlug.length > 200) {
      res.writeHead(400, { "Cache-Control": "no-store" });
      return res.end();
    }
    try {
      return await proxyStoryImage(imageSlug, req, res);
    } catch (error) {
      console.error("Story image proxy failed:", error.message);
      if (!res.headersSent) res.writeHead(502, { "Cache-Control": "no-store" });
      return res.end();
    }
  }

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    const result = page({
      title: "Petros Curious Mind | The Story Behind Every Story",
      description: "Explore folklore, traditional storytelling, and stories passed down through generations.",
      image: SITE_URL + "/images/logo.png",
      shareUrl: "https://petros-curious-mind-share.onrender.com/",
      destination: SITE_URL + "/"
    });
    res.writeHead(result.status, result.headers);
    return res.end(req.method === "HEAD" ? undefined : result.body);
  }

  const match = requestUrl.pathname.match(/^\/s\/([^/]+)\/?$/);
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" });
    return res.end(req.method === "HEAD" ? undefined : "Not found");
  }

  let slug;
  try {
    slug = decodeURIComponent(match[1]).trim();
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" });
    return res.end(req.method === "HEAD" ? undefined : "Invalid story link");
  }
  if (!slug || slug.length > 200) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" });
    return res.end(req.method === "HEAD" ? undefined : "Invalid story link");
  }

  try {
    const story = await findPublishedStory(slug);
    if (!story) {
      const result = page({
        title: "Story not found | Petros Curious Mind",
        description: "This story may have been removed or is no longer published.",
        image: SITE_URL + "/images/logo.png",
        shareUrl: "https://petros-curious-mind-share.onrender.com/s/" + encodeURIComponent(slug),
        destination: SITE_URL + "/stories.html",
        status: 404,
        noindex: true
      });
      res.writeHead(result.status, result.headers);
      return res.end(req.method === "HEAD" ? undefined : result.body);
    }

    const storySlug = String(story.slug || story.id);
    const shareUrl = "https://petros-curious-mind-share.onrender.com/s/" + encodeURIComponent(storySlug);
    const destination = SITE_URL + "/story.html?slug=" + encodeURIComponent(storySlug);
    const description = cleanText(story.excerpt || story.content || "Discover this folklore story at Petros Curious Mind.");
    if (!isPreviewCrawler(req.headers["user-agent"] || "")) {
      res.writeHead(302, {
        Location: destination,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      });
      return res.end();
    }

    const result = page({
      title: String(story.title || "A story from Petros Curious Mind") + " | Petros Curious Mind",
      description,
      image: "https://petros-curious-mind-share.onrender.com/image/" + encodeURIComponent(storySlug),
      shareUrl,
      destination
    });
    res.writeHead(result.status, result.headers);
    return res.end(req.method === "HEAD" ? undefined : result.body);
  } catch (error) {
    console.error("Share preview request failed:", error.message);
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex"
    });
    return res.end(req.method === "HEAD" ? undefined : "Story preview is temporarily unavailable.");
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("Unhandled request error:", error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  });
});

server.listen(PORT, HOST, () => {
  console.log("Petros Curious Mind share service listening on " + HOST + ":" + PORT);
});
