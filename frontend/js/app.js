document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/health')
    .then((response) => response.json())
    .then((data) => {
      console.log('API status:', data);
    })
    .catch((error) => {
      console.error('Unable to reach API:', error);
    });
});
