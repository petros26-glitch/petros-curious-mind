/* Member-only reading activity for Petros Curious Mind. */
(async function () {
  const client = window.PCM && window.PCM.supabase;
  if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  async function renderStoryList(targetId, relation, emptyText) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const { data: rows, error } = await client.from(relation)
      .select("story_id, created_at").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { target.textContent = "This list could not be loaded."; return; }
    if (!rows?.length) { target.textContent = emptyText; return; }
    const ids = rows.map((row) => row.story_id);
    const { data: stories, error: storyError } = await client.from("stories")
      .select("id,title").in("id", ids).eq("published", true);
    if (storyError) { target.textContent = "Stories could not be loaded."; return; }
    const byId = new Map((stories || []).map((story) => [story.id, story]));
    target.innerHTML = "";
    rows.forEach((row) => {
      const item = byId.get(row.story_id);
      if (!item) return;
      const link = document.createElement("a");
      link.href = "story.html?id=" + encodeURIComponent(item.id);
      link.textContent = item.title;
      link.className = "member-activity-link";
      const p = document.createElement("p");
      p.appendChild(link);
      target.appendChild(p);
    });
    if (!target.children.length) target.textContent = emptyText;
  }

  await Promise.all([
    renderStoryList("savedStoriesList", "saved_stories", "You haven't saved any stories yet."),
    renderStoryList("likedStoriesList", "likes", "You haven't liked any stories yet.")
  ]);

  const commentsTarget = document.getElementById("memberCommentsList");
  if (commentsTarget) {
    const { data: comments, error } = await client.from("comments")
      .select("id,story_id,content,status,created_at").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(50);
    if (error) commentsTarget.textContent = "Your comments could not be loaded.";
    else if (!comments?.length) commentsTarget.textContent = "You haven't posted any comments yet.";
    else {
      const ids = [...new Set(comments.map((comment) => comment.story_id))];
      const { data: stories } = await client.from("stories").select("id,title").in("id", ids);
      const byId = new Map((stories || []).map((story) => [story.id, story.title]));
      commentsTarget.innerHTML = "";
      comments.forEach((comment) => {
        const article = document.createElement("article");
        article.className = "comment-item";
        const title = document.createElement("a");
        title.href = "story.html?id=" + encodeURIComponent(comment.story_id);
        title.textContent = byId.get(comment.story_id) || "Story";
        const body = document.createElement("p");
        body.textContent = comment.content;
        const status = document.createElement("small");
        status.textContent = comment.status === "approved" ? "Published" : comment.status === "rejected" ? "Not approved" : "Awaiting review";
        article.append(title, body, status);
        commentsTarget.appendChild(article);
      });
    }
  }
})();