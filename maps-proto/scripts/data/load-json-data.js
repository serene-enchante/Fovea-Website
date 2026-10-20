export async function loadJsonData(source) {
  if (!source) throw new Error("JSON data source is not configured");

  const dataUrl = new URL(source, document.baseURI);
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`JSON data request failed (${response.status})`);
  }

  return { data: await response.json(), dataUrl };
}
