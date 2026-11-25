const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

const plainText = (value, maxLength = 300) =>
  String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);

function metadataMarkup(page) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const image = escapeHtml(page.image);
  const imageAlt = escapeHtml(page.imageAlt || page.title);
  const canonical = escapeHtml(page.url);
  const type = page.type === "article" ? "article" : "website";
  const width = String(page.imageWidth || 1200);
  const height = String(page.imageHeight || 630);

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${canonical}">`,
    '<meta property="og:site_name" content="Petros Curious Mind">',
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="${width}">`,
    `<meta property="og:image:height" content="${height}">`,
    `<meta property="og:image:alt" content="${imageAlt}">`,
    `<meta property="og:url" content="${canonical}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`
  ].join("\n");
}

function replaceHeadMetadata(response, page) {
  const rewriter = new HTMLRewriter()
    .on('meta[property^="og:"]', { element(element) { element.remove(); } })
    .on('meta[name^="twitter:"]', { element(element) { element.remove(); } })
    .on('meta[name="description"]', { element(element) { element.remove(); } })
    .on('meta[name="robots"]', { element(element) { element.remove(); } })
    .on('link[rel="canonical"]', { element(element) { element.remove(); } })
    .on("title", { element(element) { element.remove(); } })
    .on("head", {
      element(element) {
        element.append(metadataMarkup(page), { html: true });
      }
    });

  return rewriter.transform(response);
}

function notFoundResponse() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Story not found | Petros Curious Mind</title></head><body><main><h1>Story not found</h1><p>This story may have been unpublished or is no longer available.</p><a href="/">Return to Petros Curious Mind</a></main></body></html>',
    { status: 404, headers: HTML_HEADERS }
  );
}

function unavailableResponse() {
  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Story temporarily unavailable | Petros Curious Mind</title></head><body><main><h1>Story temporarily unavailable</h1><p>Please try again shortly.</p><a href="/">Return to Petros Curious Mind</a></main></body></html>',
    { status: 503, headers: { ...HTML_HEADERS, "retry-after": "60" } }
  );
}

function canonicalStoryUrl(siteOrigin, slug) {
  return siteOrigin.replace(/\/$/, "") + "/story.html?slug=" + encodeURIComponent(slug);
}

async function getPublishedStory(env, slug) {
  if (!env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured");
  }

  const endpoint = new URL("/rest/v1/stories", env.SUPABASE_URL);
  endpoint.searchParams.set("select", "title,slug,excerpt,image_path");
  endpoint.searchParams.set("slug", "eq." + slug);
  endpoint.searchParams.set("published", "eq.true");
  endpoint.searchParams.set("deleted_at", "is.null");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      accept: "application/json"
    },
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error("Supabase story lookup failed with HTTP " + response.status);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const story = rows[0];
  if (story.slug !== slug || !story.title) return null;
  return story;
}

function isSafeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function fetchOrigin(request, env) {
  const incoming = new URL(request.url);
  const origin = new URL(env.RENDER_ORIGIN);
  origin.pathname = incoming.pathname;
  origin.search = incoming.search;
  origin.hash = "";

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("x-forwarded-host");

  return fetch(new Request(origin.toString(), {
    method: request.method,
    headers,
    redirect: "follow"
  }));
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const pathname = incoming.pathname;

    // This Worker is a transparent origin proxy for all ordinary site assets and pages.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return fetchOrigin(request, env);
    }

    const isHome = pathname === "/" || pathname === "/index.html";
    const isStory = pathname === "/story.html";

    if (!isHome && !isStory) {
      return fetchOrigin(request, env);
    }

    let originResponse;
    try {
      originResponse = await fetchOrigin(request, env);
    } catch {
      return new Response("The website origin is temporarily unavailable.", {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
      });
    }

    if (!originResponse.ok || !originResponse.headers.get("content-type")?.includes("text/html")) {
      return originResponse;
    }

    const siteOrigin = (env.SITE_ORIGIN || "https://petroscuriousmind.name.ng").replace(/\/$/, "");
    const fallbackImage = env.HOME_IMAGE || siteOrigin + "/images/logo.png";

    if (isHome) {
      const page = {
        type: "website",
        title: env.SITE_NAME + " | " + env.SITE_TAGLINE,
        description: env.SITE_DESCRIPTION,
        image: fallbackImage,
        imageAlt: env.SITE_NAME + " official logo",
        imageWidth: 1024,
        imageHeight: 1024,
        url: siteOrigin + "/"
      };
      const response = replaceHeadMetadata(originResponse, page);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, max-age=0");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    const slug = incoming.searchParams.get("slug")?.trim();
    if (!slug || slug.length > 200) return notFoundResponse();

    let story;
    try {
      story = await getPublishedStory(env, slug);
    } catch {
      // Fail closed: never guess or expose a draft when the public database lookup fails.
      return unavailableResponse();
    }

    if (!story) return notFoundResponse();

    const image = isSafeImageUrl(story.image_path) ? story.image_path : fallbackImage;
    const page = {
      type: "article",
      title: plainText(story.title, 180) + " | " + env.SITE_NAME,
      description: plainText(story.excerpt || "Discover the story behind this tale.", 300),
      image,
      imageAlt: plainText(story.title, 180) + " cover image",
      imageWidth: 1200,
      imageHeight: 630,
      url: canonicalStoryUrl(siteOrigin, story.slug)
    };

    const response = replaceHeadMetadata(originResponse, page);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
