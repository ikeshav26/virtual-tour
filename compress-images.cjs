const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const QUALITY = 60; // High quality

const traverseAndCompress = async (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      await traverseAndCompress(filePath);
    } else if (stat.isFile() && /\.(jpe?g|png|webp)$/i.test(file)) {
      const tempPath = filePath + ".temp";
      try {
        const metadata = await sharp(filePath).metadata();
        const ext = file.split(".").pop().toLowerCase();

        // Skip if image is too small to bother compressing
        if (metadata.size && metadata.size < 50000) continue;

        let sh = sharp(filePath);

        if (ext === "jpg" || ext === "jpeg") {
          sh = sh.jpeg({ quality: QUALITY, mozjpeg: true });
        } else if (ext === "png") {
          sh = sh.png({ quality: QUALITY, compressionLevel: 8 });
        } else if (ext === "webp") {
          sh = sh.webp({ quality: QUALITY });
        }

        await sh.toFile(tempPath);
        fs.renameSync(tempPath, filePath);
        console.log(`Compressed: ${filePath}`);
      } catch (err) {
        console.error(`Error compressing ${filePath}:`, err);
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }
  }
};

const dirsToCompress = [
  path.join(__dirname, "public/virtual-tour/assets/img"),
  path.join(__dirname, "public/virtual-tour/images"),
];

dirsToCompress.forEach((dir) => {
  if (fs.existsSync(dir)) {
    console.log(`Processing directory: ${dir}`);
    traverseAndCompress(dir);
  }
});
