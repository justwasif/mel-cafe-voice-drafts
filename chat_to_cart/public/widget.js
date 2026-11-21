(function () {
  const button = document.createElement('button');
  button.textContent = 'Chat with us';
  button.style.position = 'fixed';
  button.style.bottom = '20px';
  button.style.right = '20px';
  button.style.zIndex = '9999';
  button.style.padding = '12px 16px';
  button.style.borderRadius = '9999px';
  button.style.background = '#4f46e5';
  button.style.color = '#fff';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';

  const iframe = document.createElement('iframe');
  iframe.src = window.STORE_CONCIERGE_URL || '/';
  iframe.style.position = 'fixed';
  iframe.style.bottom = '80px';
  iframe.style.right = '20px';
  iframe.style.width = '360px';
  iframe.style.height = '500px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
  iframe.style.display = 'none';
  iframe.style.zIndex = '9998';

  let open = false;
  button.addEventListener('click', () => {
    open = !open;
    iframe.style.display = open ? 'block' : 'none';
  });

  document.body.appendChild(button);
  document.body.appendChild(iframe);
})();
