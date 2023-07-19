const fg = require("fast-glob");
const path = require("path");
const paths = path.join(process.cwd()).replace(/\\/g, "/");

const loadChildFiles = async (dirName) => {
  const files = fg.sync(`${paths}/src/${dirName}/**/*.js`, { dot: false });
  const childFiles = [];
  files.forEach((file) => {
    const folderName = path.basename(path.dirname(file));
    const fileName = path.basename(file, '.js');
    if (!(folderName.toLowerCase() === fileName.toLowerCase()) && /^[A-Z]/.test(folderName)) {
      childFiles.push(file);
      delete require.cache[require.resolve(file)]
    }
  });
  return childFiles;
};

const loadInitFile = async (dirName) => {
  const files = fg.sync(`${paths}/src/${dirName}/**/*.js`, { dot: false });
  const initFiles = [];
  files.forEach((file) => {
    const folderName = path.basename(path.dirname(file));
    const fileName = path.basename(file, '.js');
    if (folderName.toLowerCase() === fileName.toLowerCase() && /^[A-Z]/.test(folderName)) {
      initFiles.push(file);
      delete require.cache[require.resolve(file)]
    }
  });
  return initFiles;
};

const loadFiles = async (dirName) => {
  const files = fg.sync(`${paths}/src/${dirName}/**/*.js`, { dot: false });
  files.forEach((file) => delete require.cache[require.resolve(file)]);
  return files;
};

module.exports = { loadInitFile, loadChildFiles, loadFiles };
