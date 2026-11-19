/* Public story browsing and reading for Petros Curious Mind. */
(function () {
  const ready = (fn) => document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn();
  const client = () => window.PCM && window.PCM.supabase;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const imageUrl = (path) => {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    const c = client();
    return c ? c.storage.from("story-images").getPublicUrl(path).data.publicUrl : "";
  };
  const card = (story) => {
    const article = document.createElement("article");
    article.className = "story-card";
    const image = imageUrl(story.image_path);
    article.innerHTML = `
      ${image ? `<img class="story-image" src="${escapeHtml(image)}" alt="" loading="lazy">` : '<div class="story-art" aria-hidden="true">✧</div>'}
      <div class="story-card-content">
        <span class="story-category">Folklore</span>
        <h3>${escapeHtml(story.title)}</h3>
        <p>${escapeHtml(story.excerpt || "Discover the story behind this tale.")}</p>
        <a class="read-story" href="story.html?id=${encodeURIComponent(story.id)}">Read Story</a>
      </div>`;
    return article;
  };
  const showEmpty = (target, message) => {
    target.innerHTML = "";
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = message;
    target.appendChild(p);
  };
  async function loadGrid(target, query, emptyMessage) {
    const c = client();
    if (!c || !target) return;
    const { data, error } = await query;
    if (error) return showEmpty(target, "Stories could not be loaded right now. Please refresh and try again.");
    target.innerHTML = "";
    if (!data || !data.length) return showEmpty(target, emptyMessage);
    data.forEach((story) => target.appendChild(card(story)));
  }
  async function loadPublicStories() {
    const c = client();
    if (!c) return;
    const fields = "id,title,slug,excerpt,image_path,featured,views,created_at,published_at";
    const recent = document.getElementById("recentStoriesGrid");
    const popular = document.getElementById("popularStoriesGrid");
    const all = document.getElementById("storiesGrid");
    if (recent) await loadGrid(recent, c.from("stories").select(fields).eq("published", true).order("published_at", { ascending: false }).limit(3), "New stories will appear here as they are added.");
    if (popular) await loadGrid(popular, c.from("stories").select(fields).eq("published", true).order("views", { ascending: false }).order("published_at", { ascending: false }).limit(3), "Popular stories will appear here as readers discover them.");
    if (all) await loadGrid(all, c.from("stories").select(fields).eq("published", true).order("published_at", { ascending: false }), "There are no stories available to read just yet.");
  }

  async function loadStoryPage() {
    const c = client();
    const root = document.getElementById("storyDetail");
    if (!c || !root) return;
    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      root.textContent = "This story link is incomplete.";
      return;
    }
    const { data: story, error } = await c.from("stories")
      .select("id,title,excerpt,content,image_path,views,published_at")
      .eq("id", id).eq("published", true).maybeSingle();
    if (error || !story) {
      root.textContent = "This story could not be found or is no longer available.";
      return;
    }
    const image = imageUrl(story.image_path);
    root.innerHTML = `
      ${image ? `<img class="story-detail-image" src="${escapeHtml(image)}" alt="${escapeHtml(story.title)}">` : ""}
      <p class="eyebrow">Folklore</p>
      <h1>${escapeHtml(story.title)}</h1>
      ${story.excerpt ? `<p class="story-detail-excerpt">${escapeHtml(story.excerpt)}</p>` : ""}
      <div class="story-detail-meta">Published ${story.published_at ? new Date(story.published_at).toLocaleDateString() : ""}</div>
      <div class="story-detail-content">${escapeHtml(story.content).replace(/\n/g, "<br>")}</div>
      <div class="story-reactions"><button type="button" id="likeStory" class="button button-outline">♡ Like <span id="likeCount">0</span></button><span id="likeMessage" role="status"></span></div>`;
    await loadComments(c, story.id);
    const likeButton = document.getElementById("likeStory");
    const likeCount = document.getElementById("likeCount");
    const likeMessage = document.getElementById("likeMessage");
    const { count } = await c.from("likes").select("*", { count: "exact", head: true }).eq("story_id", story.id);
    likeCount.textContent = String(count || 0);
    likeButton.addEventListener("click", async () => {
      const { data: { user } } = await c.auth.getUser();
      if (!user) {
        likeMessage.textContent = "Please sign in to like this story.";
        return;
      }
      const { data: existing } = await c.from("likes").select("id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle();
      if (existing) {
        const { error: removeError } = await c.from("likes").delete().eq("id", existing.id);
        if (removeError) return likeMessage.textContent = removeError.message;
      } else {
        const { error: addError } = await c.from("likes").insert({ story_id: story.id, user_id: user.id });
        if (addError) return likeMessage.textContent = addError.message;
      }
      const { count: nextCount } = await c.from("likes").select("*", { count: "exact", head: true }).eq("story_id", story.id);
      likeCount.textContent = String(nextCount || 0);
      likeMessage.textContent = existing ? "Like removed." : "You liked this story.";
    });
    const form = document.getElementById("commentForm");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { data: { user } } = await c.auth.getUser();
        const msg = document.getElementById("commentMessage");
        if (!user) {
          msg.textContent = "Please sign in before leaving a comment.";
          return;
        }
        const input = document.getElementById("commentContent");
        const value = input.value.trim();
        if (!value) return;
        const { error: addError } = await c.from("comments").insert({ story_id: story.id, user_id: user.id, content: value, status: "pending" });
        if (addError) {
          msg.textContent = addError.message;
          return;
        }
        input.value = "";
        msg.textContent = "Your comment has been submitted and is awaiting moderation.";
      });
    }
  }

  async function loadComments(c, storyId) {
    const target = document.getElementById("storyComments");
    if (!target) return;
    const { data, error } = await c.from("comments").select("id,user_id,content,created_at").eq("story_id", storyId).eq("status", "approved").order("created_at", { ascending: false });
    if (error) {
      target.textContent = "Comments could not be loaded.";
      return;
    }
    if (!data || !data.length) {
      target.textContent = "No comments yet. Be the first to join the conversation.";
      return;
    }
    const ids = [...new Set(data.map((item) => item.user_id))];
    const { data: profiles } = await c.from("profiles").select("id,display_name").in("id", ids);
    const names = new Map((profiles || []).map((p) => [p.id, p.display_name]));
    target.innerHTML = "";
    data.forEach((item) => {
      const entry = document.createElement("article");
      entry.className = "comment-item";
      const author = document.createElement("strong");
      author.textContent = names.get(item.user_id) || "Reader";
      const body = document.createElement("p");
      body.textContent = item.content;
      const date = document.createElement("small");
      date.textContent = new Date(item.created_at).toLocaleDateString();
      entry.append(author, date, body);
      target.appendChild(entry);
    });
  }

  ready(() => {
    loadPublicStories();
    loadStoryPage();
  });
})();