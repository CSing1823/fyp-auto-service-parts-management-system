const SESSION_KEY = "currentLoggedInUser";
const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname) ? "http://127.0.0.1:3000" : "";
const FIXED_PASSWORD_RESET_EMAIL = "chaihuahautoparts@gmail.com";
localStorage.removeItem(SESSION_KEY);

async function redirectIfAlreadyLoggedIn() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/session`, { credentials: "include" });
    if (response.ok) window.location.replace("home.html");
  } catch (err) {
    console.error("Unable to check existing staff session.", err);
  }
}

redirectIfAlreadyLoggedIn();

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const togglePasswordButton = document.getElementById("togglePassword");
const loginError = document.getElementById("loginError");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const resetModal = document.getElementById("resetModal");
const closeResetModalButton = document.getElementById("closeResetModal");
const requestOtpForm = document.getElementById("requestOtpForm");
const verifyOtpForm = document.getElementById("verifyOtpForm");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetEmailInput = document.getElementById("resetEmail");
const otpCodeInput = document.getElementById("otpCode");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const toggleNewPasswordButton = document.getElementById("toggleNewPassword");
const toggleConfirmNewPasswordButton = document.getElementById("toggleConfirmNewPassword");
const requestOtpMessage = document.getElementById("requestOtpMessage");
const verifyOtpMessage = document.getElementById("verifyOtpMessage");
const resetPasswordMessage = document.getElementById("resetPasswordMessage");
const otpTimer = document.getElementById("otpTimer");
const requestAnotherOtpButton = document.getElementById("requestAnotherOtp");
const resetSteps = document.querySelectorAll("[data-reset-step]");

let resetEmail = "";
let otpIntervalId = null;
let otpExpiresAt = 0;

function setupPasswordToggle(input, button, visibleLabel, hiddenLabel) {
  button.addEventListener("click", function () {
    const isPasswordVisible = input.type === "text";

    input.type = isPasswordVisible ? "password" : "text";
    button.classList.toggle("password-visible", !isPasswordVisible);
    button.setAttribute("aria-pressed", String(!isPasswordVisible));
    button.setAttribute(
      "aria-label",
      isPasswordVisible ? visibleLabel : hiddenLabel
    );
  });
}

setupPasswordToggle(
  passwordInput,
  togglePasswordButton,
  "Show password",
  "Hide password"
);
setupPasswordToggle(
  newPasswordInput,
  toggleNewPasswordButton,
  "Show new password",
  "Hide new password"
);
setupPasswordToggle(
  confirmNewPasswordInput,
  toggleConfirmNewPasswordButton,
  "Show confirm password",
  "Hide confirm password"
);

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const submitButton = loginForm.querySelector("button[type='submit']");

  submitButton.disabled = true;
  submitButton.textContent = "Signing In...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Invalid email or password.");
    }

    loginError.classList.add("d-none");
    window.location.href = "home.html";
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove("text-success");
    loginError.classList.add("text-danger");
    loginError.classList.remove("d-none");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Sign In";
  }
});

function showResetStep(stepName) {
  resetSteps.forEach((step) => {
    step.classList.toggle("d-none", step.dataset.resetStep !== stepName);
  });
}

function showResetMessage(element, message, type = "error") {
  element.textContent = message;
  element.classList.remove("d-none", "error", "success");
  element.classList.add(type);
}

function hideResetMessage(element) {
  element.textContent = "";
  element.classList.add("d-none");
  element.classList.remove("error", "success");
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong. Please try again.");
  }

  return data;
}

function stopOtpTimer() {
  if (otpIntervalId) {
    clearInterval(otpIntervalId);
    otpIntervalId = null;
  }
}

function updateOtpTimer() {
  const remainingSeconds = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
  otpTimer.textContent = `${remainingSeconds}s`;
  requestAnotherOtpButton.disabled = remainingSeconds > 0;

  if (remainingSeconds === 0) {
    stopOtpTimer();
    showResetMessage(verifyOtpMessage, "OTP expired. Request another OTP.", "error");
  }
}

function startOtpTimer(seconds) {
  stopOtpTimer();
  otpExpiresAt = Date.now() + seconds * 1000;
  requestAnotherOtpButton.disabled = true;
  updateOtpTimer();
  otpIntervalId = setInterval(updateOtpTimer, 1000);
}

function openResetModal() {
  resetModal.classList.remove("d-none");
  showResetStep("email");
  resetEmail = FIXED_PASSWORD_RESET_EMAIL;
  resetEmailInput.value = FIXED_PASSWORD_RESET_EMAIL;
  hideResetMessage(requestOtpMessage);
  hideResetMessage(verifyOtpMessage);
  hideResetMessage(resetPasswordMessage);
  setTimeout(() => requestOtpForm.querySelector("button[type='submit']").focus(), 0);
}

function closeResetModal() {
  resetModal.classList.add("d-none");
  stopOtpTimer();
  requestOtpForm.reset();
  verifyOtpForm.reset();
  resetPasswordForm.reset();
}

async function requestOtp(email) {
  const data = await postJson("/api/auth/forgot-password", { email });
  resetEmail = email;
  hideResetMessage(requestOtpMessage);
  hideResetMessage(verifyOtpMessage);
  otpCodeInput.value = "";
  showResetStep("otp");
  startOtpTimer(data.expiresInSeconds || 180);
  setTimeout(() => otpCodeInput.focus(), 0);
}

forgotPasswordLink.addEventListener("click", openResetModal);
closeResetModalButton.addEventListener("click", closeResetModal);

resetModal.addEventListener("click", function (e) {
  if (e.target === resetModal) {
    closeResetModal();
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !resetModal.classList.contains("d-none")) {
    closeResetModal();
  }
});

requestOtpForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = FIXED_PASSWORD_RESET_EMAIL;
  const submitButton = requestOtpForm.querySelector("button[type='submit']");

  setButtonLoading(submitButton, true, "Sending...");

  try {
    await requestOtp(email);
  } catch (err) {
    showResetMessage(requestOtpMessage, err.message, "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
});

verifyOtpForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const otp = otpCodeInput.value.trim();
  const submitButton = verifyOtpForm.querySelector("button[type='submit']");

  setButtonLoading(submitButton, true, "Verifying...");

  try {
    const data = await postJson("/api/auth/verify-reset-otp", {
      email: resetEmail,
      otp
    });

    stopOtpTimer();
    hideResetMessage(verifyOtpMessage);
    showResetStep("password");
    setTimeout(() => newPasswordInput.focus(), 0);
  } catch (err) {
    showResetMessage(verifyOtpMessage, err.message, "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
});

requestAnotherOtpButton.addEventListener("click", async function () {
  setButtonLoading(requestAnotherOtpButton, true, "Sending...");

  try {
    await requestOtp(resetEmail);
  } catch (err) {
    showResetMessage(verifyOtpMessage, err.message, "error");
  } finally {
    setButtonLoading(requestAnotherOtpButton, false);
    updateOtpTimer();
  }
});

resetPasswordForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  const newPassword = newPasswordInput.value;
  const confirmNewPassword = confirmNewPasswordInput.value;
  const submitButton = resetPasswordForm.querySelector("button[type='submit']");

  if (newPassword !== confirmNewPassword) {
    showResetMessage(resetPasswordMessage, "Passwords do not match.", "error");
    return;
  }

  setButtonLoading(submitButton, true, "Resetting...");

  try {
    const data = await postJson("/api/auth/reset-password", {
      email: resetEmail,
      newPassword
    });

    showResetMessage(loginError, data.message, "success");
    loginError.classList.remove("text-danger");
    loginError.classList.add("text-success");
    closeResetModal();
  } catch (err) {
    showResetMessage(resetPasswordMessage, err.message, "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
});

otpCodeInput.addEventListener("input", function () {
  otpCodeInput.value = otpCodeInput.value.replace(/\D/g, "").slice(0, 6);
});
