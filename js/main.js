document.addEventListener("DOMContentLoaded", () => {

  const menuToggle = document.getElementById("menuToggle");
  const navigation = document.getElementById("navigation");

  // Mobile navigation menu
  if (menuToggle && navigation) {

    menuToggle.addEventListener("click", () => {

      const isOpen = navigation.classList.toggle("is-open");

      menuToggle.setAttribute("aria-expanded", String(isOpen));

      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation" : "Open navigation"
      );

      menuToggle.textContent = isOpen ? "×" : "☰";

    });

    // Close menu after selecting a link
    navigation.querySelectorAll("a").forEach((link) => {

      link.addEventListener("click", () => {

        navigation.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";

      });

    });

    // Close menu when tapping outside
    document.addEventListener("click", (event) => {

      if (
        !navigation.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {

        navigation.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";

      }

    });

    // Close menu with Escape key
    document.addEventListener("keydown", (event) => {

      if (event.key === "Escape") {

        navigation.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.textContent = "☰";

      }

    });

  }

  // Automatically update copyright year
  document.querySelectorAll("#currentYear, #current-year, #adminYear").forEach((element) => {
    element.textContent = new Date().getFullYear();
  });

  // Header shadow when scrolling
  const header = document.querySelector(".site-header");

  function updateHeaderShadow() {

    if (header) {
      header.classList.toggle("header-scrolled", window.scrollY > 10);
    }

  }

  updateHeaderShadow();

  window.addEventListener("scroll", updateHeaderShadow, {
    passive: true
  });

});

/* =========================================
   VISITOR PERSONALISATION AND BACK-TO-TOP
========================================= */
(function () {
  const STORAGE_KEY = "pcm-visitor-preferences";
  const palettes = {
    olive: "#68734b",
    forest: "#526b45",
    terracotta: "#a65e42",
    wine: "#7b4657",
    charcoal: "#4a4a43"
  };

  function readPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        mode: saved.mode === "dark" ? "dark" : "light",
        theme: palettes[saved.theme] ? saved.theme : "olive"
      };
    } catch (error) {
      return { mode: "light", theme: "olive" };
    }
  }

  function applyPreferences(preferences) {
    document.documentElement.dataset.pcmMode = preferences.mode;
    document.documentElement.dataset.pcmTheme = preferences.theme;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch (error) {}
    document.querySelectorAll("[data-pcm-mode-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.pcmModeChoice === preferences.mode));
    });
    document.querySelectorAll("[data-pcm-theme-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.pcmThemeChoice === preferences.theme));
    });
  }

  function addPersonalisationControls() {
    const header = document.querySelector(".site-header");
    if (!header || document.getElementById("personaliseTrigger")) return;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "personaliseTrigger";
    trigger.className = "personalise-trigger";
    trigger.textContent = "⚙ Personalise";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "personalisePanel");

    const panel = document.createElement("section");
    panel.id = "personalisePanel";
    panel.className = "personalise-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Appearance and colour settings");
    panel.innerHTML = `
      <h2>Personalise your experience</h2>
      <h3>APPEARANCE</h3>
      <div class="personalise-mode-row">
        <button type="button" class="personalise-choice" data-pcm-mode-choice="light" aria-pressed="true">☀ Light</button>
        <button type="button" class="personalise-choice" data-pcm-mode-choice="dark" aria-pressed="false">☾ Dark</button>
      </div>
      <h3>COLOUR THEME</h3>
      <div class="personalise-colours">
        <button type="button" class="personalise-colour" data-pcm-theme-choice="olive" aria-pressed="true"><span class="personalise-swatch" style="background:#68734b"></span>Olive</button>
        <button type="button" class="personalise-colour" data-pcm-theme-choice="forest" aria-pressed="false"><span class="personalise-swatch" style="background:#526b45"></span>Forest</button>
        <button type="button" class="personalise-colour" data-pcm-theme-choice="terracotta" aria-pressed="false"><span class="personalise-swatch" style="background:#a65e42"></span>Clay</button>
        <button type="button" class="personalise-colour" data-pcm-theme-choice="wine" aria-pressed="false"><span class="personalise-swatch" style="background:#7b4657"></span>Wine</button>
        <button type="button" class="personalise-colour" data-pcm-theme-choice="charcoal" aria-pressed="false"><span class="personalise-swatch" style="background:#4a4a43"></span>Charcoal</button>
      </div>
      <button type="button" class="personalise-reset" id="personaliseReset">Reset to original settings</button>
    `;

    header.appendChild(trigger);
    document.body.appendChild(panel);

    let preferences = readPreferences();
    applyPreferences(preferences);

    trigger.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute("aria-expanded", String(!panel.hidden));
    });

    panel.querySelectorAll("[data-pcm-mode-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        preferences.mode = button.dataset.pcmModeChoice;
        applyPreferences(preferences);
      });
    });
    panel.querySelectorAll("[data-pcm-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        preferences.theme = button.dataset.pcmThemeChoice;
        applyPreferences(preferences);
      });
    });
    document.getElementById("personaliseReset").addEventListener("click", () => {
      preferences = { mode: "light", theme: "olive" };
      applyPreferences(preferences);
    });

    document.addEventListener("click", (event) => {
      if (!panel.contains(event.target) && !trigger.contains(event.target)) {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    });
  }

  function addBackToTop() {
    if (document.getElementById("backToTop")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "backToTop";
    button.className = "back-to-top";
    button.textContent = "↑";
    button.setAttribute("aria-label", "Back to top");
    button.title = "Back to top";
    document.body.appendChild(button);

    const updateVisibility = () => button.classList.toggle("is-visible", window.scrollY > 300);
    window.addEventListener("scroll", updateVisibility, { passive: true });
    updateVisibility();
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    addPersonalisationControls();
    addBackToTop();
  });
})();
