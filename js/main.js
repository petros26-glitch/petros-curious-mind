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