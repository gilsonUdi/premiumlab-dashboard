import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not infer a parent workspace from unrelated package-lock files.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
}

export default nextConfig
