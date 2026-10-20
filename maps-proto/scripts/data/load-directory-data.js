export async function loadDirectoryData(source) {
  if (!source) throw new Error("Directory source is not configured");

  const dataUrl = new URL(source, document.baseURI);
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Directory data request failed (${response.status})`);
  }

  return { data: await response.json(), dataUrl };
}
