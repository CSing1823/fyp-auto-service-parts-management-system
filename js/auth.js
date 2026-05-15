const SESSION_KEY = "currentLoggedInUser";
localStorage.removeItem(SESSION_KEY);

function getCurrentUser() {
  const user = sessionStorage.getItem(SESSION_KEY);
  return user ? JSON.parse(user) : null;
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "login.html";
  }
}

function logoutUser() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}
