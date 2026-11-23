Deno.serve(async (req: Request) => {
  const siteUrl = "https://petroscuriousmind.name.ng";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char] as string));

  const plainText = (value: unknown) => String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  const page = (title: string, description: string, image: string, destination: string, status = 200) => {
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeImage = escapeHtml(image);
    const safeDestination = escapeHtml(destination);
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Petros Curious Mind">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeDestination}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:alt" content="${safeTitle}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<meta http-equiv="refresh" content="0;url=${safeDestination}">
<link rel="canonical" href="${safeDestination}">
</head><body><p>Opening <a href="${safeDestination}">${safeTitle}</a>…</p>
<script>location.replace(${JSON.stringify(destination)});</script></body></html>`;
    return new Response(html, {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=600",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  if (!supabaseUrl || !anonKey) {
    return new Response("Preview service is not configured.", { status: 503 });
  }

  const requestUrl = new URL(req.url);
  const slug = (requestUrl.searchParams.get("slug") || "").trim();
  if (!slug || slug.length > 200) {
    return page("Petros Curious Mind | The Story Behind Every Story",
      "Explore folklore and traditional storytelling at Petros Curious Mind.",
      siteUrl + "/images/logo.png", siteUrl + "/", 400);
  }

  try {
    const queryStory = async (field: "slug" | "id") => {
      const query = new URLSearchParams({
        select: "id,title,slug,excerpt,content,image_path,published_at",
        [field]: "eq." + slug,
        published: "eq.true",
        deleted_at: "is.null",
        limit: "1"
      });
      const response = await fetch(supabaseUrl + "/rest/v1/stories?" + query.toString(), {
        headers: {
          apikey: anonKey,
          Authorization: "Bearer " + anonKey,
          Accept: "application/json"
        }
      });
      if (!response.ok) throw new Error("Story lookup failed: " + response.status);
      const rows = await response.json();
      return Array.isArray(rows) ? rows[0] : null;
    };

    let story = await queryStory("slug");
    if (!story && /^[0-9a-f-]{36}$/i.test(slug)) story = await queryStory("id");
    if (!story) {
      return page("Story not found | Petros Curious Mind",
        "This story may have been removed or is no longer published.",
        siteUrl + "/images/logo.png", siteUrl + "/stories.html", 404);
    }

    const storyKey = story.slug || story.id;
    const destination = siteUrl + "/story.html?slug=" + encodeURIComponent(storyKey);
    const title = String(story.title || "A story from Petros Curious Mind");
    const description = plainText(story.excerpt || story.content ||
      "Discover the story behind this tale at Petros Curious Mind.");
    let image = siteUrl + "/images/logo.png";
    if (typeof story.image_path === "string" && story.image_path.trim()) {
      const stored = story.image_path.trim();
      image = /^https?:\/\//i.test(stored)
        ? stored
        : supabaseUrl + "/storage/v1/object/public/story-images/" +
          stored.split("/").map((part: string) => encodeURIComponent(part)).join("/");
    }

    return page(title + " | Petros Curious Mind", description, image, destination);
  } catch (error) {
    console.error("story-share preview error", error);
    return new Response("Unable to load this story preview.", { status: 502 });
  }
});