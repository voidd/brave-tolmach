const bubble = JSON.parse(new URLSearchParams(location.search).get('bubble'));

showBubble({ ...bubble, onClose: () => window.close() });
