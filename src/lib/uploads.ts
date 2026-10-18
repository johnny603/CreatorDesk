// Local filesystem storage, keyed by sha256 of contents. Returning the hash as
// the filename means duplicate uploads are free and file_path is stable.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const uploadsDir = path.join(process.cwd(), "data", "uploads");

export function save(bytes: Buffer, originalName: string): string {
  fs.mkdirSync(uploadsDir, { recursive: true });
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ext = path.extname(originalName || "").toLowerCase() || ".bin";
  const filename = `${hash}${ext}`;
  const full = path.join(uploadsDir, filename);
  if (!fs.existsSync(full)) fs.writeFileSync(full, bytes);
  return filename; // relative path stored on revisions.file_path
}

export function read(relPath: string): Buffer {
  return fs.readFileSync(path.join(uploadsDir, relPath));
}
