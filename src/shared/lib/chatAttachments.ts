export const MAX_CHAT_IMAGES = 4;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 512 * 1024;

export interface ChatImageAttachment {
  mimeType: string;
  dataBase64: string;
  previewUrl: string;
}

export interface IngestChatFilesResult {
  images: ChatImageAttachment[];
  draftAppend: string;
  error: string | null;
}

const TEXT_FILE_RE = /\.(txt|md|markdown|json|csv|xml|yaml|yml|log|ts|tsx|js|jsx|py|rs|html|css|toml|ini|env)$/i;

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type === 'application/json' || file.type === 'application/xml') return true;
  return TEXT_FILE_RE.test(file.name);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('read failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** Collect files from a DataTransfer (drop or paste). */
export function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  if (dt.files?.length) {
    out.push(...Array.from(dt.files));
  }
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && !out.some((f) => f.name === file.name && f.size === file.size)) {
      out.push(file);
    }
  }
  return out;
}

/** Collect attachable files from ClipboardEvent (Ctrl+V). */
export function filesFromClipboardEvent(e: ClipboardEvent): File[] {
  const dt = e.clipboardData;
  if (!dt) return [];
  return filesFromDataTransfer(dt);
}

export function clipboardHasAttachableFiles(e: ClipboardEvent): boolean {
  const dt = e.clipboardData;
  if (!dt) return false;
  if (dt.files.length > 0) return true;
  return Array.from(dt.items).some((item) => item.kind === 'file');
}

/**
 * Turn dropped/picked/pasted files into pending images and/or draft text.
 * Images are vision attachments; text files are inlined into the message body.
 */
export function ingestRustDroppedFiles(
  dropped: Array<{
    name: string;
    mimeType: string;
    dataBase64?: string | null;
    text?: string | null;
  }>,
  existingImageCount: number
): IngestChatFilesResult {
  const images: ChatImageAttachment[] = [];
  const draftParts: string[] = [];
  const errors: string[] = [];
  let imageSlots = existingImageCount;

  for (const file of dropped) {
    if (file.dataBase64) {
      if (imageSlots >= MAX_CHAT_IMAGES) {
        errors.push(`At most ${MAX_CHAT_IMAGES} images`);
        continue;
      }
      const mime = file.mimeType || 'image/png';
      images.push({
        mimeType: mime,
        dataBase64: file.dataBase64,
        previewUrl: `data:${mime};base64,${file.dataBase64}`,
      });
      imageSlots += 1;
      continue;
    }
    if (file.text != null) {
      draftParts.push(`--- ${file.name} ---\n${file.text.trim()}`);
      continue;
    }
    errors.push(`Could not read: ${file.name}`);
  }

  return {
    images,
    draftAppend: draftParts.join('\n\n'),
    error: errors.length ? errors[0] : null,
  };
}

export async function ingestChatFiles(
  files: File[],
  existingImageCount: number
): Promise<IngestChatFilesResult> {
  const images: ChatImageAttachment[] = [];
  const draftParts: string[] = [];
  const errors: string[] = [];
  let imageSlots = existingImageCount;

  for (const file of files) {
    if (isImageFile(file)) {
      if (imageSlots >= MAX_CHAT_IMAGES) {
        errors.push(`At most ${MAX_CHAT_IMAGES} images`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push('Each image must be under 4 MB');
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const comma = dataUrl.indexOf(',');
        if (comma < 0) continue;
        images.push({
          mimeType: file.type || 'image/png',
          dataBase64: dataUrl.slice(comma + 1),
          previewUrl: dataUrl,
        });
        imageSlots += 1;
      } catch {
        errors.push(`Could not read image: ${file.name}`);
      }
      continue;
    }

    if (isTextFile(file)) {
      if (file.size > MAX_TEXT_FILE_BYTES) {
        errors.push(`${file.name}: text files must be under 512 KB`);
        continue;
      }
      try {
        const text = await file.text();
        draftParts.push(`--- ${file.name} ---\n${text.trim()}`);
      } catch {
        errors.push(`Could not read file: ${file.name}`);
      }
      continue;
    }

    errors.push(`Unsupported file: ${file.name} (images or text files only)`);
  }

  return {
    images,
    draftAppend: draftParts.join('\n\n'),
    error: errors.length ? errors[0] : null,
  };
}
