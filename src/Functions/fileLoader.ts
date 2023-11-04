import fg from 'fast-glob';
import path from 'path';

const paths = path.join(process.cwd()).replace(/\\/g, '/');

const loadChildFiles = async (dirName: string): Promise<string[]> => {
  const files: string[] = fg.sync(`${paths}/src/${dirName}/**/*.{js,ts}`, { dot: false });
  const childFiles: string[] = [];
  files.forEach((file) => {
    const folderName = path.basename(path.dirname(file));
    const fileName = path.basename(file, path.extname(file));
    if (!(folderName.toLowerCase() === fileName.toLowerCase()) && /^[A-Z]/.test(folderName)) {
      childFiles.push(file);
      delete require.cache[require.resolve(file)];
    }
  });
  return childFiles;
};

const loadInitFile = async (dirName: string): Promise<string[]> => {
  const files: string[] = fg.sync(`${paths}/src/${dirName}/**/*.{js,ts}`, { dot: false });
  const initFiles: string[] = [];
  files.forEach((file) => {
    const folderName = path.basename(path.dirname(file));
    const fileName = path.basename(file, path.extname(file));
    if (folderName.toLowerCase() === fileName.toLowerCase() && /^[A-Z]/.test(folderName)) {
      initFiles.push(file);
      delete require.cache[require.resolve(file)];
    }
  });
  return initFiles;
};

const loadFiles = async (dirName: string): Promise<string[]> => {
  const files: string[] = fg.sync(`${paths}/src/${dirName}/**/*.{js,ts}`, { dot: false });
  files.forEach((file) => delete require.cache[require.resolve(file)]);
  return files;
};

export { loadInitFile, loadChildFiles, loadFiles };
