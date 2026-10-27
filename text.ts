export function text() {
  async function getText() {
    const response = await fetch('https://api.example.com/text');
    const data = await response.json();
    return data.text;
  }

  getText().then(value => {
    console.log(value);
  }).catch(error => {
    console.error('Error fetching text:', error);
  });

  const textElement = document.createElement('p');
  textElement.textContent = 'Loading...';
  document.body.appendChild(textElement);

  getText().then(value => {
    textElement.textContent = value;
  }).catch(() => {
    textElement.textContent = 'Failed to load text.';
  });
}
