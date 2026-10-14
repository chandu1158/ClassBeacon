document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginInput = document.getElementById('loginInput');
  const passInput = document.getElementById('passInput');
  const togglePassBtn = document.getElementById('togglePassBtn');
  const loginError = document.getElementById('loginError');

  // Toggle password visibility
  togglePassBtn.addEventListener('click', () => {
    if (passInput.type === 'password') {
      passInput.type = 'text';
      togglePassBtn.innerText = '🙈 Hide';
    } else {
      passInput.type = 'password';
      togglePassBtn.innerText = '👁️ Show';
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          userIdOrEmail: loginInput.value.trim(),
          password: passInput.value
        })
      });

      setToken(data.token);

      // Redirect by role
      if (data.user.role === 'admin') {
        window.location.href = '/admin';
      } else if (data.user.role === 'staff') {
        window.location.href = '/staff';
      } else {
        window.location.href = '/student';
      }
    } catch (err) {
      loginError.innerText = `⚠️ ${err.message}`;
      loginError.style.display = 'block';
    }
  });
});

function fillDemo(login, pass) {
  document.getElementById('loginInput').value = login;
  document.getElementById('passInput').value = pass;
  document.getElementById('loginError').style.display = 'none';
}
