export class CatApiError extends Error {
  constructor(
    readonly code: 'generic' | 'load' | 'conflict' | 'invalid' | 'photo' | 'access',
    readonly status = 0,
  ) {
    super(code);
  }
}
export async function catRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch('/api/cats' + path, {
      ...init,
      cache: 'no-store',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new CatApiError(
        response.status === 409
          ? 'conflict'
          : response.status === 400 || response.status === 413
            ? 'invalid'
            : response.status === 401 || response.status === 403
              ? 'access'
              : 'generic',
        response.status,
      );
    return response.status === 204 ? (undefined as T) : await response.json();
  } catch (error) {
    if (
      error instanceof CatApiError ||
      (error instanceof DOMException && error.name === 'AbortError')
    )
      throw error;
    throw new CatApiError('generic');
  }
}
export function catError(error: unknown) {
  return error instanceof CatApiError ? error.code : 'generic';
}

export async function prepareCatPhoto(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new CatApiError('photo');
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    if (!picture.naturalWidth || picture.naturalWidth * picture.naturalHeight > 16_000_000)
      throw new Error();
    const factor = Math.min(1, 1024 / Math.max(picture.naturalWidth, picture.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * factor));
    const context = canvas.getContext('2d');
    if (!context) throw new Error();
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/webp', 0.8);
    if (result.length > 750_000) throw new Error();
    return result;
  } catch {
    throw new CatApiError('photo');
  } finally {
    URL.revokeObjectURL(url);
  }
}
