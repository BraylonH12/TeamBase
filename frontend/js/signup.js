const signupForm = document.querySelector('#signup-form');
const signupMessage = document.querySelector('#signup-message');

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signupMessage.textContent = '';
  signupMessage.removeAttribute('data-state');

  const formData = new FormData(signupForm);
  const password = formData.get('password');
  if (password !== formData.get('confirmPassword')) {
    signupMessage.textContent = 'Passwords do not match.';
    signupMessage.dataset.state = 'error';
    return;
  }

  const submitButton = signupForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        password,
      }),
    });
    const result = await response.json();

    if (response.ok) {
      window.location.assign('/home.html');
      return;
    }

    signupMessage.textContent = result.message;
    signupMessage.dataset.state = 'error';
  } catch {
    signupMessage.textContent = 'Unable to reach the server. Please try again.';
    signupMessage.dataset.state = 'error';
  } finally {
    submitButton.disabled = false;
  }
});
