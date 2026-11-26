/* Public story browsing and reading for Petros Curious Mind. */
(function () {
  const ready = (fn) => document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn();
  const client = () => window.PCM && window.PCM.supabase;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  const storyShareUrl = (story) => new URL("stories/" + encodeURIComponent(story.slug || story.id) + "/", window.location.origin + "/").href;
  const shareStory = async (title, url) => {
    const shareData = { title: title + " | Petros Curious Mind", text: "Read this story on Petros Curious Mind:", url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try { await navigator.share(shareData); return; }
      catch (error) { if (error && error.name === "AbortError") return; }
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(shareData.text + " " + url), "_blank", "noopener,noreferrer");
  };
  const shareLinks = (title, url) => {
    const text = encodeURIComponent(title + " | Petros Curious Mind " + url);
    return {
      whatsapp: "https://wa.me/?text=" + text,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url)
    };
  };

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
        <div class="story-card-actions"><a class="read-story" href="stories/${encodeURIComponent(story.slug || story.id)}/">Read Story</a><button class="button button-outline story-share-button" type="button" data-share-title="${escapeHtml(story.title)}" data-share-url="${escapeHtml(storyShareUrl(story))}">Share</button></div>
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
  function renderGrid(target, stories, emptyMessage) {
    if (!target) return;
    target.innerHTML = "";
    if (!stories.length) return showEmpty(target, emptyMessage);
    stories.forEach((story) => target.appendChild(card(story)));
  }
  function wireSearch(stories) {
    const input = document.getElementById("storySearchInput");
    const results = document.getElementById("storySearchResults");
    const all = document.getElementById("storiesGrid");
    if (!input || !results) return;
    input.addEventListener("input", () => {
      const term = input.value.trim().toLocaleLowerCase();
      results.innerHTML = "";
      if (!term) { results.hidden = true; if (all) all.hidden = false; return; }
      results.hidden = false; if (all) all.hidden = true;
      const matches = stories.filter((story) =>
        [story.title, story.excerpt, story.content].join(" ").toLocaleLowerCase().includes(term)
      ).slice(0, 40);
      if (!matches.length) return showEmpty(results, "No stories matched your search. Try another word or title.");
      matches.forEach((story) => results.appendChild(card(story)));
    });
  }
  async function loadPublicStories() {
    const c = client();
    if (!c) return;
    const fields = "id,title,slug,excerpt,content,image_path,featured,views,likes_count,created_at,published_at";
    const { data, error } = await c.from("stories").select(fields).eq("published", true).is("deleted_at", null)
      .order("published_at", { ascending: false });
    if (error) {
      ["recentStoriesGrid", "popularStoriesGrid", "storiesGrid", "storySearchResults"].forEach((id) => {
        const target = document.getElementById(id);
        if (target) showEmpty(target, "Stories could not be loaded right now. Please refresh and try again.");
      });
      return;
    }
    const stories = data || [];
    renderGrid(document.getElementById("recentStoriesGrid"), stories.slice(0, 3), "New stories will appear here as they are added.");
    renderGrid(document.getElementById("popularStoriesGrid"), stories.filter((story) => story.featured).slice(0, 3),
      "Popular stories will appear here. The administrator can select them from the dashboard.");
    renderGrid(document.getElementById("storiesGrid"), stories, "There are no stories available to read just yet.");
    wireSearch(stories);
  }

  async function loadStoryPage() {
    const c = client();
    const root = document.getElementById("storyDetail");
    if (!c || !root) return;
    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const slug = params.get("slug") || root.dataset.storySlug;
    if (!id && !slug) {
      root.textContent = "This story link is incomplete.";
      return;
    }
    const { data: story, error } = await c.from("stories")
      .select("id,title,slug,excerpt,content,image_path,views,published_at")
      .eq("published", true).is("deleted_at", null).eq(slug ? "slug" : "id", slug || id).maybeSingle();
    if (error || !story) {
      root.textContent = "This story could not be found or is no longer available.";
      return;
    }
    const image = imageUrl(story.image_path);
    const pageUrl = window.location.href;
    document.title = story.title + " | Petros Curious Mind";
    const description = (story.excerpt || story.content || "Read this folklore story at Petros Curious Mind.")
      .replace(/\s+/g, " ").trim().slice(0, 300);
    const descriptionMeta = document.head.querySelector('meta[name="description"]');
    if (descriptionMeta) descriptionMeta.content = description;
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = pageUrl;
    let structuredData = document.getElementById("storyStructuredData");
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.id = "storyStructuredData";
      structuredData.type = "application/ld+json";
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": story.title,
      "description": description,
      "datePublished": story.published_at || undefined,
      "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
      "publisher": { "@type": "Organization", "name": "Petros Curious Mind", "url": "https://petroscuriousmind.name.ng/" }
    });
    root.innerHTML = `
      ${image ? `<img class="story-detail-image" src="${escapeHtml(image)}" alt="${escapeHtml(story.title)}">` : ""}
      <p class="eyebrow">Folklore</p>
      <h1>${escapeHtml(story.title)}</h1>
      ${story.excerpt ? `<p class="story-detail-excerpt">${escapeHtml(story.excerpt)}</p>` : ""}
      <div class="story-detail-meta">Published ${story.published_at ? new Date(story.published_at).toLocaleDateString() : ""}</div>
      <div class="story-detail-content">${escapeHtml(story.content).replace(/\n/g, "<br>")}</div>
      <section class="story-share" aria-label="Share this story"><h2>Share this story</h2><p>Choose an app to share this story. WhatsApp Business and Facebook Lite may appear in your phone’s share menu if installed.</p><div class="story-share-actions"><button type="button" class="button button-primary" id="nativeShareStory">Share with an app</button><a class="button button-outline" id="whatsappShareStory" target="_blank" rel="noopener noreferrer">WhatsApp</a><a class="button button-outline" id="facebookShareStory" target="_blank" rel="noopener noreferrer">Facebook</a><button type="button" class="button button-outline" id="copyShareStory">Copy link</button></div><p id="shareStoryMessage" role="status" aria-live="polite"></p></section>
      <div class="story-reactions"><button type="button" id="likeStory" class="button button-outline">♡ Like</button><button type="button" id="saveStory" class="button button-outline">☆ Save Story</button><span id="likeMessage" role="status"></span><span id="saveMessage" role="status"></span></div>
`;

    const detailShareUrl = new URL("/stories/" + encodeURIComponent(story.slug || story.id) + "/", window.location.origin).href;
    const detailShareLinks = shareLinks(story.title, detailShareUrl);
    const nativeShareButton = document.getElementById("nativeShareStory");
    const whatsappShareButton = document.getElementById("whatsappShareStory");
    const facebookShareButton = document.getElementById("facebookShareStory");
    const copyShareButton = document.getElementById("copyShareStory");
    const shareStoryMessage = document.getElementById("shareStoryMessage");
    if (nativeShareButton) nativeShareButton.addEventListener("click", () => shareStory(story.title, detailShareUrl));
    if (whatsappShareButton) whatsappShareButton.href = detailShareLinks.whatsapp;
    if (facebookShareButton) facebookShareButton.href = detailShareLinks.facebook;
    if (copyShareButton) copyShareButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(detailShareUrl);
        shareStoryMessage.textContent = "Story link copied.";
      } catch (_) {
        shareStoryMessage.textContent = "Copy is unavailable in this browser. Use Share with an app instead.";
      }
    });

    await loadComments(c, story.id);
    const likeButton = document.getElementById("likeStory");
    const likeMessage = document.getElementById("likeMessage");
    const { data: { user: currentReader } } = await c.auth.getUser();
    let alreadyLiked = false;
    if (currentReader) {
      const { data: ownLike } = await c.from("likes").select("id").eq("story_id", story.id).eq("user_id", currentReader.id).maybeSingle();
      alreadyLiked = Boolean(ownLike);
    }
    likeButton.textContent = alreadyLiked ? "♥ Liked" : "♡ Like";
    likeButton.addEventListener("click", async () => {
      const { data: { user } } = await c.auth.getUser();
      if (!user) {
        likeMessage.innerHTML = 'Please <a href="signin.html">sign in</a> or <a href="signup.html">create a free account</a> to like this story.';
        return;
      }
      const { data: existing } = await c.from("likes").select("id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle();
      if (existing) {
        const { error: removeError } = await c.from("likes").delete().eq("id", existing.id);
        if (removeError) return likeMessage.textContent = removeError.message;
        likeButton.textContent = "♡ Like";
        likeMessage.textContent = "Like removed.";
      } else {
        const { error: addError } = await c.from("likes").insert({ story_id: story.id, user_id: user.id });
        if (addError) return likeMessage.textContent = addError.message;
        likeButton.textContent = "♥ Liked";
        likeMessage.textContent = "You liked this story.";
      }
    });
    const form = document.getElementById("commentForm");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { data: { user } } = await c.auth.getUser();
        const msg = document.getElementById("commentMessage");
        if (!user) {
          msg.innerHTML = 'Please <a href="signin.html">sign in</a> or <a href="signup.html">create a free account</a> before leaving a comment.';
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

    const saveButton = document.getElementById("saveStory");
    const saveMessage = document.getElementById("saveMessage");
    if (saveButton) {
      const { data: { user: saveUser } } = await c.auth.getUser();
      let alreadySaved = false;
      if (saveUser) {
        const { data: saved } = await c.from("saved_stories").select("story_id")
          .eq("user_id", saveUser.id).eq("story_id", story.id).maybeSingle();
        alreadySaved = Boolean(saved);
      }
      saveButton.textContent = alreadySaved ? "★ Saved" : "☆ Save Story";
      saveButton.addEventListener("click", async () => {
        const { data: { user } } = await c.auth.getUser();
        if (!user) {
          saveMessage.innerHTML = 'Please <a href="signin.html">sign in</a> or <a href="signup.html">create a free account</a> to save this story.';
          return;
        }
        const { data: existing } = await c.from("saved_stories").select("story_id")
          .eq("user_id", user.id).eq("story_id", story.id).maybeSingle();
        if (existing) {
          const { error } = await c.from("saved_stories").delete()
            .eq("user_id", user.id).eq("story_id", story.id);
          if (error) return saveMessage.textContent = error.message;
          saveButton.textContent = "☆ Save Story";
          saveMessage.textContent = "Removed from your saved stories.";
        } else {
          const { error } = await c.from("saved_stories").insert({ user_id: user.id, story_id: story.id });
          if (error) return saveMessage.textContent = error.message;
          saveButton.textContent = "★ Saved";
          saveMessage.textContent = "Added to your saved stories.";
        }
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
    document.addEventListener("click", (event) => {
      const button = event.target.closest(".story-share-button");
      if (button) shareStory(button.dataset.shareTitle || "A story", button.dataset.shareUrl);
    });
    loadPublicStories();
    loadStoryPage();
  });
})();
