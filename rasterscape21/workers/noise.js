// eslint-disable-next-line no-restricted-globals
const ctxNoise = self;

ctxNoise.onmessage = (ev) => {
    const { width, height, params } = ev.data;

    const { f: T, end, start } = params;

    const N = Math.min(width / (T / 100), width);

    try {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');


        context.strokeStyle = "black";

        context.font = "28px";
        context.textBaseline = "hanging";
        context.fillStyle = 'lightgrey';
        context.fillRect(0, 0, width, height);
        context.fillStyle = 'black';

        const min = height / 2 - height * start;
        const max = height / 2 + height * start;
        const range = (max - min);
        for (let p = 0; p <= N; p++) {

            const x = (p / N) * width;

            const y = min + Math.random() * range;

            context.lineTo(x, y);
            context.lineTo(x + width / N, y);

        }
        context.stroke();

        ctxNoise.postMessage({
            imageData: context.getImageData(0, 0, width, height)
        });
    } catch (e) {
        ctxNoise.postMessage({
            error: 'use chrome'
        });
    }
};
