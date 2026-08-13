import path from 'path';
import fs from 'fs/promises';

export function privateUploadsRoot(): string {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads'));
}

export function resolveStoredCVPath(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  if (fileUrl.startsWith('private:')) {
    const fileName = fileUrl.slice('private:'.length);
    if (!fileName || path.basename(fileName) !== fileName) return null;
    const root = privateUploadsRoot();
    const resolved = path.resolve(root, fileName);
    return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
  }

  // Read-only compatibility for CVs uploaded before private storage was introduced.
  if (fileUrl.startsWith('/uploads/')) {
    const legacyRoot = path.resolve(process.cwd(), 'public', 'uploads');
    const resolved = path.resolve(process.cwd(), 'public', fileUrl.replace(/^\/+/, ''));
    return resolved.startsWith(`${legacyRoot}${path.sep}`) ? resolved : null;
  }
  return null;
}

export async function removeStoredCV(fileUrl: string | null | undefined) {
  const filePath = resolveStoredCVPath(fileUrl);
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => {});
}
