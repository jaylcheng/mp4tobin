# FrameForge — MP4 to RGB binary

A static HTML/CSS/JavaScript version of the MP4-to-binary converter. It uses the browser's built-in video decoder and canvas, so no server, Python, or third-party JavaScript library is required.

## Run it

Open `index.html` in a modern browser (Chrome or Edge recommended), select or drop a video, set the output width, height, and frame rate, and choose **Convert to .bin**. The generated binary downloads from the page.

## Output format

The output is raw RGB24 frame data, matching the Python script's intended 3-byte-per-pixel output:

- Frames are resized to the chosen width and height.
- Frames are sampled uniformly at the chosen target frame rate, starting at time 0.
- Pixels are written as R, G, B bytes, row by row, with no separators, header, or compression.
- Expected size: `frame count × width × height × 3` bytes.

The browser's media decoder determines which video codecs can be read. A video encoded with H.264 in an MP4 container is broadly supported. Since browser APIs do not provide a consistent way to inspect the source video's exact frame rate, this page samples at the selected target rate by timestamp rather than applying the Python script's source-frame interval formula. For long or high-resolution videos, output files can be large and use significant browser memory.
