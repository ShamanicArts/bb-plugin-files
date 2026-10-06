async function imagePng(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Image request failed (${response.status}).`);
  const blob = await response.blob();
  if (blob.type.toLowerCase() === "image/png") return blob;
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = document.createElement("img");
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion unavailable.");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (png) =>
          png ? resolve(png) : reject(new Error("Image conversion failed.")),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function copyImage(url: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Image clipboard unavailable in this browser.");
  const png = imagePng(url);
  void png.catch(() => undefined);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
