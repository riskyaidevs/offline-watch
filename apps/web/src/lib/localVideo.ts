/**
 * Local-only video source. The file never leaves the device — there is no
 * upload endpoint on the server at all.
 */
export function createLocalVideoSource(file: File): { name: string; url: string } {
  return { name: file.name, url: URL.createObjectURL(file) };
}

export function revokeLocalVideoSource(url: string): void {
  URL.revokeObjectURL(url);
}
