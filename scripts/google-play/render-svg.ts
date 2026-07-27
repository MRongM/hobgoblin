import sharp from 'sharp'

const [input, output, widthText, heightText] = process.argv.slice(2)
const width = Number(widthText)
const height = Number(heightText)

if (!input || !output || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
  console.error('Usage: bun render-svg.ts <input.svg> <output.png> <width> <height>')
  process.exit(1)
}

await sharp(input)
  .resize({ width, height, fit: 'fill' })
  .png()
  .toFile(output)
