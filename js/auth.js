/* Petros Curious Mind — account and navigation integration. */
(function () {
  const ready = (callback) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  };

  const getClient = () => window.PCM && window.PCM.supabase;

  function setMessage(element, message, isError) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("is-error", Boolean(isError));
    element.classList.toggle("is-success", !isError);
  }

  async function updateNavigation() {
    const client = getClient();
    if (!client) return;
    const nav = document.querySelector(".navigation");
    if (!nav) return;

    const signInLink = nav.querySelector('a[href="signin.html"]');
    let signUpLink = nav.querySelector('a[href="signup.html"]');
    const oldProfile = nav.querySelector('[data-pcm-profile-link]');
    const oldAdmin = nav.querySelector('[data-pcm-admin-link]');
    const oldSignOut = nav.querySelector('[data-pcm-signout]');
    [oldProfile, oldAdmin, oldSignOut].forEach((node) => node && node.remove());

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      if (signInLink) {
        signInLink.textContent = "Sign In";
        signInLink.href = "signin.html";
        signInLink.hidden = false;
      }
      if (!signUpLink) {
        signUpLink = document.createElement("a");
        signUpLink.href = "signup.html";
        signUpLink.textContent = "Sign Up";
        signUpLink.dataset.pcmSignupLink = "true";
        nav.appendChild(signUpLink);
      }
      signUpLink.hidden = false;
      return;
    }

    if (signInLink) signInLink.hidden = true;
    if (signUpLink) signUpLink.hidden = true;

    const profile = document.createElement("a");
    profile.href = "profile.html";
    profile.textContent = "My Profile";
    profile.dataset.pcmProfileLink = "true";
    nav.appendChild(profile);

    const { data: roles, error } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (!error && (roles || []).some((item) => item.role === "admin")) {
      const admin = document.createElement("a");
      admin.href = "admin.html";
      admin.textContent = "Admin Dashboard";
      admin.dataset.pcmAdminLink = "true";
      nav.appendChild(admin);
    }

    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "nav-signin";
    signOut.textContent = "Sign Out";
    signOut.dataset.pcmSignout = "true";
    signOut.addEventListener("click", async () => {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) {
        alert(signOutError.message);
        return;
      }
      window.location.href = "index.html";
    });
    nav.appendChild(signOut);
  }

  ready(async () => {
    const client = getClient();
    if (!client) return;

    await updateNavigation();
    client.auth.onAuthStateChange(() => {
      window.setTimeout(updateNavigation, 0);
    });

    const signUpForm = document.getElementById("signupForm");
    if (signUpForm) {
      signUpForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = document.getElementById("signupMessage");
        const fullName = document.getElementById("fullName").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const confirm = document.getElementById("confirmPassword").value;

        if (password.length < 8) return setMessage(message, "Use a password with at least 8 characters.", true);
        if (password !== confirm) return setMessage(message, "Your passwords do not match.", true);

        const submit = signUpForm.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = "Creating account…";
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          }
        });
        submit.disabled = false;
        submit.textContent = "Create Account →";

        if (error) return setMessage(message, error.message, true);
        if (data.session) {
          // A welcome-email issue must never prevent a successful signup.
          let welcomeSent = false;
          let welcomeProblem = "The email service did not confirm that it sent your message.";
          try {
            const { data: welcomeData, error: welcomeError } = await client.functions.invoke("send-welcome-email", {
              body: { fullName }
            });
            if (welcomeError) {
              console.error("Welcome email could not be sent:", welcomeError);
              welcomeProblem = welcomeError.message || welcomeProblem;
            } else if (welcomeData?.success === true && welcomeData?.id) {
              welcomeSent = true;
            } else {
              console.error("Welcome email returned an unexpected response:", welcomeData);
              welcomeProblem = welcomeData?.error || welcomeProblem;
            }
          } catch (welcomeError) {
            console.error("Welcome email request failed:", welcomeError);
            welcomeProblem = welcomeError?.message || welcomeProblem;
          }
          setMessage(
            message,
            welcomeSent
              ? "Your account is ready. Your welcome email was accepted by our email service."
              : "Your account is ready, but we could not send the welcome email. Please contact support if it does not arrive.",
            !welcomeSent
          );
          window.setTimeout(() => { window.location.href = "profile.html"; }, 2200);
        } else {
          setMessage(message, "Your account was created, but email confirmation is still enabled in the authentication settings. Please contact the site administrator.", true);
          signUpForm.reset();
        }
      });
    }

    const signInForm = document.getElementById("signinForm");
    if (signInForm) {
      signInForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = document.getElementById("signinMessage");
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const submit = signInForm.querySelector('[type="submit"]');
        submit.disabled = true;
        submit.textContent = "Signing in…";
        const { error } = await client.auth.signInWithPassword({ email, password });
        submit.disabled = false;
        submit.textContent = "Sign In →";
        if (error) return setMessage(message, error.message, true);
        setMessage(message, "Signed in successfully. Opening your account…", false);
        const requestedNext = new URLSearchParams(window.location.search).get("next");
        const safeNext = requestedNext && /^[a-z0-9-]+\\.html$/i.test(requestedNext) ? requestedNext : "index.html";
        window.location.href = safeNext;
      });
    }

    const showPassword = document.getElementById("showPassword");
    if (showPassword) {
      showPassword.addEventListener("change", () => {
        const field = document.getElementById("password");
        if (field) field.type = showPassword.checked ? "text" : "password";
      });
    }

    const showPasswords = document.getElementById("showPasswords");
    if (showPasswords) {
      showPasswords.addEventListener("change", () => {
        ["password", "confirmPassword"].forEach((id) => {
          const field = document.getElementById(id);
          if (field) field.type = showPasswords.checked ? "text" : "password";
        });
      });
    }

    const profileForm = document.getElementById("profile-form");
    if (profileForm) {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        window.location.replace("signin.html?next=profile.html");
        return;
      }
      const { data: profile, error } = await client
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (error) {
        setMessage(document.getElementById("profile-message"), error.message, true);
      } else {
        document.getElementById("profile-name").textContent = profile.display_name;
        document.getElementById("profile-email").textContent = user.email || "";
        document.getElementById("full-name").value = profile.display_name || "";
        document.getElementById("email").value = user.email || "";
      }
      profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const displayName = document.getElementById("full-name").value.trim();
        if (!displayName || displayName.length > 80) {
          return setMessage(document.getElementById("profile-message"), "Enter a name between 1 and 80 characters.", true);
        }
        const { error: saveError } = await client.from("profiles")
          .update({ display_name: displayName, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        if (saveError) return setMessage(document.getElementById("profile-message"), saveError.message, true);
        document.getElementById("profile-name").textContent = displayName;
        setMessage(document.getElementById("profile-message"), "Your profile has been updated.", false);
      });
      const signOutButton = document.getElementById("signout-button");
      if (signOutButton) {
        signOutButton.addEventListener("click", async () => {
          const { error: signOutError } = await client.auth.signOut();
          if (signOutError) return alert(signOutError.message);
          window.location.href = "index.html";
        });
      }

      const deleteForm = document.getElementById("delete-account-form");
      if (deleteForm) {
        deleteForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const message = document.getElementById("delete-account-message");
          const button = document.getElementById("delete-account-button");
          const passwordField = document.getElementById("delete-password");
          const password = passwordField.value;

          if (!password) return setMessage(message, "Enter your current password to continue.", true);
          if (!window.confirm("Permanently delete your account? Your profile, comments and likes will be removed. Stories you created will remain published but will no longer be linked to your account. This cannot be undone.")) return;

          button.disabled = true;
          button.textContent = "Deleting account…";
          setMessage(message, "Verifying your password and securely deleting your account…", false);

          try {
            const { data, error: deleteError } = await client.functions.invoke("delete-account", {
              body: { password }
            });
            passwordField.value = "";

            if (deleteError || !data?.success) {
              let detail = data?.error || deleteError?.message || "Account deletion could not be completed.";
              try {
                const response = deleteError?.context;
                if (response && typeof response.json === "function") {
                  const payload = await response.json();
                  if (payload?.error) detail = payload.error;
                }
              } catch (_) {}
              button.disabled = false;
              button.textContent = "Permanently Delete My Account";
              return setMessage(message, detail, true);
            }

            setMessage(message, "Your account has been permanently deleted. Redirecting…", false);
            await client.auth.signOut({ scope: "local" }).catch(() => {});
            window.location.replace("index.html");
          } catch (deleteError) {
            passwordField.value = "";
            button.disabled = false;
            button.textContent = "Permanently Delete My Account";
            setMessage(message, deleteError?.message || "Account deletion failed. Your account has not been confirmed as deleted.", true);
          }
        });
      }
    }

    const passwordForm = document.getElementById("password-form");
    if (passwordForm) {
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        window.location.replace("signin.html?next=change-password.html");
        return;
      }
      passwordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = document.getElementById("password-message");
        const currentPassword = document.getElementById("current-password").value;
        const newPassword = document.getElementById("new-password").value;
        const confirmPassword = document.getElementById("confirm-password").value;
        if (newPassword.length < 8) return setMessage(message, "Your new password must be at least 8 characters.", true);
        if (newPassword !== confirmPassword) return setMessage(message, "Your new passwords do not match.", true);
        if (newPassword === currentPassword) return setMessage(message, "Choose a password different from your current password.", true);

        const button = passwordForm.querySelector('[type="submit"]');
        button.disabled = true;
        const { error: verifyError } = await client.auth.signInWithPassword({
          email: user.email,
          password: currentPassword
        });
        if (verifyError) {
          button.disabled = false;
          return setMessage(message, "Your current password is incorrect.", true);
        }
        const { error: updateError } = await client.auth.updateUser({ password: newPassword });
        button.disabled = false;
        if (updateError) return setMessage(message, updateError.message, true);
        passwordForm.reset();
        setMessage(message, "Your password has been changed successfully.", false);
      });
      const show = document.getElementById("show-password");
      if (show) {
        show.addEventListener("change", () => {
          ["current-password", "new-password", "confirm-password"].forEach((id) => {
            document.getElementById(id).type = show.checked ? "text" : "password";
          });
        });
      }
    }
  });
})();