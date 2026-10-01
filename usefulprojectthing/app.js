const fileInput = document.querySelector('#video-file');
const dropzone = document.querySelector('#dropzone');
const fileLabel = document.querySelector('#file-label');
const video = document.querySelector('#video-preview');
const emptyPreview = document.querySelector('#empty-preview');
const previewState = document.querySelector('#preview-state');
const videoMeta = document.querySelector('#video-meta');
const durationChip = document.querySelector('#duration-chip');
const convertButton = document.querySelector('#convert-button');
const cancelButton = document.querySelector('#cancel-button');
const downloadLink = document.querySelector('#download-link');
const statusText = document.querySelector('#status-text');
const progressDetail = document.querySelector('#progress-detail');
const progressPercent = document.querySelector('#progress-percent');
const progressFill = document.querySelector('#progress-fill');
const progressTrack = document.querySelector('#progress-track');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

let currentFile = null;
let objectUrl = null;
let downloadUrl = null;
let cancelRequested = false;
let converting = false;

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) loadVideo(fileInput.files[0]);
});

dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

for (const eventName of ['dragenter', 'dragover']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
}

for (const eventName of ['dragleave', 'drop']) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
  });
}

dropzone.addEventListener('drop', (event) => {
  const file = [...(event.dataTransfer?.files ?? [])].find((candidate) => candidate.type.startsWith('video/') || candidate.name.toLowerCase().endsWith('.mp4'));
  if (file) loadVideo(file);
  else showStatus('Choose a video file to continue.', 'Unsupported file type.');
});

convertButton.addEventListener('click', convertVideo);
cancelButton.addEventListener('click', () => {
  cancelRequested = true;
  cancelButton.disabled = true;
  statusText.textContent = 'Cancelling…';
  progressDetail.textContent = 'Finishing the current frame before stopping.';
});

function loadVideo(file) {
  if (converting) return;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  currentFile = file;
  downloadUrl = null;
  downloadLink.hidden = true;
  convertButton.disabled = true;
  video.pause();
  video.removeAttribute('src');
  video.load();
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  video.hidden = false;
  emptyPreview.hidden = true;
  fileLabel.textContent = file.name;
  previewState.textContent = 'LOADING VIDEO';
  previewState.classList.remove('ready');
  videoMeta.innerHTML = '<span></span><span>Reading video…</span>';
  showStatus('Loading video…', 'Preparing browser video preview.');

  video.onloadedmetadata = () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      loadFailed('This video has no readable duration or dimensions.');
      return;
    }
    previewState.textContent = 'VIDEO READY';
    previewState.classList.add('ready');
    videoMeta.children[0].textContent = file.name;
    videoMeta.children[1].textContent = `${video.videoWidth} × ${video.videoHeight}`;
    durationChip.textContent = formatTime(video.duration);
    durationChip.hidden = false;
    convertButton.disabled = false;
    showStatus('Ready when you are', `${formatTime(video.duration)} video · ${video.videoWidth} × ${video.videoHeight} source pixels.`);
  };
  video.onerror = () => loadFailed('Your browser could not decode this video. Try an MP4 encoded with H.264 video.');
}

function loadFailed(message) {
  currentFile = null;
  convertButton.disabled = true;
  previewState.textContent = 'VIDEO UNAVAILABLE';
  previewState.classList.remove('ready');
  showStatus('Could not load this video.', message);
}

async function convertVideo() {
  if (!currentFile || converting) return;
  const width = Number(document.querySelector('#width').value);
  const height = Number(document.querySelector('#height').value);
  const fps = Number(document.querySelector('#fps').value);
  if (!Number.isInteger(width) || width < 1 || width > 4096 || !Number.isInteger(height) || height < 1 || height > 4096) {
    showStatus('Check the output dimensions.', 'Width and height must be whole numbers from 1 to 4096.');
    return;
  }
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) {
    showStatus('Check the target frame rate.', 'Frame rate must be between 1 and 120 fps.');
    return;
  }

  converting = true;
  cancelRequested = false;
  convertButton.disabled = true;
  cancelButton.hidden = false;
  cancelButton.disabled = false;
  downloadLink.hidden = true;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  video.pause();

  const duration = video.duration;
  const frameCount = Math.ceil(duration * fps);
  const frameBytes = width * height * 3;
  const chunks = [];
  canvas.width = width;
  canvas.height = height;
  setProgress(0);
  statusText.textContent = 'Converting frames…';
  progressDetail.textContent = `${frameCount.toLocaleString()} frames · ${formatBytes(frameCount * frameBytes)} estimated output.`;

  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (cancelRequested) break;
      const timestamp = frameIndex / fps;
      if (Math.abs(video.currentTime - timestamp) > 0.001) await seekTo(timestamp);
      if (cancelRequested) break;

      context.drawImage(video, 0, 0, width, height);
      const rgba = context.getImageData(0, 0, width, height).data;
      const rgb = new Uint8Array(width * height * 3);
      for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
        rgb[target] = rgba[source];
        rgb[target + 1] = rgba[source + 1];
        rgb[target + 2] = rgba[source + 2];
      }
      chunks.push(rgb);

      const completed = frameIndex + 1;
      if (completed % Math.max(1, Math.floor(frameCount / 100)) === 0 || completed === frameCount) {
        const percent = Math.floor((completed / frameCount) * 100);
        setProgress(percent);
        statusText.textContent = 'Converting frames…';
        progressDetail.textContent = `Frame ${completed.toLocaleString()} of ${frameCount.toLocaleString()} · ${formatBytes(completed * frameBytes)} written.`;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    if (cancelRequested) {
      setProgress(0);
      showStatus('Conversion cancelled.', 'Your original video has not been changed.');
      return;
    }

    const blob = new Blob(chunks, { type: 'application/octet-stream' });
    downloadUrl = URL.createObjectURL(blob);
    const baseName = currentFile.name.replace(/\.[^.]+$/, '') || 'video';
    downloadLink.href = downloadUrl;
    downloadLink.download = `${baseName}-${width}x${height}-${fps}fps-rgb24.bin`;
    downloadLink.hidden = false;
    setProgress(100);
    statusText.textContent = 'Conversion complete';
    progressDetail.textContent = `${frameCount.toLocaleString()} frames · ${formatBytes(blob.size)} · RGB24 raw pixel data.`;
  } catch (error) {
    console.error('Video conversion failed:', error);
    showStatus('Conversion failed.', error instanceof Error ? error.message : 'The browser could not process this video.');
  } finally {
    converting = false;
    cancelRequested = false;
    convertButton.disabled = !currentFile;
    cancelButton.hidden = true;
    cancelButton.disabled = false;
  }
}

function seekTo(timestamp) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Timed out while seeking through the video.')), 15000);
    const finish = (error) => {
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onSeeked = () => finish();
    const onError = () => finish(new Error('The browser could not decode a video frame.'));
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = timestamp;
  });
}

function setProgress(percent) {
  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressTrack.setAttribute('aria-valuenow', String(percent));
}

function showStatus(title, detail) {
  statusText.textContent = title;
  progressDetail.textContent = detail;
}

function formatTime(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = String(wholeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
