import { removeBackground } from '@imgly/background-removal-node';
import fs from 'fs';

async function processImage(inputPath, outputPath) {
    console.log(`Processing ${inputPath}...`);
    try {
        const blob = await removeBackground(inputPath);
        const buffer = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved to ${outputPath}`);
    } catch (e) {
        console.error(`Error processing ${inputPath}:`, e);
    }
}

async function main() {
    const cars = ['montero', 'triton', 'xforce', 'xpander'];
    for (const car of cars) {
        await processImage(`./src/assets/homepage/${car}-real.jpg`, `./src/assets/homepage/${car}-trimmed.png`);
    }
}
main();
