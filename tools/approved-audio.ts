export interface AudioEntry {
  name: string;
  approved: boolean;
}

// Returns every .ogg/.mp3 file name whose base name is not an approved entry.
export function filesToRemove(entries: AudioEntry[], fileNames: string[]): string[] {
  const approved = new Set(entries.filter((e) => e.approved).map((e) => e.name));
  return fileNames.filter((file) => {
    const match = /^(.*)\.(ogg|mp3)$/i.exec(file);
    return match !== null && !approved.has(match[1]);
  });
}
