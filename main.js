import fs from "fs";
import path from "path";
import { fontSplit } from "cn-font-split";

// Ref: https://github.com/IKKI2000/harmonyos-fonts/blob/main/css/harmonyos_sans_sc.css
// https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-weight#common_weight_name_mapping
var fontWeightMap = {
    Thin: 100,
    Light: 300,
    Regular: 400,
    Medium: 500,
    Semibold: 600,
    Bold: 700,
    Black: 900,
    Heavy: 900, // For Arabic fonts
};

// Extract weight from filename based on different naming patterns
function extractWeight(filename) {
    // Remove .ttf extension
    const nameWithoutExt = filename.replace(".ttf", "");

    // Try to match weight at the end of the filename
    for (const weight in fontWeightMap) {
        if (
            nameWithoutExt.endsWith(`_${weight}`) ||
            nameWithoutExt.endsWith(weight)
        ) {
            return weight;
        }
    }

    return null;
}

async function split(input, outDir, weight, fontFamily) {
    const inputBuffer = new Uint8Array(fs.readFileSync(input).buffer);

    console.log(`Splitting ${input}...`);

    var weight_num = fontWeightMap[weight];
    if (!weight_num) {
        console.error(`Unknown weight: ${weight}`);
        return;
    }

    var isItalic = false;
    var fontStyle = "normal";
    if (fontFamily.includes("Italic")) {
        isItalic = true;
        fontStyle = "italic";
    }

    console.time("split");
    await fontSplit({
        input: inputBuffer, // 输入的字体缓冲区
        outDir: outDir, // 输出目录
        css: {
            // CSS 输出产物配置，一般而言不需要手动配置
            fontFamily: fontFamily, // 输出 css 产物的 font-family 名称
            fontWeight: `${weight_num}`, // 字重: 400 (常规)、700(粗体), 详细可见 https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight
            fontStyle: fontStyle, // 字体样式: normal (常规)、italic (斜体)。可见 https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-style
            fontDisplay: "swap", // 字体显示策略，推荐 swap。可见 https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display
            localFamily: [`${fontFamily} ${weight}`, `${fontFamily}`], // 本地字体族名称。可见 https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face
            // commentUnicodes: false, // 在 CSS 中添加 Unicode 码点注释
            compress: true, // 压缩生成的 CSS 产物
        },

        languageAreas: true, // 是否启用语言区域优化，将同一语言的字符分到一起
        autoSubset: true, // 当分包超过指定大小时是否自动拆分
        fontFeature: true, // 是否保留字体特性（如 Code 字体的连字、字距调整等）
        reduceMins: true, // 是否减少碎片分包，合并小分包以减少请求数，一般不需要修改

        // chunkSize: 70 * 1024, // 单个分片目标大小
        // chunkSizeTolerance: 1 * 1024, // 分片容差，一般不需要修改
        // maxAllowSubsetsCount: 60, // 最大允许分包数量，可能会和 chunkSize 冲突

        // testHtml: true, // 是否生成测试 HTML 文件
        // reporter: true, // 是否生成 reporter.bin 文件

        // 自定义分包输出的文件名为 6 位短哈希，或者使用自增索引: '[index].[ext]'
        renameOutputFont: `${weight}_[hash:6][ext]`,
    });
    console.timeEnd("split");
}

// If dist already exists, delete it
if (fs.existsSync("./dist")) {
    console.info("dist/ already exists, delete it first.");
    fs.rmSync("./dist", { recursive: true });
}

// To get this directory, download https://developer.huawei.com/images/download/next/HarmonyOS-Sans-v2.zip
// And rename subfolders to HarmonyOS_Sans_Naskh_Arabic HarmonyOS_Sans_Naskh_Arabic_UI
// HarmonyOS_Sans HarmonyOS_Sans_SC HarmonyOS_Sans_TC etc. and place them in HarmonyOS_Sans folder
const harmonyOsSansDir = "./HarmonyOS_Sans";

// Check if HarmonyOS_Sans directory exists
if (!fs.existsSync(harmonyOsSansDir)) {
    console.error(
        `${harmonyOsSansDir}/ directory does not exist. Please ensure font files are in place.`
    );
    process.exit(1);
}

// Process every font subfolder in HarmonyOS_Sans folder
const fontSubfolders = fs.readdirSync(harmonyOsSansDir).filter((item) => {
    const itemPath = path.join(harmonyOsSansDir, item);
    return fs.statSync(itemPath).isDirectory();
});

console.log(`Found ${fontSubfolders.length} font subfolders:`, fontSubfolders);

for (const subfolder of fontSubfolders) {
    const subfolderPath = path.join(harmonyOsSansDir, subfolder);
    const files = fs.readdirSync(subfolderPath);

    // Determine font family name (cleanup the subfolder name)
    const fontFamily = subfolder.replace(/_/g, " ");

    console.log(`\nProcessing ${subfolder}...`);

    // Process each .ttf file in the subfolder
    for (const file of files) {
        if (!file.endsWith(".ttf")) {
            continue;
        }

        const weight = extractWeight(file);
        if (!weight) {
            console.warn(`Could not extract weight from ${file}, skipping...`);
            continue;
        }

        const inputPath = path.join(subfolderPath, file);
        const outputDir = `./dist/${subfolder}/${weight}`;

        await split(inputPath, outputDir, weight, fontFamily);

        // Copy result.css to weight.css
        const resultCssPath = path.join(outputDir, "result.css");
        const weightCssPath = path.join(outputDir, `${weight}.css`);
        fs.copyFileSync(resultCssPath, weightCssPath);

        // Copy weight.css to upper folder
        const upperFolder = path.dirname(outputDir);
        const upperFolderCssPath = path.join(upperFolder, `${weight}.css`);
        // Replace "./" path with "./weight/" path
        const upperFolderCssContent = fs
            .readFileSync(resultCssPath, "utf-8")
            .replace(/\.\//g, `./${weight}/`);
        fs.writeFileSync(upperFolderCssPath, upperFolderCssContent);
    }
}

// For every subfolder in dist folder, merge css files in subfolder root into a single css file
console.log("\nMerging every font's weights to a single file...");
const distSubfolders = fs.readdirSync("./dist").filter((item) => {
    const itemPath = path.join("./dist", item);
    return fs.statSync(itemPath).isDirectory();
});

for (const subfolder of distSubfolders) {
    const subfolderPath = path.join("./dist", subfolder);
    const files = fs.readdirSync(subfolderPath);

    const mergedCssPath = path.join(subfolderPath, "Merged.css");
    const mergedCssContent = files
        .filter((file) => file.endsWith(".css"))
        .map((file) => fs.readFileSync(path.join(subfolderPath, file), "utf-8"))
        .join("\n");
    fs.writeFileSync(mergedCssPath, mergedCssContent);
    // Copy Merged.css to index.css
    const indexCssPath = path.join(subfolderPath, "index.css");
    fs.copyFileSync(mergedCssPath, indexCssPath);
}

console.log("\nDone!");
