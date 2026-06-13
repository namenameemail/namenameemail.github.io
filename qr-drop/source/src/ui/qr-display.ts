import QRCode from 'qrcode';

export async function renderQrCode(
  container: HTMLElement,
  data: string,
  label?: string,
): Promise<void> {
  container.innerHTML = '';

  if (label) {
    const caption = document.createElement('p');
    caption.className = 'qr-label';
    caption.textContent = label;
    container.appendChild(caption);
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'qr-canvas';
  container.appendChild(canvas);

  await QRCode.toCanvas(canvas, data, {
    width: Math.min(320, window.innerWidth - 48),
    margin: 2,
    errorCorrectionLevel: 'L',
  });
}

export async function renderQrCodeFromText(
  container: HTMLElement,
  text: string,
  label?: string,
): Promise<void> {
  await renderQrCode(container, text, label);
}
