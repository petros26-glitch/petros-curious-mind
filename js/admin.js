/* Secure, RLS-backed admin dashboard. */
(function () {
  const ready = (fn) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  ready(async () => {
    const c = window.PCM && window.PCM.supabase;
    const gate = document.getElementById("adminGate");
    const workspace = document.getElementById("adminWorkspace");
    if (!c || !gate || !workspace) return;
    const { data: { user } } = await c.auth.getUser();
    if (!user) {
      gate.textContent = "Please sign in with your administrator account to continue.";
      const link = document.createElement("a"); link.href = "signin.html"; link.textContent = "Go to Sign In"; gate.appendChild(link);
      return;
    }
    const { data: roles, error: roleError } = await c.from("user_roles").select("role").eq("user_id", user.id);
    if (roleError || !(roles || []).some((r) => r.role === "admin")) {
      gate.textContent = "Access denied. This account does not have administrator permissions.";
      return;
    }
    gate.hidden = true;
    workspace.hidden = false;
    document.getElementById("adminIdentity").textContent = user.email || "Administrator";

    const setStatus = (id, message, isError) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = message; el.className = isError ? "admin-message is-error" : "admin-message is-success"; }
    };
    const count = async (table, filters) => {
      let q = c.from(table).select("*", { count: "exact", head: true });
      (filters || []).forEach(([field, op, value]) => { q = q[op](field, value); });
      const { count: n } = await q;
      return n || 0;
    };
    async function loadOverview() {
      const [stories, published, pending, users] = await Promise.all([
        count("stories"), count("stories", [["published","eq",true]]),
        count("comments", [["status","eq","pending"]]), count("profiles")
      ]);
      document.getElementById("statStories").textContent = stories;
      document.getElementById("statPublished").textContent = published;
      document.getElementById("statPending").textContent = pending;
      document.getElementById("statUsers").textContent = users;
    }
    function makeButton(label, action, className) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.className = className || "button button-outline"; b.addEventListener("click", action); return b;
    }
    async function loadStories() {
      const target = document.getElementById("adminStories");
      target.textContent = "Loading stories…";
      const { data, error } = await c.from("stories").select("id,title,slug,published,featured,created_at").order("created_at", { ascending: false });
      if (error) { target.textContent = error.message; return; }
      target.innerHTML = "";
      if (!data.length) { target.textContent = "No stories have been created yet."; return; }
      data.forEach((story) => {
        const row = document.createElement("article"); row.className = "admin-list-row";
        const details = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = story.title;
        const meta = document.createElement("small"); meta.textContent = (story.published ? "Published" : "Draft") + (story.featured ? " · Featured" : "");
        details.append(title, meta);
        const actions = document.createElement("div"); actions.className = "admin-actions";
        actions.append(
          makeButton("Edit", () => fillStoryForm(story.id)),
          makeButton(story.published ? "Unpublish" : "Publish", () => togglePublish(story), "button button-outline"),
          makeButton("Delete", () => deleteStory(story), "button button-danger")
        );
        row.append(details, actions); target.appendChild(row);
      });
    }
    async function fillStoryForm(id) {
      const { data, error } = await c.from("stories").select("*").eq("id", id).single();
      if (error) return setStatus("storyMessage", error.message, true);
      document.getElementById("storyId").value = data.id;
      document.getElementById("storyTitle").value = data.title;
      document.getElementById("storyExcerpt").value = data.excerpt || "";
      document.getElementById("storyContent").value = data.content;
      document.getElementById("storyImageUrl").value = /^https?:\/\//i.test(data.image_path || "") ? data.image_path : "";
      document.getElementById("storyFeatured").checked = data.featured;
      document.getElementById("storyPublished").checked = data.published;
      document.getElementById("storyFormHeading").textContent = "Edit story";
      document.getElementById("storyForm").scrollIntoView({ behavior: "smooth" });
    }
    const imageUrlInput = document.getElementById("storyImageUrl");
    const previewWrap = document.getElementById("storyImagePreviewWrap");
    const previewImage = document.getElementById("storyImagePreview");
    const previewMessage = document.getElementById("storyImagePreviewMessage");
    function isBloggerImageUrl(value) {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && /(blogger\\.googleusercontent\\.com|blogspot\\.com|googleusercontent\\.com)$/i.test(parsed.hostname);
      } catch (_) { return false; }
    }
    function updateImagePreview() {
      const value = imageUrlInput.value.trim();
      previewImage.removeAttribute("src");
      previewWrap.hidden = true;
      if (!value) return;
      if (!isBloggerImageUrl(value)) {
        previewMessage.textContent = "Enter a secure direct Blogger image URL to preview it.";
        previewWrap.hidden = false;
        previewImage.hidden = true;
        return;
      }
      previewImage.hidden = false;
      previewMessage.textContent = "Loading image preview…";
      previewWrap.hidden = false;
      previewImage.onload = () => { previewMessage.textContent = "Image preview ready."; };
      previewImage.onerror = () => { previewMessage.textContent = "The image could not be loaded. Check that the URL is a public, direct image link."; };
      previewImage.src = value;
    }
    imageUrlInput.addEventListener("input", updateImagePreview);
    imageUrlInput.addEventListener("change", updateImagePreview);

    function slugify(value) {
      return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    async function togglePublish(story) {
      const next = !story.published;
      const { error } = await c.from("stories").update({ published: next, published_at: next ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", story.id);
      if (error) return alert(error.message);
      await Promise.all([loadStories(), loadOverview()]);
    }
    async function deleteStory(story) {
      if (!confirm(`Delete "${story.title}"? This also deletes its comments and likes.`)) return;
      const { data: record } = await c.from("stories").select("image_path").eq("id", story.id).maybeSingle();
      const { error } = await c.from("stories").delete().eq("id", story.id);
      if (error) return alert(error.message);
      if (record && record.image_path && !/^https?:\/\//i.test(record.image_path)) await c.storage.from("story-images").remove([record.image_path]);
      await Promise.all([loadStories(), loadOverview()]);
    }
    document.getElementById("storyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = document.getElementById("storyId").value;
      const title = document.getElementById("storyTitle").value.trim();
      const excerpt = document.getElementById("storyExcerpt").value.trim();
      const content = document.getElementById("storyContent").value.trim();
      const featured = document.getElementById("storyFeatured").checked;
      const published = document.getElementById("storyPublished").checked;
      if (!title || !content) return setStatus("storyMessage", "Title and story content are required.", true);
      const { data: { user: currentUser } } = await c.auth.getUser();
      const baseSlug = slugify(title) || "story";
      const payload = { title, slug: baseSlug + "-" + (id ? id.slice(0, 6) : crypto.randomUUID().slice(0, 6)), excerpt, content, featured, published, published_at: published ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
      const imageUrl = document.getElementById("storyImageUrl").value.trim();
      if (imageUrl) {
        let parsedImageUrl;
        try { parsedImageUrl = new URL(imageUrl); } catch (_) {
          return setStatus("storyMessage", "Enter a valid direct Blogger image URL.", true);
        }
        if (parsedImageUrl.protocol !== "https:" || !/(blogger\.googleusercontent\.com|blogspot\.com|googleusercontent\.com)$/i.test(parsedImageUrl.hostname)) {
          return setStatus("storyMessage", "Please use a secure direct image URL hosted by Blogger.", true);
        }
        payload.image_path = parsedImageUrl.href;
      } else if (!id) {
        payload.image_path = null;
      }
      let result;
      if (id) result = await c.from("stories").update(payload).eq("id", id);
      else result = await c.from("stories").insert({ ...payload, created_by: currentUser.id });
      if (result.error) return setStatus("storyMessage", result.error.message, true);
      setStatus("storyMessage", id ? "Story updated." : "Story created.", false);
      event.target.reset();
      document.getElementById("storyId").value = "";
      document.getElementById("storyFormHeading").textContent = "Add a story";
      await Promise.all([loadStories(), loadOverview()]);
    });
    document.getElementById("resetStoryForm").addEventListener("click", () => {
      document.getElementById("storyForm").reset();
      document.getElementById("storyId").value = "";
      document.getElementById("storyFormHeading").textContent = "Add a story";
      setStatus("storyMessage", "", false);
    });
    async function loadComments() {
      const target = document.getElementById("adminComments");
      target.textContent = "Loading comments…";
      const { data, error } = await c.from("comments").select("id,user_id,story_id,content,status,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) { target.textContent = error.message; return; }
      target.innerHTML = "";
      if (!data.length) { target.textContent = "No comments to moderate."; return; }
      const userIds = [...new Set(data.map(x => x.user_id))];
      const storyIds = [...new Set(data.map(x => x.story_id))];
      const [{ data: profiles }, { data: stories }] = await Promise.all([
        c.from("profiles").select("id,display_name").in("id", userIds),
        c.from("stories").select("id,title").in("id", storyIds)
      ]);
      const names = new Map((profiles || []).map(x => [x.id, x.display_name]));
      const titles = new Map((stories || []).map(x => [x.id, x.title]));
      data.forEach((item) => {
        const row = document.createElement("article"); row.className = "admin-list-row";
        const details = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = (names.get(item.user_id) || "Reader") + " · " + (titles.get(item.story_id) || "Story");
        const body = document.createElement("p"); body.textContent = item.content;
        const meta = document.createElement("small"); meta.textContent = item.status + " · " + new Date(item.created_at).toLocaleString();
        details.append(title, body, meta);
        const actions = document.createElement("div"); actions.className = "admin-actions";
        if (item.status !== "approved") actions.append(makeButton("Approve", () => moderate(item.id, "approved")));
        if (item.status !== "rejected") actions.append(makeButton("Reject", () => moderate(item.id, "rejected")));
        actions.append(makeButton("Delete", async () => {
          if (!confirm("Delete this comment?")) return;
          const { error: e } = await c.from("comments").delete().eq("id", item.id);
          if (e) alert(e.message); else { loadComments(); loadOverview(); }
        }, "button button-danger"));
        row.append(details, actions); target.appendChild(row);
      });
    }
    async function moderate(id, status) {
      const { error } = await c.from("comments").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return alert(error.message);
      await Promise.all([loadComments(), loadOverview()]);
    }
    async function loadUsers() {
      const target = document.getElementById("adminUsers");
      target.textContent = "Loading profiles…";
      const { data, error } = await c.from("profiles").select("id,display_name,created_at").order("created_at", { ascending: false }).limit(200);
      if (error) { target.textContent = error.message; return; }
      target.innerHTML = "";
      if (!data.length) { target.textContent = "No registered profiles yet."; return; }
      data.forEach((p) => {
        const row = document.createElement("article"); row.className = "admin-list-row";
        const name = document.createElement("strong"); name.textContent = p.display_name;
        const date = document.createElement("small"); date.textContent = "Joined " + new Date(p.created_at).toLocaleDateString();
        row.append(name, date); target.appendChild(row);
      });
    }
    document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-view]").forEach((b) => b.classList.toggle("active", b === button));
      document.querySelectorAll(".admin-view").forEach((section) => { section.hidden = section.id !== "view-" + button.dataset.adminView; });
      if (button.dataset.adminView === "stories") loadStories();
      if (button.dataset.adminView === "comments") loadComments();
      if (button.dataset.adminView === "users") loadUsers();
    }));
    document.getElementById("adminSignOut").addEventListener("click", async () => { await c.auth.signOut(); location.href = "index.html"; });
    await Promise.all([loadOverview(), loadStories()]);
  });
})();