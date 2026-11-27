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
        count("stories", [["deleted_at","is",null]]), count("stories", [["published","eq",true],["deleted_at","is",null]]),
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
      const publishedTarget = document.getElementById("adminPublishedStories");
      const draftTarget = document.getElementById("adminDraftStories");
      publishedTarget.textContent = "Loading published stories…";
      draftTarget.textContent = "Loading unpublished stories…";
      const { data, error } = await c.from("stories").select("id,title,slug,published,featured,created_at,published_at")
        .is("deleted_at", null).order("created_at", { ascending: false });
      if (error) {
        publishedTarget.textContent = error.message;
        draftTarget.textContent = "Stories could not be loaded.";
        return;
      }
      const publishedStories = (data || []).filter((story) => story.published);
      const draftStories = (data || []).filter((story) => !story.published);
      document.getElementById("publishedStoryCount").textContent = publishedStories.length;
      document.getElementById("draftStoryCount").textContent = draftStories.length;
      const renderStoryRows = (target, stories, emptyMessage) => {
        target.innerHTML = "";
        if (!stories.length) { target.textContent = emptyMessage; return; }
        stories.forEach((story) => {
          const row = document.createElement("article"); row.className = "admin-list-row";
          const details = document.createElement("div");
          const title = document.createElement("strong"); title.textContent = story.title;
          const meta = document.createElement("small");
          meta.textContent = (story.published ? "Published" : "Unpublished draft") +
            (story.featured ? " · Selected for Popular Stories" : "");
          details.append(title, meta);
          const actions = document.createElement("div"); actions.className = "admin-actions";
          actions.append(
            makeButton("Edit", () => fillStoryForm(story.id)),
            makeButton(story.featured ? "Remove from Popular" : "Add to Popular", () => togglePopular(story), "button button-outline"),
            makeButton(story.published ? "Unpublish" : "Publish", () => togglePublish(story), "button button-outline"),
            makeButton("Move to Trash", () => deleteStory(story), "button button-danger")
          );
          row.append(details, actions); target.appendChild(row);
        });
      };
      renderStoryRows(publishedTarget, publishedStories, "No published stories yet.");
      renderStoryRows(draftTarget, draftStories, "No unpublished drafts. New drafts will appear here.");
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
      document.getElementById("storyFormHeading").textContent = "Editing: " + data.title;
      document.getElementById("storySubmitButton").textContent = "Save Changes";
      document.getElementById("cancelStoryEdit").hidden = false;
      updateImagePreview();
      setStatus("storyMessage", "You are editing this existing story. Saving will update it, not create another story.", false);
      document.getElementById("storyForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const imageUrlInput = document.getElementById("storyImageUrl");
    const previewWrap = document.getElementById("storyImagePreviewWrap");
    const previewImage = document.getElementById("storyImagePreview");
    const previewMessage = document.getElementById("storyImagePreviewMessage");
    function isBloggerImageUrl(value) {
      try {
        const parsed = new URL(value);
        const host = parsed.hostname.toLowerCase();
        const allowedHost = host === "blogger.googleusercontent.com" ||
          host.endsWith(".blogger.googleusercontent.com") ||
          host === "blogspot.com" || host.endsWith(".blogspot.com") ||
          host === "googleusercontent.com" || host.endsWith(".googleusercontent.com");
        return parsed.protocol === "https:" && allowedHost;
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

    // Offline, whole-text story description suggestions. Nothing is saved until the admin saves the story.
    const generateDescriptionsButton = document.getElementById("generateStoryDescriptions");
    const descriptionOptions = document.getElementById("descriptionOptions");
    const descriptionMessage = document.getElementById("descriptionGeneratorMessage");
    const useDescriptionButton = document.getElementById("useStoryDescription");
    let selectedDescription = "";
    function clearDescriptionSuggestions(message) {
      selectedDescription = "";
      descriptionOptions.replaceChildren();
      useDescriptionButton.hidden = true;
      descriptionMessage.textContent = message || "";
      descriptionMessage.className = "admin-message";
    }
    generateDescriptionsButton.addEventListener("click", () => {
      const storyText = document.getElementById("storyContent").value.trim();
      const storyTitle = document.getElementById("storyTitle").value.trim();
      if (!storyText) {
        clearDescriptionSuggestions("Paste the complete story first, then generate its description options.");
        return;
      }
      if (!window.PCMStoryDescriptionGenerator) {
        clearDescriptionSuggestions("The description generator did not load. Refresh the page and try again.");
        return;
      }
      generateDescriptionsButton.disabled = true;
      generateDescriptionsButton.textContent = "Analysing story…";
      clearDescriptionSuggestions("");
      try {
        const result = window.PCMStoryDescriptionGenerator.generate(storyTitle, storyText);
        if (!result.options || !result.options.length) {
          clearDescriptionSuggestions(result.message || "There is not enough story text to create descriptions.");
          return;
        }
        result.options.forEach((option, index) => {
          const label = document.createElement("label");
          label.className = "description-option";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = "generatedStoryDescription";
          radio.value = String(index);
          radio.checked = index === 0;
          const text = document.createElement("span");
          text.textContent = option;
          radio.addEventListener("change", () => { selectedDescription = option; });
          label.append(radio, text);
          descriptionOptions.appendChild(label);
        });
        selectedDescription = result.options[0];
        descriptionMessage.textContent = result.message || "Choose the description you prefer.";
        useDescriptionButton.hidden = false;
      } catch (error) {
        clearDescriptionSuggestions("The description could not be generated. Please check the story text and try again.");
      } finally {
        generateDescriptionsButton.disabled = false;
        generateDescriptionsButton.textContent = "Generate 3 options";
      }
    });
    useDescriptionButton.addEventListener("click", () => {
      if (!selectedDescription) return;
      const excerptField = document.getElementById("storyExcerpt");
      excerptField.value = selectedDescription;
      excerptField.dispatchEvent(new Event("input", { bubbles: true }));
      excerptField.focus();
      descriptionMessage.textContent = "Selected description added to the Short Description field. You can edit it before saving.";
    });
    document.getElementById("storyContent").addEventListener("input", () => {
      if (descriptionOptions.childElementCount) clearDescriptionSuggestions("Story text changed. Generate new options so the descriptions match the updated story.");
    });
    document.getElementById("storyTitle").addEventListener("input", () => {
      if (descriptionOptions.childElementCount) clearDescriptionSuggestions("Story title changed. Generate new options to include the updated title.");
    });

    function slugify(value) {
      return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    async function togglePopular(story) {
      const next = !story.featured;
      const { error } = await c.from("stories").update({
        featured: next,
        updated_at: new Date().toISOString()
      }).eq("id", story.id).is("deleted_at", null);
      if (error) return alert("Popular Stories setting could not be updated: " + error.message);
      await loadStories();
    }

    async function requestStoryPageBuild() {
      const { data, error } = await c.functions.invoke("trigger-story-page-build", { body: {} });
      if (error) throw error;
      return data;
    }
    async function togglePublish(story) {
      const next = !story.published;
      const nextPublishedAt = story.published_at || (next ? new Date().toISOString() : null);
      const { error } = await c.from("stories").update({ published: next, published_at: nextPublishedAt, updated_at: new Date().toISOString() }).eq("id", story.id);
      if (error) return alert(error.message);
      let buildMessage = next ? "Story published." : "Story unpublished.";
      try {
        await requestStoryPageBuild();
        buildMessage += " Static story pages are being refreshed now.";
      } catch (buildError) {
        buildMessage += " The page refresh could not be started automatically: " + (buildError.message || "Unknown error");
      }
      alert(buildMessage);
      await Promise.all([loadStories(), loadOverview()]);
    }
    async function deleteStory(story) {
      if (!confirm(`Move "${story.title}" to Recently Deleted? You can restore it later.`)) return;
      const { data: { user: adminUser } } = await c.auth.getUser();
      const { error } = await c.from("stories").update({
        deleted_at: new Date().toISOString(),
        deleted_by: adminUser ? adminUser.id : null,
        updated_at: new Date().toISOString()
      }).eq("id", story.id).is("deleted_at", null);
      if (error) return alert(error.message);
      let message = "Story moved to Recently Deleted.";
      if (story.published) {
        try { await requestStoryPageBuild(); message += " Public story pages and the sitemap are refreshing."; }
        catch (buildError) { message += " The automatic page refresh could not be started: " + (buildError.message || "Unknown error"); }
      }
      alert(message);
      await Promise.all([loadStories(), loadOverview()]);
    }

    async function loadTrash() {
      const target = document.getElementById("adminTrash");
      target.textContent = "Loading recently deleted stories…";
      const { data, error } = await c.from("stories")
        .select("id,title,slug,published,deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) { target.textContent = error.message; return; }
      target.innerHTML = "";
      if (!data.length) { target.textContent = "Recently deleted stories will appear here."; return; }
      data.forEach((story) => {
        const row = document.createElement("article"); row.className = "admin-list-row";
        const details = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = story.title;
        const meta = document.createElement("small");
        meta.textContent = (story.published ? "Was published" : "Was a draft") +
          " · Moved to trash " + new Date(story.deleted_at).toLocaleString();
        details.append(title, meta);
        const actions = document.createElement("div"); actions.className = "admin-actions";
        actions.append(
          makeButton("Restore", () => restoreStory(story), "button button-primary"),
          makeButton("Delete Permanently", () => permanentlyDeleteStory(story), "button button-danger")
        );
        row.append(details, actions); target.appendChild(row);
      });
    }

    async function permanentlyDeleteStory(story) {
      const confirmed = confirm(`Permanently delete "${story.title}"? This cannot be undone. The story will be removed from the website database and its current private backup files.`);
      if (!confirmed) return;
      const typed = prompt(`To confirm permanent deletion, type DELETE for "${story.title}".`);
      if (typed !== "DELETE") return alert("Permanent deletion cancelled. The confirmation text did not match.");
      const { error } = await c.from("stories").delete().eq("id", story.id).not("deleted_at", "is", null);
      if (error) return alert("The story could not be permanently deleted: " + error.message);
      let message = "Story permanently deleted from the website. Its private backup files are queued for removal by the backup service (normally within five minutes).";
      try { await requestStoryPageBuild(); message += " Published story pages and the sitemap are being refreshed."; }
      catch (buildError) { message += " The static page refresh could not be started: " + (buildError.message || "Unknown error"); }
      alert(message);
      await Promise.all([loadTrash(), loadStories(), loadOverview()]);
    }

    async function restoreStory(story) {
      const { error } = await c.from("stories").update({
        deleted_at: null, deleted_by: null, updated_at: new Date().toISOString()
      }).eq("id", story.id).not("deleted_at", "is", null);
      if (error) return alert(error.message);
      let message = "Story restored.";
      if (story.published) {
        try { await requestStoryPageBuild(); message += " Public story pages and the sitemap are refreshing."; }
        catch (buildError) { message += " The automatic page refresh could not be started: " + (buildError.message || "Unknown error"); }
      }
      alert(message);
      await Promise.all([loadTrash(), loadStories(), loadOverview()]);
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
      let existingStory = null;
      if (id) {
        const { data, error } = await c.from("stories").select("published_at,published").eq("id", id).single();
        if (error) return setStatus("storyMessage", "The existing publication date could not be checked: " + error.message, true);
        existingStory = data;
      }
      const baseSlug = slugify(title) || "story";
      const firstPublishedAt = existingStory?.published_at || (published ? new Date().toISOString() : null);
      const payload = { title, slug: baseSlug + "-" + (id ? id.slice(0, 6) : crypto.randomUUID().slice(0, 6)), excerpt, content, featured, published, published_at: firstPublishedAt, updated_at: new Date().toISOString() };
      const imageUrl = document.getElementById("storyImageUrl").value.trim();
      if (imageUrl) {
        let parsedImageUrl;
        try { parsedImageUrl = new URL(imageUrl); } catch (_) {
          return setStatus("storyMessage", "Enter a valid direct Blogger image URL.", true);
        }
        if (!isBloggerImageUrl(imageUrl)) {
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
      let saveMessage = id ? "Story updated." : "Story created.";
      if (published || existingStory?.published) {
        try {
          await requestStoryPageBuild();
          saveMessage += " Static story pages are being refreshed now.";
        } catch (buildError) {
          saveMessage += " Automatic page refresh could not be started: " + (buildError.message || "Unknown error");
        }
      }
      setStatus("storyMessage", saveMessage, false);
      event.target.reset();
      document.getElementById("storyId").value = "";
      document.getElementById("storyFormHeading").textContent = "Add a story";
      document.getElementById("storySubmitButton").textContent = "Save Story";
      document.getElementById("cancelStoryEdit").hidden = true;
      updateImagePreview();
      await Promise.all([loadStories(), loadOverview()]);
    });
    document.getElementById("cancelStoryEdit").addEventListener("click", () => document.getElementById("resetStoryForm").click());
    document.getElementById("resetStoryForm").addEventListener("click", () => {
      document.getElementById("storyForm").reset();
      document.getElementById("storyId").value = "";
      document.getElementById("storyFormHeading").textContent = "Add a story";
      document.getElementById("storySubmitButton").textContent = "Save Story";
      document.getElementById("cancelStoryEdit").hidden = true;
      updateImagePreview();
      setStatus("storyMessage", "", false);
    });
    let commentFilter = "pending";
    let commentOffset = 0;
    const commentPageSize = 50;
    async function loadComments(reset = true) {
      const target = document.getElementById("adminComments");
      const loadMoreButton = document.getElementById("loadMoreComments");
      if (reset) {
        commentOffset = 0;
        target.textContent = "Loading comments…";
        loadMoreButton.hidden = true;
      } else {
        loadMoreButton.disabled = true;
        loadMoreButton.textContent = "Loading…";
      }
      const filters = {
        pending: [["status", "eq", "pending"]],
        approved: [["status", "eq", "approved"]],
        rejected: [["status", "eq", "rejected"]],
        all: []
      };
      const [pendingCount, approvedCount, rejectedCount, allCount] = await Promise.all([
        count("comments", filters.pending), count("comments", filters.approved),
        count("comments", filters.rejected), count("comments", [])
      ]);
      const counts = { pending: pendingCount, approved: approvedCount, rejected: rejectedCount, all: allCount };
      document.getElementById("commentPendingCount").textContent = counts.pending;
      document.getElementById("commentApprovedCount").textContent = counts.approved;
      document.getElementById("commentRejectedCount").textContent = counts.rejected;
      document.getElementById("commentAllCount").textContent = counts.all;
      document.querySelectorAll("[data-comment-filter]").forEach((button) => {
        const active = button.dataset.commentFilter === commentFilter;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      let query = c.from("comments").select("id,user_id,story_id,content,status,created_at")
        .order("created_at", { ascending: false }).range(commentOffset, commentOffset + commentPageSize - 1);
      if (commentFilter !== "all") query = query.eq("status", commentFilter);
      const { data, error } = await query;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = "Load more comments";
      if (error) {
        if (reset) target.textContent = error.message;
        else alert("More comments could not be loaded: " + error.message);
        return;
      }
      const visible = data || [];
      if (reset) target.innerHTML = "";
      if (!visible.length && reset) {
        target.textContent = ({
          pending: "No comments are waiting for review.",
          approved: "No approved comments to display yet.",
          rejected: "No rejected comments to display.",
          all: "No comments have been submitted yet."
        })[commentFilter] || "No comments have been submitted yet.";
      }
      if (visible.length) {
        const userIds = [...new Set(visible.map((item) => item.user_id))];
        const storyIds = [...new Set(visible.map((item) => item.story_id))];
        const [{ data: profiles, error: profileError }, { data: stories, error: storyError }] = await Promise.all([
          userIds.length ? c.from("profiles").select("id,display_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
          storyIds.length ? c.from("stories").select("id,title").in("id", storyIds) : Promise.resolve({ data: [], error: null })
        ]);
        if (profileError || storyError) {
          if (reset) target.textContent = "Comment details could not be loaded. Please refresh and try again.";
          else alert("Comment details for the next page could not be loaded.");
          return;
        }
        const names = new Map((profiles || []).map((item) => [item.id, item.display_name]));
        const titles = new Map((stories || []).map((item) => [item.id, item.title]));
        visible.forEach((item) => {
          const row = document.createElement("article"); row.className = "admin-list-row";
          const details = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = (names.get(item.user_id) || "Reader") + " · " + (titles.get(item.story_id) || "Story");
          const body = document.createElement("p"); body.textContent = item.content;
          const meta = document.createElement("small");
          meta.textContent = item.status.charAt(0).toUpperCase() + item.status.slice(1) + " · " + new Date(item.created_at).toLocaleString();
          details.append(title, body, meta);
          const actions = document.createElement("div"); actions.className = "admin-actions";
          if (item.status !== "approved") actions.append(makeButton("Approve", () => moderate(item.id, "approved")));
          if (item.status !== "rejected") actions.append(makeButton("Reject", () => moderate(item.id, "rejected"), "button button-outline"));
          actions.append(makeButton("Delete", async () => {
            if (!confirm("Delete this comment? This cannot be undone.")) return;
            const { error: deleteError } = await c.from("comments").delete().eq("id", item.id);
            if (deleteError) alert(deleteError.message);
            else { await loadComments(); await loadOverview(); }
          }, "button button-danger"));
          row.append(details, actions); target.appendChild(row);
        });
      }
      commentOffset += visible.length;
      loadMoreButton.hidden = visible.length < commentPageSize;
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
    document.getElementById("loadMoreComments").addEventListener("click", () => loadComments(false));
    document.querySelectorAll("[data-comment-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        commentFilter = button.dataset.commentFilter;
        loadComments();
      });
    });
    document.querySelectorAll("[data-admin-view]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-view]").forEach((b) => b.classList.toggle("active", b === button));
      document.querySelectorAll(".admin-view").forEach((section) => { section.hidden = section.id !== "view-" + button.dataset.adminView; });
      if (button.dataset.adminView === "stories") loadStories();
      if (button.dataset.adminView === "trash") loadTrash();
      if (button.dataset.adminView === "comments") loadComments();
      if (button.dataset.adminView === "users") loadUsers();
    }));
    document.getElementById("adminSignOut").addEventListener("click", async () => { await c.auth.signOut(); location.href = "index.html"; });
    await Promise.all([loadOverview(), loadStories()]);
  });
})();