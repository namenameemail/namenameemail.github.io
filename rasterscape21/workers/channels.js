// eslint-disable-next-line no-restricted-globals
const ctxChannels = self;

ctxChannels.onmessage = (ev) => {
    const {imageData, params, width, height} = ev.data;

    if (!imageData) {
        return;
    }

    const {zd: from, zed: scale, component} = params || {};

    const channelName = ['r', 'g', 'b', 'a'];

    let newImageData = imageData;

    if (channelName[component]) {

        newImageData = new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        );

        for (let i = 0; i < newImageData.data.length; i += 4) {
            switch (channelName[component]) {
                case 'r':
                    newImageData.data[i] = from * 255 + (newImageData.data[i] * scale);
                    newImageData.data[i + 1] = 0;
                    newImageData.data[i + 2] = 0;
                    newImageData.data[i + 3] = 255;
                    break;
                case 'g':
                    newImageData.data[i] = 0;
                    newImageData.data[i + 1] = from * 255 + (newImageData.data[i + 1] * scale);
                    newImageData.data[i + 2] = 0;
                    newImageData.data[i + 3] = 255;
                    break;
                case 'b':
                    newImageData.data[i] = 0;
                    newImageData.data[i + 1] = 0;
                    newImageData.data[i + 2] = from * 255 + (newImageData.data[i + 2] * scale);
                    newImageData.data[i + 3] = 255;
                    break;
                case 'a':
                    newImageData.data[i] = 0;
                    newImageData.data[i + 1] = 0;
                    newImageData.data[i + 2] = 0;
                    newImageData.data[i + 3] = from * 255 + (newImageData.data[i + 3] * scale);
                    break;
            }
        }
    }

    ctxChannels.postMessage({
        imageData: newImageData
    });
};
