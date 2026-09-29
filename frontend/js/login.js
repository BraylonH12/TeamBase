const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';
  loginMessage.removeAttribute('data-state');

  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const formData = new FormData(loginForm);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    });
    const result = await response.json();

    if (response.ok) {
      window.location.assign('/home.html');
      return;
    }

    loginMessage.textContent = result.message;
    loginMessage.dataset.state = 'error';
  } catch {
    loginMessage.textContent = 'Unable to reach the server. Please try again.';
    loginMessage.dataset.state = 'error';
  } finally {
    submitButton.disabled = false;
  }
});
