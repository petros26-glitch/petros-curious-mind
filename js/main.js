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
        menuToggle.setAttribute("aria-label", "Open navigation");
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
        menuToggle.setAttribute("aria-label", "Open navigation");
        menuToggle.textContent = "☰";

      }

    });

    // Close menu with Escape key
    document.addEventListener("keydown", (event) => {

      if (event.key === "Escape") {

        navigation.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation");
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

/* Cookie choices: this preference panel does not itself load analytics or advertising scripts. */
(function () {
  const KEY = "pcm-cookie-consent-v1";
  const defaults = { necessary: true, preferences: false, analytics: false, advertising: false };
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!value || typeof value !== "object") return null;
      return { necessary: true, preferences: value.preferences === true, analytics: value.analytics === true, advertising: value.advertising === true, updatedAt: value.updatedAt || null };
    } catch (error) { return null; }
  }
  function save(value) {
    const consent = { necessary: true, preferences: value.preferences === true, analytics: value.analytics === true, advertising: value.advertising === true, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(consent)); } catch (error) {}
    window.dispatchEvent(new CustomEvent("pcm:consent-changed", { detail: consent }));
    return consent;
  }
  window.PCMCookieConsent = {
    has(category) { const value = read(); return category === "necessary" || Boolean(value && value[category] === true); },
    get() { return read() || { ...defaults }; },
    open() { const panel = document.getElementById("pcmCookieSettings"); if (panel) { panel.hidden = false; const banner = document.getElementById("pcmCookieBanner"); if (banner) banner.hidden = true; } }
  };
  function init() {
    if (document.getElementById("pcmCookieBanner")) return;
    const saved = read();
    const banner = document.createElement("section");
    banner.id = "pcmCookieBanner";
    banner.className = "cookie-consent-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Cookie choices");
    banner.hidden = Boolean(saved);
    banner.innerHTML = '<h2>Your privacy choices</h2><p>We use necessary browser storage for core site functions and optional storage to remember preferences. Analytics and advertising are not currently activated by this panel. Read our <a href="/cookies.html">Cookie Policy</a> and <a href="/privacy.html">Privacy Policy</a>.</p><div class="cookie-consent-actions"><button type="button" class="cookie-primary" data-cookie-accept>Accept optional</button><button type="button" class="cookie-secondary" data-cookie-reject>Reject optional</button><button type="button" class="cookie-secondary" data-cookie-customise>Customise</button></div>';
    const panel = document.createElement("section");
    panel.id = "pcmCookieSettings";
    panel.className = "cookie-settings-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "pcmCookieSettingsTitle");
    panel.innerHTML = '<h2 id="pcmCookieSettingsTitle">Cookie settings</h2><p>Necessary storage is always on. Choose whether optional categories may be used. Your choices can be changed later from the Cookie Policy page.</p><div class="cookie-setting-row"><div><strong>Necessary</strong><small>Required for security, sign-in and saving your consent choice.</small></div><input type="checkbox" checked disabled aria-label="Necessary storage always enabled"></div><div class="cookie-setting-row"><div><strong>Preferences</strong><small>Remembers choices such as appearance and colour theme.</small></div><input type="checkbox" id="pcmConsentPreferences"></div><div class="cookie-setting-row"><div><strong>Analytics</strong><small>Reserved for analytics tools if they are added in the future.</small></div><input type="checkbox" id="pcmConsentAnalytics"></div><div class="cookie-setting-row"><div><strong>Advertising</strong><small>Reserved for advertising technologies if they are added in the future.</small></div><input type="checkbox" id="pcmConsentAdvertising"></div><div class="cookie-consent-actions"><button type="button" class="cookie-primary" data-cookie-save>Save choices</button><button type="button" class="cookie-secondary" data-cookie-accept-all>Accept all optional</button><button type="button" class="cookie-secondary" data-cookie-cancel>Cancel</button></div>';
    document.body.append(banner, panel);
    const pref = panel.querySelector("#pcmConsentPreferences");
    const analytics = panel.querySelector("#pcmConsentAnalytics");
    const advertising = panel.querySelector("#pcmConsentAdvertising");
    function fill(value) { pref.checked = value.preferences; analytics.checked = value.analytics; advertising.checked = value.advertising; }
    function showSettings() { fill(read() || defaults); panel.hidden = false; banner.hidden = true; pref.focus(); }
    function hideSettings() { panel.hidden = true; if (!read()) banner.hidden = false; }
    function complete(value) { save(value); banner.hidden = true; panel.hidden = true; }
    banner.querySelector("[data-cookie-accept]").addEventListener("click", () => complete({ preferences: true, analytics: true, advertising: true }));
    banner.querySelector("[data-cookie-reject]").addEventListener("click", () => complete(defaults));
    banner.querySelector("[data-cookie-customise]").addEventListener("click", showSettings);
    panel.querySelector("[data-cookie-save]").addEventListener("click", () => complete({ preferences: pref.checked, analytics: analytics.checked, advertising: advertising.checked }));
    panel.querySelector("[data-cookie-accept-all]").addEventListener("click", () => complete({ preferences: true, analytics: true, advertising: true }));
    panel.querySelector("[data-cookie-cancel]").addEventListener("click", hideSettings);
    document.querySelectorAll("[data-open-cookie-settings]").forEach(button => button.addEventListener("click", showSettings));
    if (!saved) banner.hidden = false;
    else fill(saved);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
