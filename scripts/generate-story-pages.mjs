import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync("js/supabase-client.js", "utf8");
const supabaseUrl = source.match(/url:\s*"([^"]+)"/)?.[1];
const publishableKey = source.match(/publishableKey:\s*"([^"]+)"/)?.[1];
if (!supabaseUrl || !publishableKey) throw new Error("Could not read the public Supabase client configuration.");

const response = await fetch(
  supabaseUrl.replace(/\/$/, "") + "/rest/v1/stories?select=id,title,slug,excerpt,content,image_path,published_at&published=eq.true&deleted_at=is.null&order=published_at.desc&limit=1000",
  { headers: { apikey: publishableKey, Authorization: "Bearer " + publishableKey, Accept: "application/json" } }
);
const responseBody = await response.text();
if (!response.ok) throw new Error("Supabase returned HTTP " + response.status + ": " + responseBody);
const stories = JSON.parse(responseBody);
if (!Array.isArray(stories)) throw new Error("Supabase returned an unexpected stories response.");

const base = "https://www.petroscuriousmind.name.ng";
const logoUrl = base + "/images/logo.png";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const plainText = (value) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const imageUrl = (value) => {
  if (!value) return logoUrl;
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value)) return "";
  const encodedPath = String(value).split("/").map(encodeURIComponent).join("/");
  return supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/story-images/" + encodedPath;
};
const setMeta = (html, attribute, name, value) => {
  const escaped = escapeHtml(value);
  const pattern = new RegExp("<meta\\\\s+" + attribute + "=\"" + name + "\"\\\\s+content=\"[^\"]*\"\\\\s*/?>", "i");
  if (!pattern.test(html)) throw new Error("Missing metadata placeholder: " + name);
  return html.replace(pattern, "<meta " + attribute + "=\"" + name + "\" content=\"" + escaped + "\">");
};
const xmlEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const template = fs.readFileSync("story.html", "utf8");
const outputRoot = path.join("stories");
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const sitemapEntries = [
  { loc: base + "/", priority: "1.0" },
  { loc: base + "/stories.html", priority: "0.9" },
  { loc: base + "/about.html", priority: "0.5" },
  { loc: base + "/contact.html", priority: "0.4" },
  { loc: base + "/privacy.html", priority: "0.2" },
  { loc: base + "/terms.html", priority: "0.2" }
];

for (const item of stories) {
  if (!item.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) throw new Error("Invalid published story slug: " + String(item.slug));
  const title = plainText(item.title);
  const description = (plainText(item.excerpt) || plainText(item.content) || "Read this folklore story at Petros Curious Mind.").slice(0, 300);
  const cover = imageUrl(item.image_path);
  const pageUrl = base + "/stories/" + item.slug + "/";
  if (!title || !cover || !/^https:\/\//i.test(cover)) throw new Error("Invalid metadata or cover image for slug: " + item.slug);

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escapeHtml(title) + " | Petros Curious Mind</title>");
  html = html.replace(/<link rel="canonical" href="[^"]*">/i, '<link rel="canonical" href="' + escapeHtml(pageUrl) + '">');
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "property", "og:image", cover);
  html = setMeta(html, "property", "og:url", pageUrl);
  html = setMeta(html, "property", "og:type", "article");
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  html = setMeta(html, "name", "twitter:image", cover);

  const publishedDate = item.published_at ? new Date(item.published_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
  }) : "";
  const article = [
    '<article id="storyDetail" data-story-slug="' + escapeHtml(item.slug) + '" data-story-id="' + escapeHtml(item.id) + '" style="margin-top:25px">',
    cover !== logoUrl ? '<img class="story-detail-image" src="' + escapeHtml(cover) + '" alt="' + escapeHtml(title) + '">' : "",
    "<p class=\"eyebrow\">Folklore</p>",
    "<h1>" + escapeHtml(title) + "</h1>",
    item.excerpt ? '<p class="story-detail-excerpt">' + escapeHtml(item.excerpt) + "</p>" : "",
    '<div class="story-detail-meta">Published ' + escapeHtml(publishedDate) + "</div>",
    '<div class="story-detail-content">' + escapeHtml(item.content).replace(/\r?\n/g, "<br>") + "</div>",
    "</article>"
  ].filter(Boolean).join("\n");
  const placeholder = /<article id="storyDetail" style="margin-top:25px">[\s\S]*?<\/article>/i;
  if (!placeholder.test(html)) throw new Error("Could not locate the story content placeholder in story.html.");
  html = html.replace(placeholder, article);

  const directory = path.join(outputRoot, item.slug);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), html, "utf8");
  sitemapEntries.push({
    loc: pageUrl,
    lastmod: item.published_at ? new Date(item.published_at).toISOString().slice(0, 10) : undefined,
    priority: "0.8"
  });
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapEntries.map((entry) => [
    "  <url>",
    "    <loc>" + xmlEscape(entry.loc) + "</loc>",
    entry.lastmod ? "    <lastmod>" + xmlEscape(entry.lastmod) + "</lastmod>" : "",
    "    <priority>" + entry.priority + "</priority>",
    "  </url>"
  ].filter(Boolean).join("\n")),
  "</urlset>",
  ""
].join("\n");
fs.writeFileSync("sitemap.xml", sitemap, "utf8");
console.log("Generated " + stories.length + " static story pages and refreshed the sitemap.");
