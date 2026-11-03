const SESSION_KEY = "currentLoggedInUser";
const API_ORIGIN = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://127.0.0.1:3000"
  : "";

// Keep protected page content hidden until the server confirms the HttpOnly session.
document.documentElement.style.visibility = "hidden";

sessionStorage.removeItem(SESSION_KEY);
localStorage.removeItem(SESSION_KEY);

let authenticatedUser = null;
let authRedirectStarted = false;

async function validateBackendSession() {
  try {
    const response = await fetch(`${API_ORIGIN}/api/auth/session`, { credentials: "include" });
    if (!response.ok) return null;
    const data = await response.json();
    authenticatedUser = data.user || null;
    return authenticatedUser;
  } catch (err) {
    console.error("Unable to validate staff session.", err);
    return null;
  }
}

window.authSessionReady = validateBackendSession().then((user) => {
  if (user) {
    document.documentElement.style.visibility = "";
  } else {
    redirectToLogin();
  }
  return user;
});

async function revalidateActiveSession() {
  const user = await validateBackendSession();
  if (!user) {
    authenticatedUser = null;
    window.authSessionReady = Promise.resolve(null);
    redirectToLogin();
  }
}

window.setInterval(() => {
  if (!document.hidden) revalidateActiveSession();
}, 60_000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) revalidateActiveSession();
});

window.apiFetch = async function (url, options = {}) {
  const user = await window.authSessionReady;
  if (!user) {
    redirectToLogin();
    throw new Error("Your session has expired. Please sign in again.");
  }

  const target = typeof url === "string" && url.startsWith("/api/") ? `${API_ORIGIN}${url}` : url;
  const response = await fetch(target, { ...options, credentials: "include" });
  if (response.status === 401) {
    authenticatedUser = null;
    window.authSessionReady = Promise.resolve(null);
    redirectToLogin();
  }
  return response;
};

function redirectToLogin() {
  if (!authRedirectStarted && !window.location.pathname.endsWith("login.html")) {
    authRedirectStarted = true;
    document.documentElement.style.visibility = "hidden";
    window.location.replace("login.html");
  }
}

function getCurrentUser() {
  return authenticatedUser;
}

async function requireAuth() {
  const user = await window.authSessionReady;
  if (!user) redirectToLogin();
  return user;
}

async function logoutUser() {
  try {
    await fetch(`${API_ORIGIN}/api/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (err) {
    console.error("Unable to contact the server to revoke the session.", err);
  }
  authenticatedUser = null;
  window.location.replace("login.html");
}
