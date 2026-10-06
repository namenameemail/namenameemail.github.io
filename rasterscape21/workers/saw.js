// eslint-disable-next-line no-restricted-globals
const ctxSaw = self;

ctxSaw.onmessage = (ev) => {
    const { width, height, params } = ev.data;

    const N = 150;
    const { t, end, start } = params;

    try {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');


        context.strokeStyle = "black";

        context.font = "28px";
        context.textBaseline = "hanging";
        context.fillStyle = 'lightgrey';
        context.fillRect(0, 0, width, height);
        context.fillStyle = 'black';

        const ss = 10000 / t;
        for (let p = 0; p <= N; p++) {

            const x = (p / N) * width;


            const pn = (p % (N / ss)) / N * ss;
            const y = height - (pn * (end - start) + start) * height;

            context.lineTo(x, y);

        }
        context.stroke();

        ctxSaw.postMessage({
            imageData: context.getImageData(0, 0, width, height)
        });
    } catch (e) {
        ctxSaw.postMessage({
            error: 'use chrome'
        });
    }
};
