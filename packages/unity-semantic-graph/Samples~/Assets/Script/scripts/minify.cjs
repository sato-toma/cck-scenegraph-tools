const fs = require("node:fs");
const path = require("node:path");
const { transform } = require("esbuild");

const outputDirectory = path.resolve(__dirname, "..", "dist");

async function minifyJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await minifyJavaScript(filePath);
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== ".js") {
      continue;
    }

    const source = fs.readFileSync(filePath, "utf8");
    const result = await transform(source, {
      loader: "js",
      minify: true,
      target: "es2023",
    });
    fs.writeFileSync(filePath, result.code);
  }
}

minifyJavaScript(outputDirectory).catch((error) => {
  console.error("Failed to minify compiled JavaScript:", error);
  process.exitCode = 1;
});
