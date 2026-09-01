import { SPATIAL_MIME_TYPES } from '../config/app-config.js';

export function createIosCompatibleFile(blob, fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  let mimeType = SPATIAL_MIME_TYPES[ext] || blob.type || 'application/octet-stream';
  let shareName = fileName;

  // iOS Safari canShare() requires iOS system-recognized MIME types & extensions
  // PDF, KML, JSON, and standard images usually work well, but GPX can fail silently.
  if (ext === 'gpx') {
    mimeType = 'application/xml';
  } else if (ext === 'geojson') {
    mimeType = 'application/json';
  }

  // Create an explicit File object which allows navigator.share() to read the file correctly
  // on iOS rather than returning an invalid argument error.
  return new File([blob], shareName, { type: mimeType });
}

export async function handleSpatialFileShare(event, fileOrBlob, fileName, triggerButton = null, showToastCallback = null) {
  if (event && event.preventDefault) event.preventDefault();

  let originalButtonText = "";
  let originalButtonHtml = "";

  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.classList.add("is-preparing");
    const span = triggerButton.querySelector("span");
    if (span) {
      originalButtonText = span.textContent;
      span.textContent = "Preparing...";
    } else {
      originalButtonHtml = triggerButton.innerHTML;
      triggerButton.textContent = "Preparing...";
    }
  }

  const resetBtnState = () => {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.classList.remove("is-preparing");
      const span = triggerButton.querySelector("span");
      if (span && originalButtonText) {
        span.textContent = originalButtonText;
      } else if (originalButtonHtml) {
        triggerButton.innerHTML = originalButtonHtml;
      }
    }
  };

  try {
    let blob;
    if (fileOrBlob instanceof Blob) {
      blob = fileOrBlob;
    } else if (typeof fileOrBlob === 'string') {
      const response = await fetch(fileOrBlob);
      if (!response.ok) throw new Error('File download failed');
      blob = await response.blob();
    } else {
      throw new Error('Invalid file format');
    }

    // If browser supports Web Share API (iOS Safari, Mobile Chrome, Mac Safari), trigger native OS Share Sheet
    if (navigator.share) {
      const file = createIosCompatibleFile(blob, fileName);

      // Check if browser can share file, or execute direct share for mobile OS
      const canShare = navigator.canShare ? navigator.canShare({ files: [file] }) : true;
      if (canShare) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: 'Open with your mapping app'
        });
        resetBtnState();
        return;
      } else {
        // Fallback share with plain text for strict WebKit environments
        const fallbackFile = new File([blob], fileName, { type: 'text/plain' });
        await navigator.share({
          files: [fallbackFile],
          title: fileName,
          text: 'Open with your mapping app'
        });
        resetBtnState();
        return;
      }
    } else if (location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      if (showToastCallback) {
        showToastCallback("Notice: Apple requires HTTPS for iOS Share Sheet (accessing via HTTP 10.0.0.194).", true);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
      resetBtnState();
      return;
    }
  } finally {
    resetBtnState();
  }

  // Fallback for Desktop / Unsupported Browsers
  if (fileOrBlob instanceof Blob) {
    const url = URL.createObjectURL(fileOrBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    a.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } else if (typeof fileOrBlob === 'string') {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = fileOrBlob;
    a.download = fileName;
    a.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
  }
}

export function saveBlob(blob, filename, triggerButton = null, showToastCallback = null) {
  return handleSpatialFileShare(null, blob, filename, triggerButton, showToastCallback);
}
